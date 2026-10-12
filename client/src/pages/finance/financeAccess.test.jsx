// @vitest-environment happy-dom
//
// The contract of the payments move.
//
// Payments left the admin console for /finance, where ONE page serves two audiences: an accountant
// with the finance role reads every figure and can change nothing, while an admin gets the same page
// plus the controls that used to live in /admin. The `actions` prop is the whole mechanism, so these
// tests assert it from both sides — a regression that leaked a control to a read-only viewer would
// otherwise be invisible until an accountant clicked it.
//
// The server is the real boundary (reads are financeOnly, controls stay adminOnly); this file covers
// the half that decides what a viewer is shown.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The sections that load their own data (Overview, Taxes) and FinanceHome read through this client.
// Each test routes it to fixtures by URL; nothing here reaches a network.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("../../services/financeApi", () => ({ default: api }));

const {
  PremiumTable, WriterPlansTable, BankReviewsTable, PaymentsTable, ChallengesTable,
  InvoicesTable, PurchasesTable, ConsultationsTable, PlansTable,
} = await import("./FinanceSections.jsx");
const { longDay, periodOf, toMinorUnits } = await import("./financeFormat.js");
const { ADMIN_NAV_GROUPS } = await import("../admin/shell/adminNavGroups.js");
const { TABS } = await import("../admin/dashboardShared.jsx");

let root;
let host;

const render = (element) => {
  act(() => root.render(element));
  return host.textContent || "";
};

const buttonLabels = () =>
  Array.from(host.querySelectorAll("button")).map((b) => (b.textContent || "").trim());

/** Rows shaped like the API returns them, trimmed to the fields the tables actually read. */
const USER = {
  _id: "u1",
  name: "Rhea Kapoor",
  email: "rhea@example.com",
  subscription: { plan: "gold", accessActivatedAt: "2026-01-05", accessExpiresAt: "2027-01-05" },
};
const REVIEW = { _id: "r1", user: { name: "Rhea Kapoor", email: "rhea@example.com" }, status: "pending", createdAt: "2026-02-01" };

const base = { total: 1, loading: false, error: "", onRetry: () => {} };

// Every control the moved sections used to expose. A finance viewer must see none of them.
const CONTROLS = ["Remove premium", "Grant gold", "Remove", "Approve", "Reject", "Unblock"];

const ACTIONS = {
  busy: "",
  removePremium: () => {},
  grantWriterPlan: () => {},
  removeWriterPlan: () => {},
  approveBankReview: () => {},
  rejectBankReview: () => {},
  unblockBankReview: () => {},
};

beforeEach(() => {
  host = document.createElement("div");
  host.className = "ckad";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("a finance viewer reads without controls", () => {
  it("shows the premium subscriber but offers no way to change them", () => {
    const text = render(<PremiumTable {...base} rows={[USER]} actions={null} />);
    expect(text).toContain("Rhea Kapoor");
    expect(text).toContain("rhea@example.com");
    for (const label of CONTROLS) expect(buttonLabels()).not.toContain(label);
  });

  it("shows writer plans without grant or remove", () => {
    const text = render(<WriterPlansTable {...base} rows={[USER]} actions={null} />);
    expect(text).toContain("gold");
    expect(buttonLabels().some((l) => /grant|remove/i.test(l))).toBe(false);
  });

  it("shows bank reviews without approve, reject or unblock", () => {
    const text = render(<BankReviewsTable {...base} rows={[REVIEW]} actions={null} />);
    expect(text).toContain("Rhea Kapoor");
    expect(buttonLabels().some((l) => /approve|reject|unblock/i.test(l))).toBe(false);
  });
});

describe("an admin gets the same page plus the controls", () => {
  it("offers premium removal", () => {
    render(<PremiumTable {...base} rows={[USER]} actions={ACTIONS} />);
    expect(buttonLabels()).toContain("Remove premium");
  });

  it("offers writer-plan grant and removal", () => {
    render(<WriterPlansTable {...base} rows={[USER]} actions={ACTIONS} />);
    expect(buttonLabels()).toContain("Grant gold");
    expect(buttonLabels()).toContain("Remove");
  });

  it("offers all three bank-review decisions", () => {
    render(<BankReviewsTable {...base} rows={[REVIEW]} actions={ACTIONS} />);
    for (const label of ["Approve", "Reject", "Unblock"]) {
      expect(buttonLabels()).toContain(label);
    }
  });
});

describe("transactions are read-only for everyone", () => {
  it("renders the row and never a control, even for an admin", () => {
    const row = { _id: "t1", user: { name: "Rhea Kapoor" }, type: "credit", amount: 499, currency: "INR", status: "paid", createdAt: "2026-02-02" };
    const text = render(<PaymentsTable {...base} rows={[row]} />);
    expect(text).toContain("Rhea Kapoor");
    expect(buttonLabels().some((l) => CONTROLS.includes(l))).toBe(false);
  });

  it('names a "credit" row as the writer payout it is', () => {
    // The raw enum read like the retired credits feature. It is not: scriptController writes these
    // to credit a writer's wallet on every sale. The misreading nearly got every payout filtered
    // out of the accountant's view, so the label is the guard against repeating that.
    const payout = { _id: "t2", user: { name: "Aarav Sharma" }, type: "credit", amount: 45000, currency: "INR", status: "completed", description: 'Script purchase payout: "The Salt Road"', createdAt: "2026-02-03" };
    const text = render(<PaymentsTable {...base} rows={[payout]} />);
    expect(text).toContain("Writer payout");
    expect(text).not.toMatch(/\bcredit\b/);
  });

  it("still names the types it does not rewrite", () => {
    for (const [type, label] of [["refund", "Refund"], ["commission", "Commission"], ["subscription", "Subscription"]]) {
      const text = render(<PaymentsTable {...base} rows={[{ _id: type, user: { name: "X" }, type, amount: 1, currency: "INR", status: "completed", createdAt: "2026-02-03" }]} />);
      expect(text).toContain(label);
    }
  });

  it("falls back to the raw type rather than blanking an unknown one", () => {
    // A new enum value must still be visible in the books, even before anyone names it here.
    const text = render(<PaymentsTable {...base} rows={[{ _id: "t9", user: { name: "X" }, type: "escrow_hold", amount: 1, currency: "INR", status: "completed", createdAt: "2026-02-03" }]} />);
    expect(text).toContain("escrow_hold");
  });
});

describe("challenge entries come from the ledger, so free entries are visible", () => {
  // The point of sourcing this from LedgerEntry rather than Transaction or Invoice: an entry granted
  // by an admin, or approved from a third-party registration, writes neither of those. Built on
  // payments alone the section would report a competition as emptier than it was.
  const paid = {
    _id: "l1", user: { name: "Aarav Sharma", email: "aarav@example.in" },
    label: "48-Hour Script Challenge", settlement: "paid", provider: "razorpay",
    amountMinor: 9900, listPriceMinor: 9900, currency: "INR", occurredAt: "2026-02-04",
  };
  const granted = {
    _id: "l2", user: { name: "Rhea Kapoor", email: "rhea@example.in" },
    label: "48-Hour Script Challenge", settlement: "granted", provider: "none",
    amountMinor: 0, listPriceMinor: 9900, currency: "INR", occurredAt: "2026-02-05",
  };

  it("shows a paid entry with what was charged", () => {
    const text = render(<ChallengesTable {...base} rows={[paid]} />);
    expect(text).toContain("Aarav Sharma");
    expect(text).toContain("48-Hour Script Challenge");
    expect(text).toContain("paid");
  });

  it("shows a granted entry, and states what it was worth rather than charging nothing", () => {
    const text = render(<ChallengesTable {...base} total={1} rows={[granted]} />);
    expect(text).toContain("Rhea Kapoor");
    expect(text).toContain("granted");
    // Zero charged must not read as a sale of nothing; the list price is what it cost the business.
    expect(text).toMatch(/99/);
  });

  it("offers no controls — an accountant reads challenge entries, never edits them", () => {
    render(<ChallengesTable {...base} rows={[paid, granted]} />);
    expect(buttonLabels().some((l) => CONTROLS.includes(l))).toBe(false);
  });
});

describe("payments have left the admin console", () => {
  const MOVED = ["payments", "invoices", "investor-purchases", "writer-plans", "premium-professionals", "bank-reviews"];

  it("defines no tab for a moved section", () => {
    const keys = TABS.map((tab) => tab.key);
    for (const key of MOVED) expect(keys).not.toContain(key);
  });

  it("routes no sidebar group at a moved section", () => {
    const keys = ADMIN_NAV_GROUPS.flatMap((group) => group.keys);
    for (const key of MOVED) expect(keys).not.toContain(key);
  });

  it("keeps every surviving nav key backed by a real tab", () => {
    const tabKeys = new Set(TABS.map((tab) => tab.key));
    for (const group of ADMIN_NAV_GROUPS) {
      for (const key of group.keys) expect(tabKeys.has(key)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Taxes. Every payment now carries 18% taxes, and the portal grew three tabs (Taxes, Consultations,
// Plans) plus three admin-only tax controls: Refund (Overview), Issue back-fill invoices and the
// period lock (Taxes). The same rule holds: the finance role sees every figure and none of those
// controls; an admin sees them. And INR and USD are never added together, anywhere.
// ─────────────────────────────────────────────────────────────────────────────

/** Let the mocked requests resolve and React commit what they set. */
const flush = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};

const renderAsync = async (element) => {
  await act(async () => root.render(element));
  await flush();
  return host.textContent || "";
};

/** Everything on the page, portals (dialogs) included. */
const pageText = () => document.body.textContent || "";

/** Set a controlled input's value the way a user would, so React's onChange fires. */
const typeInto = (element, value) => {
  const proto = element.tagName === "SELECT" ? HTMLSelectElement.prototype
    : element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
};

const clickButton = (label, scope = document.body) => {
  const button = Array.from(scope.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === label);
  if (!button) throw new Error(`No button "${label}"`);
  act(() => button.click());
  return button;
};

// Every tax control. A finance viewer must see none of them; an admin sees them all.
const TAX_CONTROL = /^(refund|issue back-fill invoices|lock \d{4}-\d{2})$/i;
const taxControls = () => buttonLabels().filter((l) => TAX_CONTROL.test(l));

const TAX_ACTIONS = {
  ...ACTIONS,
  refundPayment: vi.fn(async () => ({ amountMinor: 25050, currency: "INR" })),
  issueGapInvoices: vi.fn(async () => ({ issued: [], failed: [] })),
  lockTaxPeriod: vi.fn(async () => ({})),
};

const LIABILITY_FROM = "2026-10-03T18:30:00.000Z";
const INVOICE_BY = "2026-11-03T18:29:59.000Z";
const RETURN_DUE = "2026-11-11T18:29:59.000Z";

const PAID_ENTRY = {
  _id: "le1", occurredAt: "2026-10-06T10:00:00.000Z", kind: "plan_subscription", label: "Writer Gold · monthly",
  user: { name: "Rhea Kapoor", email: "rhea@example.in" }, settlement: "paid", provider: "razorpay",
  currency: "INR", amountMinor: 118000, listPriceMinor: 100000,
  taxableMinor: 100000, taxMinor: 18000, cgstMinor: 9000, sgstMinor: 9000, igstMinor: 0,
  supplyType: "intra", gap: false, placeOfSupply: "07", businessTaxId: "", sac: "998439",
  document: { _id: "inv1", number: "CK/26-27/0001", type: "tax_invoice", date: "2026-10-06" },
  providerPaymentId: "pay_INR1",
};
const GAP_ENTRY = {
  ...PAID_ENTRY, _id: "le2", currency: "USD", amountMinor: 2360, taxableMinor: 2000, taxMinor: 360,
  cgstMinor: 0, sgstMinor: 0, igstMinor: 360, supplyType: "export_igst", gap: true, placeOfSupply: "US",
  document: null, providerPaymentId: "pay_USD1",
};
const GRANT_ENTRY = {
  ...PAID_ENTRY, _id: "le3", settlement: "granted", provider: "none", amountMinor: 0, taxableMinor: 0, taxMinor: 0,
  cgstMinor: 0, sgstMinor: 0, supplyType: "no_consideration", document: null, providerPaymentId: "",
};

const FIXTURES = {
  "/finance/summary": {
    currencies: [
      {
        currency: "INR", netMinor: 1062000, grossMinor: 1180000, refundedMinor: -118000, taxMinor: 162000,
        revenueExTaxMinor: 900000, taxBreakdown: { cgstMinor: 54000, sgstMinor: 54000, igstMinor: 54000, gapTaxMinor: 0 },
        taxDocuments: { invoices: 9, creditNotes: 1 }, payoutMinor: 300000, gatewayFeeMinor: 0, gatewayTaxMinor: 0,
        payments: 10, refunds: 1,
      },
      {
        currency: "USD", netMinor: 23600, grossMinor: 23600, refundedMinor: 0, taxMinor: 3600,
        revenueExTaxMinor: 20000, taxBreakdown: { cgstMinor: 0, sgstMinor: 0, igstMinor: 3600, gapTaxMinor: 0 },
        taxDocuments: { invoices: 2, creditNotes: 0 }, payoutMinor: 0, gatewayFeeMinor: 0, gatewayTaxMinor: 0,
        payments: 2, refunds: 0,
      },
    ],
    byKind: [
      { kind: "consultation", currency: "INR", netMinor: 590000, taxMinor: 90000, revenueExTaxMinor: 500000, payoutMinor: 0, count: 5 },
      { kind: "consultation", currency: "USD", netMinor: 23600, taxMinor: 3600, revenueExTaxMinor: 20000, payoutMinor: 0, count: 2 },
    ],
    grants: [],
  },
  "/finance/entries": { entries: [PAID_ENTRY, GAP_ENTRY, GRANT_ENTRY], page: 1, limit: 50, total: 3, pages: 1 },
  "/finance/taxes/summary": {
    period: "2026-10", currency: "INR",
    totals: { taxableMinor: 1000000, cgstMinor: 45000, sgstMinor: 45000, igstMinor: 90000, taxMinor: 180000, grossMinor: 1180000 },
    counts: { invoices: 12, creditNotes: 1, exports: 2, gapInvoices: 3 },
    locked: false, lockedAt: null, chargingEnabled: false, liabilityFrom: LIABILITY_FROM,
  },
  "/finance/taxes/gstr1": {
    period: "2026-10",
    tables: { b2b: [{}], b2cl: [], b2cs: [{}, {}], exp: [{}], cdnr: [], cdnur: [], hsn: [{}], docs: [{}] },
  },
  "/finance/taxes/gstr3b": {
    period: "2026-10",
    tables: {
      "3.1(a) Outward taxable supplies (other than zero rated, nil rated and exempted)": { taxable: 800000, igst: 54000, cgst: 45000, sgst: 45000, cess: 0 },
      "3.1(b) Outward taxable supplies (zero rated)": { taxable: 200000, igst: 36000, cgst: 0, sgst: 0, cess: 0 },
      "3.1(c) Other outward supplies (nil rated, exempted)": { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
      "3.2 Inter-state supplies to unregistered persons": [{ placeOfSupply: "27-Maharashtra", taxable: 300000, igst: 54000 }],
    },
  },
  "/finance/taxes/register": {
    period: "2026-10",
    rows: [
      {
        _id: "inv1", number: "CK/26-27/0001", type: "tax_invoice", date: "2026-10-06", buyer: "Rhea Kapoor", email: "rhea@example.in",
        businessTaxId: "07AAACB1234C1Z5", placeOfSupply: "07", supplyType: "intra", gap: false, currency: "INR",
        taxableMinor: 100000, taxMinor: 18000, cgstMinor: 9000, sgstMinor: 9000, igstMinor: 0, grossMinor: 118000,
        inrTaxableMinor: 100000, inrTaxMinor: 18000, against: "", paymentId: "pay_INR1",
      },
      {
        _id: "inv2", number: "CK/26-27/0002", type: "tax_invoice", date: "2026-10-07", buyer: "Sam Lee", email: "sam@example.com",
        businessTaxId: "", placeOfSupply: "US", supplyType: "export_igst", gap: false, currency: "USD",
        taxableMinor: 2000, taxMinor: 360, cgstMinor: 0, sgstMinor: 0, igstMinor: 360, grossMinor: 2360,
        inrTaxableMinor: 168000, inrTaxMinor: 30240, against: "", paymentId: "pay_USD2",
      },
    ],
  },
  "/finance/taxes/review": { rows: [] },
  "/finance/taxes/reconciliation": {
    period: "2026-10", payments: 14, documented: 13,
    missing: [{
      ledgerEntryId: "le9", paidAt: "2026-10-08", kind: "ai_trailer", label: "AI trailer", buyer: "Dev Mehta",
      currency: "INR", amountMinor: 59000, paymentId: "pay_MISSING", reason: "Tax invoice not issued",
    }],
    unbooked: [],
    gatewayFees: { INR: { feeMinor: 236000, feeTaxMinor: 42480 }, USD: { feeMinor: 1500, feeTaxMinor: 270 } },
  },
  "/finance/taxes/gap": {
    liabilityFrom: LIABILITY_FROM,
    deadlines: { invoiceBy: INVOICE_BY, returnDue: RETURN_DUE },
    count: 2,
    rows: [
      {
        ledgerEntryId: "le20", paidAt: "2026-10-05", kind: "plan_subscription", label: "Writer Gold", buyer: "Rhea Kapoor",
        email: "rhea@example.in", currency: "INR", paidMinor: 118000, taxableMinor: 100000, taxMinor: 18000,
        cgstMinor: 9000, sgstMinor: 9000, igstMinor: 0, supplyType: "intra", placeOfSupply: "07", paymentId: "pay_G1",
      },
      {
        ledgerEntryId: "le21", paidAt: "2026-10-06", kind: "script_purchase", label: "The Salt Road", buyer: "Sam Lee",
        email: "sam@example.com", currency: "USD", paidMinor: 2360, taxableMinor: 2000, taxMinor: 360,
        cgstMinor: 0, sgstMinor: 0, igstMinor: 360, supplyType: "export_igst", placeOfSupply: "US", paymentId: "pay_G2",
      },
    ],
  },
};

const respond = (url) => Promise.resolve({ data: FIXTURES[url] ?? {} });

describe("the new tabs, from both sides", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.get.mockImplementation(respond);
    for (const fn of ["refundPayment", "issueGapInvoices", "lockTaxPeriod"]) TAX_ACTIONS[fn].mockClear();
  });

  it("Overview: a finance viewer sees taxes on every entry and no Refund", async () => {
    const { default: LedgerSection } = await import("./LedgerSection.jsx");
    const text = await renderAsync(<LedgerSection actions={null} onOpenPdf={() => {}} />);
    expect(text).toContain("Taxes collected · INR");
    expect(text).toContain("Delhi (CGST+SGST)");
    expect(text).toContain("Export (IGST)");
    expect(text).toContain("back-fill");
    expect(text).toContain("CK/26-27/0001");
    expect(taxControls()).toEqual([]);
  });

  it("Overview: an admin gets Refund on paid rows only, and it posts minor units", async () => {
    const { default: LedgerSection } = await import("./LedgerSection.jsx");
    await renderAsync(<LedgerSection actions={TAX_ACTIONS} onOpenPdf={() => {}} />);
    // Two paid rows (INR + USD); the grant has nothing to refund.
    expect(buttonLabels().filter((l) => l === "Refund")).toHaveLength(2);

    clickButton("Refund");
    expect(pageText()).toContain("including taxes");
    expect(pageText()).toContain("credit note");

    const dialog = document.querySelector("[role='dialog']");
    typeInto(dialog.querySelector("input"), "250.5");
    typeInto(dialog.querySelector("textarea"), "Duplicate charge");
    await act(async () => { clickButton("Refund", dialog); });
    await flush();
    expect(TAX_ACTIONS.refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "le1" }),
      { amountMinor: 25050, reason: "Duplicate charge" },
    );
  });

  it("Overview: INR and USD are separate cards and never one total", async () => {
    const { default: LedgerSection } = await import("./LedgerSection.jsx");
    const text = await renderAsync(<LedgerSection actions={null} />);
    expect(text).toContain("Collected · INR");
    expect(text).toContain("Collected · USD");
    expect(text).toContain("₹11,800.00");
    expect(text).toContain("$236.00");
    // 1,180,000 + 23,600 minor — the figure a summed card would print, in either currency.
    expect(text).not.toMatch(/12,036\.00/);
    expect(text).not.toMatch(/1,656\.00/);
    // Payouts are an INR figure and appear once, on the INR group.
    expect(text).toContain("Payouts to creators · INR");
    expect(text).not.toContain("Payouts to creators · on USD sales");
  });

  it("Taxes: a finance viewer sees the returns and no issue or lock control", async () => {
    const { default: TaxesSection } = await import("./TaxesSection.jsx");
    const text = await renderAsync(<TaxesSection actions={null} onOpenPdf={() => {}} />);
    expect(text).toContain("GSTR-1");
    expect(text).toContain("GSTR-3B");
    expect(text).toContain("Back-fill");
    expect(taxControls()).toEqual([]);
    expect(buttonLabels().some((l) => /issue|lock/i.test(l))).toBe(false);
  });

  it("Taxes: an admin gets Issue back-fill invoices (typed ISSUE) and the period lock", async () => {
    const { default: TaxesSection } = await import("./TaxesSection.jsx");
    await renderAsync(<TaxesSection actions={TAX_ACTIONS} onOpenPdf={() => {}} />);
    expect(buttonLabels()).toContain("Issue back-fill invoices");
    expect(buttonLabels().some((l) => /^Lock \d{4}-\d{2}$/.test(l))).toBe(true);

    clickButton("Issue back-fill invoices");
    const dialog = document.querySelector("[role='dialog']");
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent.trim() === "Issue invoices");
    expect(confirm.disabled).toBe(true);
    typeInto(dialog.querySelector("input[type='text'], input:not([type])"), "ISSUE");
    act(() => dialog.querySelector("input[type='checkbox']").click());
    expect(confirm.disabled).toBe(false);
    await act(async () => { confirm.click(); });
    await flush();
    expect(TAX_ACTIONS.issueGapInvoices).toHaveBeenCalledWith({ notify: true });
  });

  it("Taxes: only a month that has ended can be locked", async () => {
    const { default: TaxesSection } = await import("./TaxesSection.jsx");
    await renderAsync(<TaxesSection actions={TAX_ACTIONS} />);
    const lockButton = () => Array.from(host.querySelectorAll("button")).find((b) => /^Lock \d{4}-\d{2}$/.test(b.textContent.trim()));
    expect(lockButton().disabled).toBe(true);   // the current month is still open for business

    const now = new Date();
    const lastMonth = periodOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    typeInto(host.querySelector("input[type='month']"), lastMonth);
    await flush();
    expect(lockButton().textContent.trim()).toBe(`Lock ${lastMonth}`);
    expect(lockButton().disabled).toBe(false);
    expect(api.get).toHaveBeenCalledWith("/finance/taxes/summary", { params: { period: lastMonth } });
  });

  it("Consultations and Plans: read-only in every role", () => {
    const consultation = {
      _id: "c1", bookingId: "CB-1001", writer: "Rhea Kapoor", professional: "Dev Mehta", status: "completed",
      currency: "INR", priceMinor: 100000, taxMinor: 18000, chargedMinor: 118000, platformFeeMinor: 10000,
      payoutMinor: 90000, refundMinor: 0, invoiceNumber: "CK/26-27/0003", creditNoteNumber: "", paidAt: "2026-10-04",
    };
    let text = render(<ConsultationsTable {...base} rows={[consultation]} />);
    expect(text).toContain("CB-1001");
    expect(text).toContain("₹180.00");
    expect(text).toContain("₹900.00");
    expect(taxControls()).toEqual([]);

    const member = {
      _id: "p1", name: "Rhea Kapoor", email: "rhea@example.in", plan: "writer_gold", cycle: "monthly",
      billingMode: "recurring", renewalStatus: "halted", autoRenew: true, nextChargeAt: "2026-11-05",
      nextChargeMinor: 118000, currency: "INR", lastChargedAt: "2026-10-05", accessExpiresAt: "2026-11-05", active: true,
    };
    text = render(<PlansTable {...base} rows={[member]} />);
    expect(text).toContain("Writer Gold");
    expect(text).toContain("Auto-renew");
    expect(text).toContain("halted");
    expect(text).toContain("incl. taxes");
    expect(taxControls()).toEqual([]);
  });
});

describe("the Taxes tab, rendered from the API", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.get.mockImplementation(respond);
  });

  it("never sums INR and USD, and the gap panel states the deadline", async () => {
    const { default: TaxesSection } = await import("./TaxesSection.jsx");
    const text = await renderAsync(<TaxesSection actions={null} onOpenPdf={() => {}} />);

    // The gap deadline the CA has to meet, spelled out.
    expect(text).toContain(`Issue by ${longDay(INVOICE_BY)}`);
    expect(text).toContain(longDay(RETURN_DUE));

    // Gap taxes: one figure per currency, never their sum (18,000 + 360 minor).
    expect(text).toContain("₹180.00 (INR)");
    expect(text).toContain("$3.60 (USD)");
    expect(text).not.toMatch(/183\.60/);

    // Gateway fees: per currency (236,000 + 1,500 minor would read 2,375.00).
    expect(text).toContain("₹2,360.00");
    expect(text).toContain("$15.00");
    expect(text).not.toMatch(/2,375\.00/);

    // The register keeps each row in its own currency, with the USD row's INR filing value beside it.
    expect(text).toContain("$23.60");
    expect(text).toContain("₹1,680.00");
    expect(text).not.toMatch(/1,203\.60|1,180\.23/);
  });

  it("shows the summary, the returns, reconciliation and the charging note", async () => {
    const { default: TaxesSection } = await import("./TaxesSection.jsx");
    const text = await renderAsync(<TaxesSection actions={null} />);

    expect(text).toContain("Taxes are not being charged at checkout yet (GST_ENABLED is off)");
    expect(text).toContain("Taxes collected · INR");
    expect(text).toContain("₹1,800.00");
    expect(text).toContain("CGST ₹450.00 · SGST ₹450.00 · IGST ₹900.00");

    for (const table of ["b2b", "b2cl", "b2cs", "exp", "cdnr", "cdnur", "hsn", "docs"]) {
      expect(buttonLabels()).toContain(`Download ${table}.csv`);
    }

    expect(text).toContain("3.1(b) Outward taxable supplies (zero rated)");
    expect(text).toContain("27-Maharashtra");

    // Reconciliation's target is zero; one capture without its invoice must be loud.
    expect(text).toContain("1 without a document");
    expect(host.querySelector(".fin-danger-text")?.textContent).toBeTruthy();
    expect(text).toContain("pay_MISSING");
  });

  it("downloads filed data from the server, never the client table export", async () => {
    const { default: TaxesSection } = await import("./TaxesSection.jsx");
    await renderAsync(<TaxesSection actions={null} />);
    const createUrl = vi.fn(() => "blob:x");
    const revokeUrl = vi.fn();
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    // The download anchor's click would ask the test DOM to navigate to a blob URL.
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await act(async () => { clickButton("Download b2cs.csv"); });
      await flush();
      expect(api.get).toHaveBeenCalledWith(
        "/finance/taxes/gstr1",
        expect.objectContaining({ params: expect.objectContaining({ table: "b2cs", format: "csv" }), responseType: "blob" }),
      );
      expect(anchorClick).toHaveBeenCalled();
    } finally {
      anchorClick.mockRestore();
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });
});

describe("documents carry their taxes", () => {
  it("shows a tax invoice's split, a credit note as negative, and a legacy invoice as before taxes", () => {
    const invoice = {
      _id: "i1", invoiceNumber: "CK/26-27/0001", invoiceDate: "2026-10-06", documentType: "tax_invoice", currency: "INR",
      amountCharged: 1180, taxTotals: { taxableMinor: 100000, taxMinor: 18000, cgstMinor: 0, sgstMinor: 0, igstMinor: 18000, grossMinor: 118000 },
      taxSupplyType: "inter", placeOfSupply: { country: "IN", stateCode: "27", stateName: "Maharashtra" },
      buyerBusinessTaxId: "27AAACB1234C1Z5", creator: { name: "Rhea Kapoor", email: "rhea@example.in" },
    };
    const credit = {
      ...invoice, _id: "i2", invoiceNumber: "CK/CN/26-27/0001", documentType: "credit_note", amountCharged: -1180,
      originalInvoiceNumber: "CK/26-27/0001",
    };
    const legacy = { _id: "i3", invoiceNumber: "INV-OLD-1", invoiceDate: "2026-09-01", documentType: "legacy_invoice", currency: "INR", amountCharged: 499, creator: { name: "Old Buyer" } };
    const text = render(<InvoicesTable {...base} rows={[invoice, credit, legacy]} onOpenPdf={() => {}} />);
    expect(text).toContain("Tax invoice");
    expect(text).toContain("27-Maharashtra");
    expect(text).toContain("27AAACB1234C1Z5");
    expect(text).toContain("IGST ₹180.00");
    expect(text).toMatch(/-₹1,180\.00|−₹1,180\.00|₹-1,180\.00/);
    expect(text).toContain("against CK/26-27/0001");
    expect(text).toContain("Before taxes");
    expect(text).toContain("₹499.00");
  });

  it("filters by document type through the server", () => {
    const onChange = vi.fn();
    render(<InvoicesTable {...base} rows={[]} documentType="" onDocumentTypeChange={onChange} />);
    const select = host.querySelector("select");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(
      ["All documents", "Tax invoice", "Credit note", "Before taxes", "Access confirmation"],
    );
    act(() => typeInto(select, "credit_note"));
    expect(onChange).toHaveBeenCalledWith("credit_note");
  });

  it("lists script purchases one row per sale, with taxes and the writer payout", () => {
    const script = {
      _id: "s1", title: "The Salt Road", sid: "SC-1",
      sales: [
        { buyer: "Aarav Sharma", paidAt: "2026-10-06", currency: "INR", paidMinor: 59000, taxMinor: 9000, priceAndFeeMinor: 50000, writerPayoutMinor: 45000, documentNumber: "CK/26-27/0004" },
        { buyer: "Sam Lee", paidAt: "2026-10-07", currency: "USD", paidMinor: 1180, taxMinor: 180, priceAndFeeMinor: 1000, writerPayoutMinor: 76000, documentNumber: "CK/26-27/0005" },
      ],
    };
    const text = render(<PurchasesTable {...base} rows={[script]} />);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(text).toContain("₹90.00");
    expect(text).toContain("$1.80");
    // Writer payouts are credited in INR, even on a USD sale.
    expect(text).toContain("₹760.00");
    expect(text).toContain("CK/26-27/0005");
  });

  it("shows taxes on a transaction only when the checkout recorded them", () => {
    const withTax = { _id: "t1", user: { name: "Rhea Kapoor" }, type: "payment", amount: 1180, currency: "INR", status: "completed", metadata: { taxMinor: 18000 }, createdAt: "2026-10-06" };
    const without = { _id: "t2", user: { name: "Old Row" }, type: "payment", amount: 499, currency: "INR", status: "completed", createdAt: "2026-09-01" };
    const text = render(<PaymentsTable {...base} rows={[withTax, without]} />);
    expect(text).toContain("₹180.00");
  });
});

describe("FinanceHome lists the new tabs for both roles", () => {
  const renderHome = async (user) => {
    const [{ default: FinanceHome }, { AuthContext }] = await Promise.all([
      import("./FinanceHome.jsx"),
      import("../../context/AuthContext"),
    ]);
    await renderAsync(
      <AuthContext.Provider value={{ user }}>
        <FinanceHome />
      </AuthContext.Provider>,
    );
  };

  const navTo = async (label) => {
    const item = Array.from(host.querySelectorAll(".adsh-side .adsh-item")).find((b) => b.textContent.trim() === label);
    if (!item) throw new Error(`No nav item "${label}"`);
    act(() => item.click());
    await flush();
  };

  const navLabels = () => Array.from(host.querySelectorAll(".adsh-side .adsh-item")).map((b) => b.textContent.trim());

  beforeEach(() => {
    sessionStorage.clear();
    api.get.mockReset();
    api.get.mockImplementation(respond);
  });

  afterEach(() => sessionStorage.clear());

  it("finance: Taxes, Consultations and Plans are there, with no tax control anywhere", async () => {
    await renderHome({ role: "finance", name: "Dev Mehta", email: "dev@example.in" });
    for (const label of ["Taxes", "Consultations", "Plans"]) expect(navLabels()).toContain(label);

    expect(taxControls()).toEqual([]);           // Overview: no Refund
    await navTo("Taxes");
    expect(host.textContent).toContain("GSTR-1");
    expect(taxControls()).toEqual([]);           // no Issue, no Lock
    await navTo("Consultations");
    expect(taxControls()).toEqual([]);
    await navTo("Plans");
    expect(taxControls()).toEqual([]);
  }, 60000);

  it("admin: the same tabs, plus Refund, Issue back-fill invoices and the period lock", async () => {
    sessionStorage.setItem("admin-session", JSON.stringify({ token: "t", role: "admin", name: "Ckript Admin" }));
    await renderHome({ role: "writer", name: "Someone Else" });
    for (const label of ["Taxes", "Consultations", "Plans"]) expect(navLabels()).toContain(label);

    expect(buttonLabels()).toContain("Refund");
    await navTo("Taxes");
    expect(buttonLabels()).toContain("Issue back-fill invoices");
    expect(buttonLabels().some((l) => /^Lock \d{4}-\d{2}$/.test(l))).toBe(true);
  }, 60000);
});

describe("amounts typed into a dialog become minor units without floats", () => {
  it("parses major-unit text exactly", () => {
    expect(toMinorUnits("250.5")).toBe(25050);
    expect(toMinorUnits("0.1")).toBe(10);
    expect(toMinorUnits("1,180.00")).toBe(118000);
    expect(toMinorUnits("19.99")).toBe(1999);
    for (const bad of ["", "abc", "-5", "1.234", "0", "0.00"]) expect(toMinorUnits(bad)).toBe(null);
  });
});
