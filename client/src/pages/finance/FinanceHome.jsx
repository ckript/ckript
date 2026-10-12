import { useContext, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import api from "../../services/financeApi";
import { resolveEffectiveUser } from "../../utils/adminSession";
import AdminShell from "../admin/shell/AdminShell";
import { Pager, ToastProvider, useToast } from "../admin/ui";
import useFinanceData from "./useFinanceData";
import useFinanceActions from "./useFinanceActions";
import LedgerSection from "./LedgerSection";
import TaxesSection from "./TaxesSection";
import {
  PaymentsTable, ChallengesTable, InvoicesTable, PurchasesTable, ConsultationsTable, PlansTable,
  PremiumTable, WriterPlansTable, BankReviewsTable,
} from "./FinanceSections";

/**
 * /finance — the product's payments home.
 *
 * Every payment surface lives HERE now, not in the admin console: transactions, invoices, script
 * purchases, premium subscribers, writer plans and bank-detail reviews, alongside the ledger
 * summary. One page, two audiences:
 *
 *   finance (the accountant)  reads everything, changes nothing
 *   admin                     the same page plus the control actions that used to sit in /admin
 *
 * The split is enforced server-side — reads are financeOnly, the control endpoints stay adminOnly
 * — so `canControl` below only decides what to RENDER. A finance user who forged the request would
 * still be refused.
 *
 * Taxes: every payment now carries 18% taxes. Overview, Transactions, Invoices, Script purchases and
 * Challenges show them; Consultations and Plans are their own tabs; the Taxes tab holds the returns
 * (GSTR-1, GSTR-3B), the document register, reconciliation and the gap back-fill. The admin-only tax
 * controls — Refund (Overview), Issue back-fill invoices and the period lock (Taxes) — ride on the
 * same `actions` prop as every other control.
 */

const SECTIONS = [
  { key: "ledger", label: "Overview", icon: "M3 3v18h18M7 14l3-3 2.25 2.25L17 8" },
  { key: "payments", label: "Transactions", icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" },
  { key: "challenges", label: "Challenges", icon: "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25s4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" },
  { key: "invoices", label: "Invoices", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H6.75A2.25 2.25 0 004.5 4.5v15A2.25 2.25 0 006.75 21.75h10.5A2.25 2.25 0 0019.5 19.5v-1.125M15 12h-6m6 3h-6" },
  { key: "purchases", label: "Script purchases", icon: "M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272" },
  { key: "premium", label: "Premium subscribers", icon: "M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557L3.04 10.386a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" },
  { key: "writer-plans", label: "Writer plans", icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" },
  { key: "bank-reviews", label: "Bank reviews", icon: "M3.75 4.5h16.5A1.5 1.5 0 0121.75 6v12a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 011.5-1.5zM6 9h12M6 13.5h5.25" },
  { key: "taxes", label: "Taxes", icon: "M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm4.5 4.5h.008v.008h-.008V13.5z" },
  { key: "consultations", label: "Consultations", icon: "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" },
  { key: "plans", label: "Plans", icon: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" },
];

/** Sections that fetch their own data (several endpoints, a month picker) rather than one paged list. */
const SELF_LOADING = new Set(["ledger", "taxes"]);

/**
 * Grouped by key rather than by index slice.
 *
 * The slices these replace (`SECTIONS.slice(1, 4)`) silently reshuffled the whole sidebar the moment
 * a section was inserted anywhere but the end — adding Challenges after Transactions pushed
 * "Purchases" into the Subscriptions group with nothing to indicate it. Naming the members makes an
 * insertion a local edit and a typo a visible one.
 */
const GROUPS = [
  { title: "", keys: ["ledger", "taxes"] },
  { title: "Records", keys: ["payments", "challenges", "invoices", "purchases", "consultations"] },
  { title: "Subscriptions", keys: ["plans", "premium", "writer-plans", "bank-reviews"] },
];

const NAV_GROUPS = GROUPS.map(({ title, keys }) => ({
  title,
  items: keys.map((key) => SECTIONS.find((s) => s.key === key)).filter(Boolean),
}));

function FinanceWorkspace({ canControl }) {
  const [section, setSection] = useState("ledger");
  const [search, setSearch] = useState("");
  const [invoiceType, setInvoiceType] = useState("");
  const toast = useToast();

  // Memoised: useFinanceData re-fetches when this object changes identity.
  const filters = useMemo(
    () => (section === "invoices" && invoiceType ? { documentType: invoiceType } : null),
    [section, invoiceType],
  );
  const data = useFinanceData(SELF_LOADING.has(section) ? null : section, search, filters);
  const actions = useFinanceActions({
    refresh: data.refresh,
    onResult: (message, tone) => (tone === "error" ? toast.error(message) : toast.success(message)),
  });

  // Invoice PDFs stream through the authenticated client — the endpoint is behind `protect`, so a
  // plain link would 401.
  const openInvoicePdf = useMemo(() => async (invoice, mode) => {
    try {
      const { data: blob } = await api.get(`/invoices/${invoice._id}/pdf`, {
        params: mode === "download" ? { download: 1 } : {},
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      if (mode === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${invoice.invoiceNumber || "invoice"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not open that invoice.");
    }
  }, [toast]);

  const shared = {
    rows: data.rows,
    total: data.total,
    loading: data.loading,
    error: data.error,
    onRetry: data.refresh,
  };

  // The one switch between the two audiences: null for the finance role, the controls for an admin.
  const controls = canControl ? actions : null;

  const body = (() => {
    switch (section) {
      case "ledger": return <LedgerSection actions={controls} onOpenPdf={openInvoicePdf} />;
      case "taxes": return <TaxesSection actions={controls} onOpenPdf={openInvoicePdf} />;
      case "payments": return <PaymentsTable {...shared} />;
      case "challenges": return <ChallengesTable {...shared} onOpenPdf={openInvoicePdf} />;
      case "invoices": return (
        <InvoicesTable {...shared} onOpenPdf={openInvoicePdf}
          documentType={invoiceType} onDocumentTypeChange={setInvoiceType} />
      );
      case "purchases": return <PurchasesTable {...shared} />;
      case "consultations": return <ConsultationsTable {...shared} />;
      case "plans": return <PlansTable {...shared} />;
      case "premium": return <PremiumTable {...shared} actions={controls} />;
      case "writer-plans": return <WriterPlansTable {...shared} actions={controls} />;
      case "bank-reviews": return <BankReviewsTable {...shared} actions={controls} />;
      default: return null;
    }
  })();

  const label = SECTIONS.find((s) => s.key === section)?.label || "Overview";

  return (
    <AdminShell
      brand="Ckript Payments"
      groups={NAV_GROUPS}
      activeKey={section}
      onNavigate={setSection}
      crumbs={[label]}
      searchValue={search}
      onSearchChange={data.searchable ? (e) => setSearch(e.target.value) : null}
      searchPlaceholder={`Search ${label.toLowerCase()}`}
    >
      {body}
      {SELF_LOADING.has(section) ? null : (
        <Pager
          page={data.page}
          totalPages={data.totalPages}
          onPageChange={data.setPage}
          disabled={data.loading}
          label={label.toLowerCase()}
        />
      )}
    </AdminShell>
  );
}

export default function FinanceHome() {
  const { user: signedInUser } = useContext(AuthContext) || {};

  // An admin normally arrives here from the console, where signing in with the access code stores
  // the session in sessionStorage and leaves the ordinary localStorage login alone. Asking only
  // AuthContext meant that admin was greeted as whoever was signed in normally — usually their own
  // account, with no finance role — and turned away from a page they administer. Read on every
  // render rather than once, so signing in or out of the console lands without a reload.
  const user = resolveEffectiveUser(signedInUser);
  const role = String(user?.role || "");
  const allowed = role === "finance" || role === "admin";

  if (!allowed) {
    return (
      <div className="ckad" style={{ padding: 40 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Payments</h1>
        <p style={{ marginTop: 8, maxWidth: "60ch", lineHeight: 1.6 }}>
          This page is for finance accounts.
          {user ? ` You are signed in as ${user.name || user.email} (${role}).` : " You are not signed in."}
          {" "}Ask an administrator for finance access.
        </p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <FinanceWorkspace canControl={role === "admin"} />
    </ToastProvider>
  );
}
