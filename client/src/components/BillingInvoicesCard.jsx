import { useEffect, useState } from "react";
import api from "../services/api";
import { formatSubunits } from "../utils/currency";
import { fetchInvoicePdf } from "../pages/script-detail/checkout";
import BillingDetailsForm from "./checkout/BillingDetailsForm";
import useBillingDetails from "./checkout/useBillingDetails";
import { billingErrors, billingSummary, saveBillingProfile } from "../utils/taxes";
import "./checkout/Checkout.css";

/* Settings: "Billing & invoices". The buyer's billing details (who tax invoices are addressed to) and
   every document they have been issued — tax invoices, credit notes, access confirmations — with a
   PDF for each. Wording: "Taxes" and "Business tax ID", never GST. */

const money = (minor, currency) => formatSubunits(minor, currency || "INR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export default function BillingInvoicesCard({ dark = false }) {
  const details = useBillingDetails();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [page, setPage] = useState(1);
  const [invoices, setInvoices] = useState({ items: [], total: 0, loading: true });
  const [opening, setOpening] = useState("");

  useEffect(() => {
    let alive = true;
    api.get("/invoices", { params: { page, limit: 10 } })
      .then(({ data }) => { if (alive) setInvoices({ items: data?.items || [], total: data?.total || 0, loading: false }); })
      .catch(() => { if (alive) setInvoices({ items: [], total: 0, loading: false }); });
    return () => { alive = false; };
  }, [page]);

  const save = async () => {
    if (!details.billing) return;
    if (Object.keys(billingErrors(details.billing)).length) {
      details.setEditing(true);
      details.prepare();
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await saveBillingProfile(details.billing);
      details.setEditing(false);
      setNotice({ ok: true, text: "Billing details saved. New invoices will use them." });
    } catch (err) {
      setNotice({ ok: false, text: err?.response?.data?.message || "Could not save your billing details." });
    } finally {
      setSaving(false);
    }
  };

  const openPdf = async (invoice) => {
    setOpening(invoice._id);
    const result = await fetchInvoicePdf({ invoiceId: invoice._id, download: true });
    setOpening("");
    if (!result?.ok || !result.data) {
      setNotice({ ok: false, text: result?.message || "Could not open that document." });
      return;
    }
    const url = URL.createObjectURL(result.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(invoice.number || "invoice").replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const box = dark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-100 bg-gray-50/60";
  const muted = dark ? "text-white/40" : "text-gray-500";
  const strong = dark ? "text-white/80" : "text-gray-800";
  const pages = Math.max(1, Math.ceil(invoices.total / 10));

  return (
    <div className={`flex flex-col gap-4 py-3 px-4 rounded-xl border ${box}`}>
      <div className={`ckx-co${dark ? " ckx-co--dark" : ""}`}>
        <div className="ckx-co__billing-head">
          <span className="ckx-co__label">Billing details</span>
          {details.billing && !details.editing ? (
            <button type="button" className="ckx-co__link" onClick={() => details.setEditing(true)}>
              {details.saved ? "Edit" : "Add"}
            </button>
          ) : null}
        </div>
        {!details.billing ? (
          <div className="ckx-co__skeleton" style={{ height: 40 }} role="status" aria-label="Loading billing details" />
        ) : details.editing ? (
          <>
            <BillingDetailsForm value={details.billing} onChange={details.setBilling} states={details.states} showErrors={details.showErrors} embedded />
            <div className="ckx-co__actions">
              {details.saved ? (
                <button type="button" className="ckx-co__back" onClick={() => details.setEditing(false)} disabled={saving}>Cancel</button>
              ) : null}
              <button type="button" className="ckx-co__pay" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save billing details"}</button>
            </div>
          </>
        ) : (
          <div className="ckx-co__summary">
            {details.saved ? billingSummary(details.billing, details.states) : "Add the name and address your tax invoices should carry. Businesses can add a business tax ID."}
          </div>
        )}
        {notice ? <p className="ckx-co__note" role="status" style={{ color: notice.ok ? undefined : "#c2410c" }}>{notice.text}</p> : null}
      </div>

      <div>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${muted}`}>Invoices</p>
        {invoices.loading ? (
          <p className={`text-[12px] ${muted}`}>Loading…</p>
        ) : !invoices.items.length ? (
          <p className={`text-[12px] ${muted}`}>No invoices yet. Every payment you make issues one here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invoices.items.map((inv) => (
              <li key={inv._id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${dark ? "border-white/[0.06]" : "border-gray-200 bg-white"}`}>
                <div className="min-w-0">
                  <p className={`text-[13px] font-semibold truncate ${strong}`}>
                    {inv.documentLabel} {inv.number}
                  </p>
                  <p className={`text-[11px] truncate ${muted}`}>
                    {[day(inv.date), inv.kindLabel, inv.title, inv.againstNumber ? `against ${inv.againstNumber}` : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className={`text-[13px] font-semibold ${strong}`}>{money(inv.totalMinor, inv.currency)}</p>
                    {inv.taxMinor ? <p className={`text-[11px] ${muted}`}>incl. {money(Math.abs(inv.taxMinor), inv.currency)} taxes</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => openPdf(inv)}
                    disabled={opening === inv._id}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-60 ${dark ? "border-white/10 text-white/70 hover:bg-white/[0.06]" : "border-gray-200 text-gray-600 hover:bg-gray-100"}`}
                  >
                    {opening === inv._id ? "…" : "PDF"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <div className={`mt-2 flex items-center justify-end gap-2 text-[12px] ${muted}`}>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Previous</button>
            <span>{page} / {pages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>Next</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
