/*
 * checkoutModel — what the native checkout screen SAYS (D30).
 *
 * The rules of the purchase live in `pages/script-detail/checkout.js` and are shared with the
 * desktop page. This file is the phone's half: the rows of the amount panel, the rights summary as
 * a definition list rather than a paragraph of bolded fragments, the three terms panels, and the
 * one-line answer to "what is the button called right now".
 *
 * It is separate from the screen for the same reason `projectDetailModel.js` is: these are pure
 * functions over a payload, so the wording of every state is testable without mounting a screen,
 * a router or a payment gateway — and a payment gateway is the one thing this family cannot mount
 * in a test at all.
 */
import {
  CHECKOUT_STANDING,
  formatInr,
} from "../../../../pages/script-detail/checkout";
import { breakdownRows, payLabel } from "../../../../utils/taxes";
import {
  modificationLabel,
  negotiationLabel,
  paymentStructureLabel,
  rightsTypeLabel,
} from "../../../../pages/script-detail/scriptDealLabels";

const text = (value) => String(value ?? "").trim();

/**
 * The amount panel, top to bottom.
 *
 * Three rows and never more: the fee the writer receives, the platform's 5%, and the total. The
 * desktop page prints a fourth line of explanation under them ("Writer receives the full script
 * access fee") which stays as `note` rather than becoming a row, because a phone reading a table of
 * money should be able to find the total by position, not by reading each label.
 */
export const buildAmountRows = (pricing = {}, breakdown = null) => {
  // The server's quote, when there is one: price, platform fee, Taxes (18%), total.
  if (breakdown) {
    return breakdownRows(breakdown).map((row) => ({
      key: row.kind === "line" ? row.key : row.kind,
      label: row.label,
      value: row.value,
      tone: row.kind === "total" ? "total" : "normal",
    }));
  }
  return [
    { key: "base", label: "Script price", value: formatInr(pricing.baseAmount), tone: "normal" },
    {
      key: "fee",
      label: `Platform fee (${Number(pricing.platformFeePercent ?? 5)}%)`,
      value: formatInr(pricing.platformFeeAmount),
      tone: "normal",
    },
    { key: "total", label: "Total payable", value: formatInr(pricing.totalAmount), tone: "total" },
  ];
};

export const AMOUNT_NOTE = "The writer receives the full script price. The platform fee is paid by the buyer on top.";
export const AMOUNT_NOTE_TAXED = "The writer receives the full script price. The platform fee and taxes are paid by the buyer on top.";

/**
 * The line that reconciles what we promised with what the gateway will take.
 *
 * Empty when they are the same statement — which is the common case, and a screen that printed
 * "You will be charged ₹252,000.00" under a total that already says ₹252,000.00 would be noise. It
 * speaks only when the currency differs (DEF-31) or when the server had to fall back to INR after
 * the gateway refused the buyer's currency.
 */
export const describeChargeLine = (charge = null) => {
  if (!charge) return "";
  if (charge.fellBackToINR) {
    return `Your currency was not accepted by the payment provider, so the payment sheet will charge ${charge.label} in Indian rupees.`;
  }
  if (charge.isForeign) {
    return `The payment sheet will charge ${charge.label}, converted from the rupee total above at the provider's rate.`;
  }
  return "";
};

/** The rights the buyer is agreeing to, as rows. Same vocabulary as the project page (DEF-28). */
export const buildRightsRows = (script = {}) => {
  const rights = script?.rightsLicensing || {};
  const months = Number(rights?.timeBound?.licenseDurationMonths || 0);
  const royalty = Number(rights?.royaltySettings?.percentage || 0);

  const rows = [
    { key: "type", label: "Rights type", value: rightsTypeLabel(rights?.rightsType) },
    { key: "modification", label: "Modification rights", value: modificationLabel(rights?.modificationRights) },
    { key: "structure", label: "Payment structure", value: paymentStructureLabel(rights?.paymentStructure) },
    { key: "negotiation", label: "Negotiation", value: negotiationLabel(rights?.negotiationMode) },
    {
      key: "duration",
      label: "License duration",
      value: rights?.rightsType === "exclusive_license"
        ? (months ? `${months} months` : "Time-bound")
        : "Not time-bound",
    },
  ];

  if (royalty > 0) rows.push({ key: "royalty", label: "Royalty", value: `${royalty}%` });
  return rows;
};

export const EXCLUSIVITY_WARNING = "Once this agreement settles, the project cannot be sold to another buyer in parallel.";

/**
 * The documents being accepted, in the order the checkboxes follow.
 *
 * The writer's own conditions are the only optional one, and they are the only one whose text is
 * shown in full: the other two live at their own URLs and open in a new tab, exactly as they do on
 * desktop. A phone cannot show three legal documents inline and stay readable.
 */
export const buildTermsPanels = (script = {}) => {
  const panels = [
    {
      key: "platform",
      title: "Platform Terms & Conditions",
      body: "Platform usage, payment handling and dispute rules apply to this transaction.",
      to: "/terms-of-service",
      linkLabel: "Read the platform terms",
    },
    {
      key: "writer",
      title: "Writer Terms & Conditions",
      body: "Rights transfer and the writer's obligations for approved purchase requests.",
      to: "/terms-conditions?tab=writer",
      linkLabel: "Read the writer terms",
    },
  ];

  const custom = text(script?.legal?.customInvestorTerms);
  if (custom) {
    panels.push({
      key: "custom",
      title: "The writer's own conditions",
      body: custom,
      to: "",
      linkLabel: "",
    });
  }
  return panels;
};

/** The acceptance checkboxes, in DOM order. `custom` appears only when the writer wrote any. */
export const buildAcceptanceRows = (script = {}) => {
  const rows = [
    { key: "platform", label: "I agree to the Platform Terms & Conditions." },
    { key: "writer", label: "I agree to the Writer Terms & Conditions." },
    { key: "rights", label: "I have read and accept the rights and licensing summary above." },
  ];
  if (text(script?.legal?.customInvestorTerms)) {
    rows.push({ key: "custom", label: "I agree to the writer's own conditions shown above." });
  }
  return rows;
};

/**
 * What the one docked control says.
 *
 * `pending` is the gateway's own latency and is a distinct label from `processing`, because "opening
 * the payment sheet" and "confirming your payment" are different waits and a phone that says the
 * wrong one invites a second tap on a live charge.
 */
export const describePayControl = ({ standing = {}, processing = false, recovering = false, breakdown = null } = {}) => {
  if (recovering) return { label: "Finishing your payment…", pending: true };
  if (standing.id === CHECKOUT_STANDING.FREE) {
    return processing
      ? { label: "Unlocking…", pending: true }
      : { label: "Confirm and unlock", pending: false };
  }
  if (processing) return { label: "Opening the payment sheet…", pending: true };
  // The server's total (taxes included) once it is known; the estimate only until then.
  return { label: breakdown ? payLabel(breakdown) : `Pay ${formatInr(standing?.pricing?.totalAmount)}`, pending: false };
};

/**
 * Where the buyer goes when there is nothing to pay here.
 *
 * Every non-payable standing gets a real way forward rather than a back button alone, because most
 * of them are reached by following a link that was correct when it was sent — an approval
 * notification opened three days late lands on `expired`, not on a mistake.
 */
export const describeAlternative = ({ standing = {}, projectPath = "" } = {}) => {
  switch (standing.id) {
    case CHECKOUT_STANDING.OWNED:
      return { label: "Open the screenplay", to: projectPath };
    case CHECKOUT_STANDING.OWN_PROJECT:
      return { label: "Back to your project", to: projectPath };
    case CHECKOUT_STANDING.NO_REQUEST:
    case CHECKOUT_STANDING.EXPIRED:
      return { label: "Go to the project to request access", to: projectPath };
    case CHECKOUT_STANDING.PENDING:
      return { label: "Back to the project", to: projectPath };
    case CHECKOUT_STANDING.SOLD:
    case CHECKOUT_STANDING.NOT_BUYER:
      return { label: "Browse other projects", to: "/search" };
    default:
      return { label: "Back to the project", to: projectPath };
  }
};
