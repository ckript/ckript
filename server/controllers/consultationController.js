import mongoose from "mongoose";
import crypto from "crypto";
import Consultation from "../models/Consultation.js";
import User from "../models/User.js";
import Availability from "../models/Availability.js";
import { resolveCurrency } from "../utils/currencyFx.js";
import { createOrderWithUsdFallback } from "../utils/razorpayOrder.js";
import { verifyRazorpaySignature } from "../utils/razorpaySignature.js";
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

// Razorpay checkout for consultations is OFF unless CONSULTATION_PAYMENTS_ENABLED=true. While off,
// a booking is confirmed immediately (no charge) so the flow can be tested end to end.
const consultationPaymentsEnabled = () => String(process.env.CONSULTATION_PAYMENTS_ENABLED || "").toLowerCase() === "true";

// Booking-confirmed emails to the professional and the writer. Never throws: the booking is already
// saved by the time these go out, so an email failure must not fail the request.
const sendBookingConfirmedEmails = async (consultation, writer, professional) => {
  try {
    if (professional) {
      await sendConsultationBookedEmail(professional.email, {
        professionalName: professional.name,
        writerName: writer.name,
        topic: consultation.topic,
        date: consultation.scheduledStart.toLocaleDateString(),
        time: consultation.scheduledStart.toLocaleTimeString(),
        amount: consultation.amount / 100, // format from paise
        currency: consultation.currency,
        additionalMessage: consultation.additionalMessage,
        fileLink: consultation.fileLink,
      });
    }

    await sendConsultationPaidWriterEmail(writer.email, {
      writerName: writer.name,
      producerName: professional ? professional.name : "Producer",
      amount: consultation.amount / 100,
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

    let amount = 0;
    let inrAmount = null;
    let selectedCurrency = resolveCurrency(req.body.currency, writer.preferredCurrency);
    let currency = selectedCurrency;
    let durationMins = duration ? Number(duration) : 30;

    const availability = await Availability.findOne({ professional: professionalId });
    if (availability && availability.enabled) {
      amount = availability.consultationPrice;
      currency = availability.currency || "INR";
      if (!duration) durationMins = availability.duration;
    } else if (duration) {
      // Dynamic pricing based on duration and selected currency
      inrAmount = durationMins === 60 ? 1500000 : 800000; // 15000 or 8000 INR in paise
      if (selectedCurrency === "USD") {
        amount = durationMins === 60 ? 1600 : 900; // $16 or $9 in cents
      } else {
        amount = inrAmount;
      }
    } else {
      return res.status(400).json({ message: "Professional is not accepting consultations and no duration was provided." });
    }

    const [hours, minutes] = (time || "00:00").split(':');
    const scheduledStart = new Date(date || Date.now());
    scheduledStart.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMins * 60000);

    if (!paymentsEnabled) {
      const platformFee = Math.round(amount * 0.10);
      const consultation = new Consultation({
        writer: writerId,
        professional: professionalId,
        professionalRole: professional.role,
        amount,
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
      await sendBookingConfirmedEmails(consultation, writer, professional);

      return res.status(200).json({
        message: "Consultation booked successfully",
        paymentRequired: false,
        consultationId: consultation._id,
      });
    }

    const { order, fellBackToINR } = await createOrderWithUsdFallback(razorpay, {
      amount,
      currency,
      inrAmount,
      receipt: `cons_${writerId.toString().substring(18)}_${Date.now()}`,
      notes: {
        type: "consultation",
        writerId: writerId.toString(),
        professionalId: professionalId.toString(),
      },
    });
    if (!order) return res.status(500).json({ message: "Failed to create Razorpay order" });

    // Fees are derived from what Razorpay will actually charge (a USD order may fall back to INR).
    const platformFee = Math.round(order.amount * 0.10);
    const professionalAmount = order.amount - platformFee;

    const consultation = new Consultation({
      writer: writerId,
      professional: professionalId,
      professionalRole: professional.role,
      amount: order.amount,
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

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      paymentRequired: true,
      fellBackToINR,
      consultationId: consultation._id,
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

    if (!verifyRazorpaySignature({
      orderId: consultation.razorpayOrderId,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    })) {
      consultation.status = "payment_failed";
      await consultation.save();
      return res.status(400).json({ message: "Payment verification failed: Invalid signature" });
    }

    consultation.status = "awaiting_response";
    consultation.razorpayPaymentId = String(razorpay_payment_id);
    consultation.paidAt = new Date();
    // The Google Meet link is created when the professional accepts (acceptConsultation), not here.
    await consultation.save();

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
    
    // Process Refund via Razorpay
    if (consultation.razorpayPaymentId) {
      const razorpay = await getRazorpayInstance();
      if (razorpay) {
        try {
          const refund = await razorpay.payments.refund(consultation.razorpayPaymentId, {
            amount: consultation.amount,
            notes: {
              consultationId: consultation._id.toString(),
              reason: "Professional rejected consultation"
            }
          });
          consultation.razorpayRefundId = refund.id;
          consultation.refundAmount = consultation.amount;
          consultation.status = "refunded";
          consultation.refundCompletedAt = new Date();
        } catch (refundError) {
          console.error("Refund failed:", refundError);
          consultation.status = "refund_failed";
          consultation.refundReason = refundError.message || "Razorpay API error";
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
      
      // Process Refund via Razorpay
      if (consultation.razorpayPaymentId) {
        const razorpay = await getRazorpayInstance();
        if (razorpay) {
          try {
            const refund = await razorpay.payments.refund(consultation.razorpayPaymentId, {
              amount: consultation.amount,
              notes: {
                consultationId: consultation._id.toString(),
                reason: "Writer cancelled consultation"
              }
            });
            consultation.razorpayRefundId = refund.id;
            consultation.refundAmount = consultation.amount;
            consultation.status = "refunded";
            consultation.refundCompletedAt = new Date();
          } catch (refundError) {
            consultation.status = "refund_failed";
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
