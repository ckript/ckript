/*
 * checkout — the buyer's screenplay purchase, shared by the desktop payment page and the native
 * mobile checkout screen (D30).
 *
 * WHY THIS EXISTS SEPARATELY FROM `projectActions`
 * -----------------------------------------------
 * D29 shared the nine project-detail writes. Payment is not a tenth one. Every other write is a
 * single request whose worst outcome is "it didn't happen"; this one hands the viewer to a
 * third-party overlay OUTSIDE our DOM, takes real money there, and only THEN makes the request
 * that unlocks the screenplay. The failure that matters is the one in between: a charge the
 * gateway completed and a verification our client never delivered. Nothing else on the project
 * surface can fail that way, so it gets its own module rather than a section in a bigger one.
 *
 * SHAPE
 * -----
 * Same envelope as `projectActions` — `{ ok, data }` or `{ ok:false, message, status, flags }` —
 * because the two modules are called from the same screens and a second error convention would be
 * a second thing to remember. `fail` is imported rather than re-declared for the same reason.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No state, no hooks, no router, no `window.location`, no toast. `useProjectCheckout` owns the
 * state; the two screens own the presentation. The one browser dependency this module does keep is
 * `localStorage`, because the pending-charge record has to survive the page that wrote it (below).
 */
import api from "../../services/api";
import { formatCurrency, formatSubunits } from "../../utils/currency";
import { fail, ok } from "./projectActions";
import { fetchTaxConfig } from "../../utils/taxes";

/** Re-exported so the checkout hook needs one import for everything purchase-related. */
export const fetchTaxConfigForCheckout = fetchTaxConfig;

const text = (value) => String(value ?? "").trim();

/**
 * The buyer-side platform fee, mirroring `SCRIPT_PURCHASE_PLATFORM_FEE_RATE` in
 * `server/controllers/scriptController.js`. A FEE, not a tax: taxes (18%) are added on the price plus
 * this fee, and the server's quote (`fetchPurchaseQuote`) is what states them — this client never
 * computes tax.
 *
 * A client copy of a server number is a drift risk, and this one is displayed BEFORE the server is
 * asked anything — the buyer has to see what they will owe before they press a button that opens a
 * payment sheet. So the copy is kept, named after the server constant it mirrors, and
 * `readOrderPricing` below prefers the server's own `pricing` object the moment the order exists,
 * so the estimate is only ever what we PROMISE — the moment there is an authoritative number, the
 * authoritative number is what the screen shows.
 */
export const PLATFORM_FEE_RATE = 0.05;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** The same arithmetic as `getScriptPurchasePricing`, in the same order, so the rounding matches. */
export const getPurchasePricing = (baseAmount) => {
  const base = round2(Math.max(0, Number(baseAmount) || 0));
  const platformFeeAmount = round2(base * PLATFORM_FEE_RATE);
  return {
    baseAmount: base,
    platformFeeRate: PLATFORM_FEE_RATE,
    platformFeePercent: Math.round(PLATFORM_FEE_RATE * 100),
    platformFeeAmount,
    totalAmount: round2(base + platformFeeAmount),
  };
};

/** What this buyer owes for this project, from the approved request's amount or the list price. */
export const getCheckoutPricing = (script = {}) => (
  getPurchasePricing(Number(script?.myPendingRequest?.amount ?? script?.price ?? 0))
);

/** The server's own pricing when the order carries it; the local estimate when it does not. */
export const readOrderPricing = (orderData = {}, fallbackBase = 0) => {
  const pricing = orderData?.pricing;
  if (pricing && Number.isFinite(Number(pricing.totalAmount))) {
    return {
      baseAmount: round2(pricing.baseAmount),
      platformFeeRate: Number(pricing.platformFeeRate ?? PLATFORM_FEE_RATE),
      platformFeePercent: Number(pricing.platformFeePercent ?? Math.round(PLATFORM_FEE_RATE * 100)),
      platformFeeAmount: round2(pricing.platformFeeAmount),
      totalAmount: round2(pricing.totalAmount),
    };
  }
  return getPurchasePricing(fallbackBase);
};

/* ── Money, in the currency the gateway will actually use ──────────────────── */

/**
 * The INR total, formatted.
 *
 * INR is the ledger currency for this transaction on the server: the writer's wallet is credited in
 * rupees and the invoice is written in rupees, whatever the buyer's card was charged in.
 */
export const formatInr = (value) => formatCurrency(Number(value || 0), "INR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * What the gateway is about to charge, in the buyer's currency, read from the created order.
 *
 * DEF-31. The desktop page rendered "Pay ₹X" and then sent no `currency` at all, so the server
 * resolved one from the account (`resolveCurrency(req.body?.currency, req.user.preferredCurrency)`)
 * and could hand Razorpay a USD order — a buyer with a USD preference was promised rupees and
 * charged dollars, with no line of the page ever saying so. Every OTHER checkout in this client
 * (`useWriterPlanCheckout`, `useFilmIndustryProfessionalCheckout`) already sends the currency it
 * displayed. This reads back what the server decided, so the amount on the button and the amount
 * in the sheet are the same statement.
 *
 * `amount` from Razorpay is in SUBUNITS — paise or cents — which is why this formats from
 * `formatSubunits` and not from a major-unit number.
 */
export const describeOrderCharge = (orderData = {}) => {
  const currency = text(orderData?.currency).toUpperCase() || "INR";
  const minor = Number(orderData?.amount || 0);
  return {
    currency,
    amountMinor: minor,
    label: formatSubunits(minor, currency, currency === "INR"
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : {}),
    isForeign: currency !== "INR",
    fxRate: Number(orderData?.fxRate || 0) || null,
    /* The server retries a rejected USD order in INR. When that happened the buyer is charged
       rupees regardless of their preference, and the sheet will say so — this is how the page can
       say it too. */
    fellBackToINR: Boolean(orderData?.fellBackToINR),
  };
};

/* ── Where this buyer stands ───────────────────────────────────────────────── */

export const CHECKOUT_STANDING = Object.freeze({
  OWN_PROJECT: "own-project",
  OWNED: "owned",
  NOT_BUYER: "not-buyer",
  SOLD: "sold",
  NO_REQUEST: "no-request",
  PENDING: "pending",
  EXPIRED: "expired",
  FREE: "free",
  PAYABLE: "payable",
});

const HOUR_MS = 60 * 60 * 1000;

/**
 * How long is left to pay, in the words a buyer needs.
 *
 * The 72-hour window is `getApprovedPaymentDueAt` on the server and it is enforced twice — once
 * when the order is created and once when the payment is verified — with a 410 and a sentence that
 * arrives only after the buyer has already committed to paying. Neither the desktop page nor the
 * project page has ever shown it. A deadline the product enforces and never states is the kind of
 * thing a phone makes unforgivable, because the buyer is usually not at a desk when the 72 hours
 * run out.
 */
export const describePaymentWindow = (dueAt, now = new Date()) => {
  const due = dueAt ? new Date(dueAt) : null;
  if (!due || Number.isNaN(due.getTime())) return { due: null, expired: false, note: "" };

  const msLeft = due.getTime() - new Date(now).getTime();
  const when = due.toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });

  if (msLeft <= 0) return { due, expired: true, hoursLeft: 0, note: `The payment window closed on ${when}.` };

  const hoursLeft = Math.floor(msLeft / HOUR_MS);
  if (hoursLeft < 1) {
    const minutes = Math.max(1, Math.round(msLeft / 60000));
    return { due, expired: false, hoursLeft: 0, note: `Pay by ${when} — ${minutes} minutes left.` };
  }
  if (hoursLeft < 24) {
    return {
      due,
      expired: false,
      hoursLeft,
      note: `Pay by ${when} — ${hoursLeft} ${hoursLeft === 1 ? "hour" : "hours"} left.`,
    };
  }
  const days = Math.floor(hoursLeft / 24);
  return { due, expired: false, hoursLeft, note: `Pay by ${when} — ${days} ${days === 1 ? "day" : "days"} left.` };
};

/**
 * The single answer to "may this person pay for this project right now, and if not, why not".
 *
 * The order of the checks is the SERVER's order (`createScriptPurchaseOrder`), not a convenient
 * one: own project, already bought, sold elsewhere, no request, still pending, window expired,
 * free, payable. A UI that asked them in a different order would offer a Pay button that the
 * server then refuses, which is the one thing a checkout screen must never do.
 *
 * Every standing carries a `headline` and a `note` and only `payable`/`free` carry `canPay`. There
 * is no standing without words: this screen is reached by a link from the project page and from a
 * notification, so the viewer frequently arrives at it in a state where nothing is payable, and
 * "the button is missing" is not an explanation.
 */
export const describeCheckoutStanding = ({ script = null, capabilities = {}, now = new Date() } = {}) => {
  const request = script?.myPendingRequest || null;
  const status = text(request?.status);
  const paid = text(request?.paymentStatus) === "released";
  const pricing = getCheckoutPricing(script || {});

  const base = { canPay: false, pricing, window: describePaymentWindow(request?.paymentDueAt, now) };

  if (capabilities?.owner) {
    return {
      ...base,
      id: CHECKOUT_STANDING.OWN_PROJECT,
      headline: "This is your project",
      note: "You cannot buy your own screenplay. Purchase requests from buyers arrive on the project page.",
    };
  }

  if (script?.isUnlocked || paid) {
    return {
      ...base,
      id: CHECKOUT_STANDING.OWNED,
      headline: "You already bought this project",
      note: "Full access is active, so there is nothing left to pay. Open the project to read the screenplay.",
    };
  }

  if (!capabilities?.industry) {
    return {
      ...base,
      id: CHECKOUT_STANDING.NOT_BUYER,
      headline: "This account cannot buy screenplays",
      note: "Screenplay purchases are made by verified industry accounts — producer, director, investor or studio.",
    };
  }

  if (script?.isSold || text(script?.transactionStatus) === "sold_licensed") {
    return {
      ...base,
      id: CHECKOUT_STANDING.SOLD,
      headline: "This project has been sold",
      note: "The rights went to another buyer, so this payment can no longer be completed.",
    };
  }

  if (!request) {
    return {
      ...base,
      id: CHECKOUT_STANDING.NO_REQUEST,
      headline: "Payment opens after the writer approves you",
      note: "Send a purchase request from the project page first. Once the writer approves it you have 72 hours to pay.",
    };
  }

  if (status === "pending") {
    return {
      ...base,
      id: CHECKOUT_STANDING.PENDING,
      headline: "Your request is with the writer",
      note: "Payment unlocks as soon as they approve it. You will be notified either way.",
    };
  }

  if (base.window.expired) {
    return {
      ...base,
      id: CHECKOUT_STANDING.EXPIRED,
      headline: "The payment window has closed",
      note: `${base.window.note} Send a new purchase request from the project page to start again.`,
    };
  }

  if (pricing.totalAmount <= 0) {
    return {
      ...base,
      canPay: true,
      id: CHECKOUT_STANDING.FREE,
      headline: "This project is free to unlock",
      note: "The writer set no price, so no payment is taken. Accept the terms to confirm and unlock the screenplay.",
    };
  }

  /*
   * The deadline is NOT folded into this note.
   *
   * `window.note` is returned alongside it so each platform prints it exactly once, in the place
   * where it belongs there — beside the amount, which is where the decision is made. Embedding it
   * here as well printed it twice on both platforms, which is how the first sweep of this screen
   * found it.
   */
  return {
    ...base,
    canPay: true,
    id: CHECKOUT_STANDING.PAYABLE,
    headline: "Approved — payment unlocks the screenplay",
    note: "The writer approved your request. Completing payment unlocks the full screenplay.",
  };
};

/* ── The acceptances ───────────────────────────────────────────────────────── */

export const emptyAcceptances = () => ({ platform: false, writer: false, rights: false, custom: false });

/** The writer's own extra conditions, if they wrote any. Empty string means there are none. */
export const readCustomWriterTerms = (script = {}) => text(script?.legal?.customInvestorTerms);

/**
 * What the buyer has not agreed to yet, in the order the form shows the boxes.
 *
 * Returns "" when the order may be created. The server checks all four again — this exists so a
 * missed checkbox costs a sentence rather than a round trip and a generic 400.
 */
export const assertAcceptances = ({ acceptances = {}, script = {} } = {}) => {
  if (!acceptances.platform || !acceptances.writer) {
    return "Accept the Platform and Writer Terms & Conditions before paying.";
  }
  if (!acceptances.rights) return "Accept the rights and licensing summary before paying.";
  if (readCustomWriterTerms(script) && !acceptances.custom) {
    return "Accept the writer's own conditions before paying.";
  }
  return "";
};

/* ── The Razorpay SDK ──────────────────────────────────────────────────────── */

const RAZORPAY_SDK_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/**
 * Load Razorpay's checkout script once, and never throw.
 *
 * Resolves `true` when `window.Razorpay` is usable and `false` when it is not — blocked by an
 * extension, an ad blocker, a corporate proxy or a dead connection. Callers show a sentence; nobody
 * gets a rejected promise, because "the SDK is blocked" is a product state and not an exception.
 *
 * Three copies of this function existed (`ScriptPaymentPage`, `useWriterPlanCheckout`,
 * `useFilmIndustryProfessionalCheckout`) and one of them rejected while the others resolved false.
 * They all target the same `data-razorpay-sdk` element, so they were already sharing a script tag
 * without sharing the code that manages it.
 */
export const loadRazorpaySdk = () => new Promise((resolve) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    resolve(false);
    return;
  }
  if (window.Razorpay) {
    resolve(true);
    return;
  }

  const existing = document.querySelector('script[data-razorpay-sdk="true"]');
  if (existing) {
    existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
    existing.addEventListener("error", () => resolve(false), { once: true });
    return;
  }

  const element = document.createElement("script");
  element.src = RAZORPAY_SDK_SRC;
  element.async = true;
  element.setAttribute("data-razorpay-sdk", "true");
  element.onload = () => resolve(Boolean(window.Razorpay));
  element.onerror = () => resolve(false);
  document.body.appendChild(element);
});

/* ── The three requests ────────────────────────────────────────────────────── */

/**
 * Create the order — which is also where the acceptances are RECORDED.
 *
 * This request is not just "make me an order id". The server writes the buyer's terms acceptance
 * (with the IP, the user agent and a snapshot of the rights terms as they stood) onto the purchase
 * request and generates the acceptance PDF from it. That is why a dismissed payment sheet is not a
 * lost agreement, and why re-creating an order is safe: it re-records the same acceptance.
 */
/**
 * What this purchase costs, from the server: the script price, the platform fee and — when taxes are
 * being charged — "Taxes (18%)" on their sum, with the total the gateway will take. Display only.
 */
export async function fetchPurchaseQuote({ scriptId, currency = "" } = {}) {
  if (!text(scriptId)) return null;
  try {
    const { data } = await api.post("/scripts/purchase/quote", {
      scriptId,
      ...(text(currency) ? { currency: text(currency).toUpperCase() } : {}),
    });
    return data?.breakdown || null;
  } catch {
    return null;
  }
}

export async function createPurchaseOrder({ scriptId, acceptances = {}, script = {}, currency = "", billing = null, saveBilling = false } = {}) {
  if (!text(scriptId)) return { ok: false, status: 0, message: "This project cannot be paid for.", flags: {} };
  const invalid = assertAcceptances({ acceptances, script });
  if (invalid) return { ok: false, status: 0, message: invalid, flags: {} };

  try {
    const { data } = await api.post("/scripts/purchase/create-order", {
      scriptId,
      acceptedPlatformTerms: true,
      acceptedWriterTerms: true,
      acceptedCustomWriterTerms: Boolean(readCustomWriterTerms(script) && acceptances.custom),
      acceptedRightsSummary: true,
      acceptedLegalDisclaimer: true,
      // DEF-31: state the currency instead of letting the account decide one silently.
      ...(text(currency) ? { currency: text(currency).toUpperCase() } : {}),
      // Who the tax invoice is addressed to (only sent when taxes are being charged).
      ...(billing ? { billing, saveBilling: Boolean(saveBilling) } : {}),
    });
    return ok(data);
  } catch (cause) {
    return fail(cause, "Failed to start this payment.");
  }
}

/** Verify a completed Razorpay payment. This is the request that unlocks the screenplay. */
export async function verifyPurchase({ scriptId, payment = {} } = {}) {
  if (!text(scriptId)) return { ok: false, status: 0, message: "This payment cannot be verified.", flags: {} };
  try {
    const { data } = await api.post("/scripts/purchase/verify-payment", {
      scriptId,
      razorpay_order_id: payment.razorpay_order_id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_signature: payment.razorpay_signature,
    });
    if (!data?.success) {
      return { ok: false, status: 0, message: text(data?.message) || "Payment verification failed.", flags: {} };
    }
    return ok(data);
  } catch (cause) {
    return fail(cause, "Payment verification failed.");
  }
}

/** Confirm a zero-price purchase. Same endpoint, no gateway, same unlock. */
export async function confirmFreeAccess({ scriptId } = {}) {
  if (!text(scriptId)) return { ok: false, status: 0, message: "This project cannot be unlocked.", flags: {} };
  try {
    const { data } = await api.post("/scripts/purchase/verify-payment", { scriptId, freeAccess: true });
    if (!data?.success) {
      return { ok: false, status: 0, message: text(data?.message) || "Access confirmation failed.", flags: {} };
    }
    return ok(data);
  } catch (cause) {
    return fail(cause, "Access confirmation failed.");
  }
}

/* ── The two PDFs ──────────────────────────────────────────────────────────── */

/**
 * Fetch a PDF as a blob.
 *
 * Returned rather than opened: a blob URL that one platform opens in a new tab is one a phone's
 * in-app browser may refuse, so who calls `URL.createObjectURL` and what they do with it is the
 * caller's decision. The envelope keeps the failure showable.
 */
const fetchPdfBlob = async (url, params, fallbackMessage) => {
  try {
    const { data } = await api.get(url, { params, responseType: "blob" });
    return ok(new Blob([data], { type: "application/pdf" }));
  } catch (cause) {
    return fail(cause, fallbackMessage);
  }
};

export const fetchInvoicePdf = ({ invoiceId, download = false } = {}) => (
  !text(invoiceId)
    ? Promise.resolve({ ok: false, status: 0, message: "There is no invoice for this purchase yet.", flags: {} })
    : fetchPdfBlob(`/invoices/${invoiceId}/pdf`, download ? { download: 1 } : {}, "Unable to open this invoice right now.")
);

export const fetchAcceptedTermsPdf = ({ purchaseRequestId } = {}) => (
  !text(purchaseRequestId)
    ? Promise.resolve({ ok: false, status: 0, message: "There is no accepted-terms document for this purchase.", flags: {} })
    : fetchPdfBlob(`/scripts/purchase-request/${purchaseRequestId}/acceptance-pdf`, { download: 1 }, "Unable to download the accepted terms right now.")
);

/** A file name a buyer can find again, from a writer-authored title. */
export const purchaseFileName = (title, suffix) => {
  const safe = text(title).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "screenplay";
  return `${safe}_${suffix}.pdf`;
};

/* ── The charge that was taken but never verified ──────────────────────────── */

/*
 * DEF-32.
 *
 * Razorpay's `handler` runs in OUR page after the money has moved. If the verify request that
 * follows it does not arrive — the tab is closed, the phone drops off the network mid-request, the
 * browser evicts a backgrounded tab while the sheet is open — then the buyer has been charged and
 * the server has never been told which payment to check. There is no recovery path from the server
 * side either: verification needs the signature, and the signature exists only in that callback.
 *
 * The old page's whole answer was the sentence "Payment verification failed. Please contact
 * support." So: write the payment down BEFORE verifying, and retry it the next time the buyer
 * opens the checkout. Verification is idempotent by design — the server answers an already-released
 * request with `success: true` and the existing invoice — so a retry that was not needed is
 * harmless, and one that was needed is the difference between an unlocked screenplay and a support
 * ticket.
 *
 * One record, not a queue: a buyer completes one checkout at a time, and a queue would need
 * eviction rules for something that should never hold more than one entry.
 */
const PENDING_CHARGE_KEY = "ckript.pendingScriptCharge";

/** Older than this and it is not worth retrying; the buyer has long since contacted support. */
export const PENDING_CHARGE_TTL_MS = 24 * HOUR_MS;

const storage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Safari in private mode throws on access, not on write.
    return null;
  }
};

export function rememberPendingCharge({ scriptId, userId, title = "", payment = {}, at = Date.now() } = {}) {
  const store = storage();
  if (!store || !text(scriptId) || !text(payment?.razorpay_payment_id)) return false;
  try {
    store.setItem(PENDING_CHARGE_KEY, JSON.stringify({
      scriptId: text(scriptId),
      userId: text(userId),
      title: text(title),
      payment: {
        razorpay_order_id: text(payment.razorpay_order_id),
        razorpay_payment_id: text(payment.razorpay_payment_id),
        razorpay_signature: text(payment.razorpay_signature),
      },
      savedAt: Number(at) || Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * The charge this buyer still owes a verification for — or null.
 *
 * Scoped to BOTH the project and the account: a shared phone must not offer one person's charge to
 * the next person who signs in, and a stale record for another project must not be retried against
 * the one on screen.
 */
export function readPendingCharge({ scriptId, userId, now = Date.now() } = {}) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_CHARGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record?.payment?.razorpay_payment_id) return null;
    if (now - Number(record.savedAt || 0) > PENDING_CHARGE_TTL_MS) {
      store.removeItem(PENDING_CHARGE_KEY);
      return null;
    }
    if (text(scriptId) && record.scriptId !== text(scriptId)) return null;
    if (text(userId) && text(record.userId) && record.userId !== text(userId)) return null;
    return record;
  } catch {
    return null;
  }
}

export function forgetPendingCharge() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PENDING_CHARGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
