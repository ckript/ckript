import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/financeApi";

/**
 * Data for the payment sections that moved out of the admin console.
 *
 * Deliberately mirrors the SHAPE the sections already consumed in AdminDashboard — `rows`, `page`,
 * `total`, `totalPages`, a search string and a `refresh()` — so each section moved across without
 * its rendering being rewritten. What changed is only where the data comes from: `/api/finance/*`
 * behind financeOnly, rather than `/api/admin/*` behind adminOnly.
 *
 * One section is loaded at a time (the shell renders one), so this fetches for the active section
 * only. Requests are cancel-guarded: switching sections mid-flight must never let a stale response
 * overwrite the new section's rows.
 */

/**
 * Section key → the endpoint and the response field its rows live under.
 *
 * `pagesKey` exists because the two families of endpoint disagree. The ones reused from the admin
 * controllers answer with `totalPages`; the ledger endpoints, written later, answer with `pages`.
 * Naming it per source beats normalising server-side, which would mean changing a response shape
 * the admin console still reads.
 *
 * `searchable: false` marks a source whose endpoint ignores a search term. The shell hides its
 * search box rather than offering a field that silently does nothing.
 */
const SOURCES = {
  payments: { url: "/finance/payments", key: "transactions" },
  // Challenge entries come from the LEDGER, not from Transaction or Invoice, and that is the whole
  // point: the ledger is the only source that records a free entry alongside a paid one. A
  // third-party or admin-granted entry writes no payment and no invoice, so a Challenges section
  // built on either would show a competition as emptier than it was.
  challenges: {
    url: "/finance/entries",
    key: "entries",
    pagesKey: "pages",
    searchable: false,
    params: { kind: "competition_registration" },
  },
  // Filterable by `documentType` (tax_invoice / credit_note / legacy_invoice / access_confirmation),
  // passed through `filters` — FinanceHome owns that choice.
  invoices: { url: "/finance/invoices", key: "invoices" },
  purchases: { url: "/finance/purchases", key: "scripts" },
  // Written with the tax work, so they answer in the ledger family's shape (`rows` + `pages`) and
  // take no search term.
  consultations: { url: "/finance/consultations", key: "rows", pagesKey: "pages", searchable: false },
  plans: { url: "/finance/plans", key: "rows", pagesKey: "pages", searchable: false },
  premium: { url: "/finance/users", key: "users", params: { isPremium: true, role: "investor" } },
  "writer-plans": { url: "/finance/users", key: "users", params: { hasActiveWriterPlan: true } },
  "bank-reviews": { url: "/finance/bank-reviews", key: "reviews" },
};

/**
 * `filters` — extra query parameters for the active section (the invoices document-type filter). Pass
 * a memoised object: a new identity on every render would re-fetch on every render.
 */
export default function useFinanceData(section, search, filters = null) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // Reset to page 1 when the section or search term changes — adjusted DURING RENDER, which is the
  // pattern React sanctions for "derive state from a changed input". Doing it in an effect would
  // fetch page 3 of the new section first and then correct itself, showing a wrong result set for
  // one round trip.
  //
  // `loading` is raised in the same pass: until the new section's rows arrive, the rows held are the
  // PREVIOUS section's, and handing them to the new section's columns would render one table's data
  // under another's headings for a round trip.
  const queryKey = `${section || ""}|${search || ""}|${JSON.stringify(filters || {})}`;
  const [lastQueryKey, setLastQueryKey] = useState(queryKey);
  if (queryKey !== lastQueryKey) {
    setLastQueryKey(queryKey);
    setPage(1);
    setLoading(true);
  }

  const source = section ? SOURCES[section] : null;

  useEffect(() => {
    if (!source) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get(source.url, {
          params: {
            page,
            search: source.searchable === false ? undefined : search || undefined,
            ...(source.params || {}),
            ...(filters || {}),
          },
        });
        if (cancelled) return;
        setRows(Array.isArray(data?.[source.key]) ? data[source.key] : []);
        setTotal(Number(data?.total) || 0);
        setTotalPages(Number(data?.[source.pagesKey || "totalPages"]) || 1);
        setError("");
      } catch (err) {
        // A superseded request must never overwrite the state of the one that replaced it.
        if (!cancelled) {
          setError(err?.response?.data?.message || "Could not load this section.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [source, page, search, filters, reloadToken]);

  /** Re-fetch after a control action (a grant, a bank-review decision) changes the data. */
  const refresh = useCallback(() => { setLoading(true); setReloadToken((t) => t + 1); }, []);
  const goToPage = useCallback((next) => { setLoading(true); setPage(next); }, []);

  return useMemo(() => ({
    // With no active section (the ledger tab owns its own data) this reports an empty, settled
    // state rather than whatever the previously-viewed section left behind.
    rows: source ? rows : [],
    total: source ? total : 0,
    totalPages: source ? totalPages : 1,
    loading: source ? loading : false,
    error: source ? error : "",
    page,
    /** False when this section's endpoint ignores a search term, so the shell can hide the box. */
    searchable: source ? source.searchable !== false : false,
    refresh,
    setPage: goToPage,
  }), [source, rows, total, totalPages, loading, error, page, refresh, goToPage]);
}
