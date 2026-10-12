import { formatCurrency } from "../../utils/currency";
import { Badge, Button, Card, DataTable, SectionHeader, Select, StatusPill } from "../admin/ui";
import {
  DOCUMENT_TYPE_LABEL, INVOICE_KIND_LABEL, money, placeLabel, supplyLabel, taxParts,
} from "./financeFormat";
import "./finance.css";

/**
 * The payment surfaces that moved out of the admin console.
 *
 * Each takes rows plus an `actions` object that is NULL for a finance viewer and populated for an
 * admin. That single prop is what makes one page serve both audiences: the accountant sees the
 * same figures with no way to change them, and the admin sees the controls that used to live in
 * /admin — no duplicate screen to keep in sync.
 *
 * Amounts: the ledger-family endpoints answer in MINOR units and go through `money` (formatSubunits).
 * Transaction.amount is the one MAJOR-unit field left, and goes through `major`.
 */

const major = (v, c) => formatCurrency(v || 0, c || "INR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const dash = <span className="adtb-sub">—</span>;

/** A document number that opens its PDF when the page can open one, plain text otherwise. */
const documentCell = (doc, onOpenPdf) => {
  if (!doc?.number) return dash;
  return onOpenPdf
    ? <button type="button" className="fin-linkbtn" onClick={() => onOpenPdf({ _id: doc._id, invoiceNumber: doc.number }, "open")}>{doc.number}</button>
    : <span className="ckad-mono">{doc.number}</span>;
};

const frame = (title, count, table) => (
  <div>
    <SectionHeader title={title} count={count} />
    <Card flush>{table}</Card>
  </div>
);

/**
 * What each Transaction.type means to someone reading the books.
 *
 * "credit" is the one that matters. It reads like the retired credits feature and is nothing of the
 * sort — scriptController writes it on every sale to credit the writer's wallet ("Script purchase
 * payout", "Earned from script hold"). Showing the raw enum invited exactly that misreading, and
 * acting on it would have meant hiding every payout from the accountant's view. Naming it is the
 * fix; the rows themselves are the payout side of the business and belong here.
 */
const TRANSACTION_TYPE = {
  credit: { label: "Writer payout", tone: "success" },
  debit: { label: "Debit", tone: "danger" },
  payment: { label: "Payment", tone: "success" },
  refund: { label: "Refund", tone: "warn" },
  withdrawal: { label: "Withdrawal", tone: "warn" },
  subscription: { label: "Subscription", tone: "info" },
  bonus: { label: "Bonus", tone: "info" },
  commission: { label: "Commission", tone: "neutral" },
};

const describeType = (type) => TRANSACTION_TYPE[type] || { label: type || "—", tone: "neutral" };

/**
 * Transactions — pure ledger reading, no controls in any role.
 *
 * Taxes come from `metadata.taxMinor` (minor units), which the checkout writes on a buyer's payment
 * once taxes are charged. Older rows and payout rows have none, and read "—" rather than 0.00.
 */
const transactionTax = (t) => {
  const raw = t.metadata?.taxMinor;
  return raw === undefined || raw === null || raw === "" || !Number.isFinite(Number(raw)) ? null : Number(raw);
};

export function PaymentsTable({ rows, total, loading, error, onRetry }) {
  const columns = [
    { key: "user", header: "User", sortable: true, sortValue: (t) => t.user?.name || "", render: (t) => t.user?.name || "—" },
    {
      key: "type",
      header: "Type",
      sortable: true,
      sortValue: (t) => describeType(t.type).label,
      render: (t) => {
        const { label, tone } = describeType(t.type);
        return <Badge tone={tone}>{label}</Badge>;
      },
    },
    { key: "amount", header: "Amount", align: "right", sortable: true, sortValue: (t) => Number(t.amount) || 0, render: (t) => major(t.amount, t.currency) },
    {
      key: "taxes", header: "Taxes", align: "right", sortable: true,
      sortValue: (t) => transactionTax(t) ?? -1,
      render: (t) => (transactionTax(t) === null ? dash : money(transactionTax(t), t.currency)),
    },
    { key: "status", header: "Status", sortable: true, render: (t) => <StatusPill status={t.status} /> },
    { key: "description", header: "Description", hideable: true, render: (t) => t.description || "—" },
    { key: "date", header: "Date", sortable: true, sortValue: (t) => new Date(t.createdAt || 0).getTime(), render: (t) => day(t.createdAt) },
  ];
  return frame("Transactions", total, (
    <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="transactions"
      empty={{ title: "No transactions", body: "Payments appear here as they are captured." }} />
  ));
}

/**
 * Challenge entries, read from the ledger rather than from payments or invoices.
 *
 * That choice is the substance of this table. A challenge is entered three ways — paid on Ckript,
 * granted by an admin, or approved as a third-party registration someone already paid for elsewhere
 * — and only the first writes a Transaction or an Invoice. Built on either of those, this section
 * would report a competition as emptier than it was and would show no cost for the entries given
 * away. The ledger records all three, so `settlement` separates them and `listPriceMinor` states
 * what a granted entry was worth.
 *
 * Amounts are minor units on the wire, converted here rather than server-side: the ledger stores
 * integers precisely so no rounding happens between the payment and the report.
 *
 * Fee and Taxes come from the same entries endpoint as the Overview: the taxable value and taxes of
 * the entry's tax document. An entry paid before taxes were charged has no taxes to split out.
 */
export function ChallengesTable({ rows, total, loading, error, onRetry, onOpenPdf = null }) {
  const SETTLEMENT_TONE = { paid: "success", granted: "info", reversed: "danger" };

  const columns = [
    {
      key: "entrant",
      header: "Entrant",
      sortable: true,
      sortValue: (e) => e.user?.name || "",
      render: (e) => (<>{e.user?.name || "—"}<span className="adtb-sub">{e.user?.email}</span></>),
    },
    {
      key: "challenge",
      header: "Challenge",
      sortable: true,
      sortValue: (e) => e.label || "",
      // `label` is written at capture time, so a renamed or deleted competition still reads back.
      render: (e) => e.label || "—",
    },
    {
      key: "settlement",
      header: "Entry",
      sortable: true,
      render: (e) => <Badge tone={SETTLEMENT_TONE[e.settlement] || "neutral"}>{e.settlement || "—"}</Badge>,
    },
    {
      key: "fee",
      header: "Fee",
      align: "right",
      hideable: true,
      sortable: true,
      sortValue: (e) => Number(e.taxableMinor) || 0,
      render: (e) => (Number(e.amountMinor) && e.supplyType !== "pre_gst" ? money(e.taxableMinor, e.currency) : dash),
    },
    {
      key: "taxes",
      header: "Taxes",
      align: "right",
      sortable: true,
      sortValue: (e) => Number(e.taxMinor) || 0,
      render: (e) => {
        if (!Number(e.amountMinor)) return dash;
        if (e.supplyType === "pre_gst") return <span className="adtb-sub">Before taxes</span>;
        return <span title={taxParts(e, e.currency) || undefined}>{money(e.taxMinor, e.currency)}</span>;
      },
    },
    {
      key: "amount",
      header: "Paid",
      align: "right",
      sortable: true,
      sortValue: (e) => Number(e.amountMinor) || 0,
      // A grant is zero, and showing "—" instead of "0.00" keeps a free entry from reading as a sale
      // of nothing. What it cost is the list price.
      render: (e) => (Number(e.amountMinor) ? money(e.amountMinor, e.currency) : dash),
    },
    {
      key: "listPrice",
      header: "List price",
      align: "right",
      hideable: true,
      sortable: true,
      sortValue: (e) => Number(e.listPriceMinor) || 0,
      render: (e) => (Number(e.listPriceMinor) ? money(e.listPriceMinor, e.currency) : "—"),
    },
    {
      key: "provider",
      header: "Source",
      hideable: true,
      sortValue: (e) => e.provider || "",
      render: (e) => <Badge tone="neutral">{e.provider === "none" ? "grant" : e.provider || "—"}</Badge>,
    },
    {
      key: "document",
      header: "Document",
      sortable: true,
      sortValue: (e) => e.document?.number || "",
      render: (e) => documentCell(e.document, onOpenPdf),
    },
    {
      key: "date",
      header: "Date",
      sortable: true,
      sortValue: (e) => new Date(e.occurredAt || 0).getTime(),
      render: (e) => day(e.occurredAt),
    },
  ];

  return frame("Challenge entries", total, (
    <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="challenge-entries"
      empty={{ title: "No challenge entries", body: "Entries appear here as they are paid or granted." }} />
  ));
}

/**
 * Every document the platform has issued: tax invoices, credit notes, the pre-tax ("Before taxes")
 * invoices, and access confirmations for free access.
 *
 * Statutory columns (place of supply, buyer GSTIN, the CGST/SGST/IGST split) are shown because the CA
 * files from this portal. A credit note's figures are shown NEGATIVE — it takes money and taxes back.
 * A document without a tax snapshot predates taxes and says so instead of showing a zero.
 *
 * `documentType` + `onDocumentTypeChange` drive the server-side filter; FinanceHome owns the value.
 */
const INVOICE_FILTERS = [
  { value: "", label: "All documents" },
  { value: "tax_invoice", label: "Tax invoice" },
  { value: "credit_note", label: "Credit note" },
  { value: "legacy_invoice", label: "Before taxes" },
  { value: "access_confirmation", label: "Access confirmation" },
];

const DOCUMENT_TONE = { tax_invoice: "success", credit_note: "warn", access_confirmation: "info" };

const documentTypeOf = (i) => i.documentType || "legacy_invoice";
const invoiceSign = (i) => (documentTypeOf(i) === "credit_note" ? -1 : 1);

/** No tax snapshot: either free access (nothing charged) or a document from before taxes. */
const untaxedNote = (i) => (documentTypeOf(i) === "access_confirmation" ? "No charge" : "Before taxes");

/** The document's total in minor units: the snapshot's gross, else the legacy major-unit amount. */
const invoiceTotalMinor = (i) => (i.taxTotals
  ? invoiceSign(i) * Math.abs(Number(i.taxTotals.grossMinor) || 0)
  : Math.round((Number(i.amountCharged) || 0) * 100));

export function InvoicesTable({ rows, total, loading, error, onRetry, onOpenPdf, documentType = "", onDocumentTypeChange = null }) {
  const signed = (i, key) => invoiceSign(i) * Math.abs(Number(i.taxTotals?.[key]) || 0);

  const columns = [
    {
      key: "type", header: "Type", sortable: true,
      sortValue: (i) => DOCUMENT_TYPE_LABEL[documentTypeOf(i)] || documentTypeOf(i),
      render: (i) => <Badge tone={DOCUMENT_TONE[documentTypeOf(i)] || "neutral"}>{DOCUMENT_TYPE_LABEL[documentTypeOf(i)] || documentTypeOf(i)}</Badge>,
    },
    {
      key: "invoiceNumber", header: "Number", sortable: true,
      render: (i) => (
        <>
          <span className="ckad-mono">{i.invoiceNumber}</span>
          {i.originalInvoiceNumber ? <span className="adtb-sub">against {i.originalInvoiceNumber}</span> : null}
        </>
      ),
    },
    { key: "date", header: "Date", sortable: true, sortValue: (i) => new Date(i.invoiceDate || i.createdAt || 0).getTime(), render: (i) => day(i.invoiceDate || i.createdAt) },
    {
      key: "buyer", header: "Buyer", sortable: true, sortValue: (i) => i.creator?.name || "",
      render: (i) => (<>{i.creator?.name || "—"}<span className="adtb-sub">{i.creator?.email}</span></>),
    },
    {
      key: "item", header: "For", hideable: true, sortValue: (i) => i.script?.title || INVOICE_KIND_LABEL[i.kind] || "",
      render: (i) => i.script?.title || INVOICE_KIND_LABEL[i.kind] || i.kind || "—",
    },
    {
      key: "pos", header: "Place of supply", hideable: true, sortValue: (i) => placeLabel(i.placeOfSupply),
      render: (i) => (i.taxTotals ? (
        <>
          {placeLabel(i.placeOfSupply)}
          {i.taxSupplyType ? <span className="adtb-sub">{supplyLabel(i.taxSupplyType)}{i.taxGap ? " · back-fill" : ""}</span> : null}
        </>
      ) : dash),
    },
    {
      key: "gstin", header: "Buyer GSTIN", hideable: true, sortValue: (i) => i.buyerBusinessTaxId || "",
      render: (i) => (i.buyerBusinessTaxId ? <span className="ckad-mono">{i.buyerBusinessTaxId}</span> : dash),
    },
    {
      key: "taxable", header: "Taxable", align: "right", sortable: true,
      sortValue: (i) => (i.taxTotals ? signed(i, "taxableMinor") : 0),
      render: (i) => (i.taxTotals ? money(signed(i, "taxableMinor"), i.currency) : <span className="adtb-sub">{untaxedNote(i)}</span>),
    },
    {
      key: "taxes", header: "Taxes", align: "right", sortable: true,
      sortValue: (i) => (i.taxTotals ? signed(i, "taxMinor") : 0),
      render: (i) => {
        if (!i.taxTotals) return <span className="adtb-sub">{untaxedNote(i)}</span>;
        const parts = taxParts({
          cgstMinor: signed(i, "cgstMinor"), sgstMinor: signed(i, "sgstMinor"), igstMinor: signed(i, "igstMinor"),
        }, i.currency);
        return (
          <span title={parts || undefined}>
            {money(signed(i, "taxMinor"), i.currency)}
            {parts ? <span className="adtb-sub">{parts}</span> : null}
          </span>
        );
      },
    },
    {
      key: "total", header: "Total", align: "right", sortable: true,
      sortValue: invoiceTotalMinor,
      render: (i) => money(invoiceTotalMinor(i), i.currency),
    },
    { key: "currency", header: "Currency", sortable: true, render: (i) => i.currency || "INR" },
    ...(onOpenPdf ? [{
      key: "actions", header: "PDF", sortValue: () => "",
      render: (i) => (
        <span className="adtb-rowactions">
          <Button size="sm" variant="ghost" onClick={() => onOpenPdf(i, "open")}>Open</Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenPdf(i, "download")}>Download</Button>
        </span>
      ),
    }] : []),
  ];

  const toolbar = onDocumentTypeChange ? (
    <label className="adf" style={{ minWidth: 0 }}>
      <span className="ckad-sr-only">Document type</span>
      <Select value={documentType} onChange={(e) => onDocumentTypeChange(e.target.value)}>
        {INVOICE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </Select>
    </label>
  ) : null;

  return frame("Invoices", total, (
    <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="invoices" toolbar={toolbar}
      empty={{ title: "No documents", body: documentType ? "Nothing of this type yet." : "Documents appear here as payments are captured." }} />
  ));
}

/**
 * Script purchases, ONE ROW PER SALE. The endpoint answers per script with its `sales` from the
 * ledger, so a script sold twice is two rows here — each with what the buyer paid, the taxes inside
 * it, and the writer's payout. A script unlocked with no ledger sale behind it (older unlocks) is
 * still listed, with its amounts left blank rather than guessed.
 */
const purchaseRows = (scripts) => (scripts || []).flatMap((s) => {
  const sales = Array.isArray(s?.sales) ? s.sales : [];
  if (!sales.length) {
    const buyers = (Array.isArray(s?.unlockedBy) ? s.unlockedBy : []).map((u) => u?.name).filter(Boolean);
    return [{ _id: `${s?._id}-unlock`, script: s, buyer: buyers.join(", "), sale: null }];
  }
  return sales.map((sale, index) => ({ _id: `${s._id}-${index}`, script: s, buyer: sale.buyer, sale }));
});

export function PurchasesTable({ rows, total, loading, error, onRetry }) {
  const saleMoney = (r, key, currency) => (r.sale ? money(r.sale[key], currency || r.sale.currency) : dash);
  const columns = [
    { key: "title", header: "Script", sortable: true, sortValue: (r) => r.script?.title || "", render: (r) => (<>{r.script?.title || "—"}<span className="adtb-sub">SID: {r.script?.sid || "—"}</span></>) },
    { key: "buyer", header: "Buyer", sortable: true, sortValue: (r) => r.buyer || "", render: (r) => r.buyer || "—" },
    { key: "priceAndFee", header: "Price + fee", align: "right", sortable: true, sortValue: (r) => Number(r.sale?.priceAndFeeMinor) || 0, render: (r) => saleMoney(r, "priceAndFeeMinor") },
    {
      key: "taxes", header: "Taxes", align: "right", sortable: true,
      sortValue: (r) => Number(r.sale?.taxMinor) || 0,
      render: (r) => (r.sale && !Number(r.sale.taxMinor) && !r.sale.documentNumber
        ? <span className="adtb-sub">Before taxes</span>
        : saleMoney(r, "taxMinor")),
    },
    { key: "paid", header: "Paid", align: "right", sortable: true, sortValue: (r) => Number(r.sale?.paidMinor) || 0, render: (r) => saleMoney(r, "paidMinor") },
    // Payouts are credited in INR whatever the buyer paid in.
    { key: "payout", header: "Writer payout", align: "right", sortable: true, sortValue: (r) => Number(r.sale?.writerPayoutMinor) || 0, render: (r) => saleMoney(r, "writerPayoutMinor", "INR") },
    { key: "document", header: "Document", sortable: true, sortValue: (r) => r.sale?.documentNumber || "", render: (r) => (r.sale?.documentNumber ? <span className="ckad-mono">{r.sale.documentNumber}</span> : dash) },
    {
      key: "date", header: "Date", sortable: true,
      sortValue: (r) => new Date(r.sale?.paidAt || r.script?.updatedAt || 0).getTime(),
      render: (r) => (r.sale ? day(r.sale.paidAt) : <span className="adtb-sub">No ledger record</span>),
    },
  ];
  return frame("Script purchases", total, (
    <DataTable columns={columns} rows={purchaseRows(rows)} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="purchases" empty={{ title: "No purchases" }} />
  ));
}

/**
 * Consultations — the read side, for the CA. Price is before taxes; the platform fee and the
 * professional's payout are computed from it, so taxes never come out of a payout. Processing a
 * payout or a refund stays in the admin console, so there are no controls here in any role.
 */
const CONSULTATION_TONE = {
  completed: "success", confirmed: "info", pending: "warn", rejected: "danger", cancelled: "danger", refunded: "warn",
};

export function ConsultationsTable({ rows, total, loading, error, onRetry }) {
  const columns = [
    {
      key: "booking", header: "Booking", sortable: true, sortValue: (c) => c.bookingId || "",
      render: (c) => (<><span className="ckad-mono">{c.bookingId || "—"}</span><span className="adtb-sub">{c.writer || "—"} → {c.professional || "—"}</span></>),
    },
    { key: "status", header: "Status", sortable: true, render: (c) => <Badge tone={CONSULTATION_TONE[c.status] || "neutral"}>{String(c.status || "—").replace(/_/g, " ")}</Badge> },
    { key: "price", header: "Price", align: "right", sortable: true, sortValue: (c) => Number(c.priceMinor) || 0, render: (c) => money(c.priceMinor, c.currency) },
    { key: "taxes", header: "Taxes", align: "right", sortable: true, sortValue: (c) => Number(c.taxMinor) || 0, render: (c) => (Number(c.taxMinor) ? money(c.taxMinor, c.currency) : dash) },
    { key: "charged", header: "Charged", align: "right", sortable: true, sortValue: (c) => Number(c.chargedMinor) || 0, render: (c) => money(c.chargedMinor, c.currency) },
    { key: "fee", header: "Platform fee", align: "right", sortable: true, hideable: true, sortValue: (c) => Number(c.platformFeeMinor) || 0, render: (c) => money(c.platformFeeMinor, c.currency) },
    { key: "payout", header: "Professional payout", align: "right", sortable: true, sortValue: (c) => Number(c.payoutMinor) || 0, render: (c) => money(c.payoutMinor, c.currency) },
    {
      key: "payoutStatus", header: "Payout", sortable: true, sortValue: (c) => (c.payoutCompletedAt ? new Date(c.payoutCompletedAt).getTime() : 0),
      render: (c) => (c.payoutCompletedAt
        ? <><Badge tone="success">Paid out</Badge><span className="adtb-sub">{day(c.payoutCompletedAt)}</span></>
        : <Badge tone="warn">Not paid out</Badge>),
    },
    {
      key: "refund", header: "Refund / credit note", align: "right", sortable: true, sortValue: (c) => Number(c.refundMinor) || 0,
      render: (c) => (Number(c.refundMinor) || c.creditNoteNumber ? (
        <>
          {Number(c.refundMinor) ? money(c.refundMinor, c.currency) : "—"}
          {c.creditNoteNumber ? <span className="adtb-sub ckad-mono">{c.creditNoteNumber}</span> : null}
        </>
      ) : dash),
    },
    { key: "invoice", header: "Invoice", hideable: true, sortValue: (c) => c.invoiceNumber || "", render: (c) => (c.invoiceNumber ? <span className="ckad-mono">{c.invoiceNumber}</span> : dash) },
    { key: "paidAt", header: "Paid", sortable: true, sortValue: (c) => new Date(c.paidAt || 0).getTime(), render: (c) => day(c.paidAt) },
  ];
  return frame("Consultations", total, (
    <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="consultations"
      empty={{ title: "No consultations", body: "Paid bookings appear here." }} />
  ));
}

/**
 * Plans — how each paid member is billed: auto-renewing or one-time, whether the last renewal went
 * through, and what the next charge will be (taxes included). A pending or halted renewal is the
 * thing finance has to chase, so it is the loud one.
 */
const PLAN_LABEL = {
  film_industry_professional: "Film industry professional",
  writer_silver: "Writer Silver",
  writer_gold: "Writer Gold",
};
const RENEWAL_TONE = { active: "success", authenticated: "info", pending: "warn", halted: "danger", cancelled: "neutral", completed: "neutral" };

export function PlansTable({ rows, total, loading, error, onRetry }) {
  const columns = [
    { key: "name", header: "Member", sortable: true, render: (u) => (<>{u.name || "—"}<span className="adtb-sub">{u.email}</span></>) },
    { key: "plan", header: "Plan", sortable: true, sortValue: (u) => PLAN_LABEL[u.plan] || u.plan || "", render: (u) => <Badge tone={u.plan === "writer_gold" ? "gold" : "accent"}>{PLAN_LABEL[u.plan] || u.plan || "—"}</Badge> },
    { key: "cycle", header: "Cycle", sortable: true, render: (u) => (u.cycle ? u.cycle.replace(/_/g, " ") : "—") },
    {
      key: "billing", header: "Billing", sortable: true,
      sortValue: (u) => (u.billingMode === "recurring" ? (u.autoRenew ? "Auto-renew" : "Auto-renew off") : "One-time"),
      render: (u) => {
        if (u.billingMode !== "recurring") return <Badge tone="neutral">One-time</Badge>;
        return u.autoRenew ? <Badge tone="info">Auto-renew</Badge> : <Badge tone="neutral">Auto-renew off</Badge>;
      },
    },
    {
      key: "status", header: "Status", sortable: true,
      sortValue: (u) => u.renewalStatus || (u.active ? "active" : "expired"),
      render: (u) => {
        const status = u.renewalStatus || (u.active ? "active" : "expired");
        const tone = RENEWAL_TONE[status] || (u.active ? "success" : "neutral");
        return (
          <>
            <Badge tone={tone}>{status.replace(/_/g, " ")}</Badge>
            {status === "pending" || status === "halted"
              ? <span className="adtb-sub fin-danger-text">Renewal not collected — follow up</span>
              : null}
          </>
        );
      },
    },
    {
      key: "next", header: "Next charge", align: "right", sortable: true,
      sortValue: (u) => new Date(u.nextChargeAt || 0).getTime(),
      render: (u) => (u.nextChargeAt && Number(u.nextChargeMinor) ? (
        <>{money(u.nextChargeMinor, u.currency)}<span className="adtb-sub">{day(u.nextChargeAt)} · incl. taxes</span></>
      ) : dash),
    },
    { key: "last", header: "Last payment", sortable: true, sortValue: (u) => new Date(u.lastChargedAt || 0).getTime(), render: (u) => day(u.lastChargedAt) },
    { key: "ends", header: "Access ends", sortable: true, sortValue: (u) => new Date(u.accessExpiresAt || 0).getTime(), render: (u) => day(u.accessExpiresAt) },
  ];
  return frame("Plans", total, (
    <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="plans"
      empty={{ title: "No paid plans", body: "Members on a paid plan appear here." }} />
  ));
}

/** Premium subscribers. `actions` present only for an admin viewer. */
export function PremiumTable({ rows, total, loading, error, onRetry, actions }) {
  const columns = [
    { key: "name", header: "User", sortable: true, render: (u) => (<>{u.name}<span className="adtb-sub">{u.email}</span></>) },
    { key: "activated", header: "Activated", sortable: true, sortValue: (u) => new Date(u.subscription?.accessActivatedAt || 0).getTime(), render: (u) => day(u.subscription?.accessActivatedAt) },
    { key: "expires", header: "Expires", sortable: true, sortValue: (u) => new Date(u.subscription?.accessExpiresAt || 0).getTime(), render: (u) => day(u.subscription?.accessExpiresAt) },
    { key: "provider", header: "Source", hideable: true, sortValue: (u) => u.subscription?.checkoutProvider || "", render: (u) => <Badge tone="neutral">{u.subscription?.checkoutProvider || "—"}</Badge> },
    ...(actions ? [{
      key: "actions", header: "", sortValue: () => "",
      render: (u) => (
        <span className="adtb-rowactions">
          <Button size="sm" variant="ghost" className="adtb-danger"
            loading={actions.busy === `remove-premium-${u._id}`}
            onClick={() => actions.removePremium(u)}>Remove premium</Button>
        </span>
      ),
    }] : []),
  ];
  return frame("Premium subscribers", total, (
    <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="premium-subscribers" empty={{ title: "No premium subscribers" }} />
  ));
}

export function WriterPlansTable({ rows, total, loading, error, onRetry, actions }) {
  const columns = [
    { key: "name", header: "Writer", sortable: true, render: (u) => (<>{u.name}<span className="adtb-sub">{u.email}</span></>) },
    { key: "plan", header: "Plan", sortable: true, sortValue: (u) => u.subscription?.plan || "", render: (u) => <Badge tone={u.subscription?.plan === "gold" ? "gold" : "accent"}>{u.subscription?.plan || "—"}</Badge> },
    { key: "activated", header: "Activated", sortable: true, sortValue: (u) => new Date(u.subscription?.accessActivatedAt || 0).getTime(), render: (u) => day(u.subscription?.accessActivatedAt) },
    { key: "expires", header: "Expires", sortable: true, sortValue: (u) => new Date(u.subscription?.accessExpiresAt || 0).getTime(), render: (u) => day(u.subscription?.accessExpiresAt) },
    ...(actions ? [{
      key: "actions", header: "", sortValue: () => "",
      render: (u) => (
        <span className="adtb-rowactions">
          <Button size="sm" variant="ghost" loading={actions.busy === `writer-plan-${u._id}`}
            onClick={() => actions.grantWriterPlan(u, "gold")}>Grant gold</Button>
          <Button size="sm" variant="ghost" className="adtb-danger"
            loading={actions.busy === `remove-writer-plan-${u._id}`}
            onClick={() => actions.removeWriterPlan(u)}>Remove</Button>
        </span>
      ),
    }] : []),
  ];
  return frame("Writer plans", total, (
    <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="writer-plans" empty={{ title: "No active writer plans" }} />
  ));
}

export function BankReviewsTable({ rows, total, loading, error, onRetry, actions }) {
  const columns = [
    { key: "user", header: "User", sortable: true, sortValue: (r) => r.user?.name || "", render: (r) => (<>{r.user?.name || "—"}<span className="adtb-sub">{r.user?.email}</span></>) },
    { key: "holder", header: "Account holder", hideable: true, render: (r) => r.bankDetails?.accountHolderName || "—" },
    { key: "status", header: "Status", sortable: true, render: (r) => <StatusPill status={r.status} /> },
    { key: "submitted", header: "Submitted", sortable: true, sortValue: (r) => new Date(r.createdAt || 0).getTime(), render: (r) => day(r.createdAt) },
    ...(actions ? [{
      key: "actions", header: "", sortValue: () => "",
      render: (r) => (
        <span className="adtb-rowactions adtb-rowactions--wrap">
          <Button size="sm" variant="ghost" loading={actions.busy === `bank-approve-${r._id}`} onClick={() => actions.approveBankReview(r)}>Approve</Button>
          <Button size="sm" variant="ghost" className="adtb-danger" loading={actions.busy === `bank-reject-${r._id}`} onClick={() => actions.rejectBankReview(r)}>Reject</Button>
          <Button size="sm" variant="ghost" loading={actions.busy === `bank-unblock-${r._id}`} onClick={() => actions.unblockBankReview(r)}>Unblock</Button>
        </span>
      ),
    }] : []),
  ];
  return frame("Bank detail reviews", total, (
    <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={onRetry}
      search={false} paginate={false} exportName="bank-reviews" empty={{ title: "No bank reviews" }} />
  ));
}
