/*
 * ProducerDashboardPage — "The Ledger", the industry audience's /dashboard.
 *
 * WHAT THIS PAGE IS
 * -----------------
 * A producer's deal book. One list holds every option they are holding and
 * every purchase request they have sent; around it sit the money that moved,
 * the writers whose contacts they have spent credits on, the brief those
 * matches are drawn from and this cycle's quotas.
 *
 * It replaces the KPI-tiles-and-cards dashboard that shipped here before. That
 * page was written in a dark-navy Tailwind palette while the shell around it is
 * the cream/terracotta "Broadsheet" system, so the chrome and the content read
 * as two different products; and its four tiles could not answer the question a
 * producer actually opens this page with — what needs a decision today.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * Five endpoints, all pre-existing, fetched with `allSettled` so one failure
 * degrades one region instead of blanking the page:
 *
 *   /dashboard/investor              stats · marketPulse · activeHolds ·
 *                                    recentDeals · matchedScripts · industryProfile
 *   /scripts/purchase-requests/mine  the requests this account has sent
 *   /transactions/wallet/balance     wallet
 *   /transactions?limit=10           the money table
 *   /users/watchlist                 saved scripts
 *
 * Presentation lives in ProducerDashboardPage.css (scoped to `.ck-ledger`, no
 * shared variables); derivation lives in producerLedger.js, which is unit
 * tested. This file is fetching, state and wiring.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not offer, price or pay for anything. The purchase flow has terms,
 * escrow, a payment provider and a rights summary, and it already exists on the
 * script's own page — so the drawer's primary action opens that page rather
 * than growing a second copy of the same business logic here.
 */
import {
  useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { AuthContext } from "../../context/AuthContext";
import MeetingModal from "../../components/MeetingModal";
import { MatIcon } from "../../layouts/app-shell/navigation/icons.jsx";
import { getScriptCanonicalPath } from "../../utils/scriptPath";
import { getProfileCanonicalPath } from "../../utils/profilePath";
import {
  getContactsLimit,
  getMeetingsLimit,
  getMessageWritersLimit,
  getMessagedWritersCount,
  getRemainingContacts,
  getRevealedContactCount,
  getScheduledMeetingsCount,
  hasAnyFipAccess,
  hasRevealedContact,
} from "../../utils/industryAccess";
import {
  SORT_OPTIONS,
  STATUS_FILTERS,
  buildBoardStats,
  buildCapital,
  buildDealRows,
  buildGenreBars,
  buildLedgerCsv,
  buildLedgerLine,
  buildMandateGroups,
  buildQuotas,
  buildScoreIndex,
  filterDeals,
  formatDateline,
  formatInr,
  formatShortInr,
  getFirstName,
  getGreeting,
  getInitials,
  formatDesk,
  presentDeal,
  presentTransaction,
  sortDeals,
} from "./producerLedger";
import { loadIndustryDashboard } from "./industryDashboard";
import { releaseOfferHold } from "./offerHolds";
import { revealWriterContact } from "../../pages/script-detail/projectActions";
import LedgerDealRow from "./components/LedgerDealRow";
import LedgerAside from "./components/LedgerAside";
import LedgerDetailDrawer from "./components/LedgerDetailDrawer";
import LedgerConfirmDialog from "./components/LedgerConfirmDialog";
import "./ProducerDashboardPage.css";

/*
 * Short in the tab strip, long in the section heading beneath it — the design
 * carries the full editorial title ("The writers' room") once, in the H2, and
 * keeps the strip itself terse. Only the first three carry a count; a count on
 * Finance or Market would be a number with no obvious unit.
 */
const TABS = [
  { key: "deals", label: "Deal book", counted: true },
  { key: "matched", label: "Matched scripts", counted: true },
  { key: "writers", label: "Writers", counted: true },
  { key: "finance", label: "Finance", counted: false },
  { key: "market", label: "Market", counted: false },
  { key: "consultations", label: "Consultations", counted: true },
];

const PER_PAGE_OPTIONS = [4, 6, 10];

/*
 * A matched script is not a deal — nothing has been agreed — but it is shown in
 * the same card, so it is adapted to the same shape here. `canRelease` and
 * `canDownloadPdf` are false, which is what makes those two menu entries render
 * disabled rather than lying about what they would do.
 */
const presentMatch = (script) => {
  const score = Number.isFinite(Number(script?.scriptScore?.overall))
    ? Number(script.scriptScore.overall)
    : null;
  const parts = [script?.genre, String(script?.contentType || "").replace(/_/g, " "), script?.creator?.name]
    .filter(Boolean);
  if (score != null) parts.push(`score ${score}`);

  return {
    id: `match:${script._id}`,
    recordId: String(script._id),
    kind: "match",
    kindLabel: "Matched to your brief",
    script,
    scriptId: String(script?._id || ""),
    title: script?.title || "Untitled project",
    genre: script?.genre || "",
    contentType: String(script?.contentType || "").replace(/_/g, " "),
    logline: script?.logline || "",
    writer: script?.creator?.name || "",
    writerId: String(script?.creator?._id || ""),
    score,
    fee: Number(script?.budget || script?.price || 0),
    status: "available",
    startDate: script?.createdAt || null,
    endDate: null,
    daysRemaining: null,
    canRelease: false,
    canDownloadPdf: false,
    purchaseRequestId: null,
    // Presentation fields LedgerDealRow expects from presentDeal().
    urgent: false,
    tone: "neutral",
    statusLabel: "Available",
    metaLine: parts.join(" · "),
    feeText: Number(script?.budget || script?.price || 0) > 0
      ? formatInr(script?.budget || script?.price)
      : "Ask on file",
    marker: score == null ? "—" : String(score),
    dateText: `${Number(script?.views || 0).toLocaleString("en-IN")} views`,
    primaryLabel: "Open",
  };
};

const ProducerDashboardPage = () => {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  // ── Server state ──────────────────────────────────────────────────────────
  const [dash, setDash] = useState(null);
  const [dashFailed, setDashFailed] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [failures, setFailures] = useState({});
  const [revealedWriters, setRevealedWriters] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── View state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("deals");
  const [statuses, setStatuses] = useState([]);
  const [sort, setSort] = useState("days");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(6);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);

  // ── Transient surfaces ────────────────────────────────────────────────────
  const [openMenu, setOpenMenu] = useState(null);   // "sort" | "page" | deal id
  const [detailId, setDetailId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [meeting, setMeeting] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actioningId, setActioningId] = useState(null);
  const [needsCalendar, setNeedsCalendar] = useState(false);

  // ── Fetching ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const result = await loadIndustryDashboard();
    if (result.ok) {
      const next = result.data;
      if (!next.failures.dash) setDash(next.dash);
      if (!next.failures.wallet) setWallet(next.wallet);
      if (!next.failures.transactions) setTransactions(next.transactions);
      if (!next.failures.requests) setPurchaseRequests(next.purchaseRequests);
      if (!next.failures.consultations) setConsultations(next.consultations);
      if (!next.failures.watchlist) setWatchlist(next.watchlist);
      setFailures(next.failures || {});
      setDashFailed(Boolean(next.failures.dash));
      setSyncedAt(next.syncedAt);
    } else {
      setDashFailed(true);
      setSyncedAt(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /*
   * The writers' room is the people behind `subscription.revealedContacts` —
   * ids, so each one needs a lookup. Depends on the id list rather than on
   * `user`, or every unrelated auth refresh would re-fetch every profile.
   */
  const revealedIds = useMemo(() => (
    (user?.subscription?.revealedContacts || [])
      .filter((entry) => entry?.writerId)
      .map((entry) => ({ id: String(entry.writerId), revealedAt: entry.revealedAt }))
  ), [user?.subscription?.revealedContacts]);
  const revealedKey = revealedIds.map((entry) => entry.id).join(",");

  useEffect(() => {
    if (!revealedIds.length) {
      setRevealedWriters([]);
      return undefined;
    }
    let disposed = false;
    (async () => {
      const results = await Promise.allSettled(
        revealedIds.map((entry) => api.get(`/users/${entry.id}`))
      );
      if (disposed) return;
      setRevealedWriters(results.map((result, index) => {
        if (result.status !== "fulfilled") return null;
        const writer = result.value.data?.user || result.value.data;
        return writer ? { ...writer, revealedAt: revealedIds[index].revealedAt } : null;
      }).filter(Boolean));
    })();
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedKey]);

  // Any click outside an open popover closes it — one listener, not one per menu.
  useEffect(() => {
    if (!openMenu) return undefined;
    const onPointerDown = (event) => {
      if (!event.target.closest?.(".ck-ledger__menu-anchor")) setOpenMenu(null);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") setOpenMenu(null); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  // ── Derived ───────────────────────────────────────────────────────────────
  /*
   * `dash?.stats || {}` makes a NEW object on every render, so anything
   * downstream that memoises on it never hits its cache. Each fallback gets its
   * own useMemo so the identity is stable between fetches.
   */
  const stats = useMemo(() => dash?.stats || {}, [dash]);
  const marketPulse = useMemo(() => dash?.marketPulse || {}, [dash]);
  const industryProfile = useMemo(() => dash?.industryProfile || {}, [dash]);
  const mandates = useMemo(() => industryProfile?.mandates || {}, [industryProfile]);
  const matchedScripts = useMemo(() => dash?.matchedScripts || [], [dash]);
  const walletBalance = wallet?.balance ?? wallet?.wallet?.balance ?? 0;

  const scoreIndex = useMemo(() => buildScoreIndex(dash || {}), [dash]);
  const allDeals = useMemo(() => buildDealRows({
    recentDeals: dash?.recentDeals,
    activeHolds: dash?.activeHolds,
    purchaseRequests,
    scoreIndex,
  }), [dash?.recentDeals, dash?.activeHolds, purchaseRequests, scoreIndex]);

  const dealRows = useMemo(
    () => sortDeals(filterDeals(allDeals, statuses), sort).map(presentDeal),
    [allDeals, statuses, sort]
  );
  const matchRows = useMemo(() => matchedScripts.map(presentMatch), [matchedScripts]);

  const rows = tab === "matched" ? matchRows : dealRows;
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * perPage, currentPage * perPage);

  const locked = !hasAnyFipAccess(user);
  const quotaData = useMemo(() => buildQuotas({
    contacts: { used: getRevealedContactCount(user), limit: getContactsLimit(user) },
    messages: { used: getMessagedWritersCount(user), limit: getMessageWritersLimit(user) },
    meetings: { used: getScheduledMeetingsCount(user), limit: getMeetingsLimit(user) },
  }), [user]);
  const contactsBlocked = quotaData[0].blocked;
  const meetingsBlocked = quotaData[2].blocked;

  const boardStats = useMemo(
    () => buildBoardStats({ stats, deals: allDeals, walletBalance, statsKnown: Boolean(dash) }),
    [stats, allDeals, walletBalance, dash]
  );
  const capital = useMemo(
    () => buildCapital({ stats, walletBalance, dealCount: allDeals.length }),
    [stats, walletBalance, allDeals.length]
  );
  const mandateGroups = useMemo(() => buildMandateGroups(mandates), [mandates]);
  const genreBars = useMemo(() => buildGenreBars(matchedScripts), [matchedScripts]);
  const watchedIds = useMemo(
    () => new Set(watchlist.map((script) => String(script._id))),
    [watchlist]
  );

  const firstName = getFirstName(user);
  const desk = formatDesk(industryProfile, user?.role);
  const profileEditPath = getProfileCanonicalPath(user, { viewerId: user?._id, viewerRole: user?.role });
  const completion = user?.profileCompletion;
  const showBanner = Boolean(completion) && !completion.isComplete && !bannerDismissed;

  const detailDeal = useMemo(
    () => [...dealRows, ...matchRows].find((row) => row.id === detailId) || null,
    [dealRows, matchRows, detailId]
  );

  const isEmpty = !loading
    && allDeals.length === 0
    && matchedScripts.length === 0
    && transactions.length === 0;

  const market = {
    newThisWeek: Number(marketPulse.newThisWeek || 0).toLocaleString("en-IN"),
    availableText: Number(marketPulse.available || 0).toLocaleString("en-IN"),
    totalText: Number(marketPulse.totalScripts || 0).toLocaleString("en-IN"),
    genres: genreBars,
  };

  const tabCounts = {
    deals: allDeals.length,
    consultations: consultations.filter(c => c.status === "awaiting_response").length,
    matched: matchedScripts.length,
    writers: revealedWriters.length,
    finance: transactions.length,
    market: Number(marketPulse.newThisWeek || 0),
  };

  // ── Paths ─────────────────────────────────────────────────────────────────
  const scriptPathFor = useCallback((script) => (
    script?._id ? getScriptCanonicalPath(script) : ""
  ), []);
  const messagePathFor = (deal) => (deal.writerId
    ? `/messages?recipientId=${deal.writerId}&recipientName=${encodeURIComponent(deal.writer || "Writer")}`
    : "");
  const writerPathFor = (writer) => getProfileCanonicalPath(writer, {
    viewerId: user?._id,
    viewerRole: user?.role,
  });

  // ── Actions ───────────────────────────────────────────────────────────────
  const closeMenus = () => setOpenMenu(null);

  
  const handleConnectCalendar = async () => {
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const { data } = await api.post("/google-calendar/auth-url", { returnTo });
      window.location.href = data.url;
    } catch (error) {
      setActionError("Couldn't connect to Google Calendar at this time.");
    }
  };

  const handleAcceptConsultation = async (id) => {
    setActioningId(id + "_accept");
    setNeedsCalendar(false);
    setActionError("");
    try {
      await api.post(`/consultations/${id}/accept`);
      setConsultations(prev => prev.map(c => c._id === id ? { ...c, status: "accepted" } : c));
    } catch (error) {
      if (error?.response?.status === 428) {
        setNeedsCalendar(true);
      }
      setActionError(error?.response?.data?.message || "Couldn't accept consultation.");
    } finally {
      setActioningId(null);
    }
  };
  const handleRejectConsultation = async (id) => {
    setActioningId(id + "_reject");
    try {
      await api.post(`/consultations/${id}/reject`, { reason: "Declined" });
      setConsultations(prev => prev.map(c => c._id === id ? { ...c, status: "rejected" } : c));
    } catch (error) {
      setActionError(error?.response?.data?.message || "Couldn't reject consultation.");
    } finally {
      setActioningId(null);
    }
  };

  const handleRefresh = () => {
    closeMenus();
    setActionError("");
    fetchAll();
  };

  const handleOpenDeal = (deal) => {
    closeMenus();
    setDetailId(deal.id);
  };

  const handleMessage = (deal) => {
    closeMenus();
    const path = messagePathFor(deal);
    if (path) navigate(path);
  };

  const handleToggleWatch = async (deal) => {
    closeMenus();
    if (!deal.scriptId) return;
    const watched = watchedIds.has(deal.scriptId);
    setActionError("");
    try {
      await api.post(`/users/watchlist/${watched ? "remove" : "add"}`, { scriptId: deal.scriptId });
      const { data } = await api.get("/users/watchlist");
      setWatchlist(Array.isArray(data) ? data : []);
    } catch (error) {
      setActionError(error?.response?.data?.message || "Couldn't update your watchlist.");
    }
  };

  const handleDownloadPdf = async (deal) => {
    closeMenus();
    if (!deal.purchaseRequestId) return;
    setActionError("");
    try {
      const response = await api.get(
        `/scripts/purchase-request/${deal.purchaseRequestId}/acceptance-pdf?download=1`,
        { responseType: "blob" }
      );
      const objectUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const safeTitle = String(deal.title || "script").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "script";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${safeTitle}_accepted_terms.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      setActionError(error?.response?.data?.message || "Couldn't download the acceptance PDF.");
    }
  };

  const handleExportCsv = () => {
    closeMenus();
    const csv = buildLedgerCsv(allDeals);
    const objectUrl = window.URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `ckript_deal_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
  };

  /*
   * Releasing an option cancels it and does not refund the fee, and revealing a
   * contact spends a credit that does not come back. Both go through the
   * confirm dialog; neither is fired straight off a menu click.
   */
  const askRelease = (deal) => {
    closeMenus();
    setConfirmError("");
    setConfirm({
      kind: "release",
      deal,
      eyebrow: "Cancel option",
      title: `Release your option on ${deal.title}?`,
      body: "The script goes back on the market immediately and the option fee is not refunded. This cannot be undone.",
      confirmLabel: "Cancel option",
    });
  };

  const askReveal = (deal) => {
    closeMenus();
    setConfirmError("");
    setConfirm({
      kind: "reveal",
      deal,
      eyebrow: "Reveal contact",
      title: `Reveal ${deal.writer || "this writer"}'s contact details?`,
      body: `This spends one reveal credit. You have ${getRemainingContacts(user)} left in this cycle.`,
      confirmLabel: "Use 1 credit",
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    setConfirmError("");
    try {
      if (confirm.kind === "release") {
        const result = await releaseOfferHold({
          holdId: confirm.deal.recordId || confirm.deal.id,
          scriptId: confirm.deal.scriptId,
        });
        if (!result.ok) throw Object.assign(new Error(result.message), { response: { data: { message: result.message } } });
        setDetailId(null);
        await fetchAll();
      } else {
        const result = await revealWriterContact({ writerId: confirm.deal.writerId });
        if (!result.ok) throw Object.assign(new Error(result.message), { response: { data: { message: result.message } } });
        const data = result.data;
        /*
         * Reflect the spend in the session immediately so the quota meter and
         * the menu's disabled state agree with the server without a reload.
         */
        if (data?.contactsUsed !== undefined) {
          setUser((previous) => (previous ? {
            ...previous,
            subscription: {
              ...(previous.subscription || {}),
                revealedContacts: (() => {
                  const rows = Array.isArray(previous.subscription?.revealedContacts)
                    ? previous.subscription.revealedContacts
                    : [];
                  return rows.some((entry) => String(entry?.writerId || "") === String(confirm.deal.writerId))
                    ? rows
                    : [...rows, { writerId: confirm.deal.writerId, revealedAt: new Date().toISOString() }];
                })(),
            },
          } : previous));
        }
      }
      setConfirm(null);
    } catch (error) {
      setConfirmError(error?.response?.data?.message || "That didn't go through. Try again.");
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleMeeting = (deal) => {
    closeMenus();
    if (!deal.scriptId || !deal.writerId) return;
    setMeeting({
      writerId: deal.writerId,
      scriptId: deal.scriptId,
      writerName: deal.writer,
      scriptName: deal.title,
    });
  };

  const toggleStatus = (key) => {
    setPage(1);
    setStatuses((current) => (
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    ));
  };

  const selectTab = (key) => {
    closeMenus();
    setTab(key);
    setPage(1);
  };

  // ── Section renderers ─────────────────────────────────────────────────────
  const writersLine = [
    `${revealedWriters.length} contact${revealedWriters.length === 1 ? "" : "s"} unlocked`,
    `${getRemainingContacts(user)} reveal credit${getRemainingContacts(user) === 1 ? "" : "s"} left`,
    `${quotaData[1].value} writers messaged`,
  ].join(" · ");

  const writersBlock = (lead) => (
    <section className={`ck-ledger__block${lead ? " ck-ledger__block--lead" : ""}`}>
      <div className="ck-ledger__block-head">
        <div>
          <h2 className="ck-ledger__block-title">The writers’ room</h2>
          <p className="ck-ledger__block-sub">{writersLine}</p>
        </div>
        <Link to="/messages" className="ck-ledger__btn ck-ledger__btn--sm">Open messages</Link>
      </div>

      {revealedWriters.length === 0 ? (
        <p className="ck-ledger__block-sub" style={{ margin: 0 }}>
          No contacts unlocked yet. Reveal a writer from any deal&rsquo;s menu and they appear here.
        </p>
      ) : revealedWriters.map((writer) => {
        const profilePath = writerPathFor(writer);
        const bio = writer.bio || writer.genre || "Writer";
        return (
          <div key={writer._id} className="ck-ledger__writer">
            <Link to={profilePath} className="ck-ledger__avatar">
              {writer.profileImage
                ? <img src={writer.profileImage} alt="" />
                : getInitials(writer.name)}
            </Link>
            <div className="ck-ledger__writer-body">
              <div className="ck-ledger__writer-name">
                <Link to={profilePath}>{writer.name || "Writer"}</Link>
                {writer.revealedAt && (
                  <span className="ck-ledger__writer-flag">
                    revealed {new Date(writer.revealedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
              <p className="ck-ledger__writer-bio">{bio}</p>
            </div>
            {locked ? (
              <button type="button" className="ck-ledger__btn ck-ledger__btn--sm" disabled title="Renew access to message writers">
                <MatIcon name="forum" size={17} />
                Message
              </button>
            ) : (
              <Link
                to={`/messages?recipientId=${writer._id}&recipientName=${encodeURIComponent(writer.name || "Writer")}`}
                className="ck-ledger__btn ck-ledger__btn--sm"
              >
                <MatIcon name="forum" size={17} />
                Message
              </Link>
            )}
            <Link to={profilePath} className="ck-ledger__btn ck-ledger__btn--sm">Profile</Link>
          </div>
        );
      })}
    </section>
  );

  const moneyBlock = (lead) => (
    <section className={`ck-ledger__block ck-ledger__block--money${lead ? " ck-ledger__block--lead" : ""}`}>
      <div className="ck-ledger__block-head">
        <div>
          <h2 className="ck-ledger__block-title">Money in and out</h2>
          <p className="ck-ledger__block-sub">
            {failures.wallet ? "Wallet unavailable" : `${formatShortInr(walletBalance)} in wallet`}
            {` · ${formatShortInr(stats.totalInvested)} deployed`}
          </p>
        </div>
        <button type="button" className="ck-ledger__btn ck-ledger__btn--sm" onClick={handleExportCsv}>
          <MatIcon name="download" size={17} />
          Export CSV
        </button>
      </div>

      {failures.transactions ? (
        <div className="ck-ledger__notice" role="alert">
          <div className="ck-ledger__notice-body">
            <strong>Transaction history did not load.</strong>
            <span>{failures.transactions}</span>
          </div>
          <button type="button" className="ck-ledger__btn" onClick={handleRefresh}>Retry</button>
        </div>
      ) : transactions.length === 0 ? (
        <p className="ck-ledger__block-sub" style={{ margin: 0 }}>No transactions on this account yet.</p>
      ) : (
        <table className="ck-ledger__table">
          <thead>
            <tr>
              <th scope="col">Entry</th>
              <th scope="col">Date</th>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((txn) => {
              const row = presentTransaction(txn);
              return (
                <tr key={row.id}>
                  <td>{row.description}</td>
                  <td>{row.date}</td>
                  <td className={row.isCredit ? "ck-ledger__amount--credit" : undefined}>{row.amount}</td>
                  <td>
                    <span className={`ck-ledger__pill ck-ledger__pill--flat ck-ledger-tone--${row.tone}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );

  const marketBlock = (
    <section className="ck-ledger__block ck-ledger__block--lead">
      <div className="ck-ledger__block-head">
        <div>
          <h2 className="ck-ledger__block-title">Market pulse</h2>
          <p className="ck-ledger__block-sub">
            What is on the platform right now, and how much of it fits your brief.
          </p>
        </div>
        <Link to="/search" className="ck-ledger__btn ck-ledger__btn--sm">Search projects</Link>
      </div>

      <div className="ck-ledger__board" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {[
          { label: "New this week", value: market.newThisWeek, sub: "published in the last 7 days" },
          { label: "Available now", value: market.availableText, sub: "unsold and not on hold" },
          { label: "Total published", value: market.totalText, sub: "across every genre" },
        ].map((cell) => (
          <div key={cell.label} className="ck-ledger__board-cell">
            <div className="ck-ledger__label">{cell.label}</div>
            <div className="ck-ledger__board-value">{cell.value}</div>
            <div className="ck-ledger__board-sub">{cell.sub}</div>
          </div>
        ))}
      </div>

      {genreBars.length > 0 && (
        <table className="ck-ledger__table" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th scope="col">Genre</th>
              <th scope="col">Share of your matches</th>
              <th scope="col">Scripts</th>
            </tr>
          </thead>
          <tbody>
            {genreBars.map((genre) => (
              <tr key={genre.name}>
                <td>{genre.name}</td>
                <td>
                  <span className="ck-ledger__quota-bar" style={{ display: "block", maxWidth: 320 }}>
                    <span style={{ width: genre.pct, background: "#d14d37" }} />
                  </span>
                </td>
                <td>{genre.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  
  const consultationsBlock = (
    <div className="ck-ledger__section-head" style={{ marginTop: "24px" }}>
      <div>
        <h2 className="ck-ledger__section-title">Consultations</h2>
        <p className="ck-ledger__section-sub">Manage paid consultation requests from writers</p>
      </div>
            <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {actionError && (
          <div style={{ padding: "12px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: "8px" }}>
            <p style={{ margin: 0 }}>{actionError}</p>
            {needsCalendar && (
              <button onClick={handleConnectCalendar} style={{ marginTop: "8px", padding: "6px 12px", background: "#ef4444", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}>
                Connect Google Calendar
              </button>
            )}
          </div>
        )}
        {consultations.length === 0 && <p className="ck-ledger__section-sub">No consultations found.</p>}
        {consultations.map(c => (
          <div key={c._id} style={{ padding: "16px", border: "1px solid var(--ck-border)", borderRadius: "8px", background: "white" }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: "600" }}>{c.topic} (with {c.writer?.name || "Writer"})</h4>
            <div style={{ fontSize: "14px", color: "var(--ck-muted)", marginBottom: "16px" }}>
              <p>Amount: {c.amount / 100} {c.currency}</p>
              <p>Status: <strong>{c.status}</strong></p>
              <p>Scheduled: {new Date(c.scheduledStart).toLocaleString()}</p>
              {c.additionalMessage && <p>Message: {c.additionalMessage}</p>}
              {c.googleMeetUrl && <p>Meet Link: <a href={c.googleMeetUrl} target="_blank" style={{ color: "var(--ck-accent)" }}>Join Meeting</a></p>}
            </div>
            {c.status === "awaiting_response" && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button disabled={actioningId === c._id + "_accept" || actioningId === c._id + "_reject"} onClick={() => handleAcceptConsultation(c._id)} style={{ padding: "8px 16px", background: "var(--ck-accent)", color: "white", borderRadius: "4px", border: "none", cursor: (actioningId ? "not-allowed" : "pointer"), fontWeight: "600", opacity: (actioningId ? 0.7 : 1) }}>{actioningId === c._id + "_accept" ? "Approving..." : "Approve"}</button>
                <button disabled={actioningId === c._id + "_accept" || actioningId === c._id + "_reject"} onClick={() => handleRejectConsultation(c._id)} style={{ padding: "8px 16px", background: "transparent", color: "var(--ck-accent)", borderRadius: "4px", border: "1px solid var(--ck-accent)", cursor: (actioningId ? "not-allowed" : "pointer"), fontWeight: "600", opacity: (actioningId ? 0.7 : 1) }}>{actioningId === c._id + "_reject" ? "Rejecting..." : "Reject"}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const listBlock = (
    <>
      <div className="ck-ledger__section-head">
        <div>
          <h2 className="ck-ledger__section-title">
            {tab === "matched" ? "Matched to your brief" : "The deal book"}
          </h2>
          <p className="ck-ledger__section-sub">
            {tab === "matched"
              ? `${matchedScripts.length} script${matchedScripts.length === 1 ? "" : "s"} matched to your mandates`
              : "Options and purchase requests, soonest deadline first"}
          </p>
        </div>

        <div className="ck-ledger__section-tools">
          {tab === "deals" && STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="ck-ledger__filter"
              aria-pressed={statuses.includes(filter.key)}
              onClick={() => toggleStatus(filter.key)}
            >
              {filter.label}
            </button>
          ))}

          {tab === "deals" && (
            <div className="ck-ledger__menu-anchor">
              <button
                type="button"
                className="ck-ledger__sort"
                aria-expanded={openMenu === "sort"}
                aria-haspopup="menu"
                onClick={() => setOpenMenu(openMenu === "sort" ? null : "sort")}
              >
                Sort: {SORT_OPTIONS.find((option) => option.key === sort)?.short}
                <MatIcon name="expand_more" size={16} />
              </button>
              {openMenu === "sort" && (
                <div className="ck-ledger__menu ck-ledger__menu--sort" role="menu">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sort === option.key}
                      className="ck-ledger__menu-item"
                      onClick={() => { setSort(option.key); setOpenMenu(null); }}
                    >
                      {option.label}
                      {sort === option.key && <MatIcon name="check" size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {pagedRows.length === 0 ? (
        <div className="ck-ledger__no-results">
          <h3>
            {tab === "matched"
              ? "Nothing matches your brief this week"
              : statuses.length
                ? "Nothing in the ledger matches those filters"
                : "Your deal book is empty"}
          </h3>
          <p>
            {tab === "matched"
              ? "New scripts are matched against your mandates every day. Widen the brief to see more."
              : statuses.length
                ? "Try clearing the status filters — closed and past deals are hidden."
                : "Option or request a script and it will appear here."}
          </p>
          {statuses.length > 0 ? (
            <button type="button" className="ck-ledger__btn" onClick={() => { setStatuses([]); setPage(1); }}>
              Clear filters
            </button>
          ) : (
            <Link to={tab === "matched" ? "/mandates" : "/search"} className="ck-ledger__btn">
              {tab === "matched" ? "Edit mandates" : "Browse projects"}
            </Link>
          )}
        </div>
      ) : pagedRows.map((row) => (
        <LedgerDealRow
          key={row.id}
          deal={row}
          scriptPath={scriptPathFor(row.script)}
          menuOpen={openMenu === row.id}
          onToggleMenu={(deal) => setOpenMenu(openMenu === deal.id ? null : deal.id)}
          onOpen={handleOpenDeal}
          onMessage={handleMessage}
          onReveal={askReveal}
          onToggleWatch={handleToggleWatch}
          onDownloadPdf={handleDownloadPdf}
          onRelease={askRelease}
          isWatched={watchedIds.has(row.scriptId)}
          locked={locked}
          contactsBlocked={contactsBlocked}
          contactRevealed={hasRevealedContact(user, row.writerId)}
        />
      ))}

      {rows.length > perPage && (
        <div className="ck-ledger__pager">
          <span>
            Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, rows.length)} of {rows.length}
          </span>
          <div className="ck-ledger__pager-controls">
            <button
              type="button"
              className="ck-ledger__pager-btn"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              <MatIcon name="chevron_left" size={17} />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                className="ck-ledger__pager-btn"
                aria-current={number === currentPage ? "page" : undefined}
                onClick={() => setPage(number)}
              >
                {number}
              </button>
            ))}
            <button
              type="button"
              className="ck-ledger__pager-btn"
              aria-label="Next page"
              disabled={currentPage === totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              <MatIcon name="chevron_right" size={17} />
            </button>
            <label className="ck-ledger__pager-rows">
              Rows
              <select
                aria-label="Rows per page"
                value={perPage}
                onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}
              >
                {PER_PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ck-ledger">
      <div className="ck-ledger__scroll">

        {showBanner && (
          <div className="ck-ledger__banner" role="status">
            <MatIcon name="account_circle" size={20} className="ck-ledger__banner-icon" />
            <div className="ck-ledger__banner-text">
              <strong>Your profile is {Math.round(completion.percentage || 0)}% complete.</strong>{" "}
              Writers see your company and slate before they accept — finish it to improve deal-flow quality.
            </div>
            <Link to={profileEditPath} className="ck-ledger__btn">Edit profile</Link>
            <button
              type="button"
              className="ck-ledger__banner-close"
              aria-label="Dismiss"
              onClick={() => setBannerDismissed(true)}
            >
              <MatIcon name="close" size={18} />
            </button>
          </div>
        )}

        <div className="ck-ledger__head">
          <div className="ck-ledger__masthead">
            <div>
              <p className="ck-ledger__eyebrow">Acquisitions ledger · {formatDateline()}</p>
              <h1 className="ck-ledger__title">{getGreeting()}, {firstName}</h1>
              <p className="ck-ledger__standfirst">
                {desk ? `${desk} · ` : ""}{buildLedgerLine({ deals: allDeals, walletBalance })}
              </p>
            </div>

            <div className="ck-ledger__actions">
              <button
                type="button"
                className="ck-ledger__btn ck-ledger__btn--primary"
                onClick={() => selectTab("matched")}
              >
                <MatIcon name="auto_awesome" size={19} />
                Review {matchedScripts.length} match{matchedScripts.length === 1 ? "" : "es"}
              </button>
              <Link to="/mandates" className="ck-ledger__btn">Edit mandates</Link>
              <button
                type="button"
                className="ck-ledger__btn ck-ledger__btn--icon"
                aria-label="Refresh"
                onClick={handleRefresh}
              >
                <MatIcon name="refresh" size={19} />
              </button>
              <div className="ck-ledger__menu-anchor">
                <button
                  type="button"
                  className="ck-ledger__btn ck-ledger__btn--icon"
                  aria-label="Page actions"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "page"}
                  onClick={() => setOpenMenu(openMenu === "page" ? null : "page")}
                >
                  <MatIcon name="more_horiz" size={19} />
                </button>
                {openMenu === "page" && (
                  <div className="ck-ledger__menu" role="menu">
                    <button type="button" role="menuitem" className="ck-ledger__menu-item" onClick={handleExportCsv}>
                      <MatIcon name="download" size={18} />
                      Export deal ledger (CSV)
                    </button>
                    <Link to="/mandates" role="menuitem" className="ck-ledger__menu-item" onClick={closeMenus}>
                      <MatIcon name="tune" size={18} />
                      Edit mandates
                    </Link>
                    <Link to="/writers" role="menuitem" className="ck-ledger__menu-item" onClick={closeMenus}>
                      <MatIcon name="group" size={18} />
                      Browse writers
                    </Link>
                    <Link to="/pricing" role="menuitem" className="ck-ledger__menu-item" onClick={closeMenus}>
                      <MatIcon name="credit_card" size={18} />
                      Plan &amp; billing
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="ck-ledger__board">
            {boardStats.map((cell) => (
              <div key={cell.key} className="ck-ledger__board-cell">
                <div className="ck-ledger__label">{cell.label}</div>
                <div className="ck-ledger__board-value">{cell.value}</div>
                <div className="ck-ledger__board-sub" title={cell.sub}>{cell.sub}</div>
              </div>
            ))}
          </div>

          <div className="ck-ledger__tabs" role="tablist" aria-label="Dashboard sections">
            {TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                className="ck-ledger__tab"
                aria-selected={tab === entry.key}
                onClick={() => selectTab(entry.key)}
              >
                {entry.label}
                {entry.counted && tabCounts[entry.key] > 0 && (
                  <span className="ck-ledger__tab-count">{tabCounts[entry.key]}</span>
                )}
              </button>
            ))}
            <span className="ck-ledger__synced">
              {syncedAt ? `Synced ${syncedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Syncing…"}
            </span>
          </div>
        </div>

        {locked && (
          <div className="ck-ledger__lapsed">
            <p className="ck-ledger__lapsed-eyebrow">Access lapsed</p>
            <h2>Your Film Industry Professional access is not active</h2>
            <p>
              Read-only mode: your ledger, watchlist and history stay visible. Revealing contacts,
              messaging writers, booking meetings and releasing options are paused until you renew.
            </p>
            <div className="ck-ledger__lapsed-actions">
              <Link to="/pricing" className="ck-ledger__btn ck-ledger__btn--primary">See plans</Link>
              <Link to="/contact" className="ck-ledger__btn">Talk to us</Link>
            </div>
          </div>
        )}

        {dashFailed && (
          <div className="ck-ledger__notice" role="alert">
            <MatIcon name="error" size={22} />
            <div className="ck-ledger__notice-body">
              <h2>We couldn’t load your deal flow</h2>
              <p>
                Wallet, transactions and watchlist loaded normally — only{" "}
                <code>/dashboard/investor</code> failed. Anything already fetched is still shown above.
              </p>
              <button type="button" className="ck-ledger__btn" onClick={handleRefresh}>Retry</button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="ck-ledger__notice" role="alert">
            <MatIcon name="error" size={22} />
            <div className="ck-ledger__notice-body">
              <h2>That action didn’t complete</h2>
              <p>{actionError}</p>
              <button type="button" className="ck-ledger__btn" onClick={() => setActionError("")}>Dismiss</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="ck-ledger__skeleton" aria-busy="true" aria-live="polite">
            <span className="ck-ledger__sr">Loading your deal flow…</span>
            {["62%", "48%", "70%", "55%", "64%"].map((width, index) => (
              <div key={width} className="ck-ledger__skeleton-row">
                <span className="ck-ledger__skeleton-mark" />
                <span className="ck-ledger__skeleton-lines">
                  <span className="ck-ledger__skeleton-line" style={{ width }} />
                  <span
                    className="ck-ledger__skeleton-line ck-ledger__skeleton-line--faint"
                    style={{ width: ["38%", "30%", "42%", "26%", "34%"][index] }}
                  />
                </span>
                <span className="ck-ledger__skeleton-tail" />
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="ck-ledger__empty">
            <div className="ck-ledger__empty-mark">
              <MatIcon name="bookmark_heart" size={28} />
            </div>
            <h2>Your ledger starts with a brief</h2>
            <p>
              Tell us the genres, formats and hooks you option. We&rsquo;ll match new scripts to that
              brief every day and this page becomes your deal book.
            </p>
            <div className="ck-ledger__empty-actions">
              <Link to="/mandates" className="ck-ledger__btn ck-ledger__btn--primary">Set up mandates</Link>
              <Link to="/search" className="ck-ledger__btn">
                Browse {market.availableText} available scripts
              </Link>
            </div>
          </div>
        ) : (
          <div className="ck-ledger__body">
            <div className="ck-ledger__deals">
              {tab === "writers" && writersBlock(true)}
              {tab === "finance" && moneyBlock(true)}
              {tab === "market" && marketBlock}
                {tab === "consultations" && consultationsBlock}
              {(tab === "deals" || tab === "matched") && (
                <>
                  {listBlock}
                  {writersBlock(false)}
                  {moneyBlock(false)}
                </>
              )}
            </div>

            <LedgerAside
              capital={capital}
              mandateGroups={mandateGroups}
              quotas={quotaData}
              quotaResets="resets next cycle"
              market={market}
              watchlist={watchlist}
              scriptPathFor={scriptPathFor}
              onOpenFinance={() => selectTab("finance")}
            />
          </div>
        )}
      </div>

      {detailDeal && (
        <LedgerDetailDrawer
          deal={detailDeal}
          scriptPath={scriptPathFor(detailDeal.script)}
          messagePath={messagePathFor(detailDeal)}
          writerPath={detailDeal.writerId
            ? writerPathFor({ _id: detailDeal.writerId, ...(detailDeal.script?.creator || {}) })
            : ""}
          contactRevealed={hasRevealedContact(user, detailDeal.writerId)}
          locked={locked}
          meetingsBlocked={meetingsBlocked}
          onClose={() => setDetailId(null)}
          onMeeting={handleMeeting}
          onRelease={askRelease}
          onDownloadPdf={handleDownloadPdf}
        />
      )}

      <LedgerConfirmDialog
        open={Boolean(confirm)}
        eyebrow={confirm?.eyebrow}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        cancelLabel="Keep as is"
        submitting={confirmBusy}
        error={confirmError}
        onConfirm={runConfirm}
        onCancel={() => { if (!confirmBusy) { setConfirm(null); setConfirmError(""); } }}
      />

      {/*
        The meeting flow is Google-Calendar-backed and quota-checked on the
        server. It already exists as a component, so it is reused rather than
        rebuilt — the design does not specify a meeting dialog of its own.
      */}
      <MeetingModal
        isOpen={Boolean(meeting)}
        onClose={() => setMeeting(null)}
        writerId={meeting?.writerId}
        scriptId={meeting?.scriptId}
        writerName={meeting?.writerName}
        scriptName={meeting?.scriptName}
        onMeetingScheduled={() => { setMeeting(null); fetchAll(); }}
      />
    </div>
  );
};

export default ProducerDashboardPage;
