import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/financeApi";
import { Badge, Button, Card, DataTable, Pager, SectionHeader, Select, StatusPill } from "../admin/ui";
import { downloadCsv } from "./financeIO";
import { RefundDialog } from "./financeDialogs";
import { KIND_LABEL, money, periodRange, supplyLabel, taxParts } from "./financeFormat";
import "./finance.css";

/**
 * The ledger overview: what actually landed, by currency and by kind, plus the entry list and the
 * CSV export an accountant hands to their software.
 *
 * Reads the LedgerEntry collection; the TAXES inside each figure come from the issued tax documents
 * (server-side), so this page and the returns filed from the Taxes tab can never disagree.
 *
 * Currencies are never summed together — nothing records an FX rate at capture time, so a single
 * "total revenue" figure would be invented. Every card, row and cell carries its own currency.
 *
 * Entries are paginated by the SERVER (the endpoint caps a page at 200), so the table shows one page
 * at a time and the pager walks them. Fetching a fixed slice and paging it in the browser would quietly
 * hide everything past the first page in a busy month — the one number an accountant cannot afford to
 * be wrong. The CSV export is unpaginated and always covers the whole range.
 *
 * `actions` is null for the finance role and the admin control set otherwise; the only control here
 * is Refund, on paid rows. `onOpenPdf(invoice, mode)` opens a document through the authenticated client.
 */

const PAGE_SIZE = 50;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

/** Supplies with no tax on them — their taxable/tax cells read "—" rather than a misleading 0.00. */
const UNTAXED = new Set(["pre_gst", "no_consideration"]);

export default function LedgerSection({ actions = null, onOpenPdf = null }) {
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState({ entries: [], pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [refunding, setRefunding] = useState(null);

  const params = useMemo(
    () => ({ from: range.from, to: range.to, ...(kind ? { kind } : {}) }),
    [range, kind],
  );

  // A new date range or type starts at page one — adjusted during render rather than in an effect, so
  // the fetch below never runs once for the stale page and again for the corrected one.
  const rangeKey = `${range.from}|${range.to}|${kind}`;
  const [lastRangeKey, setLastRangeKey] = useState(rangeKey);
  if (rangeKey !== lastRangeKey) {
    setLastRangeKey(rangeKey);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, l] = await Promise.all([
          api.get("/finance/summary", { params }),
          api.get("/finance/entries", { params: { ...params, page, limit: PAGE_SIZE } }),
        ]);
        if (cancelled) return;
        setSummary(s.data);
        setList({
          entries: l.data?.entries || [],
          pages: Number(l.data?.pages) || 1,
          total: Number(l.data?.total) || 0,
        });
        setError("");
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load the ledger.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params, page, reloadToken]);

  const setBound = (key, value) => { setLoading(true); setRange((r) => ({ ...r, [key]: value })); };
  // The month picker is a shortcut for the two bounds — it shows a month only while the range IS one.
  const pickMonth = (value) => {
    const bounds = periodRange(value);
    if (!bounds) return;
    setLoading(true);
    setRange({ from: bounds.from, to: bounds.to });
  };
  // "1 Oct → 11 Oct" (the default, month-to-date) reads as October as much as "1 Oct → 31 Oct" does.
  const shownMonth = range.from.endsWith("-01") && range.to.slice(0, 7) === range.from.slice(0, 7)
    ? range.from.slice(0, 7)
    : "";
  const pickKind = (value) => { setLoading(true); setKind(value); };
  const goToPage = useCallback((next) => { setLoading(true); setPage(next); }, []);
  const retry = useCallback(() => { setLoading(true); setReloadToken((t) => t + 1); }, []);

  const exportCsv = async () => {
    try {
      await downloadCsv("/finance/export.csv", params, `ckript-ledger-${range.from}-to-${range.to}${kind ? `-${kind}` : ""}.csv`);
    } catch {
      setError("Could not export the ledger.");
    }
  };

  const confirmRefund = async (body) => {
    if (!actions || !refunding) return;
    const done = await actions.refundPayment(refunding, body);
    if (done) {
      setRefunding(null);
      retry();
    }
  };

  const openDocument = (doc) => onOpenPdf?.({ _id: doc._id, invoiceNumber: doc.number }, "open");

  const columns = [
    { key: "date", header: "Date", sortable: true, sortValue: (e) => new Date(e.occurredAt || 0).getTime(), render: (e) => new Date(e.occurredAt).toLocaleDateString() },
    { key: "kind", header: "Type", sortable: true, render: (e) => KIND_LABEL[e.kind] || e.kind },
    { key: "label", header: "Description", render: (e) => e.label || "—" },
    { key: "user", header: "User", sortable: true, sortValue: (e) => e.user?.name || "", render: (e) => (<>{e.user?.name || "—"}<span className="adtb-sub">{e.user?.email}</span></>) },
    { key: "settlement", header: "Status", sortable: true, render: (e) => <StatusPill status={e.settlement} /> },
    {
      key: "amount", header: "Amount", align: "right", sortable: true,
      sortValue: (e) => Number(e.amountMinor) || 0,
      // A grant has no amount — showing its list price is what makes free access visible without
      // ever counting it as revenue.
      render: (e) => (e.settlement === "granted"
        ? <span className="adtb-sub">{money(e.listPriceMinor, e.currency)}</span>
        : money(e.amountMinor, e.currency)),
    },
    {
      key: "taxable", header: "Taxable", align: "right", sortable: true, hideable: true,
      sortValue: (e) => Number(e.taxableMinor) || 0,
      render: (e) => (UNTAXED.has(e.supplyType) ? <span className="adtb-sub">—</span> : money(e.taxableMinor, e.currency)),
    },
    {
      key: "taxes", header: "Taxes", align: "right", sortable: true,
      sortValue: (e) => Number(e.taxMinor) || 0,
      render: (e) => (UNTAXED.has(e.supplyType)
        ? <span className="adtb-sub">—</span>
        : <span title={taxParts(e, e.currency) || undefined}>{money(e.taxMinor, e.currency)}</span>),
    },
    {
      key: "supply", header: "Supply", sortable: true, hideable: true,
      sortValue: (e) => supplyLabel(e.supplyType),
      render: (e) => (
        <>
          {supplyLabel(e.supplyType)}
          {e.gap ? <> <Badge tone="warn">back-fill</Badge></> : null}
          {e.placeOfSupply ? <span className="adtb-sub">Place of supply: {e.placeOfSupply}</span> : null}
        </>
      ),
    },
    {
      key: "document", header: "Document", sortable: true,
      sortValue: (e) => e.document?.number || "",
      render: (e) => {
        if (!e.document?.number) return <span className="adtb-sub">—</span>;
        return onOpenPdf
          ? <button type="button" className="fin-linkbtn" onClick={() => openDocument(e.document)}>{e.document.number}</button>
          : <span className="ckad-mono">{e.document.number}</span>;
      },
    },
    { key: "ref", header: "Payment ID", hideable: true, render: (e) => <span className="ckad-mono">{e.providerPaymentId || "—"}</span> },
    ...(actions ? [{
      key: "actions", header: "", sortValue: () => "",
      render: (e) => (e.settlement === "paid" && e.providerPaymentId ? (
        <span className="adtb-rowactions">
          <Button size="sm" variant="ghost" className="adtb-danger"
            loading={actions.busy === `refund-${e._id}`}
            onClick={() => setRefunding(e)}>Refund</Button>
        </span>
      ) : null),
    }] : []),
  ];

  const currencies = summary?.currencies || [];

  return (
    <div className="fin-page">
      <SectionHeader title="Overview">
        <label className="adf" style={{ minWidth: 0 }}>
          <span className="ckad-sr-only">Month</span>
          <input type="month" className="adf-control" value={shownMonth} onChange={(e) => pickMonth(e.target.value)} />
        </label>
        <label className="adf" style={{ minWidth: 0 }}>
          <span className="ckad-sr-only">From</span>
          <input type="date" className="adf-control" value={range.from} onChange={(e) => setBound("from", e.target.value)} />
        </label>
        <label className="adf" style={{ minWidth: 0 }}>
          <span className="ckad-sr-only">To</span>
          <input type="date" className="adf-control" value={range.to} onChange={(e) => setBound("to", e.target.value)} />
        </label>
        <label className="adf" style={{ minWidth: 0 }}>
          <span className="ckad-sr-only">Type</span>
          <Select value={kind} onChange={(e) => pickKind(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </label>
        <Button variant="primary" onClick={exportCsv}>Export CSV</Button>
      </SectionHeader>

      {/* One group of cards PER CURRENCY. There is deliberately no all-currency total anywhere. */}
      {currencies.map((c) => {
        const breakdown = taxParts(c.taxBreakdown, c.currency);
        const showPayout = c.currency === "INR" || Number(c.payoutMinor) !== 0;
        return (
          <section key={c.currency} aria-label={`${c.currency} figures`}>
            <p className="fin-currency">{c.currency}</p>
            <div className="fin-grid">
              <Card>
                <p className="adst-label">Collected · {c.currency}</p>
                <p className="adst-value ckad-num" style={{ marginTop: 6 }}>{money(c.grossMinor, c.currency)}</p>
                <p className="fin-breakdown">
                  {c.payments} payment{c.payments === 1 ? "" : "s"}
                  {c.refunds ? ` · ${c.refunds} refunded (${money(c.refundedMinor, c.currency)})` : ""}
                </p>
              </Card>
              <Card>
                <p className="adst-label">Revenue (excl. taxes) · {c.currency}</p>
                <p className="adst-value ckad-num" style={{ marginTop: 6 }}>{money(c.revenueExTaxMinor, c.currency)}</p>
                <p className="fin-breakdown">After refunds · net {money(c.netMinor, c.currency)} less taxes</p>
              </Card>
              <Card>
                <p className="adst-label">Taxes collected · {c.currency}</p>
                <p className="adst-value ckad-num" style={{ marginTop: 6 }}>{money(c.taxMinor, c.currency)}</p>
                {breakdown ? <p className="fin-breakdown">{breakdown}</p> : null}
                {Number(c.taxBreakdown?.gapTaxMinor) ? (
                  <p className="fin-breakdown">incl. {money(c.taxBreakdown.gapTaxMinor, c.currency)} back-filled</p>
                ) : null}
                <p className="fin-breakdown">
                  {c.taxDocuments?.invoices || 0} tax invoice{c.taxDocuments?.invoices === 1 ? "" : "s"}
                  {" · "}{c.taxDocuments?.creditNotes || 0} credit note{c.taxDocuments?.creditNotes === 1 ? "" : "s"}
                </p>
              </Card>
              {/* Payouts are recorded in INR whatever the buyer paid in, so they are formatted as INR
                  even on a USD group — and never added to the INR group's figure. */}
              {showPayout ? (
                <Card>
                  <p className="adst-label">
                    {c.currency === "INR" ? "Payouts to creators · INR" : `Payouts to creators · on ${c.currency} sales`}
                  </p>
                  <p className="adst-value ckad-num" style={{ marginTop: 6 }}>{money(c.payoutMinor, "INR")}</p>
                  <p className="fin-breakdown">
                    {c.currency === "INR" ? "Owed or paid to writers and professionals" : "Paid out in INR"}
                  </p>
                </Card>
              ) : null}
            </div>
          </section>
        );
      })}

      <div className="fin-grid fin-grid--2">
        <Card title="By type">
          {(summary?.byKind || []).length ? (
            <div className="fin-scroll">
              <table className="adtb-table">
                <thead>
                  <tr>
                    <th className="adtb-th">Type</th>
                    <th className="adtb-th adtb-th--right">Entries</th>
                    <th className="adtb-th adtb-th--right">Net</th>
                    <th className="adtb-th adtb-th--right">Taxes</th>
                    <th className="adtb-th adtb-th--right">Revenue excl. taxes</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byKind.map((r) => (
                    <tr key={`${r.kind}-${r.currency}`}>
                      <td className="adtb-td">{KIND_LABEL[r.kind] || r.kind}<span className="adtb-sub">{r.currency}</span></td>
                      <td className="adtb-td adtb-td--right ckad-num">{r.count}</td>
                      <td className="adtb-td adtb-td--right ckad-num">{money(r.netMinor, r.currency)}</td>
                      <td className="adtb-td adtb-td--right ckad-num">{money(r.taxMinor, r.currency)}</td>
                      <td className="adtb-td adtb-td--right ckad-num">{money(r.revenueExTaxMinor, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="adst-label">Nothing in this period.</p>}
        </Card>

        <Card title="Granted free" description="Value foregone — access given without payment. No taxes: nothing was charged.">
          {(summary?.grants || []).length ? (
            <div className="fin-scroll">
              <table className="adtb-table">
                <tbody>
                  {summary.grants.map((r) => (
                    <tr key={`${r.kind}-${r.currency}`}>
                      <td className="adtb-td">{KIND_LABEL[r.kind] || r.kind}</td>
                      <td className="adtb-td adtb-td--right ckad-num">{r.count}</td>
                      <td className="adtb-td adtb-td--right ckad-num">{money(r.forgoneMinor, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="adst-label">No free grants in this period.</p>}
        </Card>
      </div>

      <SectionHeader title="Transactions" count={list.total} />
      <Card flush>
        {/* paginate={false}: the rows on screen ARE one server page, so a second client-side pager
            beneath them would page a page. Search and sort still act on what is loaded. */}
        <DataTable
          columns={columns}
          rows={list.entries}
          loading={loading}
          error={error}
          onRetry={retry}
          searchPlaceholder="Search this page…"
          paginate={false}
          exportName="ledger"
          empty={{ title: "No ledger entries", body: "Payments and grants appear here as they happen." }}
        />
      </Card>
      <Pager page={page} totalPages={list.pages} onPageChange={goToPage} disabled={loading} label="transactions" />

      {actions && refunding ? (
        <RefundDialog
          entry={refunding}
          busy={actions.busy === `refund-${refunding._id}`}
          onClose={() => setRefunding(null)}
          onConfirm={confirmRefund}
        />
      ) : null}
    </div>
  );
}
