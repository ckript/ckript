/* eslint-disable react-refresh/only-export-components --
   A transitional module: stage 5a moves AdminDashboard's module layer here VERBATIM, and it mixes
   presentational components with the helpers they share. Stage 5b dissolves it into per-section
   modules; splitting by kind tonight would mean re-verifying every cross-reference twice. */
/**
 * AdminDashboard's module-level layer, moved out VERBATIM in stage 5a of the admin split —
 * the API client, the tab registry, pure formatters and the presentational tables and modals.
 * Nothing here touches component state; that is precisely why this slice moved first.
 *
 * adminApi stays re-exported from AdminDashboard.jsx: three sibling modules import it from there,
 * and two test files mock that module path. Their contract is unchanged.
 */
import { useState, useEffect } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import { formatCurrency } from "../../utils/currency";
import { getApiBaseUrl, getApiOrigin } from "../../utils/apiOrigin";
import { Paperclip, X } from "lucide-react";
import { attachAdminScriptAccessHeader } from "../../utils/adminScriptAccess";
import { getScriptCompletionBadgeClasses, getScriptCompletionProgressText, getScriptCompletionStatusLabel } from "../../utils/scriptCompletion";
import { Icon, StatCard } from "../../components/AdminUI";
import EmailBuilder from "./marketing/EmailBuilder";
import { compileEmailBlocksToHtml } from "./marketing/compiler/emailCompiler";

export const API_ORIGIN = getApiOrigin();
export const API_BASE_URL = getApiBaseUrl();
export const MAX_ATTACHMENT_SIZE_BYTES = 250 * 1024 * 1024;

// Admin-specific API — uses admin token from sessionStorage, separate from user session
// Exported so admin panels split into their own files (AdminCompetitions) reuse the SAME configured
// instance — the interceptors below carry the admin auth and script-access headers.
export const adminApi = axios.create({ baseURL: API_BASE_URL });
adminApi.interceptors.request.use((config) => {
    const adminSession = sessionStorage.getItem("admin-session");
    if (adminSession) {
        try {
            const { token } = JSON.parse(adminSession);
            if (token) config.headers.Authorization = `Bearer ${token}`;
        } catch {
            // Ignore malformed admin session data and proceed without token.
        }
    }
    return attachAdminScriptAccessHeader(config);
});

export const TABS = [
    { key: "overview", label: "Overview", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
    { key: "analytics", label: "Analytics", icon: "M3 3v18h18M7.5 14.25l3-3 2.25 2.25 4.5-4.5" },
    { key: "investors", label: "Film Professionals", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { key: "writers", label: "Writers", icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" },
    { key: "projects", label: "Scripts", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
    { key: "approvals", label: "Script Approvals", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { key: "trailers", label: "AI Trailer Approvals", icon: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375V5.625A1.125 1.125 0 016 4.5h12a1.125 1.125 0 011.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125h1.5" },
    { key: "ai-trailers", label: "AI Trailer", icon: "M4.5 8.25A2.25 2.25 0 016.75 6h10.5A2.25 2.25 0 0119.5 8.25v7.5A2.25 2.25 0 0117.25 18H6.75A2.25 2.25 0 014.5 15.75v-7.5zm6 1.5v4.5l4.5-2.25-4.5-2.25z" },
    { key: "evaluations", label: "AI Evaluations", icon: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" },
    { key: "meetings", label: "Meetings", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { key: "messages", label: "Messages", icon: "M7.5 8.25h9m-9 3h6m-9 9h12A2.25 2.25 0 0018.75 18V6A2.25 2.25 0 0016.5 3.75h-9A2.25 2.25 0 005.25 6v12A2.25 2.25 0 007.5 20.25z" },
    { key: "consultations", label: "Consultations", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
    { key: "direct-email", label: "Direct Email", icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
    { key: "membership-reviews", label: "SWA/WGA Reviews", icon: "M9 12.75L11.25 15 15 9.75m-6-7.5A2.25 2.25 0 0111.25 0h1.5A2.25 2.25 0 0115 2.25v1.134a9 9 0 11-6 0V2.25z" },
    { key: "swa-approved", label: "SWA/WGA Approved Members", icon: "M9 12.75L11.25 15 15 9.75m-6-7.5A2.25 2.25 0 0111.25 0h1.5A2.25 2.25 0 0115 2.25v1.134a9 9 0 11-6 0V2.25z" },
    { key: "competitions", label: "Competitions", icon: "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25s4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" },
    { key: "judges", label: "Judges", icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
    { key: "external-registrations", label: "Third-Party Entries", icon: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
    { key: "referrals", label: "Referrals", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.479m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
    { key: "queries", label: "Queries", icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
    { key: "ai-usage", label: "AI Usage", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
    { key: "scores", label: "Scores", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" },
    { key: "deleted-film-professionals", label: "Deleted Film Professionals", icon: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" },
    { key: "deleted-writers", label: "Deleted Writers", icon: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" },
    { key: "deleted-scripts", label: "Deleted Scripts", icon: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79" },
    { key: "discount-codes", label: "Discount Codes", icon: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" },
];

export const DownloadIconButton = ({ onClick, title, disabled, className = "" }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={title}
        className={`w-9 h-9 inline-flex items-center justify-center rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4.5 15.75v1.5A2.25 2.25 0 006.75 19.5h10.5a2.25 2.25 0 002.25-2.25v-1.5" />
        </svg>
    </button>
);

export const toDisplayText = (value) => {
    const text = String(value ?? "").trim();
    return text || "-";
};

export const getUserAddressLine = (user) => {
    const parts = [
        user?.address?.street,
        user?.address?.city,
        user?.address?.state,
        user?.address?.zipCode,
    ]
        .map((item) => String(item || "").trim())
        .filter(Boolean);

    if (parts.length > 0) return parts.join(", ");
    return String(user?.address?.formatted || "").trim();
};

export const getUserCompany = (user) => {
    return String(user?.industryProfile?.company || user?.writerProfile?.agencyName || "").trim();
};

export const getUserGenres = (user) => {
    const genreBuckets = [
        ...(Array.isArray(user?.writerProfile?.genres) ? user.writerProfile.genres : []),
        ...(Array.isArray(user?.industryProfile?.mandates?.genres) ? user.industryProfile.mandates.genres : []),
        ...(Array.isArray(user?.preferences?.genres) ? user.preferences.genres : []),
    ];

    const normalized = genreBuckets
        .map((genre) => String(genre || "").trim())
        .filter(Boolean);

    return Array.from(new Set(normalized)).join(", ");
};

export const getUserProfileSummary = (user) => {
    const company = getUserCompany(user);
    const genres = getUserGenres(user);
    const summaryParts = [];

    if (company) summaryParts.push(company);
    if (genres) summaryParts.push(`Genres: ${genres}`);

    return summaryParts.join(" • ");
};

export const formatIndustrySubRole = (subRole, subRoleOther) => {
    const normalized = String(subRole || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!normalized) return "";

    if (normalized === "other") {
        const custom = String(subRoleOther || "").trim();
        return custom ? `Other (${custom})` : "Other";
    }

    return normalized
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};

export const LOCALHOST_URL_REGEX = /\bhttps?:\/\/(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?[^\s]*/gi;
export const sanitizePreviousCreditsDisplay = (value = "") =>
    String(value || "")
        .replace(LOCALHOST_URL_REGEX, "")
        .replace(/\s{2,}/g, " ")
        .trim();

export const formatUserExportLine = (user, index) => {
    const address = getUserAddressLine(user);
    const company = getUserCompany(user);
    const genres = getUserGenres(user);

    return `${index + 1}. ${toDisplayText(user?.name)} | ${toDisplayText(user?.email)} | Phone: ${toDisplayText(user?.phone)} | Role: ${toDisplayText(user?.role)} | SID: ${toDisplayText(user?.sid)} | Company: ${toDisplayText(company)} | Genres: ${toDisplayText(genres)} | Address: ${toDisplayText(address)} | Joined: ${formatExportDate(user?.createdAt)}`;
};

export const buildOverviewExportLines = (overview) => [
    `Total Users: ${overview?.totalUsers || 0}`,
    `Total Scripts: ${overview?.totalScripts || 0}`,
    `Published Scripts: ${overview?.publishedScripts || 0}`,
    `Deleted Scripts: ${overview?.deletedScripts || 0}`,
    `Draft Scripts: ${overview?.draftScripts || 0}`,
    `Rejected Scripts: ${overview?.rejectedScripts || 0}`,
    `Sold Scripts: ${overview?.soldScripts || 0}`,
    `Writers: ${overview?.totalWriters || 0}`,
    `Film Professionals: ${overview?.totalInvestors || 0}`,
    `Readers: ${overview?.totalReaders || 0}`,
    `Pending Script Approvals: ${overview?.pendingApprovals || 0}`,
    `Pending AI Trailer Approvals: ${overview?.pendingTrailerRequests || 0}`,
    `AI Usage Scripts: ${overview?.aiUsageScripts || 0}`,
    `Evaluation Scripts: ${overview?.evaluationScripts || 0}`,
    `Pending Film Professional Requests: ${overview?.pendingInvestors || 0}`,
    `Pending SWA/WGA Reviews: ${overview?.pendingMembershipReviews || 0}`,
    `Pending Bank Reviews: ${overview?.pendingBankReviews || 0}`,
    `Locked Bank Users: ${overview?.lockedBankUsers || 0}`,
    `Bank Review Alerts: ${overview?.bankReviewAlerts || 0}`,
    `Queries: ${overview?.queries || 0}`,
    `Deleted Accounts: ${overview?.deletedAccounts || 0}`,
    `Deleted Film Professionals: ${overview?.deletedFilmProfessionals || 0}`,
    `Deleted Writers: ${overview?.deletedWriters || 0}`,
    `Open Admin Actions: ${overview?.openAdminActions || 0}`,
    `Transactions: ${overview?.totalTransactions || 0}`,
    `Total Revenue: ${formatCurrency(overview?.totalRevenue || 0, "INR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
];

export const PROJECT_CREATOR_ROLES = new Set(["writer", "creator"]);

export const getScriptCreatorName = (script) => {
    const role = String(script?.creator?.role || "").trim().toLowerCase();
    if (role && !PROJECT_CREATOR_ROLES.has(role)) {
        return "—";
    }
    return String(script?.creator?.name || "").trim() || "—";
};

export const getScriptPreviewWindowLabel = (script) => {
  if (!script?.viewableScript) return "";
  const mode = String(script?.scriptPreviewAccess?.mode || "").trim().toLowerCase() === "episodes" ? "Episodes" : "Pages";
  const start = Number(script?.scriptPreviewAccess?.start || 0);
  const end = Number(script?.scriptPreviewAccess?.end || 0);
  if (!start || !end) return "";
  return `${mode} ${start} to ${end}`;
};

export const parseTrailerRequestNote = (note) => {
    const text = String(note || "").trim();
    if (!text) return null;

    const fields = {};
    text.split(" | ").forEach((part) => {
        const [rawLabel, ...rest] = String(part || "").split(":");
        const label = String(rawLabel || "").trim().toLowerCase();
        const value = rest.join(":").trim();
        if (!label || !value) return;
        if (label === "duration") fields.duration = value;
        if (label === "quality") fields.quality = value;
        if (label === "layout") fields.layout = value;
        if (label === "display currency") fields.currency = value;
        if (label === "price") fields.price = value;
    });

    return { text, fields };
};

export const BroadcastComposer = ({
    isDark,
    audienceLabel,
    title,
    content,
    actionUrl,
    attachments = [],
    onTitleChange,
    onContentChange,
    onActionUrlChange,
    onAttachmentsChange,
    onSend,
    sending = false,
}) => {
    // Extract hidden blocks state from the existing content HTML if present
    const [blocks, setBlocks] = useState(() => {
        if (!content) return [];
        const match = content.match(/<!-- STATE:(.*?) -->/);
        if (match && match[1]) {
            try {
                return JSON.parse(decodeURIComponent(atob(match[1])));
            } catch (e) {
                console.error("Failed to parse blocks state from content", e);
            }
        }
        return [];
    });

    // When blocks change, compile and pass up to AdminDashboard
    useEffect(() => {
        if (blocks.length === 0) {
            if (content !== "") onContentChange("");
            return;
        }
        const rawHtml = compileEmailBlocksToHtml(blocks, title);
        const htmlWithState = `${rawHtml}\n<!-- STATE:${btoa(encodeURIComponent(JSON.stringify(blocks)))} -->`;
        // Only update if changed to prevent infinite loops if AdminDashboard re-renders
        if (htmlWithState !== content) {
            onContentChange(htmlWithState);
        }
    }, [blocks, title, onContentChange, content]);

    // Force reset blocks if content is reset externally (e.g. after sending)
    useEffect(() => {
        if (content === "" && blocks.length > 0) {
            setBlocks([]);
        }
    }, [content]);

    const handleFileChange = (e) => {
        if (e.target.files && onAttachmentsChange) {
            const newFiles = Array.from(e.target.files);
            const validFiles = newFiles.filter(f => f.size <= MAX_ATTACHMENT_SIZE_BYTES);
            if (validFiles.length < newFiles.length) {
                alert(`Some files were too large. Maximum size is ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB.`);
            }
            onAttachmentsChange([...attachments, ...validFiles]);
        }
        e.target.value = '';
    };

    const removeFile = (indexToRemove) => {
        if (onAttachmentsChange) {
            onAttachmentsChange(attachments.filter((_, idx) => idx !== indexToRemove));
        }
    };

    return (
        <div className={`rounded-2xl border mb-6 overflow-hidden bg-[var(--ad-surface)] border-[var(--ad-line)] shadow-sm`}>
            <div className={`px-5 py-4 border-b flex justify-between items-center border-[var(--ad-line)] bg-[var(--ad-surface-2)]`}>
                <h3 className={`text-sm font-extrabold uppercase tracking-wide ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                    Campaign Builder - {audienceLabel}
                </h3>
            </div>
            
            <div className="p-5 flex flex-col gap-5">
                <input
                    type="text"
                    value={title}
                    onChange={(event) => onTitleChange(event.target.value)}
                    placeholder={`Subject line for ${audienceLabel}`}
                    className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] placeholder:text-[var(--ad-ink-3)] focus:ring-[var(--ad-accent)]`}
                />

                {/* Email Builder Canvas */}
                <div className={`rounded-xl border overflow-hidden border-[var(--ad-line)]`}>
                    <EmailBuilder blocks={blocks} setBlocks={setBlocks} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <input
                            type="url"
                            value={actionUrl}
                            onChange={(event) => onActionUrlChange(event.target.value)}
                            placeholder="Optional Redirect Link (for old templates)"
                            className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] placeholder:text-[var(--ad-ink-3)] focus:ring-[var(--ad-accent)]`}
                        />
                    </div>
                    
                    <div className="relative">
                        <input
                            type="file"
                            multiple
                            id={`attachment-${audienceLabel}`}
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <label htmlFor={`attachment-${audienceLabel}`} className={`flex items-center justify-center cursor-pointer px-4 py-3 rounded-xl border text-sm font-medium transition-colors border-[var(--ad-line-2)] bg-[var(--ad-surface-2)] text-[var(--ad-ink-2)] hover:bg-[var(--ad-surface-3)]`}>
                            <Paperclip size={16} className="mr-2" />
                            Attach Files
                        </label>
                    </div>
                </div>

                {/* Attachments Preview */}
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {attachments.map((file, i) => (
                            <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border bg-[var(--ad-surface-2)] border-[var(--ad-line)] text-[var(--ad-ink-2)]`}>
                                <span className="truncate max-w-[150px]">{file.name}</span>
                                <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-end pt-2 border-t border-[var(--ad-line)] mt-2">
                    <button
                        type="button"
                        onClick={onSend}
                        disabled={sending || !title.trim() || blocks.length === 0}
                        // Both branches of the old ternary were identical #8B1E1E — the retired brand
                        // red, close enough to the current accent to look deliberate and wrong enough
                        // to sit half a step off every other primary button in the console.
                        className="px-8 py-3 rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--ad-accent)] text-[var(--ad-ink-invert)] hover:bg-[var(--ad-accent-hover)]"
                    >
                        {sending ? "Sending..." : `Launch Campaign to ${audienceLabel}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── User Table ───
export const UserTable = ({ users, isDark, onLoginAs, onViewUser, onFreezeUser, onUnfreezeUser, onGrantPremium, onRemovePremium, onDeleteUser, userActionLoading = "" }) => {
    const hasRowActions = Boolean(onLoginAs || onViewUser || onFreezeUser || onUnfreezeUser || onGrantPremium || onRemovePremium || onDeleteUser);

    return (
        <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#1a1616] border-[#2e2828]" : "bg-white border-gray-200/60 shadow-sm"}`}>
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className={isDark ? "bg-[#221d1d]" : "bg-gray-50"}>
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>User</th>
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Email</th>
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Role</th>
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Joined</th>
                        {hasRowActions && <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Actions</th>}
                    </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-[#2e2828]" : "divide-gray-100"}`}>
                    {users.map((u) => (
                        <tr key={u._id} className={`transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50/50"}`}>
                            <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                    {u.profileImage ? (
                                        <img src={u.profileImage} alt="" className="w-8 h-8 rounded-full object-cover" />
                                    ) : (
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isDark ? "bg-[#a83a4d]/20 text-[#e79aa6]" : "bg-[#7a2233]/10 text-[#7a2233]"}`}>
                                            {u.name?.charAt(0)?.toUpperCase() || "?"}
                                        </div>
                                    )}
                                    <div>
                                        <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{u.name}</p>
                                        <p className={`text-[11px] mt-0.5 font-bold ${u.isDeactivated ? "text-red-500" : u.isFrozen ? "text-amber-500" : (isDark ? "text-emerald-400" : "text-emerald-600")}`}>
                                            {u.isDeactivated ? "Deleted" : u.isFrozen ? "Frozen" : "Active"}
                                        </p>
                                        {u.phone && (
                                            <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-500"}`}>{u.phone}</p>
                                        )}
                                        {getUserProfileSummary(u) && (
                                            <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-500"}`}>{getUserProfileSummary(u)}</p>
                                        )}
                                    </div>
                                </div>
                            </td>
                            <td className={`px-5 py-3.5 text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{u.email}</td>
                            <td className="px-5 py-3.5">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${u.role === "investor" ? "bg-emerald-100 text-emerald-700" :
                                    u.role === "writer" || u.role === "creator" ? "bg-[#f7edee] text-[#a83a4d]" :
                                        "bg-purple-100 text-purple-700"
                                    }`}>{u.role}</span>
                            </td>
                            <td className={`px-5 py-3.5 text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>{new Date(u.createdAt).toLocaleDateString()}</td>
                            {hasRowActions && (
                                <td className="px-5 py-3.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {onViewUser && (
                                            <button onClick={() => onViewUser(u)} className="text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-emerald-500/10">View Details</button>
                                        )}
                                        {onLoginAs && (
                                            <button
                                                onClick={() => onLoginAs(u._id)}
                                                disabled={u.isFrozen || u.isDeactivated}
                                                className="text-xs font-bold text-[#a83a4d] hover:text-[#e79aa6] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#a83a4d]/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                            >
                                                Login As
                                            </button>
                                        )}

                                        {onGrantPremium && ["investor", "producer", "director", "industry", "professional"].includes(String(u.role).toLowerCase()) && !u.isPremium && (
                                            <button
                                                onClick={() => onGrantPremium(u)}
                                                disabled={Boolean(u.isDeactivated) || userActionLoading === `premium-${u._id}`}
                                                className="text-xs font-bold text-purple-500 hover:text-purple-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                            >
                                                {userActionLoading === `premium-${u._id}` ? "Granting..." : "Grant Premium"}
                                            </button>
                                        )}
                                        {onRemovePremium && ["investor", "producer", "director", "industry", "professional"].includes(String(u.role).toLowerCase()) && u.isPremium && (
                                            <button
                                                onClick={() => onRemovePremium(u)}
                                                disabled={Boolean(u.isDeactivated) || userActionLoading === `remove-premium-${u._id}`}
                                                className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                            >
                                                {userActionLoading === `remove-premium-${u._id}` ? "Removing..." : "Remove Premium"}
                                            </button>
                                        )}
                                        {onFreezeUser && !u.isFrozen && !u.isDeactivated && (
                                            <button
                                                onClick={() => onFreezeUser(u)}
                                                disabled={userActionLoading === `freeze-${u._id}`}
                                                className="text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                            >
                                                {userActionLoading === `freeze-${u._id}` ? "Freezing..." : "Freeze"}
                                            </button>
                                        )}
                                        {onUnfreezeUser && u.isFrozen && !u.isDeactivated && (
                                            <button
                                                onClick={() => onUnfreezeUser(u)}
                                                disabled={userActionLoading === `unfreeze-${u._id}`}
                                                className="text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                            >
                                                {userActionLoading === `unfreeze-${u._id}` ? "Unfreezing..." : "Unfreeze"}
                                            </button>
                                        )}
                                        {onDeleteUser && (
                                            <button
                                                onClick={() => onDeleteUser(u)}
                                                disabled={Boolean(u.isDeactivated) || userActionLoading === `delete-${u._id}`}
                                                className="text-xs font-bold text-red-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                            >
                                                {u.isDeactivated ? "Deleted" : userActionLoading === `delete-${u._id}` ? "Deleting..." : "Delete"}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                    {users.length === 0 && (
                        <tr><td colSpan={hasRowActions ? 5 : 4} className={`px-5 py-10 text-center text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>No users found</td></tr>
                    )}
                </tbody>
            </table>
        </div>
        </div>
    );
};

// ─── Script Table ───
export const ScriptTable = ({ scripts, isDark, actions, showScore, showCreator = true, showApprovalType = false, showPreviewWindow = false }) => (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#1a1616] border-[#2e2828]" : "bg-white border-gray-200/60 shadow-sm"}`}>
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className={isDark ? "bg-[#221d1d]" : "bg-gray-50"}>
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Title</th>
                        {showCreator && <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Creator</th>}
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Genre</th>
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Completion</th>
                        {showPreviewWindow && <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Free Preview</th>}
                        {showApprovalType && <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Approval Type</th>}
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Status</th>
                        {showScore && <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Score</th>}
                        <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Date</th>
                        {actions && <th className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Actions</th>}
                    </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-[#2e2828]" : "divide-gray-100"}`}>
                    {scripts.map((s) => (
                        <tr key={s._id} className={`transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50/50"}`}>
                            <td className="px-5 py-3.5">
                                <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{s.title}</p>
                                <p className={`text-[11px] mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                    SID: {s.sid || "Pending"}
                                </p>
                                {getScriptPreviewWindowLabel(s) && (
                                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-[#e79aa6]" : "text-[#a83a4d]"}`}>
                                        Viewable: {getScriptPreviewWindowLabel(s)}
                                    </p>
                                )}
                            </td>
                            {showCreator && (
                                <td className="px-5 py-3.5">
                                    <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{getScriptCreatorName(s)}</span>
                                </td>
                            )}
                            <td className={`px-5 py-3.5 text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{s.genre || s.primaryGenre || "—"}</td>
                            <td className="px-5 py-3.5">
                                <div className="flex flex-col gap-1">
                                    <span className={`inline-flex items-center w-fit px-2.5 py-0.5 rounded-full text-xs font-bold ${getScriptCompletionBadgeClasses(s, isDark)}`}>
                                        {getScriptCompletionStatusLabel(s)}
                                    </span>
                                    {getScriptCompletionProgressText(s) && (
                                        <span className={`text-[11px] ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                            {getScriptCompletionProgressText(s)}
                                        </span>
                                    )}
                                </div>
                            </td>
                            {showPreviewWindow && (
                                <td className="px-5 py-3.5">
                                    {getScriptPreviewWindowLabel(s) ? (
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${isDark ? "bg-[#a83a4d]/10 text-[#e79aa6]" : "bg-[#f7edee] text-[#a83a4d]"}`}>
                                            {getScriptPreviewWindowLabel(s)}
                                        </span>
                                    ) : (
                                        <span className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>Not set</span>
                                    )}
                                </td>
                            )}
                            {showApprovalType && (
                                <td className="px-5 py-3.5">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${s.approvalRequestType === "edit_submission"
                                        ? "bg-[#f7edee] text-[#a83a4d]"
                                        : "bg-slate-100 text-slate-700"
                                        }`}>
                                        {s.approvalRequestType === "edit_submission" ? "Edit Approval" : "New Submission"}
                                    </span>
                                </td>
                            )}
                            <td className="px-5 py-3.5">
                                {(() => {
                                    const isEditApproval = s.status === "pending_approval" && s.approvalRequestType === "edit_submission";
                                    const statusLabel = s.isDeleted
                                        ? "deleted"
                                        : isEditApproval
                                            ? "edit approval"
                                            : (s.status?.replace("_", " ") || "draft");
                                    return (
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${s.isDeleted ? "bg-red-100 text-red-700" :
                                    s.status === "published" ? "bg-emerald-100 text-emerald-700" :
                                        s.status === "pending_approval" ? "bg-amber-100 text-amber-700" :
                                            s.status === "rejected" ? "bg-red-100 text-red-700" :
                                                "bg-gray-100 text-gray-600"
                                    }`}>{statusLabel}</span>
                                    );
                                })()}
                            </td>
                            {showScore && (
                                <td className={`px-5 py-3.5 text-sm font-bold ${isDark ? "text-[#e79aa6]" : "text-[#a83a4d]"}`}>
                                    {s.scriptScore?.overall || s.platformScore?.overall || s.rating || "—"}
                                </td>
                            )}
                            <td className={`px-5 py-3.5 text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>{new Date(s.createdAt).toLocaleDateString()}</td>
                            {actions && <td className="px-5 py-3.5">{actions(s)}</td>}
                        </tr>
                    ))}
                    {scripts.length === 0 && (
                        <tr><td colSpan={(showCreator ? 1 : 0) + (showPreviewWindow ? 1 : 0) + (showApprovalType ? 1 : 0) + (showScore ? 1 : 0) + (actions ? 1 : 0) + 5} className={`px-5 py-10 text-center text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>No scripts found</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

// ─── Transaction Table ───
export const TransactionTable = ({ transactions, isDark }) => (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#1a1616] border-[#2e2828]" : "bg-white border-gray-200/60 shadow-sm"}`}>
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className={isDark ? "bg-[#221d1d]" : "bg-gray-50"}>
                        {["User", "Type", "Amount", "Status", "Description", "Transaction / Pay ID", "Date"].map((h) => (
                            <th key={h} className={`text-left px-5 py-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-[#2e2828]" : "divide-gray-100"}`}>
                    {transactions.map((t) => (
                        <tr key={t._id} className={`transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50/50"}`}>
                            <td className={`px-5 py-3.5 text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{t.user?.name || "—"}</td>
                            <td className="px-5 py-3.5"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${t.type === "credit" || t.type === "payment" ? "bg-emerald-100 text-emerald-700" : t.type === "debit" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>{t.type}</span></td>
                            <td className={`px-5 py-3.5 text-sm font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{formatCurrency(t.amount || 0, t.currency || "INR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-5 py-3.5"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${t.status === "completed" ? "bg-emerald-100 text-emerald-700" : t.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{t.status}</span></td>
                            <td className={`px-5 py-3.5 text-sm max-w-[200px] truncate ${isDark ? "text-gray-400" : "text-gray-600"}`}>{t.description}</td>
                            <td className="px-5 py-3.5">
                                <div className={`text-xs leading-5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                    <p className="break-all"><span className={`font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>Txn:</span> {getTransactionIdLabel(t) || "-"}</p>
                                    <p className="break-all"><span className={`font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>Pay:</span> {getPaymentIdLabel(t) || "-"}</p>
                                </div>
                            </td>
                            <td className={`px-5 py-3.5 text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>{new Date(t.createdAt).toLocaleDateString()}</td>
                        </tr>
                    ))}
                    {transactions.length === 0 && (
                        <tr><td colSpan={7} className={`px-5 py-10 text-center text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>No transactions found</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

// ─── Score Modal ───
export const ScoreModal = ({ script, isDark, onClose, onSave }) => {
    const getInitialScores = (currentScript) => ({
        content: Number(currentScript?.platformScore?.content) || 0,
        trailer: Number(currentScript?.platformScore?.trailer) || 0,
        title: Number(currentScript?.platformScore?.title) || 0,
        synopsis: Number(currentScript?.platformScore?.synopsis) || 0,
        tags: Number(currentScript?.platformScore?.tags) || 0,
        feedback: currentScript?.platformScore?.feedback || "",
        strengths: currentScript?.platformScore?.strengths || "",
        weaknesses: currentScript?.platformScore?.weaknesses || "",
        prospects: currentScript?.platformScore?.prospects || "",
    });

    const [scores, setScores] = useState(() => getInitialScores(script));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setScores(getInitialScores(script));
    }, [script?._id]);

    const handleSave = async () => {
        setSaving(true);
        const saved = await onSave(script._id, scores);
        setSaving(false);
        if (saved) onClose();
    };

    const dims = [
        { key: "content", label: "Main Content", color: "from-[#7a2233] to-cyan-500" },
        { key: "trailer", label: "Trailer", color: "from-purple-500 to-pink-500" },
        { key: "title", label: "Title", color: "from-amber-500 to-orange-500" },
        { key: "synopsis", label: "Synopsis", color: "from-emerald-500 to-teal-500" },
        { key: "tags", label: "Tags & Meta", color: "from-rose-500 to-red-500" },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className={`w-full max-w-lg mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto ${isDark ? "bg-[#1a1616] border border-[#2e2828]" : "bg-white shadow-2xl"}`} onClick={(e) => e.stopPropagation()}>
                <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>Score: {script?.title}</h3>
                <p className={`text-sm mb-5 ${isDark ? "text-gray-500" : "text-gray-500"}`}>Rate each dimension from 0 to 100</p>
                <div className="space-y-4">
                    {dims.map((d) => (
                        <div key={d.key}>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className={`text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{d.label}</label>
                                <span className={`text-sm font-bold ${isDark ? "text-[#e79aa6]" : "text-[#a83a4d]"}`}>{scores[d.key]}</span>
                            </div>
                            <input type="range" min="0" max="100" value={scores[d.key]}
                                onChange={(e) => setScores((p) => ({ ...p, [d.key]: Number(e.target.value) }))}
                                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#a83a4d]"
                                style={{ background: `linear-gradient(to right, var(--ad-accent) ${scores[d.key]}%, var(--ad-line) ${scores[d.key]}%)` }}
                            />
                        </div>
                    ))}
                    <div>
                        <label className={`text-sm font-semibold block mb-1.5 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Feedback</label>
                        <textarea rows={3} value={scores.feedback} onChange={(e) => setScores((p) => ({ ...p, feedback: e.target.value }))}
                            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`}
                            placeholder="Write your feedback..."
                        />
                    </div>
                    {[{ key: "strengths", label: "Strengths", placeholder: "What are the script's strongest elements?" }, { key: "weaknesses", label: "Weaknesses", placeholder: "What areas need improvement?" }, { key: "prospects", label: "Prospects", placeholder: "Commercial potential, market fit, next steps..." }].map(({ key, label, placeholder }) => (
                        <div key={key}>
                            <label className={`text-sm font-semibold block mb-1.5 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{label}</label>
                            <textarea rows={4} value={scores[key]} onChange={(e) => setScores((p) => ({ ...p, [key]: e.target.value }))}
                                className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`}
                                placeholder={placeholder}
                            />
                        </div>
                    ))}
                </div>
                <div className="flex items-center justify-end gap-3 mt-5">
                    <button onClick={onClose} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${isDark ? "text-gray-400 hover:bg-[#2e2828]" : "text-gray-500 hover:bg-gray-100"}`}>Cancel</button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-[#7a2233] to-purple-500 text-white hover:from-[#7a2233] hover:to-purple-600 transition-all disabled:opacity-50">
                        {saving ? "Saving..." : "Save Score"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Search Bar ───
export const SearchBar = ({ value, onChange, placeholder, isDark }) => (
    <div className={`flex items-center rounded-xl overflow-hidden border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)]`}>
        <div className="pl-3.5">
            <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className={`w-4 h-4 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
        </div>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "Search..."} className={`flex-1 px-3 py-2.5 text-sm font-medium outline-none bg-transparent ${isDark ? "text-gray-200 placeholder-gray-500" : "text-gray-800 placeholder-gray-400"}`} />
        {value && (
            <button
                type="button"
                onClick={() => onChange("")}
                className={`mr-2 h-7 w-7 rounded-md flex items-center justify-center transition-colors ${isDark ? "text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/70"}`}
                aria-label="Clear search"
                title="Clear search"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        )}
    </div>
);

// ─── Pagination ───
export const Pagination = ({ page, totalPages, onPageChange, isDark }) => {
    if (totalPages <= 1) return null;
    return (
        <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-30 ${isDark ? "text-gray-400 hover:bg-[#2e2828]" : "text-gray-500 hover:bg-gray-100"}`}>Prev</button>
            <span className={`text-sm font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{page} / {totalPages}</span>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-30 ${isDark ? "text-gray-400 hover:bg-[#2e2828]" : "text-gray-500 hover:bg-gray-100"}`}>Next</button>
        </div>
    );
};

// ═══════════════════════════════════════════════
// Main Admin Dashboard
// ═══════════════════════════════════════════════
export const BADGE_WATCH_KEYS = ["approvals", "trailers", "membership-reviews", "bank-reviews", "queries"];

export const formatBadgeCount = (count) => {
    if (!count || count <= 0) return "";
    if (count > 99) return "+99";
    return `+${count}`;
};

export const SEARCH_PLACEHOLDER_BY_TAB = {
    overview: "Search everything in admin...",
    investors: "Search film professionals...",
    writers: "Search writers...",
    projects: "Search scripts...",
    "deleted-scripts": "Search deleted scripts...",
    "ai-usage": "Search AI usage...",
    evaluations: "Search AI evaluations...",
    scores: "Search scores...",
    analytics: "Search analytics...",
    "discount-codes": "Search discount codes...",
    approvals: "Search script approvals...",
    trailers: "Search AI trailer approvals...",
    "ai-trailers": "Search AI trailers...",
    messages: "Search writer messages...",
    "pending-investors": "Search film professional requests...",
    "membership-reviews": "Search SWA/WGA reviews...",
    queries: "Search queries...",
    "deleted-film-professionals": "Search deleted film professionals...",
    "deleted-writers": "Search deleted writers...",
};

export const EMPTY_GLOBAL_RESULTS = {
    users: [],
    scripts: [],
    transactions: [],
    invoices: [],
    pendingInvestors: [],
    bankReviews: [],
    contacts: [],
};

export const formatExportDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

export const buildChatId = (id1, id2) => {
    const [a, b] = [String(id1), String(id2)].sort();
    return `${a}_${b}`;
};

export const resolveMediaUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${API_ORIGIN}${url}`;
};

export const formatFileSize = (bytes = 0) => {
    const size = Number(bytes || 0);
    if (!size) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const getTransactionMetadataValue = (transaction, key) => {
    const metadata = transaction?.metadata;
    if (!metadata) return "";
    if (typeof metadata.get === "function") {
        return metadata.get(key) || "";
    }
    return metadata[key] || "";
};

export const getTransactionIdLabel = (transaction) => {
    const reference = String(transaction?.reference || "").trim();
    if (reference) return reference;
    return String(transaction?._id || "").trim();
};

export const getPaymentIdLabel = (transaction) => {
    const keys = [
        "razorpay_payment_id",
        "paymentGatewayPaymentId",
        "gatewayPaymentId",
        "stripePaymentId",
        "stripeChargeId",
    ];

    for (const key of keys) {
        const value = String(getTransactionMetadataValue(transaction, key) || transaction?.[key] || "").trim();
        if (value) return value;
    }

    return "";
};

export const getMessagePreview = (msg) =>
    msg?.text ||
    (msg?.fileType === "video"
        ? "Trailer Video"
        : msg?.fileType === "image"
            ? "Image"
            : msg?.fileUrl
                ? "File"
                : "Sent a message");

export const writePdfSections = ({ fileName, title, sections }) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const marginX = 40;
    const maxWidth = 515;
    let y = 44;

    const addWrappedText = (text, opts = {}) => {
        const lines = doc.splitTextToSize(String(text), opts.maxWidth || maxWidth);
        if (y + lines.length * 13 > 790) {
            doc.addPage();
            y = 44;
        }
        doc.text(lines, marginX, y);
        y += lines.length * 13 + (opts.gap || 0);
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    addWrappedText(title, { gap: 6 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    addWrappedText(`Generated: ${new Date().toLocaleString()}`, { gap: 10 });

    sections.forEach((section) => {
        if (!section?.title) return;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        addWrappedText(section.title, { gap: 4 });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const lines = Array.isArray(section.lines) && section.lines.length > 0 ? section.lines : ["No records"];
        lines.forEach((line) => addWrappedText(line));
        y += 8;
    });

    doc.save(fileName);
};

export const DiscountCodeFormModal = ({ initial, onClose, onSave, isDark }) => {
    const isEdit = Boolean(initial && initial._id);
    const [formData, setFormData] = useState({
        code: initial?.code || "",
        discountType: initial?.discountType || "percentage",
        discountValue: initial?.discountValue || "",
        maxUses: initial?.maxUses || 0,
        maxUsesPerUser: initial?.maxUsesPerUser || 1,
        minPurchaseAmount: initial?.minPurchaseAmount || 0,
        maxDiscountAmount: initial?.maxDiscountAmount || 0,
        validUntil: initial?.validUntil ? new Date(initial.validUntil).toISOString().split('T')[0] : "",
        description: initial?.description || "",
        isActive: initial?.isActive !== undefined ? initial.isActive : true,
        ...(isEdit ? { _id: initial._id } : {}),
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
            <div className={`w-full max-w-xl mx-auto rounded-2xl p-6 ${isDark ? "bg-[#1a1616] border border-[#2e2828]" : "bg-white shadow-2xl"}`} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{isEdit ? "Edit Discount Code" : "Create Discount Code"}</h3>
                    <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${isDark ? "text-gray-400 hover:bg-[#2e2828] hover:text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Code (e.g. WELCOME50)</label>
                            <input required type="text" name="code" value={formData.code} onChange={handleChange} className={`w-full uppercase rounded-xl px-4 py-2.5 text-sm outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`} placeholder="DISCOUNT20" />
                        </div>
                        
                        <div>
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Type</label>
                            <select name="discountType" value={formData.discountType} onChange={handleChange} className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)]`}>
                                <option value="percentage">Percentage (%)</option>
                                <option value="flat">Flat Amount (₹)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Value</label>
                            <input required type="number" min="1" step="any" name="discountValue" value={formData.discountValue} onChange={handleChange} className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`} placeholder={formData.discountType === "percentage" ? "1-100" : "Amount in ₹"} />
                        </div>

                        <div>
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Max Uses Globally (0 = unlimited)</label>
                            <input type="number" min="0" name="maxUses" value={formData.maxUses} onChange={handleChange} className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`} />
                        </div>

                        <div>
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Max Uses Per User (0 = unlimited)</label>
                            <input type="number" min="0" name="maxUsesPerUser" value={formData.maxUsesPerUser} onChange={handleChange} className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`} />
                        </div>

                        <div>
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Min Purchase (₹) (0 = none)</label>
                            <input type="number" min="0" name="minPurchaseAmount" value={formData.minPurchaseAmount} onChange={handleChange} className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`} />
                        </div>

                        <div>
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Max Discount (₹) (0 = none)</label>
                            <input type="number" min="0" name="maxDiscountAmount" value={formData.maxDiscountAmount} onChange={handleChange} disabled={formData.discountType === 'flat'} className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border disabled:opacity-50 bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`} />
                        </div>

                        <div className="col-span-2">
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Valid Until</label>
                            <input required type="date" name="validUntil" value={formData.validUntil} onChange={handleChange} className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`} />
                        </div>

                        <div className="col-span-2">
                            <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Description (Optional)</label>
                            <input type="text" name="description" value={formData.description} onChange={handleChange} className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-accent)]`} placeholder="e.g. Winter Sale 2024" />
                        </div>

                        {isEdit && (
                            <div className="col-span-2 flex items-center mt-2">
                                <input type="checkbox" id="isActive" name="isActive" checked={formData.isActive} onChange={handleChange} className="w-4 h-4 text-[#a83a4d] bg-gray-100 border-gray-300 rounded focus:ring-[#a83a4d] dark:focus:ring-[#a83a4d] dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600" />
                                <label htmlFor="isActive" className={`ml-2 text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-900"}`}>Active</label>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-[#2e2828]">
                        <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${isDark ? "text-gray-400 hover:bg-[#2e2828]" : "text-gray-500 hover:bg-gray-100"}`}>Cancel</button>
                        <button type="submit" className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#7a2233] to-[#a83a4d] text-white hover:from-[#7a2233] hover:to-[#a83a4d] transition-all shadow-lg shadow-[#a83a4d]/20">{isEdit ? "Update Code" : "Create Code"}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Reject Investor Modal.
//
// MUST stay at module scope. Declared inside AdminDashboard's body it was a new component type on
// every parent render, and the 30s fetchAlertSummary poll guarantees those — so an admin part-way
// through typing a rejection reason had the modal remounted under them, wiping `note` and the caret.
export const RejectInvestorModal = ({ investor, onClose, onConfirm, isDark }) => {
    const [note, setNote] = useState("");
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className={`w-full max-w-md mx-4 rounded-2xl p-6 ${isDark ? "bg-[#1a1616] border border-[#2e2828]" : "bg-white shadow-2xl"}`} onClick={(e) => e.stopPropagation()}>
                <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>Reject Investor</h3>
                <p className={`text-sm mb-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    Rejecting <strong>{investor.name}</strong> ({investor.email}). They will not be able to log in.<br />
                    Optionally add a reason (visible to the user on login attempt).
                </p>
                <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Rejection reason (optional)..."
                    className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] focus:border-[var(--ad-danger)]`}
                />
                <div className="flex items-center justify-end gap-3 mt-4">
                    <button onClick={onClose} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${isDark ? "text-gray-400 hover:bg-[#2e2828]" : "text-gray-500 hover:bg-gray-100"}`}>Cancel</button>
                    <button onClick={() => onConfirm(investor._id, note.trim())}
                        className="px-5 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-red-500 to-rose-500 text-white hover:from-red-600 hover:to-rose-600 transition-all">
                        Confirm Reject
                    </button>
                </div>
            </div>
        </div>
    );
};

