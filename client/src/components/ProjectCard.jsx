import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDarkMode } from "../context/DarkModeContext";
import { formatCurrency } from "../utils/currency";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { getScriptCanonicalPath } from "../utils/scriptPath";
import { AuthContext } from "../context/AuthContext";
import api from "../services/api";
import { useScriptBookmark } from "../hooks/useScriptBookmark";
import SocialShareButton from "./SocialShareButton";
import { formatScriptCredit } from "../utils/writerCredits";
import {
  getScriptCompletionBadgeClasses,
  getScriptCompletionProgressText,
  getScriptCompletionStatusLabel,
} from "../utils/scriptCompletion";

const FORMAT_LABEL = {
  feature: "Feature Film",
  movie: "Movie",
  short: "Short Film",
  tv_1hour: "TV 1-Hour",
  tv_halfhour: "TV Half-Hour",
  tv_pilot: "TV Pilot",
  tv_serial: "TV Serial",
  limited_series: "Limited Series",
  fiction_novel: "Fiction Novel",
  webseries: "Web Series",
  web_series: "Web Series",
  documentary: "Documentary",
  drama_school: "Drama School",
  micro_drama: "Micro Drama",
  anime: "Anime",
  cartoon: "Cartoon",
  songs: "Songs",
  standup_comedy: "Standup Comedy",
  dialogues: "Dialogues",
  poet: "Poet",
  other: "Other",
};

const STATUS = {
  pending_approval: { label: "In Review", dot: "bg-amber-400",   dk: "text-amber-400",   lt: "text-amber-600" },
  rejected:         { label: "Rejected",  dot: "bg-rose-400",    dk: "text-rose-400",    lt: "text-rose-600"  },
  approved:         { label: "Published", dot: "bg-emerald-400", dk: "text-emerald-400", lt: "text-emerald-600" },
  published:        { label: "Published", dot: "bg-emerald-400", dk: "text-emerald-400", lt: "text-emerald-600" },
  draft:            { label: "Draft",     dot: "bg-[#4a5a6e]",   dk: "text-[#4a5a6e]",  lt: "text-gray-400"  },
};

const ProjectCard = ({ project, userName, onBlock }) => {
  const navigate = useNavigate();
  const { isDarkMode: dark } = useDarkMode();
  const { user } = useContext(AuthContext);
  const { isBookmarked, canBookmark, toggleBookmark: handleToggleBookmark } = useScriptBookmark(project);
  const [coverError, setCoverError] = useState(false);

  const isClickable  = project?.status === "published" || project?.status === "approved";
  const genre        = project?.primaryGenre || project?.genre || null;
  const format       = project?.format === "other"
    ? (project?.formatOther || FORMAT_LABEL.other)
    : (FORMAT_LABEL[project?.format] || project?.format || null);
  const score        = project?.platformScore?.overall ?? project?.scriptScore?.overall ?? null;
  const views        = project?.views ?? 0;
  const rating       = project?.rating ?? 0;
  const reads        = project?.readsCount ?? 0;
  const completionLabel = getScriptCompletionStatusLabel(project);
  const completionProgress = getScriptCompletionProgressText(project);
  const completionBadgeCls = getScriptCompletionBadgeClasses(project, dark);
  const isWriterOrInvestorViewer = user?.role === "writer" || user?.role === "creator" || user?.role === "investor";
  const status       = STATUS[project?.status] || STATUS.draft;
  const coverImage   = project?.coverImage || null;
  const resolvedCoverImage = coverError ? "" : resolveMediaUrl(coverImage);
  const initials     = (project?.title || "SC").replace(/[^a-zA-Z0-9 ]/g, "").trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "SC";
  const spotlightSpend = Number(
    project?.billing?.spotlightCreditsSpent
      || project?.billing?.spotlightCreditsChargedAtUpload
      || project?.promotion?.totalSpotlightCreditsSpent
      || 0
  );
  const hasSpotlightPurchase = spotlightSpend > 0 || Boolean(project?.promotion?.lastSpotlightPurchaseAt);
  const evaluationSpend = Number(
    project?.billing?.evaluationCreditsCharged
      || project?.billing?.evaluationCreditsChargedAtUpload
      || 0
  );
  const trailerSpend = Number(
    project?.billing?.aiTrailerCreditsCharged
      || project?.billing?.aiTrailerCreditsChargedAtUpload
      || 0
  );
  const showVerifiedBadge = Boolean(project?.verifiedBadge || project?.promotion?.spotlightActive || hasSpotlightPurchase);
  const isPublished = project?.status === "published" || project?.status === "approved";
  const timelineDate = isPublished
    ? (project?.publishedAt || project?.createdAt)
    : project?.createdAt;
  const timelineLabel = isPublished ? "Published" : "Uploaded";
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const projectShare = {
    url: project?.shareMeta?.url || (project?._id ? `${browserOrigin}/share/project/${project._id}` : ""),
    title: project?.shareMeta?.title || `${project?.title || "Project"} | Ckript`,
    text: project?.shareMeta?.text || (project?.logline || project?.synopsis || "Check out this project on Ckript."),
  };

  useEffect(() => {
    setCoverError(false);
  }, [project?._id, coverImage]);

  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const fmtDateTime = (d) =>
    d
      ? new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      : "N/A";

  const handleCardClick = async () => {
    if (!isClickable) return;
    if (onBlock) { onBlock(); return; }

    if (project?._id) {
      api
        .post(`/scripts/${project._id}/interactions`, {
          type: "click",
          source: "project_card",
          metadata: { from: "feed" },
        })
        .catch(() => null);
    }

    navigate(getScriptCanonicalPath(project));
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-500 select-none ${
        isClickable ? "cursor-pointer" : "cursor-default"
      } ${
        dark
          ? "bg-[#0c1420] border-[#1a2636] hover:border-[#263c54]"
          : "bg-white border-gray-200 hover:border-gray-300 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
      } max-[768px]:border-0 max-[768px]:shadow-none`}
    >

      {/* ══ HERO — compact height for tighter cards ══ */}
      <div className="relative h-36 w-full flex-shrink-0 overflow-hidden">

        {resolvedCoverImage ? (
          /* — Thumbnail — */
          <img
            src={resolvedCoverImage}
            alt={project?.title || "Script cover"}
            onError={() => setCoverError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <img
            src="/common-thumbnail.png"
            alt="Project placeholder"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        )}

        {/* Bottom scrim — always present for consistent fade into card body */}
        <div className={`absolute inset-x-0 bottom-0 h-16 pointer-events-none ${
          dark
            ? "bg-gradient-to-t from-[#0c1420] to-transparent"
            : "bg-gradient-to-t from-white to-transparent"
        }`} />

        {/* ── overlay badges ── */}

        {/* Status — top-left */}
        <div className="absolute top-3 left-3">
          <div className="flex flex-col items-start gap-1.5">
            <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.13em] uppercase px-2.5 py-1.5 rounded-lg backdrop-blur-sm ${
              dark
                ? "bg-[#0b2440]/70 text-white/85 border border-[#7ea8d2]/30"
                : "bg-white/85 text-[#23476c] border border-[#bed2ea]/90 shadow-sm"
            }`}>
              <span className="relative flex h-[6px] w-[6px]">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-50 ${status.dot} ${project?.status === "published" ? "animate-ping" : ""}`} />
                <span className={`relative inline-flex h-[6px] w-[6px] rounded-full ${status.dot}`} />
              </span>
              {status.label}
            </span>
          </div>
        </div>

        {/* Bookmark — top-right */}
        {canBookmark && (
          <button
            onClick={handleToggleBookmark}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark project"}
            className={`absolute top-3 right-3 z-20 w-8 h-8 rounded-lg border backdrop-blur-sm flex items-center justify-center transition ${isBookmarked
              ? dark ? "bg-amber-500/20 border-amber-400/30 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-600"
              : dark ? "bg-black/45 border-white/[0.08] text-white/60 hover:text-white" : "bg-white/85 border-gray-200 text-gray-500 hover:text-gray-800"
            }`}
          >
            <svg className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`} viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5h13.5a.75.75 0 01.75.75v15.69a.75.75 0 01-1.219.594L12 16.34l-6.281 5.194a.75.75 0 01-1.219-.594V5.25a.75.75 0 01.75-.75z" />
            </svg>
          </button>
        )}

        {/* Score — top-right */}
        {score != null && (
          <div className={`absolute top-3 ${canBookmark ? "right-12" : "right-3"} flex items-baseline gap-0.5 px-2.5 py-1.5 rounded-lg backdrop-blur-sm ${
            dark
              ? "bg-black/45 border border-white/[0.07]"
              : "bg-white/80 border border-gray-200/80 shadow-sm"
          }`}>
            <span className={`text-[13px] font-black leading-none tabular-nums ${dark ? "text-white" : "text-gray-800"}`}>{score}</span>
            <span className={`text-[9px] font-semibold ${dark ? "text-white/25" : "text-gray-300"}`}>/100</span>
          </div>
        )}

        {showVerifiedBadge && (
          <div className={`absolute bottom-3.5 left-3.5 inline-flex items-center gap-1 text-[9px] font-black tracking-[0.12em] uppercase px-2.5 py-[5px] rounded-lg backdrop-blur-sm ${
            dark
              ? "bg-[#0f2f54]/72 text-white border border-[#8db7e6]/40"
              : "bg-white/88 text-[#1f4f8d] border border-[#b8d0ec]"
          }`}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Verified
          </div>
        )}
      </div>

      {/* ══ BODY ══ */}
      <div className="flex flex-col flex-1 px-4 pt-3 pb-3 gap-0">

        {/* Title + Share */}
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-[15px] font-bold leading-snug tracking-[-0.015em] line-clamp-1 transition-colors duration-200 ${
            dark ? "text-white/90 group-hover:text-white" : "text-gray-900"
          }`}>
            {project?.title || "Untitled Project"}
          </h3>
          <SocialShareButton
            share={projectShare}
            iconOnly
            buttonLabel="Share project"
            className={`w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0 border transition ${dark ? "bg-[#152030] border-[#223142] text-[#9cb0c4] hover:text-white hover:bg-[#1f3246]" : "bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          />
        </div>

        {/* Author — every credited writer, not just the owner. Derived from the project so all
            ~14 call sites get co-writer credits without each having to pass them; `userName`
            remains the fallback for callers whose payload has no credits/creator populated. */}
        <p className={`mt-[3px] text-[11px] font-medium ${dark ? "text-[#3b4f63]" : "text-gray-400"}`}>
          by {formatScriptCredit(project, { max: 2 }) || userName || "Unknown Author"}
        </p>
        {project?.sid && (
          <p className={`mt-1 text-[10px] font-semibold tracking-wide ${dark ? "text-[#5f87b8]" : "text-[#1e3a5f]"}`}>
            SID: {project.sid}
          </p>
        )}
        {timelineDate && (
          <p className={`mt-1 text-[10px] font-medium ${dark ? "text-[#5a6f85]" : "text-gray-500"}`}>
            {timelineLabel}: {fmtDateTime(timelineDate)}
          </p>
        )}

        {/* Divider */}
        <div className={`my-2 h-px ${dark ? "bg-[#182535]" : "bg-gray-100"}`} />

        {/* Logline/Synopsis preview */}
        <p className={`text-[12px] leading-[1.6] line-clamp-1 flex-1 ${
          (project?.logline || project?.synopsis || project?.description)
            ? (dark ? "text-[#68788a]" : "text-gray-500")
            : (dark ? "text-[#253545]/60" : "text-gray-300")
        }`}>
          {project?.logline || project?.synopsis || project?.description || "No synopsis provided."}
        </p>

        {/* Tags */}
        {(genre || format || completionLabel) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={`text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-lg ${completionBadgeCls}`}>
              {completionLabel}
            </span>
            {completionProgress && (
              <span className={`text-[10px] font-medium tracking-wide px-2.5 py-1 rounded-lg ${dark ? "bg-[#111e2d] text-[#6f859a]" : "bg-gray-50 text-gray-500 border border-gray-100"}`}>
                {completionProgress}
              </span>
            )}
            {genre && (
              <span className={`text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-lg ${
                dark ? "bg-[#111e2d] text-[#8896a7]" : "bg-gray-100 text-gray-600"
              }`}>
                {genre}
              </span>
            )}
            {format && (
              <span className={`text-[10px] font-medium tracking-wide px-2.5 py-1 rounded-lg ${
                dark ? "bg-[#111e2d] text-[#45576a]" : "bg-gray-50 text-gray-400 border border-gray-100"
              }`}>
                {format}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ══ FOOTER ══ */}
      <div className={`px-4 py-2.5 border-t ${
        dark ? "border-[#182535] bg-[#091017]" : "border-gray-100 bg-gray-50/60"
      }`}>
        {isWriterOrInvestorViewer ? (
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex items-center gap-1.5 shrink-0 ${dark ? "text-[#3b4f63]" : "text-gray-400"}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[11px] font-semibold tabular-nums">{fmt(views)}</span>
              </div>

              {rating > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <svg className="w-3.5 h-3.5 text-amber-400/70" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className={`text-[11px] font-semibold ${dark ? "text-[#68788a]" : "text-gray-500"}`}>{rating.toFixed(1)}</span>
                </div>
              )}
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {project?.isSold ? (
                <span className={`text-[10px] font-bold tracking-wide uppercase px-2.5 py-1 rounded-lg ${
                  dark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                }`}>Sold</span>
              ) : project?.holdStatus === "held" ? (
                <span className={`text-[10px] font-bold tracking-wide uppercase px-2.5 py-1 rounded-lg ${
                  dark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"
                }`}>On Hold</span>
              ) : project?.premium && project?.price ? (
                <span className={`text-[14px] max-[360px]:text-[13px] font-extrabold tracking-tight tabular-nums whitespace-nowrap ${dark ? "text-white" : "text-gray-900"}`}>{formatCurrency(project.price)}</span>
              ) : (
                <span className={`text-[10px] font-bold tracking-wide uppercase ${dark ? "text-[#8fa3b8]" : "text-gray-500"}`}>Free</span>
              )}

              {isClickable && (
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 ${
                  dark
                    ? "bg-[#152030] text-[#3b4f63] group-hover:bg-[#1e3b58] group-hover:text-white"
                    : "bg-gray-100 text-gray-400 group-hover:bg-gray-900 group-hover:text-white"
                }`}>
                  <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-px" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 max-[360px]:gap-2 min-w-0 flex-wrap">
              {/* Views */}
              <div className={`flex items-center gap-1.5 shrink-0 ${dark ? "text-[#3b4f63]" : "text-gray-400"}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[11px] font-semibold tabular-nums">{fmt(views)}</span>
              </div>

              {/* Reads */}
              <div className={`flex items-center gap-1.5 shrink-0 ${dark ? "text-[#3b4f63]" : "text-gray-400"}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 3.332.477 4.5 1.253v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                <span className="text-[11px] font-semibold tabular-nums">{fmt(reads)}</span>
              </div>

              {/* Rating */}
              {rating > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <svg className="w-3.5 h-3.5 text-amber-400/70" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className={`text-[11px] font-semibold ${dark ? "text-[#68788a]" : "text-gray-500"}`}>{rating.toFixed(1)}</span>
                </div>
              )}
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {project?.isSold ? (
                <span className={`text-[10px] font-bold tracking-wide uppercase px-2.5 py-1 rounded-lg ${
                  dark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                }`}>Sold</span>
              ) : project?.holdStatus === "held" ? (
                <span className={`text-[10px] font-bold tracking-wide uppercase px-2.5 py-1 rounded-lg ${
                  dark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"
                }`}>On Hold</span>
              ) : project?.premium && project?.price ? (
                <span className={`text-[14px] max-[360px]:text-[13px] font-extrabold tracking-tight tabular-nums whitespace-nowrap ${dark ? "text-white" : "text-gray-900"}`}>{formatCurrency(project.price)}</span>
              ) : (
                <span className={`text-[10px] font-bold tracking-wide uppercase ${dark ? "text-[#8fa3b8]" : "text-gray-500"}`}>Free</span>
              )}

              {/* Arrow CTA button — published only */}
              {isClickable && (
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 ${
                  dark
                    ? "bg-[#152030] text-[#3b4f63] group-hover:bg-[#1e3b58] group-hover:text-white"
                    : "bg-gray-100 text-gray-400 group-hover:bg-gray-900 group-hover:text-white"
                }`}>
                  <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-px" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rejection reason strip */}
      {project?.status === "rejected" && project?.rejectionReason && (
        <div className={`px-5 py-2 border-t text-[10px] leading-relaxed line-clamp-2 ${
          dark ? "border-[#182535] bg-rose-950/20 text-rose-400/60" : "border-gray-100 bg-rose-50/60 text-rose-500"
        }`}>
          {project.rejectionReason}
        </div>
      )}
    </div>
  );
};

export default ProjectCard;
