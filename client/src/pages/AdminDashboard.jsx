import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import BrandLogo from "../components/BrandLogo";
import PasswordInput from "../components/PasswordInput";
import ConfirmDialog from "../components/ConfirmDialog";
import { formatCurrency } from "../utils/currency";
import { getScriptCompletionSummary } from "../utils/scriptCompletion";
import {
    clearAdminScriptAccess,
    getStoredAdminScriptAccess,
    isAdminScriptProtectedTab,
    storeAdminScriptAccess,
} from "../utils/adminScriptAccess";
import { Icon, StatCard } from "../components/AdminUI";
import AdminAnalyticsPanel from "../components/AdminAnalyticsPanel";
import AdminCompetitions from "./admin/AdminCompetitions";
import AdminReferrals from "./admin/AdminReferrals";
import ExternalRegistrationsSection from "./admin/sections/ExternalRegistrationsSection";
import JudgesSection from "./admin/sections/JudgesSection";
import DirectEmailSection from "./admin/sections/DirectEmailSection";
import {
    API_BASE_URL,
    MAX_ATTACHMENT_SIZE_BYTES,
    adminApi,
    TABS,
    DownloadIconButton,
    getUserAddressLine,
    getUserCompany,
    getUserGenres,
    formatIndustrySubRole,
    sanitizePreviousCreditsDisplay,
    formatUserExportLine,
    buildOverviewExportLines,
    PROJECT_CREATOR_ROLES,
    getScriptCreatorName,
    getScriptPreviewWindowLabel,
    parseTrailerRequestNote,
    BroadcastComposer,
    UserTable,
    ScriptTable,
    TransactionTable,
    ScoreModal,
    SearchBar,
    Pagination,
    BADGE_WATCH_KEYS,
    formatBadgeCount,
    SEARCH_PLACEHOLDER_BY_TAB,
    EMPTY_GLOBAL_RESULTS,
    formatExportDate,
    buildChatId,
    getTransactionIdLabel,
    getPaymentIdLabel,
    getMessagePreview,
    writePdfSections,
    DiscountCodeFormModal,
    RejectInvestorModal,
} from "./admin/dashboardShared";
import { AdminDashboardContext } from "./admin/dashboardContext";
import AdminShell from "./admin/shell/AdminShell";
import { ADMIN_NAV_GROUPS, groupNavItems } from "./admin/shell/adminNavGroups";
import OverviewSection from "./admin/sections/OverviewSection";
import TrailerApprovalsSection from "./admin/sections/TrailerApprovalsSection";
import MessagesSection from "./admin/sections/MessagesSection";
import MembershipReviewsSection from "./admin/sections/MembershipReviewsSection";
import SwaApprovedSection from "./admin/sections/SwaApprovedSection";
import DeletedUsersSection from "./admin/sections/DeletedUsersSection";
import UsersSection from "./admin/sections/UsersSection";
import ProjectsSection from "./admin/sections/ProjectsSection";
import DeletedScriptsSection from "./admin/sections/DeletedScriptsSection";
import AiUsageSection from "./admin/sections/AiUsageSection";
import EvaluationsSection from "./admin/sections/EvaluationsSection";
import ScoresSection from "./admin/sections/ScoresSection";
import ApprovalsSection from "./admin/sections/ApprovalsSection";
import AiTrailersSection from "./admin/sections/AiTrailersSection";
import MeetingsSection from "./admin/sections/MeetingsSection";
import QueriesSection from "./admin/sections/QueriesSection";
import AnalyticsSection from "./admin/sections/AnalyticsSection";
import DiscountCodesSection from "./admin/sections/DiscountCodesSection";
import ConsultationsSection from "./admin/sections/ConsultationsSection";

// Re-exported for AdminCompetitions, AdminReferrals and the competitions editor, which import
// the shared admin API client from this module — and for the tests that mock this module path.
export { adminApi };

/**
 * The sidebar's pointer at /finance. A route rather than a tab: every payment surface moved out of
 * this console, so TABS — which means "sections this page renders" — must not claim it.
 */
const FINANCE_LINK = {
    key: "finance-route",
    label: "Payments",
    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
};

const AdminDashboard = () => {
    const isDark = true;
    const [activeTab, setActiveTab] = useState("overview");
    const [loading, setLoading] = useState(false);

    // ─── Code Gate — always prompt on every visit ───
    const [authorized, setAuthorized] = useState(false);
    const [codeInput, setCodeInput] = useState("");
    const [codeError, setCodeError] = useState("");
    const [codeLoading, setCodeLoading] = useState(false);

    // ─── Data state ───
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [scripts, setScripts] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [scoreModal, setScoreModal] = useState(null);
    const [scoreSubTab, setScoreSubTab] = useState("ai");
    const [total, setTotal] = useState(0);
    const [pendingInvestors, setPendingInvestors] = useState([]);
    const [membershipReviews, setMembershipReviews] = useState([]);
    const [rejectModal, setRejectModal] = useState(null); // investor object
    const [selectedUserDetail, setSelectedUserDetail] = useState(null);
    const [userActionLoading, setUserActionLoading] = useState("");
    const [contacts, setContacts] = useState([]);
    const [deletedAccounts, setDeletedAccounts] = useState([]);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsSection, setAnalyticsSection] = useState("overview");
    const [analyticsAnonymousDetail, setAnalyticsAnonymousDetail] = useState(null);
    const [analyticsAnonymousDetailLoading, setAnalyticsAnonymousDetailLoading] = useState(false);
    const [analyticsUserDetail, setAnalyticsUserDetail] = useState(null);
    const [analyticsUserDetailLoading, setAnalyticsUserDetailLoading] = useState(false);
    const [analyticsRegisteredSearch, setAnalyticsRegisteredSearch] = useState("");
    const [analyticsRegisteredStatusFilter, setAnalyticsRegisteredStatusFilter] = useState("all");
    const [discountCodes, setDiscountCodes] = useState([]);
    const [discountCodeModal, setDiscountCodeModal] = useState(null); // null = closed, {} = create, {_id:...} = edit
    const [alertSummary, setAlertSummary] = useState({});
    const previousAlertSummaryRef = useRef(null);
    const [exportingCurrent, setExportingCurrent] = useState(false);
    const [exportingAll, setExportingAll] = useState(false);
    const [globalResults, setGlobalResults] = useState(EMPTY_GLOBAL_RESULTS);
    const [adminConversations, setAdminConversations] = useState([]);
    const [messageUsers, setMessageUsers] = useState([]);
    const [activeMessageUser, setActiveMessageUser] = useState(null);
    const [activeMessageChatId, setActiveMessageChatId] = useState("");
    const [messageList, setMessageList] = useState([]);
    const [messageText, setMessageText] = useState("");
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [messageAttachment, setMessageAttachment] = useState(null);
    const [uploadingMessageAttachment, setUploadingMessageAttachment] = useState(false);
    const [showAdminScrollToBottomButton, setShowAdminScrollToBottomButton] = useState(false);
    const messageFileInputRef = useRef(null);
    const messageListContainerRef = useRef(null);
    const messageListEndRef = useRef(null);
    const shouldAutoScrollAdminMessagesRef = useRef(false);
    const previousAdminChatIdRef = useRef("");
    const scrollAdminMessagesToBottom = (behavior = "smooth") => {
        messageListEndRef.current?.scrollIntoView({ behavior, block: "end" });
        setShowAdminScrollToBottomButton(false);
    };
    const handleAdminMessageScroll = () => {
        const container = messageListContainerRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setShowAdminScrollToBottomButton(distanceFromBottom > 96);
    };
    const trailerFileInputRef = useRef(null);
    const [trailerUploadTargetScript, setTrailerUploadTargetScript] = useState(null);
    const [uploadingTrailerScriptId, setUploadingTrailerScriptId] = useState("");
    const [deletingScriptId, setDeletingScriptId] = useState("");
    const [writerBroadcastTitle, setWriterBroadcastTitle] = useState("");
    const [writerBroadcastContent, setWriterBroadcastContent] = useState("");
    const [writerBroadcastLink, setWriterBroadcastLink] = useState("");
    const [filmBroadcastTitle, setFilmBroadcastTitle] = useState("");
    const [filmBroadcastContent, setFilmBroadcastContent] = useState("");
    const [filmBroadcastLink, setFilmBroadcastLink] = useState("");
    const [scriptBroadcastTitle, setScriptBroadcastTitle] = useState("");
    const [scriptBroadcastContent, setScriptBroadcastContent] = useState("");
    const [scriptBroadcastLink, setScriptBroadcastLink] = useState("");
    const [scriptBroadcastAttachments, setScriptBroadcastAttachments] = useState([]);
    const [directUserEmail, setDirectUserEmail] = useState("");
    const [directBroadcastTitle, setDirectBroadcastTitle] = useState("");
    const [directBroadcastContent, setDirectBroadcastContent] = useState("");
    const [directBroadcastLink, setDirectBroadcastLink] = useState("");
    const [directBroadcastAttachments, setDirectBroadcastAttachments] = useState([]);
    const [trailerRequirementsModal, setTrailerRequirementsModal] = useState(null);

    // ─── Toast notification system ───
    const [toast, setToast] = useState(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [adminDialog, setAdminDialog] = useState(null);
    const adminDialogResolverRef = useRef(null);
    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleSendAudienceBroadcast = async (audience) => {
        const broadcastConfigByAudience = {
            writers: {
                title: writerBroadcastTitle,
                content: writerBroadcastContent,
                actionUrl: writerBroadcastLink,
                audienceLabel: "writers",
                reset: () => {
                    setWriterBroadcastTitle("");
                    setWriterBroadcastContent("");
                    setWriterBroadcastLink("");
                },
            },
            "film-professionals": {
                title: filmBroadcastTitle,
                content: filmBroadcastContent,
                actionUrl: filmBroadcastLink,
                audienceLabel: "film professionals",
                reset: () => {
                    setFilmBroadcastTitle("");
                    setFilmBroadcastContent("");
                    setFilmBroadcastLink("");
                },
            },
            "script-uploaders": {
                title: scriptBroadcastTitle,
                content: scriptBroadcastContent,
                actionUrl: scriptBroadcastLink,
                attachments: scriptBroadcastAttachments,
                audienceLabel: "script uploaders",
                reset: () => {
                    setScriptBroadcastTitle("");
                    setScriptBroadcastContent("");
                    setScriptBroadcastLink("");
                    setScriptBroadcastAttachments([]);
                },
            },
            "direct-user": {
                title: directBroadcastTitle,
                content: directBroadcastContent,
                actionUrl: directBroadcastLink,
                attachments: directBroadcastAttachments,
                audienceLabel: "specific user",
                reset: () => {
                    setDirectUserEmail("");
                    setDirectBroadcastTitle("");
                    setDirectBroadcastContent("");
                    setDirectBroadcastLink("");
                    setDirectBroadcastAttachments([]);
                },
            },
        };
        const broadcastConfig = broadcastConfigByAudience[audience];

        if (!broadcastConfig) {
            showToast("Unsupported broadcast audience.", "error");
            return;
        }

        const { title, content, actionUrl, attachments, audienceLabel, reset } = broadcastConfig;

        if (!title.trim() || !content.trim()) {
            showToast(`Please enter both title and content for the ${audienceLabel} broadcast.`, "error");
            return;
        }

        const loadingKey = `broadcast:${audience}`;
        try {
            setUserActionLoading(loadingKey);
            const formData = new FormData();
            formData.append("title", title.trim());
            formData.append("content", content.trim());
            formData.append("actionUrl", actionUrl.trim());
            if (audience === "direct-user") {
                formData.append("targetEmail", directUserEmail.trim());
            }
            attachments?.forEach(file => formData.append("attachments", file));
            
            const { data } = await adminApi.post(`/admin/broadcast/${audience}`, formData);
            showToast(data?.message || `Broadcast sent to ${audienceLabel}.`);
            // Intentionally not resetting the form fields here so the user can see what they sent
            // or easily send a similar email to another audience without starting over.
        } catch (err) {
            showToast(err?.response?.data?.message || `Failed to send ${audienceLabel} broadcast`, "error");
        } finally {
            setUserActionLoading("");
        }
    };

    const openAdminDialog = ({
        type = "confirm",
        title = "Confirm action",
        message = "Are you sure?",
        confirmText = "Confirm",
        cancelText = "Cancel",
        defaultValue = "",
        placeholder = "",
        inputType = "text",
        multiline = false,
        options = [],
    }) => new Promise((resolve) => {
        adminDialogResolverRef.current = resolve;
        setAdminDialog({
            type,
            title,
            message,
            confirmText,
            cancelText,
            value: String(defaultValue ?? ""),
            placeholder,
            inputType,
            multiline,
            options,
        });
    });

    const closeAdminDialog = (result) => {
        const resolver = adminDialogResolverRef.current;
        adminDialogResolverRef.current = null;
        setAdminDialog(null);
        if (typeof resolver === "function") resolver(result);
    };

    const ensureScriptSectionAccess = async () => {
        const existingAccess = getStoredAdminScriptAccess();
        if (existingAccess?.token) {
            return true;
        }

        const password = await openAdminDialog({
            type: "prompt",
            title: "Unlock Script Sections",
            message: "Enter the script-section password to open Scripts, Script Approvals, and Deleted Scripts.",
            confirmText: "Unlock",
            cancelText: "Cancel",
            placeholder: "Section password",
            inputType: "password",
        });

        if (password === null) {
            return false;
        }

        if (!String(password || "").length) {
            showToast("Script section password is required.", "error");
            return false;
        }

        try {
            const { data } = await adminApi.post("/admin/script-access/verify", { password });
            storeAdminScriptAccess(data);
            showToast("Script sections unlocked");
            return true;
        } catch (err) {
            clearAdminScriptAccess();
            showToast(err?.response?.data?.message || "Failed to unlock script sections", "error");
            return false;
        }
    };

    const handleTabChange = async (nextTab) => {
        // Payments are a destination, not a section: /finance shows the same figures to an accountant
        // with the finance role, and the control actions only to an admin.
        if (nextTab === FINANCE_LINK.key) {
            navigate("/finance");
            return;
        }
        if (nextTab === activeTab) return;

        if (isAdminScriptProtectedTab(nextTab)) {
            const hasAccess = await ensureScriptSectionAccess();
            if (!hasAccess) return;
        }

        setActiveTab(nextTab);
    };

    useEffect(() => {
        if (!adminDialog) return undefined;

        const handleKeydown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeAdminDialog(null);
                return;
            }

            if (event.key === "Enter" && !event.shiftKey) {
                if (adminDialog.type === "prompt" && document.activeElement?.tagName === "TEXTAREA") {
                    return;
                }
                event.preventDefault();
                closeAdminDialog(adminDialog.type === "prompt" ? adminDialog.value : true);
            }
        };

        window.addEventListener("keydown", handleKeydown);
        return () => window.removeEventListener("keydown", handleKeydown);
    }, [adminDialog]);

    const fetchAlertSummary = async ({ silent = false } = {}) => {
        if (!authorized) return;
        try {
            const { data } = await adminApi.get("/admin/alerts/summary");
            const summary = data || {};
            setAlertSummary(summary);

            const previous = previousAlertSummaryRef.current;
            if (!silent && previous) {
                const increasedSections = BADGE_WATCH_KEYS.filter((key) => (summary[key] || 0) > (previous[key] || 0));
                if (increasedSections.length > 0) {
                    const sectionLabelMap = {
                        approvals: "Script approvals",
                        trailers: "AI trailer approvals",
                        "pending-investors": "Film professional requests",
                        "membership-reviews": "SWA/WGA reviews",
                        "bank-reviews": "Bank detail reviews",
                        queries: "Queries",
                    };
                    const text = increasedSections.map((key) => sectionLabelMap[key] || key).join(" • ");
                    showToast(`New admin requests: ${text}`, "info");
                }
            }
            previousAlertSummaryRef.current = summary;
        } catch (err) {
            console.error("Admin alert summary fetch error:", err);
        }
    };

    const navigate = useNavigate();

    const getBadgeCountForTab = (tabKey) => {
        if (!BADGE_WATCH_KEYS.includes(tabKey)) return 0;
        const count = Number(alertSummary?.[tabKey] || 0);
        return Number.isFinite(count) ? count : 0;
    };

    const searchTerm = search.trim().toLowerCase();
    const hasSearch = searchTerm.length > 0;
    const isGlobalSearchMode = activeTab === "overview" && hasSearch;
    const matchesSearch = (...values) => !hasSearch || values.some((value) => String(value ?? "").toLowerCase().includes(searchTerm));

    const sourceUsers = isGlobalSearchMode ? globalResults.users : users;
    const sourceScripts = isGlobalSearchMode ? globalResults.scripts : scripts;
    const sourceTransactions = globalResults.transactions;
    const sourceInvoices = globalResults.invoices;
    const sourcePendingInvestors = isGlobalSearchMode ? globalResults.pendingInvestors : pendingInvestors;
    const sourceMembershipReviews = membershipReviews;
    const sourceContacts = isGlobalSearchMode ? globalResults.contacts : contacts;
    const sourceDeletedAccounts = deletedAccounts;
    const sourceMessageUsers = messageUsers;

    const filteredUsers = sourceUsers.filter((u) =>
        matchesSearch(
            u.name,
            u.email,
            u.role,
            u.sid,
            u.phone,
            getUserAddressLine(u),
            getUserCompany(u),
            getUserGenres(u),
            u.writerProfile?.username,
            u.writerProfile?.legalName,
            u.industryProfile?.jobTitle
        )
    );
    const filteredScripts = sourceScripts.filter((s) => matchesSearch(s.title, s.sid, s.genre, s.primaryGenre, s.status, getScriptCreatorName(s)));
    const filteredTransactions = sourceTransactions.filter((t) =>
        matchesSearch(
            t.user?.name,
            t.type,
            t.status,
            t.description,
            t.amount,
            t.currency,
            t.createdAt,
            t.reference,
            getTransactionIdLabel(t),
            getPaymentIdLabel(t)
        )
    );
    const filteredInvoices = sourceInvoices.filter((inv) => matchesSearch(inv.invoiceNumber, inv.creator?.name, inv.creatorSid, inv.creator?.sid, inv.script?.title, inv.scriptSid, inv.script?.sid, inv.accessType));
    const filteredPendingInvestors = sourcePendingInvestors.filter((inv) => matchesSearch(inv.name, inv.email, inv.createdAt));
    const filteredMembershipReviews = sourceMembershipReviews.filter((review) =>
        matchesSearch(
            review.name,
            review.email,
            review.sid,
            review.username,
            review.role,
            Array.isArray(review.pendingMemberships)
                ? review.pendingMemberships
                    .map((item) => `${item.label || ""} ${item.status || ""} ${item.proofFileName || ""}`)
                    .join(" ")
                : ""
        )
    );
    const filteredContacts = sourceContacts.filter((c) => matchesSearch(c.name, c.email, c.reason, c.message, c.createdAt));
    const deletedFilmProfessionals = sourceDeletedAccounts.filter((item) => String(item?.role || "").toLowerCase() === "investor");
    const deletedWriters = sourceDeletedAccounts.filter((item) => PROJECT_CREATOR_ROLES.has(String(item?.role || "").toLowerCase()));
    const filteredDeletedFilmProfessionals = deletedFilmProfessionals.filter((item) => matchesSearch(item.name, item.email, item.sid, item.reason, item.source, item.deactivatedAt, item.requestedAt));
    const filteredDeletedWriters = deletedWriters.filter((item) => matchesSearch(item.name, item.email, item.sid, item.reason, item.source, item.deactivatedAt, item.requestedAt));
    const filteredMessageUsers = sourceMessageUsers.filter((u) => matchesSearch(u.name, u.email, u.sid));

    const buildCurrentSectionPayload = () => {
        switch (activeTab) {
            case "overview":
                return {
                    title: "Platform Overview",
                    lines: stats ? buildOverviewExportLines(stats) : ["No records"],
                };
            case "investors":
            case "writers":
            case "readers":
            case "swa-approved":
                const sectionTitleByTab = {
                    investors: "Film Professionals",
                    writers: "Writers",
                    readers: "Readers",
                    "swa-approved": "SWA Approved Members",
                };
                return {
                    title: `${sectionTitleByTab[activeTab] || activeTab} (${users.length})`,
                    lines: users.map((u, idx) => formatUserExportLine(u, idx)),
                };
            case "projects":
            case "deleted-scripts":
            case "ai-usage":
            case "evaluations":
            case "scores":
            case "approvals":
            case "trailers":
                return {
                    title: `${TABS.find((tab) => tab.key === activeTab)?.label || "Scripts"} (${scripts.length})`,
                    lines: scripts.map((s, idx) => `${idx + 1}. ${s.title || "-"} | SID: ${s.sid || "-"} | Creator: ${getScriptCreatorName(s)} | Genre: ${s.genre || s.primaryGenre || "-"} | Completion: ${getScriptCompletionSummary(s)} | Status: ${s.status || "-"} | Score: ${s.scriptScore?.overall || s.platformScore?.overall || s.rating || "-"} | Date: ${formatExportDate(s.createdAt)}`),
                };
            case "pending-investors":
                return {
                    title: `Film Professional Requests (${pendingInvestors.length})`,
                    lines: pendingInvestors.map((inv, idx) => `${idx + 1}. ${inv.name || "-"} | ${inv.email || "-"} | Date: ${formatExportDate(inv.createdAt)} | Status: pending`),
                };
            case "membership-reviews":
                return {
                    title: `SWA/WGA Reviews (${membershipReviews.length})`,
                    lines: membershipReviews.map((review, idx) => `${idx + 1}. ${review.name || "-"} | ${review.email || "-"} | SID: ${review.sid || "-"} | Pending: ${(review.pendingMemberships || []).map((item) => `${item.label}:${item.status}`).join(", ") || "-"}`),
                };
            case "queries":
                return {
                    title: `Queries (${contacts.length})`,
                    lines: contacts.map((c, idx) => `${idx + 1}. ${c.name || "-"} | ${c.email || "-"} | Reason: ${c.reason || "-"} | Message: ${c.message || "-"} | Date: ${formatExportDate(c.createdAt)}`),
                };
            case "deleted-film-professionals":
                return {
                    title: `Deleted Film Professionals (${deletedFilmProfessionals.length})`,
                    lines: deletedFilmProfessionals.map((item, idx) => `${idx + 1}. ${item.name || "-"} | ${item.email || "-"} | SID: ${item.sid || "-"} | Role: ${item.role || "-"} | Source: ${item.source || "-"} | Reason: ${item.reason || "-"} | Requested: ${formatExportDate(item.requestedAt)} | Deactivated: ${formatExportDate(item.deactivatedAt)}`),
                };
            case "deleted-writers":
                return {
                    title: `Deleted Writers (${deletedWriters.length})`,
                    lines: deletedWriters.map((item, idx) => `${idx + 1}. ${item.name || "-"} | ${item.email || "-"} | SID: ${item.sid || "-"} | Role: ${item.role || "-"} | Source: ${item.source || "-"} | Reason: ${item.reason || "-"} | Requested: ${formatExportDate(item.requestedAt)} | Deactivated: ${formatExportDate(item.deactivatedAt)}`),
                };
            case "analytics":
                return {
                    title: "Analytics Summary",
                    lines: analyticsData
                        ? [
                            `Anonymous Visitors: ${analyticsData?.anonymousVisitors?.totalVisitors || 0}`,
                            `New Visitors: ${analyticsData?.anonymousVisitors?.newVisitors || 0}`,
                            `Returning Visitors: ${analyticsData?.anonymousVisitors?.returningVisitors || 0}`,
                            `Tracked Registered Users: ${analyticsData?.registeredUsers?.totalUsers || 0}`,
                            `Live Anonymous Users: ${analyticsData?.liveActivity?.activeAnonymousUsers || 0}`,
                            `Live Registered Users: ${analyticsData?.liveActivity?.activeRegisteredUsers || 0}`,
                        ]
                        : ["No records"],
                };
            case "meetings":
                return {
                    title: `Meetings (${meetings.length})`,
                    lines: meetings.map((m, idx) => `${idx + 1}. ${m.title || "-"} | Producer: ${m.producer_name || "-"} | Writer: ${m.writer_name || "-"} | Script: ${m.script_name || "-"} | Status: ${m.status || "-"} | Date: ${formatExportDate(m.scheduledDate)} | Duration: ${m.duration} min | Link: ${m.meetingLink || "-"}`),
                };
            case "messages":
                return {
                    title: `Admin Messages (${messageUsers.length})`,
                    lines: messageUsers.map((u, idx) => `${idx + 1}. ${u.name || "-"} | ${u.email || "-"} | SID: ${u.sid || "-"}`),
                };
            default:
                return { title: "Section", lines: ["No records"] };
        }
    };

    const handleDownloadCurrentSectionPdf = async () => {
        try {
            setExportingCurrent(true);
            const section = buildCurrentSectionPayload();
            writePdfSections({
                fileName: `admin-${activeTab}-report-${Date.now()}.pdf`,
                title: `Admin ${section.title} Report`,
                sections: [section],
            });
            showToast("Section PDF downloaded");
        } catch (err) {
            console.error(err);
            showToast("Failed to download section PDF", "error");
        } finally {
            setExportingCurrent(false);
        }
    };

    const fetchList = async (url, key) => {
        const { data } = await adminApi.get(url);
        return key ? (data?.[key] || []) : data;
    };

    const fetchMessagesDirectory = async ({ silent = false } = {}) => {
        if (!authorized) return;
        if (!silent) setMessagesLoading(true);

        try {
            const [conversationsRes, writersRes, creatorsRes] = await Promise.all([
                adminApi.get("/messages/conversations"),
                adminApi.get("/admin/users?role=writer&page=1&limit=1000"),
                adminApi.get("/admin/users?role=creator&page=1&limit=1000"),
            ]);

            const writerConversations = (conversationsRes.data || []).filter((conv) => ["writer", "creator"].includes(conv?.user?.role));
            const writerMap = new Map();

            [...(writersRes.data?.users || []), ...(creatorsRes.data?.users || [])].forEach((user) => {
                if (user?._id) writerMap.set(String(user._id), user);
            });

            writerConversations.forEach((conv) => {
                if (conv?.user?._id && !writerMap.has(String(conv.user._id))) {
                    writerMap.set(String(conv.user._id), conv.user);
                }
            });

            const conversationByUserId = new Map(
                writerConversations
                    .filter((conv) => conv?.user?._id)
                    .map((conv) => [String(conv.user._id), conv])
            );

            const writersWithConversation = Array.from(writerMap.values())
                .map((user) => ({
                    ...user,
                    conversation: conversationByUserId.get(String(user._id)) || null,
                }))
                .sort((a, b) => {
                    const aTs = a.conversation?.timestamp ? new Date(a.conversation.timestamp).getTime() : 0;
                    const bTs = b.conversation?.timestamp ? new Date(b.conversation.timestamp).getTime() : 0;
                    if (aTs !== bTs) return bTs - aTs;
                    return String(a.name || "").localeCompare(String(b.name || ""));
                });

            setAdminConversations(writerConversations);
            setMessageUsers(writersWithConversation);
            setTotalPages(1);
            setTotal(writersWithConversation.length);

            if (activeMessageUser?._id) {
                const selectedUserId = String(activeMessageUser._id);
                const refreshedSelectedUser = writersWithConversation.find((user) => String(user._id) === selectedUserId);
                if (refreshedSelectedUser) {
                    setActiveMessageUser(refreshedSelectedUser);
                }

                const refreshedConversation = writerConversations.find((conv) => String(conv?.user?._id) === selectedUserId);
                const nextChatId = refreshedConversation?.chatId || "";
                if (nextChatId !== activeMessageChatId) {
                    setActiveMessageChatId(nextChatId);
                }
            }
        } catch (err) {
            console.error("Admin message directory fetch error:", err);
            if (!silent) {
                showToast("Failed to load messages", "error");
            }
        } finally {
            if (!silent) setMessagesLoading(false);
        }
    };

    const handleDownloadWholeDashboardPdf = async () => {
        try {
            const hasScriptAccess = await ensureScriptSectionAccess();
            if (!hasScriptAccess) return;

            setExportingAll(true);

            const [
                overview,
                investorsData,
                writersData,
                creatorsData,
                readersData,
                projectsData,
                deletedScriptsData,
                aiUsageData,
                evaluationsData,
                purchasesData,
                invoicesData,
                paymentsData,
                aiScoresData,
                platformScoresData,
                readerScoresData,
                approvalsData,
                trailersData,
                pendingInvestorsData,
                membershipReviewsData,
                bankReviewsData,
                queriesData,
                deletedAccountsData,
            ] = await Promise.all([
                fetchList("/admin/stats"),
                fetchList("/admin/users?role=investor&page=1&limit=1000", "users"),
                fetchList("/admin/users?role=writer&page=1&limit=1000", "users"),
                fetchList("/admin/users?role=creator&page=1&limit=1000", "users"),
                fetchList("/admin/users?role=reader&page=1&limit=1000", "users"),
                fetchList("/admin/scripts?page=1&limit=1000", "scripts"),
                fetchList("/admin/scripts?status=deleted&page=1&limit=1000", "scripts"),
                fetchList("/admin/scripts/ai-usage?page=1&limit=1000", "scripts"),
                fetchList("/admin/scripts/evaluation-purchases?page=1&limit=1000", "scripts"),
                fetchList("/admin/scripts/investor-purchases?page=1&limit=1000", "scripts"),
                fetchList("/admin/invoices?page=1&limit=1000", "invoices"),
                fetchList("/admin/payments?page=1&limit=1000", "transactions"),
                fetchList("/admin/scores/ai?page=1&limit=1000", "scripts"),
                fetchList("/admin/scores/platform?page=1&limit=1000", "scripts"),
                fetchList("/admin/scores/reader?page=1&limit=1000", "scripts"),
                fetchList("/admin/scripts/pending?page=1&limit=1000", "scripts"),
                fetchList("/admin/scripts/trailer-requests?page=1&limit=1000", "scripts"),
                fetchList("/admin/investors/pending?page=1&limit=1000", "investors"),
                fetchList("/admin/writer-membership/pending?page=1&limit=1000", "reviews"),
                fetchList("/admin/bank-details/reviews?page=1&limit=1000", "reviews"),
                fetchList("/admin/queries?page=1&limit=1000", "submissions"),
                fetchList("/admin/users/deleted-requests?page=1&limit=1000", "requests"),
            ]);

            const sectionFromUsers = (title, list) => ({
                title: `${title} (${list.length})`,
                lines: list.map((u, idx) => formatUserExportLine(u, idx)),
            });

            const sectionFromScripts = (title, list) => ({
                title: `${title} (${list.length})`,
                lines: list.map((s, idx) => {
                    const approvalLabel = s.status === "pending_approval" && s.approvalRequestType === "edit_submission"
                        ? "edit approval"
                        : (s.status || "-");
                    const previewLabel = getScriptPreviewWindowLabel(s);
                    return `${idx + 1}. ${s.title || "-"} | SID: ${s.sid || "-"} | Creator: ${getScriptCreatorName(s)} | Genre: ${s.genre || s.primaryGenre || "-"} | Completion: ${getScriptCompletionSummary(s)} | Preview: ${previewLabel || "-"} | Status: ${approvalLabel} | Score: ${s.scriptScore?.overall || s.platformScore?.overall || s.rating || "-"} | Date: ${formatExportDate(s.createdAt)}`;
                }),
            });

            writePdfSections({
                fileName: `admin-complete-report-${Date.now()}.pdf`,
                title: "Admin Complete Dashboard Report",
                sections: [
                    {
                        title: "Overview",
                        lines: buildOverviewExportLines(overview),
                    },
                    sectionFromUsers("Investors", investorsData),
                    sectionFromUsers("Writers", [...writersData, ...creatorsData]),
                    sectionFromUsers("Readers", readersData),
                    sectionFromScripts("Projects", projectsData),
                    sectionFromScripts("Deleted Scripts", deletedScriptsData),
                    sectionFromScripts("AI Usage", aiUsageData),
                    sectionFromScripts("Evaluation Purchases", evaluationsData),
                    sectionFromScripts("Investor Purchases", purchasesData),
                    {
                        title: `Invoices (${invoicesData.length})`,
                        lines: invoicesData.map((inv, idx) => `${idx + 1}. ${inv.invoiceNumber || "-"} | Creator: ${inv.creator?.name || "-"} (${inv.creatorSid || inv.creator?.sid || "-"}) | Project: ${inv.script?.title || "-"} (${inv.scriptSid || inv.script?.sid || "-"}) | Access: ${inv.accessType || "-"} | Credits: ${inv.totalCreditsRequired || 0} | Date: ${formatExportDate(inv.invoiceDate || inv.createdAt)}`),
                    },
                    {
                        title: `Payments (${paymentsData.length})`,
                        lines: paymentsData.map((t, idx) => `${idx + 1}. ${t.user?.name || "-"} | ${t.type || "-"} | ${formatCurrency(t.amount || 0, t.currency || "INR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ${t.status || "-"} | ${t.description || "-"} | Txn: ${getTransactionIdLabel(t) || "-"} | Pay ID: ${getPaymentIdLabel(t) || "-"} | ${formatExportDate(t.createdAt)}`),
                    },
                    sectionFromScripts("AI Scores", aiScoresData),
                    sectionFromScripts("Ckript Scores", platformScoresData),
                    sectionFromScripts("Reader Scores", readerScoresData),
                    sectionFromScripts("Pending Approvals", approvalsData),
                    sectionFromScripts("AI Trailer Approvals", trailersData),
                    {
                        title: `Film Professional Requests (${pendingInvestorsData.length})`,
                        lines: pendingInvestorsData.map((inv, idx) => `${idx + 1}. ${inv.name || "-"} | ${inv.email || "-"} | Date: ${formatExportDate(inv.createdAt)} | Status: pending`),
                    },
                    {
                        title: `SWA/WGA Reviews (${membershipReviewsData.length})`,
                        lines: membershipReviewsData.map((review, idx) => `${idx + 1}. ${review.name || "-"} | ${review.email || "-"} | SID: ${review.sid || "-"} | Pending: ${(review.pendingMemberships || []).map((item) => `${item.label}:${item.status}`).join(", ") || "-"}`),
                    },
                    {
                        title: `Bank Detail Reviews (${bankReviewsData.length})`,
                        lines: bankReviewsData.map((review, idx) => `${idx + 1}. ${review.name || "-"} | ${review.email || "-"} | Bank: ${review.requestedDetails?.bankName || "-"} | Status: ${review.status || "-"} | Attempts: ${review.bankSecurity?.invalidAttempts || 0} | Locked: ${review.bankSecurity?.isLocked ? "Yes" : "No"} | Submitted: ${formatExportDate(review.submittedAt)}`),
                    },
                    {
                        title: `Queries (${queriesData.length})`,
                        lines: queriesData.map((c, idx) => `${idx + 1}. ${c.name || "-"} | ${c.email || "-"} | Reason: ${c.reason || "-"} | Message: ${c.message || "-"} | Date: ${formatExportDate(c.createdAt)}`),
                    },
                    {
                        title: `Deleted Film Professionals (${deletedAccountsData.filter((item) => String(item?.role || "").toLowerCase() === "investor").length})`,
                        lines: deletedAccountsData
                            .filter((item) => String(item?.role || "").toLowerCase() === "investor")
                            .map((item, idx) => `${idx + 1}. ${item.name || "-"} | ${item.email || "-"} | SID: ${item.sid || "-"} | Role: ${item.role || "-"} | Source: ${item.source || "-"} | Reason: ${item.reason || "-"} | Requested: ${formatExportDate(item.requestedAt)} | Deactivated: ${formatExportDate(item.deactivatedAt)}`),
                    },
                    {
                        title: `Deleted Writers (${deletedAccountsData.filter((item) => PROJECT_CREATOR_ROLES.has(String(item?.role || "").toLowerCase())).length})`,
                        lines: deletedAccountsData
                            .filter((item) => PROJECT_CREATOR_ROLES.has(String(item?.role || "").toLowerCase()))
                            .map((item, idx) => `${idx + 1}. ${item.name || "-"} | ${item.email || "-"} | SID: ${item.sid || "-"} | Role: ${item.role || "-"} | Source: ${item.source || "-"} | Reason: ${item.reason || "-"} | Requested: ${formatExportDate(item.requestedAt)} | Deactivated: ${formatExportDate(item.deactivatedAt)}`),
                    },
                ],
            });
            showToast("Complete dashboard PDF downloaded");
        } catch (err) {
            console.error(err);
            showToast("Failed to download full dashboard PDF", "error");
        } finally {
            setExportingAll(false);
        }
    };

    // ─── Fetch data function ───
    const fetchData = async (searchValue = "") => {
        if (!authorized) return;
        setLoading(true);
        const activeSearch = searchValue.trim();
        try {
            if (isAdminScriptProtectedTab(activeTab)) {
                const hasScriptAccess = await ensureScriptSectionAccess();
                if (!hasScriptAccess) {
                    setLoading(false);
                    return;
                }
            }

            switch (activeTab) {
                case "overview": {
                    const { data } = await adminApi.get("/admin/stats");
                    setStats(data);
                    break;
                }
                case "investors": {
                    const { data } = await adminApi.get(`/admin/users?role=investor&page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    setUsers(data.users); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "writers": {
                    console.log("Fetching writers and creators...");
                    const { data } = await adminApi.get(`/admin/users?role=writer&page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    const { data: data2 } = await adminApi.get(`/admin/users?role=creator&page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    console.log("Writers response:", data, "Creators response:", data2);
                    
                    setUsers([...(data?.users || []), ...(data2?.users || [])]);
                    setTotalPages(Math.max(data?.totalPages || 1, data2?.totalPages || 1));
                    setTotal((data?.total || 0) + (data2?.total || 0));
                    break;
                }
                case "swa-approved": {
                    const { data } = await adminApi.get(`/admin/users?role=writer&isSwaApproved=true&page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    setUsers(data.users); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "readers": {
                    const { data } = await adminApi.get(`/admin/users?role=reader&page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    setUsers(data.users); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "projects": {
                    const { data } = await adminApi.get(`/admin/scripts?page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    setScripts(data.scripts); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "deleted-scripts": {
                    const { data } = await adminApi.get(`/admin/scripts?status=deleted&page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    setScripts(data.scripts); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "ai-usage": {
                    const { data } = await adminApi.get(`/admin/scripts/ai-usage?page=${page}`);
                    setScripts(data.scripts); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "evaluations": {
                    const { data } = await adminApi.get(`/admin/scripts/evaluation-purchases?page=${page}`);
                    const evaluationScripts = Array.isArray(data?.scripts)
                        ? data.scripts.filter((script) => ![true, "true", 1].includes(script?.isDeleted) && script?.status !== "rejected")
                        : [];
                    setScripts(evaluationScripts); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "meetings": {
                    const { data } = await adminApi.get(`/meetings`);
                    setMeetings(data); setTotalPages(1); setTotal(data.length);
                    break;
                }
                case "scores": {
                    const endpoint = scoreSubTab === "ai" ? "/admin/scores/ai" : scoreSubTab === "platform" ? "/admin/scores/platform" : "/admin/scores/reader";
                    const { data } = await adminApi.get(`${endpoint}?page=${page}`);
                    setScripts(data.scripts); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "approvals": {
                    const { data } = await adminApi.get(`/admin/scripts/pending?page=${page}`);
                    setScripts(data.scripts); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "trailers": {
                    const { data } = await adminApi.get(`/admin/scripts/trailer-requests?page=${page}`);
                    const trailerScripts = Array.isArray(data?.scripts)
                        ? data.scripts.filter((script) => ![true, "true", 1].includes(script?.isDeleted))
                        : [];
                    setScripts(trailerScripts); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "ai-trailers": {
                    const { data } = await adminApi.get(`/admin/scripts/ai-trailers?page=${page}`);
                    const trailerLibraryScripts = Array.isArray(data?.scripts)
                        ? data.scripts.filter((script) => ![true, "true", 1].includes(script?.isDeleted))
                        : [];
                    setScripts(trailerLibraryScripts); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "messages": {
                    await fetchMessagesDirectory();
                    break;
                }
                case "pending-investors": {
                    const { data } = await adminApi.get(`/admin/investors/pending?page=${page}`);
                    setPendingInvestors(data.investors); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "membership-reviews": {
                    const { data } = await adminApi.get(`/admin/writer-membership/pending?page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    setMembershipReviews(data.reviews); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "queries": {
                    const { data } = await adminApi.get(`/admin/queries?page=${page}`);
                    setContacts(data.submissions); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "deleted-film-professionals": {
                    const { data } = await adminApi.get(`/admin/users/deleted-requests?page=${page}&role=investor&search=${encodeURIComponent(activeSearch)}`);
                    setDeletedAccounts(data.requests || []); setTotalPages(data.totalPages || 1); setTotal(data.total || 0);
                    break;
                }
                case "deleted-writers": {
                    const { data } = await adminApi.get(`/admin/users/deleted-requests?page=${page}&role=writer&search=${encodeURIComponent(activeSearch)}`);
                    setDeletedAccounts(data.requests || []); setTotalPages(data.totalPages || 1); setTotal(data.total || 0);
                    break;
                }
                case "discount-codes": {
                    const { data } = await adminApi.get(`/admin/discount-codes?page=${page}&search=${encodeURIComponent(activeSearch)}`);
                    setDiscountCodes(data.codes); setTotalPages(data.totalPages); setTotal(data.total);
                    break;
                }
                case "analytics": {
                    const { data } = await adminApi.get(`/admin/analytics`);
                    setAnalyticsData(data);
                    setTotalPages(1);
                    setTotal(data?.anonymousVisitors?.totalVisitors || 0);
                    break;
                }
            }
        } catch (err) {
            console.error("Admin fetch error:", err);
            if (err.response?.status === 401) {
                sessionStorage.removeItem("admin-session");
                clearAdminScriptAccess();
                setAuthorized(false);
                showToast("Session expired. Please re-enter the access code.", "error");
            } else if (err?.response?.data?.code === "ADMIN_SCRIPT_SECTION_PASSWORD_REQUIRED") {
                clearAdminScriptAccess();
                showToast("Script section unlock expired. Please enter the password again.", "error");
                ensureScriptSectionAccess().then((success) => {
                    if (success) {
                        fetchData(searchValue);
                    } else if (isAdminScriptProtectedTab(activeTab)) {
                        setActiveTab("overview");
                    }
                });
            } else {
                showToast(err?.response?.data?.message || "Failed to load admin data", "error");
            }
        }
        setMessagesLoading(false);
        await fetchAlertSummary({ silent: true });
        setLoading(false);
    };

    const fetchGlobalSearchData = async (searchValue = "") => {
        if (!authorized) return;
        const activeSearch = searchValue.trim();
        if (!activeSearch) {
            setGlobalResults(EMPTY_GLOBAL_RESULTS);
            return;
        }

        setLoading(true);
        try {
            const hasScriptAccess = Boolean(getStoredAdminScriptAccess()?.token);
            const [
                investorsRes,
                writersRes,
                creatorsRes,
                readersRes,
                scriptsRes,
                invoicesRes,
                paymentsRes,
                pendingInvestorsRes,
                bankReviewsRes,
                queriesRes,
            ] = await Promise.all([
                adminApi.get(`/admin/users?role=investor&page=1&limit=100&search=${encodeURIComponent(activeSearch)}`),
                adminApi.get(`/admin/users?role=writer&page=1&limit=100&search=${encodeURIComponent(activeSearch)}`),
                adminApi.get(`/admin/users?role=creator&page=1&limit=100&search=${encodeURIComponent(activeSearch)}`),
                adminApi.get(`/admin/users?role=reader&page=1&limit=100&search=${encodeURIComponent(activeSearch)}`),
                hasScriptAccess
                    ? adminApi.get(`/admin/scripts?page=1&limit=100&search=${encodeURIComponent(activeSearch)}`)
                    : Promise.resolve({ data: { scripts: [] } }),
                adminApi.get(`/admin/invoices?page=1&limit=100&search=${encodeURIComponent(activeSearch)}`),
                adminApi.get(`/admin/payments?page=1&limit=200`),
                adminApi.get(`/admin/investors/pending?page=1&limit=200`),
                adminApi.get(`/admin/bank-details/reviews?page=1&limit=200&search=${encodeURIComponent(activeSearch)}`),
                adminApi.get(`/admin/queries?page=1&limit=200`),
            ]);

            setGlobalResults({
                users: [
                    ...(investorsRes.data?.users || []),
                    ...(writersRes.data?.users || []),
                    ...(creatorsRes.data?.users || []),
                    ...(readersRes.data?.users || []),
                ],
                scripts: scriptsRes.data?.scripts || [],
                transactions: paymentsRes.data?.transactions || [],
                invoices: invoicesRes.data?.invoices || [],
                pendingInvestors: pendingInvestorsRes.data?.investors || [],
                bankReviews: bankReviewsRes.data?.reviews || [],
                contacts: queriesRes.data?.submissions || [],
            });
        } catch (err) {
            console.error("Admin global search fetch error:", err);
            if (err.response?.status === 401) {
                sessionStorage.removeItem("admin-session");
                clearAdminScriptAccess();
                setAuthorized(false);
                showToast("Session expired. Please re-enter the access code.", "error");
            } else if (err?.response?.data?.code === "ADMIN_SCRIPT_SECTION_PASSWORD_REQUIRED") {
                clearAdminScriptAccess();
                showToast("Scripts stay hidden in global search until the protected script sections are unlocked.", "info");
            }
        }
        setLoading(false);
    };

    const fetchAnalyticsUserDetail = async (userId) => {
        if (!userId) return;
        try {
            setAnalyticsUserDetailLoading(true);
            const { data } = await adminApi.get(`/admin/analytics/users/${userId}`);
            setAnalyticsUserDetail(data || null);
            setAnalyticsSection("registered");
        } catch (err) {
            console.error("Admin analytics user detail error:", err);
            showToast(err?.response?.data?.message || "Failed to load user activity details", "error");
        } finally {
            setAnalyticsUserDetailLoading(false);
        }
    };

    const fetchAnalyticsAnonymousDetail = async (anonymousId) => {
        if (!anonymousId) return;
        try {
            setAnalyticsAnonymousDetailLoading(true);
            const { data } = await adminApi.get(`/admin/analytics/anonymous/${encodeURIComponent(anonymousId)}`);
            setAnalyticsAnonymousDetail(data || null);
            setAnalyticsSection("anonymous");
        } catch (err) {
            console.error("Admin analytics anonymous detail error:", err);
            showToast(err?.response?.data?.message || "Failed to load anonymous user details", "error");
        } finally {
            setAnalyticsAnonymousDetailLoading(false);
        }
    };

    // ─── Effects ───
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        if (authorized) setPage(1);
    }, [activeTab, scoreSubTab, authorized]);

    useEffect(() => {
        if (authorized) setPage(1);
    }, [search, authorized]);

    useEffect(() => {
        if (activeTab !== "analytics") {
            setAnalyticsSection("anonymous");
            setAnalyticsAnonymousDetail(null);
            setAnalyticsAnonymousDetailLoading(false);
            setAnalyticsUserDetail(null);
            setAnalyticsUserDetailLoading(false);
        }
    }, [activeTab]);

    useEffect(() => {
        if (!authorized) return;
        if (activeTab === "overview" && hasSearch) return;
        fetchData(search);
    }, [activeTab, page, scoreSubTab, authorized, search, hasSearch]);

    useEffect(() => {
        if (!authorized || activeTab !== "overview") return;
        if (!hasSearch) {
            setGlobalResults(EMPTY_GLOBAL_RESULTS);
            return;
        }
        fetchGlobalSearchData(search);
    }, [authorized, activeTab, hasSearch, search]);

    useEffect(() => {
        if (authorized && searchInput !== search) {
            setLoading(true);
        }
    }, [searchInput, search, authorized]);
    useEffect(() => {
        if (!authorized) return;
        fetchAlertSummary({ silent: true });
        const interval = setInterval(() => {
            fetchAlertSummary({ silent: false });
        }, 30000);
        return () => clearInterval(interval);
    }, [authorized]);

    useEffect(() => {
        if (!authorized || activeTab !== "messages") return;

        const interval = setInterval(async () => {
            await fetchMessagesDirectory({ silent: true });
            if (activeMessageChatId) {
                await fetchMessagesForChat(activeMessageChatId, { silent: true });
            }
        }, 4000);

        return () => clearInterval(interval);
    }, [authorized, activeTab, activeMessageChatId, activeMessageUser?._id]);

    useEffect(() => {
        if (!authorized || activeTab !== "messages" || !activeMessageChatId) return;
        fetchMessagesForChat(activeMessageChatId, { silent: true });
    }, [authorized, activeTab, activeMessageChatId]);

    useEffect(() => {
        if (activeTab !== "messages" || !activeMessageChatId) {
            previousAdminChatIdRef.current = "";
            shouldAutoScrollAdminMessagesRef.current = false;
            setShowAdminScrollToBottomButton(false);
            return;
        }

        const chatChanged = previousAdminChatIdRef.current !== activeMessageChatId;
        if (chatChanged) {
            previousAdminChatIdRef.current = activeMessageChatId;
            shouldAutoScrollAdminMessagesRef.current = true;
            scrollAdminMessagesToBottom("auto");
            return;
        }

        if (!shouldAutoScrollAdminMessagesRef.current) return;
        shouldAutoScrollAdminMessagesRef.current = false;
        scrollAdminMessagesToBottom("smooth");
    }, [activeTab, activeMessageChatId, messageList.length]);

    useEffect(() => {
        const container = messageListContainerRef.current;
        if (activeTab !== "messages" || !activeMessageChatId || !container) {
            setShowAdminScrollToBottomButton(false);
            return;
        }
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setShowAdminScrollToBottomButton(distanceFromBottom > 96);
    }, [activeTab, activeMessageChatId, messageList.length]);

    const fetchMessagesForChat = async (chatId, { silent = false } = {}) => {
        if (!chatId) {
            setMessageList([]);
            return;
        }
        if (!silent) setMessagesLoading(true);
        try {
            const { data } = await adminApi.get(`/messages/${chatId}`);
            const next = Array.isArray(data) ? data : [];
            setMessageList((prev) => {
                const sameLength = prev.length === next.length;
                const sameFirst = prev[0]?._id === next[0]?._id;
                const sameLast = prev[prev.length - 1]?._id === next[next.length - 1]?._id;
                if (sameLength && sameFirst && sameLast) return prev;
                return next;
            });
        } catch (err) {
            console.error("Admin messages fetch error:", err);
            if (!silent) showToast("Failed to load messages", "error");
            setMessageList([]);
        } finally {
            if (!silent) setMessagesLoading(false);
        }
    };

    const fetchAllTabData = async (tab, search) => {
        try {
            const activeSearch = (search || "").trim();
            switch (tab) {
                case "investors":
                case "writers":
                case "swa-approved":
                case "readers": {
                    const { data } = await adminApi.get(`/admin/users?limit=0&search=${encodeURIComponent(activeSearch)}`);
                    return data?.users || [];
                }
                case "deleted-requests": {
                    const { data } = await adminApi.get(`/admin/users/deleted-requests?limit=0&search=${encodeURIComponent(activeSearch)}`);
                    return data.requests;
                }
            }
            return [];
        } catch (e) {
            console.error("Failed to fetch all tab data", e);
            return [];
        }
    };

    const openWriterConversation = async (writerUser) => {
        if (!writerUser?._id) return;

        const writerId = String(writerUser._id);
        const existingConversation = adminConversations.find((conv) => String(conv?.user?._id) === writerId);

        setActiveTab("messages");
        setActiveMessageUser(writerUser);
        setMessageText("");
        setMessageAttachment(null);
        if (messageFileInputRef.current) messageFileInputRef.current.value = "";

        if (existingConversation?.chatId) {
            setActiveMessageChatId(existingConversation.chatId);
            await fetchMessagesForChat(existingConversation.chatId);
            return;
        }

        setActiveMessageChatId("");
        setMessageList([]);
    };

    const handlePickMessageAttachment = () => {
        if (!activeMessageUser || uploadingMessageAttachment) return;
        messageFileInputRef.current?.click();
    };

    const handleAdminAttachmentChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
            showToast("Attachment is too large. Maximum size is 250MB.", "error");
            if (messageFileInputRef.current) messageFileInputRef.current.value = "";
            return;
        }

        setUploadingMessageAttachment(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const { data } = await adminApi.post(
                `/messages/upload?receiverId=${encodeURIComponent(activeMessageUser._id)}`,
                formData
            );
            setMessageAttachment(data || null);
        } catch (err) {
            console.error("Admin attachment upload error:", err);
            showToast(err?.response?.data?.message || "Failed to upload attachment", "error");
            if (messageFileInputRef.current) messageFileInputRef.current.value = "";
        } finally {
            setUploadingMessageAttachment(false);
        }
    };

    const handleSendAdminMessage = async () => {
        if (!activeMessageUser?._id) return;

        const trimmedText = messageText.trim();
        const attachmentPayload = messageAttachment
            ? {
                fileUrl: messageAttachment.fileUrl,
                fileGrant: messageAttachment.fileGrant,
                fileType: messageAttachment.fileType,
                fileName: messageAttachment.fileName,
                fileSize: messageAttachment.fileSize,
            }
            : {};

        if (!trimmedText && !attachmentPayload.fileUrl) return;

        try {
            const { data: saved } = await adminApi.post("/messages/send", {
                receiverId: activeMessageUser._id,
                text: trimmedText,
                ...attachmentPayload,
            });

            setMessageText("");
            setMessageAttachment(null);
            if (messageFileInputRef.current) messageFileInputRef.current.value = "";
            shouldAutoScrollAdminMessagesRef.current = true;
            setMessageList((prev) => [...prev, saved]);

            const nextChatId = saved?.chatId || activeMessageChatId || buildChatId(saved?.sender?._id, activeMessageUser._id);
            if (nextChatId) setActiveMessageChatId(nextChatId);
            const previewText = getMessagePreview(saved);

            setAdminConversations((prev) => {
                const conversation = {
                    chatId: nextChatId,
                    user: activeMessageUser,
                    lastMessage: previewText,
                    timestamp: saved?.createdAt || new Date().toISOString(),
                    unreadCount: 0,
                };
                const rest = prev.filter((conv) => conv.chatId !== conversation.chatId);
                return [conversation, ...rest];
            });

            setMessageUsers((prev) => {
                const withoutCurrent = prev.filter((u) => String(u._id) !== String(activeMessageUser._id));
                return [{ ...activeMessageUser, conversation: { chatId: nextChatId, timestamp: saved?.createdAt || new Date().toISOString(), lastMessage: previewText, unreadCount: 0 } }, ...withoutCurrent];
            });
        } catch (err) {
            console.error("Admin send message error:", err);
            showToast(err?.response?.data?.message || "Failed to send message", "error");
        }
    };

    // ─── Action handlers (all use adminApi) ───
    const handleApprove = async (id) => {
        const hasScriptAccess = await ensureScriptSectionAccess();
        if (!hasScriptAccess) return;

        try {
            await adminApi.put(`/admin/scripts/${id}/approve`);
            showToast("Script approved and published successfully");
            fetchData();
        } catch (err) {
            console.error(err);
            showToast("Failed to approve script", "error");
        }
    };

    /**
     * Undo a writer's delete.
     *
     * Deleting a project is a soft delete, so the content and any competition entry are still there
     * — this clears the flag and the writer gets everything back. It is the only way back: nothing
     * else in the product can restore a deleted project.
     */
    const handleRestoreScript = async (script) => {
        const hasScriptAccess = await ensureScriptSectionAccess();
        if (!hasScriptAccess) return;

        const title = script?.title || "this project";
        if (!window.confirm(`Restore "${title}"? It returns to the writer's dashboard and they are notified.`)) return;

        try {
            await adminApi.put(`/admin/scripts/${script._id}/restore`);
            showToast(`"${title}" restored`);
            fetchData();
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to restore the project", "error");
        }
    };

    const handleReject = async (id) => {
        const hasScriptAccess = await ensureScriptSectionAccess();
        if (!hasScriptAccess) return;

        const reason = await openAdminDialog({
            type: "prompt",
            title: "Reject script",
            message: "Add an optional rejection reason visible to the writer.",
            confirmText: "Reject",
            cancelText: "Cancel",
            placeholder: "Rejection reason (optional)",
            multiline: true,
        });
        if (reason === null) return;
        try {
            await adminApi.put(`/admin/scripts/${id}/reject`, { reason: reason.trim() || undefined });
            showToast("Script rejected");
            fetchData();
        } catch (err) {
            console.error(err);
            showToast("Failed to reject script", "error");
        }
    };

    const handleDeleteProject = async (script) => {
        const hasScriptAccess = await ensureScriptSectionAccess();
        if (!hasScriptAccess) return;

        const scriptId = script?._id;
        if (!scriptId || deletingScriptId) return;

        const title = String(script?.title || "this project");
        const confirmed = await openAdminDialog({
            type: "confirm",
            title: "Delete project",
            message: `Delete "${title}" from platform listings? Existing buyers will retain access.`,
            confirmText: "Delete",
            cancelText: "Cancel",
        });
        if (!confirmed) return;

        try {
            setDeletingScriptId(scriptId);
            const { data } = await adminApi.delete(`/admin/scripts/${scriptId}`);
            showToast(data?.message || "Project deleted successfully");
            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to delete project", "error");
        } finally {
            setDeletingScriptId("");
        }
    };

    const handleScore = async (id, scores) => {
        const hasScriptAccess = await ensureScriptSectionAccess();
        if (!hasScriptAccess) return false;

        try {
            await adminApi.put(`/admin/scripts/${id}/score`, scores);
            showToast("Platform score saved successfully");
            setScoreModal(null);
            fetchData();
            return true;
        } catch (err) {
            console.error(err);
            showToast("Failed to save score", "error");
            return false;
        }
    };

    const handleTrailerApprove = async (script) => {
        const isRegeneration = script?.trailerWriterFeedback?.status === "revision_requested";
        const trimmedTrailerUrl = String(script?.trailerUrl || "").trim();
        if (!trimmedTrailerUrl) {
            if (!script?.creator?._id) {
                showToast("No trailer URL available for this script", "error");
                return;
            }

            const draft = isRegeneration
                ? `Hi ${script.creator?.name || "writer"}, please review this updated trailer for "${script?.title || "this script"}".\nTrailer URL: `
                : `Hi ${script.creator?.name || "writer"}, your trailer for "${script?.title || "this script"}" is ready.\nTrailer URL: `;

            await openWriterConversation(script.creator);
            setMessageText(draft);
            showToast("No trailer URL on script. Send trailer URL/file from Admin Messages.", "info");
            return;
        }

        const trailerThumbnail = script?.trailerThumbnail || "";
        const caption = isRegeneration
            ? `We've updated your AI trailer for "${script?.title || "this script"}". Please review this version.`
            : `Your AI trailer for "${script?.title || "this script"}" is ready.`;

        try {
            await adminApi.put(`/admin/scripts/${script._id}/trailer-approve`, {
                trailerUrl: trimmedTrailerUrl,
                trailerThumbnail: trailerThumbnail.trim() || undefined,
                caption: caption.trim() || undefined,
            });
            showToast(isRegeneration
                ? "Regenerated trailer sent to writer via message"
                : "Trailer approved and sent to writer via message");
            fetchData();
        } catch (err) {
            console.error(err);
            const msg = err?.response?.data?.message || (isRegeneration ? "Failed to regenerate trailer" : "Failed to approve trailer");
            showToast(msg, "error");
        }
    };

    const handleSendTrailerToWriter = async (script) => {
        await handleTrailerApprove(script);
    };

    const openTrailerRequirements = (script) => {
        if (!script) return;
        setTrailerRequirementsModal(script);
    };

    const handleOpenTrailerUpload = (script) => {
        if (!script?._id || uploadingTrailerScriptId) return;
        setTrailerUploadTargetScript(script);
        if (trailerFileInputRef.current) {
            trailerFileInputRef.current.value = "";
            trailerFileInputRef.current.click();
        }
    };

    const handleRemoveTrailer = async (script) => {
        const scriptId = script?._id;
        if (!scriptId) return;

        const title = String(script?.title || "this project");
        const confirmed = await openAdminDialog({
            type: "confirm",
            title: "Remove trailer",
            message: `Remove the trailer from "${title}"? It will no longer appear in the AI Trailer section.`,
            confirmText: "Remove",
            cancelText: "Cancel",
        });
        if (!confirmed) return;

        try {
            const { data } = await adminApi.delete(`/admin/scripts/${scriptId}/remove-trailer`);
            showToast(data?.message || "Trailer removed successfully");
            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to remove trailer", "error");
        }
    };

    const handleAdminTrailerFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !trailerUploadTargetScript?._id) return;

        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
            showToast("Trailer must be 250MB or smaller.", "error");
            if (trailerFileInputRef.current) trailerFileInputRef.current.value = "";
            setTrailerUploadTargetScript(null);
            return;
        }

        const scriptId = trailerUploadTargetScript._id;
        setUploadingTrailerScriptId(scriptId);

        try {
            const formData = new FormData();
            formData.append("trailer", file);

            const { data } = await adminApi.post(`/admin/scripts/${scriptId}/upload-trailer`, formData);

            if (data?.script?._id) {
                setScripts((prev) => prev.map((s) => (String(s._id) === String(data.script._id) ? { ...s, ...data.script } : s)));
            }

            showToast(data?.message || "Trailer uploaded and published successfully");
            if (activeTab === "trailers") {
                fetchData(search);
            }
        } catch (err) {
            console.error("Admin trailer upload error:", err);
            showToast(err?.response?.data?.message || "Failed to upload trailer", "error");
        } finally {
            setUploadingTrailerScriptId("");
            setTrailerUploadTargetScript(null);
            if (trailerFileInputRef.current) trailerFileInputRef.current.value = "";
        }
    };

    const handleApproveInvestor = async (id) => {
        try {
            await adminApi.put(`/admin/investors/${id}/approve`);
            showToast("Investor approved — they can now log in");
            fetchData();
        } catch (err) {
            console.error(err);
            showToast("Failed to approve investor", "error");
        }
    };

    const handleRejectInvestor = async (id, note) => {
        try {
            await adminApi.put(`/admin/investors/${id}/reject`, { note });
            showToast("Investor rejected");
            setRejectModal(null);
            fetchData();
        } catch (err) {
            console.error(err);
            showToast("Failed to reject investor", "error");
        }
    };




    const handleReviewWriterMembership = async (userId, membershipType, decision) => {
        if (!userId || userActionLoading) return;

        const normalizedType = String(membershipType || "").toLowerCase();
        const normalizedDecision = String(decision || "").toLowerCase();
        if (!["wga", "swa"].includes(normalizedType)) return;
        if (!["approve", "reject"].includes(normalizedDecision)) return;

        let note = "";
        if (normalizedDecision === "reject") {
            const noteInput = await openAdminDialog({
                type: "prompt",
                title: `Reject ${normalizedType.toUpperCase()} membership`,
                message: "Add an optional note for the writer.",
                confirmText: "Reject",
                cancelText: "Cancel",
                placeholder: "Rejection note (optional)",
                multiline: true,
            });
            if (noteInput === null) return;
            note = String(noteInput || "").trim();
        }

        const loadingKey = `membership-${normalizedDecision}-${normalizedType}-${userId}`;
        try {
            setUserActionLoading(loadingKey);
            const { data } = await adminApi.put(
                `/admin/writer-membership/${userId}/${normalizedType}/${normalizedDecision}`,
                note ? { note } : {}
            );

            showToast(data?.message || `${normalizedType.toUpperCase()} membership updated`);

            if (data?.user?._id && data?.user?.writerProfile) {
                setSelectedUserDetail((prev) => {
                    if (!prev || String(prev._id) !== String(data.user._id)) return prev;
                    return {
                        ...prev,
                        writerProfile: data.user.writerProfile,
                    };
                });
            }

            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to update membership review", "error");
        } finally {
            setUserActionLoading("");
        }
    };

    const handleOpenMembershipProof = async (event, userId, membershipType) => {
        event.preventDefault();
        if (!userId) return;

        const normalizedType = String(membershipType || "").toLowerCase();
        if (!["wga", "swa"].includes(normalizedType)) return;

        try {
            const { data } = await adminApi.get(`/admin/writer-membership/${userId}/${normalizedType}/access-url`);
            const accessUrl = data?.url;
            if (accessUrl) {
                window.open(accessUrl, "_blank", "noopener,noreferrer");
                return;
            }
            showToast("Proof link unavailable", "error");
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to open proof", "error");
        }
    };

    // ─── Discount Code Handlers ───
    const handleSaveDiscountCode = async (formData) => {
        try {
            if (formData._id) {
                await adminApi.put(`/admin/discount-codes/${formData._id}`, formData);
                showToast("Discount code updated");
            } else {
                await adminApi.post("/admin/discount-codes", formData);
                showToast("Discount code created");
            }
            setDiscountCodeModal(null);
            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to save discount code", "error");
        }
    };

    const handleDeleteDiscountCode = async (id) => {
        const confirmed = await openAdminDialog({
            type: "confirm",
            title: "Deactivate discount code",
            message: "Deactivate this discount code?",
            confirmText: "Deactivate",
            cancelText: "Cancel",
        });
        if (!confirmed) return;
        try {
            await adminApi.delete(`/admin/discount-codes/${id}`);
            showToast("Discount code deactivated");
            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast("Failed to deactivate discount code", "error");
        }
    };

    const handleLoginAs = async (userId) => {
        try {
            const { data } = await adminApi.post(`/admin/login-as/${userId}`);
            const encoded = encodeURIComponent(JSON.stringify(data));
            window.open(`/dashboard?adminLogin=${encoded}`, "_blank");
            showToast(`Opened session as ${data.name || data.email}`);
        } catch (err) {
            console.error(err);
            showToast("Failed to login as user", "error");
        }
    };

    /**
     * Toggle the finance role — the read-only payments panel handed to an external accountant.
     * Confirmed first because a role swap changes what the whole product shows this account; the
     * server remembers the previous role, so revoking restores it exactly.
     */
    const handleFinanceRoleToggle = async (user, grant) => {
        if (!user?._id || userActionLoading) return;
        const confirmed = await openAdminDialog({
            type: "confirm",
            title: grant ? "Grant finance access" : "Remove finance access",
            message: grant
                ? `${user.name || user.email} becomes a FINANCE account: read-only access to the payments panel at /finance, and their current role (${user.role}) is set aside until revoked.`
                : `Restore ${user.name || user.email} to their previous role and remove payments-panel access.`,
            confirmText: grant ? "Grant" : "Remove",
            cancelText: "Cancel",
        });
        if (!confirmed) return;

        setUserActionLoading(`finance-${user._id}`);
        try {
            const { data } = await adminApi.post(`/admin/users/${user._id}/finance-role`, { grant });
            showToast(data?.message || "Finance access updated");
            setSelectedUserDetail(null);
            fetchData(search);
        } catch (error) {
            showToast(error?.response?.data?.message || "Failed to update finance access", "error");
        } finally {
            setUserActionLoading("");
        }
    };

    const handleFreezeToggleUser = async (user, freeze) => {
        if (!user?._id || userActionLoading) return;
        if (user.isDeactivated) {
            showToast("This account is already deleted", "error");
            return;
        }

        const freezeReasonInput = freeze
            ? await openAdminDialog({
                type: "prompt",
                title: "Freeze account",
                message: "Provide a reason that will be shown to the user.",
                confirmText: "Freeze",
                cancelText: "Cancel",
                defaultValue: user.frozenReason || "",
                placeholder: "Freeze reason",
                multiline: true,
            })
            : "";

        if (freeze && freezeReasonInput === null) return;
        const reason = String(freezeReasonInput || "").trim();

        if (freeze && !reason) {
            showToast("Freeze reason is required", "error");
            return;
        }

        const loadingKey = `${freeze ? "freeze" : "unfreeze"}-${user._id}`;
        try {
            setUserActionLoading(loadingKey);
            const endpoint = freeze ? `/admin/users/${user._id}/freeze` : `/admin/users/${user._id}/unfreeze`;
            const { data } = await adminApi.put(endpoint, freeze ? { reason } : {});
            showToast(data?.message || (freeze ? "Account frozen" : "Account unfrozen"));

            if (data?.user?._id) {
                setSelectedUserDetail((prev) => {
                    if (!prev || String(prev._id) !== String(data.user._id)) return prev;
                    return { ...prev, ...data.user };
                });
            }

            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to update account status", "error");
        } finally {
            setUserActionLoading("");
        }
    };



    const handleGrantPremiumToUser = async (user) => {
        if (!user?._id || userActionLoading) return;
        if (user.isDeactivated) {
            showToast("Cannot grant premium to a deleted account", "error");
            return;
        }

        const confirmed = await openAdminDialog({
            type: "confirm",
            title: "Grant Premium",
            message: `Grant 30 days of the premium model to ${user.name || user.email}?`,
            confirmText: "Grant",
            cancelText: "Cancel",
        });

        if (!confirmed) return;

        const loadingKey = `premium-${user._id}`;
        try {
            setUserActionLoading(loadingKey);
            const { data } = await adminApi.post(`/admin/users/${user._id}/grant-premium`);
            showToast(data?.message || "Premium model granted successfully");

            if (data?.user?._id) {
                setSelectedUserDetail((prev) => {
                    if (!prev || String(prev._id) !== String(data.user._id)) return prev;
                    return { ...prev, ...data.user };
                });
            }

            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to grant premium model", "error");
        } finally {
            setUserActionLoading("");
        }
    };

    const handleRemovePremiumFromUser = async (user) => {
        if (!user?._id || userActionLoading) return;
        if (user.isDeactivated) {
            showToast("Cannot modify a deleted account", "error");
            return;
        }

        const confirmed = await openAdminDialog({
            type: "confirm",
            title: "Remove Premium",
            message: `Remove the premium model from ${user.name || user.email}?`,
            confirmText: "Remove",
            cancelText: "Cancel",
        });

        if (!confirmed) return;

        const loadingKey = `remove-premium-${user._id}`;
        try {
            setUserActionLoading(loadingKey);
            const { data } = await adminApi.post(`/admin/users/${user._id}/remove-premium`);
            showToast(data?.message || "Premium model removed successfully");

            if (data?.user?._id) {
                setSelectedUserDetail((prev) => {
                    if (!prev || String(prev._id) !== String(data.user._id)) return prev;
                    return { ...prev, ...data.user };
                });
            }

            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to remove premium model", "error");
        } finally {
            setUserActionLoading("");
        }
    };

    const handleGrantWriterPlan = async (user, plan) => {
        if (!user?._id || userActionLoading) return;
        if (user.isDeactivated) {
            showToast("Cannot modify a deleted account", "error");
            return;
        }

        const planDisplayName = plan === "gold" ? "Gold" : plan === "silver" ? "Silver" : plan;

        const cycle = await openAdminDialog({
            type: "select",
            title: `Grant ${planDisplayName} Plan`,
            message: `Select the billing cycle for the ${planDisplayName} plan you are granting to ${user.name || user.email}.`,
            confirmText: "Grant",
            cancelText: "Cancel",
            defaultValue: "monthly",
            options: [
                { label: "Monthly (30 days)", value: "monthly" },
                { label: "Annual (365 days)", value: "annual" }
            ]
        });

        if (!cycle) return;

        const loadingKey = `grant-writer-plan-${user._id}`;
        try {
            setUserActionLoading(loadingKey);
            const { data } = await adminApi.post(`/admin/users/${user._id}/grant-writer-plan`, { plan, cycle });
            showToast(data?.message || `Granted ${planDisplayName} plan successfully`);

            if (data?.user?._id) {
                setSelectedUserDetail((prev) => {
                    if (!prev || String(prev._id) !== String(data.user._id)) return prev;
                    return { ...prev, ...data.user };
                });
            }

            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to grant writer plan", "error");
        } finally {
            setUserActionLoading("");
        }
    };

    const handleGrantFipPlan = async (user) => {
        if (!user?._id || userActionLoading) return;
        if (user.isDeactivated) {
            showToast("Cannot modify a deleted account", "error");
            return;
        }

        const confirmed = await openAdminDialog({
            type: "confirm",
            title: "Grant 1-Year FIP Plan",
            message: `Grant a 1-year Film Industry Professional (Diamond) plan to ${user.name || user.email}?`,
            confirmText: "Grant",
            cancelText: "Cancel",
        });

        if (!confirmed) return;

        const loadingKey = `grant-fip-plan-${user._id}`;
        try {
            setUserActionLoading(loadingKey);
            const { data } = await adminApi.post(`/admin/users/${user._id}/grant-fip-plan`);
            showToast(data?.message || "Granted 1-Year FIP plan successfully");

            if (data?.user?._id) {
                setSelectedUserDetail((prev) => {
                    if (!prev || String(prev._id) !== String(data.user._id)) return prev;
                    return { ...prev, ...data.user };
                });
            }

            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to grant FIP plan", "error");
        } finally {
            setUserActionLoading("");
        }
    };


    const handleDeleteUserAccount = async (user) => {
        if (!user?._id || userActionLoading) return;
        if (user.isDeactivated) {
            showToast("Account already deleted", "info");
            return;
        }

        const confirmed = await openAdminDialog({
            type: "confirm",
            title: "Delete account",
            message: `Delete account for ${user.name || user.email}? This action deactivates and blocks access.`,
            confirmText: "Delete",
            cancelText: "Cancel",
        });
        if (!confirmed) return;

        const loadingKey = `delete-${user._id}`;
        try {
            setUserActionLoading(loadingKey);
            const { data } = await adminApi.delete(`/admin/users/${user._id}`);
            showToast(data?.message || "User account deleted successfully");

            if (data?.user?._id) {
                setSelectedUserDetail((prev) => {
                    if (!prev || String(prev._id) !== String(data.user._id)) return prev;
                    return { ...prev, ...data.user };
                });
            }

            fetchData(search);
        } catch (err) {
            console.error(err);
            showToast(err?.response?.data?.message || "Failed to delete account", "error");
        } finally {
            setUserActionLoading("");
        }
    };


    const handleCodeSubmit = async (e) => {
        e.preventDefault();
        setCodeError("");
        const enteredCode = codeInput.trim();
        if (!enteredCode) {
            setCodeError("Access code is required");
            return;
        }
        setCodeLoading(true);
        try {
            // Login as admin — store token ONLY in sessionStorage (does NOT affect user's localStorage session)
            const { data } = await axios.post(`${API_BASE_URL}/auth/login`, {
                email: import.meta.env.VITE_ADMIN_EMAIL || "admin@ckript.com",
                password: import.meta.env.VITE_ADMIN_PASSWORD || "admin123",
                adminCode: enteredCode,
            });
            sessionStorage.setItem("admin-session", JSON.stringify(data));
            clearAdminScriptAccess();
            setAuthorized(true);
            setCodeInput("");
        } catch (error) {
            const apiMessage = error?.response?.data?.message;
            setCodeError(apiMessage || "Admin login failed. Admin account may be missing after DB reset.");
        }
        setCodeLoading(false);
    };

    const handleLogout = () => {
        setShowLogoutConfirm(true);
    };

    const confirmLogout = () => {
        setShowLogoutConfirm(false);
        sessionStorage.removeItem("admin-session");
        clearAdminScriptAccess();
        setAuthorized(false);
        previousAlertSummaryRef.current = null;
        setAlertSummary({});
    };

    // ═══════════════════════════════════════════════
    // If not authorized, show code entry screen
    // ═══════════════════════════════════════════════
    if (!authorized) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-[#050d1a] via-[#0b1a30] to-[#0a1628]">
                <div className="w-full max-w-md mx-4 rounded-2xl p-8 border bg-[#1a1616]/80 border-[#2e2828] backdrop-blur-xl shadow-2xl">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-[#7a2233]/20 to-purple-500/20 border border-[#a83a4d]/20">
                            <svg className="w-8 h-8 text-[#e79aa6]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-extrabold text-white">Admin Panel</h1>
                        <p className="text-sm mt-1 text-gray-500">Enter access code to continue</p>
                    </div>
                    <form onSubmit={handleCodeSubmit}>
                        <PasswordInput
                            value={codeInput}
                            onChange={(e) => { setCodeInput(e.target.value); setCodeError(""); }}
                            placeholder="Access Code"
                            autoFocus
                            className="w-full px-4 py-3.5 rounded-xl text-center text-lg font-bold tracking-[0.3em] outline-none border bg-[var(--ad-surface-2)] border-[var(--ad-line-2)] text-[var(--ad-ink)] placeholder:text-[var(--ad-ink-3)] focus:border-[var(--ad-accent)] focus:ring-2 focus:ring-[var(--ad-accent)]/25 transition-all"
                        />
                        {codeError && (
                            <p className="text-red-400 text-sm font-semibold mt-2 text-center">{codeError}</p>
                        )}
                        <button
                            type="submit"
                            disabled={codeLoading || !codeInput}
                            className="w-full mt-4 py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#7a2233] to-purple-500 text-white hover:from-[#7a2233] hover:to-purple-600 transition-all disabled:opacity-50 shadow-lg hover:shadow-xl hover:shadow-[#a83a4d]/20"
                        >
                            {codeLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Verifying...
                                </span>
                            ) : "Access Admin Panel"}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // ─── Render Content ───
    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-3 border-gray-200 border-t-[#a83a4d] rounded-full animate-spin"></div>
                </div>
            );
        }

        switch (activeTab) {
            case "overview":
                return <OverviewSection />;

            case "direct-email":
                return <DirectEmailSection />;


            case "investors":
            case "writers":
            case "readers":
                return <UsersSection />;

            case "swa-approved":
                return <SwaApprovedSection />;

            case "projects":
                return <ProjectsSection />;

            case "deleted-scripts":
                return <DeletedScriptsSection />;

            case "ai-usage":
                return <AiUsageSection />;

            case "evaluations":
                return <EvaluationsSection />;

            case "scores":
                return <ScoresSection />;

            case "approvals":
                return <ApprovalsSection />;

            case "trailers":
                return <TrailerApprovalsSection />;

            case "ai-trailers":
                return <AiTrailersSection />;

            case "meetings":
                return <MeetingsSection />;
                
            case "consultations":
                return <ConsultationsSection dark={isDark} />;

            case "messages":
                return <MessagesSection />;

            case "membership-reviews":
                return <MembershipReviewsSection />;

            case "competitions":
                return <AdminCompetitions isDark={isDark} />;

            case "judges":
                return <JudgesSection />;

            case "external-registrations":
                return <ExternalRegistrationsSection />;

            case "referrals":
                return <AdminReferrals isDark={isDark} />;

            case "queries":
                return <QueriesSection />;

            case "deleted-film-professionals":
            case "deleted-writers":
                return <DeletedUsersSection />;

            case "analytics":
                return <AnalyticsSection />;

            case "discount-codes":
                return <DiscountCodesSection />;

            default:
                return null;
        }
    };


    const UserDetailsModal = ({ user, onClose }) => {
        const [openingAttachmentKey, setOpeningAttachmentKey] = useState("");
        const normalizedRole = String(user?.role || "").toLowerCase();
        const isWriterRole = ["writer", "creator"].includes(normalizedRole);
        const isInvestorRole = ["investor", "producer", "director", "industry", "professional"].includes(normalizedRole);
        const isReaderRole = normalizedRole === "reader";
        const writerLinks = user?.writerProfile?.links || {};
        const investorSocialLinks = user?.industryProfile?.socialLinks || {};
        const investorDemographics = user?.industryProfile?.demographics || {};
        const membershipVerification = user?.writerProfile?.membershipVerification || {};
        const wgaVerification = membershipVerification?.wga || {};
        const swaVerification = membershipVerification?.swa || {};
        const mandates = user?.industryProfile?.mandates || {};
        const notableCreditAttachments = Array.isArray(user?.industryProfile?.notableCreditAttachments)
            ? user.industryProfile.notableCreditAttachments
            : [];
        const addressLine = getUserAddressLine(user);

        const isUserDeleted = Boolean(user?.isDeactivated);
        const isUserFrozen = Boolean(user?.isFrozen);
        const freezeLoading = userActionLoading === `freeze-${user?._id}`;
        const unfreezeLoading = userActionLoading === `unfreeze-${user?._id}`;

        const deleteLoading = userActionLoading === `delete-${user?._id}`;
        const wgaApproveLoading = userActionLoading === `membership-approve-wga-${user?._id}`;
        const wgaRejectLoading = userActionLoading === `membership-reject-wga-${user?._id}`;
        const swaApproveLoading = userActionLoading === `membership-approve-swa-${user?._id}`;
        const swaRejectLoading = userActionLoading === `membership-reject-swa-${user?._id}`;

        const handleOpenAdminAttachment = async (event, file) => {
            event.preventDefault();

            const fallbackUrl = String(file?.url || "");
            const fileKey = String(file?.publicId || fallbackUrl || "");
            if (!fallbackUrl) return;

            const mimeType = String(file?.mimeType || "").toLowerCase();
            if (mimeType !== "application/pdf") {
                window.open(fallbackUrl, "_blank", "noopener,noreferrer");
                return;
            }

            setOpeningAttachmentKey(fileKey);
            try {
                const response = await adminApi.get(`/admin/users/${user?._id}/industry-credit-attachments/file`, {
                    params: {
                        publicId: file?.publicId,
                        url: file?.url,
                    },
                    responseType: "blob",
                });

                const blob = response?.data instanceof Blob
                    ? response.data
                    : new Blob([response?.data], { type: "application/pdf" });
                const objectUrl = URL.createObjectURL(blob);
                window.open(objectUrl, "_blank", "noopener,noreferrer");
                setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
            } catch {
                window.open(fallbackUrl, "_blank", "noopener,noreferrer");
            } finally {
                setOpeningAttachmentKey("");
            }
        };

        const detailRows = [
            { label: "Name", value: user?.name },
            { label: "Email", value: user?.email },
            { label: "Phone", value: user?.phone },
            { label: "Role", value: user?.role },
            { label: "SID", value: user?.sid },
            { label: "Account Status", value: isUserDeleted ? "Deleted" : isUserFrozen ? "Frozen" : "Active" },
            { label: "Frozen Reason", value: user?.frozenReason },
            { label: "Date of Birth", value: user?.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString() : "" },
            { label: "Address", value: addressLine || user?.address?.formatted },
            { label: "Bio", value: user?.bio },
            { label: "Approval Status", value: user?.approvalStatus },
            { label: "Approval Note", value: user?.approvalNote },
            { label: "Email Verified", value: user?.emailVerified === true ? "Yes" : user?.emailVerified === false ? "No" : "" },
            { label: "Joined", value: user?.createdAt ? new Date(user.createdAt).toLocaleString() : "" },
        ];

        const writerRows = [
            { label: "Legal Name", value: user?.writerProfile?.legalName },
            { label: "Username", value: user?.writerProfile?.username },
            { label: "WGA Member", value: user?.writerProfile?.wgaMember === true ? "Yes" : user?.writerProfile?.wgaMember === false ? "No" : "" },
            { label: "SWA Member", value: user?.writerProfile?.sgaMember === true ? "Yes" : user?.writerProfile?.sgaMember === false ? "No" : "" },
            { label: "Plan", value: user?.writerProfile?.plan },
            { label: "Representation", value: user?.writerProfile?.representationStatus },
            { label: "Agency", value: user?.writerProfile?.agencyName },
            { label: "Primary Genres", value: Array.isArray(user?.writerProfile?.genres) ? user.writerProfile.genres.join(", ") : "" },
            { label: "Specialized Tags", value: Array.isArray(user?.writerProfile?.specializedTags) ? user.writerProfile.specializedTags.join(", ") : "" },
            { label: "Demographic Privacy", value: user?.writerProfile?.demographicPrivacy },
            { label: "Gender", value: user?.writerProfile?.diversity?.gender },
            { label: "Nationality", value: user?.writerProfile?.diversity?.nationality },
            { label: "Ethnicity", value: user?.writerProfile?.diversity?.ethnicity },
            { label: "LGBTQ+", value: user?.writerProfile?.diversity?.lgbtqStatus },
            { label: "Disability", value: user?.writerProfile?.diversity?.disabilityStatus },
            { label: "Portfolio", value: writerLinks?.portfolio },
            { label: "Instagram", value: writerLinks?.instagram },
            { label: "Twitter", value: writerLinks?.twitter },
            { label: "LinkedIn", value: writerLinks?.linkedin },
            { label: "IMDb", value: writerLinks?.imdb },
            { label: "Facebook", value: writerLinks?.facebook },
            { label: "Accomplishments", value: Array.isArray(user?.writerProfile?.accomplishments) ? user.writerProfile.accomplishments.join(", ") : "" },
        ];

        const investorRows = [
            { label: "Sub Role", value: formatIndustrySubRole(user?.industryProfile?.subRole, user?.industryProfile?.subRoleOther) },
            { label: "Company", value: user?.industryProfile?.company },
            { label: "Job Title", value: user?.industryProfile?.jobTitle },
            { label: "Gender", value: investorDemographics?.gender },
            { label: "Nationality", value: investorDemographics?.nationality },
            { label: "Verified", value: user?.industryProfile?.isVerified === true ? "Yes" : user?.industryProfile?.isVerified === false ? "No" : "" },
            { label: "Investment Range", value: user?.industryProfile?.investmentRange },
            { label: "Previous Credits", value: sanitizePreviousCreditsDisplay(user?.industryProfile?.previousCredits) },
            { label: "LinkedIn", value: user?.industryProfile?.linkedInUrl },
            { label: "IMDb", value: user?.industryProfile?.imdbUrl },
            { label: "Portfolio / Other URL", value: user?.industryProfile?.otherUrl },
            { label: "Instagram", value: investorSocialLinks?.instagram },
            { label: "Twitter", value: investorSocialLinks?.twitter },
            { label: "Facebook", value: investorSocialLinks?.facebook },
            { label: "YouTube", value: investorSocialLinks?.youtube },
            { label: "Website", value: investorSocialLinks?.website },
            { label: "Mandates Formats", value: Array.isArray(mandates?.formats) ? mandates.formats.join(", ") : "" },
            { label: "Mandates Genres", value: Array.isArray(mandates?.genres) ? mandates.genres.join(", ") : "" },
            { label: "Mandates Exclude Genres", value: Array.isArray(mandates?.excludeGenres) ? mandates.excludeGenres.join(", ") : "" },
            { label: "Mandates Hooks", value: Array.isArray(mandates?.specificHooks) ? mandates.specificHooks.join(", ") : "" },
        ];

        const budgetRange = user?.preferences?.budgetRange;
        const readerRows = [
            { label: "Preferred Genres", value: Array.isArray(user?.preferences?.genres) ? user.preferences.genres.join(", ") : "" },
            { label: "Preferred Content Types", value: Array.isArray(user?.preferences?.contentTypes) ? user.preferences.contentTypes.join(", ") : "" },
            {
                label: "Budget Preference",
                value:
                    budgetRange && (budgetRange.min != null || budgetRange.max != null)
                        ? `${budgetRange.min ?? 0} - ${budgetRange.max ?? 0}`
                        : "",
            },
            {
                label: "Favorite Scripts",
                value: Array.isArray(user?.favoriteScripts) ? String(user.favoriteScripts.length) : "",
            },
            {
                label: "Scripts Read",
                value: Array.isArray(user?.scriptsRead) ? String(user.scriptsRead.length) : "",
            },
        ];

        const displayRowValue = (value) => {
            if (value === 0 || value === false) return String(value);
            const text = String(value ?? "").trim();
            return text || "-";
        };

        const sectionClass = `rounded-xl border p-4 border-[var(--ad-line)] bg-[var(--ad-surface-2)]`;

        return (
            <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
                <div className={`w-full max-w-3xl mx-4 rounded-2xl border max-h-[88vh] overflow-hidden ${isDark ? "bg-[#1a1616] border-[#2e2828]" : "bg-white border-gray-200"}`} onClick={(e) => e.stopPropagation()}>
                    <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? "border-[#2e2828]" : "border-gray-200"}`}>
                        <div>
                            <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>User Full Profile</h3>
                            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Writer / Investor complete details for admin review</p>
                        </div>
                        <button onClick={onClose} className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${isDark ? "text-gray-300 hover:bg-white/[0.08]" : "text-gray-600 hover:bg-gray-100"}`}>Close</button>
                    </div>

                    <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(88vh-74px)]">
                        <div className={sectionClass}>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Admin Actions</p>
                            <div className="flex flex-wrap items-center gap-2">
                                {isWriterRole && !isUserDeleted && (
                                    <>
                                        <button
                                            onClick={() => handleGrantWriterPlan(user, "gold")}
                                            disabled={userActionLoading === `grant-writer-plan-${user._id}`}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#d4af37] hover:text-[#aa801a] hover:bg-[#d4af37]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {userActionLoading === `grant-writer-plan-${user._id}` ? "Granting..." : "Grant Gold Plan"}
                                        </button>
                                        <button
                                            onClick={() => handleGrantWriterPlan(user, "silver")}
                                            disabled={userActionLoading === `grant-writer-plan-${user._id}`}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-gray-300 hover:bg-gray-400/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {userActionLoading === `grant-writer-plan-${user._id}` ? "Granting..." : "Grant Silver Plan"}
                                        </button>
                                    </>
                                )}
                                {["film_industry_professional", "investor", "director", "producer"].includes(user.role) && !isUserDeleted && (
                                    <button
                                        onClick={() => handleGrantFipPlan(user)}
                                        disabled={userActionLoading === `grant-fip-plan-${user._id}`}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#0e7490] hover:text-[#155e75] hover:bg-[#0e7490]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {userActionLoading === `grant-fip-plan-${user._id}` ? "Granting..." : "Grant 1-Year FIP Plan"}
                                    </button>
                                )}
                                {!isUserDeleted && normalizedRole !== "admin" && (
                                    <button
                                        onClick={() => handleFinanceRoleToggle(user, normalizedRole !== "finance")}
                                        disabled={userActionLoading === `finance-${user._id}`}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {userActionLoading === `finance-${user._id}`
                                            ? "Updating..."
                                            : normalizedRole === "finance" ? "Remove Finance Access" : "Grant Finance Access"}
                                    </button>
                                )}
                                {!isUserFrozen && !isUserDeleted && (
                                    <button
                                        onClick={() => handleFreezeToggleUser(user, true)}
                                        disabled={freezeLoading}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                    >
                                        {freezeLoading ? "Freezing..." : "Freeze Account"}
                                    </button>
                                )}
                                {isUserFrozen && !isUserDeleted && (
                                    <button
                                        onClick={() => handleFreezeToggleUser(user, false)}
                                        disabled={unfreezeLoading}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                    >
                                        {unfreezeLoading ? "Unfreezing..." : "Unfreeze Account"}
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDeleteUserAccount(user)}
                                    disabled={isUserDeleted || deleteLoading}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                >
                                    {isUserDeleted ? "Deleted" : deleteLoading ? "Deleting..." : "Delete Account"}
                                </button>
                                <button
                                    onClick={() => handleLoginAs(user?._id)}
                                    disabled={isUserDeleted || isUserFrozen}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#a83a4d] hover:text-[#e79aa6] hover:bg-[#a83a4d]/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                >
                                    Login As User
                                </button>
                            </div>
                        </div>

                        <div className={sectionClass}>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Basic Info</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {detailRows.map((row) => (
                                    <div key={row.label}>
                                        <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-500"}`}>{row.label}</p>
                                        <p className={`text-sm mt-0.5 break-words ${isDark ? "text-gray-200" : "text-gray-800"}`}>{displayRowValue(row.value)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {isWriterRole && (
                            <div className={sectionClass}>
                                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Writer Profile</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {writerRows.map((row) => (
                                        <div key={row.label}>
                                            <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-500"}`}>{row.label}</p>
                                            <p className={`text-sm mt-0.5 break-words ${isDark ? "text-gray-200" : "text-gray-800"}`}>{displayRowValue(row.value)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(wgaVerification?.requested || swaVerification?.requested) && (
                            <div className={sectionClass}>
                                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Membership Verification Review</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {[
                                        { key: "wga", label: "WGA", verification: wgaVerification, approveLoading: wgaApproveLoading, rejectLoading: wgaRejectLoading },
                                        { key: "swa", label: "SWA", verification: swaVerification, approveLoading: swaApproveLoading, rejectLoading: swaRejectLoading },
                                    ]
                                        .filter((item) => item.verification?.requested)
                                        .map((item) => {
                                            const status = String(item.verification?.status || "not_submitted");
                                            const submittedAt = item.verification?.submittedAt
                                                ? new Date(item.verification.submittedAt).toLocaleString()
                                                : "-";
                                            const reviewedAt = item.verification?.reviewedAt
                                                ? new Date(item.verification.reviewedAt).toLocaleString()
                                                : "-";
                                            const isPending = status === "pending";

                                            return (
                                                <div key={item.key} className={`rounded-lg border p-3 border-[var(--ad-line)] bg-[var(--ad-surface-2)]`}>
                                                    <p className={`text-sm font-bold ${isDark ? "text-gray-100" : "text-gray-900"}`}>{item.label} Membership</p>
                                                    <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Status: <span className="font-semibold">{status}</span></p>
                                                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Submitted: {submittedAt}</p>
                                                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Reviewed: {reviewedAt}</p>

                                                    {item.verification?.adminNote && (
                                                        <p className={`text-xs mt-2 ${isDark ? "text-amber-300" : "text-amber-700"}`}>Admin note: {item.verification.adminNote}</p>
                                                    )}

                                                    {(item.verification?.proofFileName || item.verification?.proofPublicId || item.verification?.proofUrl) ? (
                                                        <a
                                                            href={`#${item.key}-proof`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(event) => handleOpenMembershipProof(event, user._id, item.key)}
                                                            className="inline-flex mt-2 text-xs font-bold text-[#a83a4d] hover:text-[#e79aa6]"
                                                        >
                                                            View uploaded proof
                                                        </a>
                                                    ) : (
                                                        <p className={`text-xs mt-2 ${isDark ? "text-red-300" : "text-red-600"}`}>No proof uploaded</p>
                                                    )}

                                                    {isPending && (
                                                        <div className="flex items-center gap-2 mt-3">
                                                            <button
                                                                onClick={() => handleReviewWriterMembership(user._id, item.key, "approve")}
                                                                disabled={item.approveLoading || item.rejectLoading}
                                                                className="px-2.5 py-1.5 rounded-md text-xs font-bold text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {item.approveLoading ? "Approving..." : "Approve"}
                                                            </button>
                                                            <button
                                                                onClick={() => handleReviewWriterMembership(user._id, item.key, "reject")}
                                                                disabled={item.approveLoading || item.rejectLoading}
                                                                className="px-2.5 py-1.5 rounded-md text-xs font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {item.rejectLoading ? "Rejecting..." : "Reject"}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        )}

                        {isReaderRole && (
                            <div className={sectionClass}>
                                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Reader Profile</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {readerRows.map((row) => (
                                        <div key={row.label}>
                                            <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-500"}`}>{row.label}</p>
                                            <p className={`text-sm mt-0.5 break-words ${isDark ? "text-gray-200" : "text-gray-800"}`}>{displayRowValue(row.value)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isInvestorRole && (
                            <div className={sectionClass}>
                                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Investor / Industry Profile</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {investorRows.map((row) => (
                                        <div key={row.label}>
                                            <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-500"}`}>{row.label}</p>
                                            <p className={`text-sm mt-0.5 break-words ${isDark ? "text-gray-200" : "text-gray-800"}`}>{displayRowValue(row.value)}</p>
                                        </div>
                                    ))}
                                </div>

                                {notableCreditAttachments.length > 0 && (
                                    <div className={`mt-4 pt-3 border-t ${isDark ? "border-[#2e2828]" : "border-gray-200"}`}>
                                        <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                            Notable Credit Attachments ({notableCreditAttachments.length})
                                        </p>
                                        <div className="space-y-1.5">
                                            {notableCreditAttachments.map((file, index) => (
                                                <a
                                                    key={`${file?.publicId || file?.url || "credit-file"}-${index}`}
                                                    href={file?.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(event) => handleOpenAdminAttachment(event, file)}
                                                    className={`block text-sm break-all underline underline-offset-2 ${isDark ? "text-[#e79aa6] hover:text-[#e79aa6]" : "text-[#a83a4d] hover:text-[#a83a4d]"}`}
                                                >
                                                    {openingAttachmentKey === String(file?.publicId || file?.url || "")
                                                        ? "Opening..."
                                                        : (file?.fileName || `Attachment ${index + 1}`)}
                                                    {file?.mimeType ? ` (${file.mimeType})` : ""}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };


    // Everything the extracted section panels reach through useAdminDashboard(). Built from the
    // measured usage of each panel at extraction time — extend it when a section needs a new name.
    // Sidebar model for AdminShell: the real TABS with live badge counts. Recomputed per render
    // so a pending-approvals badge updates the moment its count does — exactly as the old
    // hand-rolled sidebar behaved.
    const navGroups = [
        ...groupNavItems(ADMIN_NAV_GROUPS, TABS.map((tab) => ({
            ...tab,
            badge: getBadgeCountForTab(tab.key) > 0 ? formatBadgeCount(getBadgeCountForTab(tab.key)) : null,
        }))),
        // The pending-bank-review badge stays HERE even though the section left, so an admin still sees
        // the signal where they already watch for it — and the link lands them where they can act.
        {
            title: "Money",
            items: [{
                ...FINANCE_LINK,
                badge: getBadgeCountForTab("bank-reviews") > 0
                    ? formatBadgeCount(getBadgeCountForTab("bank-reviews"))
                    : null,
            }],
        },
    ];

    const dashboardContextValue = {
        search,
        activeMessageUser,
        activeTab,
        adminConversations,
        filteredContacts,
        filteredDeletedFilmProfessionals,
        filteredDeletedWriters,
        filteredInvoices,
        filteredMembershipReviews,
        filteredMessageUsers,
        filteredPendingInvestors,
        filteredScripts,
        filteredTransactions,
        filteredUsers,
        fetchAllTabData,
        handleAdminAttachmentChange,
        handleAdminMessageScroll,
        handleAdminTrailerFileChange,
        handleGrantWriterPlan,
        handleOpenMembershipProof,
        handleOpenTrailerUpload,
        handlePickMessageAttachment,
        handleRemovePremiumFromUser,
        handleReviewWriterMembership,
        handleSendAdminMessage,
        handleSendTrailerToWriter,
        directBroadcastAttachments,
        directBroadcastContent,
        directBroadcastLink,
        directBroadcastTitle,
        directUserEmail,
        hasSearch,
        isDark,
        messageAttachment,
        messageFileInputRef,
        messageList,
        messageListContainerRef,
        messageListEndRef,
        messageText,
        messageUsers,
        messagesLoading,
        openTrailerRequirements,
        openWriterConversation,
        page,
        scrollAdminMessagesToBottom,
        setMessageAttachment,
        setMessageText,
        setPage,
        setSelectedUserDetail,
        showAdminScrollToBottomButton,
        stats,
        total,
        totalPages,
        trailerFileInputRef,
        uploadingMessageAttachment,
        uploadingTrailerScriptId,
        userActionLoading,
        analyticsAnonymousDetail,
        analyticsAnonymousDetailLoading,
        analyticsData,
        analyticsRegisteredSearch,
        analyticsRegisteredStatusFilter,
        analyticsSection,
        analyticsUserDetail,
        analyticsUserDetailLoading,
        deletingScriptId,
        discountCodeModal,
        discountCodes,
        fetchAnalyticsAnonymousDetail,
        fetchAnalyticsUserDetail,
        fetchData,
        filmBroadcastContent,
        filmBroadcastLink,
        filmBroadcastTitle,
        handleApprove,
        handleRestoreScript,
        handleDeleteDiscountCode,
        handleDeleteProject,
        handleDeleteUserAccount,
        handleFreezeToggleUser,
        handleGrantPremiumToUser,
        handleReject,
        handleRemoveTrailer,
        handleSaveDiscountCode,
        handleSendAudienceBroadcast,
        loading,
        meetings,
        scoreSubTab,
        scriptBroadcastContent,
        scriptBroadcastLink,
        scriptBroadcastTitle,
        setAnalyticsAnonymousDetail,
        setAnalyticsRegisteredSearch,
        setAnalyticsRegisteredStatusFilter,
        setAnalyticsSection,
        setAnalyticsUserDetail,
        setDiscountCodeModal,
        setDirectBroadcastAttachments,
        setDirectBroadcastContent,
        setDirectBroadcastLink,
        setDirectBroadcastTitle,
        setDirectUserEmail,
        setFilmBroadcastContent,
        setFilmBroadcastLink,
        setFilmBroadcastTitle,
        setScoreModal,
        setScoreSubTab,
        setScriptBroadcastContent,
        setScriptBroadcastLink,
        setScriptBroadcastTitle,
        setWriterBroadcastContent,
        setWriterBroadcastLink,
        setWriterBroadcastTitle,
        writerBroadcastContent,
        writerBroadcastLink,
        writerBroadcastTitle,
    };

    return (
        <AdminDashboardContext.Provider value={dashboardContextValue}>
        <>
        <AdminShell
            groups={navGroups}
            activeKey={activeTab}
            onNavigate={handleTabChange}
            crumbs={[TABS.find((tab) => tab.key === activeTab)?.label || "Overview"]}
            searchValue={searchInput}
            onSearchChange={(event) => setSearchInput(event.target.value)}
            searchPlaceholder={SEARCH_PLACEHOLDER_BY_TAB[activeTab] || "Search current section..."}
            defaultTheme="dark"
            headerActions={(
                <>
                    <a href="/admin/agreements" className="adsh-item" style={{ width: "auto" }}>Agreements</a>
                    <DownloadIconButton
                        onClick={handleDownloadCurrentSectionPdf}
                        disabled={loading || exportingCurrent}
                        title={exportingCurrent ? "Preparing section PDF..." : "Download This Section PDF"}
                    />
                    <DownloadIconButton
                        onClick={handleDownloadWholeDashboardPdf}
                        disabled={exportingAll}
                        title={exportingAll ? "Preparing full dashboard PDF..." : "Download Complete Dashboard PDF"}
                    />
                    <button type="button" onClick={handleLogout} className="adsh-item" style={{ width: "auto" }}>
                        Exit Admin
                    </button>
                </>
            )}
        >
            {renderContent()}
        </AdminShell>

            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-[300] animate-[slideUp_0.3s_ease-out]">
                    <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border backdrop-blur-sm ${toast.type === "error"
                        ? "bg-red-500/90 border-red-400/30 text-white"
                        : toast.type === "info"
                            ? "bg-[#a83a4d]/90 border-[#a83a4d]/30 text-white"
                        : "bg-emerald-500/90 border-emerald-400/30 text-white"
                        }`}>
                        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d={
                                toast.type === "error"
                                    ? "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                                    : toast.type === "info"
                                        ? "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    : "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            } />
                        </svg>
                        <span className="text-sm font-semibold">{toast.message}</span>
                        <button onClick={() => setToast(null)} className="ml-2 text-white/70 hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Score Modal */}
            {scoreModal && <ScoreModal script={scoreModal} isDark={true} onClose={() => setScoreModal(null)} onSave={handleScore} />}

            {/* Reject Investor Modal */}
            {rejectModal && <RejectInvestorModal investor={rejectModal} onClose={() => setRejectModal(null)} onConfirm={handleRejectInvestor} isDark={isDark} />}

            {/* User Details Modal */}
            {selectedUserDetail && <UserDetailsModal user={selectedUserDetail} onClose={() => setSelectedUserDetail(null)} />}

        <ConfirmDialog
            open={showLogoutConfirm}
            title="Exit admin mode"
            message="Are you sure you want to log out from admin mode?"
            confirmText="Exit"
            cancelText="Cancel"
            onConfirm={confirmLogout}
            onCancel={() => setShowLogoutConfirm(false)}
            isDarkMode={true}
        />

        {adminDialog && (
            <div className="fixed inset-0 z-[10060] flex items-center justify-center px-4" onClick={() => closeAdminDialog(null)}>
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <div
                    className="relative w-[min(94vw,460px)] rounded-2xl border border-[#2e2828] bg-[#1a1616] p-5 text-white shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <p className="text-base font-bold">{adminDialog.title}</p>
                    <p className="mt-1.5 text-sm text-gray-300 leading-relaxed">{adminDialog.message}</p>

                    {adminDialog.type === "prompt" && (
                        adminDialog.multiline ? (
                            <textarea
                                autoFocus
                                value={adminDialog.value}
                                onChange={(event) => setAdminDialog((prev) => ({ ...prev, value: event.target.value }))}
                                rows={4}
                                placeholder={adminDialog.placeholder}
                                className="mt-3 w-full rounded-xl border border-[var(--ad-line-2)] bg-[var(--ad-surface-2)] px-3 py-2.5 text-sm text-[var(--ad-ink)] placeholder:text-[var(--ad-ink-3)] outline-none focus:border-[var(--ad-accent)]"
                            />
                        ) : (
                            <input
                                autoFocus
                                type={adminDialog.inputType || "text"}
                                value={adminDialog.value}
                                onChange={(event) => setAdminDialog((prev) => ({ ...prev, value: event.target.value }))}
                                placeholder={adminDialog.placeholder}
                                className="mt-3 w-full rounded-xl border border-[var(--ad-line-2)] bg-[var(--ad-surface-2)] px-3 py-2.5 text-sm text-[var(--ad-ink)] placeholder:text-[var(--ad-ink-3)] outline-none focus:border-[var(--ad-accent)]"
                            />
                        )
                    )}

                    {adminDialog.type === "select" && (
                        <select
                            autoFocus
                            value={adminDialog.value}
                            onChange={(event) => setAdminDialog((prev) => ({ ...prev, value: event.target.value }))}
                            className="mt-3 w-full rounded-xl border border-[var(--ad-line-2)] bg-[var(--ad-surface-2)] px-3 py-2.5 text-sm text-[var(--ad-ink)] outline-none focus:border-[var(--ad-accent)]"
                        >
                            {adminDialog.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    )}

                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => closeAdminDialog(null)}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:bg-white/10"
                        >
                            {adminDialog.cancelText || "Cancel"}
                        </button>
                        <button
                            type="button"
                            onClick={() => closeAdminDialog(adminDialog.type === "prompt" || adminDialog.type === "select" ? adminDialog.value : true)}
                            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#7a2233] text-white hover:bg-[#2a4b77]"
                        >
                            {adminDialog.confirmText || "Confirm"}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {trailerRequirementsModal && (
            <div
                className="fixed inset-0 z-[10055] flex items-center justify-center px-4"
                onClick={() => setTrailerRequirementsModal(null)}
            >
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <div
                    className="relative w-[min(94vw,560px)] rounded-2xl border border-[#2e2828] bg-[#1a1616] p-5 text-white shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-base font-bold">Trailer Requirements</p>
                            <p className="mt-1.5 text-sm text-gray-300 leading-relaxed">
                                {trailerRequirementsModal?.title || "Selected script"} by {trailerRequirementsModal?.creator?.name || "the creator"}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setTrailerRequirementsModal(null)}
                            className="text-gray-400 hover:text-white transition-colors"
                            aria-label="Close requirements modal"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {(() => {
                        const parsed = parseTrailerRequestNote(trailerRequirementsModal?.trailerWriterFeedback?.note);
                        const summary = parsed?.fields || {};
                        return (
                            <div className="mt-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-[var(--ad-line)] bg-[var(--ad-surface-2)] px-4 py-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Duration</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{summary.duration || "Not set"}</p>
                                    </div>
                                    <div className="rounded-xl border border-[var(--ad-line)] bg-[var(--ad-surface-2)] px-4 py-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Quality</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{summary.quality || "Not set"}</p>
                                    </div>
                                    <div className="rounded-xl border border-[var(--ad-line)] bg-[var(--ad-surface-2)] px-4 py-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Layout</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{summary.layout || "Not set"}</p>
                                    </div>
                                    <div className="rounded-xl border border-[var(--ad-line)] bg-[var(--ad-surface-2)] px-4 py-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Payment</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{summary.price || "Not set"}</p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-[var(--ad-line)] bg-[var(--ad-surface-2)] px-4 py-3">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Request Note</p>
                                    <p className="mt-2 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                                        {parsed?.text || "No request note available."}
                                    </p>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        )}
        </>
        </AdminDashboardContext.Provider>
    );
};

export default AdminDashboard;


