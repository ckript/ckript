import mongoose from "mongoose";
import User from "../models/User.js";
import {
  hasActiveFilmIndustryProfessionalAccess,
  hasAnyFipAccess,
  isFilmIndustryProfessionalRole,
  hasRevealedContact,
  hasReachedContactLimit,
  getRevealedContactCount,
  getContactsLimit,
  getRemainingContacts,
  hasMessagedWriter,
  hasReachedMessageWritersLimit,
  getMessagedWritersCount,
  getMessageWritersLimit,
  getRemainingMessageWriters,
  isWriterRole,
} from "../utils/industryAccess.js";

import crypto from "crypto";
import { resolveCurrency } from "../utils/currencyFx.js";
import { createOrderWithUsdFallback } from "../utils/razorpayOrder.js";
import { WRITER_PLAN_KEY } from "../config/pricing.js";
import { planOrderNotes, readVerifiedPlanOrder, planAmountMinor, planLines, PLAN_PURPOSE } from "../utils/planCheckout.js";
import {
  billingFromRequest,
  checkoutBreakdown,
  pickPriced,
  priceCheckout,
  priceWithInrFallback,
  requestIp,
  resolveCapturedTax,
  saveQuote,
} from "../utils/tax/checkout.js";
import { recordPayment, recordGrant } from "../utils/ledger.js";
import { issueInvoice, totalRow, gatewayRow, formatInvoiceMoney } from "../utils/invoiceIssue.js";
// verifyRazorpayPayment and verifyWriterRazorpayPayment both call this and it was never imported,
// so every subscription and writer-plan verification threw a ReferenceError and 500'd inside its
// try/catch — the customer paid and the plan was never granted. See lintUndefined.test.js, which
// now fails the suite on any dangling identifier rather than leaving it for production to find.
import {
  verifyRazorpaySignature,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
} from "../utils/razorpaySignature.js";
import {
  PLAN_CATALOG,
  RENEWING_STATUSES,
  applySubscriptionCharge,
  createPlanSubscription as createRazorpayPlanSubscription,
  deferredStartFor,
  normalizeCycle,
  oneTimeAccessWindow,
  publicRecurringState,
  readVerifiedSubscription,
  recurringBillingEnabled,
  syncRecurringPlan,
} from "../utils/planSubscription.js";
import { dispatchRazorpayWebhook } from "../utils/razorpayWebhook.js";

const FILM_INDUSTRY_PRO_MODEL = {
  plan: "pro",
  durationDays: 30,
  checkoutProvider: "razorpay",
  checkoutMode: "live",
  accessTier: "film_industry_professional",
};

const WRITER_SILVER_MODEL = {
  plan: "silver",
  durationDays: 30,
  checkoutProvider: "razorpay",
  checkoutMode: "live",
  accessTier: "writer_silver",
};

const WRITER_GOLD_MODEL = {
  plan: "gold",
  durationDays: 30,
  checkoutProvider: "razorpay",
  checkoutMode: "live",
  accessTier: "writer_gold",
};

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


const normalizeReturnPath = (value = "") => {
  const path = String(value || "").trim();
  if (!path || !path.startsWith("/")) return "";
  if (path.startsWith("//")) return "";
  if (path.startsWith("/login") || path.startsWith("/signup")) return "";
  return path;
};

export const getFilmIndustryProfessionalTestCheckoutStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      access: {
        hasAccess: hasActiveFilmIndustryProfessionalAccess(user),
        isEligibleRole: isFilmIndustryProfessionalRole(user),
      },
      subscription: user.subscription || {},
      user: user.toObject(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to load pricing status" });
  }
};

export const activateFilmIndustryProfessionalTestCheckout = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).select("role subscription");
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!isFilmIndustryProfessionalRole(currentUser)) {
      return res.status(403).json({
        message: "Only film industry professionals can activate this pricing plan.",
      });
    }

    const returnTo = normalizeReturnPath(req.body?.returnTo || req.get("referer") || "");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + FILM_INDUSTRY_PRO_MODEL.durationDays * 24 * 60 * 60 * 1000);
    const checkoutReference = `razorpay_test_${currentUser._id.toString()}_${Date.now()}`;

    const update = {
      $set: {
        "subscription.plan": FILM_INDUSTRY_PRO_MODEL.plan,
        "subscription.aiImagesGeneratedTotal": 0,
        "subscription.expiresAt": expiresAt,
        "subscription.accessTier": FILM_INDUSTRY_PRO_MODEL.accessTier,
        "subscription.accessStatus": "active",
        "subscription.accessActivatedAt": now,
        "subscription.accessExpiresAt": expiresAt,
        "subscription.checkoutMode": FILM_INDUSTRY_PRO_MODEL.checkoutMode,
        "subscription.checkoutProvider": FILM_INDUSTRY_PRO_MODEL.checkoutProvider,
        "subscription.checkoutReference": checkoutReference,
        "subscription.sourcePath": returnTo || "/home",
        "subscription.revealedContacts": [],
        "subscription.messagedWriters": [],
        "subscription.contactsLimit": 10,
        "subscription.messageWritersLimit": 10,
        "subscription.meetingsLimit": 10,
      },
    };

    await User.updateOne({ _id: currentUser._id }, update);

    // A free 30-day Diamond. It writes checkoutMode:"live" and checkoutProvider:"razorpay" onto the
    // user, so in that record it is indistinguishable from a ₹1,999 sale — this entry is the only
    // thing that tells the two apart, and carries the revenue foregone.
    await recordGrant({
      kind: "plan_subscription",
      user: currentUser._id,
      listPriceMinor: planAmountMinor("film_industry_professional", "INR", "monthly") || 0,
      subjectType: "Plan",
      label: "Film Industry Professional (test checkout)",
      reason: "self-serve test checkout",
      source: "paymentController.activateFilmIndustryProfessionalTestCheckout",
      metadata: { planKey: "film_industry_professional", checkoutReference },
    });

    const refreshedUser = await User.findById(currentUser._id).select("-password");

    return res.json({
      message: "Test checkout activated successfully.",
      redirectTo: "/home",
      access: {
        hasAccess: true,
        isEligibleRole: true,
      },
      subscription: refreshedUser?.subscription || currentUser.subscription,
      user: refreshedUser?.toObject ? refreshedUser.toObject() : refreshedUser,
      plan: FILM_INDUSTRY_PRO_MODEL,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to activate test checkout" });
  }
};

/**
 * One plan checkout for every plan.
 *
 * The amount is the plan's PRE-TAX list price from config/pricing.js (via planAmountMinor, which also
 * owns the annual discount — it used to be re-derived inline here, twice). With taxes switched on the
 * order is created for that price plus 18%, and the priced snapshot is stored against the order so
 * verification can prove what was paid and every record carries the figures the buyer was shown.
 */
const createPlanOrder = async (req, res, { user, planKey, tier = "" }) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    return res.status(503).json({ message: "Razorpay is not configured. Keys are missing." });
  }

  const billing = await billingFromRequest(req, user);
  if (billing.error) return res.status(400).json({ message: billing.error, errors: billing.errors });

  // Amount is server-authoritative from the price matrix; only the currency comes from the client.
  const cycle = req.body?.cycle === "annual" ? "annual" : "monthly";
  const currency = resolveCurrency(req.body?.currency, user.preferredCurrency);
  const lines = planLines(planKey, currency, cycle);
  const inrLines = planLines(planKey, "INR", cycle);
  if (!lines.length || !inrLines.length) return res.status(400).json({ message: "Unknown plan." });

  const priced = await priceWithInrFallback({
    user,
    currency,
    lines,
    inrLines,
    billingOverride: billing.override,
    ip: requestIp(req),
  });

  const { order, fellBackToINR } = await createOrderWithUsdFallback(razorpay, {
    amount: priced.requested.grossMinor,
    currency,
    inrAmount: priced.inr.grossMinor,
    receipt: `rcpt_${user._id.toString().substring(18)}_${tier || "fip"}_${Date.now()}`,
    // The plan and billing cycle are decided HERE, where the price is computed, and read back from the
    // order at verification. They used to come from the verify request body, so a paid Silver order
    // could be verified as `tier: "gold", cycle: "annual"` — ₹399 for ₹7,130 of access.
    notes: planOrderNotes({ userId: user._id, planKey, tier, cycle }),
  });
  if (!order) return res.status(500).json({ message: "Failed to create Razorpay order" });

  const chosen = pickPriced(priced, order.currency);
  await saveQuote({ order, user, purpose: PLAN_PURPOSE, subjectId: planKey, priced: chosen });

  return res.status(200).json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    key: process.env.RAZORPAY_KEY_ID,
    fellBackToINR,
    breakdown: checkoutBreakdown(chosen, {
      currency: order.currency,
      lines: String(order.currency).toUpperCase() === "INR" ? inrLines : lines,
    }),
  });
};

/** What a plan costs, for the checkout step: listed (pre-tax) price, taxes, total. No order is created. */
export const getPlanQuote = async (req, res) => {
  try {
    const planKey = PLAN_KEY_BY_INPUT[String(req.body?.plan || "").trim().toLowerCase()];
    if (!planKey) return res.status(400).json({ message: "Unknown plan." });
    const user = await User.findById(req.user._id).select("name email role preferredCurrency address billingProfile");
    if (!user) return res.status(404).json({ message: "User not found" });
    const billing = await billingFromRequest({ ...req, body: { ...req.body, saveBilling: false } }, user);
    if (billing.error) return res.status(400).json({ message: billing.error, errors: billing.errors });
    const cycle = req.body?.cycle === "annual" ? "annual" : "monthly";
    const currency = resolveCurrency(req.body?.currency, user.preferredCurrency);
    const lines = planLines(planKey, currency, cycle);
    if (!lines.length) return res.status(400).json({ message: "Unknown plan." });
    const priced = await priceCheckout({ user, lines, currency, billingOverride: billing.override, ip: requestIp(req) });
    return res.json({
      plan: planKey,
      cycle,
      listedMinor: priced.preTaxMinor,
      breakdown: checkoutBreakdown(priced, { currency, lines }),
    });
  } catch (error) {
    console.error("[plan quote] failed:", error);
    return res.status(500).json({ message: "Could not price this plan." });
  }
};

export const createRazorpayOrder = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).select("name email role preferredCurrency address billingProfile");
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    if (!isFilmIndustryProfessionalRole(currentUser)) {
      return res.status(403).json({ message: "Only film industry professionals can purchase this plan." });
    }

    return await createPlanOrder(req, res, { user: currentUser, planKey: "film_industry_professional" });
  } catch (error) {
    console.error("Razorpay Create Order Error:", error);
    return res.status(500).json({ message: error.message || error.description || "Failed to create order" });
  }
};

export const activateTestWriterSubscription = async (req, res) => {
  try {
    const { tier } = req.body;
    
    if (!tier || !["silver", "gold"].includes(tier)) {
      return res.status(400).json({ message: "Invalid tier for test subscription." });
    }

    const currentUser = await User.findById(req.user._id).select("role subscription");
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    const model = tier === "gold" ? WRITER_GOLD_MODEL : WRITER_SILVER_MODEL;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + model.durationDays * 24 * 60 * 60 * 1000);

    const update = {
      $set: {
        "subscription.plan": model.plan,
        "subscription.aiImagesGeneratedTotal": 0,
        "subscription.expiresAt": expiresAt,
        "subscription.accessTier": model.accessTier,
        "subscription.accessStatus": "active",
        "subscription.accessActivatedAt": now,
        "subscription.accessExpiresAt": expiresAt,
        "subscription.checkoutMode": "test",
        "subscription.checkoutProvider": "mock",
        "subscription.checkoutReference": `mock_${Date.now()}`,
      },
    };

    await User.updateOne({ _id: currentUser._id }, update);

    await recordGrant({
      kind: "plan_subscription",
      user: currentUser._id,
      listPriceMinor: planAmountMinor(WRITER_PLAN_KEY[tier], "INR", "monthly") || 0,
      subjectType: "Plan",
      label: "Writer " + tier + " (test subscription)",
      reason: "self-serve test subscription",
      source: "paymentController.activateTestWriterSubscription",
      metadata: { planKey: WRITER_PLAN_KEY[tier], tier },
    });

    const refreshedUser = await User.findById(currentUser._id).select("-password");

    return res.status(200).json({ 
      success: true, 
      message: "Test Silver plan activated successfully!",
      user: refreshedUser
    });
  } catch (error) {
    console.error("Test Writer Payment Error:", error);
    return res.status(500).json({ message: error.message || "Test payment failed" });
  }
};

export const verifyRazorpayPayment = async (req, res) => {
  try {
    // `cycle` is deliberately NOT read from the body — see below.
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, returnTo } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing required payment details" });
    }

    const currentUser = await User.findById(req.user._id).select("role subscription sid name email address billingProfile");
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    // Verify signature (constant-time; see utils/razorpaySignature.js)
    if (!verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    })) {
      return res.status(400).json({ message: "Payment verification failed: Invalid signature" });
    }

    // The signature only proves SOME payment on this account succeeded. Read the order back to learn
    // which plan was bought, for how long, and for how much — and to prove it was this user's.
    const razorpayClient = await getRazorpayInstance();
    if (!razorpayClient) {
      return res.status(503).json({ message: "Razorpay is not configured. Keys are missing." });
    }
    const verified = await readVerifiedPlanOrder(razorpayClient, razorpay_order_id, currentUser._id);
    if (verified.error) return res.status(verified.status).json({ message: verified.error });

    const cycle = verified.cycle;
    const now = new Date();
    const durationDays = cycle === "annual" ? 365 : FILM_INDUSTRY_PRO_MODEL.durationDays;
    // Renewing while still active extends from the current expiry instead of discarding the days left.
    const { expiresAt, freshActivation } = oneTimeAccessWindow(
      currentUser.subscription || {},
      FILM_INDUSTRY_PRO_MODEL.accessTier,
      durationDays,
      now,
    );

    const set = {
      "subscription.plan": FILM_INDUSTRY_PRO_MODEL.plan,
      "subscription.expiresAt": expiresAt,
      "subscription.accessTier": FILM_INDUSTRY_PRO_MODEL.accessTier,
      "subscription.accessStatus": "active",
      "subscription.accessExpiresAt": expiresAt,
      "subscription.checkoutMode": "live",
      "subscription.checkoutProvider": "razorpay",
      "subscription.checkoutReference": razorpay_payment_id,
      "subscription.sourcePath": normalizeReturnPath(returnTo) || "/home",
    };
    if (!currentUser.subscription?.recurring?.autoRenew) set["subscription.billingMode"] = "one_time";
    // A first activation anchors the monthly usage cycle and clears its counters; a renewal keeps both,
    // so the contact and message limits keep resetting on the same day of the month.
    if (freshActivation) {
      Object.assign(set, {
        "subscription.aiImagesGeneratedTotal": 0,
        "subscription.accessActivatedAt": now,
        "subscription.revealedContacts": [],
        "subscription.messagedWriters": [],
        "subscription.scheduledMeetings": [],
        "subscription.contactsLimit": 10,
        "subscription.messageWritersLimit": 10,
        "subscription.meetingsLimit": 10,
      });
    }

    await User.updateOne({ _id: currentUser._id }, { $set: set });

    // The taxes inside what was paid: the quote stored at order creation, or (an order priced before
    // taxes switched on) carved out of the amount. Null with taxes off or before the registration date.
    const fipTax = await resolveCapturedTax({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paidMinor: verified.paidMinor,
      currency: verified.currency,
      user: currentUser,
      lines: planLines("film_industry_professional", verified.currency, cycle),
    });

    // Written AFTER the entitlement lands and never allowed to fail the request: the money is
    // already captured, so an error here would tell a paying user their payment failed.
    await recordPayment({
      kind: "plan_subscription",
      tax: fipTax,
      user: currentUser._id,
      amountMinor: verified.paidMinor,
      currency: verified.currency,
      listPriceMinor: planAmountMinor("film_industry_professional", verified.currency, cycle) || 0,
      providerOrderId: razorpay_order_id,
      providerPaymentId: razorpay_payment_id,
      subjectType: "Plan",
      label: "Film Industry Professional (" + cycle + ")",
      source: "paymentController.verifyRazorpayPayment",
      metadata: { planKey: "film_industry_professional", cycle, durationDays },
    });

    // The buyer's copy. Non-fatal like the ledger row above and for the same reason — the charge has
    // already gone through, so a document that cannot be written is skipped, never surfaced as a
    // failed payment. The PDF itself renders on first download.
    const paidMajor = Number(verified.paidMinor || 0) / 100;
    await issueInvoice({
      kind: "plan_subscription",
      user: currentUser,
      paymentReference: razorpay_payment_id,
      providerPaymentId: razorpay_payment_id,
      tax: fipTax,
      currency: verified.currency,
      amountCharged: paidMajor,
      detailLines: [
        "Film Industry Professional",
        `Billing: ${cycle}`,
        `Access: ${durationDays} days`,
        `Payment Ref: ${razorpay_payment_id}`,
      ],
      rows: [
        {
          item: "Film Industry Professional",
          type: "Subscription",
          detail: `${cycle} plan, ${durationDays} days of full access.`,
          amountLabel: formatInvoiceMoney(paidMajor, verified.currency),
          amountValue: paidMajor,
        },
        totalRow(paidMajor, verified.currency),
        gatewayRow(razorpay_payment_id),
      ],
      source: "paymentController.verifyRazorpayPayment",
    });

    const refreshedUser = await User.findById(currentUser._id).select("-password");

    return res.json({
      message: "Payment verified and subscription activated.",
      redirectTo: normalizeReturnPath(returnTo) || "/home",
      access: {
        hasAccess: true,
        isEligibleRole: true,
      },
      subscription: refreshedUser?.subscription || currentUser.subscription,
      user: refreshedUser?.toObject ? refreshedUser.toObject() : refreshedUser,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Payment verification failed" });
  }
};

export const revealWriterContact = async (req, res) => {
  try {
    const { writerId } = req.params;

    if (!writerId || !mongoose.Types.ObjectId.isValid(writerId)) {
      return res.status(400).json({ message: "Invalid writer ID" });
    }

    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!hasAnyFipAccess(user)) {
      return res.status(403).json({
        message: "Film Industry Professional subscription or a verified company email is required to reveal writer contacts.",
        requiresUpgrade: true,
      });
    }

    const writer = await User.findById(writerId)
      .select("email phone writerProfile.links name username allowIndustryContact role")
      .lean();
    if (!writer) return res.status(404).json({ message: "Writer not found" });

    /*
     * DEF-29: this endpoint reveals a WRITER's contact details, and until now it would reveal
     * anyone's.
     *
     * The id comes from the URL, and nothing checked what kind of account it pointed at — so any
     * account with FIP access could POST an arbitrary user id and read that person's email and
     * phone: another producer, an admin, a reader. Every real caller passes a writer
     * (`script.creator._id`, a writer profile, a deal's writer), so narrowing this refuses only
     * the calls the product never makes.
     *
     * The opt-out check below was already writer-shaped and depended on the same role list, which
     * is what made the gap visible: a non-writer could not opt out of a disclosure the product
     * says is about writers.
     */
    if (!isWriterRole(writer.role)) {
      return res.status(404).json({ message: "Writer not found" });
    }

    if (writer.allowIndustryContact === false) {
      return res.status(403).json({
        message: "This writer has opted out of sharing contact details with industry professionals.",
        optedOut: true
      });
    }

    const writerObjectId = String(writerId);
    const alreadyRevealed = hasRevealedContact(user, writerObjectId);

    if (!alreadyRevealed) {
      if (hasReachedContactLimit(user)) {
        return res.status(403).json({
          message: "You've reached your 15 writer contact limit for this subscription period.",
          limitReached: true,
          contactsUsed: getRevealedContactCount(user),
          contactsLimit: getContactsLimit(user),
          remainingContacts: 0,
        });
      }

      await User.updateOne(
        { _id: user._id },
        {
          $push: {
            "subscription.revealedContacts": {
              writerId: new mongoose.Types.ObjectId(writerId),
              revealedAt: new Date(),
            },
          },
        }
      );
    }

    const refreshedUser = await User.findById(user._id).select("subscription").lean();
    const contactsUsed = getRevealedContactCount(refreshedUser || user);
    const contactsLimit = getContactsLimit(refreshedUser || user);
    const remainingContacts = getRemainingContacts(refreshedUser || user);

    return res.json({
      contact: {
        email: String(writer.email || "").trim(),
        phone: String(writer.phone || "").trim(),
        links: writer.writerProfile?.links || {},
      },
      alreadyRevealed,
      contactsUsed,
      contactsLimit,
      remainingContacts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to reveal contact" });
  }
};

export const consumeMessageWriterSlot = async (req, res) => {
  try {
    const { writerId } = req.params;
    // DEF-30: an id that is not an ObjectId reached `new mongoose.Types.ObjectId(writerId)` below
    // and threw, so a malformed URL answered 500 — a server error for what is a bad request. Its
    // sibling `revealWriterContact` has always validated here.
    if (!writerId || !mongoose.Types.ObjectId.isValid(writerId)) {
      return res.status(400).json({ message: "Invalid writer ID" });
    }

    const user = await User.findById(req.user._id).select("subscription role email isPremium").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!hasAnyFipAccess(user)) {
      return res.status(403).json({
        message: "Film Industry Professional access is required to message writers.",
        requiresUpgrade: true,
      });
    }

    const writer = await User.findById(writerId).select("role").lean();
    if (!writer || !isWriterRole(writer.role)) {
      return res.status(404).json({ message: "Writer not found" });
    }

    const alreadyMessaged = hasMessagedWriter(user, writerId);
    
    if (!alreadyMessaged) {
      if (hasReachedMessageWritersLimit(user)) {
        return res.status(403).json({
          message: "You've reached your message limit for this subscription period.",
          limitReached: true,
          messagesUsed: getMessagedWritersCount(user),
          messageWritersLimit: getMessageWritersLimit(user),
          remainingMessageWriters: 0,
        });
      }

      await User.updateOne(
        { _id: user._id },
        {
          $push: {
            "subscription.messagedWriters": {
              writerId: new mongoose.Types.ObjectId(writerId),
              messagedAt: new Date(),
            },
          },
        }
      );
    }

    const refreshedUser = await User.findById(user._id).select("subscription").lean();
    const messagesUsed = getMessagedWritersCount(refreshedUser || user);
    const messageWritersLimit = getMessageWritersLimit(refreshedUser || user);
    const remainingMessageWriters = getRemainingMessageWriters(refreshedUser || user);

    return res.json({
      alreadyMessaged,
      messagesUsed,
      messageWritersLimit,
      remainingMessageWriters,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to consume message slot" });
  }
};

export const createWriterRazorpayOrder = async (req, res) => {
  try {
    const { tier } = req.body;
    if (!tier || !["silver", "gold"].includes(tier)) {
      return res.status(400).json({ message: "Invalid tier for subscription." });
    }

    const currentUser = await User.findById(req.user._id).select("name email role preferredCurrency address billingProfile");
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    if (!["writer", "creator"].includes(String(currentUser.role).toLowerCase())) {
      return res.status(403).json({ message: "Only writers and creators can purchase this plan." });
    }

    return await createPlanOrder(req, res, { user: currentUser, planKey: WRITER_PLAN_KEY[tier], tier });
  } catch (error) {
    console.error("Writer Razorpay Create Order Error:", error);
    return res.status(500).json({ message: error.message || "Failed to create order" });
  }
};

export const verifyWriterRazorpayPayment = async (req, res) => {
  try {
    // `tier` and `cycle` are deliberately NOT read from the body — they come from the order.
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing required payment details" });
    }

    if (!verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    })) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    const currentUser = await User.findById(req.user._id).select("role subscription sid name email address billingProfile");
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    // What was actually bought and paid for, straight from Razorpay.
    const razorpayClient = await getRazorpayInstance();
    if (!razorpayClient) {
      return res.status(503).json({ message: "Razorpay is not configured. Keys are missing." });
    }
    const verified = await readVerifiedPlanOrder(razorpayClient, razorpay_order_id, currentUser._id);
    if (verified.error) return res.status(verified.status).json({ message: verified.error });

    const { tier, cycle } = verified;
    if (!["silver", "gold"].includes(tier)) {
      return res.status(400).json({ message: "This order is not a writer plan." });
    }

    const model = tier === "gold" ? WRITER_GOLD_MODEL : WRITER_SILVER_MODEL;
    const now = new Date();
    const durationDays = cycle === "annual" ? 365 : model.durationDays;
    // Renewing while still active extends from the current expiry instead of discarding the days left.
    const { expiresAt, freshActivation } = oneTimeAccessWindow(
      currentUser.subscription || {},
      model.accessTier,
      durationDays,
      now,
    );

    const set = {
      "subscription.plan": model.plan,
      "subscription.expiresAt": expiresAt,
      "subscription.accessTier": model.accessTier,
      "subscription.accessStatus": "active",
      "subscription.accessExpiresAt": expiresAt,
      "subscription.checkoutMode": "live",
      "subscription.checkoutProvider": "razorpay",
      "subscription.checkoutReference": razorpay_order_id,
      "subscription.paymentId": razorpay_payment_id,   // now a real schema path — see User.js
    };
    if (!currentUser.subscription?.recurring?.autoRenew) set["subscription.billingMode"] = "one_time";
    // A renewal keeps the usage-cycle anchor so the monthly upload quota keeps its reset day.
    if (freshActivation) {
      set["subscription.aiImagesGeneratedTotal"] = 0;
      set["subscription.accessActivatedAt"] = now;
    }

    await User.updateOne({ _id: currentUser._id }, { $set: set });

    const writerTax = await resolveCapturedTax({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paidMinor: verified.paidMinor,
      currency: verified.currency,
      user: currentUser,
      lines: planLines(WRITER_PLAN_KEY[tier], verified.currency, cycle),
    });

    await recordPayment({
      kind: "plan_subscription",
      tax: writerTax,
      user: currentUser._id,
      amountMinor: verified.paidMinor,
      currency: verified.currency,
      listPriceMinor: planAmountMinor(WRITER_PLAN_KEY[tier], verified.currency, cycle) || 0,
      providerOrderId: razorpay_order_id,
      providerPaymentId: razorpay_payment_id,
      subjectType: "Plan",
      label: "Writer " + tier + " (" + cycle + ")",
      source: "paymentController.verifyWriterRazorpayPayment",
      metadata: { planKey: WRITER_PLAN_KEY[tier], tier, cycle, durationDays },
    });

    const writerPaidMajor = Number(verified.paidMinor || 0) / 100;
    const tierLabel = `Writer ${String(tier).charAt(0).toUpperCase()}${String(tier).slice(1)}`;
    await issueInvoice({
      kind: "plan_subscription",
      user: currentUser,
      paymentReference: razorpay_payment_id,
      providerPaymentId: razorpay_payment_id,
      tax: writerTax,
      currency: verified.currency,
      amountCharged: writerPaidMajor,
      detailLines: [
        tierLabel,
        `Billing: ${cycle}`,
        `Access: ${durationDays} days`,
        `Payment Ref: ${razorpay_payment_id}`,
      ],
      rows: [
        {
          item: tierLabel,
          type: "Subscription",
          detail: `${cycle} plan, ${durationDays} days of writer tools.`,
          amountLabel: formatInvoiceMoney(writerPaidMajor, verified.currency),
          amountValue: writerPaidMajor,
        },
        totalRow(writerPaidMajor, verified.currency),
        gatewayRow(razorpay_payment_id),
      ],
      source: "paymentController.verifyWriterRazorpayPayment",
    });

    const refreshedUser = await User.findById(currentUser._id).select("-password");

    return res.status(200).json({
      success: true,
      message: `${model.plan.charAt(0).toUpperCase() + model.plan.slice(1)} Model activated successfully!`,
      user: refreshedUser
    });
  } catch (error) {
    console.error("Writer Razorpay Verification Error:", error);
    return res.status(500).json({ message: error.message || "Payment verification failed" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Recurring plans (Razorpay Subscriptions)
//
// The handlers above sell a plan as a single order: one charge, a fixed window, then it lapses.
// These sell the same plans as a Razorpay Subscription that renews every month (or year) until the
// member cancels. The charge logic itself lives in utils/planSubscription.js so that this checkout,
// the webhook and the re-sync can never disagree about what a payment buys.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Accepts the names the client already uses for each plan. */
const PLAN_KEY_BY_INPUT = {
  fip: "film_industry_professional",
  film_industry_professional: "film_industry_professional",
  silver: "writer_silver",
  writer_silver: "writer_silver",
  gold: "writer_gold",
  writer_gold: "writer_gold",
};

const canBuyPlan = (user, planKey) =>
  planKey === "film_industry_professional"
    ? isFilmIndustryProfessionalRole(user)
    : ["writer", "creator"].includes(String(user?.role || "").toLowerCase());

/** 503 + `fallback` tells the client to sell this plan as a one-time purchase instead. */
const recurringUnavailable = (res, message) =>
  res.status(503).json({
    code: "RECURRING_UNAVAILABLE",
    fallback: "one_time",
    message: message || "Automatic renewal isn't available right now. You can still buy this plan for a single period.",
  });

export const createPlanSubscription = async (req, res) => {
  try {
    const planKey = PLAN_KEY_BY_INPUT[String(req.body?.plan || "").trim().toLowerCase()];
    if (!planKey) return res.status(400).json({ message: "Unknown plan." });
    const cycle = normalizeCycle(req.body?.cycle);

    const currentUser = await User.findById(req.user._id).select("name email role preferredCurrency subscription address billingProfile");
    if (!currentUser) return res.status(404).json({ message: "User not found" });
    if (!canBuyPlan(currentUser, planKey)) {
      return res.status(403).json({
        message: planKey === "film_industry_professional"
          ? "Only film industry professionals can purchase this plan."
          : "Only writers and creators can purchase this plan.",
      });
    }

    if (!recurringBillingEnabled()) return recurringUnavailable(res);

    const razorpay = await getRazorpayInstance();
    if (!razorpay) return res.status(503).json({ message: "Razorpay is not configured. Keys are missing." });

    // One renewing mandate per plan and cycle. A second one would bill the card twice every month.
    const tracked = currentUser.subscription?.recurring || {};
    if (
      tracked.razorpaySubscriptionId &&
      tracked.autoRenew &&
      RENEWING_STATUSES.includes(tracked.status) &&
      tracked.planKey === planKey &&
      tracked.cycle === cycle
    ) {
      return res.status(409).json({
        code: "ALREADY_SUBSCRIBED",
        message: "This plan already renews automatically. Manage it from your account settings.",
      });
    }

    const now = new Date();
    // Paid time already held on this plan is used up first; the subscription's first charge waits.
    const startAt = deferredStartFor(currentUser.subscription || {}, planKey, now);
    const currency = resolveCurrency(req.body?.currency, currentUser.preferredCurrency);

    const billing = await billingFromRequest(req, currentUser);
    if (billing.error) return res.status(400).json({ message: billing.error, errors: billing.errors });

    // What each renewal costs, taxes included, per currency (USD may fall back to INR).
    const pricedByCurrency = {};
    const priceIn = async (cur) => {
      if (!pricedByCurrency[cur]) {
        pricedByCurrency[cur] = await priceCheckout({
          user: currentUser,
          lines: planLines(planKey, cur, cycle),
          currency: cur,
          billingOverride: billing.override,
          ip: requestIp(req),
        });
      }
      return pricedByCurrency[cur];
    };

    let created;
    try {
      created = await createRazorpayPlanSubscription(razorpay, {
        userId: currentUser._id,
        planKey,
        cycle,
        currency,
        startAt,
        grossFor: async (cur) => (await priceIn(cur)).grossMinor,
      });
    } catch (error) {
      // Most often: the Subscriptions product is not activated on the Razorpay account.
      console.error("[plan subscription] create failed:", error?.error?.description || error?.message || error);
      return recurringUnavailable(res);
    }

    const meta = PLAN_CATALOG[planKey];
    return res.status(200).json({
      subscriptionId: created.subscription.id,
      key: process.env.RAZORPAY_KEY_ID,
      planKey,
      cycle,
      amount: created.amountMinor,
      currency: created.currency,
      startsAt: startAt,
      fellBackToINR: created.fellBackToINR,
      description: `${meta.label} — renews ${cycle === "annual" ? "yearly" : "monthly"}`,
      breakdown: checkoutBreakdown(await priceIn(created.currency), {
        currency: created.currency,
        lines: planLines(planKey, created.currency, cycle),
      }),
    });
  } catch (error) {
    console.error("[plan subscription] create error:", error);
    return res.status(500).json({ message: error.message || "Failed to start the subscription" });
  }
};

export const verifyPlanSubscription = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, returnTo } = req.body || {};
    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing required payment details" });
    }

    if (!verifyRazorpaySubscriptionSignature({
      subscriptionId: String(razorpay_subscription_id),
      paymentId: String(razorpay_payment_id),
      signature: String(razorpay_signature),
    })) {
      return res.status(400).json({ message: "Payment verification failed: Invalid signature" });
    }

    const razorpay = await getRazorpayInstance();
    if (!razorpay) return res.status(503).json({ message: "Razorpay is not configured. Keys are missing." });

    // The signature proves Razorpay issued this payment for this subscription id. Reading the
    // subscription back proves it is a plan subscription and that it belongs to this user.
    const verified = await readVerifiedSubscription(razorpay, razorpay_subscription_id, req.user._id);
    if (verified.error) return res.status(verified.status).json({ message: verified.error });

    let payment;
    try {
      payment = await razorpay.payments.fetch(String(razorpay_payment_id));
    } catch (error) {
      console.error("[plan subscription] payment fetch failed:", error?.error?.description || error?.message || error);
      return res.status(502).json({ message: "Could not confirm the payment with Razorpay. Please contact support." });
    }

    const result = await applySubscriptionCharge({
      razorpay,
      subscription: verified.subscription,
      payment,
      source: "paymentController.verifyPlanSubscription",
    });

    if (result.kind === "reject" || result.kind === "stale_charge") {
      return res.status(400).json({ message: "This payment does not belong to your current subscription." });
    }

    const refreshedUser = await User.findById(req.user._id).select("-password");
    const recurring = publicRecurringState(refreshedUser?.subscription || {});
    const startsAt = verified.subscription.start_at ? new Date(verified.subscription.start_at * 1000) : null;
    const deferred = Boolean(startsAt && startsAt.getTime() - Date.now() > 24 * 60 * 60 * 1000);

    // Not every first payment buys access on the spot: a deferred start only authorises the mandate,
    // and some methods confirm the first charge a little after checkout. The client polls
    // GET /subscriptions/current (which re-syncs from Razorpay) until access lands.
    const activating = result.kind === "pending_capture" || (result.kind === "authorization" && !deferred);

    return res.status(activating ? 202 : 200).json({
      success: true,
      status: result.kind === "charge" ? "active" : deferred ? "scheduled" : "activating",
      message: result.kind === "charge"
        ? "Payment verified. Your plan is active and renews automatically."
        : deferred
          ? "Automatic renewal is set up. Your current plan continues, and the first renewal is charged when it ends."
          : "Payment received. Your plan will activate as soon as Razorpay confirms the first charge.",
      redirectTo: normalizeReturnPath(returnTo) || "",
      recurring,
      access: { hasAccess: result.kind === "charge" || deferred },
      subscription: refreshedUser?.subscription,
      user: refreshedUser?.toObject ? refreshedUser.toObject() : refreshedUser,
    });
  } catch (error) {
    console.error("[plan subscription] verify error:", error);
    return res.status(500).json({ message: error.message || "Payment verification failed" });
  }
};

export const getPlanSubscription = async (req, res) => {
  try {
    const razorpay = await getRazorpayInstance();
    if (razorpay) {
      try {
        await syncRecurringPlan({ razorpay, userId: req.user._id, force: req.query?.refresh === "1" });
      } catch (error) {
        // A sync failure must not hide the state we already have.
        console.error("[plan subscription] sync failed:", error?.error?.description || error?.message || error);
      }
    }
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({
      recurring: publicRecurringState(user.subscription || {}),
      subscription: user.subscription,
      user: user.toObject(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to load the subscription" });
  }
};

export const cancelPlanSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("subscription");
    if (!user) return res.status(404).json({ message: "User not found" });

    const tracked = user.subscription?.recurring || {};
    if (!tracked.razorpaySubscriptionId || !tracked.autoRenew || !RENEWING_STATUSES.includes(tracked.status)) {
      return res.status(400).json({ message: "You don't have a plan that renews automatically." });
    }

    const razorpay = await getRazorpayInstance();
    if (!razorpay) return res.status(503).json({ message: "Razorpay is not configured. Keys are missing." });

    // Cancelled at Razorpay IMMEDIATELY, so no further charge can happen whatever the payment method
    // (UPI mandates do not all support cancel-at-cycle-end). Nothing is refunded and nothing is taken
    // away: the access already paid for runs to accessExpiresAt and then simply lapses.
    let cancelled;
    try {
      cancelled = await razorpay.subscriptions.cancel(String(tracked.razorpaySubscriptionId), false);
    } catch (error) {
      console.error("[plan subscription] cancel failed:", error?.error?.description || error?.message || error);
      return res.status(502).json({ message: "Could not cancel with Razorpay. Please try again or contact support." });
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "subscription.recurring.status": String(cancelled?.status || "cancelled"),
          "subscription.recurring.autoRenew": false,
          "subscription.recurring.cancelAtPeriodEnd": true,
          "subscription.recurring.nextChargeAt": null,
          "subscription.recurring.statusEventAt": new Date(),
        },
      },
    );

    const refreshed = await User.findById(req.user._id).select("-password");
    const endsAt = refreshed?.subscription?.accessExpiresAt || refreshed?.subscription?.expiresAt || null;
    return res.json({
      message: endsAt
        ? `Automatic renewal is off. Your plan stays active until ${new Date(endsAt).toDateString()}.`
        : "Automatic renewal is off.",
      recurring: publicRecurringState(refreshed?.subscription || {}),
      subscription: refreshed?.subscription,
      user: refreshed?.toObject ? refreshed.toObject() : refreshed,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to cancel the subscription" });
  }
};

/**
 * POST /api/webhooks/razorpay — mounted in server.js BEFORE express.json(), because the signature is
 * computed over the raw bytes Razorpay sent and any re-serialisation breaks it.
 *
 * Anything other than a 2xx makes Razorpay retry, which is what we want for a transient failure and
 * exactly what we do NOT want for a forged or malformed request — those get a 400 and are dropped.
 */
export const razorpayWebhook = async (req, res) => {
  if (!String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim()) {
    console.error("[razorpay webhook] RAZORPAY_WEBHOOK_SECRET is not set — delivery refused (Razorpay will retry)");
    return res.status(503).json({ message: "Webhook not configured" });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!verifyRazorpayWebhookSignature({ rawBody, signature: req.get("x-razorpay-signature") })) {
    return res.status(400).json({ message: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ message: "Malformed payload" });
  }

  try {
    const razorpay = await getRazorpayInstance();
    const result = await dispatchRazorpayWebhook(event, { razorpay });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[razorpay webhook] processing failed:", error?.message || error);
    return res.status(500).json({ message: "Processing failed" });
  }
};
