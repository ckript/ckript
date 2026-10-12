import mongoose from "mongoose";
import crypto from "crypto";
import Consultation from "../models/Consultation.js";
import User from "../models/User.js";
import Availability from "../models/Availability.js";
import { resolveCurrency, getUsdInrRate, isSupportedCurrency } from "../utils/currencyFx.js";
import { createOrderWithUsdFallback } from "../utils/razorpayOrder.js";
import { readVerifiedOrder } from "../utils/razorpayCapture.js";
import { recordGrant, recordPayment } from "../utils/ledger.js";
import { issueInvoice } from "../utils/invoiceIssue.js";
import { refundPayment } from "../utils/tax/refunds.js";
import {
  billingFromRequest,
  checkoutBreakdown,
  lineFor,
  pickPriced,
  priceCheckout,
  priceWithInrFallback,
  requestIp,
  resolveCapturedTax,
  saveQuote,
} from "../utils/tax/checkout.js";
import { getAccessTokenFromRefresh, createMeetingEvent, deleteMeetingEvent, ReconnectRequired } from "../utils/googleCalendar.js";
import { decryptToken } from "../utils/tokenCrypto.js";
// Assume these email methods exist or we will add them later
import { 
  sendMeetingInvitationEmail, sendMeetingAcceptedWriterEmail, sendMeetingAcceptedEmail, 
  sendMeetingRejectedEmail, sendConsultationRejectedEmail,
  sendConsultationBookedEmail, sendMeetingRescheduledWriterEmail, sendMeetingRescheduledProfessionalEmail,
  sendConsultationPaidWriterEmail
} from "../utils/emailService.js";

const getRazorpayInstance = async () => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
    const { default: Razorpay } = await import("razorpay");
    return new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  } catch (err) {
    console.error("Error initializing Razorpay:", err);
    return null;
  }
};

// Create the Google Calendar event (with a real Meet link) on the professional's calendar. Google emails
// both attendees the invite. Never falls back to a made-up link: returns { error: { status, body } } so
// the caller can tell the professional to connect/reconnect their calendar instead. `professional` must
// be loaded with "+googleCalendar.refreshTokenEnc".
const createConsultationMeeting = async ({ consultation, professional, start, end, replaceEventId }) => {
  if (!professional?.googleCalendar?.connected || !professional?.googleCalendar?.refreshTokenEnc) {
    return {
      error: {
        status: 428,
        body: { message: "Connect your Google Calendar to generate the Google Meet link.", needsCalendar: true },
      },
    };
  }

  try {
    const refreshToken = decryptToken(professional.googleCalendar.refreshTokenEnc);
    const { accessToken } = await getAccessTokenFromRefresh(refreshToken);
    const event = await createMeetingEvent({
      accessToken,
      summary: `Ckript Consultation: ${consultation.writer.name} & ${professional.name}`,
      description: `Topic: ${consultation.topic}\n\n${consultation.additionalMessage || ""}`,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      timeZone: consultation.timezone,
      attendees: [professional.email, consultation.writer.email],
    });
    if (!event.meetLink) throw new Error("Google did not return a Meet link for the event.");

    if (replaceEventId && replaceEventId !== event.eventId) {
      await deleteMeetingEvent({ accessToken, eventId: replaceEventId });
    }
    return { meetingLink: event.meetLink, googleEventId: event.eventId };
  } catch (err) {
    if (err instanceof ReconnectRequired) {
      // Stored token is dead - flip the flag so the UI re-prompts to connect.
      await User.updateOne({ _id: professional._id }, { $set: { "googleCalendar.connected": false } });
      return {
        error: {
          status: 428,
          body: { message: "Your Google Calendar connection expired. Please reconnect and try again.", needsCalendar: true },
        },
      };
    }
    console.error("Consultation Google Meet creation failed:", err?.message || err);
    return { error: { status: 502, body: { message: "Failed to create the Google Meet link. Please try again." } } };
  }
};

/**
 * Consultation prices, PRE-TAX, in minor units. Durations are an enum: the old code charged the 30-minute
 * price for ANY duration other than 60, so a request for 90 minutes paid ₹8,000.
 */
const CONSULTATION_TIERS = {
  30: { INR: 800000, USD: 900 },
  60: { INR: 1500000, USD: 1600 },
};
const PLATFORM_FEE_RATE = 0.10;
// Bounds for a professional's own price (minor units), so a typo cannot create a ₹0.01 or ₹1 crore booking.
const PRICE_BOUNDS = { INR: [10000, 50000000], USD: [100, 600000] };

const validAvailabilityPrice = (availability) => {
  const currency = String(availability?.currency || "INR").toUpperCase();
  const amount = Math.round(Number(availability?.consultationPrice));
  if (!isSupportedCurrency(currency) || !Number.isFinite(amount)) return null;
  const [min, max] = PRICE_BOUNDS[currency];
  return amount >= min && amount <= max ? { amount, currency } : null;
};

/**
 * The PRE-TAX price of a consultation, in minor units: the professional's own (validated) price, or the
 * platform tiers by duration. Shared by the quote and the order so the two can never disagree.
 */
const resolveConsultationPrice = async ({ professionalId, duration, requestedCurrency, writer }) => {
  const selectedCurrency = resolveCurrency(requestedCurrency, writer?.preferredCurrency);
  let durationMins = Number(duration) || 30;
  const availability = await Availability.findOne({ professional: professionalId });
  if (availability && availability.enabled) {
    const price = validAvailabilityPrice(availability);
    if (!price) return { status: 409, error: "This professional's consultation price is not set up correctly yet." };
    if (!duration) durationMins = Number(availability.duration) || 30;
    // The same INR fallback every other checkout has: a USD price converted at today's rate.
    const inrAmount = price.currency === "INR" ? price.amount : Math.round(price.amount * (await getUsdInrRate()));
    return { amount: price.amount, currency: price.currency, inrAmount, durationMins, availability };
  }
  if (duration) {
    const tier = CONSULTATION_TIERS[durationMins];
    if (!tier) return { status: 400, error: "Choose a 30- or 60-minute consultation." };
    const currency = tier[selectedCurrency] ? selectedCurrency : "INR";
    return { amount: tier[currency], currency, inrAmount: tier.INR, durationMins, availability: null };
  }
  return { status: 400, error: "Professional is not accepting consultations and no duration was provided." };
};

// POST /api/consultations/quote { professionalId, duration, currency } — for the checkout step:
// the consultation price, Taxes (18%), and the total the writer will be charged. No order is created.
export const getConsultationQuote = async (req, res) => {
  try {
    const { professionalId, duration } = req.body || {};
    if (typeof professionalId !== "string" || !mongoose.Types.ObjectId.isValid(professionalId)) {
      return res.status(400).json({ message: "Invalid professional ID." });
    }
    const [writer, professional] = await Promise.all([
      User.findById(req.user._id).select("name email role preferredCurrency address billingProfile"),
      User.findById(professionalId).select("name"),
    ]);
    if (!writer) return res.status(404).json({ message: "User not found" });
    if (!professional) return res.status(404).json({ message: "Professional not found." });
    const price = await resolveConsultationPrice({ professionalId, duration, requestedCurrency: req.body.currency, writer });
    if (price.error) return res.status(price.status).json({ message: price.error });
    const lines = [lineFor("consultation", price.amount, `Consultation with ${professional.name} (${price.durationMins} min)`)];
    const priced = await priceCheckout({ user: writer, lines, currency: price.currency, ip: requestIp(req) });
    return res.json({
      currency: price.currency,
      duration: price.durationMins,
      listedMinor: price.amount,
      paymentRequired: consultationPaymentsEnabled(),
      breakdown: checkoutBreakdown(priced, { currency: price.currency, lines }),
    });
  } catch (error) {
    console.error("Consultation quote error:", error);
    return res.status(500).json({ message: "Could not price this consultation." });
  }
};

/** What the platform owes the professional for a booking, in INR minor units (payouts are INR). */
const professionalPayoutInrMinor = async (consultation) => {
  const share = Number(consultation.professionalAmount || 0);
  if (String(consultation.currency).toUpperCase() === "INR") return share;
  const rate = Number(consultation.tax?.inr?.fxRate) || await getUsdInrRate();
  return Math.round(share * rate);
};

// Razorpay checkout for consultations is OFF unless CONSULTATION_PAYMENTS_ENABLED=true. While off,
// a booking is confirmed immediately (no charge) so the flow can be tested end to end.
const consultationPaymentsEnabled = () => String(process.env.CONSULTATION_PAYMENTS_ENABLED || "").toLowerCase() === "true";

// Booking-confirmed emails to the professional and the writer. Never throws: the booking is already
// saved by the time these go out, so an email failure must not fail the request.
const sendBookingConfirmedEmails = async (consultation, writer, professional, { charged = true } = {}) => {
  try {
    if (professional) {
      await sendConsultationBookedEmail(professional.email, {
        professionalName: professional.name,
        writerName: writer.name,
        topic: consultation.topic,
        date: consultation.scheduledStart.toLocaleDateString(),
        time: consultation.scheduledStart.toLocaleTimeString(),
        // The professional's figures: the price, the 10% platform fee, and their payout. Never the
        // writer's taxes — those are the platform's, and never reduce the professional's share.
        amount: (consultation.preTaxAmount || consultation.amount) / 100,
        platformFee: consultation.platformFee / 100,
        payout: consultation.professionalAmount / 100,
        currency: consultation.currency,
        additionalMessage: consultation.additionalMessage,
        fileLink: consultation.fileLink,
      });
    }

    await sendConsultationPaidWriterEmail(writer.email, {
      writerName: writer.name,
      producerName: professional ? professional.name : "Producer",
      charged,
      amount: consultation.amount / 100,
      taxes: (consultation.taxMinor || 0) / 100,
      currency: consultation.currency,
      additionalMessage: consultation.additionalMessage,
      fileLink: consultation.fileLink,
      date: consultation.scheduledStart.toLocaleDateString(),
      time: consultation.scheduledStart.toLocaleTimeString(),
    });
  } catch (emailErr) {
    console.error("Consultation booking email failed:", emailErr);
  }
};

export const createOrder = async (req, res) => {
  try {
    const writerId = req.user._id;
    const { professionalId, date, time, topic, additionalMessage, fileLink, duration } = req.body;

    const writer = await User.findById(writerId);
    if (!writer || (writer.role !== "writer" && writer.role !== "creator")) {
      return res.status(403).json({ message: "Only writers can book consultations." });
    }

    if (typeof professionalId !== "string" || !mongoose.Types.ObjectId.isValid(professionalId)) {
      return res.status(400).json({ message: "Invalid professional ID." });
    }

    const professional = await User.findById(professionalId);
    if (!professional) return res.status(404).json({ message: "Professional not found." });

    const paymentsEnabled = consultationPaymentsEnabled();
    const razorpay = paymentsEnabled ? await getRazorpayInstance() : null;
    if (paymentsEnabled && !razorpay) {
      return res.status(503).json({ message: "Razorpay is not configured. Keys are missing." });
    }

    // PRE-TAX price, in minor units, from the professional's own (validated) price or the platform tiers.
    const priceResult = await resolveConsultationPrice({ professionalId, duration, requestedCurrency: req.body.currency, writer });
    if (priceResult.error) return res.status(priceResult.status).json({ message: priceResult.error });
    const { amount, inrAmount, currency, durationMins, availability } = priceResult;

    const [hours, minutes] = (time || "00:00").split(':');
    const scheduledStart = new Date(date || Date.now());
    scheduledStart.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMins * 60000);

    if (!paymentsEnabled) {
      const platformFee = Math.round(amount * PLATFORM_FEE_RATE);
      const consultation = new Consultation({
        writer: writerId,
        professional: professionalId,
        professionalRole: professional.role,
        amount,
        preTaxAmount: amount,
        currency,
        platformFee,
        professionalAmount: amount - platformFee,
        duration: durationMins,
        scheduledStart,
        scheduledEnd,
        timezone: availability ? availability.timezone : "Asia/Kolkata",
        topic: topic || "Pitch Script",
        additionalMessage,
        fileLink,
        status: "awaiting_response",
        paidAt: new Date(),
      });
      await consultation.save();
      // Nothing was charged: a grant at list price, so it is visible without being counted as revenue.
      await recordGrant({
        kind: "consultation",
        user: writerId,
        listPriceMinor: amount,
        currency,
        subjectType: "Consultation",
        subjectId: consultation._id,
        label: `Consultation with ${professional.name}`,
        reason: "consultation payments switched off",
        source: "consultationController.createOrder",
      });
      await sendBookingConfirmedEmails(consultation, writer, professional, { charged: false });

      return res.status(200).json({
        message: "Consultation booked successfully",
        paymentRequired: false,
        consultationId: consultation._id,
      });
    }

    const billing = await billingFromRequest(req, writer);
    if (billing.error) return res.status(400).json({ message: billing.error, errors: billing.errors });
    const consultLabel = `Consultation with ${professional.name} (${durationMins} min)`;
    const consultLines = [lineFor("consultation", amount, consultLabel)];
    const inrConsultLines = [lineFor("consultation", inrAmount || amount, consultLabel)];
    // Taxes (18%) on the FULL consultation price, added on top (by decision).
    const priced = await priceWithInrFallback({
      user: writer,
      currency,
      lines: consultLines,
      inrLines: inrConsultLines,
      billingOverride: billing.override,
      ip: requestIp(req),
    });

    const { order, fellBackToINR } = await createOrderWithUsdFallback(razorpay, {
      amount: priced.requested.grossMinor,
      currency,
      inrAmount: currency === "INR" ? null : priced.inr.grossMinor,
      receipt: `cons_${writerId.toString().substring(18)}_${Date.now()}`,
      notes: {
        type: "consultation",
        writerId: writerId.toString(),
        professionalId: professionalId.toString(),
      },
    });
    if (!order) return res.status(500).json({ message: "Failed to create Razorpay order" });

    // The platform fee and the professional's share come from the PRE-TAX price in the currency actually
    // charged (a USD order may fall back to INR). Taxes are the platform's, never the professional's.
    const chosen = pickPriced(priced, order.currency);
    const preTaxAmount = chosen.preTaxMinor;
    const platformFee = Math.round(preTaxAmount * PLATFORM_FEE_RATE);
    const professionalAmount = preTaxAmount - platformFee;

    const consultation = new Consultation({
      writer: writerId,
      professional: professionalId,
      professionalRole: professional.role,
      amount: order.amount,
      preTaxAmount,
      taxMinor: chosen.tax?.totals?.taxMinor || 0,
      currency: order.currency,
      platformFee,
      professionalAmount,
      duration: durationMins,
      scheduledStart,
      scheduledEnd,
      timezone: availability ? availability.timezone : "Asia/Kolkata",
      topic: topic || "Pitch Script",
      additionalMessage,
      fileLink,
      status: "payment_pending",
      razorpayOrderId: order.id,
    });

    await consultation.save();
    await saveQuote({ order, user: writer, purpose: "consultation", subjectId: String(consultation._id), priced: chosen });

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      paymentRequired: true,
      fellBackToINR,
      consultationId: consultation._id,
      breakdown: checkoutBreakdown(chosen, {
        currency: order.currency,
        lines: String(order.currency).toUpperCase() === "INR" ? inrConsultLines : consultLines,
      }),
    });
  } catch (error) {
    console.error("Create Consultation Order Error:", error);
    return res.status(500).json({ message: error.message || error.description || "Failed to create order" });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const consultation = await Consultation.findById(id).populate("writer");
    if (!consultation) return res.status(404).json({ message: "Consultation not found." });

    if (!consultation.writer || consultation.writer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to verify this payment." });
    }

    // Already verified (e.g. a retried request) - don't re-send emails or create a second meeting.
    if (consultation.status !== "payment_pending" && consultation.status !== "payment_failed") {
      if (consultation.razorpayPaymentId && consultation.razorpayPaymentId === razorpay_payment_id) {
        return res.status(200).json({ message: "Payment already verified.", consultation });
      }
      return res.status(400).json({ message: "This consultation is not awaiting payment." });
    }

    if (!consultation.razorpayOrderId || razorpay_order_id !== consultation.razorpayOrderId) {
      return res.status(400).json({ message: "Payment verification failed: Order mismatch" });
    }

    const razorpay = await getRazorpayInstance();
    if (!razorpay) return res.status(503).json({ message: "Razorpay is not configured. Keys are missing." });
    // The order is ours, for this writer, and captured in full — a signature alone proved none of that.
    const verified = await readVerifiedOrder(razorpay, {
      orderId: consultation.razorpayOrderId,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      expectNotes: { type: "consultation", writerId: String(consultation.writer._id) },
      expectedAmountMinor: consultation.amount,
    });
    if (!verified.ok) {
      if (!verified.pending && verified.status === 400) {
        consultation.status = "payment_failed";
        await consultation.save();
      }
      return res.status(verified.status || 400).json({ message: verified.message, paymentPending: Boolean(verified.pending) });
    }

    const charge = verified.charge;
    const tax = await resolveCapturedTax({
      orderId: consultation.razorpayOrderId,
      paymentId: razorpay_payment_id,
      paidMinor: charge.amountMinor,
      currency: charge.currency,
      paidAt: charge.paidAt,
      user: consultation.writer,
      lines: [lineFor("consultation", consultation.preTaxAmount || consultation.amount, "Consultation")],
    });

    consultation.status = "awaiting_response";
    consultation.razorpayPaymentId = String(razorpay_payment_id);
    consultation.paidAt = charge.paidAt || new Date();
    if (tax) {
      consultation.tax = tax;
      consultation.taxMinor = tax.totals.taxMinor;
    }
    // The Google Meet link is created when the professional accepts (acceptConsultation), not here.
    await consultation.save();

    // Consultations were entirely outside the books: no ledger entry, no invoice. Both now, non-fatal.
    await recordPayment({
      kind: "consultation",
      user: consultation.writer._id,
      amountMinor: charge.amountMinor,
      currency: charge.currency,
      listPriceMinor: consultation.preTaxAmount || consultation.amount,
      providerOrderId: consultation.razorpayOrderId,
      providerPaymentId: String(razorpay_payment_id),
      subjectType: "Consultation",
      subjectId: consultation._id,
      label: `Consultation ${consultation.bookingId || ""}`.trim(),
      source: "consultationController.verifyPayment",
      tax,
      creatorPayoutMinor: await professionalPayoutInrMinor(consultation),
      gatewayFeeMinor: charge.fee,
      gatewayTaxMinor: charge.feeTax,
      metadata: { professionalId: String(consultation.professional), platformFeeMinor: consultation.platformFee },
    });
    const invoice = await issueInvoice({
      kind: "consultation",
      user: consultation.writer,
      paymentReference: `RZP-CNS-${razorpay_payment_id}`,
      providerPaymentId: String(razorpay_payment_id),
      tax,
      supplyDate: consultation.paidAt,
      currency: charge.currency,
      amountCharged: charge.chargedTotal,
      consultation: consultation._id,
      detailLines: [
        consultation.topic || "Consultation",
        `Booking ${consultation.bookingId || "-"}`,
        `${consultation.duration} minutes`,
        `Payment Ref: ${razorpay_payment_id}`,
      ],
      rows: tax ? [] : [
        { item: "Consultation", type: "Service", detail: `${consultation.duration} minutes`, amountLabel: `${charge.currency} ${charge.chargedTotal.toFixed(2)}`, amountValue: charge.chargedTotal },
        { item: "Total Paid", type: "Total", detail: "Total charged via payment gateway.", amountLabel: `${charge.currency} ${charge.chargedTotal.toFixed(2)}`, amountValue: charge.chargedTotal },
      ],
      source: "consultationController.verifyPayment",
    });
    if (invoice?._id && String(consultation.invoice || "") !== String(invoice._id)) {
      consultation.invoice = invoice._id;
      await consultation.save();
    }

    const professional = await User.findById(consultation.professional);
    await sendBookingConfirmedEmails(consultation, consultation.writer, professional);

    return res.status(200).json({ message: "Payment verified successfully.", consultation });
  } catch (error) {
    console.error("Verify Payment Error:", error);
    return res.status(500).json({ message: "Payment verification failed." });
  }
};

export const getWriterConsultations = async (req, res) => {
  try {
    const consultations = await Consultation.find({ writer: req.user._id, status: { $nin: ["payment_pending", "payment_failed"] } })
      .populate("professional", "name email profileImage role")
      .sort({ createdAt: -1 });
    return res.status(200).json(consultations);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch consultations." });
  }
};

export const getProfessionalConsultations = async (req, res) => {
  try {
    const consultations = await Consultation.find({ professional: req.user._id, status: { $nin: ["payment_pending", "payment_failed"] } })
      .populate("writer", "name email profileImage role")
      .sort({ createdAt: -1 });
    return res.status(200).json(consultations);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch consultations." });
  }
};

export const getConsultationDetails = async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate("writer", "name email profileImage")
      .populate("professional", "name email profileImage role");
    if (!consultation) return res.status(404).json({ message: "Consultation not found." });

    if (String(consultation.writer._id) !== String(req.user._id) && 
        String(consultation.professional._id) !== String(req.user._id) &&
        req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    return res.status(200).json(consultation);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch consultation details." });
  }
};

export const acceptConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const consultation = await Consultation.findById(id).populate("writer professional");
    
    if (!consultation) return res.status(404).json({ message: "Consultation not found." });
    if (String(consultation.professional._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized." });
    }
    if (consultation.status !== "awaiting_response") {
      return res.status(400).json({ message: "Consultation is not awaiting response." });
    }

    const professional = await User.findById(req.user._id).select("+googleCalendar.refreshTokenEnc").lean();

    const meeting = await createConsultationMeeting({
      consultation,
      professional,
      start: consultation.scheduledStart,
      end: consultation.scheduledEnd,
    });
    if (meeting.error) return res.status(meeting.error.status).json(meeting.error.body);
    const { meetingLink, googleEventId } = meeting;

    consultation.googleMeetUrl = meetingLink;
    consultation.googleEventId = googleEventId;
    consultation.status = "accepted";
    consultation.acceptedAt = new Date();
      consultation.isRescheduled = true;
    await consultation.save();

    // Send acceptance emails to both Writer and Producer
    try {
      await sendMeetingAcceptedWriterEmail(consultation.writer.email, {
        writerName: consultation.writer.name,
        producerName: professional.name,
        scriptName: consultation.topic,
        date: consultation.scheduledStart.toLocaleDateString(),
        time: consultation.scheduledStart.toLocaleTimeString(),
        meetingLink: meetingLink
      });

      await sendMeetingAcceptedEmail(professional.email, {
        writerName: consultation.writer.name,
        scriptName: consultation.topic,
        date: consultation.scheduledStart.toLocaleDateString(),
        time: consultation.scheduledStart.toLocaleTimeString(),
        meetingLink: meetingLink,
        clientBaseUrl: process.env.CLIENT_URL
      });
    } catch (e) {
      console.error("Failed to send acceptance emails", e);
    }

    return res.status(200).json({ message: "Consultation accepted.", consultation });
  } catch (error) {
    console.error("Accept Error:", error);
    return res.status(500).json({ message: "Failed to accept consultation." });
  }
};

export const rejectConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const consultation = await Consultation.findById(id).populate("writer professional");
    
    if (!consultation) return res.status(404).json({ message: "Consultation not found." });
    if (String(consultation.professional._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized." });
    }
    // Only an open booking can be rejected - this also stops a second reject from re-running the refund.
    if (!["awaiting_response", "accepted", "meeting_scheduled"].includes(consultation.status)) {
      return res.status(400).json({ message: "This consultation can no longer be rejected." });
    }

    consultation.status = "rejected";
    consultation.rejectionReason = reason;
    consultation.rejectedAt = new Date();
    
    // Refund through the shared path: Razorpay refund + credit note + ledger reversal, taxes included.
    if (consultation.razorpayPaymentId) {
      const razorpay = await getRazorpayInstance();
      if (razorpay) {
        const refunded = await refundPayment({
          razorpay,
          paymentId: consultation.razorpayPaymentId,
          amountMinor: consultation.amount,
          reason: "Professional rejected the consultation",
          notes: { consultationId: consultation._id.toString() },
          source: "consultationController.rejectConsultation",
        });
        if (refunded.ok) {
          consultation.razorpayRefundId = refunded.refund.id;
          consultation.refundAmount = refunded.amountMinor;
          consultation.creditNote = refunded.creditNote?._id || undefined;
          consultation.status = "refunded";
          consultation.refundCompletedAt = new Date();
        } else {
          console.error("Refund failed:", refunded.message);
          consultation.status = "refund_failed";
          consultation.refundReason = refunded.message || "Razorpay API error";
        }
      }
    }

    await consultation.save();

    try {
        await sendConsultationRejectedEmail(consultation.writer.email, {
          writerName: consultation.writer.name,
          producerName: consultation.professional.name,
          amount: consultation.amount / 100,
          currency: consultation.currency
        });
      } catch (e) {
        console.error("Failed to send rejection email", e);
      }

    return res.status(200).json({ message: "Consultation rejected.", consultation });
  } catch (error) {
    console.error("Reject Error:", error);
    return res.status(500).json({ message: "Failed to reject consultation." });
  }
};

export const completeConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const consultation = await Consultation.findById(id);
    
    if (!consultation) return res.status(404).json({ message: "Consultation not found." });
    if (String(consultation.professional) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    if (consultation.status !== "accepted" && consultation.status !== "meeting_scheduled" && consultation.status !== "meeting_in_progress") {
      return res.status(400).json({ message: "Consultation is not in a completable state." });
    }

    consultation.status = "payout_pending";
    consultation.completedAt = new Date();
    await consultation.save();

    return res.status(200).json({ message: "Consultation marked as completed.", consultation });
  } catch (error) {
    return res.status(500).json({ message: "Failed to complete consultation." });
  }
};

export const cancelConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const consultation = await Consultation.findById(id);
    
    if (!consultation) return res.status(404).json({ message: "Consultation not found." });
    if (String(consultation.writer) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized." });
    }

    // Only allow cancel before accepted
    if (consultation.status === "awaiting_response") {
      consultation.status = "cancelled";
      
      // Refund through the shared path: Razorpay refund + credit note + ledger reversal, taxes included.
      if (consultation.razorpayPaymentId) {
        const razorpay = await getRazorpayInstance();
        if (razorpay) {
          const refunded = await refundPayment({
            razorpay,
            paymentId: consultation.razorpayPaymentId,
            amountMinor: consultation.amount,
            reason: "Writer cancelled the consultation",
            notes: { consultationId: consultation._id.toString() },
            source: "consultationController.cancelConsultation",
          });
          if (refunded.ok) {
            consultation.razorpayRefundId = refunded.refund.id;
            consultation.refundAmount = refunded.amountMinor;
            consultation.creditNote = refunded.creditNote?._id || undefined;
            consultation.status = "refunded";
            consultation.refundCompletedAt = new Date();
          } else {
            consultation.status = "refund_failed";
            consultation.refundReason = refunded.message || "Razorpay API error";
          }
        }
      }
      
      await consultation.save();
      return res.status(200).json({ message: "Consultation cancelled.", consultation });
    }

    return res.status(400).json({ message: "Cannot cancel this consultation." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to cancel consultation." });
  }
};

// --- ADMIN ENDPOINTS ---

export const adminListConsultations = async (req, res) => {
  try {
    const consultations = await Consultation.find()
      .populate("writer", "name email")
      .populate("professional", "name email role")
      .sort({ createdAt: -1 });
    return res.status(200).json(consultations);
  } catch (error) {
    return res.status(500).json({ message: "Failed to list consultations." });
  }
};

export const adminGetConsultationDetails = async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate("writer", "name email")
      .populate("professional", "name email role");
    if (!consultation) return res.status(404).json({ message: "Not found." });
    return res.status(200).json(consultation);
  } catch (error) {
    return res.status(500).json({ message: "Failed to get consultation details." });
  }
};

export const adminGetPendingPayouts = async (req, res) => {
  try {
    const payouts = await Consultation.find({ status: "payout_pending" })
      .populate("writer", "name email")
      .populate("professional", "name email role bankDetails stripeAccountId")
      .sort({ completedAt: 1 });
    return res.status(200).json(payouts);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch payouts." });
  }
};

export const adminProcessPayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { providerReference } = req.body;
    
    const consultation = await Consultation.findById(id);
    if (!consultation) return res.status(404).json({ message: "Not found." });
    
    if (consultation.status !== "payout_pending" && consultation.status !== "payout_failed") {
      return res.status(400).json({ message: "Consultation not in a valid state for payout." });
    }
    
    consultation.status = "payout_completed";
    consultation.payoutProviderReference = providerReference || `manual_${Date.now()}`;
    consultation.payoutCompletedAt = new Date();
    await consultation.save();
    
    return res.status(200).json({ message: "Payout recorded successfully.", consultation });
  } catch (error) {
    return res.status(500).json({ message: "Failed to process payout." });
  }
};

export const adminGetRefunds = async (req, res) => {
  try {
    const refunds = await Consultation.find({ status: { $in: ["refunded", "refund_pending", "refund_failed"] } })
      .populate("writer", "name email")
      .populate("professional", "name email")
      .sort({ updatedAt: -1 });
    return res.status(200).json(refunds);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch refunds." });
  }
};


export const rescheduleConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const { newStartISO } = req.body;
    
    if (!newStartISO) return res.status(400).json({ message: "New start time is required." });

    const consultation = await Consultation.findById(id).populate("writer professional");
    if (!consultation) return res.status(404).json({ message: "Consultation not found." });
    
    if (String(consultation.professional._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const professional = await User.findById(req.user._id).select("+googleCalendar.refreshTokenEnc").lean();

    const newStart = new Date(newStartISO);
    if (Number.isNaN(newStart.getTime())) return res.status(400).json({ message: "Invalid start time." });
    const newEnd = new Date(newStart.getTime() + consultation.duration * 60000);

    const meeting = await createConsultationMeeting({
      consultation,
      professional,
      start: newStart,
      end: newEnd,
      replaceEventId: consultation.googleEventId,
    });
    if (meeting.error) return res.status(meeting.error.status).json(meeting.error.body);
    const { meetingLink, googleEventId } = meeting;

    consultation.scheduledStart = newStart;
    consultation.scheduledEnd = newEnd;
    consultation.googleMeetUrl = meetingLink;
    consultation.googleEventId = googleEventId;
    consultation.status = "accepted";
    consultation.acceptedAt = new Date();
    await consultation.save();

    await sendMeetingRescheduledWriterEmail(consultation.writer.email, {
      writerName: consultation.writer.name,
      producerName: professional.name,
      scriptName: consultation.topic,
      date: newStart.toLocaleDateString(),
      time: newStart.toLocaleTimeString(),
      meetingLink,
    });

    await sendMeetingRescheduledProfessionalEmail(professional.email, {
      professionalName: professional.name,
      writerName: consultation.writer.name,
      scriptName: consultation.topic,
      date: newStart.toLocaleDateString(),
      time: newStart.toLocaleTimeString(),
      meetingLink,
    });

    return res.status(200).json({ message: "Consultation rescheduled successfully.", consultation });
  } catch (error) {
    console.error("Reschedule Consultation Error:", error);
    return res.status(500).json({ message: "Failed to reschedule consultation." });
  }
};
