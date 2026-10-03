import { useDeferredValue, useEffect, useState, useContext, useRef, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";
import { useAuthModal } from "../context/AuthModalContext";
import { useDarkMode } from "../context/DarkModeContext";
import ProjectCard from "../components/ProjectCard";
import EditProfileModal from "../components/EditProfileModal";
import BankDetails from "../components/BankDetails";
import Transactions from "../components/Transactions";
import GoogleCalendarCard from "../components/GoogleCalendarCard";
import CurrencyToggle from "../components/CurrencyToggle";
import CompetitionAchievements from "../components/competition/CompetitionAchievements";
import SocialShareButton from "../components/SocialShareButton";
import ProfileCompletionBanner from "../components/ProfileCompletionBanner";
import PasswordInput from "../components/PasswordInput";
import { applyLanguagePreference, getBackendLanguageValue, getProfileLanguageValue } from "../utils/languagePreference";
import { getProfileCanonicalPath } from "../utils/profilePath";
import {
  hasActiveFilmIndustryProfessionalAccess,
  hasAnyFipAccess,
  getRemainingContacts,
  getContactsLimit,
  getRevealedContactCount,
  hasRevealedContact,
  hasReachedContactLimit,
} from "../utils/industryAccess";
import PremiumModelBadge from "../components/PremiumModelBadge";
import WriterModelBadge from "../components/WriterModelBadge";
import {
  ProfilePcPage,
  ProfilePcSkeleton,
  ProfileWorkspaceActivity,
  ProfileWorkspaceBookmarks,
  ProfileWorkspaceMeetings,
  ProfileWorkspaceCredentials,
  ProfileWorkspaceIdentity,
  ProfileWorkspaceOverview,
  ProfileWorkspaceProjects,
  createLatestProfileRequestCoordinator,
  isSameProfile,
  isWriterProfileRole,
} from "../features/profile-pc";
import {
  getAuthenticatedProfile,
  getPitchableScripts,
  revealProfileContact,
  sendProfilePitch,
  sendProfileMessage,
  toggleProfileBlock,
  updateProfileFollow,
} from "./profile/authenticatedProfile";
import {
  changeAccountEmail,
  changeAccountPassword,
  deleteOwnAccount,
  loadAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
  sendAccountEmailVerification,
  unblockAccountUser,
  updateAccountSettings,
  verifyAccountEmail,
} from "./profile/accountSecurity";
import {
  PROFILE_COLLECTION_STATUS,
  readProfileCollectionLocation,
  removeSavedProjectFromViewer,
  writeProfileCollectionLocation,
} from "./profile/profileCollections";
import { useProfileCollections } from "./profile/useProfileCollections";

/* â”€â”€ Helper components â”€â”€ */

const SectionCard = ({ title, icon, badge, dark, noBox, children }) => (
  <div
    className={`profile-workspace-section-card ${noBox ? "" : `rounded-2xl p-4 sm:p-6 border transition-colors ${dark
      ? "bg-[#0d1520] border-white/[0.06]"
      : "bg-white border-gray-200/70 shadow-sm"
      }`}`}
  >
    <div className="profile-workspace-section-card__header flex items-center gap-2.5 mb-4">
      <div
        className={`profile-workspace-section-card__icon w-7 h-7 rounded-lg flex items-center justify-center ${dark
          ? "bg-white/[0.05] text-white/40"
          : "bg-[#1e3a5f]/[0.06] text-[#1e3a5f]/60"
          }`}
      >
        {icon}
      </div>
      <h3
        className={`profile-workspace-section-card__title text-[16px] font-bold ${dark ? "text-white/70" : "text-gray-800"
          }`}
      >
        {title}
      </h3>
      {badge && (
        <span
          className={`profile-workspace-section-card__badge ml-auto text-[13px] font-medium ${dark ? "text-white/25" : "text-gray-400"
            }`}
        >
          {badge}
        </span>
      )}
    </div>
    {children}
  </div>
);

const resolveProfileTab = ({ search = "", profile, viewer, scripts = [], purchasedScripts = [] } = {}) => {
  const requested = new URLSearchParams(search).get("tab");
  if (!profile) return requested || "projects";
  const role = String(profile.role || "").toLowerCase();
  const writer = ["writer", "creator"].includes(role);
  const own = isSameProfile(viewer, profile);
  const allowed = new Set([
    "about",
    "activity",
    ...(role !== "investor" ? ["projects"] : []),
    ...(writer ? ["credentials"] : []),
    ...(writer && Array.isArray(profile.badges) && profile.badges.length ? ["achievements"] : []),
    ...(own ? ["bookmarks", "meetings", "settings"] : []),
    ...(own && purchasedScripts.length ? ["purchases"] : []),
    ...(own && profile.featureFlags?.financialAnalytics ? ["performance"] : []),
  ]);
  if (allowed.has(requested)) return requested;
  return role === "investor" || writer ? "about" : scripts.length ? "projects" : "about";
};

const InfoRow = ({ label, value, dark }) => (
  <div className="flex items-start justify-between gap-3 max-[640px]:flex-col max-[640px]:items-start">
    <span className={`text-[15px] ${dark ? "text-white/35" : "text-gray-400"}`}>
      {label}
    </span>
    <span
      className={`text-[15px] font-semibold capitalize text-right max-[420px]:text-left break-words [overflow-wrap:anywhere] ${dark ? "text-white/65" : "text-gray-700"
        }`}
    >
      {value}
    </span>
  </div>
);

const INDUSTRY_SUB_ROLE_LABELS = {
  producer: "Producer",
  director: "Director",
  executive_producer: "Executive Producer",
  line_producer: "Line Producer",
  showrunner: "Showrunner",
  development_executive: "Development Executive",
  studio_executive: "Studio Executive",
  agent: "Agent",
  actor: "Actor",
  other: "Other",
};

const formatIndustrySubRole = (value = "", otherValue = "") => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return "";
  if (normalized === "other") {
    const custom = String(otherValue || "").trim();
    return custom ? `Other (${custom})` : "Other";
  }
  if (INDUSTRY_SUB_ROLE_LABELS[normalized]) return INDUSTRY_SUB_ROLE_LABELS[normalized];
  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const normalizePublicShareUrl = (rawUrl = "", fallbackUrl = "") => {
  const candidate = String(rawUrl || fallbackUrl || "").trim();
  if (!candidate) return "";
  if (candidate.includes("/share/profile/") || candidate.includes("/share/project/")) return candidate;
  return candidate
    .replace(/\/profile\/([^/?#]+)/i, "/share/profile/$1")
    .replace(/\/script\/([^/?#]+)/i, "/share/project/$1");
};

/* â”€â”€ DeleteProjectButton â”€â”€ */
const DeleteProjectButton = ({ dark, onConfirm, title }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowConfirm(true); }}
        title="Delete project"
        className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-200 ${dark
          ? "bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20"
          : "bg-red-50 text-red-500 hover:bg-red-100 border border-red-200"
          }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className={`rounded-2xl shadow-2xl max-w-sm w-full p-6 border ${dark ? "bg-[#0d1520] border-white/[0.06]" : "bg-white border-gray-200"
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`w-11 h-11 mx-auto rounded-2xl flex items-center justify-center mb-4 ${dark ? "bg-red-500/10" : "bg-red-50"
              }`}>
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <h3 className={`text-[15px] font-extrabold text-center mb-1 ${dark ? "text-white" : "text-gray-900"
              }`}>Delete Project?</h3>
            <p className={`text-[13px] text-center mb-1 ${dark ? "text-neutral-400" : "text-gray-500"
              }`}>
              <span className={`font-semibold ${dark ? "text-neutral-200" : "text-gray-800"}`}>{title}</span> will be removed from your profile and listings.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${dark ? "bg-white/[0.07] text-neutral-400 hover:bg-white/[0.12]" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
              >Cancel</button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Deleting...</>
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const Profile = () => {
  const isWriter = isWriterProfileRole;
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, setUser, logout } = useContext(AuthContext);
  const { openPricingModal, openProducerOnboarding } = useAuthModal();
  const { isDarkMode: dark } = useDarkMode();

  const [profile, setProfile] = useState(null);
  const [scripts, setScripts] = useState([]);
  const [deletedScripts, setDeletedScripts] = useState([]);
  const [purchasedScripts, setPurchasedScripts] = useState([]);
  const [bookmarkedScripts, setBookmarkedScripts] = useState([]);
  const [savedQuery, setSavedQuery] = useState("");
  const [savedSort, setSavedSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowsMe, setIsFollowsMe] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followRequestPending, setFollowRequestPending] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMessageRequestModal, setShowMessageRequestModal] = useState(false);
  const [messageRequestText, setMessageRequestText] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [connectionsType, setConnectionsType] = useState("followers");
  const [showContactDetails, setShowContactDetails] = useState(false);
  const [contactRevealLoading, setContactRevealLoading] = useState(false);
  const [contactRevealError, setContactRevealError] = useState("");
  const [revealedProfileContact, setRevealedProfileContact] = useState(null);
  const [contactRevealStats, setContactRevealStats] = useState(null);
  const messageTextareaRef = useRef(null);
  
  // Pitch
  const [showPitchModal, setShowPitchModal] = useState(false);
  const [myScripts, setMyScripts] = useState([]);
  const [pitchData, setPitchData] = useState({ scriptId: "", note: "", duration: "", date: "", time: "" });
  const [sendingPitch, setSendingPitch] = useState(false);
  const [pitchSuccess, setPitchSuccess] = useState(false);

  // Settings state
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsErr, setSettingsErr] = useState("");
  const [isBlockedByCurrent, setIsBlockedByCurrent] = useState(false);
  const [blockedByProfile, setBlockedByProfile] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockingAction, setBlockingAction] = useState(false);
  const [emailForm, setEmailForm] = useState({ password: "", newEmail: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [sendingVerificationCode, setSendingVerificationCode] = useState(false);
  const [verifyingEmailCode, setVerifyingEmailCode] = useState(false);
  const [verificationCodeSent, setVerificationCodeSent] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountReason, setDeleteAccountReason] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [profileAccessMessage, setProfileAccessMessage] = useState("");
  const [profileAccessId, setProfileAccessId] = useState("");
  const [profileRequiresBusinessEmail, setProfileRequiresBusinessEmail] = useState(false);
  const profileRequestRef = useRef(null);
  if (!profileRequestRef.current) {
    profileRequestRef.current = createLatestProfileRequestCoordinator();
  }
  const profileSearchRef = useRef(location.search);
  profileSearchRef.current = location.search;
  const bookmarkRefreshTimerRef = useRef(null);
  const ownLoadedProfile = isSameProfile(currentUser, profile);
  const activeTab = resolveProfileTab({ search: location.search, profile, viewer: currentUser, scripts, purchasedScripts });
  const collectionLocation = readProfileCollectionLocation(location.search, { own: ownLoadedProfile });
  const urlTab = new URLSearchParams(location.search).get("tab");
  const collectionSection = activeTab === "bookmarks" ? "bookmarks" : "activity";
  const collectionPage = urlTab === activeTab && ["activity", "bookmarks"].includes(activeTab)
    ? collectionLocation.page
    : 1;
  const deferredSavedQuery = useDeferredValue(savedQuery);
  const profileCollections = useProfileCollections({
    profileId: profile?._id,
    section: collectionSection,
    page: collectionPage,
    query: collectionSection === "bookmarks" ? deferredSavedQuery : "",
    sort: collectionSection === "bookmarks" ? savedSort : "recent",
    enabled: Boolean(profile?._id),
  });
  const reloadProfileCollections = profileCollections.reload;

  const fetchProfile = useCallback(async ({ silent = false } = {}) => {
    const profileId = id || currentUser?._id;
    if (!profileId) return;

    const { requestId, controller } = profileRequestRef.current.begin();

    try {
      if (!silent) {
        setLoading(true);
        setProfileAccessMessage("");
        setProfileRequiresBusinessEmail(false);
      }

      const result = await getAuthenticatedProfile({
        profileKey: profileId,
        viewer: { _id: currentUser?._id, role: currentUser?.role },
        signal: controller.signal,
      });
      if (result.cancelled) return;
      if (!result.ok) throw result.cause || new Error(result.message);
      const data = {
        user: result.data.profile,
        scripts: result.data.scripts,
        deletedScripts: result.data.deletedScripts,
        purchasedScripts: result.data.purchasedScripts,
        bookmarkedScripts: result.data.bookmarkedScripts,
      };
      if (!profileRequestRef.current.isCurrent(requestId)) return;
      const canonicalProfilePath = result.data.canonicalPath;
      if (canonicalProfilePath && canonicalProfilePath !== location.pathname) {
        navigate(`${canonicalProfilePath}${profileSearchRef.current}`, { replace: true });
      }
      setProfileAccessMessage("");
      setProfileAccessId("");
      setProfile(data.user);
      setScripts((data.scripts || []).filter((s) => s.status !== "draft" && !s.isDeleted));
      setDeletedScripts(data.deletedScripts || []);
      setPurchasedScripts(data.purchasedScripts || []);
      setBookmarkedScripts(data.bookmarkedScripts || []);
      setBlockedUsers(Array.isArray(data.user.blockedUsers) ? data.user.blockedUsers : []);
      setIsBlockedByCurrent(Boolean(data.user.blockedByCurrent));
      setBlockedByProfile(Boolean(data.user.blockedByProfile));
      const followers = Array.isArray(data.user?.followers) ? data.user.followers : [];
      setIsFollowing(followers.some((f) => (f?._id || f) === currentUser?._id));
      const following = Array.isArray(data.user?.following) ? data.user.following : [];
      setIsFollowsMe(following.some((f) => (f?._id || f) === currentUser?._id));
      setFollowRequestPending(Boolean(data.user?.followRequestPending));

    } catch (error) {
      if (controller.signal.aborted || error?.code === "ERR_CANCELED") return;
      if (!profileRequestRef.current.isCurrent(requestId)) return;
      const status = error?.response?.status;
      const serverMessage = error?.response?.data?.message;
      const isPrivateAccount = Boolean(error?.response?.data?.privateAccount);
      const isBlockedView = Boolean(error?.response?.data?.blockedByProfile);
      const requiresBusinessEmail = Boolean(error?.response?.data?.requiresBusinessEmail);
      setProfileAccessId(String(error?.response?.data?.profileId || ""));

      if (status === 403 && requiresBusinessEmail) {
        setProfile(null);
        setProfileRequiresBusinessEmail(true);
        setProfileAccessMessage(serverMessage || "You need a business email or a plan to view this profile.");
      } else if (status === 403 && isPrivateAccount) {
        setProfile(null);
        setFollowRequestPending(Boolean(error?.response?.data?.followRequestPending));
        setProfileAccessMessage(serverMessage || "This account is private.");
      } else if (status === 403 && isBlockedView) {
        setProfile(null);
        setProfileAccessMessage(serverMessage || "This user has blocked you.");
      } else if (status === 404) {
        setProfile(null);
        setProfileAccessMessage("User not found");
      } else {
        setProfile(null);
        setProfileAccessMessage("Unable to load profile right now.");
      }
      console.error("Error fetching profile:", error);
    } finally {
      if (profileRequestRef.current.isCurrent(requestId)) {
        profileRequestRef.current.finish(requestId);
        if (!silent) setLoading(false);
      }
    }
  }, [id, currentUser?._id, currentUser?.role, location.pathname, navigate]);

  useEffect(() => {
    fetchProfile();
    return () => {
      profileRequestRef.current.cancel();
    };
  }, [fetchProfile]);

  useEffect(() => {
    const routeProfileKey = String(id || "").trim().toLowerCase();
    const currentUserId = String(currentUser?._id || "").trim().toLowerCase();
    const currentUserUsername = String(currentUser?.writerProfile?.username || "").trim().toLowerCase();
    const isOwnView = !id || routeProfileKey === currentUserId || (currentUserUsername && routeProfileKey === currentUserUsername);
    if (!isOwnView) return undefined;

    const refreshBookmarks = () => {
      if (bookmarkRefreshTimerRef.current) {
        clearTimeout(bookmarkRefreshTimerRef.current);
      }
      bookmarkRefreshTimerRef.current = setTimeout(() => {
        reloadProfileCollections();
      }, 250);
    };

    window.addEventListener("bookmarkUpdated", refreshBookmarks);
    return () => {
      window.removeEventListener("bookmarkUpdated", refreshBookmarks);
      if (bookmarkRefreshTimerRef.current) {
        clearTimeout(bookmarkRefreshTimerRef.current);
      }
    };
  }, [id, currentUser?._id, currentUser?.writerProfile?.username, reloadProfileCollections]);


  const handleDeleteScript = async (scriptId) => {
    try {
      await api.delete(`/scripts/${scriptId}`);
      setScripts((prev) => {
        const deletedScript = prev.find((s) => s._id === scriptId);
        if (deletedScript) {
          setDeletedScripts((existing) => [
            { ...deletedScript, isDeleted: true, deletedAt: new Date().toISOString() },
            ...existing.filter((s) => s._id !== scriptId),
          ]);
        }
        return prev.filter((s) => s._id !== scriptId);
      });
      window.dispatchEvent(new CustomEvent("scriptDeleted", { detail: { id: scriptId } }));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleFollow = async () => {
    if (isBlockedByCurrent || blockedByProfile || followLoading) return;
    try {
      setFollowLoading(true);
      const result = await updateProfileFollow({
        profileId: profile._id,
        relationship: { isFollowing, followRequestPending, isFollowsMe },
      });
      if (!result.ok) throw result.cause || new Error(result.message);
      setIsFollowing(result.data.isFollowing);
      setFollowRequestPending(result.data.followRequestPending);
      if (isFollowing && !result.data.isFollowing) {
        setProfile({
          ...profile,
          followers: profile.followers.filter(
            (f) => f._id !== currentUser._id
          ),
        });
      } else if (!isFollowing && result.data.isFollowing) {
        setProfile({
          ...profile,
          followers: [
            ...profile.followers,
            { _id: currentUser._id, name: currentUser.name },
          ],
        });
      }
    } catch (error) {
      console.error("Error following/unfollowing:", error);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!profile?._id || blockingAction) return;
    try {
      setBlockingAction(true);
      const result = await toggleProfileBlock({
        profileId: profile._id,
        blocked: isBlockedByCurrent,
      });
      if (!result.ok) throw result.cause || new Error(result.message);
      setIsBlockedByCurrent(result.data.blocked);
      if (!result.data.blocked) {
        setSettingsMsg("User unblocked");
      } else {
        setIsFollowing(false);
        setSettingsMsg("User blocked");
      }
      setTimeout(() => setSettingsMsg(""), 2500);
    } catch (error) {
      setSettingsErr(error.response?.data?.message || error.message || "Failed to update block status");
    } finally {
      setBlockingAction(false);
    }
  };

  const handleUnblockFromSettings = async (userId) => {
    try {
      setSavingSettings(true);
      const result = await unblockAccountUser(userId);
      if (!result.ok) throw result.cause || new Error(result.message);
      setBlockedUsers((prev) => prev.filter((u) => u._id !== userId));
      setSettingsMsg("User unblocked");
      setTimeout(() => setSettingsMsg(""), 2500);
    } catch (error) {
      setSettingsErr(error.response?.data?.message || "Failed to unblock user");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleOpenPitchModal = async () => {
    setShowPitchModal(true);
    const result = await getPitchableScripts();
    if (!result.ok) {
      console.error("Error fetching user scripts:", result.cause || result.message);
      return;
    }
    setMyScripts(result.data);
    if (result.data.length > 0) {
      setPitchData(prev => ({ ...prev, scriptId: result.data[0]._id }));
    }
  };

  
  const handleDirectBooking = async () => {
    try {
      setSendingPitch(true);
      await api.post("/consultations", {
        professionalId: profile._id,
        date: pitchData.date,
        time: pitchData.time,
        duration: pitchData.duration,
        currency: pitchData.currency || "INR",
        topic: "Pitch Script",
        additionalMessage: pitchData.note
      });
      setPitchSuccess(true);
      setTimeout(() => {
        setShowPitchModal(false);
        setPitchSuccess(false);
        setPitchData({ scriptId: "", note: "", duration: "", date: "", time: "", currency: "INR" });
      }, 2000);
      setSendingPitch(false);
    } catch (err) {
      console.error("Booking Error:", err);
      alert(err.response?.data?.message || "Failed to book consultation.");
      setSendingPitch(false);
    }
  };

  const handleSendPitch = async () => {
    if (!pitchData.scriptId) return alert("Please select a script");
    
    if (pitchData.duration) {
      if (!pitchData.date || !pitchData.time) return alert("Please select a preferred date and time.");
      return handleDirectBooking();
    }
    try {
      setSendingPitch(true);
      const result = await sendProfilePitch({
        scriptId: pitchData.scriptId,
        profileId: profile._id,
        note: pitchData.note,
        duration: pitchData.duration,
        date: pitchData.date,
        time: pitchData.time
      });
      if (!result.ok) throw result.cause || new Error(result.message);
      setPitchSuccess(true);
      setTimeout(() => {
        setShowPitchModal(false);
        setPitchSuccess(false);
        setPitchData({ scriptId: "", note: "", duration: "", date: "", time: "" });
      }, 2000);
    } catch (error) {
      console.error("Error sending pitch:", error);
      alert(error.response?.data?.message || error.message || "Failed to send pitch");
    } finally {
      setSendingPitch(false);
    }
  };

  const handleSendMessageRequest = async () => {
    if (!messageRequestText.trim()) return;

    try {
      setSendingRequest(true);
      const result = await sendProfileMessage({
        profileId: profile._id,
        message: messageRequestText,
      });
      if (!result.ok) throw result.cause || new Error(result.message);
      setRequestSuccess(true);
      setTimeout(() => {
        setShowMessageRequestModal(false);
        setRequestSuccess(false);
        setMessageRequestText("");
      }, 2000);
    } catch (error) {
      console.error("Error sending message request:", error);
      alert(error.response?.data?.message || error.message || "Failed to send message request");
    } finally {
      setSendingRequest(false);
    }
  };

  const handleDeleteAccount = async () => {
    const reason = deleteAccountReason.trim();

    try {
      setDeletingAccount(true);
      setSettingsErr("");
      const result = await deleteOwnAccount(reason);
      if (!result.ok) throw result.cause || new Error(result.message);
      setShowDeleteAccountModal(false);
      setDeleteAccountReason("");
      setSettingsMsg("Account deleted successfully");
      logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setSettingsErr(error.response?.data?.message || "Failed to delete account");
    } finally {
      setDeletingAccount(false);
    }
  };

  const openConnectionsModal = (type) => {
    setConnectionsType(type);
    setShowConnectionsModal(true);
  };

  const getProfilePath = (userRef) => {
    return getProfileCanonicalPath(userRef, {
      viewerId: currentUser?._id,
      viewerRole: currentUser?.role,
    });
  };

  const handleConnectionClick = (userRef) => {
    const userId = typeof userRef === "string" ? userRef : userRef?._id;
    if (!userId) return;
    setShowConnectionsModal(false);
    navigate(getProfilePath(userRef));
  };

  const isOwnProfile = ownLoadedProfile;

  const selectProfileTab = useCallback((tab, page = 1) => {
    let params = new URLSearchParams(location.search);
    if (["activity", "bookmarks"].includes(tab)) {
      params = writeProfileCollectionLocation(params, { section: tab, page });
    } else {
      params.set("tab", tab);
      params.delete("page");
    }
    const search = params.toString();
    const target = `${location.pathname}${search ? `?${search}` : ""}`;
    if (target !== `${location.pathname}${location.search}`) navigate(target);
  }, [location.pathname, location.search, navigate]);

  const removeSavedProject = useCallback(async (projectId) => {
    const result = await profileCollections.removeSaved(projectId);
    if (!result.ok) return;
    setBookmarkedScripts((previous) => previous.filter((script) => String(script?._id) !== String(projectId)));
    setUser((current) => {
      if (!current) return current;
      const next = removeSavedProjectFromViewer(current, projectId, result.data?.source);
      try { localStorage.setItem("user", JSON.stringify(next)); } catch { /* memory state remains authoritative */ }
      return next;
    });
    window.dispatchEvent(new CustomEvent("bookmarkUpdated", {
      detail: { scriptId: projectId, bookmarked: false, source: result.data?.source },
    }));
    if (result.pageBecameEmpty) selectProfileTab("bookmarks", collectionPage - 1);
  }, [collectionPage, profileCollections, selectProfileTab, setUser]);

  const fetchSessions = useCallback(async () => {
    try {
      setLoadingSessions(true);
      const result = await loadAccountSessions();
      if (!result.ok) throw result.cause || new Error(result.message);
      setSessions(result.data);
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "settings" && isOwnProfile) {
      fetchSessions();
    }
  }, [activeTab, isOwnProfile, fetchSessions]);

  const handleRemoveSession = async (sessionId) => {
    try {
      const result = await revokeAccountSession(sessionId);
      if (!result.ok) throw result.cause || new Error(result.message);
      fetchSessions();
    } catch (error) {
      console.error("Failed to remove session:", error);
    }
  };

  const handleRemoveAllOtherSessions = async () => {
    try {
      const result = await revokeOtherAccountSessions();
      if (!result.ok) throw result.cause || new Error(result.message);
      fetchSessions();
    } catch (error) {
      console.error("Failed to remove all other sessions:", error);
    }
  };
  const isWriterUser = isWriterProfileRole(profile?.role);
  const isInvestorProfile = String(profile?.role || "").toLowerCase() === "investor";
  const viewerIsIndustryRole = ["investor", "producer", "director", "industry", "professional"].includes(
    String(currentUser?.role || "").toLowerCase()
  );
  const viewerHasProAccess = viewerIsIndustryRole && hasAnyFipAccess(currentUser);
  const canViewContactDetails = Boolean(
    !isOwnProfile &&
    currentUser?._id &&
    viewerHasProAccess &&
    profile?.allowIndustryContact !== false
  );
  // For pro-access viewers: contact reveal state
  const profileWriterId = String(profile?._id || "");
  const profileContactAlreadyRevealed = Boolean(
    revealedProfileContact ||
    (viewerHasProAccess && hasRevealedContact(currentUser, profileWriterId))
  );
  const profileRemainingContacts = contactRevealStats?.remainingContacts ?? getRemainingContacts(currentUser);
  const profileContactsLimit = contactRevealStats?.contactsLimit ?? getContactsLimit(currentUser);
  const profileContactsUsed = contactRevealStats?.contactsUsed ?? getRevealedContactCount(currentUser);
  const profileContactRevealBlocked = viewerHasProAccess && !profileContactAlreadyRevealed &&
    (contactRevealStats ? contactRevealStats.remainingContacts <= 0 : hasReachedContactLimit(currentUser));
  const connectionsLabel = connectionsType === "followers" ? "Followers" : "Following";
  const connectionList =
    connectionsType === "followers" ? profile?.followers || [] : profile?.following || [];
  const normalizedConnections = connectionList
    .map((user) => {
      if (!user) return null;
      if (typeof user === "string") {
        return { _id: user, name: "Unknown User", profileImage: "" };
      }
      return {
        _id: user._id,
        name: user.name || "Unknown User",
        profileImage: user.profileImage || "",
        username: user.writerProfile?.username || user.username || "",
      };
    })
    .filter(Boolean);
  const profileCompletion = profile?.profileCompletion;
  const showProfileCompletion = isOwnProfile && profileCompletion && !profileCompletion.isComplete;
  const showFinancialAnalytics = Boolean(profile?.featureFlags?.financialAnalytics);

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })
    : null;
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const profileShareKey = String(profile?.writerProfile?.username || "").trim().toLowerCase() || String(profile?._id || "").trim();
  const defaultProfileRoute = profileShareKey
    ? `/share/profile/${encodeURIComponent(profileShareKey)}`
    : "";
  const fallbackShareUrl = defaultProfileRoute ? `${browserOrigin}${defaultProfileRoute}` : "";
  const profileShare = {
    url: normalizePublicShareUrl(fallbackShareUrl, profile?.shareMeta?.url),
    title: profile?.shareMeta?.title || `${profile?.name || "Profile"} | Ckript`,
    text: profile?.shareMeta?.text || `Check out ${profile?.name || "this creator"}'s profile on Ckript.`,
  };
  const profileContactLinks = revealedProfileContact?.links || profile?.writerProfile?.links || {};
  const profileContactLinkItems = [
    { key: "portfolio", label: "Portfolio", href: profileContactLinks.portfolio },
    { key: "linkedin", label: "LinkedIn", href: profileContactLinks.linkedin },
    { key: "imdb", label: "IMDb", href: profileContactLinks.imdb },
    { key: "instagram", label: "Instagram", href: profileContactLinks.instagram },
    { key: "twitter", label: "X / Twitter", href: profileContactLinks.twitter },
    { key: "facebook", label: "Facebook", href: profileContactLinks.facebook },
  ].filter((item) => Boolean(String(item.href || "").trim()));

  const resolveImage = (url) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("data:")) return url;
    return `${(import.meta.env.VITE_API_URL || "http://localhost:5002").replace(/\/api\/?$/, "").replace(/\/$/, "")}${url}`;
  };

  const handleRevealContact = async () => {
    if (!profileWriterId || contactRevealLoading) return;
    setContactRevealError("");
    setContactRevealLoading(true);
    try {
      const result = await revealProfileContact({ profileId: profileWriterId });
      if (!result.ok) throw result.cause || new Error(result.message);
      const data = result.data;
      setRevealedProfileContact(data.contact);
      setContactRevealStats({
        contactsUsed: data.contactsUsed,
        contactsLimit: data.contactsLimit,
        remainingContacts: data.remainingContacts,
      });
      setShowContactDetails(true);
      if (data.contactsUsed !== undefined) {
        setUser((prev) => {
          if (!prev) return prev;
          const alreadyRecorded = (Array.isArray(prev.subscription?.revealedContacts)
            ? prev.subscription.revealedContacts
            : []).some((entry) => String(entry?.writerId || entry) === profileWriterId);
          const updated = {
            ...prev,
            subscription: {
              ...(prev.subscription || {}),
              revealedContacts: alreadyRecorded
                ? prev.subscription.revealedContacts
                : [
                  ...(Array.isArray(prev.subscription?.revealedContacts) ? prev.subscription.revealedContacts : []),
                  { writerId: profileWriterId, revealedAt: new Date().toISOString() },
                ],
            },
          };
          localStorage.setItem("user", JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      setContactRevealError(err?.response?.data?.message || err.message || "Failed to reveal contact.");
    } finally {
      setContactRevealLoading(false);
    }
  };

  const handleMeetingStatusChange = async (meetingId, status) => {
    await api.patch(`/meetings/${meetingId}/status`, { status });
    setMeetings((previous) => previous.map((meeting) => (
      meeting._id === meetingId ? { ...meeting, status } : meeting
    )));
  };


  useEffect(() => {
    if ((isWriterUser || isInvestorProfile || activeTab === "meetings") && isOwnProfile && currentUser?._id) {
      const fetchMeetings = async () => {
        try {
          setMeetingsLoading(true);
          const { data } = await api.get("/meetings");
          setMeetings(data);
        } catch (error) {
          console.error("Error fetching meetings:", error);
        } finally {
          setMeetingsLoading(false);
        }
      };
      fetchMeetings();
    }
  }, [activeTab, isOwnProfile, currentUser?._id, isInvestorProfile, isWriterUser]);

  useEffect(() => {
    setShowContactDetails(false);
    setRevealedProfileContact(null);
    setContactRevealStats(null);
    setContactRevealError("");
  }, [profile?._id]);

  useEffect(() => {
    if (!showMessageRequestModal || !messageTextareaRef.current) return;

    const textarea = messageTextareaRef.current;
    textarea.focus();
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [showMessageRequestModal, messageRequestText]);

  useEffect(() => {
    if (!showConnectionsModal && !showPitchModal && !showMessageRequestModal && !showDeleteAccountModal) return;
    const closeTopOverlay = (event) => {
      if (event.key !== "Escape") return;
      setShowConnectionsModal(false);
      setShowPitchModal(false);
      setShowMessageRequestModal(false);
      setShowDeleteAccountModal(false);
    };
    document.addEventListener("keydown", closeTopOverlay);
    return () => document.removeEventListener("keydown", closeTopOverlay);
  }, [showConnectionsModal, showDeleteAccountModal, showMessageRequestModal, showPitchModal]);

  /* â”€â”€ Loading â”€â”€ */
  if (loading) {
    return <ProfilePcSkeleton isDark={dark} />;
  }

  /* â”€â”€ Not found â”€â”€ */
  if (!profile) {
    if (profileRequiresBusinessEmail) {
      return (
        <div className="flex justify-center items-center min-h-[60vh] px-4">
          <div className={`max-w-md w-full rounded-2xl border p-6 sm:p-8 ${dark ? "bg-[#0d1829] border-white/[0.06]" : "bg-white border-gray-200"}`}>
            <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-4 border ${dark ? "bg-white/[0.03] border-white/[0.05]" : "bg-gray-50 border-gray-200"}`}>
              <svg className={`w-5 h-5 ${dark ? "text-white/30" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h2 className={`text-base font-extrabold mb-1 text-center ${dark ? "text-white" : "text-gray-900"}`}>Access Restricted</h2>
            <p className={`text-[13px] text-center leading-relaxed mb-5 ${dark ? "text-white/40" : "text-gray-500"}`}>
              Your account uses a personal email. Choose an option below to continue.
            </p>
            <div className="space-y-3">
              <div className={`rounded-xl border p-4 ${dark ? "bg-white/[0.03] border-white/[0.05]" : "bg-gray-50 border-gray-200"}`}>
                <p className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${dark ? "text-white/30" : "text-gray-400"}`}>Free Access</p>
                <p className={`text-sm font-semibold mb-0.5 ${dark ? "text-white" : "text-gray-900"}`}>Sign up with a business email</p>
                <p className={`text-[12px] leading-relaxed mb-3 ${dark ? "text-white/40" : "text-gray-500"}`}>
                  Use a company email address to browse scripts and view writer profiles at no cost.
                </p>
                <button
                  type="button"
                  onClick={() => openProducerOnboarding()}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${dark ? "bg-white/[0.06] border-white/[0.08] text-white hover:bg-white/[0.1]" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                >
                  Sign up as Film Industry Professional
                </button>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1 text-amber-500">Premium Plan</p>
                <p className={`text-sm font-semibold mb-0.5 ${dark ? "text-white" : "text-gray-900"}`}>Film Industry Professional</p>
                <p className={`text-[12px] leading-relaxed mb-3 ${dark ? "text-white/40" : "text-gray-500"}`}>
                  Full access to scripts, writer profiles, and verified contact details (email, phone &amp; links) for up to 15 writers per month.
                </p>
                <button
                  type="button"
                  onClick={() => openPricingModal()}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"
                >
                  Get the Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col justify-center items-center h-[60vh] gap-3">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center ${dark ? "bg-white/[0.04]" : "bg-gray-100"
            }`}
        >
          <svg
            className={`w-6 h-6 ${dark ? "text-white/20" : "text-gray-300"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </div>
        <p
          className={`text-sm font-semibold ${dark ? "text-white/30" : "text-gray-400"
            }`}
        >
          {profileAccessMessage || "User not found"}
        </p>
        {String(profileAccessMessage || "").toLowerCase().includes("private") && id && (
          <button
            onClick={async () => {
              try {
                const result = await updateProfileFollow({
                  profileId: profileAccessId || id,
                  relationship: { followRequestPending },
                });
                if (!result.ok) throw result.cause || new Error(result.message);
                setFollowRequestPending(result.data.followRequestPending);
              } catch (err) {
                console.error("Follow request action failed:", err);
              }
            }}
            className={`mt-2 px-4 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${
              followRequestPending
                ? dark ? "bg-white/[0.06] text-white border-white/15" : "bg-gray-100 text-gray-700 border-gray-300"
                : dark ? "bg-blue-500 text-white border-blue-500 hover:bg-blue-600" : "bg-[#1e3a5f] text-white border-[#1e3a5f] hover:bg-[#152a47]"
            }`}
          >
            {followRequestPending ? "Requested" : "Send follow request"}
          </button>
        )}
      </div>
    );
  }

  /* â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
     Design tokens
     â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â•  */
  const t = {
    card: dark
      ? "bg-[#0d1520] border-white/[0.06]"
      : "bg-[#fcfdff] border-[#d7e2ef] shadow-sm",
    coverFrom: dark ? "from-[#0a1628]" : "from-[#1e3a5f]",
    coverTo: dark ? "to-[#162d4a]" : "to-[#5f8fc6]",
    avatarRing: dark ? "ring-[#0d1520]" : "ring-white",
    avatarGrad: dark
      ? "from-[#1a3557] to-[#0f2439]"
      : "from-[#1e3a5f] to-[#2d5a8e]",
    h1: dark ? "text-white" : "text-gray-900",
    body: dark ? "text-white/65" : "text-gray-600",
    email: dark ? "text-white/60" : "text-gray-600",
    statNum: dark ? "text-white" : "text-gray-900",
    statLabel: dark ? "text-white/30" : "text-gray-400",
    joined: dark ? "text-white/60" : "text-gray-600",
    divider: dark ? "border-white/[0.06]" : "border-gray-100",
    roleBg: dark
      ? "bg-[#1e3a5f]/25 border-[#4a6f9b]/45 text-[#9dc2f8]"
      : "bg-[#eaf2ff] border-[#bfd4f3] text-[#204774]",
    wgaBadge: dark
      ? "bg-amber-500/12 border-amber-400/30 text-amber-300"
      : "bg-[#fff7e8] border-[#f4d8a8] text-[#8a5a10]",
    repBadge: dark
      ? "bg-emerald-500/12 border-emerald-400/30 text-emerald-300"
      : "bg-[#e9f9f2] border-[#bfe9d2] text-[#11633f]",
    writerPanel: dark
      ? "bg-[#0a1628]/82 border-white/[0.12] shadow-[0_20px_45px_-24px_rgba(0,0,0,0.9)]"
      : "bg-white/92 border-[#d4e2f1] shadow-[0_20px_45px_-24px_rgba(37,75,120,0.25)]",
    writerPanelSub: dark ? "text-[#9bb3cd]" : "text-[#45607f]",
    writerName: dark ? "text-white" : "text-[#10233d]",
    writerStatCard: dark
      ? "bg-white/[0.04] border-white/[0.09]"
      : "bg-[#f8fbff] border-[#cfdeef]",
    writerStatLabel: dark ? "text-[#89a1bc]" : "text-[#4f6786]",
    writerStatValue: dark ? "text-white" : "text-[#10233d]",
    chip: dark
      ? "bg-white/[0.04] text-white/65 border-white/[0.08]"
      : "bg-[#f5f9ff] text-[#3f5878] border-[#d4e0ef]",
    genreChip: dark
      ? "bg-[#1e3a5f]/20 text-[#7aafff]/75 border-[#1e3a5f]/30"
      : "bg-[#1e3a5f]/[0.06] text-[#1e3a5f] border-[#1e3a5f]/15",
    editBtn: dark
      ? "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white"
      : "bg-white hover:bg-[#f4f8ff] text-[#365273] hover:text-[#1a3557] shadow-sm",
    followActive: dark
      ? "bg-white/[0.05] text-white/45 border-white/[0.07] hover:bg-red-950/30 hover:text-red-400 hover:border-red-900/30"
      : "bg-[#f5f8fc] text-[#526780] border-[#d3deeb] hover:bg-red-50 hover:text-red-500 hover:border-red-200",
    followIdle: dark
      ? "bg-[#1e3a5f] text-white hover:bg-[#243f6a] shadow-lg shadow-[#1e3a5f]/25"
      : "bg-[#1e3a5f] text-white hover:bg-[#162d4a] shadow-md shadow-[#1e3a5f]/20",
    blockBtn: dark
      ? "bg-red-500/10 text-red-300 border-red-500/25 hover:bg-red-500/18"
      : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100",
    unblockBtn: dark
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/18"
      : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
    aboutText: dark ? "text-white/50" : "text-gray-500",
    aboutEmpty: dark ? "text-white/25" : "text-gray-400",
    roleTag: dark
      ? "bg-[#1e3a5f]/30 text-[#7aafff] border-[#1e3a5f]/40"
      : "bg-[#1e3a5f]/[0.07] text-[#1e3a5f] border-[#1e3a5f]/15",
    contactTxt: dark ? "text-white/55" : "text-gray-600",
    contactSub: dark ? "text-white/30" : "text-gray-400",
    wgaYes: dark
      ? "bg-amber-900/20 text-amber-400 border-amber-800/30"
      : "bg-amber-50 text-amber-700 border-amber-200",
    wgaNo: dark
      ? "bg-white/[0.04] text-white/25 border-white/[0.06]"
      : "bg-gray-50 text-gray-400 border-gray-200/60",
    emptyBg: dark ? "bg-white/[0.04]" : "bg-gray-100",
    emptyIcon: dark ? "text-white/20" : "text-gray-300",
    emptyH: dark ? "text-white/40" : "text-gray-600",
    emptyP: dark ? "text-white/25" : "text-gray-400",
    // Writer-specific layout tokens
    bentoCard: dark
      ? "bg-[#0d1520] border-white/[0.06]"
      : "bg-white border-gray-200/70 shadow-sm",
    subtleBg: dark ? "bg-white/[0.02]" : "bg-gray-50/60",
  };

  /* â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
     RENDER
     â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â•  */
  const usesWorkspaceProfile = isWriterUser || isInvestorProfile;
  const workspaceIdentity = usesWorkspaceProfile ? (
    <ProfileWorkspaceIdentity
      profile={profile}
      scriptsCount={scripts.length}
      isOwnProfile={isOwnProfile}
      resolvedImage={resolveImage(profile.profileImage)}
      memberSince={memberSince}
      profileShare={profileShare}
      isFollowing={isFollowing}
      isFollowsMe={isFollowsMe}
      followLoading={followLoading}
      followRequestPending={followRequestPending}
      isBlockedByCurrent={isBlockedByCurrent}
      blockedByProfile={blockedByProfile}
      blockingAction={blockingAction}
      onFollow={handleFollow}
      onBlock={handleToggleBlock}
      onEdit={() => setShowEditModal(true)}
      onMessage={isWriterUser && !isWriter(currentUser?.role) ? () => setShowMessageRequestModal(true) : null}
      onPitch={isInvestorProfile && isWriter(currentUser?.role) ? handleOpenPitchModal : null}
      onFollowers={() => openConnectionsModal("followers")}
      onFollowing={() => openConnectionsModal("following")}
      canViewContactDetails={canViewContactDetails}
      contactAlreadyRevealed={profileContactAlreadyRevealed}
      contactRevealBlocked={profileContactRevealBlocked}
      contactRevealLoading={contactRevealLoading}
      contactRevealError={contactRevealError}
      contactsUsed={profileContactsUsed}
      contactsLimit={profileContactsLimit}
      remainingContacts={profileRemainingContacts}
      showContactDetails={showContactDetails}
      onToggleContact={() => setShowContactDetails((previous) => !previous)}
      onRevealContact={handleRevealContact}
      revealedContact={revealedProfileContact}
      contactLinks={profileContactLinkItems}
    />
  ) : null;
  const ProfileRoot = usesWorkspaceProfile ? ProfilePcPage : "div";
  const workspaceTabGroups = [
    {
      label: "Profile",
      tabs: [
        { key: "about", label: "Overview", icon: "article" },
        { key: "activity", label: "Activity", icon: "dynamic_feed", count: profileCollections.data?.counts?.activity },
        ...(isWriterUser ? [{ key: "projects", label: "Projects", icon: "movie", count: scripts.length }] : []),
        ...(isWriterUser ? [{ key: "credentials", label: "Guilds & skills", icon: "workspace_premium" }] : []),
        ...(isWriterUser && Array.isArray(profile.badges) && profile.badges.length > 0
          ? [{ key: "achievements", label: "Achievements", icon: "emoji_events" }]
          : []),
      ],
    },
    ...(isOwnProfile ? [{
      label: "Work",
      tabs: [
        { key: "meetings", label: "Meetings", icon: "calendar_month", count: meetings.filter((meeting) => meeting?.status === "pending").length || undefined },
        { key: "bookmarks", label: "Saved", icon: "bookmark", count: profileCollections.data?.counts?.bookmarks ?? bookmarkedScripts.length },
        ...(purchasedScripts.length > 0 ? [{ key: "purchases", label: "Purchases", icon: "receipt_long", count: purchasedScripts.length }] : []),
      ],
    }] : []),
    ...(isOwnProfile ? [{
      label: "Operations",
      tabs: [
        ...(showFinancialAnalytics ? [{ key: "performance", label: "Performance", icon: "insights" }] : []),
        { key: "settings", label: "Settings", icon: "settings" },
      ],
    }] : []),
  ];

  return (
    <ProfileRoot {...(usesWorkspaceProfile
      ? { identity: workspaceIdentity, isDark: dark }
      : { className: `mx-auto space-y-5 ${isInvestorProfile ? "max-w-6xl" : "max-w-3xl"}` })}>
      {!usesWorkspaceProfile && <ProfileCompletionBanner
        completion={showProfileCompletion ? profileCompletion : null}
        subtitle="Your profile is incomplete. Add missing details from Edit Profile."
        ctaLabel="Edit Profile"
        onCta={() => setShowEditModal(true)}
      />}

      {/* ════════ PROFILE CARD ════════ */}
      {!usesWorkspaceProfile && <Motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`rounded-2xl transition-colors relative overflow-visible ${t.card}`}
      >
          <>
            {profile.role === "investor" ? (
              <div className="px-4 sm:px-8 pt-2 sm:pt-3 pb-6 sm:pb-7 relative z-20">
                <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-6 ${dark ? "bg-[#0b1320]/95" : "bg-white/95"}`}>
                  <div className="hidden max-[460px]:flex items-center justify-center gap-x-3 gap-y-2 mb-5 flex-wrap">
                    <SocialShareButton
                      share={profileShare}
                      buttonLabel="Share"
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1.5 ${dark ? "bg-white/[0.07] hover:bg-white/[0.14] text-white/80" : "bg-white hover:bg-[#f4f8ff] text-[#1a3557] shadow-sm"}`}
                    />
                    {isOwnProfile ? (
                      <button
                        onClick={() => setShowEditModal(true)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1.5 ${t.editBtn}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                        Edit
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleFollow}
                          disabled={isBlockedByCurrent || blockedByProfile || followLoading}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border disabled:opacity-55 disabled:cursor-not-allowed ${isFollowing ? t.followActive : t.followIdle}`}
                        >
                          {followLoading ? "Wait..." : blockedByProfile ? "Blocked You" : isBlockedByCurrent ? "Blocked" : isFollowing ? "Following" : followRequestPending ? "Requested" : isFollowsMe ? "Follow Back" : "Follow"}
                        </button>
                        {isWriter(currentUser?.role) && (
                          <button
                            type="button"
                            onClick={handleOpenPitchModal}
                            disabled={isBlockedByCurrent || blockedByProfile || followLoading}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border disabled:opacity-55 disabled:cursor-not-allowed ${t.followIdle}`}
                          >
                            Pitch Script
                          </button>
                        )}
                        <button
                          onClick={handleToggleBlock}
                          disabled={blockingAction || blockedByProfile}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border disabled:opacity-55 disabled:cursor-not-allowed ${isBlockedByCurrent ? t.unblockBtn : t.blockBtn}`}
                        >
                          {blockingAction ? "Updating..." : isBlockedByCurrent ? "Unblock" : "Block"}
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col min-[1000px]:flex-row min-[1000px]:items-start gap-4 sm:gap-5 min-[1000px]:gap-6">
                    <div className="flex items-start max-[460px]:flex-col max-[460px]:items-center gap-4 sm:gap-5 min-w-0 flex-1">
                      <div className="shrink-0 flex flex-col items-start gap-2 max-[460px]:items-center">
                        {profile.profileImage ? (
                          <img
                            src={resolveImage(profile.profileImage)}
                            alt={profile.name}
                            className={`w-20 h-20 min-[420px]:w-24 min-[420px]:h-24 sm:w-28 sm:h-28 rounded-full object-cover ring-[3px] ${t.avatarRing}`}
                          />
                        ) : (
                          <div className={`w-20 h-20 min-[420px]:w-24 min-[420px]:h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br flex items-center justify-center ring-[3px] ${t.avatarRing} ${t.avatarGrad}`}>
                            <span className="text-3xl min-[420px]:text-4xl sm:text-5xl font-extrabold text-white/85">
                              {profile.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}

                        <div className="hidden min-[461px]:flex flex-col items-start gap-2 mt-2">
                          <SocialShareButton
                            share={profileShare}
                            buttonLabel="Share"
                            className={`px-3 sm:px-4 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all flex items-center gap-1.5 ${dark ? "bg-white/[0.07] hover:bg-white/[0.14] text-white/80" : "bg-white hover:bg-[#f4f8ff] text-[#1a3557] shadow-sm"}`}
                          />
                          {isOwnProfile ? (
                            <button
                              onClick={() => setShowEditModal(true)}
                              className={`px-3 sm:px-4 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all flex items-center gap-1.5 ${t.editBtn}`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                              Edit Profile
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={handleFollow}
                                disabled={isBlockedByCurrent || blockedByProfile || followLoading}
                                className={`px-4 sm:px-5 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-bold transition-all border disabled:opacity-55 disabled:cursor-not-allowed ${isFollowing ? t.followActive : t.followIdle}`}
                              >
                                {followLoading ? "Wait..." : blockedByProfile ? "Blocked You" : isBlockedByCurrent ? "Blocked" : isFollowing ? "Following" : followRequestPending ? "Requested" : isFollowsMe ? "Follow Back" : "Follow"}
                              </button>
                              {isWriter(currentUser?.role) && (
                                <button
                                  type="button"
                                  onClick={handleOpenPitchModal}
                                  disabled={isBlockedByCurrent || blockedByProfile || followLoading}
                                  className={`px-3 sm:px-4 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-bold transition-all border disabled:opacity-55 disabled:cursor-not-allowed ${t.followIdle}`}
                                >
                                  Pitch Script
                                </button>
                              )}
                              <button
                                onClick={handleToggleBlock}
                                disabled={blockingAction || blockedByProfile}
                                className={`px-3 sm:px-4 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-bold transition-all border disabled:opacity-55 disabled:cursor-not-allowed ${isBlockedByCurrent ? t.unblockBtn : t.blockBtn}`}
                              >
                                {blockingAction ? "Updating..." : isBlockedByCurrent ? "Unblock" : "Block"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 max-[460px]:w-full max-[460px]:text-center">
                        <div className="flex items-center gap-2 flex-wrap max-[460px]:justify-center">
                          <h1 className={`text-[26px] min-[420px]:text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.05] break-words ${t.h1}`}>{profile.name}</h1>
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] border ${t.roleBg}`}>
                            Investor
                          </span>
                          {hasActiveFilmIndustryProfessionalAccess(profile) && (
                            <PremiumModelBadge size="md" dark={dark} />
                          )}
                          {isWriter(profile.role) && profile.subscription?.accessStatus === "active" && profile.subscription?.plan && (!profile.subscription?.accessExpiresAt || new Date(profile.subscription.accessExpiresAt) > new Date()) && (
                            <WriterModelBadge plan={profile.subscription.plan} size="md" dark={dark} />
                          )}
                        </div>

                        {(profile.industryProfile?.company || profile.industryProfile?.jobTitle) && (
                          <p className={`text-[14px] mt-2 font-medium max-[460px]:text-center ${dark ? "text-white/55" : "text-gray-600"}`}>
                            {profile.industryProfile?.jobTitle || "Investor"}
                            {profile.industryProfile?.company ? ` at ${profile.industryProfile.company}` : ""}
                          </p>
                        )}

                        {isOwnProfile && (
                          <p className={`text-[13px] font-semibold mt-2 break-all max-[460px]:text-center ${t.email}`}>{profile.email}</p>
                        )}

                        {profile.bio && (
                          <p className={`text-[15px] leading-relaxed mt-3 line-clamp-4 max-[460px]:text-center ${t.body}`}>
                            {profile.bio}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2.5 mt-3.5 max-[460px]:justify-center">
                          {memberSince && (
                            <span className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border ${dark ? "bg-white/[0.04] text-white/55 border-white/[0.08]" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                              Joined {memberSince}
                            </span>
                          )}
                          {profile.industryProfile?.investmentRange && (
                            <span className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border ${dark ? "bg-white/[0.04] text-white/55 border-white/[0.08]" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                              {profile.industryProfile.investmentRange.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 w-full min-[1000px]:w-[360px] min-[1000px]:shrink-0 rounded-2xl p-2.5 sm:p-3">
                      {[
                        { label: "Followers", value: profile.followers.length, connectionType: "followers" },
                        { label: "Following", value: profile.following.length, connectionType: "following" },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          disabled={!item.connectionType}
                          onClick={item.connectionType ? () => openConnectionsModal(item.connectionType) : undefined}
                          className={`rounded-2xl px-3.5 py-3 min-h-[92px] text-left max-[460px]:text-center transition-all duration-200 disabled:opacity-100 ${item.connectionType ? dark ? "hover:bg-[#142234] hover:-translate-y-[1px]" : "hover:bg-[#f8fbff] hover:-translate-y-[1px]" : "cursor-default"}`}
                        >
                          <p className={`text-lg min-[1000px]:text-xl font-black tabular-nums leading-none ${dark ? "text-white" : "text-gray-900"}`}>{item.value}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-[0.12em] mt-1.5 ${dark ? "text-white/35" : "text-gray-500"}`}>{item.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Avatar + Info row */}
                <div className="px-6 sm:px-8">
                  <div className="pt-2 sm:pt-3 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 relative z-20">
                    <div className="shrink-0">
                      {profile.profileImage ? (
                        <img src={resolveImage(profile.profileImage)} alt={profile.name}
                          className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover ring-[5px] ${t.avatarRing}`} />
                      ) : (
                        <div className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full ring-[5px] bg-gradient-to-br flex items-center justify-center ${t.avatarRing} ${t.avatarGrad}`}>
                          <span className="text-4xl sm:text-5xl font-extrabold text-white/80">
                            {profile.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pb-1 pt-1 sm:pt-0">
                      <div className="space-y-2">
                        <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${t.h1}`}>
                          {profile.name}
                        </h1>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span title={profile.role === 'investor' ? 'Film Industry Professional' : undefined} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] border ${t.roleBg}`}>
                              {profile.role === 'investor' ? 'FIP' : profile.role}
                            </span>
                          {hasActiveFilmIndustryProfessionalAccess(profile) && (
                            <PremiumModelBadge size="md" dark={dark} />
                          )}
                        </div>
                      </div>
                      {isOwnProfile && <p className={`text-[13px] font-medium mt-2 ${t.email}`}>{profile.email}</p>}
                      {profile.bio && (
                        <p className={`text-[14px] leading-relaxed mt-2.5 line-clamp-4 ${t.body}`}>
                          {profile.bio}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <SocialShareButton
                          share={profileShare}
                          buttonLabel="Share"
                          className={`px-3 sm:px-4 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all flex items-center gap-1.5 ${dark ? "bg-white/[0.07] hover:bg-white/[0.14] text-white/80" : "bg-white hover:bg-[#f4f8ff] text-[#1a3557] shadow-sm"}`}
                        />
                        {isOwnProfile ? (
                          <button
                            onClick={() => setShowEditModal(true)}
                            className={`px-3 sm:px-4 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-semibold transition-all flex items-center gap-1.5 ${t.editBtn}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                            Edit Profile
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={handleFollow}
                              disabled={isBlockedByCurrent || blockedByProfile || followLoading}
                              className={`px-4 sm:px-5 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-bold transition-all border disabled:opacity-55 disabled:cursor-not-allowed ${isFollowing ? t.followActive : t.followIdle}`}
                            >
                              {followLoading ? "Wait..." : blockedByProfile ? "Blocked You" : isBlockedByCurrent ? "Blocked" : isFollowing ? "Following" : followRequestPending ? "Requested" : isFollowsMe ? "Follow Back" : "Follow"}
                            </button>
                            <button
                              onClick={handleToggleBlock}
                              disabled={blockingAction || blockedByProfile}
                              className={`px-3 sm:px-4 py-1.5 rounded-xl text-[12px] sm:text-[13px] font-bold transition-all border disabled:opacity-55 disabled:cursor-not-allowed ${isBlockedByCurrent ? t.unblockBtn : t.blockBtn}`}
                            >
                              {blockingAction ? "Updating..." : isBlockedByCurrent ? "Unblock" : "Block"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats for non-writer */}
                <div className="px-6 sm:px-8 pb-7 pt-5">
                  <div className={`flex flex-wrap items-end gap-6 sm:gap-8 pt-5 border-t ${t.divider}`}>
                    {[
                      ...(profile.role !== "investor" ? [{ value: scripts.length, label: "Projects" }] : []),
                      { value: profile.followers.length, label: "Followers", connectionType: "followers" },
                      { value: profile.following.length, label: "Following", connectionType: "following" },
                      ...(memberSince ? [{ value: memberSince, label: "Joined", isStr: true }] : []),
                    ].map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        disabled={!s.connectionType}
                        onClick={s.connectionType ? () => openConnectionsModal(s.connectionType) : undefined}
                        className={`${s.connectionType ? "rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors disabled:opacity-100 text-left" : ""} ${s.connectionType ? dark ? "hover:bg-white/[0.08]" : "hover:bg-[#f0f6ff]" : "cursor-default"}`}
                      >
                        <p className={`${s.isStr ? "text-lg sm:text-xl" : "text-2xl"} font-extrabold tabular-nums ${t.statNum}`}>{s.value}</p>
                        <p className={`text-[11px] font-semibold uppercase tracking-wider mt-0.5 ${t.statLabel}`}>{s.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
      </Motion.div>}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€ TABS â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className={usesWorkspaceProfile ? "profile-workspace-tabs" : "flex items-center gap-2 overflow-x-auto pb-1"}>
        {usesWorkspaceProfile && (
          <nav className="profile-workspace-breadcrumb" aria-label="Breadcrumb">
            <button type="button" onClick={() => navigate(isWriterUser ? "/writers" : "/discover")} className="bg-transparent border-0 p-0 cursor-pointer">{isWriterUser ? "Writers" : "Discover"}</button>
            <span>/</span>
            <strong>{profile.name}</strong>
          </nav>
        )}
        <div className={usesWorkspaceProfile ? "profile-workspace-tablist" : "contents"} role={usesWorkspaceProfile ? "tablist" : undefined} aria-label={usesWorkspaceProfile ? "Profile sections" : undefined}>
        {usesWorkspaceProfile ? workspaceTabGroups.map((group) => (
          <div className="profile-workspace-tabgroup" key={group.label}>
            <div className="profile-workspace-tabgroup__label">{group.label}</div>
            {group.tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => selectProfileTab(tab.key)}
                className="profile-workspace-tab"
              >
                <span className="material-symbols-outlined profile-workspace-tab__icon" aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && <span className="profile-workspace-tab__count">{tab.count}</span>}
              </button>
            ))}
          </div>
        )) : [
          { key: "about", label: "About" },
          { key: "activity", label: "Activity", count: profileCollections.data?.counts?.activity },
          ...(profile.role !== "investor" ? [{ key: "projects", label: "Projects", count: scripts.length }] : []),
          ...(isOwnProfile ? [{ key: "bookmarks", label: "Bookmarks", count: profileCollections.data?.counts?.bookmarks ?? bookmarkedScripts.length }] : []),
          ...(isOwnProfile && purchasedScripts.length > 0 ? [{ key: "purchases", label: "Purchases", count: purchasedScripts.length }] : []),
          ...(isOwnProfile ? [{ key: "meetings", label: "Meetings" }, { key: "settings", label: "Settings" }] : []),
        ].map((tab) => (
          <button key={tab.key} type="button" onClick={() => selectProfileTab(tab.key)} className={`px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 border shrink-0 ${activeTab === tab.key ? dark ? "bg-[#1c2b42] text-white border-[#314765]" : "bg-[#1e3a5f] text-white border-[#1e3a5f]" : dark ? "bg-[#121d2f] text-white/75 border-white/[0.12]" : "bg-white text-gray-600 border-gray-200"}`}>
            {tab.label}{tab.count !== undefined && <span className="ml-1.5 text-[11px]">{tab.count}</span>}
          </button>
        ))}
        </div>
      </div>

      {activeTab === "activity" && (
        <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={usesWorkspaceProfile ? "profile-workspace-panel" : ""}>
          <ProfileWorkspaceActivity
            posts={profileCollections.data?.items || []}
            loading={profileCollections.status === PROFILE_COLLECTION_STATUS.LOADING}
            error={profileCollections.status === PROFILE_COLLECTION_STATUS.FAILED ? profileCollections.failure?.message : ""}
            onRetry={profileCollections.reload}
            pagination={profileCollections.data?.pagination}
            onPageChange={(page) => selectProfileTab("activity", page)}
          />
        </Motion.div>
      )}

      {/* ──────── MEETINGS TAB ──────── */}
      {activeTab === "meetings" && isOwnProfile && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`space-y-6 ${usesWorkspaceProfile ? "profile-workspace-panel" : ""}`}
        >
          {usesWorkspaceProfile ? (
            <ProfileWorkspaceMeetings
              meetings={meetings}
              loading={meetingsLoading}
              currentUserId={currentUser?._id}
              onStatusChange={handleMeetingStatusChange}
            />
          ) : (
          <SectionCard dark={dark} noBox title="Meeting Requests" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}>
            {meetingsLoading ? (
              <div className="flex justify-center items-center py-10">
                <div className={`w-8 h-8 border-4 rounded-full animate-spin ${dark ? "border-white/10 border-t-white" : "border-gray-200 border-t-[#D14D37]"}`} />
              </div>
            ) : meetings.length === 0 ? (
              <div className="text-center py-12">
                <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3 ${dark ? "bg-white/[0.03]" : "bg-gray-50"}`}>
                  <svg className={`w-6 h-6 ${dark ? "text-white/20" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className={`text-[13px] font-medium ${dark ? "text-white/40" : "text-gray-500"}`}>No meeting requests found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {meetings.map((meeting) => {
                  const isProducer = String(meeting.producer) === String(currentUser._id);
                  return (
                    <div key={meeting._id} className={`p-4 rounded-xl border ${dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-gray-200"}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className={`font-semibold text-lg ${dark ? "text-white" : "text-gray-900"}`}>{meeting.title}</h3>
                          <p className={`text-sm ${dark ? "text-white/60" : "text-gray-600"} mt-1`}>
                            {isProducer ? "With: " : "From: "} <span className="font-semibold">{isProducer ? meeting.writer_name : meeting.producer_name}</span>
                          </p>
                          <p className={`text-sm ${dark ? "text-white/60" : "text-gray-600"}`}>
                            Script: <span className="italic">{meeting.script_name}</span>
                          </p>
                          <div className={`mt-3 flex gap-4 text-sm ${dark ? "text-white/50" : "text-gray-500"}`}>
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {meeting.startAt ? new Date(meeting.startAt).toLocaleDateString() : new Date(meeting.scheduledDate).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {/* startAt is the canonical instant → render in the VIEWER's local zone with the
                                  zone label so there is never any "whose 3 PM?" ambiguity. */}
                              {meeting.startAt
                                ? new Date(meeting.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
                                : meeting.scheduledTime}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {meeting.duration} min
                            </span>
                          </div>
                          {meeting.message && (
                            <p className={`mt-3 text-sm italic ${dark ? "text-white/40" : "text-gray-500"}`}>
                              "{meeting.message}"
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg uppercase tracking-wider ${
                            meeting.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                            meeting.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {meeting.status}
                          </span>
                          {meeting.status === "accepted" && (
                            <a
                              href={meeting.meetingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-[#D14D37] text-white text-xs font-bold rounded-lg hover:bg-[#b53c29] transition-colors"
                            >
                              Join Meeting
                            </a>
                          )}
                        </div>
                      </div>

                      {!isProducer && meeting.status === "pending" && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/10 flex gap-3">
                          <button
                            onClick={async () => {
                              try {
                                await api.patch(`/meetings/${meeting._id}/status`, { status: "accepted" });
                                setMeetings(meetings.map(m => m._id === meeting._id ? { ...m, status: "accepted" } : m));
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await api.patch(`/meetings/${meeting._id}/status`, { status: "rejected" });
                                setMeetings(meetings.map(m => m._id === meeting._id ? { ...m, status: "rejected" } : m));
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white text-sm font-semibold rounded-lg transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
          )}
        </Motion.div>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€ PROJECTS TAB â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "projects" && profile.role !== "investor" && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={usesWorkspaceProfile ? "profile-workspace-panel" : ""}
        >
          {isWriterUser ? (
            <ProfileWorkspaceProjects
              scripts={scripts}
              profile={profile}
              isOwnProfile={isOwnProfile}
              navigate={navigate}
              renderDelete={(script) => (
                <DeleteProjectButton
                  dark={dark}
                  onConfirm={() => handleDeleteScript(script._id)}
                  title={script.title}
                />
              )}
            />
          ) : scripts.length === 0 ? (
            <div
              className={`py-20 text-center transition-colors`}
            >
              <div
                className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${t.emptyBg}`}
              >
                <svg
                  className={`w-6 h-6 ${t.emptyIcon}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
              <p className={`text-[15px] font-bold mb-1 ${t.emptyH}`}>
                No projects yet
              </p>
              <p className={`text-[13px] max-w-xs mx-auto ${t.emptyP}`}>
                {isOwnProfile
                  ? "Upload your first script to get started"
                  : "This user hasn't posted any projects yet"}
              </p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 min-[460px]:grid-cols-2 ${isWriterUser ? "lg:grid-cols-3" : ""} gap-4`}>
              {scripts.map((script, idx) => (
                <Motion.div
                  key={script._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="relative group/card"
                >
                  <ProjectCard project={script} userName={profile.name} />
                  {isOwnProfile && (
                    <DeleteProjectButton
                      dark={dark}
                      onConfirm={() => handleDeleteScript(script._id)}
                      title={script.title}
                    />
                  )}
                </Motion.div>
              ))}
            </div>
          )}
        </Motion.div>
      )}

      {activeTab === "bookmarks" && isOwnProfile && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={usesWorkspaceProfile ? "profile-workspace-panel" : ""}
        >
          {usesWorkspaceProfile ? (
            <ProfileWorkspaceBookmarks
              scripts={profileCollections.data?.items || []}
              navigate={navigate}
              query={savedQuery}
              sort={savedSort}
              loading={profileCollections.status === PROFILE_COLLECTION_STATUS.LOADING}
              error={profileCollections.status === PROFILE_COLLECTION_STATUS.FAILED ? profileCollections.failure?.message : ""}
              removingId={profileCollections.removingId}
              removeError={profileCollections.actionError}
              pagination={profileCollections.data ? { ...profileCollections.data.pagination, savedTotal: profileCollections.data.counts.bookmarks } : null}
              onQueryChange={(value) => { setSavedQuery(value); selectProfileTab("bookmarks", 1); }}
              onSortChange={(value) => { setSavedSort(value); selectProfileTab("bookmarks", 1); }}
              onPageChange={(page) => selectProfileTab("bookmarks", page)}
              onRetry={profileCollections.reload}
              onRemove={removeSavedProject}
            />
          ) : profileCollections.status === PROFILE_COLLECTION_STATUS.LOADING ? (
            <div className="py-20 text-center" role="status">Loading saved projects…</div>
          ) : profileCollections.status === PROFILE_COLLECTION_STATUS.FAILED ? (
            <div className="py-20 text-center" role="alert"><p>{profileCollections.failure?.message}</p><button type="button" onClick={profileCollections.reload}>Try again</button></div>
          ) : (profileCollections.data?.items || []).length === 0 ? (
            <div className={`py-20 text-center transition-colors`}>
              <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${t.emptyBg}`}>
                <svg className={`w-6 h-6 ${t.emptyIcon}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5h13.5a.75.75 0 01.75.75v15.69a.75.75 0 01-1.219.594L12 16.34l-6.281 5.194a.75.75 0 01-1.219-.594V5.25a.75.75 0 01.75-.75z" />
                </svg>
              </div>
              <p className={`text-[15px] font-bold mb-1 ${t.emptyH}`}>No bookmarks yet</p>
              <p className={`text-[13px] max-w-xs mx-auto ${t.emptyP}`}>Save scripts from cards or project pages to quickly access them here.</p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 min-[460px]:grid-cols-2 ${isWriterUser ? "lg:grid-cols-3" : ""} gap-4`}>
              {(profileCollections.data?.items || []).map((script, idx) => (
                <Motion.div
                  key={script._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="relative group/card"
                >
                  <ProjectCard project={script} userName={script.creator?.name || "Unknown Author"} />
                </Motion.div>
              ))}
            </div>
          )}
          {!usesWorkspaceProfile && profileCollections.data?.pagination?.totalPages > 1 ? <nav className="profile-workspace-activity__pagination" aria-label="Bookmark pages"><button type="button" disabled={!profileCollections.data.pagination.hasPrevious} onClick={() => selectProfileTab("bookmarks", collectionPage - 1)}>Previous</button><span>Page {collectionPage} of {profileCollections.data.pagination.totalPages}</span><button type="button" disabled={!profileCollections.data.pagination.hasNext} onClick={() => selectProfileTab("bookmarks", collectionPage + 1)}>Next</button></nav> : null}
        </Motion.div>
      )}

      {activeTab === "purchases" && isOwnProfile && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={usesWorkspaceProfile ? "profile-workspace-panel" : ""}
        >
          <div className="grid grid-cols-1 min-[460px]:grid-cols-2 lg:grid-cols-3 gap-4">
            {purchasedScripts.map((script, index) => (
              <Motion.div
                key={script._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <ProjectCard project={script} userName={script.creator?.name || "Unknown Author"} />
              </Motion.div>
            ))}
          </div>
        </Motion.div>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€ ABOUT TAB â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "about" && isWriterUser && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="profile-workspace-panel"
        >
          <ProfileWorkspaceOverview
            profile={profile}
            scripts={scripts}
            isOwnProfile={isOwnProfile}
            navigate={navigate}
            onViewAll={() => selectProfileTab("projects")}
            renderDelete={(script) => (
              <DeleteProjectButton
                dark={dark}
                onConfirm={() => handleDeleteScript(script._id)}
                title={script.title}
              />
            )}
          />
          {/* Competition badges + history. Writers get their own Overview branch, so this has to be
              rendered here too — the copy further down lives in the non-writer About tab, which a
              writer profile never reaches. Self-hides when there is nothing to show. */}
          <CompetitionAchievements
            userId={profile._id}
            badges={profile.badges}
            className="mt-6"
          />
        </Motion.div>
      )}

      {activeTab === "credentials" && isWriterUser && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="profile-workspace-panel"
        >
          <ProfileWorkspaceCredentials profile={profile} />
        </Motion.div>
      )}

      {activeTab === "achievements" && isWriterUser && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="profile-workspace-panel"
        >
          <CompetitionAchievements userId={profile._id} badges={profile.badges} />
        </Motion.div>
      )}

      {activeTab === "about" && !isWriterUser && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={usesWorkspaceProfile
            ? "profile-workspace-panel"
            : `rounded-3xl border ${t.card} p-5 sm:p-8 flex flex-col divide-y ${dark ? "divide-white/[0.06]" : "divide-gray-100"}`}
        >
          {usesWorkspaceProfile ? (
            <>
              <ProfileWorkspaceOverview
                profile={profile}
                scripts={scripts}
                isOwnProfile={isOwnProfile}
                navigate={navigate}
              />
              <CompetitionAchievements
                userId={profile._id}
                badges={profile.badges}
                className="mt-6"
              />
            </>
          ) : (
          <>
          {/* Bio */}
          <div className="pb-6 first:pt-0 last:pb-0">
            <SectionCard
              dark={dark}
              title="About"
              noBox
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
              }
            >
              <p className={`text-[14px] leading-relaxed mt-2 ${t.aboutText}`}>
                {profile.bio || (
                  <span className={`italic ${t.aboutEmpty}`}>
                    No bio added yet.
                  </span>
                )}
              </p>
            </SectionCard>
          </div>

          {/* Role + Contact */}
          <div className="py-6 first:pt-0 last:pb-0 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SectionCard
              dark={dark}
              title="Role"
              noBox
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              }
            >
              <div className="mt-2">
                <span
                    title={profile.role === 'investor' ? 'Film Industry Professional' : undefined}
                    className={`inline-flex px-3 py-1.5 rounded-lg text-[13px] font-bold border ${t.roleTag}`}
                  >
                    {profile.role === 'investor' ? 'FIP' : (profile.role.charAt(0).toUpperCase() + profile.role.slice(1))}
                  </span>
              </div>
            </SectionCard>

            <SectionCard
              dark={dark}
              title={isOwnProfile ? "Contact" : "Member Info"}
              noBox
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              }
            >
              <div className="mt-2 space-y-2">
                {isOwnProfile ? (
                  <>
                    <p className={`text-[13px] font-medium ${t.contactTxt}`}>
                      {profile.email}
                    </p>
                    {profile.phone && (
                      <p className={`text-[13px] font-medium ${t.contactTxt}`}>
                        {profile.phone}
                      </p>
                    )}
                  </>
                ) : canViewContactDetails ? (
                  <>
                    {/* ── Header row ── */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-[12px] font-semibold uppercase tracking-[0.16em] ${t.statLabel}`}>Writer Contact</p>
                        {/* Counter line for pro-access users */}
                        {viewerHasProAccess && (
                          <p className={`text-[11px] mt-0.5 ${dark ? "text-white/35" : "text-gray-400"}`}>
                            {profileContactRevealBlocked
                              ? `Limit reached · ${profileContactsUsed}/${profileContactsLimit} used`
                              : `You can message or view ${profileRemainingContacts} more writer${profileRemainingContacts === 1 ? "" : "s"} · ${profileContactsUsed}/${profileContactsLimit} used`}
                          </p>
                        )}
                      </div>

                      {/* Action button */}
                      {profileContactAlreadyRevealed ? (
                        <button
                          type="button"
                          onClick={() => setShowContactDetails((prev) => !prev)}
                          className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${t.followIdle}`}
                        >
                          {showContactDetails ? "Hide" : "View"}
                        </button>
                      ) : profileContactRevealBlocked ? (
                        <span className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border ${dark ? "border-white/10 text-white/25 bg-white/5" : "border-gray-200 text-gray-400 bg-gray-50"}`}>
                          Limit reached
                        </span>
                      ) : viewerHasProAccess ? (
                        <button
                          type="button"
                          disabled={contactRevealLoading}
                          onClick={handleRevealContact}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-60"
                        >
                          {contactRevealLoading ? (
                            <>
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              Revealing...
                            </>
                          ) : (
                            <>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Reveal Contact
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>

                    {/* Reveal error */}
                    {contactRevealError && (
                      <p className="mt-1 text-[11px] text-rose-400">{contactRevealError}</p>
                    )}

                    {/* Usage bar for pro users */}
                    {viewerHasProAccess && (
                      <div className={`h-[3px] w-full rounded-full overflow-hidden mt-2 ${dark ? "bg-white/8" : "bg-gray-100"}`}>
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            profileContactsUsed >= profileContactsLimit
                              ? "bg-rose-500"
                              : profileContactsUsed >= profileContactsLimit * 0.8
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, (profileContactsUsed / Math.max(profileContactsLimit, 1)) * 100)}%` }}
                        />
                      </div>
                    )}

                    {/* Contact details (shown when revealed) */}
                    {(profileContactAlreadyRevealed) && showContactDetails && (
                      <div className="space-y-3 pt-2">
                        {/* After-reveal remaining counter banner */}
                        {viewerHasProAccess && profileRemainingContacts <= Math.ceil(profileContactsLimit * 0.3) && (
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold ${
                            profileRemainingContacts === 0
                              ? dark ? "bg-rose-500/10 border border-rose-500/20 text-rose-400" : "bg-rose-50 border border-rose-200 text-rose-600"
                              : dark ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : "bg-amber-50 border border-amber-200 text-amber-600"
                          }`}>
                            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            {profileRemainingContacts === 0
                              ? `You've used all ${profileContactsLimit} contact reveals for this period`
                              : `Now only ${profileRemainingContacts} more you can view details`}
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-3 max-[640px]:flex-col max-[640px]:items-start">
                          <span className={`text-[15px] ${dark ? "text-gray-400" : "text-gray-400"}`}>Email</span>
                          {(revealedProfileContact?.email || profile.email) ? (
                            <a href={`mailto:${revealedProfileContact?.email || profile.email}`} className={`text-[15px] font-semibold break-all ${dark ? "text-gray-200" : "text-gray-700"}`}>
                              {revealedProfileContact?.email || profile.email}
                            </a>
                          ) : (
                            <span className={`text-[15px] italic ${dark ? "text-gray-500" : "text-gray-500"}`}>Not available</span>
                          )}
                        </div>
                        <div className="flex items-start justify-between gap-3 max-[640px]:flex-col max-[640px]:items-start">
                          <span className={`text-[15px] ${dark ? "text-gray-400" : "text-gray-400"}`}>Phone</span>
                          {(revealedProfileContact?.phone || profile.phone) ? (
                            <a href={`tel:${revealedProfileContact?.phone || profile.phone}`} className={`text-[15px] font-semibold break-all ${dark ? "text-gray-200" : "text-gray-700"}`}>
                              {revealedProfileContact?.phone || profile.phone}
                            </a>
                          ) : (
                            <span className={`text-[15px] italic ${dark ? "text-gray-500" : "text-gray-500"}`}>Not available</span>
                          )}
                        </div>
                        <div>
                          <p className={`text-[10px] font-bold uppercase tracking-[0.16em] mb-2 ${t.statLabel}`}>Links</p>
                          {profileContactLinkItems.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {profileContactLinkItems.map((item) => (
                                <a
                                  key={item.key}
                                  href={item.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${t.chip}`}
                                >
                                  {item.label}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className={`text-[13px] italic ${dark ? "text-gray-500" : "text-gray-500"}`}>No links shared</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : memberSince ? (
                  <p className={`text-[12px] font-medium ${t.contactSub}`}>
                    Member since {memberSince}
                  </p>
                ) : null}
              </div>
            </SectionCard>
          </div>

          {/* Skills */}
          {profile.skills?.length > 0 && !isWriter(profile.role) && (
            <div className="py-6 first:pt-0 last:pb-0">
              <SectionCard
                dark={dark}
                title="Skills & Expertise"
                noBox
                icon={
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                    />
                  </svg>
                }
              >
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.skills.map((skill, i) => (
                    <span
                      key={i}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${t.chip}`}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {/* Competition badges + history — self-hiding when there are none. */}
          <CompetitionAchievements
            userId={profile._id}
            badges={profile.badges}
            className="py-6 first:pt-0 last:pb-0"
          />

          {/* INVESTOR-SPECIFIC SECTIONS */}
          {profile.role === "investor" && (
            <>
              {/* Professional Info */}
              <div className="py-6 first:pt-0 last:pb-0">
                <SectionCard
                  dark={dark}
                  title="Professional Info"
                  noBox
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  }
                >
                  <div className="space-y-3 mt-2">
                    <InfoRow dark={dark} label="Company" value={profile.industryProfile?.company || <span className={`italic ${dark ? "text-white/20" : "text-gray-300"}`}>Not set</span>} />
                    <InfoRow dark={dark} label="Job Title" value={profile.industryProfile?.jobTitle || <span className={`italic ${dark ? "text-white/20" : "text-gray-300"}`}>Not set</span>} />
                    <InfoRow
                      dark={dark}
                      label="Sub-Role"
                      value={profile.industryProfile?.subRole
                        ? formatIndustrySubRole(profile.industryProfile.subRole, profile.industryProfile?.subRoleOther)
                        : <span className={`italic ${dark ? "text-white/20" : "text-gray-300"}`}>Not set</span>}
                    />
                  </div>
                </SectionCard>
              </div>

              {/* Investment Mandates — full width */}
              <div className="py-6 first:pt-0 last:pb-0">
                <SectionCard
                  dark={dark}
                  title="Investment Mandates"
                  noBox
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                  }
                >
                  <div className="space-y-4 mt-2">
                    {/* Genres */}
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2 ${dark ? "text-white/30" : "text-gray-400"}`}>Preferred Genres</p>
                      {profile.industryProfile?.mandates?.genres?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {profile.industryProfile.mandates.genres.map((g, i) => (
                            <span key={i} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${dark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{g}</span>
                          ))}
                        </div>
                      ) : (
                        <p className={`text-[12px] italic ${dark ? "text-white/20" : "text-gray-300"}`}>No genres selected</p>
                      )}
                    </div>
                    {/* Formats */}
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2 ${dark ? "text-white/30" : "text-gray-400"}`}>Formats</p>
                      {profile.industryProfile?.mandates?.formats?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {profile.industryProfile.mandates.formats.map((f, i) => (
                            <span key={i} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${dark ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-cyan-50 text-cyan-700 border-cyan-200"}`}>{f}</span>
                          ))}
                        </div>
                      ) : (
                        <p className={`text-[12px] italic ${dark ? "text-white/20" : "text-gray-300"}`}>No formats selected</p>
                      )}
                    </div>
                    {/* Hooks */}
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2 ${dark ? "text-white/30" : "text-gray-400"}`}>Looking For</p>
                      {profile.industryProfile?.mandates?.specificHooks?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {profile.industryProfile.mandates.specificHooks.map((h, i) => (
                            <span key={i} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${dark ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-purple-50 text-purple-700 border-purple-200"}`}>{h}</span>
                          ))}
                        </div>
                      ) : (
                        <p className={`text-[12px] italic ${dark ? "text-white/20" : "text-gray-300"}`}>No hooks specified</p>
                      )}
                    </div>
                    {/* Excluded */}
                    {profile.industryProfile?.mandates?.excludeGenres?.length > 0 && (
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2 ${dark ? "text-white/30" : "text-gray-400"}`}>Excluded Genres</p>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.industryProfile.mandates.excludeGenres.map((g, i) => (
                            <span key={i} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${dark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200"}`}>{g}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>
            </>
          )}

          {/* Writer-specific sections */}
          {isWriter(profile.role) && profile.writerProfile && (
            <>
              {/* Writer Info + WGA Status */}
              <div className="py-6 first:pt-0 last:pb-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Writer Info Card */}
                <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                  <SectionCard
                    dark={dark}
                    title="Writer Profile"
                    noBox
                    badge={profile.writerProfile.plan === "paid" ? <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${dark ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"}`}>PRO</span> : null}
                    icon={
                      <svg className={`w-4 h-4`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    }
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      <div className={`rounded-xl p-4 ${t.subtleBg}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 ${dark ? "text-white/25" : "text-gray-400"}`}>Representation</p>
                        <p className={`text-[14px] font-bold capitalize ${dark ? "text-white/80" : "text-gray-800"}`}>
                          {(profile.writerProfile.representationStatus || "unrepresented").replace(/_/g, " & ")}
                        </p>
                        {profile.writerProfile.agencyName && (
                          <p className={`text-[12px] mt-1 ${dark ? "text-white/40" : "text-gray-500"}`}>{profile.writerProfile.agencyName}</p>
                        )}
                      </div>
                      {profile.writerProfile.legalName && (
                        <div className={`rounded-xl p-4 ${t.subtleBg}`}>
                          <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 ${dark ? "text-white/25" : "text-gray-400"}`}>Legal Name</p>
                          <p className={`text-[14px] font-bold ${dark ? "text-white/80" : "text-gray-800"}`}>{profile.writerProfile.legalName}</p>
                        </div>
                      )}
                      {memberSince && (
                        <div className={`rounded-xl p-4 ${t.subtleBg}`}>
                          <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 ${dark ? "text-white/25" : "text-gray-400"}`}>Career Since</p>
                          <p className={`text-[14px] font-bold ${dark ? "text-white/80" : "text-gray-800"}`}>{memberSince}</p>
                        </div>
                      )}
                    </div>
                  </SectionCard>
                </div>

                {/* WGA Status Card */}
                <div className="col-span-1">
                  <SectionCard
                    dark={dark}
                    title="Guild Memberships"
                    noBox
                    icon={
                      <svg className={`w-4 h-4`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    }
                  >
                    <div className="mt-2 space-y-4">
                      <p className={`text-[13px] leading-relaxed ${dark ? "text-white/40" : "text-gray-500"}`}>
                        Manage your guild affiliations and access
                      </p>

                      <div className={`h-px ${dark ? "bg-white/[0.06]" : "bg-gray-100"}`} />

                      {[
                        {
                          key: "wga",
                          label: "WGA",
                          fullName: "Writers Guild of America",
                          active: Boolean(profile.writerProfile.wgaMember),
                          iconWrap: dark ? "bg-[#4f6cf5]/14 text-[#7f96ff]" : "bg-[#eef2ff] text-[#4f6cf5]",
                          rowTone: profile.writerProfile.wgaMember ? t.wgaYes : t.wgaNo,
                          icon: (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16 18a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm8-6a4 4 0 10-3.999-4A4 4 0 0016 12zM8 12a4 4 0 10-3.999-4A4 4 0 008 12zm8 6c0-2.21-1.79-4-4-4m-4 4c0-2.21 1.79-4 4-4" />
                            </svg>
                          ),
                        },
                        {
                          key: "swa",
                          label: "SWA",
                          fullName: "Screenwriters Association",
                          active: Boolean(profile.writerProfile.sgaMember),
                          iconWrap: dark ? "bg-emerald-500/14 text-emerald-300" : "bg-emerald-50 text-emerald-500",
                          rowTone: profile.writerProfile.sgaMember ? t.wgaYes : t.wgaNo,
                          icon: (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l5 3v6c0 4.25-2.4 7.49-5 9-2.6-1.51-5-4.75-5-9V6l5-3z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 12.25h4.5M12 8.75v7" />
                            </svg>
                          ),
                        },
                      ].map((membership) => (
                        <div
                          key={membership.key}
                          className={`rounded-2xl border px-4 py-4 shadow-sm transition-colors ${dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-gray-200/80"} ${membership.rowTone}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${membership.iconWrap}`}>
                              {membership.icon}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className={`text-[14px] font-extrabold tracking-tight ${dark ? "text-white/85" : "text-gray-900"}`}>
                                {membership.label}
                              </p>
                              <p className={`text-[12px] mt-0.5 truncate ${dark ? "text-white/40" : "text-gray-500"}`}>
                                {membership.fullName}
                              </p>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`px-3 py-1 rounded-xl text-[12px] font-bold border ${membership.active ? membership.rowTone : dark ? "bg-white/[0.05] border-white/[0.06] text-white/50" : "bg-gray-100 border-gray-200 text-gray-500"}`}>
                                {membership.active ? "Verified" : "None"}
                              </span>
                              <svg className={`w-4 h-4 ${dark ? "text-white/25" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              </div>

              {/* Genres + Specialized Tags */}
              <div className="py-6 first:pt-0 last:pb-0 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Genres */}
                <SectionCard
                  dark={dark}
                  title="Genres"
                  noBox
                  badge={<span className={`text-[11px] font-semibold tabular-nums ${dark ? "text-white/25" : "text-gray-400"}`}>{profile.writerProfile.genres?.length || 0}</span>}
                  icon={
                    <svg className={`w-4 h-4`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125" />
                    </svg>
                  }
                >
                  <div className="mt-2">
                    {profile.writerProfile.genres?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {profile.writerProfile.genres.map((genre, i) => (
                          <span key={i} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${t.genreChip}`}>
                            {genre}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className={`text-[12px] italic ${dark ? "text-white/20" : "text-gray-300"}`}>No genres selected</p>
                    )}
                  </div>
                </SectionCard>

                {/* Specialized Tags */}
                <SectionCard
                  dark={dark}
                  title="Specialized Tags"
                  noBox
                  badge={<span className={`text-[11px] font-semibold tabular-nums ${dark ? "text-white/25" : "text-gray-400"}`}>{profile.writerProfile.specializedTags?.length || 0}</span>}
                  icon={
                    <svg className={`w-4 h-4`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                    </svg>
                  }
                >
                  <div className="mt-2">
                    {profile.writerProfile.specializedTags?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {profile.writerProfile.specializedTags.map((tag, i) => (
                          <span key={i} className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${t.chip}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className={`text-[12px] italic ${dark ? "text-white/20" : "text-gray-300"}`}>No tags specified</p>
                    )}
                  </div>
                </SectionCard>
              </div>

              {/* Skills Matrix — full width */}
              {profile.skills?.length > 0 && (
                <div className="py-6 first:pt-0 last:pb-0">
                  <SectionCard
                    dark={dark}
                    title="Skills & Expertise"
                    noBox
                    badge={<span className={`text-[11px] font-semibold tabular-nums ${dark ? "text-white/25" : "text-gray-400"}`}>{profile.skills.length}</span>}
                    icon={
                      <svg className={`w-4 h-4`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    }
                  >
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {profile.skills.map((skill, i) => (
                        <div key={i} className={`rounded-lg px-4 py-3 text-center cursor-default border ${dark ? "bg-white/[0.03] border-white/[0.06]" : "bg-gray-50 border-gray-200/60"}`}>
                          <p className={`text-[12px] font-bold ${dark ? "text-white/65" : "text-gray-700"}`}>{skill}</p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* Diversity Info (owner only) */}
              {isOwnProfile &&
                (profile.writerProfile.diversity?.gender ||
                  profile.writerProfile.diversity?.ethnicity) && (
                  <div className="py-6 first:pt-0 last:pb-0">
                    <SectionCard
                      dark={dark}
                      title="Diversity Information"
                      noBox
                      badge={<span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${dark ? "bg-white/[0.04] text-white/25 border border-white/[0.06]" : "bg-gray-100 text-gray-400 border border-gray-200"}`}>Private</span>}
                      icon={
                        <svg className={`w-4 h-4`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      }
                    >
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {profile.writerProfile.diversity.gender && (
                          <div className={`rounded-xl p-4 ${t.subtleBg}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-1 ${dark ? "text-white/25" : "text-gray-400"}`}>Gender</p>
                            <p className={`text-[14px] font-bold capitalize ${dark ? "text-white/70" : "text-gray-700"}`}>{profile.writerProfile.diversity.gender}</p>
                          </div>
                        )}
                        {profile.writerProfile.diversity.ethnicity && (
                          <div className={`rounded-xl p-4 ${t.subtleBg}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-1 ${dark ? "text-white/25" : "text-gray-400"}`}>Ethnicity</p>
                            <p className={`text-[14px] font-bold capitalize ${dark ? "text-white/70" : "text-gray-700"}`}>{profile.writerProfile.diversity.ethnicity}</p>
                          </div>
                        )}
                      </div>
                    </SectionCard>
                  </div>
                )}
            </>
          )}

          </>
          )}
        </Motion.div>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€ SETTINGS TAB â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "settings" && isOwnProfile && (
        <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={usesWorkspaceProfile ? "profile-workspace-panel profile-workspace-settings" : `rounded-3xl border ${t.card} p-5 sm:p-8 flex flex-col divide-y ${dark ? "divide-white/[0.06]" : "divide-gray-100"}`}>
          {usesWorkspaceProfile && (
            <header className="profile-workspace-settings__header">
              <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21h-4v-.09a1.65 1.65 0 00-1.08-1.5 1.65 1.65 0 00-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3v-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06 2.83-2.83.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3h4v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0019.4 9c.12.61.66 1.04 1.28 1.04H21v4h-.32c-.62 0-1.16.43-1.28 1z" /></svg></span>
              <div><h2>Settings</h2><p>Manage your account, communication preferences, security, and workspace history.</p></div>
            </header>
          )}
          {(settingsMsg || settingsErr) && (
            <div className={`${usesWorkspaceProfile ? "profile-workspace-settings__alerts" : "pb-6"} flex flex-col gap-3`}>
              {settingsMsg && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[13px] font-medium">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {settingsMsg}
                  <button onClick={() => setSettingsMsg("")} className="ml-auto text-emerald-400/60 hover:text-emerald-400">&times;</button>
                </div>
              )}
              {settingsErr && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] font-medium">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                  {settingsErr}
                  <button onClick={() => setSettingsErr("")} className="ml-auto text-red-400/60 hover:text-red-400">&times;</button>
                </div>
              )}
            </div>
          )}

          {/* Integrations — Google Calendar for producers/industry pros who schedule meetings */}
          {["producer", "investor", "director", "professional", "industry"].includes(String(profile?.role || "").toLowerCase()) && (
            <div className="profile-workspace-settings__section profile-workspace-settings__section--integration py-6 first:pt-0 last:pb-0">
              <SectionCard dark={dark} noBox title="Integrations" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>}>
                <GoogleCalendarCard dark={dark} />
              </SectionCard>
            </div>
          )}

          {/* Account */}
          <div className="profile-workspace-settings__section profile-workspace-settings__section--account py-6 first:pt-0 last:pb-0">
            <SectionCard dark={dark} noBox title="Account" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}>
            <div className="space-y-4">
              <div className={`profile-workspace-settings__preference flex items-center justify-between py-3 px-4 rounded-xl border ${dark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-100 bg-gray-50/60"}`}>
                <div>
                  <p className={`text-[13px] font-semibold ${dark ? "text-white/70" : "text-gray-700"}`}>Display currency</p>
                  <p className={`text-[11px] ${dark ? "text-white/25" : "text-gray-400"}`}>Prices and checkout shown in this currency</p>
                </div>
                <CurrencyToggle dark={dark} />
              </div>
              <div className={`profile-workspace-settings__preference flex items-center justify-between py-3 px-4 rounded-xl border ${dark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-100 bg-gray-50/60"}`}>
                <div>
                  <p className={`text-[13px] font-semibold ${dark ? "text-white/70" : "text-gray-700"}`}>Private Account</p>
                  <p className={`text-[11px] ${dark ? "text-white/25" : "text-gray-400"}`}>Only approved followers can see your profile</p>
                </div>
                <button aria-label="Toggle private account" aria-pressed={Boolean(profile.isPrivate)} onClick={async () => { try { setSavingSettings(true); const result = await updateAccountSettings({ isPrivate: !profile.isPrivate }); if (!result.ok) throw result.cause || new Error(result.message); setProfile({ ...profile, isPrivate: !profile.isPrivate }); setSettingsMsg("Privacy updated"); setTimeout(() => setSettingsMsg(""), 3000); } catch { setSettingsErr("Failed"); } finally { setSavingSettings(false); } }}
                  className={`profile-workspace-settings__switch w-10 h-[22px] rounded-full flex items-center px-0.5 transition-colors cursor-pointer ${profile.isPrivate ? dark ? "bg-emerald-500/30" : "bg-emerald-100" : dark ? "bg-white/[0.06]" : "bg-gray-200"}`}>
                  <div className={`w-[18px] h-[18px] rounded-full transition-all ${profile.isPrivate ? `${dark ? "bg-emerald-400" : "bg-emerald-500"} translate-x-[18px]` : `${dark ? "bg-white/30" : "bg-white"}`}`} />
                </button>
              </div>
              {isWriterUser && (
                <div className={`profile-workspace-settings__preference flex items-center justify-between py-3 px-4 rounded-xl border ${dark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-100 bg-gray-50/60"}`}>
                  <div>
                    <p className={`text-[13px] font-semibold ${dark ? "text-white/70" : "text-gray-700"}`}>Allow Industry Contact</p>
                    <p className={`text-[11px] ${dark ? "text-white/25" : "text-gray-400"}`}>Let verified industry professionals request your contact details</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Toggle industry contact access"
                    aria-pressed={profile.allowIndustryContact !== false}
                    disabled={savingSettings}
                    onClick={async () => {
                      const allowIndustryContact = profile.allowIndustryContact === false;
                      try {
                        setSavingSettings(true);
                        setSettingsErr("");
                        const result = await updateAccountSettings({ allowIndustryContact });
                        if (!result.ok) throw result.cause || new Error(result.message);
                        setProfile({ ...profile, allowIndustryContact });
                        setSettingsMsg("Contact preference updated");
                        setTimeout(() => setSettingsMsg(""), 3000);
                      } catch {
                        setSettingsErr("Failed to update contact preference");
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    className={`profile-workspace-settings__switch w-10 h-[22px] rounded-full flex items-center px-0.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${profile.allowIndustryContact !== false ? dark ? "bg-emerald-500/30" : "bg-emerald-100" : dark ? "bg-white/[0.06]" : "bg-gray-200"}`}
                  >
                    <div className={`w-[18px] h-[18px] rounded-full transition-all ${profile.allowIndustryContact !== false ? `${dark ? "bg-emerald-400" : "bg-emerald-500"} translate-x-[18px]` : `${dark ? "bg-white/30" : "bg-white"}`}`} />
                  </button>
                </div>
              )}
              <div className={`profile-workspace-settings__preference profile-workspace-settings__preference--email flex items-center justify-between py-3 px-4 rounded-xl border ${dark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-100 bg-gray-50/60"}`}>
                <div>
                  <p className={`text-[13px] font-semibold ${dark ? "text-white/70" : "text-gray-700"}`}>Email Verified</p>
                  <p className={`text-[11px] ${dark ? "text-white/25" : "text-gray-400"}`}>{profile.pendingEmail ? `Current: ${profile.email}` : profile.email}</p>
                  {profile.pendingEmail && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className={`text-[11px] ${dark ? "text-amber-300/70" : "text-amber-700"}`}>Pending: {profile.pendingEmail}</p>
                      <button onClick={() => { document.getElementById('change-email-input')?.focus(); document.getElementById('change-email-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className={`text-[10px] font-medium hover:underline ${dark ? "text-blue-400" : "text-blue-600"}`}>Edit</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(profile.pendingEmail || !profile.emailVerified) && (
                    <button
                      disabled={sendingVerificationCode || savingSettings}
                      onClick={async () => {
                        try {
                          setSendingVerificationCode(true);
                          setSettingsErr("");
                          const result = await sendAccountEmailVerification();
                          if (!result.ok) throw result.cause || new Error(result.message);
                          setVerificationCodeSent(true);
                          setSettingsMsg("Verification code sent to your email");
                          setTimeout(() => setSettingsMsg(""), 3000);
                        } catch (e) {
                          setSettingsErr(e.response?.data?.message || "Failed to send verification code");
                        } finally {
                          setSendingVerificationCode(false);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${dark ? "bg-[#1e3a5f]/30 text-blue-300 border-[#1e3a5f]/40 hover:bg-[#1e3a5f]/40 disabled:opacity-40" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 disabled:opacity-40"}`}
                    >
                      {sendingVerificationCode ? "Sending..." : "Send Code"}
                    </button>
                  )}
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${(profile.emailVerified && !profile.pendingEmail) ? dark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200" : dark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200"}`}>{(profile.emailVerified && !profile.pendingEmail) ? "Verified" : "Unverified"}</span>
                </div>
              </div>
              {(profile.pendingEmail || !profile.emailVerified) && (
                <div className={`profile-workspace-settings__form-card profile-workspace-settings__form-card--verify rounded-xl border p-4 ${dark ? "border-white/[0.06]" : "border-gray-100"}`}>
                  <p className={`text-[12px] font-bold uppercase tracking-wider mb-3 ${dark ? "text-white/30" : "text-gray-400"}`}>Verify Email</p>
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Enter 6-digit code"
                      value={emailVerificationCode}
                      onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] border outline-none transition-colors ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80 placeholder:text-white/15 focus:border-white/20" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-gray-400"}`}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        disabled={verifyingEmailCode || emailVerificationCode.length !== 6}
                        onClick={async () => {
                          try {
                            setVerifyingEmailCode(true);
                            setSettingsErr("");
                            const result = await verifyAccountEmail(emailVerificationCode);
                            if (!result.ok) throw result.cause || new Error(result.message);
                            const verifiedEmail = profile.pendingEmail || profile.email;
                            setProfile({ ...profile, email: verifiedEmail, emailVerified: true, pendingEmail: undefined });
                            setEmailVerificationCode("");
                            setVerificationCodeSent(false);
                            setSettingsMsg("Email verified successfully");
                            setTimeout(() => setSettingsMsg(""), 3000);
                          } catch (e) {
                            setSettingsErr(e.response?.data?.message || "Failed to verify email");
                          } finally {
                            setVerifyingEmailCode(false);
                          }
                        }}
                        className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${dark ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40" : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40"}`}
                      >
                        {verifyingEmailCode ? "Verifying..." : "Verify Code"}
                      </button>
                      <button
                        disabled={sendingVerificationCode || savingSettings}
                        onClick={async () => {
                          try {
                            setSendingVerificationCode(true);
                            setSettingsErr("");
                            const result = await sendAccountEmailVerification();
                            if (!result.ok) throw result.cause || new Error(result.message);
                            setVerificationCodeSent(true);
                            setSettingsMsg("Verification code resent");
                            setTimeout(() => setSettingsMsg(""), 3000);
                          } catch (e) {
                            setSettingsErr(e.response?.data?.message || "Failed to resend verification code");
                          } finally {
                            setSendingVerificationCode(false);
                          }
                        }}
                        className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${dark ? "bg-white/[0.04] text-white/70 border border-white/[0.08] hover:bg-white/[0.08] disabled:opacity-40" : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 disabled:opacity-40"}`}
                      >
                        {sendingVerificationCode ? "Sending..." : "Resend"}
                      </button>
                    </div>
                    {verificationCodeSent && (
                      <p className={`text-[11px] ${dark ? "text-white/30" : "text-gray-500"}`}>
                        A verification code was sent to {profile.pendingEmail || profile.email}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div className={`profile-workspace-settings__form-card rounded-xl border p-4 ${dark ? "border-white/[0.06]" : "border-gray-100"}`}>
                <p className={`text-[12px] font-bold uppercase tracking-wider mb-3 ${dark ? "text-white/30" : "text-gray-400"}`}>Change Email</p>
                <div className="space-y-2.5">
                  <input id="change-email-input" type="email" placeholder="New email address" value={emailForm.newEmail} onChange={e => setEmailForm({ ...emailForm, newEmail: e.target.value })} className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] border outline-none transition-colors ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80 placeholder:text-white/15 focus:border-white/20" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-gray-400"}`} />
                  <PasswordInput placeholder="Current password" value={emailForm.password} onChange={e => setEmailForm({ ...emailForm, password: e.target.value })} className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] border outline-none transition-colors ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80 placeholder:text-white/15 focus:border-white/20" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-gray-400"}`} />
                  <button disabled={savingSettings || !emailForm.newEmail || !emailForm.password} onClick={async () => { try { setSavingSettings(true); setSettingsErr(""); const result = await changeAccountEmail(emailForm, profile.email); if (!result.ok) throw result.cause || new Error(result.message); const data = result.data; setProfile({ ...profile, email: data.email, pendingEmail: data.pendingEmail, emailVerified: profile.emailVerified }); setEmailForm({ password: "", newEmail: "" }); setEmailVerificationCode(""); setVerificationCodeSent(true); setSettingsMsg(data.message || "Verification code sent to new email."); setTimeout(() => setSettingsMsg(""), 3000); } catch (e) { setSettingsErr(e.response?.data?.message || e.message || "Failed"); } finally { setSavingSettings(false); } }}
                    className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${dark ? "bg-[#1e3a5f] text-white hover:bg-[#254a75] disabled:opacity-30" : "bg-[#1e3a5f] text-white hover:bg-[#254a75] disabled:opacity-40"}`}>{savingSettings ? "Saving..." : "Update Email"}</button>
                </div>
              </div>
              <div className={`profile-workspace-settings__form-card rounded-xl border p-4 ${dark ? "border-white/[0.06]" : "border-gray-100"}`}>
                <p className={`text-[12px] font-bold uppercase tracking-wider mb-3 ${dark ? "text-white/30" : "text-gray-400"}`}>Change Password</p>
                <div className="space-y-2.5">
                  <PasswordInput placeholder="Current password" value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] border outline-none transition-colors ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80 placeholder:text-white/15 focus:border-white/20" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-gray-400"}`} />
                  <PasswordInput placeholder="New password (min 6 chars)" value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] border outline-none transition-colors ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80 placeholder:text-white/15 focus:border-white/20" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-gray-400"}`} />
                  <PasswordInput placeholder="Confirm new password" value={pwForm.confirmPassword} onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] border outline-none transition-colors ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80 placeholder:text-white/15 focus:border-white/20" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-300 focus:border-gray-400"}`} />
                  <button disabled={savingSettings || !pwForm.currentPassword || !pwForm.newPassword || pwForm.newPassword !== pwForm.confirmPassword} onClick={async () => { try { setSavingSettings(true); setSettingsErr(""); const result = await changeAccountPassword(pwForm); if (!result.ok) throw result.cause || new Error(result.message); setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setSettingsMsg("Password changed"); setTimeout(() => setSettingsMsg(""), 3000); } catch (e) { setSettingsErr(e.response?.data?.message || e.message || "Failed"); } finally { setSavingSettings(false); } }}
                    className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${dark ? "bg-[#1e3a5f] text-white hover:bg-[#254a75] disabled:opacity-30" : "bg-[#1e3a5f] text-white hover:bg-[#254a75] disabled:opacity-40"}`}>{savingSettings ? "Saving..." : "Change Password"}</button>
                </div>
              </div>
            </div>
          </SectionCard>
          </div>

          {/* Notification Preferences */}
          <div className="profile-workspace-settings__section profile-workspace-settings__section--notifications py-6 first:pt-0 last:pb-0">
            <SectionCard dark={dark} noBox title="Notification Preferences" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>}>
            <div className="space-y-2.5">
              {[{ key: "smartMatchAlerts", label: "Smart Match Alerts", desc: "When a new script matches your mandates" }, { key: "holdAlerts", label: "Hold Alerts", desc: "Option hold status updates" }, { key: "viewAlerts", label: "View Alerts", desc: "When someone views your profile" }].map((pref) => (
                <div key={pref.key} className={`profile-workspace-settings__preference flex items-center justify-between py-2.5 px-3 rounded-xl ${dark ? "bg-white/[0.02]" : "bg-gray-50/60"}`}>
                  <div><p className={`text-[13px] font-semibold ${dark ? "text-white/65" : "text-gray-700"}`}>{pref.label}</p><p className={`text-[11px] ${dark ? "text-white/25" : "text-gray-400"}`}>{pref.desc}</p></div>
                  <button aria-label={`Toggle ${pref.label}`} aria-pressed={Boolean(profile.notificationPrefs?.[pref.key])} onClick={async () => { const nv = !profile.notificationPrefs?.[pref.key]; try { const result = await updateAccountSettings({ notificationPrefs: { [pref.key]: nv } }); if (!result.ok) throw result.cause || new Error(result.message); setProfile({ ...profile, notificationPrefs: { ...profile.notificationPrefs, [pref.key]: nv } }); } catch { setSettingsErr("Failed"); } }}
                    className={`profile-workspace-settings__switch w-10 h-[22px] rounded-full flex items-center px-0.5 transition-colors cursor-pointer ${profile.notificationPrefs?.[pref.key] ? dark ? "bg-emerald-500/30" : "bg-emerald-100" : dark ? "bg-white/[0.06]" : "bg-gray-200"}`}>
                    <div className={`w-[18px] h-[18px] rounded-full transition-all ${profile.notificationPrefs?.[pref.key] ? `${dark ? "bg-emerald-400" : "bg-emerald-500"} translate-x-[18px]` : `${dark ? "bg-white/30" : "bg-white"}`}`} />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
          </div>

          {/* Devices & Sessions */}
          <div className="profile-workspace-settings__section py-6 first:pt-0 last:pb-0">
            <SectionCard dark={dark} noBox title="Devices & Sessions" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>}>
            <div className="space-y-3">
              {loadingSessions ? (
                <p className={`text-[12px] italic ${dark ? "text-white/30" : "text-gray-400"}`}>Loading sessions...</p>
              ) : sessions.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {sessions.map((s) => (
                      <div key={s.sessionId} className={`flex items-center justify-between py-3 px-3.5 rounded-xl border ${s.isCurrent ? (dark ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-100") : (dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-gray-50/60 border-gray-100")}`}>
                        <div>
                          <p className={`text-[13px] font-bold ${dark ? "text-white/80" : "text-gray-800"}`}>
                            {s.browser !== "Unknown" ? `${s.browser} on ${s.os}` : "Unknown Device"} 
                            {s.isCurrent && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-emerald-500/20 text-emerald-500">Active Now</span>}
                          </p>
                          <p className={`text-[11px] mt-0.5 ${dark ? "text-white/40" : "text-gray-500"}`}>
                            {s.location} • IP: {s.ip}
                          </p>
                          {!s.isCurrent && s.lastSeen && (
                            <p className={`text-[10px] mt-1 italic ${dark ? "text-white/30" : "text-gray-400"}`}>
                              Last seen: {new Date(s.lastSeen).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        {!s.isCurrent && (
                          <button onClick={() => handleRemoveSession(s.sessionId)} className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors ${dark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {sessions.length > 1 && (
                    <button onClick={handleRemoveAllOtherSessions} className={`w-full py-2.5 rounded-xl text-[12px] font-bold transition-colors ${dark ? "bg-white/[0.05] text-white hover:bg-white/[0.08]" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                      Log out of all other devices
                    </button>
                  )}
                </div>
              ) : (
                <p className={`text-[12px] italic ${dark ? "text-white/30" : "text-gray-400"}`}>No active sessions found.</p>
              )}
            </div>
            </SectionCard>
          </div>

          {/* Localization */}
          <div className="profile-workspace-settings__section profile-workspace-settings__section--localization py-6 first:pt-0 last:pb-0">
            <SectionCard dark={dark} noBox title="Localization" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 003 12c0-1.605.42-3.113 1.157-4.418" /></svg>}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2 ${dark ? "text-white/30" : "text-gray-400"}`}>Language</p>
                <select value={getProfileLanguageValue(profile.language)} onChange={async (e) => { const nextLanguage = getBackendLanguageValue(e.target.value); try { const result = await updateAccountSettings({ language: nextLanguage }); if (!result.ok) throw result.cause || new Error(result.message); setProfile({ ...profile, language: nextLanguage }); if (currentUser) { const updatedUser = { ...currentUser, language: nextLanguage }; setUser(updatedUser); localStorage.setItem("user", JSON.stringify(updatedUser)); } await applyLanguagePreference(nextLanguage, { forceReload: true }); setSettingsMsg("Language updated"); setTimeout(() => setSettingsMsg(""), 3000); } catch { setSettingsErr("Failed"); } }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] border outline-none cursor-pointer ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80" : "bg-white border-gray-200 text-gray-800"}`}>
                  <option value="en">English</option><option value="hi">Hindi</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="zh">Chinese</option>
                </select>
              </div>
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-2 ${dark ? "text-white/30" : "text-gray-400"}`}>Timezone</p>
                <select value={profile.timezone || "Asia/Kolkata"} onChange={async (e) => { try { const result = await updateAccountSettings({ timezone: e.target.value }); if (!result.ok) throw result.cause || new Error(result.message); setProfile({ ...profile, timezone: e.target.value }); setSettingsMsg("Timezone updated"); setTimeout(() => setSettingsMsg(""), 3000); } catch { setSettingsErr("Failed"); } }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] border outline-none cursor-pointer ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80" : "bg-white border-gray-200 text-gray-800"}`}>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option><option value="America/New_York">America/New_York (EST)</option><option value="America/Los_Angeles">America/Los_Angeles (PST)</option><option value="America/Chicago">America/Chicago (CST)</option><option value="Europe/London">Europe/London (GMT)</option><option value="Europe/Paris">Europe/Paris (CET)</option><option value="Asia/Tokyo">Asia/Tokyo (JST)</option><option value="Asia/Shanghai">Asia/Shanghai (CST)</option><option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                </select>
              </div>
            </div>
          </SectionCard>
          </div>

          {/* Blocked Users */}
          <div className="profile-workspace-settings__section profile-workspace-settings__section--blocked py-6 first:pt-0 last:pb-0">
            <SectionCard dark={dark} noBox title="Blocked Users" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" /></svg>}>
            {blockedUsers.length === 0 ? (
              <p className={`text-[12px] italic ${dark ? "text-white/25" : "text-gray-400"}`}>No blocked users.</p>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {blockedUsers.map((u) => (
                  <div key={u._id} className={`profile-workspace-settings__person-row flex items-center justify-between px-3 py-2.5 rounded-xl border ${dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-gray-50 border-gray-200"}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      {u.profileImage ? (
                        <img src={resolveImage(u.profileImage)} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${dark ? "bg-white/[0.06] text-white/70" : "bg-gray-200 text-gray-700"}`}>
                          {u.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className={`text-[13px] font-semibold truncate ${dark ? "text-white/75" : "text-gray-800"}`}>{u.name}</p>
                        <p className={`text-[11px] capitalize ${dark ? "text-white/30" : "text-gray-400"}`}>{u.role || "user"}</p>
                      </div>
                    </div>
                    <button
                      disabled={savingSettings}
                      onClick={() => handleUnblockFromSettings(u._id)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 ${dark ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"}`}
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          </div>

          {isWriterUser && (
            <div className="profile-workspace-settings__section profile-workspace-settings__section--deleted py-6 first:pt-0 last:pb-0">
            <SectionCard
              dark={dark} noBox
              title="Deleted Projects"
              badge={`${deletedScripts.length}`}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>}
            >
              {deletedScripts.length === 0 ? (
                <p className={`text-[12px] italic ${dark ? "text-white/25" : "text-gray-400"}`}>
                  No deleted projects yet.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {deletedScripts.map((script) => (
                    <div
                      key={script._id}
                      className={`profile-workspace-settings__deleted-row flex items-start gap-3 rounded-xl border px-3 py-2.5 ${dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-gray-50 border-gray-200"}`}
                    >
                      {script.coverImage ? (
                        <img
                          src={resolveImage(script.coverImage)}
                          alt={script.title}
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center ${dark ? "bg-white/[0.06] text-white/40" : "bg-gray-200 text-gray-500"}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V8.25A2.25 2.25 0 015.25 6h13.5A2.25 2.25 0 0121 8.25v8.25M3 16.5l4.586-4.586a2.25 2.25 0 013.182 0L15 16.146m6 0l-3.586-3.586a2.25 2.25 0 00-3.182 0L12 14.793" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-semibold truncate ${dark ? "text-white/80" : "text-gray-800"}`}>
                          {script.title}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${dark ? "text-white/30" : "text-gray-500"}`}>
                          {script.genre || "Unspecified genre"}
                          {script.format ? ` \u00b7 ${script.format.replace(/_/g, " ")}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${dark ? "text-red-300/70" : "text-red-600"}`}>
                          Deleted
                        </p>
                        <p className={`text-[11px] ${dark ? "text-white/30" : "text-gray-500"}`}>
                          {new Date(script.deletedAt || script.updatedAt || script.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
          )}

          {/* Danger Zone */}
          <div className="profile-workspace-settings__section profile-workspace-settings__section--danger py-6 first:pt-0 last:pb-0">
            <SectionCard dark={dark} noBox title="Danger Zone" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}>
            <div className={`profile-workspace-settings__danger-row flex items-center justify-between py-3 px-4 rounded-xl border ${dark ? "border-red-500/15 bg-red-500/[0.03]" : "border-red-100 bg-red-50/40"}`}>
              <div><p className={`text-[13px] font-semibold ${dark ? "text-red-400/80" : "text-red-600"}`}>Delete Account</p><p className={`text-[11px] ${dark ? "text-red-400/30" : "text-red-400"}`}>Permanently delete your account and all data</p></div>
              <button
                onClick={() => setShowDeleteAccountModal(true)}
                className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold border transition-colors ${dark ? "border-red-500/30 text-red-400/70 hover:bg-red-500/10" : "border-red-200 text-red-500 hover:bg-red-50"}`}
              >
                Delete
              </button>
            </div>
          </SectionCard>
          </div>

          {showDeleteAccountModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 p-4 flex items-center justify-center" onClick={() => !deletingAccount && setShowDeleteAccountModal(false)}>
              <div
                className={`w-full max-w-md rounded-2xl border p-5 ${dark ? "bg-[#0d1520] border-white/[0.08]" : "bg-white border-gray-200"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className={`text-[15px] font-extrabold mb-1 ${dark ? "text-white" : "text-gray-900"}`}>Delete Account</h3>
                <p className={`text-[12px] mb-3 ${dark ? "text-white/40" : "text-gray-500"}`}>
                  Share the reason for deletion. This is visible to admin, and your account will be deleted permanently across the platform.
                </p>
                <textarea
                  value={deleteAccountReason}
                  onChange={(e) => setDeleteAccountReason(e.target.value)}
                  rows={4}
                  placeholder="Please tell us why you are deleting your account..."
                  className={`w-full rounded-xl px-3.5 py-2.5 text-[13px] border outline-none resize-none ${dark ? "bg-white/[0.03] border-white/[0.08] text-white/80 placeholder:text-white/20" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400"}`}
                />
                <div className="mt-4 flex items-center justify-end gap-2.5">
                  <button
                    onClick={() => setShowDeleteAccountModal(false)}
                    disabled={deletingAccount}
                    className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors disabled:opacity-50 ${dark ? "bg-white/[0.06] text-white/65 hover:bg-white/[0.1]" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount}
                    className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors disabled:opacity-50 ${dark ? "bg-red-500/20 text-red-300 hover:bg-red-500/30" : "bg-red-500 text-white hover:bg-red-600"}`}
                  >
                    {deletingAccount ? "Deleting..." : "Delete Account"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Motion.div>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€ FINANCIAL TAB â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showFinancialAnalytics && isOwnProfile && activeTab === "performance" && (() => {
        /* Gather scores from all scripts */
        const scored = scripts.filter(s => s.scriptScore?.overall);
        const dims = ["plot", "characters", "dialogue", "pacing", "marketability"];
        const dimLabels = { plot: "Plot", characters: "Characters", dialogue: "Dialogue", pacing: "Pacing", marketability: "Marketability" };
        const dimColors = { plot: "#3b82f6", characters: "#8b5cf6", dialogue: "#06b6d4", pacing: "#f59e0b", marketability: "#10b981" };
        const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        const overallAvg = avg(scored.map(s => s.scriptScore.overall));
        const dimAvgs = Object.fromEntries(dims.map(d => [d, avg(scored.filter(s => s.scriptScore[d]).map(s => s.scriptScore[d]))]));
        const scoreLabel = (v) => v >= 90 ? "Exceptional" : v >= 80 ? "Excellent" : v >= 70 ? "Strong" : v >= 60 ? "Promising" : v >= 50 ? "Developing" : "Needs Work";
        const scoreColorFn = (v) => v >= 80 ? "#10b981" : v >= 60 ? "#f59e0b" : "#ef4444";
        /* Distribution buckets */
        const buckets = [{ label: "90-100", min: 90, max: 100 }, { label: "80-89", min: 80, max: 89 }, { label: "70-79", min: 70, max: 79 }, { label: "60-69", min: 60, max: 69 }, { label: "<60", min: 0, max: 59 }];
        const dist = buckets.map(b => ({ ...b, count: scored.filter(s => s.scriptScore.overall >= b.min && s.scriptScore.overall <= b.max).length }));
        const maxDist = Math.max(...dist.map(d => d.count), 1);

        return (
          <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="profile-workspace-panel space-y-4">

            {scored.length === 0 ? (
              <div className={`py-20 text-center`}>
                <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${t.emptyBg}`}>
                  <svg className={`w-6 h-6 ${t.emptyIcon}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <p className={`text-[15px] font-bold mb-1 ${t.emptyH}`}>No evaluations yet</p>
                <p className={`text-[13px] max-w-xs mx-auto ${t.emptyP}`}>Script scores will appear here once projects are evaluated.</p>
              </div>
            ) : (
              <>
                {/* â”€â”€ Overall Score Gauge + Summary â”€â”€ */}
                <div className={`rounded-2xl border p-6 sm:p-8 ${t.card}`}>
                  <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                    {/* Radial gauge */}
                    <div className="relative w-36 h-36 shrink-0">
                      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        <circle cx="60" cy="60" r="52" fill="none" stroke={dark ? "rgba(255,255,255,0.04)" : "#f3f4f6"} strokeWidth="10" />
                        <circle cx="60" cy="60" r="52" fill="none" stroke={scoreColorFn(overallAvg)} strokeWidth="10" strokeLinecap="round"
                          strokeDasharray={`${(overallAvg / 100) * 326.7} 326.7`}
                          className="transition-all duration-1000" style={{ filter: `drop-shadow(0 0 8px ${scoreColorFn(overallAvg)}40)` }} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-extrabold tabular-nums ${dark ? "text-white" : "text-gray-900"}`}>{overallAvg}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${dark ? "text-white/30" : "text-gray-400"}`}>Average</span>
                      </div>
                    </div>
                    {/* Summary stats */}
                    <div className="flex-1 text-center sm:text-left">
                      <h3 className={`text-lg font-extrabold tracking-tight mb-1 ${dark ? "text-white" : "text-gray-900"}`}>Overall Performance</h3>
                      <p className={`text-sm mb-4 ${dark ? "text-white/40" : "text-gray-500"}`}>
                        Based on {scored.length} evaluated {scored.length === 1 ? "project" : "projects"} â€” <span className="font-bold" style={{ color: scoreColorFn(overallAvg) }}>{scoreLabel(overallAvg)}</span>
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[{ label: "Best Score", value: Math.max(...scored.map(s => s.scriptScore.overall)) }, { label: "Latest", value: scored.sort((a, b) => new Date(b.scriptScore?.scoredAt || 0) - new Date(a.scriptScore?.scoredAt || 0))[0]?.scriptScore?.overall || 0 }, { label: "Projects", value: scored.length }].map(s => (
                          <div key={s.label} className={`rounded-xl p-3 border ${dark ? "bg-white/[0.03] border-white/[0.06]" : "bg-gray-50 border-gray-100"}`}>
                            <p className={`text-xl font-extrabold tabular-nums ${dark ? "text-white" : "text-gray-900"}`}>{s.value}</p>
                            <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${dark ? "text-white/25" : "text-gray-400"}`}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* â”€â”€ Dimension Breakdown Bars â”€â”€ */}
                <div className={`rounded-2xl border p-6 ${t.card}`}>
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${dark ? "bg-white/[0.05]" : "bg-[#1e3a5f]/[0.06]"}`}>
                      <svg className={`w-4 h-4 ${dark ? "text-white/40" : "text-[#1e3a5f]/60"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                    </div>
                    <h3 className={`text-[13px] font-bold ${dark ? "text-white/70" : "text-gray-800"}`}>Dimension Breakdown</h3>
                  </div>
                  <div className="space-y-4">
                    {dims.map(d => (
                      <div key={d}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-[12px] font-semibold ${dark ? "text-white/60" : "text-gray-600"}`}>{dimLabels[d]}</span>
                          <span className={`text-sm font-extrabold tabular-nums ${dark ? "text-white" : "text-gray-900"}`}>{dimAvgs[d]}</span>
                        </div>
                        <div className={`h-3 rounded-full overflow-hidden ${dark ? "bg-white/[0.06]" : "bg-gray-100"}`}>
                          <div className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${dimAvgs[d]}%`, backgroundColor: dimColors[d], boxShadow: `0 0 12px ${dimColors[d]}30` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* â”€â”€ Score Distribution â”€â”€ */}
                <div className={`rounded-2xl border p-6 ${t.card}`}>
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${dark ? "bg-white/[0.05]" : "bg-[#1e3a5f]/[0.06]"}`}>
                      <svg className={`w-4 h-4 ${dark ? "text-white/40" : "text-[#1e3a5f]/60"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                      </svg>
                    </div>
                    <h3 className={`text-[13px] font-bold ${dark ? "text-white/70" : "text-gray-800"}`}>Score Distribution</h3>
                  </div>
                  <div className="flex items-end gap-2 h-32">
                    {dist.map((b, i) => (
                      <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5">
                        <span className={`text-[11px] font-bold tabular-nums ${dark ? "text-white/50" : "text-gray-500"}`}>{b.count}</span>
                        <div className={`w-full rounded-t-lg transition-all duration-700 ${dark ? "bg-white/[0.06]" : "bg-gray-100"}`} style={{ height: "100%", position: "relative" }}>
                          <div className="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-700"
                            style={{
                              height: `${b.count ? Math.max((b.count / maxDist) * 100, 8) : 0}%`,
                              background: `linear-gradient(to top, ${["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"][i]}, ${["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"][i]}90)`,
                              boxShadow: `0 -4px 12px ${["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"][i]}20`
                            }} />
                        </div>
                        <span className={`text-[10px] font-bold ${dark ? "text-white/30" : "text-gray-400"}`}>{b.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* â”€â”€ Per-Project Score Cards â”€â”€ */}
                <div className={`rounded-2xl border p-6 ${t.card}`}>
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${dark ? "bg-white/[0.05]" : "bg-[#1e3a5f]/[0.06]"}`}>
                      <svg className={`w-4 h-4 ${dark ? "text-white/40" : "text-[#1e3a5f]/60"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <h3 className={`text-[13px] font-bold ${dark ? "text-white/70" : "text-gray-800"}`}>Project Scores</h3>
                    <span className={`ml-auto text-[11px] font-medium ${dark ? "text-white/25" : "text-gray-400"}`}>{scored.length} evaluated</span>
                  </div>
                  <div className={`rounded-3xl border ${t.card} p-5 sm:p-8 flex flex-col divide-y ${dark ? "divide-white/[0.06]" : "divide-gray-100"}`}>
                    {scored.sort((a, b) => (b.scriptScore?.overall || 0) - (a.scriptScore?.overall || 0)).map((s) => (
                      <div key={s._id} className={`rounded-xl border p-4 transition-all hover:scale-[1.01] ${dark ? "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]" : "bg-gray-50/50 border-gray-100 hover:border-gray-200"}`}>
                        <div className="flex items-center gap-4 mb-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0`}
                            style={{ backgroundColor: `${scoreColorFn(s.scriptScore.overall)}15`, color: scoreColorFn(s.scriptScore.overall) }}>
                            {s.scriptScore.overall}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-bold truncate ${dark ? "text-white" : "text-gray-900"}`}>{s.title}</h4>
                            <p className={`text-[11px] ${dark ? "text-white/30" : "text-gray-400"}`}>
                              {s.format?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())} Â· {s.scriptScore.scoredAt ? new Date(s.scriptScore.scoredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                            </p>
                          </div>
                          <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: `${scoreColorFn(s.scriptScore.overall)}15`, color: scoreColorFn(s.scriptScore.overall) }}>
                            {scoreLabel(s.scriptScore.overall)}
                          </span>
                        </div>
                        {/* Mini horizontal bars */}
                        <div className="grid grid-cols-5 gap-2">
                          {dims.map(d => (
                            <div key={d} className="text-center">
                              <div className={`h-1.5 rounded-full overflow-hidden mb-1 ${dark ? "bg-white/[0.06]" : "bg-gray-200"}`}>
                                <div className="h-full rounded-full" style={{ width: `${s.scriptScore[d] || 0}%`, backgroundColor: dimColors[d] }} />
                              </div>
                              <p className={`text-[9px] font-bold ${dark ? "text-white/30" : "text-gray-400"}`}>{dimLabels[d]}</p>
                              <p className={`text-[11px] font-extrabold tabular-nums ${dark ? "text-white/60" : "text-gray-600"}`}>{s.scriptScore[d] || "â€”"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </Motion.div>
        );
      })()}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€ FINANCIAL TAB â”€â”€â”€â”€â”€â”€â”€â”€ */}


      {showConnectionsModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowConnectionsModal(false)}
        >
          <Motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`rounded-2xl shadow-2xl max-w-md w-full border overflow-hidden ${dark ? "bg-[#0d1520] border-white/[0.08]" : "bg-white border-gray-200"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? "border-white/[0.08]" : "border-gray-100"}`}>
              <div>
                <h3 className={`text-[16px] font-extrabold ${dark ? "text-white" : "text-gray-900"}`}>{connectionsLabel}</h3>
                <p className={`text-[12px] mt-0.5 ${dark ? "text-white/35" : "text-gray-500"}`}>
                  {normalizedConnections.length} account{normalizedConnections.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setShowConnectionsModal(false)}
                className={`p-1.5 rounded-lg transition-colors ${dark ? "hover:bg-white/[0.08] text-white/45 hover:text-white/70" : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-3">
              {normalizedConnections.length === 0 ? (
                <div className={`rounded-xl border p-4 text-center ${dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-gray-50 border-gray-100"}`}>
                  <p className={`text-[13px] font-semibold ${dark ? "text-white/55" : "text-gray-700"}`}>
                    No {connectionsType} yet
                  </p>
                  <p className={`text-[12px] mt-1 ${dark ? "text-white/30" : "text-gray-400"}`}>
                    Accounts will appear here as this profile grows.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {normalizedConnections.map((user, index) => (
                    <button
                      key={user._id || `${user.name}-${index}`}
                      type="button"
                      onClick={() => handleConnectionClick(user)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${dark ? "hover:bg-white/[0.06]" : "hover:bg-[#f5f9ff]"}`}
                    >
                      {user.profileImage ? (
                        <img
                          src={resolveImage(user.profileImage)}
                          alt={user.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${dark ? "bg-white/[0.08] text-white/75" : "bg-[#e5edf8] text-[#355172]"}`}>
                          {user.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-semibold truncate ${dark ? "text-white/80" : "text-gray-900"}`}>
                          {user.name}
                        </p>
                      </div>

                      <svg className={`w-4 h-4 shrink-0 ${dark ? "text-white/25" : "text-gray-300"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Motion.div>
        </div>
      )}

      {/* Pitch Modal */}
      {showPitchModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowPitchModal(false)}
        >
          <Motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-2xl shadow-2xl max-w-lg w-full p-6 border ${dark ? "bg-[#0d1520] border-white/[0.06]" : "bg-white border-gray-200"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {pitchSuccess ? (
              <div className="text-center py-8">
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${dark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
                  <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className={`text-lg font-extrabold mb-2 ${dark ? "text-white" : "text-gray-900"}`}>Pitch Sent!</h3>
                <p className={`text-sm ${dark ? "text-white/50" : "text-gray-500"}`}>
                  Your pitch to {profile.name} was successfully submitted.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className={`text-lg font-extrabold ${dark ? "text-white" : "text-gray-900"}`}>Pitch Script</h3>
                    <p className={`text-sm mt-1 ${dark ? "text-white/50" : "text-gray-500"}`}>
                      Select a script to discuss with {profile.name}
                </p>
                  </div>
                  <button
                    onClick={() => setShowPitchModal(false)}
                    className={`p-1.5 rounded-lg transition-colors ${dark ? "hover:bg-white/[0.06] text-white/40 hover:text-white/60" : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className={`block text-[13px] font-bold mb-2 ${dark ? "text-white/70" : "text-gray-700"}`}>
                      Select Script
                    </label>
                    <select
                      value={pitchData.scriptId}
                      onChange={(e) => setPitchData({ ...pitchData, scriptId: e.target.value })}
                      className={`w-full p-3 rounded-xl border text-[13px] outline-none transition-all ${
                        dark 
                          ? "bg-white/[0.03] border-white/[0.06] text-white focus:bg-white/[0.05] focus:border-white/20" 
                          : "bg-gray-50 border-gray-200 text-gray-800 focus:bg-white focus:border-[#8a3324]"
                      }`}
                    >
                      <option value="">-- Choose a script --</option>
                      {myScripts.filter(s => s.status !== "draft").map(script => (
                        <option key={script._id} value={script._id}>{script.title}</option>
                      ))}
                    </select>
                  </div>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={`block text-[13px] font-bold mb-2 ${dark ? "text-white/70" : "text-gray-700"}`}>
                        Currency
                      </label>
                      <select
                        value={pitchData.currency || "INR"}
                        onChange={(e) => setPitchData({ ...pitchData, currency: e.target.value })}
                        className={`w-full p-3 rounded-xl border text-[13px] outline-none transition-all ${
                          dark 
                            ? "bg-white/[0.03] border-white/[0.06] text-white focus:border-[#a04030]" 
                            : "bg-gray-50 border-gray-200 text-gray-800 focus:bg-white focus:border-[#8a3324]"
                        }`}
                      >
                        <option value="INR">INR (?)</option>
                        <option value="USD">USD ($)</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block text-[13px] font-bold mb-2 ${dark ? "text-white/70" : "text-gray-700"}`}>
                        Duration
                      </label>
                      <select
                        value={pitchData.duration}
                        onChange={(e) => setPitchData({ ...pitchData, duration: e.target.value })}
                        className={`w-full p-3 rounded-xl border text-[13px] outline-none transition-all ${
                          dark 
                            ? "bg-white/[0.03] border-white/[0.06] text-white focus:border-[#a04030]" 
                            : "bg-gray-50 border-gray-200 text-gray-800 focus:bg-white focus:border-[#8a3324]"
                        }`}
                      >
                        <option value="">-- Select Duration --</option>
                        <option value="30">30 Min - {(!pitchData.currency || pitchData.currency === "INR") ? "?8000" : "$9"}</option>
                        <option value="60">1 Hour - {(!pitchData.currency || pitchData.currency === "INR") ? "?15000" : "$16"}</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={`block text-[13px] font-bold mb-2 ${dark ? "text-white/70" : "text-gray-700"}`}>
                        Preferred Date
                      </label>
                      <input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        value={pitchData.date}
                        onChange={(e) => setPitchData({ ...pitchData, date: e.target.value })}
                        className={`w-full p-3 rounded-xl border text-[13px] outline-none transition-all ${pitchData.date ? "font-bold text-[#8a3324]" : ""} ${
                          dark 
                            ? "bg-white/[0.03] border-white/[0.06] text-white focus:border-[#a04030] shadow-sm" 
                            : "bg-gray-50 border-gray-200 text-gray-800 focus:bg-white focus:border-[#8a3324] shadow-sm"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[13px] font-bold mb-2 ${dark ? "text-white/70" : "text-gray-700"}`}>
                        Preferred Time
                      </label>
                      <input
                        type="time"
                        value={pitchData.time}
                        onChange={(e) => setPitchData({ ...pitchData, time: e.target.value })}
                        className={`w-full p-3 rounded-xl border text-[13px] outline-none transition-all ${pitchData.time ? "font-bold text-[#8a3324]" : ""} ${
                          dark 
                            ? "bg-white/[0.03] border-white/[0.06] text-white focus:border-[#a04030] shadow-sm" 
                            : "bg-gray-50 border-gray-200 text-gray-800 focus:bg-white focus:border-[#8a3324] shadow-sm"
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-[13px] font-bold mb-2 ${dark ? "text-white/70" : "text-gray-700"}`}>
                      Pitch Note (Optional)
                    </label>
                    <textarea
                      value={pitchData.note}
                      onChange={(e) => setPitchData({ ...pitchData, note: e.target.value })}
                      placeholder="Add a brief note about why this fits their mandate..."
                      className={`w-full min-h-[100px] p-3 rounded-xl border text-[13px] outline-none resize-none transition-all ${
                        dark 
                          ? "bg-white/[0.03] border-white/[0.06] text-white focus:bg-white/[0.05] focus:border-white/20 placeholder-white/20" 
                          : "bg-gray-50 border-gray-200 text-gray-800 focus:bg-white focus:border-[#8a3324] placeholder-gray-400"
                      }`}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPitchModal(false)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                      dark ? "bg-white/[0.07] text-white/70 hover:bg-white/[0.12]" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendPitch}
                    disabled={!pitchData.scriptId || sendingPitch}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      dark ? "bg-[#a04030] text-white hover:bg-[#8a3324]" : "bg-[#8a3324] text-white hover:bg-[#6a2519] shadow-md"
                    }`}
                  >
                    {sendingPitch ? "Sending..." : "Book Consultation"}
                  </button>
                </div>
              </>
            )}
          </Motion.div>
        </div>
      )}

      {/* Message Request Modal */}
      {showMessageRequestModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowMessageRequestModal(false)}
        >
          <Motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-2xl shadow-2xl max-w-lg w-full p-6 border ${dark ? "bg-[#0d1520] border-white/[0.06]" : "bg-white border-gray-200"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {requestSuccess ? (
              <div className="text-center py-8">
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${dark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
                  <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className={`text-lg font-extrabold mb-2 ${dark ? "text-white" : "text-gray-900"}`}>Request Sent!</h3>
                <p className={`text-sm ${dark ? "text-white/50" : "text-gray-500"}`}>
                  Your message request has been sent to {profile.name}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className={`text-lg font-extrabold ${dark ? "text-white" : "text-gray-900"}`}>
                      Send Message Request
                    </h3>
                    <p className={`text-sm mt-1 ${dark ? "text-white/50" : "text-gray-500"}`}>
                      Introduce yourself to {profile.name}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowMessageRequestModal(false)}
                    className={`p-1.5 rounded-lg transition-colors ${dark ? "hover:bg-white/[0.06] text-white/40 hover:text-white/60" : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mb-4">
                  <label className={`block text-sm font-semibold mb-2 ${dark ? "text-white/70" : "text-gray-700"}`}>
                    Your Message
                  </label>
                  <textarea
                    ref={messageTextareaRef}
                    value={messageRequestText}
                    onChange={(e) => {
                      setMessageRequestText(e.target.value);
                      const next = e.target;
                      next.style.height = "auto";
                      next.style.height = `${Math.min(next.scrollHeight, 220)}px`;
                    }}
                    placeholder="Tell them about your work and why you'd like to connect..."
                    rows={3}
                    className={`w-full px-4 py-3 rounded-xl text-sm border outline-none transition-colors resize-none overflow-hidden ${
                      dark
                        ? "bg-white/[0.03] border-white/[0.08] text-white/80 placeholder:text-white/25 focus:border-white/20"
                        : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-blue-400"
                    }`}
                    maxLength={500}
                  />
                  <p className={`text-xs mt-1.5 ${dark ? "text-white/30" : "text-gray-400"}`}>
                    {messageRequestText.length}/500 characters
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowMessageRequestModal(false)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                      dark
                        ? "bg-white/[0.07] text-white/70 hover:bg-white/[0.12]"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendMessageRequest}
                    disabled={!messageRequestText.trim() || sendingRequest}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      dark
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-blue-500 text-white hover:bg-blue-600 shadow-md"
                    }`}
                  >
                    {sendingRequest ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Sending...
                      </span>
                    ) : (
                      "Send Request"
                    )}
                  </button>
                </div>
              </>
            )}
          </Motion.div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEditModal(false)}
          onUpdate={(updatedData) => {
            const mergedProfile = { ...profile, ...updatedData };
            setProfile(mergedProfile);

            if (isOwnProfile && currentUser) {
              const nextSessionUser = {
                ...currentUser,
                ...updatedData,
                profileCompletion: updatedData.profileCompletion || mergedProfile.profileCompletion || currentUser.profileCompletion,
              };
              setUser(nextSessionUser);
              localStorage.setItem("user", JSON.stringify(nextSessionUser));
            }

            setShowEditModal(false);
          }}
        />
      )}
    </ProfileRoot>
  );
};

export default Profile;
