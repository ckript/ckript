import { useEffect, useState, useContext, useRef, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { io } from "socket.io-client";
import api from "../services/api";
import ProjectCard from "../components/ProjectCard";
import ProfileCompletionBanner from "../components/ProfileCompletionBanner";
import { AuthContext } from "../context/AuthContext";
import { getApiBaseUrl } from "../utils/apiOrigin";
/*
 * Lazy, not static. This module is the /dashboard router for BOTH audiences, and
 * a static import put the whole producer dashboard inside the writer's chunk (and
 * the whole writer dashboard inside the producer's). Neither audience ever
 * renders the other, so neither should download it.
 */
const ProducerDashboardPage = lazy(() =>
  import("../features/producer-workspace/ProducerDashboardPage"));
// From the policy module, not the app-shell barrel — the barrel re-exports
// AppShell and would drag the whole shell into this page's chunk.
import { isIndustryAudience } from "../layouts/app-shell/shellPolicy";
import { getProfileCanonicalPath } from "../utils/profilePath";
import { getScriptCanonicalPath } from "../utils/scriptPath";
import { readCache, writeCache } from "../utils/localCache";
import { MatIcon } from "../layouts/app-shell/navigation/icons.jsx";
import OverlayScrollArea from "../components/OverlayScrollArea";
import { useAuthModal } from "../context/AuthModalContext";
import { useWriterPlanCheckout } from "../hooks/useWriterPlanCheckout";
// This page's own styles. The shell used to import them on every route's behalf;
// now the page owns them, so they load with the page rather than with the chrome.
import "./dashboard.css";

const SOCKET_ORIGIN = getApiBaseUrl().replace(/\/api\/?$/, "").replace(/\/$/, "");

// ── Design tokens (2B palette) ────────────────────────────────────────────────
// Type is NOT re-declared here — it reads the single source of truth defined in
// dashboard.css (--ck-display / --ck-body). Change the face there, once.
const ACCENT       = "#d14d37";
const DISPLAY_FONT = "var(--ck-display)";
const BASE         = "#1c1a17";
const MUTED        = "#6f695f";
const FAINT        = "#a39d92";
const BORDER       = "#ece8e0";
const CREAM        = "#f4efe6";

// My Projects: how many show inline before the "View all" popup, and the
// popup's page size.
const INITIAL_PROJECTS  = 6;
const PROJECTS_PER_PAGE = 9;

// ── Dashboard cache (localStorage, stale-while-revalidate) ────────────────────
// Bump the version (v1 → v2) whenever the cached payload shape changes so old
// snapshots are ignored rather than mis-rendered. Keyed per user below.
const DASH_CACHE_NS = "dashboard:v1:";
const DEFAULT_STATS = {
  totalEarnings: 0, totalUnlocks: 0, totalViews: 0,
  profileViews: 0, trailersGenerated: 0, avgScore: null, plan: "free",
};

// ── Root ──────────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, setUser } = useContext(AuthContext);

  useEffect(() => {
    if (!user?.token) return;
    let disposed = false;
    const sync = async () => {
      try {
        const { data } = await api.get("/auth/me");
        if (disposed || !data) return;
        const next = { ...user, ...data, token: user.token, expiresAt: data.expiresAt || user.expiresAt };
        setUser(next);
        localStorage.setItem("user", JSON.stringify(next));
      } catch { /* keep existing session on transient failures */ }
    };
    sync();
    return () => { disposed = true; };
  }, [setUser, user?._id, user?.token]);

  /*
   * This branch used to read `role === "investor"`, which meant a producer,
   * director or other industry professional on /dashboard was handed the
   * WRITER's dashboard — earnings from script sales, "upload your screenplay",
   * an AI score for work they had not written. Only investors got the industry
   * one. Asking the shell policy instead covers the whole audience.
   */
  if (isIndustryAudience(user?.role)) {
    return (
      <Suspense fallback={<div className="ck-page-scroll" />}>
        <ProducerDashboardPage />
      </Suspense>
    );
  }
  return <CreatorDashboard user={user} />;
};

// ── Creator Dashboard ─────────────────────────────────────────────────────────
const CreatorDashboard = ({ user }) => {
  // Hydrate synchronously from localStorage so a returning user sees their real
  // dashboard on the very first paint (no skeleton), then we revalidate in the
  // background. Read once (guard on undefined) — not on every render.
  const cacheKey = user?._id ? `${DASH_CACHE_NS}${user._id}` : null;
  const cachedRef = useRef();
  if (cachedRef.current === undefined) cachedRef.current = cacheKey ? readCache(cacheKey) : null;
  const cached = cachedRef.current;

  const { openPricingModal } = useAuthModal();
  const { isWriter, hasSilverAccess, hasGoldAccess } = useWriterPlanCheckout();

  useEffect(() => {
    if (!user || !isWriter) return;
    const isFreePlan = !hasSilverAccess && !hasGoldAccess;
    const hasSeenPricing = sessionStorage.getItem("writerPricingShown");

    if (isFreePlan && !hasSeenPricing) {
      openPricingModal("writer");
      sessionStorage.setItem("writerPricingShown", "true");
    }
  }, [user, isWriter, hasSilverAccess, hasGoldAccess, openPricingModal]);

  const [myScripts,     setMyScripts]     = useState(cached?.myScripts ?? []);
  const [consultations, setConsultations] = useState(cached?.consultations ?? []);
  const [sharedScripts, setSharedScripts] = useState(cached?.sharedScripts ?? []);
  const [stats,         setStats]         = useState(cached?.stats ?? null);
  const [reviews,       setReviews]       = useState(cached?.reviews ?? null);
  const [reviewTab,     setReviewTab]     = useState("ai");
  const [aiIndex,       setAiIndex]       = useState(0);
  const [platIndex,     setPlatIndex]     = useState(0);
  const [modal,         setModal]         = useState(null); // AI "View more" — the review being shown in the popup
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [showAllConsultations, setShowAllConsultations] = useState(false);
  const [projPage,        setProjPage]        = useState(1);     // 1-based page inside that popup
  // Skeleton only when we have nothing cached to show.
  const [loading,       setLoading]       = useState(!cached);

  // The skeleton is an *initial-load* affordance only. Background refreshes
  // (socket events below) must never flash it — and when we hydrated from cache
  // the very first fetch is already a silent revalidation, not a cold load.
  const initialLoad  = useRef(!cached);
  // Keep the last opened review around during the modal's exit animation, so
  // content doesn't vanish mid-transition when `modal` is cleared to null.
  const modalLast    = useRef(null);
  if (modal) modalLast.current = modal;

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!user?.token) return;
    const socket = io(SOCKET_ORIGIN, { auth: { token: user.token } });
    const refresh = () => fetchData();
    [
      "collab_membership_changed", "collab_request", "collab_invite",
      "collab_request_sent", "collab_request_responded",
      "collaborator_removed", "collab_role_changed",
    ].forEach(ev => socket.on(ev, refresh));
    return () => socket.disconnect();
  }, [user?.token]);

  // Escape closes whichever popup is open.
  useEffect(() => {
    if (!modal && !showAllProjects && !showAllConsultations) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setModal(null);
      setShowAllProjects(false);
        setShowAllConsultations(false);
        setShowAllConsultations(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, showAllProjects, showAllConsultations]);

  // Persist the freshest snapshot so the next visit paints instantly. Runs on
  // any data change once we're past the skeleton, so it always writes what the
  // user is actually looking at (no stale closures). Writes are cheap and the
  // util silently no-ops if storage is full/unavailable — with a trimmed retry
  // if a power user's full project list blows the quota.
  useEffect(() => {
    if (!cacheKey || loading) return;
    const payload = { myScripts, sharedScripts, stats, reviews, consultations };
    if (!writeCache(cacheKey, payload, { prune: "dashboard:" })) {
      writeCache(
        cacheKey,
        { ...payload, myScripts: myScripts.slice(0, 24), sharedScripts: sharedScripts.slice(0, 12) },
        { prune: "dashboard:" }
      );
    }
  }, [cacheKey, loading, myScripts, sharedScripts, stats, reviews, consultations]);

  const fetchData = async () => {
    const showSkeleton = initialLoad.current;
    try {
      if (showSkeleton) setLoading(true);
      const [scriptsRes, statsRes, reviewsRes, consultationsRes] = await Promise.allSettled([
        api.get("/scripts/mine?includeCollaborations=1"),
        api.get("/dashboard"),
        api.get("/dashboard/reviews"),
        api.get("/consultations/my"),
      ]);
      // On a failed leg, keep whatever we already have (cached/hydrated) rather
      // than blanking the section — a transient error shouldn't wipe the UI or
      // overwrite a good cache with empties.
      if (scriptsRes.status === "fulfilled") {
        const all = Array.isArray(scriptsRes.value.data) ? scriptsRes.value.data : [];
        setMyScripts(all.filter(s => !s?.isCollaborator && s.status === "published"));
        setSharedScripts(all.filter(s => s?.isCollaborator && s.status === "published"));
      }
      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value.data.stats ?? statsRes.value.data);
      } else {
        setStats(prev => prev ?? DEFAULT_STATS);
      }
      if (reviewsRes.status === "fulfilled") setReviews(reviewsRes.value.data);
      if (consultationsRes && consultationsRes.status === "fulfilled") {
        setConsultations(Array.isArray(consultationsRes.value.data) ? consultationsRes.value.data : []);
      }
    } catch { /* keep prior/cached state on total failure */ } finally {
      initialLoad.current = false;
      if (showSkeleton) setLoading(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const published    = myScripts.filter(s => s.status === "published");
  const totalViews   = published.reduce((s, sc) => s + (sc.views || 0), 0);
  const topScript    = published.length
    ? published.reduce((a, b) => (a.views || 0) >= (b.views || 0) ? a : b)
    : null;
  const avgViews     = published.length ? Math.round(totalViews / published.length) : 0;

  const barData = [...myScripts]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 6)
    .map(s => ({
      name:  s.title?.length > 16 ? s.title.slice(0, 16) + "…" : (s.title || "Untitled"),
      views: s.views || 0,
    }));
  const maxV = Math.max(...barData.map(b => b.views), 1);

  const topRailScripts = [...published]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 4);

  const aiReviews    = reviews?.ai          || [];
  const adminReviews = reviews?.adminScores || [];
  const pending      = myScripts.filter(s => s.status === "pending_approval");
  const rejected     = myScripts.filter(s => s.status === "rejected");
  const profilePath  = getProfileCanonicalPath(user, { viewerId: user?._id, viewerRole: user?.role });

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;

  return (
    // AppShell provides the outer flex container (ck-content-area)
    // We fill it directly — no negative margin hacks needed.
    <div className="flex flex-1 min-h-0 min-w-0">

      {/* ══════════════ MAIN SCROLL COLUMN ══════════════ */}
      {/*
        Block flow — NOT a flex column. A flex column here has a fixed height
        (it's a flex-1 child of the bounded content area) with overflow-y:auto,
        which makes the browser SHRINK children to their flex min-size when the
        content overflows. Any section with overflow != visible (the hero, for
        its rounded-corner image clip) gets an automatic min-height of 0 per the
        flexbox spec, collapses to zero height, and clips its own content away —
        while overflow:visible siblings keep their content min-height and survive.
        Plain block flow lets every child take its natural height and scroll,
        so no section can be silently collapsed. Spacing stays via each
        section's mb-* margin. */}
      <OverlayScrollArea
        className="flex-1 min-w-0"
        viewportClassName="ck-scroll-main"
        ariaLabel="Writer dashboard"
      >

        {/* Profile completion */}
        <ProfileCompletionBanner
          completion={user?.profileCompletion}
          subtitle="Complete your profile to improve visibility and recommendations."
          ctaLabel="Edit Profile"
          ctaTo={profilePath}
          className="mb-6"
        />

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <section
          className="relative rounded-2xl overflow-hidden border mb-8"
          style={{ position: "relative", borderColor: BORDER, background: "#faf7f2" }}
        >
          {/* Editorial image bleeds in from the right (matches 2B reference) */}
          <img
            src="/dashboard-hero.png"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute top-0 right-0 h-full pointer-events-none select-none hidden sm:block"
            style={{ width: "52%", objectFit: "cover", objectPosition: "center", zIndex: 0 }}
          />
          {/* White → transparent wash so the copy stays legible over the art */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 1, background: "linear-gradient(90deg,#ffffff 0%,#ffffff 40%,rgba(255,255,255,0.72) 58%,rgba(250,247,242,0.15) 78%,rgba(250,247,242,0) 100%)" }}
          />
          {/* Copy sits explicitly above the art + wash — don't rely on paint order */}
          <div className="relative px-7 py-7 sm:px-8 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5" style={{ position: "relative", zIndex: 2 }}>
            <div style={{ maxWidth: "58%" }}>
              <h1
                style={{ fontFamily: DISPLAY_FONT, color: BASE }}
                className="font-semibold text-[28px] sm:text-[32px] leading-tight"
              >
                Your Stories in Motion
              </h1>
              <p style={{ color: MUTED }} className="text-[13.5px] leading-relaxed mt-2.5 max-w-[46ch]">
                Track scripts, trailer engagement, producer interest &amp; acquisition — all in one place.
              </p>
            </div>
            <div className="flex gap-2.5 flex-none">
              <Link
                to="/create-project"
                state={{ startFresh: true }}
                className="flex items-center gap-1.5 h-10 px-[17px] rounded-[9px] text-[13px] font-semibold transition-colors hover:opacity-90"
                style={{ background: BASE, color: "#fff", boxShadow: "0 6px 16px rgba(28,26,23,.18)" }}
              >
                <MatIcon name="add" size={18} />
                Create
              </Link>
              <Link
                to="/upload"
                className="flex items-center gap-1.5 h-10 px-[17px] rounded-[9px] text-[13px] font-semibold border transition-colors hover:border-[#1c1a17]"
                style={{ background: "#fff", color: BASE, borderColor: "#d7d0c2" }}
              >
                <MatIcon name="upload" size={18} />
                Upload
              </Link>
            </div>
          </div>
        </section>

        {/* ── SCRIPT PERFORMANCE ──────────────────────────────────────────── */}
        <section className="mb-8 px-1">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2
                style={{ fontFamily: DISPLAY_FONT, color: BASE, letterSpacing: "-0.01em" }}
                className="text-[38px] sm:text-[44px] font-semibold leading-tight"
              >
                Script Performance
                <span
                  className="inline-block ml-3 align-middle"
                  style={{ width: 9, height: 9, background: ACCENT, borderRadius: 2, verticalAlign: "0.1em" }}
                />
              </h2>
              <p style={{ color: "#8d877e" }} className="text-[14px] mt-3">
                Track how your scripts are performing across the platform
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex mt-7" style={{ borderLeft: "none" }}>
            {[
              { label: "Total Views",  value: totalViews.toLocaleString(),             sub: null },
              { label: "Top Script",   value: (topScript?.views || 0).toLocaleString(), sub: topScript?.title },
              { label: "Avg / Script", value: avgViews.toLocaleString(),               sub: null },
            ].map(({ label, value, sub }, i) => (
              <div
                key={i}
                className="flex-1"
                style={{
                  padding: i === 0 ? "0 24px 0 4px" : "0 24px",
                  borderLeft: i > 0 ? `1px solid #eae4d8` : undefined,
                }}
              >
                <div className="text-[10px] font-semibold tracking-[1.4px] uppercase" style={{ color: FAINT }}>
                  {label}
                </div>
                <div
                  style={{ fontFamily: DISPLAY_FONT, color: BASE }}
                  className="text-[42px] sm:text-[46px] font-medium leading-none mt-3.5"
                >
                  {value}
                </div>
                {sub && <div className="text-[13px] mt-2.5 truncate" style={{ color: "#8d877e" }}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* Bar chart */}
          {barData.length > 0 && (
            <div className="mt-8 pt-9 border-t" style={{ borderColor: "#eae4d8" }}>
              <div className="flex">
                {/* Y labels */}
                <div
                  className="flex flex-col justify-between pr-[18px] text-right text-[12px]"
                  style={{ height: 280, color: "#b1aa9e", fontVariantNumeric: "tabular-nums" }}
                >
                  {[maxV, Math.round(maxV * 0.75), Math.round(maxV * 0.5), Math.round(maxV * 0.25), 0].map(v => (
                    <span key={v}>{v.toLocaleString()}</span>
                  ))}
                </div>
                {/* Chart area */}
                <div className="flex-1 min-w-0">
                  <div className="relative" style={{ height: 280 }}>
                    {[0, 25, 50, 75].map(pct => (
                      <div
                        key={pct}
                        className="absolute left-0 right-0"
                        style={{ top: `${pct}%`, borderTop: "1px dashed #e6e0d3" }}
                      />
                    ))}
                    <div
                      className="absolute bottom-0 left-0 right-0"
                      style={{ height: 1, background: "#cfc7b6" }}
                    />
                    <div className="absolute inset-0 flex items-end">
                      {barData.map((b, i) => (
                        <div key={i} className="flex-1 flex justify-center items-end h-full">
                          <div
                            style={{
                              width: 20,
                              height: `${Math.max(1.5, (b.views / maxV) * 100).toFixed(1)}%`,
                              background: i === 0 ? ACCENT : BASE,
                              opacity: i === 0 ? 1 : Math.max(0.3, 1 - i * 0.12),
                              transition: "height 0.6s cubic-bezier(.22,.61,.36,1)",
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* X labels */}
                  <div className="flex mt-4">
                    {barData.map((b, i) => (
                      <div
                        key={i}
                        className="flex-1 text-center px-1 text-[12.5px] sm:text-[13.5px]"
                        style={{ fontFamily: DISPLAY_FONT, fontStyle: "italic", color: MUTED }}
                      >
                        {b.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {barData.length === 0 && (
            <div className="mt-8 pt-8 border-t text-center py-12" style={{ borderColor: "#eae4d8" }}>
              <p style={{ color: FAINT }} className="text-[14px]">
                No script data yet. Upload your first script to see performance.
              </p>
            </div>
          )}
        </section>

        {/* ── REVIEWS & INSIGHTS ──────────────────────────────────────────── */}
        <section className="mb-8 pt-6 border-t px-1" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-3 mb-4">
            <MatIcon name="sparkles" size={22} fill style={{ color: ACCENT }} />
            <h2 style={{ fontFamily: DISPLAY_FONT, color: BASE }} className="text-[21px] font-medium">
              Reviews &amp; Insights
            </h2>
          </div>

          {/* Tab nav */}
          <div className="flex gap-7 mb-0" style={{ borderBottom: `1px solid #ece6da` }}>
            {[
              { key: "ai",       label: "AI Analysis"       },
              { key: "platform", label: "Platform Insights"  },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => { setReviewTab(tab.key); setAiIndex(0); setPlatIndex(0); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "0 2px 11px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  letterSpacing: "1.3px",
                  textTransform: "uppercase",
                  color: reviewTab === tab.key ? BASE : "#b1aa9e",
                  background: "transparent",
                  border: "none",
                  borderBottom: reviewTab === tab.key ? `2px solid ${ACCENT}` : "2px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "color .18s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* AI Analysis panel — carousel of compact cards (sized like Platform
              Insights); full detail behind "View more". */}
          {reviewTab === "ai" && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="pt-4">
              {aiReviews.length > 0 ? (
                <>
                  <CarouselNav
                    current={aiIndex}
                    total={aiReviews.length}
                    label="Script"
                    onPrev={() => setAiIndex(i => Math.max(0, i - 1))}
                    onNext={() => setAiIndex(i => Math.min(aiReviews.length - 1, i + 1))}
                  />
                  <div className="overflow-hidden">
                    <div
                      className="flex"
                      style={{ transform: `translateX(-${aiIndex * 100}%)`, transition: "transform .5s cubic-bezier(.22,.61,.36,1)" }}
                    >
                      {aiReviews.map((r, idx) => (
                        <AiReviewCompact key={r.scriptId || idx} review={r} onOpen={() => setModal(r)} />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <EmptyPanel
                  icon="sparkles"
                  title="No AI analyses yet"
                  desc="Score a script to receive detailed AI-powered insights and recommendations"
                />
              )}
            </motion.div>
          )}

          {/* Platform Insights panel */}
          {reviewTab === "platform" && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="pt-4">
              {adminReviews.length > 0 ? (
                <>
                  <CarouselNav
                    current={platIndex}
                    total={adminReviews.length}
                    label="Admin Review"
                    onPrev={() => setPlatIndex(i => Math.max(0, i - 1))}
                    onNext={() => setPlatIndex(i => Math.min(adminReviews.length - 1, i + 1))}
                  />
                  <div className="overflow-hidden">
                    <div
                      className="flex"
                      style={{ transform: `translateX(-${platIndex * 100}%)`, transition: "transform .5s cubic-bezier(.22,.61,.36,1)" }}
                    >
                      {adminReviews.map((s, idx) => <AdminReviewCard key={s.scriptId || idx} review={s} />)}
                    </div>
                  </div>
                </>
              ) : (
                <EmptyPanel
                  icon="terms"
                  title="No admin reviews yet"
                  desc="Submit your script for platform review to receive quality scores"
                />
              )}
            </motion.div>
          )}
        </section>

        {/* ── MY PROJECTS ─────────────────────────────────────────────────── */}
        {consultations && (
          <section className="pt-6 border-t px-1 mb-10" style={{ borderColor: BORDER }}>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <h2 style={{ fontFamily: DISPLAY_FONT, color: BASE }} className="text-[21px] font-medium">
                My Consultations
              </h2>
              <span
                className="text-[12px] font-bold px-2.5 py-0.5 rounded-full"
                style={{ background: CREAM, color: "#8d877e" }}
              >
                {consultations.length}
              </span>
              <div className="flex-1" />
              {consultations.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowAllConsultations(true)}
                  className="text-[11px] font-bold tracking-[1.1px] uppercase transition-opacity hover:opacity-60"
                  style={{ color: ACCENT, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  View all ›
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {consultations.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: "40px", textAlign: "center", background: "#f8fafc", borderRadius: "16px", border: "1px dashed #cbd5e1" }}>
                  <p style={{ margin: 0, color: MUTED, fontSize: "14px", fontWeight: "500" }}>No consultations booked yet.</p>
                </div>
              )}
              {consultations.slice(0, 2).map(c => (
                <div key={c._id} className="flex flex-col box-border" style={{ padding: "20px", border: `1px solid ${BORDER}`, borderRadius: "14px", background: "white", transition: "transform 0.2s", cursor: "default" }}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: "18px", color: BASE, fontWeight: 500 }}>
                        {c.topic}
                      </h4>
                      <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: MUTED }}>
                        with {c.professional?.name || "Professional"}
                      </p>
                    </div>
                    <span style={{ 
                      padding: "4px 10px", 
                      borderRadius: "20px", 
                      fontSize: "10px", 
                      fontWeight: "700", 
                      textTransform: "uppercase", 
                      letterSpacing: "0.5px", 
                      background: c.status === 'accepted' || c.status === 'meeting_scheduled' ? '#ecfdf5' : (c.status === 'rejected' ? '#fef2f2' : '#f8fafc'), 
                      color: c.status === 'accepted' || c.status === 'meeting_scheduled' ? '#059669' : (c.status === 'rejected' ? '#dc2626' : MUTED),
                      border: `1px solid ${c.status === 'accepted' || c.status === 'meeting_scheduled' ? '#a7f3d0' : (c.status === 'rejected' ? '#fecaca' : BORDER)}`
                    }}>
                      {c.status.replace('_', ' ')}
                    </span>
                  </div>
                  
                  <div className="flex-1 mt-2" style={{ fontSize: "13px", color: MUTED, display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div className="flex items-center gap-2"><strong style={{ color: BASE }}>Date:</strong> {new Date(c.scheduledStart).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(c.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="flex items-center gap-2"><strong style={{ color: BASE }}>Amount:</strong> {c.amount / 100} {c.currency}</div>
                    
                    {c.googleMeetUrl && c.status !== 'rejected' && (
                      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                        <a href={c.googleMeetUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#2563eb", fontWeight: "600", textDecoration: "none" }}>
                          Join Google Meet &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

<section className="pt-6 border-t px-1" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <MatIcon name="projects" size={22} style={{ color: ACCENT }} />
            <h2 style={{ fontFamily: DISPLAY_FONT, color: BASE }} className="text-[21px] font-medium">
              My Projects
            </h2>
            <span
              className="text-[12px] font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: CREAM, color: "#8d877e" }}
            >
              {myScripts.length}
            </span>
            <div className="flex-1" />
            <Link
              to={profilePath}
              className="text-[11px] font-bold tracking-[1.1px] uppercase transition-opacity hover:opacity-60"
              style={{ color: ACCENT }}
            >
              View all ›
            </Link>
          </div>

          {/* Status notices */}
          {pending.length > 0 && (
            <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl border text-amber-800 bg-amber-50 border-amber-200">
              <MatIcon name="schedule" size={16} className="mt-0.5 shrink-0" />
              <p className="text-[13px] font-medium">
                <span className="font-bold">{pending.length} project{pending.length > 1 ? "s" : ""}</span>{" "}
                pending admin approval — {pending.length > 1 ? "they are" : "it is"} hidden from the public until approved.
              </p>
            </div>
          )}
          {rejected.length > 0 && (
            <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl border text-red-800 bg-red-50 border-red-200">
              <MatIcon name="error" size={16} className="mt-0.5 shrink-0" />
              <p className="text-[13px] font-medium">
                <span className="font-bold">{rejected.length} project{rejected.length > 1 ? "s were" : " was"}</span>{" "}
                not approved. Review the feedback and revise, then re-upload.
              </p>
            </div>
          )}

          {myScripts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {myScripts.slice(0, INITIAL_PROJECTS).map(script => (
                  <ProjectCard
                    key={script._id}
                    project={script}
                    userName={script.creator?.name?.toUpperCase() || user?.name?.toUpperCase() || "UNKNOWN"}
                  />
                ))}
              </div>
              {myScripts.length > INITIAL_PROJECTS && (
                <div className="flex justify-center mt-6">
                  <button
                    type="button"
                    className="ck-rev-more"
                    onClick={() => { setProjPage(1); setShowAllProjects(true); }}
                  >
                    View all {myScripts.length} projects
                    <MatIcon name="chevronDown" size={18} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <div
                className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
                style={{ background: CREAM }}
              >
                <MatIcon name="movie" size={32} style={{ color: "#c9bfae" }} />
              </div>
              <h3 style={{ fontFamily: DISPLAY_FONT, color: BASE }} className="text-[22px] font-medium mb-2">
                No projects yet
              </h3>
              <p style={{ color: MUTED }} className="text-[14px] mb-6">
                Upload your first script to get started
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link
                  to="/create-project"
                  state={{ startFresh: true }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-[9px] text-[13px] font-semibold border transition-colors hover:border-[#1c1a17]"
                  style={{ background: "#fff", color: BASE, borderColor: "#d7d0c2" }}
                >
                  Create Project
                </Link>
                <Link
                  to="/upload"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-[9px] text-[13px] font-semibold transition-opacity hover:opacity-80"
                  style={{ background: BASE, color: "#fff" }}
                >
                  Upload Script
                </Link>
              </div>
            </div>
          )}

          {/* Shared / Collaboration scripts */}
          {sharedScripts.length > 0 && (
            <div className="mt-10 pt-8 border-t" style={{ borderColor: BORDER }}>
              <div className="flex items-center gap-3 mb-4">
                <h3 style={{ fontFamily: DISPLAY_FONT, color: MUTED }} className="text-[17px] font-medium">
                  Collaborations
                </h3>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: CREAM, color: "#8d877e" }}
                >
                  {sharedScripts.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {sharedScripts.map(script => (
                  <ProjectCard
                    key={script._id}
                    project={script}
                    userName={script.creator?.name?.toUpperCase() || "UNKNOWN"}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

      </OverlayScrollArea>

      {/* ══════════════ RIGHT RAIL ══════════════ */}
      <aside
        className="hidden lg:block flex-none border-l"
        style={{
          width: 272,
          borderColor: BORDER,
          background: "#fff",
          height: "100%",
        }}
      >
        <OverlayScrollArea
          className="ck-right-rail-scroll"
          viewportClassName="ck-right-rail-viewport"
          ariaLabel="Writer dashboard summary"
        >
          <div className="ck-right-rail-content">
        {/* At a Glance header */}
        <div
          className="font-bold uppercase px-0.5"
          style={{ fontSize: 10, letterSpacing: "1.5px", color: FAINT }}
        >
          At a Glance
        </div>

        {/* 2×2 stat grid */}
        <div
          className="border rounded-xl overflow-hidden flex-none"
          style={{ borderColor: BORDER, display: "grid", gridTemplateColumns: "1fr 1fr" }}
        >
          {[
            { label: "Profile Views", value: (stats?.profileViews ?? stats?.totalViews ?? 0).toLocaleString(), right: true,  bottom: true },
            { label: "Earnings",      value: `₹${(stats?.totalEarnings || 0).toLocaleString()}`,               right: false, bottom: true },
            { label: "Unlocks",       value: (stats?.totalUnlocks || 0).toLocaleString(),                       right: true,  bottom: false },
            { label: "AI Trailers",   value: (stats?.trailersGenerated || 0).toLocaleString(),                  right: false, bottom: false },
          ].map(({ label, value, right, bottom }, i) => (
            <div
              key={i}
              style={{
                padding: "14px 15px",
                borderRight:  right  ? "1px solid #f0ebe0" : undefined,
                borderBottom: bottom ? "1px solid #f0ebe0" : undefined,
              }}
            >
              <div
                className="font-semibold uppercase"
                style={{ fontSize: 9, letterSpacing: "1px", color: FAINT }}
              >
                {label}
              </div>
              <div
                style={{ fontFamily: DISPLAY_FONT, color: BASE, fontSize: 29, fontWeight: 500, lineHeight: 1, marginTop: 8 }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Avg Score dark card */}
        <div className="rounded-xl p-4 flex-none" style={{ background: BASE }}>
          <div className="flex items-center justify-between">
            <div
              className="font-semibold uppercase"
              style={{ fontSize: 9, letterSpacing: "1px", color: "#b7b0a4" }}
            >
              Avg Score
            </div>
            <div className="rounded" style={{ width: 20, height: 2, background: ACCENT }} />
          </div>
          <div
            style={{ fontFamily: DISPLAY_FONT, color: "#fff", fontSize: 42, fontWeight: 500, lineHeight: 1, marginTop: 8 }}
          >
            {stats?.avgScore != null ? stats.avgScore : "—"}
          </div>
          <div style={{ fontSize: 11, color: "#9c958a", marginTop: 6 }}>
            Across all reviewed scripts
          </div>
        </div>

        {/* Biggest Mover + Top Scripts — one border-topped block (matches 2B) */}
        {topRailScripts.length > 0 && (
          <div className="flex-none" style={{ borderTop: `1px solid ${BORDER}`, marginTop: 2, paddingTop: 14 }}>
            {/* Biggest Mover card */}
            <div className="border" style={{ borderColor: BORDER, borderRadius: 11, padding: "13px 15px" }}>
              <div
                className="font-bold uppercase"
                style={{ fontSize: 8.5, letterSpacing: "1.1px", color: ACCENT }}
              >
                Biggest Mover
              </div>
              <div
                style={{ fontFamily: DISPLAY_FONT, color: BASE, fontSize: 17, marginTop: 5 }}
                className="truncate"
              >
                {topRailScripts[0]?.title}
              </div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                {(topRailScripts[0]?.views || 0).toLocaleString()} views
              </div>
            </div>

            {/* Top Scripts */}
            <div
              className="font-bold uppercase"
              style={{ fontSize: 9, letterSpacing: "1px", color: "#b1aa9e", margin: "16px 0 8px" }}
            >
              Top Scripts
            </div>
            <div className="flex flex-col">
              {topRailScripts.map((s, i) => (
                <Link
                  key={s._id}
                  to={getScriptCanonicalPath(s)}
                  className="flex items-center transition-opacity hover:opacity-60"
                  style={{
                    gap: 9,
                    padding: "7px 0",
                    borderBottom: i < topRailScripts.length - 1 ? `1px solid ${CREAM}` : undefined,
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: DISPLAY_FONT,
                      color: i === 0 ? ACCENT : "#8d877e",
                      width: 12,
                      flexShrink: 0,
                      fontSize: 14,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="flex-1 truncate"
                    style={{ fontSize: 12.5, color: BASE }}
                  >
                    {s.title}
                  </span>
                  <span style={{ fontSize: 12, color: "#8d877e" }}>
                    {(s.views || 0).toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Full Analytics link */}
        <Link
          to="/dashboard"
          className="flex items-center justify-center gap-2 rounded-[11px] border font-semibold transition-colors hover:border-[#1c1a17] flex-none"
          style={{
            padding: 13,
            color: BASE,
            borderColor: "#e7e1d4",
            background: "#fff",
            fontSize: 12.5,
            textDecoration: "none",
            marginTop: 6,
          }}
        >
          <MatIcon name="analytics" size={18} />
          Full Analytics
        </Link>
          </div>
        </OverlayScrollArea>
      </aside>

      {/* ══════════════ AI "VIEW MORE" DETAIL MODAL ══════════════ */}
      <ReviewModal
        open={!!modal}
        review={modal || modalLast.current}
        onClose={() => setModal(null)}
      />

      {/* ══════════════ ALL PROJECTS MODAL (paginated) ══════════════ */}
      <AllConsultationsModal open={showAllConsultations} consultations={consultations} onClose={() => setShowAllConsultations(false)} />
        <AllProjectsModal
        open={showAllProjects}
        projects={myScripts}
        user={user}
        page={projPage}
        onPage={setProjPage}
        onClose={() => setShowAllProjects(false)}
      />

    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const CarouselNav = ({ current, total, label, onPrev, onNext }) => (
  <div className="flex items-center justify-between mb-3">
    <span
      className="font-bold uppercase"
      style={{ fontSize: 10.5, letterSpacing: "1.3px", color: "#8d877e" }}
    >
      {label}{" "}
      <span style={{ color: BASE }}>{String(current + 1).padStart(2, "0")}</span>{" "}
      <span style={{ color: "#c9bfae" }}>/ {String(total).padStart(2, "0")}</span>
    </span>
    <div className="flex gap-2">
      <NavBtn disabled={current === 0}         onClick={onPrev} dir="prev" />
      <NavBtn disabled={current >= total - 1}  onClick={onNext} dir="next" />
    </div>
  </div>
);

const NavBtn = ({ disabled, onClick, dir }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="flex items-center justify-center rounded-full border transition-colors"
    style={{
      width: 36, height: 36,
      borderColor: disabled ? "#efe9df" : "#e4ddd0",
      color:       disabled ? "#dcd5c8" : BASE,
      background:  "#fff",
      cursor:      disabled ? "default" : "pointer",
    }}
  >
    <MatIcon name={dir === "prev" ? "chevronLeft" : "chevronRight"} size={18} />
  </button>
);

// ── Skeleton loader ─────────────────────────────────────────────────────────
// A single shimmering block. Dimensions via props; visual via .ck-skel (CSS).
const Skel = ({ w, h, r = 8, className = "", style }) => (
  <div
    className={`ck-skel${className ? ` ${className}` : ""}`}
    style={{ width: w, height: h, borderRadius: r, ...style }}
  />
);

/**
 * DashboardSkeleton — a structural placeholder that mirrors the real creator
 * dashboard (hero → performance → reviews → projects + right rail). It occupies
 * the exact same layout boxes as the loaded UI so the swap is shift-free and
 * reads as "this content is arriving", not "something is broken".
 */
const DashboardSkeleton = () => (
  <div className="flex flex-1 min-h-0 min-w-0" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading your dashboard…</span>

    <OverlayScrollArea
      className="flex-1 min-w-0"
      viewportClassName="ck-scroll-main"
      ariaLabel="Loading writer dashboard"
    >
      {/* Hero */}
      <Skel h={150} r={16} className="mb-8" style={{ width: "100%" }} />

      {/* Script Performance */}
      <div className="mb-8 px-1">
        <Skel w={300} h={40} r={8} />
        <Skel w={340} h={13} r={6} className="mt-3" />
        <div className="flex mt-7 gap-6">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex-1">
              <Skel w={90} h={10} r={5} />
              <Skel w="72%" h={40} r={8} className="mt-4" />
            </div>
          ))}
        </div>
        <Skel h={280} r={12} className="mt-8" style={{ width: "100%" }} />
      </div>

      {/* Reviews & Insights — carousel (one card at a time) */}
      <div className="mb-8 pt-6 border-t px-1" style={{ borderColor: BORDER }}>
        <Skel w={190} h={22} r={7} />
        <div className="flex gap-7 mt-5 mb-4">
          <Skel w={90} h={12} r={6} />
          <Skel w={120} h={12} r={6} />
        </div>
        <div className="flex items-center justify-between mb-3">
          <Skel w={120} h={12} r={6} />
          <div className="flex gap-2">
            <Skel w={36} h={36} r={18} />
            <Skel w={36} h={36} r={18} />
          </div>
        </div>
        <Skel h={300} r={16} style={{ width: "100%" }} />
      </div>

      {/* My Projects */}
      <div className="pt-6 border-t px-1" style={{ borderColor: BORDER }}>
        <Skel w={160} h={22} r={7} />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
          {[0, 1, 2, 3, 4, 5].map(i => <Skel key={i} h={280} r={16} />)}
        </div>
      </div>
    </OverlayScrollArea>

    {/* Right rail */}
    <aside
      className="hidden lg:block flex-none border-l"
      style={{ width: 272, borderColor: BORDER, background: "#fff", height: "100%" }}
    >
      <OverlayScrollArea
        className="ck-right-rail-scroll"
        viewportClassName="ck-right-rail-viewport"
        ariaLabel="Loading writer dashboard summary"
      >
        <div className="ck-right-rail-content">
          <Skel w={90} h={10} r={5} />
          <Skel h={148} r={12} style={{ width: "100%" }} />
          <Skel h={116} r={12} style={{ width: "100%" }} />
          <Skel h={72} r={11} style={{ width: "100%" }} />
          <div className="flex flex-col gap-2.5 mt-1">
            {[0, 1, 2, 3].map(i => <Skel key={i} h={15} r={5} />)}
          </div>
          <Skel h={44} r={11} className="mt-auto" style={{ width: "100%" }} />
        </div>
      </OverlayScrollArea>
    </aside>
  </div>
);

// ── AI "View more" detail modal ───────────────────────────────────────────────
// Rendered inline (inside .ck-dash-root) so the dashboard's CSS vars / fonts
// apply. Keeps its last content during the exit animation via the caller's ref.
const ReviewModal = ({ open, review: r, onClose }) => (
  <AnimatePresence>
    {open && r && (
      <motion.div
        className="ck-review-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          className="ck-review-modal ck-dscroll"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
          role="dialog"
          aria-modal="true"
          aria-label={r.scriptTitle}
        >
          <div className="ck-review-modal__head">
            <div className="min-w-0">
              <div className="ck-review-modal__eyebrow">AI-Powered Analysis</div>
              <h3 className="ck-review-modal__title">{r.scriptTitle}</h3>
            </div>
            <button className="ck-review-modal__close" onClick={onClose} aria-label="Close">
              <MatIcon name="close" size={20} />
            </button>
          </div>
          <div className="ck-review-modal__body">
            <AiReviewDetail review={r} />
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// ── All Projects modal (paginated) ────────────────────────────────────────────
// Windowed page list: 1 … (cur-1) cur (cur+1) … N, so it stays compact whether
// there are 8 projects or 800.
const pageList = (current, total) => {
  const range = [];
  for (let i = Math.max(1, current - 1); i <= Math.min(total, current + 1); i++) range.push(i);
  if (range[0] > 1) { if (range[0] > 2) range.unshift("…"); range.unshift(1); }
  const last = range[range.length - 1];
  if (last < total) { if (last < total - 1) range.push("…"); range.push(total); }
  return range;
};

const PagerBtn = ({ dir, disabled, onClick }) => (
  <button
    type="button"
    className="ck-pager__arrow"
    disabled={disabled}
    onClick={onClick}
    aria-label={dir === "prev" ? "Previous page" : "Next page"}
  >
    <MatIcon name={dir === "prev" ? "chevronLeft" : "chevronRight"} size={18} />
  </button>
);

const AllProjectsModal = ({ open, projects, user, page, onPage, onClose }) => {
  const bodyRef = useRef(null);
  const total = projects.length;
  const totalPages = Math.max(1, Math.ceil(total / PROJECTS_PER_PAGE));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * PROJECTS_PER_PAGE;
  const pageItems = projects.slice(start, start + PROJECTS_PER_PAGE);

  // Jump back to the top of the list whenever the page changes.
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [current]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ck-review-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="ck-projects-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-label="My Projects"
          >
            <div className="ck-review-modal__head">
              <div className="min-w-0">
                <div className="ck-review-modal__eyebrow">My Projects</div>
                <h3 className="ck-review-modal__title">
                  {total} project{total === 1 ? "" : "s"}
                </h3>
              </div>
              <button className="ck-review-modal__close" onClick={onClose} aria-label="Close">
                <MatIcon name="close" size={20} />
              </button>
            </div>

            <div className="ck-review-modal__body ck-dscroll" ref={bodyRef}>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {pageItems.map(p => (
                  <ProjectCard
                    key={p._id}
                    project={p}
                    userName={p.creator?.name?.toUpperCase() || user?.name?.toUpperCase() || "UNKNOWN"}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="ck-pager">
                  <PagerBtn dir="prev" disabled={current === 1} onClick={() => onPage(current - 1)} />
                  {pageList(current, totalPages).map((p, i) =>
                    p === "…" ? (
                      <span key={`gap-${i}`} className="ck-pager__gap">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        className={`ck-pager__num${p === current ? " active" : ""}`}
                        aria-current={p === current ? "page" : undefined}
                        onClick={() => onPage(p)}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <PagerBtn dir="next" disabled={current === totalPages} onClick={() => onPage(current + 1)} />
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const aiScoreColor = (rating) =>
  rating >= 80 ? { border: ACCENT,    text: ACCENT,    label: "Excellent"  } :
  rating >= 60 ? { border: "#c9b59a", text: "#a9895f", label: "Good"       } :
                 { border: "#c9bfae", text: "#8d877e", label: "Needs Work" };

// ── AI Analysis compact card ──────────────────────────────────────────────────
// Sized to match the Platform Insights card (AdminReviewCard): header band +
// score-bar body + footer. Full detail lives behind "View more".
const AiReviewCompact = ({ review: r, onOpen }) => {
  const sc = aiScoreColor(r.rating);
  const scores = Object.entries(r.scores || {}).slice(0, 5);
  return (
    <div className="flex-none box-border" style={{ width: "100%", paddingRight: 2 }}>
      {/* Flat card — matches the 2B review card exactly (14px radius, no bands) */}
      <div style={{ border: "1px solid #ebe5d9", borderRadius: 14, padding: "20px 24px" }}>
        {/* Header */}
        <div className="flex items-start justify-between" style={{ gap: 14 }}>
          <div className="min-w-0">
            <h4 className="truncate" style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 21, color: BASE, margin: 0 }}>
              {r.scriptTitle}
            </h4>
            <p className="font-bold uppercase" style={{ fontSize: 9.5, letterSpacing: "1.5px", color: "#b1aa9e", margin: "5px 0 0" }}>
              AI-Powered Analysis
            </p>
          </div>
          <div className="flex items-baseline shrink-0" style={{ gap: 11 }}>
            <span
              className="font-bold uppercase"
              style={{ fontSize: 9.5, letterSpacing: "1.3px", padding: "4px 10px", border: `1px solid ${sc.border}`, borderRadius: 6, color: sc.text }}
            >
              {sc.label}
            </span>
            <div className="flex items-baseline" style={{ gap: 3 }}>
              <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 36, color: BASE, lineHeight: 1 }}>{r.rating}</span>
              <span style={{ fontSize: 11, color: "#b1aa9e" }}>/100</span>
            </div>
          </div>
        </div>

        {/* Score bars */}
        {scores.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            {scores.map(([key, val], i) => (
              <div
                key={key}
                className="flex items-center"
                style={{ gap: 14, padding: "9px 0", borderBottom: i < scores.length - 1 ? "1px solid #f4efe6" : undefined }}
              >
                <span className="font-bold uppercase truncate" style={{ fontSize: 9.5, letterSpacing: ".8px", color: "#a39d92", flex: "none", width: 100 }}>
                  {key}
                </span>
                <div style={{ flex: 1, height: 2, background: "#f1ece2", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, Math.max(0, val))}%`, background: ACCENT }} />
                </div>
                <span style={{ fontFamily: DISPLAY_FONT, fontSize: 15, color: BASE, width: 30, textAlign: "right" }}>{val}</span>
              </div>
            ))}
          </div>
        ) : (
          r.feedback && (
            <p className="line-clamp-3" style={{ fontFamily: DISPLAY_FONT, fontStyle: "italic", color: BASE, fontSize: 15, lineHeight: 1.5, margin: "16px 0 0" }}>
              “{r.feedback}”
            </p>
          )
        )}

        {/* Feedback preview + View more */}
        <div className="flex items-center justify-between" style={{ gap: 12, borderTop: "1px solid #f0ebe0", marginTop: 10, paddingTop: 14 }}>
          <span className="truncate" style={{ fontSize: 12, color: "#6f695f", minWidth: 0 }}>
            {scores.length > 0 && r.feedback ? r.feedback : ""}
          </span>
          <button type="button" className="ck-rev-more" onClick={onOpen}>
            View more
            <MatIcon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

const AiReviewDetail = ({ review: r }) => {
  const scoreColor = aiScoreColor(r.rating);

  return (
    <div
      className="grid ck-rev-detail-grid"
      style={{ gridTemplateColumns: "150px 1px 1fr", gap: "24px", alignItems: "start" }}
    >
          {/* Score */}
          <div>
            <div className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: "1.6px", color: ACCENT }}>
              Overall Score
            </div>
            <div style={{ fontFamily: DISPLAY_FONT, color: BASE, fontSize: 58, fontWeight: 500, lineHeight: 1, marginTop: 6 }}>
              {r.rating}
            </div>
            <div
              className="inline-flex mt-2.5 rounded-md font-semibold"
              style={{ padding: "4px 13px", border: `1px solid ${scoreColor.border}`, fontSize: 12, color: scoreColor.text }}
            >
              {scoreColor.label}
            </div>
          </div>

          {/* Divider */}
          <div style={{ background: "#ebe5d9", width: 1, height: "100%" }} />

          {/* Content */}
          <div className="min-w-0">
            {r.feedback && (
              <p style={{ fontFamily: DISPLAY_FONT, color: BASE, fontSize: 19, lineHeight: 1.4, margin: 0 }}>
                "{r.feedback}"
              </p>
            )}

            {/* Score breakdown */}
            {Object.keys(r.scores || {}).length > 0 && (
              <div
                className="mt-4 pt-4 grid border-t"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(Object.keys(r.scores).length, 6)}, 1fr)`,
                  gap: 10,
                  borderColor: "#f0ebe0",
                }}
              >
                {Object.entries(r.scores).map(([key, val]) => (
                  <div key={key}>
                    <div className="font-bold uppercase" style={{ fontSize: 8.5, letterSpacing: ".8px", color: FAINT }}>
                      {key}
                    </div>
                    <div style={{ fontFamily: DISPLAY_FONT, color: BASE, fontSize: 13, marginTop: 5 }}>
                      {val >= 80 ? "Excellent" : val >= 65 ? "Strong" : val >= 50 ? "Good" : "Developing"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Strengths / Weaknesses / Improvements */}
            {(r.strengths?.length > 0 || r.weaknesses?.length > 0 || r.improvements?.length > 0) && (
              <div
                className="mt-4 pt-4 grid border-t"
                style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "28px", borderColor: "#f0ebe0" }}
              >
                {r.strengths?.length > 0 && (
                  <div>
                    <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: "1.3px", color: ACCENT, margin: "0 0 8px" }}>
                      Strengths
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                      {r.strengths.map((s, i) => (
                        <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.45, color: MUTED }}>
                          <span style={{ color: ACCENT, flexShrink: 0 }}>—</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.weaknesses?.length > 0 && (
                  <div>
                    <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: "1.3px", color: FAINT, margin: "0 0 8px" }}>
                      To Improve
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                      {r.weaknesses.map((w, i) => (
                        <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.45, color: MUTED }}>
                          <span style={{ color: "#c9bfae", flexShrink: 0 }}>—</span>{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.improvements?.length > 0 && (
                  <div>
                    <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: "1.3px", color: FAINT, margin: "0 0 8px" }}>
                      Recommendations
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                      {r.improvements.map((imp, i) => (
                        <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.45, color: MUTED }}>
                          <span style={{ fontFamily: DISPLAY_FONT, color: BASE, flexShrink: 0 }}>{i + 1}</span>{imp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Audience fit + comparables */}
            {(r.audienceFit || r.comparables) && (
              <div
                className="mt-4 pt-4 grid border-t"
                style={{
                  gridTemplateColumns: r.audienceFit && r.comparables ? "1fr 1fr" : "1fr",
                  gap: 16,
                  borderColor: "#f0ebe0",
                }}
              >
                {r.audienceFit && (
                  <div>
                    <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: "1.3px", color: FAINT, margin: "0 0 6px" }}>
                      Audience &amp; Market
                    </p>
                    <p style={{ fontSize: 12, lineHeight: 1.6, color: MUTED, margin: 0 }}>{r.audienceFit}</p>
                  </div>
                )}
                {r.comparables && (
                  <div>
                    <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: "1.3px", color: FAINT, margin: "0 0 6px" }}>
                      Comparable Titles
                    </p>
                    <p style={{ fontSize: 12, lineHeight: 1.6, color: MUTED, margin: 0 }}>{r.comparables}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
  );
};

const AdminReviewCard = ({ review: s }) => {
  const ov = s.overall ?? 0;
  const gc =
    ov >= 85 ? ACCENT   :
    ov >= 70 ? "#1f8a5b" :
    ov >= 55 ? "#3b82f6" :
    ov >= 40 ? "#f59e0b" :
               "#ef4444";
  const gl = ov >= 85 ? "A" : ov >= 70 ? "B" : ov >= 55 ? "C" : ov >= 40 ? "D" : "F";

  const dims = [
    { key: "content",  label: "Main Content" },
    { key: "trailer",  label: "Trailer"      },
    { key: "title",    label: "Title"         },
    { key: "synopsis", label: "Synopsis"      },
    { key: "tags",     label: "Tag & Meta"   },
  ];

  return (
    <div className="flex-none box-border" style={{ width: "100%", paddingRight: 2 }}>
      {/* Flat card — matches the 2B review card exactly (14px radius, no bands) */}
      <div style={{ border: "1px solid #ebe5d9", borderRadius: 14, padding: "20px 24px" }}>
        {/* Header */}
        <div className="flex items-start justify-between" style={{ gap: 14 }}>
          <div className="min-w-0">
            <h4 className="truncate" style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 21, color: BASE, margin: 0 }}>
              {s.scriptTitle}
            </h4>
            {s.scoredAt && (
              <p style={{ fontSize: 11, color: "#a39d92", margin: "5px 0 0" }}>
                Reviewed {new Date(s.scoredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <div className="flex items-baseline shrink-0" style={{ gap: 11 }}>
            <span
              className="font-bold uppercase"
              style={{ fontSize: 9.5, letterSpacing: "1.3px", padding: "4px 10px", border: `1px solid ${gc}`, borderRadius: 6, color: gc }}
            >
              Grade {gl}
            </span>
            <div className="flex items-baseline" style={{ gap: 3 }}>
              <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 36, color: BASE, lineHeight: 1 }}>{ov}</span>
              <span style={{ fontSize: 11, color: "#b1aa9e" }}>/100</span>
            </div>
          </div>
        </div>

        {/* Score bars */}
        <div style={{ marginTop: 16 }}>
          {dims.map((d, i) => {
            const val = s[d.key] ?? 0;
            return (
              <div
                key={d.key}
                className="flex items-center"
                style={{ gap: 14, padding: "9px 0", borderBottom: i < dims.length - 1 ? "1px solid #f4efe6" : undefined }}
              >
                <span className="font-bold uppercase" style={{ fontSize: 9.5, letterSpacing: ".8px", color: "#a39d92", flex: "none", width: 100 }}>
                  {d.label}
                </span>
                <div style={{ flex: 1, height: 2, background: "#f1ece2", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, Math.max(0, val))}%`, background: ACCENT }} />
                </div>
                <span style={{ fontFamily: DISPLAY_FONT, fontSize: 15, color: BASE, width: 30, textAlign: "right" }}>{val}</span>
              </div>
            );
          })}
        </div>

        {/* Feedback */}
        {s.feedback && (
          <div style={{ borderTop: "1px solid #f0ebe0", marginTop: 10, paddingTop: 14 }}>
            <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: "1.3px", color: ACCENT, margin: "0 0 6px" }}>
              Feedback
            </p>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: "#6f695f", margin: 0 }}>{s.feedback}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyPanel = ({ icon, title, desc }) => (
  <div className="flex flex-col items-center justify-center py-12">
    <div
      className="flex items-center justify-center rounded-xl mb-3"
      style={{ width: 48, height: 48, background: CREAM }}
    >
      <MatIcon name={icon} size={24} style={{ color: "#c9bfae" }} />
    </div>
    <p style={{ color: BASE, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</p>
    <p style={{ color: FAINT, fontSize: 13, textAlign: "center", maxWidth: 260 }}>{desc}</p>
  </div>
);

export default Dashboard;



const AllConsultationsModal = ({ open, consultations, onClose }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ck-review-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="ck-review-modal"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            style={{ width: "800px", maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
          >
            <div className="ck-review-modal__header" style={{ padding: "24px 32px", borderBottom: "1px solid #f4efe6" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="ck-review-modal__eyebrow">My Consultations</div>
                  <h3 className="ck-review-modal__title" style={{ fontFamily: DISPLAY_FONT, color: BASE, margin: "8px 0 0" }}>All Consultations</h3>
                </div>
                <button type="button" className="ck-review-modal__close" onClick={onClose} aria-label="Close modal">
                  <MatIcon name="close" size={24} />
                </button>
              </div>
            </div>

            <div className="ck-review-modal__body" style={{ padding: "32px", overflowY: "auto", overflowX: "hidden" }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {consultations.map(c => (
                  <div key={c._id} className="flex flex-col box-border" style={{ padding: "20px", border: `1px solid ${BORDER}`, borderRadius: "14px", background: "white", transition: "transform 0.2s", cursor: "default" }}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: "18px", color: BASE, fontWeight: 500 }}>
                          {c.topic}
                        </h4>
                        <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: MUTED }}>
                          with {c.professional?.name || "Professional"}
                        </p>
                      </div>
                      <span style={{ 
                        padding: "4px 10px", 
                        borderRadius: "20px", 
                        fontSize: "10px", 
                        fontWeight: "700", 
                        textTransform: "uppercase", 
                        letterSpacing: "0.5px", 
                        background: c.status === 'accepted' || c.status === 'meeting_scheduled' ? '#ecfdf5' : (c.status === 'rejected' ? '#fef2f2' : '#f8fafc'), 
                        color: c.status === 'accepted' || c.status === 'meeting_scheduled' ? '#059669' : (c.status === 'rejected' ? '#dc2626' : MUTED),
                        border: `1px solid ${c.status === 'accepted' || c.status === 'meeting_scheduled' ? '#a7f3d0' : (c.status === 'rejected' ? '#fecaca' : BORDER)}`
                      }}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                    
                    <div className="flex-1 mt-2" style={{ fontSize: "13px", color: MUTED, display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div className="flex items-center gap-2"><strong style={{ color: BASE }}>Date:</strong> {new Date(c.scheduledStart).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(c.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="flex items-center gap-2"><strong style={{ color: BASE }}>Amount:</strong> {c.amount / 100} {c.currency}</div>
                      
                      {c.googleMeetUrl && c.status !== 'rejected' && (
                        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                          <a href={c.googleMeetUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#2563eb", fontWeight: "600", textDecoration: "none" }}>
                            Join Google Meet &rarr;
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
