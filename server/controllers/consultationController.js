import mongoose from "mongoose";
import crypto from "crypto";
import Consultation from "../models/Consultation.js";
import User from "../models/User.js";
import Availability from "../models/Availability.js";
import { resolveCurrency } from "../utils/currencyFx.js";
import { createOrderWithUsdFallback } from "../utils/razorpayOrder.js";
import { verifyRazorpaySignature } from "../utils/razorpaySignature.js";
import { getAccessTokenFromRefresh, createMeetingEvent, ReconnectRequired } from "../utils/googleCalendar.js";
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

    let amount = 0;
    let selectedCurrency = req.body.currency || "INR";
    let currency = selectedCurrency;
    let durationMins = duration ? Number(duration) : 30;

    const availability = await Availability.findOne({ professional: professionalId });
    if (availability && availability.enabled) {
      amount = availability.consultationPrice;
      currency = availability.currency || "INR";
      if (!duration) durationMins = availability.duration;
    } else if (duration) {
      // Dynamic pricing based on duration and selected currency
      if (selectedCurrency === "USD") {
        amount = durationMins === 60 ? 1600 : 900; // $16 or $9 in cents
      } else {
        amount = durationMins === 60 ? 1500000 : 800000; // 15000 or 8000 INR in paise
      }
    } else {
      return res.status(400).json({ message: "Professional is not accepting consultations and no duration was provided." });
    }

    const platformFee = Math.round(amount * 0.10);
    const professionalAmount = amount - platformFee;

    const [hours, minutes] = (time || "00:00").split(':');
    const scheduledStart = new Date(date || Date.now());
    scheduledStart.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMins * 60000);

    

    const consultation = new Consultation({
      writer: writerId,
      professional: professionalId,
      professionalRole: professional.role,
      amount,
      currency,
      platformFee,
      professionalAmount,
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

    if (professional) {
      await sendConsultationBookedEmail(professional.email, {
        professionalName: professional.name,
        writerName: writer.name,
        topic: consultation.topic,
        date: consultation.scheduledStart.toLocaleDateString(),
        time: consultation.scheduledStart.toLocaleTimeString(),
        amount: consultation.amount / 100,
        currency: consultation.currency,
          additionalMessage: consultation.additionalMessage,
      fileLink,
          fileLink: consultation.fileLink,
        });
    }

    if (writer) {
      await sendConsultationPaidWriterEmail(writer.email, {
        writerName: writer.name,
        producerName: professional.name,
        amount: consultation.amount / 100,
        currency: consultation.currency,
          additionalMessage: consultation.additionalMessage,
      fileLink,
          fileLink: consultation.fileLink,
        date: consultation.scheduledStart.toLocaleDateString(),
        time: consultation.scheduledStart.toLocaleTimeString(),
        });
    }

    return res.status(200).json({
      message: "Consultation booked successfully",
      consultationId: consultation._id
    });
  } catch (error) {
    console.error("Create Consultation Order Error:", error);
    return res.status(500).json({ message: "Failed: " + error.message });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const consultation = await Consultation.findById(id).populate("writer");
    if (!consultation) return res.status(404).json({ message: "Consultation not found." });

    if (!verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    })) {
      return res.status(400).json({ message: "Payment verification failed: Invalid signature" });
    }

    consultation.status = "awaiting_response";
    consultation.razorpayPaymentId = razorpay_payment_id;
    consultation.paidAt = new Date();
    
    // Generate dummy/fallback meet link if google calendar fails or is not connected
    let meetLink = "https://meet.google.com/" + Math.random().toString(36).substring(2, 12);
    
    const professional = await User.findById(consultation.professional);
    
    if (professional && professional.googleCalendar && professional.googleCalendar.connected) {
        try {
            const { accessToken } = await getAccessTokenFromRefresh(decryptToken(professional.googleCalendar.refreshTokenEnc));
            const meetRes = await createMeetingEvent({
                accessToken,
                summary: `Consultation: ${consultation.topic}`,
                startISO: consultation.scheduledStart.toISOString(),
                endISO: consultation.scheduledEnd.toISOString(),
                timeZone: consultation.timezone,
                attendees: [consultation.writer.email, professional.email]
            });
            if (meetRes.meetLink) meetLink = meetRes.meetLink;
        } catch (e) {
            console.error("Google Meet creation failed, using fallback:", e);
        }
    }
    
    consultation.googleMeetUrl = meetLink;
    await consultation.save();

    if (professional) {
      await sendConsultationBookedEmail(professional.email, {
        professionalName: professional.name,
        writerName: consultation.writer.name,
        topic: consultation.topic,
        date: consultation.scheduledStart.toLocaleDateString(),
        time: consultation.scheduledStart.toLocaleTimeString(),
        amount: consultation.amount / 100, // format from paise
        currency: consultation.currency,
          additionalMessage: consultation.additionalMessage,
      fileLink,
          fileLink: consultation.fileLink,
        });
    }
    
    if (consultation.writer) {
      await sendConsultationPaidWriterEmail(consultation.writer.email, {
        writerName: consultation.writer.name,
        producerName: professional ? professional.name : "Producer",
        amount: consultation.amount / 100,
        currency: consultation.currency,
          additionalMessage: consultation.additionalMessage,
      fileLink,
          fileLink: consultation.fileLink,
        date: consultation.scheduledStart.toLocaleDateString(),
        time: consultation.scheduledStart.toLocaleTimeString(),
        });
    }

    return res.status(200).json({ message: "Payment verified successfully.", consultation });
  } catch (error) {
    console.error("Verify Payment Error:", error);
    return res.status(500).json({ message: "Payment verification failed." });
  }
};

export const getWriterConsultations = async (req, res) => {
  try {
    const consultations = await Consultation.find({ writer: req.user._id })
      .populate("professional", "name email profileImage role")
      .sort({ createdAt: -1 });
    return res.status(200).json(consultations);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch consultations." });
  }
};

export const getProfessionalConsultations = async (req, res) => {
  try {
    const consultations = await Consultation.find({ professional: req.user._id })
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
      
    let meetingLink = "https://meet.google.com/aut-omat-icly";
    let googleEventId = "dummy_event_id";
      
    if (professional.googleCalendar?.connected && professional.googleCalendar?.refreshTokenEnc) {
      try {
        const refreshToken = decryptToken(professional.googleCalendar.refreshTokenEnc);
        const { accessToken } = await getAccessTokenFromRefresh(refreshToken);
        const event = await createMeetingEvent({
          accessToken,
          summary: `Ckript Consultation: ${consultation.writer.name} & ${professional.name}`,
          description: `Topic: ${consultation.topic}\n\n${consultation.additionalMessage || ""}`,
          startISO: consultation.scheduledStart.toISOString(),
          endISO: consultation.scheduledEnd.toISOString(),
          timeZone: consultation.timezone,
          attendees: [professional.email, consultation.writer.email],
        });
        meetingLink = event.meetLink;
        googleEventId = event.eventId;
      } catch (err) {
        console.error("Google Calendar API Error (bypassed):", err);
      }
    }

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
    
    let meetingLink = "https://meet.google.com/aut-omat-icly";
    let googleEventId = "dummy_event_id";
      
    // Attempt calendar if connected
    if (professional.googleCalendar?.connected && professional.googleCalendar?.refreshTokenEnc) {
      try {
        const { decryptToken } = require("../utils/accountSecurity.js");
        const { getAccessTokenFromRefresh, createMeetingEvent } = require("../utils/googleCalendar.js");
        
        const refreshToken = decryptToken(professional.googleCalendar.refreshTokenEnc);
        const { accessToken } = await getAccessTokenFromRefresh(refreshToken);
        
        const start = new Date(newStartISO);
        const end = new Date(start.getTime() + consultation.duration * 60000);
        
        const event = await createMeetingEvent({
          accessToken,
          summary: `Ckript Consultation: ${consultation.writer.name} & ${professional.name}`,
          description: `Topic: ${consultation.topic}\n\n${consultation.additionalMessage || ""}`,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
          timeZone: consultation.timezone,
          attendees: [professional.email, consultation.writer.email],
        });
        meetingLink = event.meetLink;
        googleEventId = event.eventId;
      } catch (err) {
        console.error("Google Calendar API Error (bypassed on reschedule):", err);
      }
    }

    const newStart = new Date(newStartISO);
    const newEnd = new Date(newStart.getTime() + consultation.duration * 60000);

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
