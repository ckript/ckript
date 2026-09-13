import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/financeApi";
import { Button, Card, DataTable, Pager, SectionHeader, StatusPill } from "../admin/ui";

/**
 * The ledger overview: what actually landed, by currency and by kind, plus the entry list and the
 * CSV export an accountant hands to their software.
 *
 * Reads the LedgerEntry collection only. Currencies are never summed together — nothing records an
 * FX rate at capture time, so a single "total revenue" figure would be invented. One row each.
 *
 * Entries are paginated by the SERVER (the endpoint caps a page at 200), so the table shows one page
 * at a time and the pager walks them. Fetching a fixed slice and paging it in the browser would quietly
 * hide everything past the first page in a busy month — the one number an accountant cannot afford to
 * be wrong. The CSV export is unpaginated and always covers the whole range.
 */

const SYMBOL = { INR: "₹", USD: "$" };
const money = (minor, currency) =>
  `${SYMBOL[currency] || `${currency} `}${(Number(minor || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

const KIND_LABEL = {
  plan_subscription: "Plans",
  competition_registration: "Challenge entries",
  script_purchase: "Script purchases",
  script_hold: "Script holds",
  ai_trailer: "AI trailers",
  cash_prize: "Cash prizes owed",
  credits: "Credits",
  other: "Other",
};

const PAGE_SIZE = 50;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

export default function LedgerSection() {
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState({ entries: [], pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const params = useMemo(() => ({ from: range.from, to: range.to }), [range]);

  // A new date range starts at page one — adjusted during render rather than in an effect, so the
  // fetch below never runs once for the stale page and again for the corrected one.
  const rangeKey = `${range.from}|${range.to}`;
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
  const goToPage = useCallback((next) => { setLoading(true); setPage(next); }, []);
  const retry = useCallback(() => { setLoading(true); setReloadToken((t) => t + 1); }, []);

  const exportCsv = async () => {
    try {
      const { data } = await api.get("/finance/export.csv", { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `ckript-ledger-${range.from}-to-${range.to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export the ledger.");
    }
  };

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
    { key: "ref", header: "Payment ID", hideable: true, render: (e) => <span className="ckad-mono">{e.providerPaymentId || "—"}</span> },
  ];

  return (
    <div>
      <SectionHeader title="Overview">
        <label className="adf" style={{ minWidth: 0 }}>
          <span className="ckad-sr-only">From</span>
          <input type="date" className="adf-control" value={range.from} onChange={(e) => setBound("from", e.target.value)} />
        </label>
        <label className="adf" style={{ minWidth: 0 }}>
          <span className="ckad-sr-only">To</span>
          <input type="date" className="adf-control" value={range.to} onChange={(e) => setBound("to", e.target.value)} />
        </label>
        <Button variant="primary" onClick={exportCsv}>Export CSV</Button>
      </SectionHeader>

      <div className="fin-grid">
        {(summary?.currencies || []).map((c) => (
          <Card key={c.currency}>
            <p className="adst-label">Net revenue · {c.currency}</p>
            <p className="adst-value ckad-num" style={{ marginTop: 6 }}>{money(c.netMinor, c.currency)}</p>
            <p className="adst-label" style={{ marginTop: 4 }}>
              {c.payments} payment{c.payments === 1 ? "" : "s"}
              {c.refunds ? ` · ${c.refunds} refunded` : ""}
            </p>
          </Card>
        ))}
      </div>

      <div className="fin-grid fin-grid--2">
        <Card title="By type">
          {(summary?.byKind || []).length ? (
            <table className="adtb-table">
              <tbody>
                {summary.byKind.map((r) => (
                  <tr key={`${r.kind}-${r.currency}`}>
                    <td className="adtb-td">{KIND_LABEL[r.kind] || r.kind}</td>
                    <td className="adtb-td adtb-td--right ckad-num">{r.count}</td>
                    <td className="adtb-td adtb-td--right ckad-num">{money(r.netMinor, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="adst-label">Nothing in this period.</p>}
        </Card>

        <Card title="Granted free" description="Value foregone — access given without payment.">
          {(summary?.grants || []).length ? (
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
    </div>
  );
}
