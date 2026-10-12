import { useState } from "react";
import {
  Badge, Button, Card, DataTable, ErrorState, SectionHeader, SkeletonText,
} from "../admin/ui";
import { downloadCsv, useFinanceGet } from "./financeIO";
import { IssueGapDialog, LockPeriodDialog } from "./financeDialogs";
import {
  KIND_LABEL, day, longDay, money, periodOf, placeLabel, supplyLabel, taxParts,
} from "./financeFormat";
import "./finance.css";

/**
 * /finance → Taxes: the month the CA files, laid out the way the returns ask for it.
 *
 * Internal by design (finance + admin only), so this is one of the two places the statutory names
 * appear: CGST/SGST/IGST, GSTIN, GSTR-1, GSTR-3B. Headline cards still say "Taxes collected".
 *
 * Every figure in the summary and the returns is INR, because returns are filed in INR (a USD document
 * carries its INR conversion in its snapshot). Anywhere rows of BOTH currencies appear — the register,
 * the gap list, reconciliation, gateway fees — each figure carries its own currency and nothing is
 * totalled across them.
 *
 * Filed data is exported by the SERVER (GSTR-1 sheets, the register, the gap list): DataTable's own
 * export only knows the rendered columns and is never what gets filed.
 *
 * `actions` is null for the finance role. Only an admin sees "Issue back-fill invoices" and the period
 * lock; the server refuses both for anyone else regardless.
 */

const GSTR1_TABLES = [
  { key: "b2b", label: "B2B", note: "4A · Invoices to buyers with a GSTIN" },
  { key: "b2cl", label: "B2CL", note: "5 · Large inter-state invoices to unregistered buyers" },
  { key: "b2cs", label: "B2CS", note: "7 · Other unregistered sales, by place of supply and rate" },
  { key: "exp", label: "EXP", note: "6A · Exports, with payment of IGST (WPAY)" },
  { key: "cdnr", label: "CDNR", note: "9B · Credit notes to registered buyers" },
  { key: "cdnur", label: "CDNUR", note: "9B · Credit notes to unregistered buyers" },
  { key: "hsn", label: "HSN", note: "12 · SAC summary, B2B and B2C" },
  { key: "docs", label: "DOCS", note: "13 · Documents issued, with cancelled numbers" },
];

const REGISTER_TYPES = [
  { value: "tax_invoice", label: "Tax invoices" },
  { value: "credit_note", label: "Credit notes" },
  { value: "cancelled", label: "Cancelled" },
];

/** Loading / error / content for one panel, so a slow or failed endpoint never blanks the others. */
function Panel({ resource, children }) {
  if (resource.error) return <ErrorState title="Couldn't load this" body={resource.error} onRetry={resource.reload} />;
  if (resource.loading && !resource.data) return <SkeletonText lines={3} />;
  return children(resource.data || {});
}

/** One stat card in the house style. */
function Stat({ label, value, note = null }) {
  return (
    <Card>
      <p className="adst-label">{label}</p>
      <p className="adst-value ckad-num" style={{ marginTop: 6 }}>{value}</p>
      {note ? <p className="fin-breakdown">{note}</p> : null}
    </Card>
  );
}

/** Sum a field per currency — the only kind of total this tab ever shows across mixed rows. */
const totalsByCurrency = (rows, field) => {
  const totals = new Map();
  for (const row of rows || []) {
    const currency = row.currency || "INR";
    totals.set(currency, (totals.get(currency) || 0) + (Number(row[field]) || 0));
  }
  return [...totals.entries()];
};

export default function TaxesSection({ actions = null, onOpenPdf = null }) {
  // Both read the clock once, on mount: the current month is the default view and the boundary of
  // what may be locked (only a month that has ended).
  const [period, setPeriod] = useState(() => periodOf(new Date()));
  const [thisMonth] = useState(() => periodOf(new Date()));
  const [registerType, setRegisterType] = useState("tax_invoice");
  const [dialog, setDialog] = useState("");
  const [downloadError, setDownloadError] = useState("");

  const summary = useFinanceGet("/finance/taxes/summary", { period });
  const gstr1 = useFinanceGet("/finance/taxes/gstr1", { period });
  const gstr3b = useFinanceGet("/finance/taxes/gstr3b", { period });
  const register = useFinanceGet("/finance/taxes/register", { period, type: registerType });
  const review = useFinanceGet("/finance/taxes/review");
  const recon = useFinanceGet("/finance/taxes/reconciliation", { period });
  const gap = useFinanceGet("/finance/taxes/gap");

  const download = async (path, params, filename) => {
    try {
      setDownloadError("");
      await downloadCsv(path, params, filename);
    } catch {
      setDownloadError(`Could not download ${filename}.`);
    }
  };

  const locked = Boolean(summary.data?.locked);
  const canLock = period < thisMonth && !locked;

  const issueGap = async ({ notify }) => {
    const done = await actions?.issueGapInvoices({ notify });
    if (!done) return;
    setDialog("");
    [gap, summary, gstr1, gstr3b, register, recon].forEach((r) => r.reload());
  };

  const lockPeriod = async ({ note }) => {
    const done = await actions?.lockTaxPeriod(period, note);
    if (!done) return;
    setDialog("");
    summary.reload();
  };

  const openDocument = (row) => onOpenPdf?.({ _id: row._id, invoiceNumber: row.number }, "open");

  // ── Document register ───────────────────────────────────────────────────
  const registerColumns = [
    {
      key: "number", header: "Number", sortable: true,
      render: (r) => (
        <>
          {onOpenPdf && r.type !== "cancelled"
            ? <button type="button" className="fin-linkbtn" onClick={() => openDocument(r)}>{r.number}</button>
            : <span className="ckad-mono">{r.number}</span>}
          {r.against ? <span className="adtb-sub">against {r.against}</span> : null}
        </>
      ),
    },
    { key: "date", header: "Date", sortable: true, sortValue: (r) => new Date(r.date || 0).getTime(), render: (r) => day(r.date) },
    { key: "buyer", header: "Buyer", sortable: true, render: (r) => (<>{r.buyer || "—"}<span className="adtb-sub">{r.email}</span></>) },
    { key: "gstin", header: "Buyer GSTIN", hideable: true, sortValue: (r) => r.businessTaxId || "", render: (r) => (r.businessTaxId ? <span className="ckad-mono">{r.businessTaxId}</span> : "—") },
    { key: "pos", header: "Place of supply", sortable: true, sortValue: (r) => r.placeOfSupply || "", render: (r) => placeLabel(r.placeOfSupply) },
    {
      key: "supply", header: "Supply", sortable: true, hideable: true, sortValue: (r) => supplyLabel(r.supplyType),
      render: (r) => (<>{supplyLabel(r.supplyType)}{r.gap ? <> <Badge tone="warn">back-fill</Badge></> : null}</>),
    },
    { key: "currency", header: "Currency", sortable: true, render: (r) => r.currency || "INR" },
    { key: "taxable", header: "Taxable", align: "right", sortable: true, sortValue: (r) => Number(r.taxableMinor) || 0, render: (r) => money(r.taxableMinor, r.currency) },
    { key: "cgst", header: "CGST", align: "right", hideable: true, sortValue: (r) => Number(r.cgstMinor) || 0, render: (r) => money(r.cgstMinor, r.currency) },
    { key: "sgst", header: "SGST", align: "right", hideable: true, sortValue: (r) => Number(r.sgstMinor) || 0, render: (r) => money(r.sgstMinor, r.currency) },
    { key: "igst", header: "IGST", align: "right", hideable: true, sortValue: (r) => Number(r.igstMinor) || 0, render: (r) => money(r.igstMinor, r.currency) },
    { key: "taxes", header: "Taxes", align: "right", sortable: true, sortValue: (r) => Number(r.taxMinor) || 0, render: (r) => money(r.taxMinor, r.currency) },
    { key: "total", header: "Total", align: "right", sortable: true, sortValue: (r) => Number(r.grossMinor) || 0, render: (r) => money(r.grossMinor, r.currency) },
    {
      // A USD document is filed at its INR conversion; shown beside it, never added to anything.
      key: "inr", header: "In INR (taxable / taxes)", align: "right", hideable: true,
      sortValue: (r) => Number(r.inrTaxableMinor) || 0,
      render: (r) => (r.currency && r.currency !== "INR"
        ? <>{money(r.inrTaxableMinor, "INR")}<span className="adtb-sub">{money(r.inrTaxMinor, "INR")}</span></>
        : <span className="adtb-sub">—</span>),
    },
    { key: "paymentId", header: "Payment ID", hideable: true, hidden: true, render: (r) => <span className="ckad-mono">{r.paymentId || "—"}</span> },
  ];

  // ── Review queue ────────────────────────────────────────────────────────
  const reviewColumns = [
    { key: "number", header: "Invoice", sortable: true, render: (r) => <span className="ckad-mono">{r.number}</span> },
    { key: "date", header: "Date", sortable: true, sortValue: (r) => new Date(r.date || 0).getTime(), render: (r) => day(r.date) },
    { key: "buyer", header: "Buyer", sortable: true, render: (r) => (<>{r.buyer || "—"}<span className="adtb-sub">{r.email}</span></>) },
    {
      key: "pos", header: "Place of supply", sortValue: (r) => placeLabel(r.placeOfSupply),
      render: (r) => (<>{placeLabel(r.placeOfSupply)}{r.placeOfSupply?.country ? <span className="adtb-sub">Country: {r.placeOfSupply.country}</span> : null}</>),
    },
    { key: "basis", header: "Basis", sortValue: (r) => r.placeOfSupply?.basis || "", render: (r) => r.placeOfSupply?.basis || "—" },
    {
      key: "evidence", header: "Evidence",
      sortValue: (r) => (r.placeOfSupply?.evidence || []).join(", "),
      render: (r) => {
        const evidence = (r.placeOfSupply?.evidence || []).map((e) => (typeof e === "string" ? e : JSON.stringify(e)));
        return evidence.length ? evidence.join(", ") : "—";
      },
    },
  ];

  // ── Reconciliation ──────────────────────────────────────────────────────
  const missingColumns = [
    { key: "paidAt", header: "Paid", sortable: true, sortValue: (r) => new Date(r.paidAt || 0).getTime(), render: (r) => <span className="fin-danger-text">{day(r.paidAt)}</span> },
    { key: "kind", header: "Type", sortable: true, render: (r) => <span className="fin-danger-text">{KIND_LABEL[r.kind] || r.kind}</span> },
    { key: "label", header: "Description", render: (r) => <span className="fin-danger-text">{r.label || "—"}</span> },
    { key: "buyer", header: "Buyer", sortable: true, render: (r) => <span className="fin-danger-text">{r.buyer || "—"}</span> },
    { key: "amount", header: "Amount", align: "right", sortable: true, sortValue: (r) => Number(r.amountMinor) || 0, render: (r) => <span className="fin-danger-text">{money(r.amountMinor, r.currency)}</span> },
    { key: "reason", header: "Problem", render: (r) => <span className="fin-danger-text">{r.reason}</span> },
    { key: "paymentId", header: "Payment ID", hideable: true, render: (r) => <span className="ckad-mono">{r.paymentId || "—"}</span> },
  ];

  const unbookedColumns = [
    { key: "capturedAt", header: "Captured", sortable: true, sortValue: (r) => new Date(r.capturedAt || 0).getTime(), render: (r) => day(r.capturedAt) },
    { key: "purpose", header: "Purpose", sortable: true, render: (r) => r.purpose || "—" },
    { key: "amount", header: "Amount", align: "right", sortable: true, sortValue: (r) => Number(r.grossMinor) || 0, render: (r) => money(r.grossMinor, r.currency) },
    { key: "orderId", header: "Order ID", render: (r) => <span className="ckad-mono">{r.orderId || "—"}</span> },
    { key: "paymentId", header: "Payment ID", render: (r) => <span className="ckad-mono">{r.paymentId || "—"}</span> },
  ];

  // ── Gap back-fill ───────────────────────────────────────────────────────
  const gapColumns = [
    { key: "paidAt", header: "Paid", sortable: true, sortValue: (r) => new Date(r.paidAt || 0).getTime(), render: (r) => day(r.paidAt) },
    { key: "kind", header: "Type", sortable: true, render: (r) => KIND_LABEL[r.kind] || r.kind },
    { key: "label", header: "Description", hideable: true, render: (r) => r.label || "—" },
    { key: "buyer", header: "Buyer", sortable: true, render: (r) => (<>{r.buyer || "—"}<span className="adtb-sub">{r.email}</span></>) },
    { key: "paid", header: "Paid", align: "right", sortable: true, sortValue: (r) => Number(r.paidMinor) || 0, render: (r) => money(r.paidMinor, r.currency) },
    { key: "taxable", header: "Taxable", align: "right", sortable: true, sortValue: (r) => Number(r.taxableMinor) || 0, render: (r) => money(r.taxableMinor, r.currency) },
    {
      key: "taxes", header: "Taxes", align: "right", sortable: true, sortValue: (r) => Number(r.taxMinor) || 0,
      render: (r) => <span title={taxParts(r, r.currency) || undefined}>{money(r.taxMinor, r.currency)}</span>,
    },
    { key: "supply", header: "Supply", hideable: true, sortValue: (r) => supplyLabel(r.supplyType), render: (r) => (<>{supplyLabel(r.supplyType)}<span className="adtb-sub">{placeLabel(r.placeOfSupply)}</span></>) },
    { key: "paymentId", header: "Payment ID", hideable: true, hidden: true, render: (r) => <span className="ckad-mono">{r.paymentId || "—"}</span> },
  ];

  const summaryData = summary.data;

  return (
    <div className="fin-page">
      <SectionHeader title="Taxes">
        <label className="adf" style={{ minWidth: 0 }}>
          <span className="ckad-sr-only">Month</span>
          <input
            type="month"
            className="adf-control"
            value={period}
            max={thisMonth}
            onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setPeriod(e.target.value); }}
          />
        </label>
        {summaryData ? (
          locked
            ? <Badge tone="info">Locked{summaryData.lockedAt ? ` ${day(summaryData.lockedAt)}` : ""}</Badge>
            : <Badge tone="neutral">Open</Badge>
        ) : null}
        {actions ? (
          <Button
            variant="secondary"
            disabled={!canLock}
            loading={actions.busy === `period-lock-${period}`}
            title={locked ? "This month is already locked." : !canLock ? "Only a month that has ended can be locked." : undefined}
            onClick={() => setDialog("lock")}
          >
            Lock {period}
          </Button>
        ) : null}
      </SectionHeader>

      {summaryData && summaryData.chargingEnabled === false ? (
        <div className="fin-banner" role="note">
          Taxes are not being charged at checkout yet (GST_ENABLED is off).
          {summaryData.liabilityFrom ? ` Liability runs from ${longDay(summaryData.liabilityFrom)} — see Back-fill below.` : ""}
        </div>
      ) : null}
      {downloadError ? <div className="fin-banner fin-banner--danger" role="alert">{downloadError}</div> : null}

      {/* ── Summary (INR) ─────────────────────────────────────────────────── */}
      <Panel resource={summary}>
        {(s) => {
          const t = s.totals || {};
          const c = s.counts || {};
          const cur = s.currency || "INR";
          return (
            <>
              <p className="fin-currency">{cur} · tax invoices less credit notes, by document date</p>
              <div className="fin-grid">
                <Stat label={`Taxes collected · ${cur}`} value={money(t.taxMinor, cur)} note={taxParts(t, cur) || null} />
                <Stat label={`Taxable value · ${cur}`} value={money(t.taxableMinor, cur)} note={`Total invoiced ${money(t.grossMinor, cur)}`} />
                <Stat label="CGST" value={money(t.cgstMinor, cur)} />
                <Stat label="SGST" value={money(t.sgstMinor, cur)} />
                <Stat label="IGST" value={money(t.igstMinor, cur)} />
                <Stat
                  label="Documents"
                  value={c.invoices || 0}
                  note={`tax invoices · ${c.creditNotes || 0} credit notes · ${c.exports || 0} exports · ${c.gapInvoices || 0} back-fill`}
                />
              </div>
            </>
          );
        }}
      </Panel>

      {/* ── GSTR-1 ───────────────────────────────────────────────────────── */}
      <div className="fin-block">
        <SectionHeader title="GSTR-1" />
        <Card flush>
          <Panel resource={gstr1}>
            {(g) => (
              <div className="fin-scroll">
                <table className="adtb-table">
                  <thead>
                    <tr>
                      <th className="adtb-th">Table</th>
                      <th className="adtb-th">What it holds</th>
                      <th className="adtb-th adtb-th--right">Rows</th>
                      <th className="adtb-th"><span className="ckad-sr-only">Download</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {GSTR1_TABLES.map((t) => (
                      <tr key={t.key}>
                        <td className="adtb-td"><span className="ckad-mono">{t.label}</span></td>
                        <td className="adtb-td">{t.note}</td>
                        <td className="adtb-td adtb-td--right ckad-num">{(g.tables?.[t.key] || []).length}</td>
                        <td className="adtb-td">
                          <Button size="sm" variant="ghost"
                            onClick={() => download("/finance/taxes/gstr1", { period, table: t.key, format: "csv" }, `gstr1-${period}-${t.key}.csv`)}>
                            Download {t.key}.csv
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </Card>
      </div>

      {/* ── GSTR-3B ──────────────────────────────────────────────────────── */}
      <div className="fin-block">
        <SectionHeader title="GSTR-3B" />
        <Panel resource={gstr3b}>
          {(g) => {
            const entries = Object.entries(g.tables || {});
            const outward = entries.filter(([, v]) => v && !Array.isArray(v));
            const interState = entries.filter(([, v]) => Array.isArray(v));
            return (
              <div className="fin-stack">
                <Card title="3.1 Outward supplies" description="INR. Exports are supplied with payment of IGST, so they sit in 3.1(b) with their tax.">
                  <div className="fin-scroll">
                    <table className="adtb-table">
                      <thead>
                        <tr>
                          <th className="adtb-th">Nature of supplies</th>
                          <th className="adtb-th adtb-th--right">Taxable value</th>
                          <th className="adtb-th adtb-th--right">IGST</th>
                          <th className="adtb-th adtb-th--right">CGST</th>
                          <th className="adtb-th adtb-th--right">SGST/UTGST</th>
                          <th className="adtb-th adtb-th--right">Cess</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outward.map(([name, v]) => (
                          <tr key={name}>
                            <td className="adtb-td" style={{ whiteSpace: "normal", minWidth: 220 }}>{name}</td>
                            <td className="adtb-td adtb-td--right ckad-num">{money(v.taxable, "INR")}</td>
                            <td className="adtb-td adtb-td--right ckad-num">{money(v.igst, "INR")}</td>
                            <td className="adtb-td adtb-td--right ckad-num">{money(v.cgst, "INR")}</td>
                            <td className="adtb-td adtb-td--right ckad-num">{money(v.sgst, "INR")}</td>
                            <td className="adtb-td adtb-td--right ckad-num">{money(v.cess, "INR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                {interState.map(([name, rows]) => (
                  <Card key={name} title={name} description="INR, by place of supply.">
                    {rows.length ? (
                      <div className="fin-scroll">
                        <table className="adtb-table">
                          <thead>
                            <tr>
                              <th className="adtb-th">Place of supply</th>
                              <th className="adtb-th adtb-th--right">Taxable value</th>
                              <th className="adtb-th adtb-th--right">IGST</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.placeOfSupply}>
                                <td className="adtb-td">{r.placeOfSupply}</td>
                                <td className="adtb-td adtb-td--right ckad-num">{money(r.taxable, "INR")}</td>
                                <td className="adtb-td adtb-td--right ckad-num">{money(r.igst, "INR")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className="adst-label">No inter-state supplies to unregistered persons this month.</p>}
                  </Card>
                ))}
              </div>
            );
          }}
        </Panel>
      </div>

      {/* ── Document register ────────────────────────────────────────────── */}
      <div className="fin-block">
        <SectionHeader title="Document register" count={register.data?.rows?.length ?? null}>
          <div className="fin-seg" role="group" aria-label="Document type">
            {REGISTER_TYPES.map((t) => (
              <Button key={t.value} size="sm" variant="secondary" aria-pressed={registerType === t.value}
                onClick={() => setRegisterType(t.value)}>
                {t.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="secondary"
            onClick={() => download("/finance/taxes/register", { period, type: registerType, format: "csv" }, `tax-register-${period}-${registerType}.csv`)}>
            Download CSV
          </Button>
        </SectionHeader>
        <Card flush>
          <DataTable
            columns={registerColumns}
            rows={register.data?.rows || []}
            loading={register.loading}
            error={register.error}
            onRetry={register.reload}
            searchPlaceholder="Search the register…"
            pageSize={25}
            empty={{ title: "No documents", body: `No ${REGISTER_TYPES.find((t) => t.value === registerType)?.label.toLowerCase()} dated in ${period}.` }}
          />
        </Card>
      </div>

      {/* ── Reconciliation ───────────────────────────────────────────────── */}
      <div className="fin-block">
        <Panel resource={recon}>
          {(r) => {
            const missing = r.missing || [];
            const unbooked = r.unbooked || [];
            const fees = Object.entries(r.gatewayFees || {});
            return (
              <>
                <SectionHeader title="Reconciliation">
                  {/* The target is zero: every captured payment must have its tax document. */}
                  <Badge tone={missing.length ? "danger" : "success"}>
                    {missing.length} without a document
                  </Badge>
                </SectionHeader>
                <p className="fin-breakdown" style={{ marginTop: 0, marginBottom: "var(--ad-s3)" }}>
                  {r.payments || 0} captured payment{r.payments === 1 ? "" : "s"} in {period} · {r.documented || 0} with a tax invoice
                </p>
                {missing.length ? (
                  <Card flush>
                    <DataTable columns={missingColumns} rows={missing} rowKey="ledgerEntryId" search={false} paginate={false}
                      empty={{ title: "Every payment has its document" }} />
                  </Card>
                ) : (
                  <div className="fin-banner fin-banner--info" role="status">Every captured payment this month has its tax document.</div>
                )}

                <div className="fin-grid fin-grid--2" style={{ marginTop: "var(--ad-s4)" }}>
                  <Card title="Captured but not booked" description="Seen at Razorpay, with no ledger entry. Each one needs a look." flush>
                    <DataTable columns={unbookedColumns} rows={unbooked} rowKey="paymentId" search={false} paginate={false} columnsMenu={false}
                      empty={{ title: "Nothing unbooked" }} />
                  </Card>
                  <Card title="Gateway fees" description="Razorpay's fee and the tax on it (input tax credit), per currency.">
                    {fees.length ? (
                      <div className="fin-scroll">
                        <table className="adtb-table">
                          <thead>
                            <tr>
                              <th className="adtb-th">Currency</th>
                              <th className="adtb-th adtb-th--right">Fee</th>
                              <th className="adtb-th adtb-th--right">Tax on fee</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fees.map(([currency, f]) => (
                              <tr key={currency}>
                                <td className="adtb-td">{currency}</td>
                                <td className="adtb-td adtb-td--right ckad-num">{money(f.feeMinor, currency)}</td>
                                <td className="adtb-td adtb-td--right ckad-num">{money(f.feeTaxMinor, currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className="adst-label">No gateway fees recorded this month.</p>}
                  </Card>
                </div>
              </>
            );
          }}
        </Panel>
      </div>

      {/* ── Place-of-supply review queue ─────────────────────────────────── */}
      <div className="fin-block">
        <SectionHeader title="Place of supply to review" count={review.data?.rows?.length ?? null} />
        <Card flush>
          <DataTable
            columns={reviewColumns}
            rows={review.data?.rows || []}
            loading={review.loading}
            error={review.error}
            onRetry={review.reload}
            search={false}
            paginate={false}
            columnsMenu={false}
            empty={{ title: "Nothing to review", body: "Every invoice's place of supply was settled with enough evidence." }}
          />
        </Card>
      </div>

      {/* ── Gap back-fill ────────────────────────────────────────────────── */}
      <div className="fin-block">
        <Panel resource={gap}>
          {(g) => {
            const rows = g.rows || [];
            const count = Number(g.count) || 0;
            const taxTotals = totalsByCurrency(rows, "taxMinor");
            return (
              <>
                <SectionHeader title="Back-fill" count={count}>
                  <Button size="sm" variant="secondary"
                    onClick={() => download("/finance/taxes/gap", { format: "csv" }, `tax-gap-${thisMonth}.csv`)}>
                    Download CSV
                  </Button>
                  {actions ? (
                    <Button size="sm" variant="primary" disabled={!count}
                      loading={actions.busy === "gap-issue"} onClick={() => setDialog("gap")}>
                      Issue back-fill invoices
                    </Button>
                  ) : null}
                </SectionHeader>
                <p className="fin-breakdown" style={{ marginTop: 0, marginBottom: "var(--ad-s3)" }}>
                  Payments taken {g.liabilityFrom ? `since ${longDay(g.liabilityFrom)} ` : ""}before taxes were charged at
                  checkout. The taxes are carved out of what was paid, and each needs a tax invoice.
                </p>
                {count && g.deadlines?.invoiceBy ? (
                  <div className="fin-banner fin-banner--warn" role="note">
                    <strong>Issue by {longDay(g.deadlines.invoiceBy)}</strong>
                    {g.deadlines.returnDue ? <span>Report them in the return due {longDay(g.deadlines.returnDue)}.</span> : null}
                  </div>
                ) : null}
                {taxTotals.length ? (
                  <p className="fin-breakdown" style={{ marginBottom: "var(--ad-s3)" }}>
                    Taxes inside these payments:{" "}
                    {taxTotals.map(([currency, minor]) => `${money(minor, currency)} (${currency})`).join(" · ")}
                    {count > rows.length ? ` — first ${rows.length} of ${count} shown; the CSV has all of them` : ""}
                  </p>
                ) : null}
                <Card flush>
                  <DataTable columns={gapColumns} rows={rows} rowKey="ledgerEntryId" searchPlaceholder="Search back-fill…" pageSize={25}
                    empty={{ title: "Nothing to back-fill", body: "Every payment since taxes became due has its tax invoice." }} />
                </Card>
                {actions && dialog === "gap" ? (
                  <IssueGapDialog count={count} deadline={g.deadlines?.invoiceBy || null}
                    busy={actions.busy === "gap-issue"} onClose={() => setDialog("")} onConfirm={issueGap} />
                ) : null}
              </>
            );
          }}
        </Panel>
      </div>

      {actions && dialog === "lock" ? (
        <LockPeriodDialog period={period} busy={actions.busy === `period-lock-${period}`}
          onClose={() => setDialog("")} onConfirm={lockPeriod} />
      ) : null}
    </div>
  );
}
