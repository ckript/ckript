import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { useDarkMode } from "../context/DarkModeContext";
import { AuthContext } from "../context/AuthContext";
import publicApi from "../services/publicApi";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { getScriptCanonicalPath } from "../utils/scriptPath";
import RequestCollabButton from "../components/collab/RequestCollabButton";
import { getApiBaseUrl } from "../utils/apiOrigin";
import { getScriptWriters, formatWriterNames } from "../utils/writerCredits";
import {
  getScriptCompletionBadgeClasses,
  getScriptCompletionFuturePlans,
  getScriptCompletionProgressText,
  getScriptCompletionStatusLabel,
} from "../utils/scriptCompletion";

const SOCKET_ORIGIN = getApiBaseUrl().replace(/\/api\/?$/, "").replace(/\/$/, "");
const ROLE_LABELS = {
  writer: "Writer",
  editor: "Editor",
  merger: "Merger",
  viewer: "Viewer",
  full_admin: "Admin",
};
const getRoleLabel = (value = "") => ROLE_LABELS[String(value || "").trim().toLowerCase()] || value || "Collaborator";

const PublicScript = () => {
  const { id } = useParams();
  const location = useLocation();
  const { isDarkMode: dark } = useDarkMode();
  const { user, loading: authLoading } = useContext(AuthContext);

  const [script, setScript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshingCollaborators, setRefreshingCollaborators] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const fetchPublicScript = useCallback(async ({ silent = false } = {}) => {
    if (!id) {
      setLoading(false);
      setError("Invalid project link.");
      return;
    }

    try {
      if (silent) {
        setRefreshingCollaborators(true);
      } else {
        setLoading(true);
      }

      setError("");
      const { data } = await publicApi.get(`/scripts/public/${id}`);
      setScript(data || null);
    } catch (err) {
      const apiMessage = err?.response?.data?.message;
      setError(apiMessage || "This shared project is unavailable.");
    } finally {
      if (silent) {
        setRefreshingCollaborators(false);
      } else {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      return () => {
        cancelled = true;
      };
    }

    const loadInitialScript = async () => {
      try {
        await fetchPublicScript();
      } finally {
        if (cancelled) return;
      }
    };

    if (id) {
      loadInitialScript();
    } else {
      setLoading(false);
      setError("Invalid project link.");
    }

    return () => {
      cancelled = true;
    };
  }, [authLoading, fetchPublicScript, id]);

  useEffect(() => {
    if (authLoading || !id) return undefined;

    const refreshCollaborators = () => {
      fetchPublicScript({ silent: true });
    };

    const intervalId = window.setInterval(refreshCollaborators, 5000);
    const handleFocus = () => refreshCollaborators();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshCollaborators();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authLoading, fetchPublicScript, id]);

  useEffect(() => {
    if (!user?.token || !script?._id) return undefined;

    const socket = io(SOCKET_ORIGIN, {
      auth: { token: user.token },
    });
    const refreshCollaborators = () => {
      fetchPublicScript({ silent: true });
    };

    socket.on("connect", () => {
      socket.emit("join_script", { scriptId: script._id });
    });

    socket.on("collab_membership_changed", (payload = {}) => {
      if (String(payload.scriptId || "") === String(script._id)) {
        refreshCollaborators();
      }
    });
    socket.on("collaborator_removed", () => {
      refreshCollaborators();
    });
    socket.on("collab_request_responded", (payload = {}) => {
      if (String(payload.scriptId || "") === String(script._id)) {
        refreshCollaborators();
      }
    });

    return () => {
      socket.emit("leave_script", { scriptId: script._id });
      socket.disconnect();
    };
  }, [fetchPublicScript, script?._id, user?.token]);

  const loginLink = useMemo(() => {
    const next = `${location.pathname}${location.search || ""}`;
    return `/login?next=${encodeURIComponent(next)}`;
  }, [location.pathname, location.search]);

  if (user && !authLoading && script) {
    return <Navigate to={getScriptCanonicalPath(script)} replace />;
  }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? "bg-[#060e1a]" : "bg-[#f5f7fb]"}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
          <p className={`text-sm font-semibold ${dark ? "text-gray-300" : "text-gray-700"}`}>Loading shared project...</p>
        </div>
      </div>
    );
  }

  if (!script || error) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-4 ${dark ? "bg-[#060e1a]" : "bg-[#f5f7fb]"}`}>
        <div className={`max-w-md w-full rounded-2xl border p-6 text-center ${dark ? "bg-[#0f1d35] border-[#1a3050]" : "bg-white border-gray-200 shadow-sm"}`}>
          <h1 className={`text-xl font-extrabold ${dark ? "text-white" : "text-gray-900"}`}>Shared Project Unavailable</h1>
          <p className={`mt-2 text-sm ${dark ? "text-gray-300" : "text-gray-600"}`}>{error || "This link may be expired or private."}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Link to="/" className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">Go Home</Link>
            <Link to={loginLink} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}>Login</Link>
          </div>
        </div>
      </div>
    );
  }

  const coverUrl = resolveMediaUrl(script.coverImage);
  const trailerUrl = resolveMediaUrl(script.uploadedTrailerUrl || script.trailerUrl);
  const classification = script.classification || {};
  const evaluation = script.evaluation || null;
  const roles = Array.isArray(script.roles) ? script.roles : [];
  const creatorProfileKey = String(script?.creator?.username || "").trim().toLowerCase() || String(script?.creator?._id || "").trim();
  // Byline = linked owner + any additional credited writers.
  const coWriterCredit = formatWriterNames(
    getScriptWriters(script)
      .filter((w) => String(w.name).trim().toLowerCase() !== String(script?.creator?.name || "").trim().toLowerCase())
      .map((w) => w.name),
    { max: 2 }
  );
  const completionLabel = getScriptCompletionStatusLabel(script);
  const completionProgress = getScriptCompletionProgressText(script);
  const completionFuturePlans = getScriptCompletionFuturePlans(script);
  const isOpenForCollab = script?.collabVisibility === "open";
  const collaborationStats = script?.collaborationStats || {};
  const collaborationSummary = script?.collaborationSummary || {};
  const writersWorked = Array.isArray(collaborationSummary?.writersWorked) ? collaborationSummary.writersWorked : [];
  const activeWriters = Array.isArray(collaborationSummary?.activeWriters) ? collaborationSummary.activeWriters : [];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "classification", label: "Classification" },
    { id: "evaluation", label: "Evaluation" },
    { id: "roles", label: "Roles" },
    { id: "synopsis", label: "Synopsis" },
  ];

  const formatBudget = (value) => {
    const normalized = String(value || "").toLowerCase();
    const map = {
      micro: "Micro (<₹1Cr)",
      low: "Low (₹1Cr-₹10Cr)",
      medium: "Medium (₹10Cr-₹150Cr)",
      high: "High (₹150Cr-₹750Cr)",
      blockbuster: "Blockbuster (₹750Cr+)",
    };
    return map[normalized] || "-";
  };

  return (
    <div className={`min-h-screen ${dark ? "bg-[#060e1a]" : "bg-[#f5f7fb]"}`}>
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 sm:py-10">
        <div className={`rounded-3xl border overflow-hidden ${dark ? "bg-[#0f1d35] border-[#1a3050]" : "bg-white border-gray-200 shadow-sm"}`}>
          <div className={`aspect-[16/6] ${dark ? "bg-[#0a1322]" : "bg-gray-100"}`}>
            {coverUrl ? <img src={coverUrl} alt={script.title || "Project"} className="w-full h-full object-cover" /> : null}
          </div>

          <div className="p-5 sm:p-8">
            <p className={`text-[11px] uppercase tracking-wider font-bold ${dark ? "text-blue-200" : "text-blue-700"}`}>Shared Project</p>
            <h1 className={`mt-1 text-2xl sm:text-3xl font-extrabold leading-tight ${dark ? "text-white" : "text-gray-900"}`}>{script.title || "Untitled Project"}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {script.primaryGenre || script.genre ? (
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${dark ? "bg-blue-500/15 text-blue-200" : "bg-blue-100 text-blue-700"}`}>
                  {script.primaryGenre || script.genre}
                </span>
              ) : null}
              {script.format ? (
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${dark ? "bg-white/10 text-gray-200" : "bg-gray-100 text-gray-700"}`}>
                  {script.formatOther || script.format}
                </span>
              ) : null}
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getScriptCompletionBadgeClasses(script, dark)}`}>
                {completionLabel}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${dark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-700"}`}>
                Price: ₹{Number(script.price || 0).toLocaleString("en-IN")}
              </span>
              {isOpenForCollab ? (
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${dark ? "bg-teal-500/15 text-teal-200" : "bg-teal-100 text-teal-700"}`}>
                  Open for Collaboration • Request Collaboration
                </span>
              ) : null}
            </div>

            <div className={`mt-4 text-sm ${dark ? "text-gray-300" : "text-gray-700"}`}>
              <span className="font-semibold">By </span>
              {creatorProfileKey ? (
                <Link to={`/share/profile/${encodeURIComponent(creatorProfileKey)}`} className={`font-bold hover:underline ${dark ? "text-white" : "text-gray-900"}`}>
                  {script.creator?.name || "Creator"}
                </Link>
              ) : (
                <span className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>{script.creator?.name || "Creator"}</span>
              )}
              {coWriterCredit && <span> &amp; {coWriterCredit}</span>}
            </div>

            <div className={`mt-6 rounded-xl p-1 border flex flex-wrap gap-1 ${dark ? "bg-[#0b1426] border-[#1a3050]" : "bg-blue-50/60 border-blue-100"}`}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${activeTab === tab.id
                    ? dark
                      ? "bg-blue-500/20 text-blue-100"
                      : "bg-white text-blue-700 shadow-sm"
                    : dark
                      ? "text-gray-300 hover:bg-white/10"
                      : "text-gray-600 hover:bg-white/70"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className={`mt-5 rounded-2xl border p-4 sm:p-5 space-y-6 ${dark ? "bg-[#0b1426] border-[#1a3050]" : "bg-[#f8fafc] border-gray-200"}`}>
              {activeTab === "overview" && (
              <section>
                <h2 className={`text-sm uppercase tracking-wider font-extrabold ${dark ? "text-gray-200" : "text-gray-800"}`}>Overview</h2>
                <div className="mt-3 space-y-4">
                  {script.logline ? (
                    <p className={`text-base sm:text-lg font-bold leading-relaxed ${dark ? "text-white" : "text-gray-900"}`}>{script.logline}</p>
                  ) : (
                    <p className={`text-sm ${dark ? "text-gray-300" : "text-gray-700"}`}>No logline available.</p>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Format</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{script.formatOther || script.format || "-"}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Genre</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{script.primaryGenre || script.genre || "-"}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Pages</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{script.pageCount || "-"}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Completion</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{completionProgress ? `${completionLabel} · ${completionProgress}` : completionLabel}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Budget</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{formatBudget(script.budget)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={`rounded-xl border px-3 py-3 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Writers Worked</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{Number(collaborationStats.totalWritersWorked || writersWorked.length || 1)}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-3 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Still Working</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{Number(collaborationStats.activeWritersWorking || activeWriters.length || 1)}</p>
                    </div>
                  </div>

                  <div className={`rounded-2xl border p-4 transition-all duration-300 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className={`text-sm font-extrabold ${dark ? "text-white" : "text-gray-900"}`}>
                          {writersWorked.length || 1} Writers Worked on this Script
                        </p>
                        <p className={`mt-1 text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
                          Roles stay synced live as collaborators are added, updated, or removed.
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity duration-300 ${dark ? "bg-blue-500/15 text-blue-200" : "bg-blue-50 text-blue-700"} ${refreshingCollaborators ? "opacity-100" : "opacity-70"}`}>
                        {refreshingCollaborators ? "Updating..." : "Live"}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {writersWorked.map((entry) => (
                        <div
                          key={`${entry.userId || entry.name}-${entry.role}`}
                          className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 transition-all duration-300 ${dark ? "border-white/10 bg-[#101b30]" : "border-gray-100 bg-[#f8fafc]"}`}
                        >
                          <p className={`text-sm font-semibold ${dark ? "text-gray-100" : "text-gray-900"}`}>
                            {entry.name || "Collaborator"}
                          </p>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${dark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`}>
                            {getRoleLabel(entry.role)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5">
                      <p className={`text-sm font-extrabold ${dark ? "text-white" : "text-gray-900"}`}>
                        Currently Active Writers ({activeWriters.length || 1})
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeWriters.map((entry) => (
                          <span
                            key={`active-${entry.userId || entry.name}`}
                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-300 ${dark ? "bg-white/10 text-gray-100" : "bg-gray-100 text-gray-800"}`}
                          >
                            {entry.name || "Collaborator"}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {completionFuturePlans ? (
                    <div className={`rounded-xl border px-3 py-3 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Future Updates</p>
                      <p className={`text-sm mt-1 leading-relaxed ${dark ? "text-gray-300" : "text-gray-700"}`}>{completionFuturePlans}</p>
                    </div>
                  ) : null}

                  {script.description ? (
                    <p className={`text-sm leading-relaxed ${dark ? "text-gray-300" : "text-gray-700"}`}>{script.description}</p>
                  ) : null}

                  {Array.isArray(script.tags) && script.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {script.tags.map((tag) => (
                        <span key={tag} className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${dark ? "bg-white/10 text-gray-200" : "bg-white border border-gray-200 text-gray-700"}`}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>
              )}

              {activeTab === "classification" && (
              <section>
                <h2 className={`text-sm uppercase tracking-wider font-extrabold ${dark ? "text-gray-200" : "text-gray-800"}`}>Classification</h2>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Primary Genre</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{classification.primaryGenre || script.primaryGenre || script.genre || "-"}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>Secondary Genre</p>
                      <p className={`text-sm font-bold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{classification.secondaryGenre || "-"}</p>
                    </div>
                  </div>

                  {[
                    { label: "Tones", items: classification.tones },
                    { label: "Themes", items: classification.themes },
                    { label: "Settings", items: classification.settings },
                  ].map((group) => (
                    <div key={group.label}>
                      <p className={`text-xs uppercase font-extrabold tracking-wider mb-2 ${dark ? "text-gray-300" : "text-gray-700"}`}>{group.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {(Array.isArray(group.items) && group.items.length > 0 ? group.items : ["-"]).map((item, idx) => (
                          <span key={`${group.label}-${item}-${idx}`} className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${dark ? "bg-white/10 text-gray-200" : "bg-white border border-gray-200 text-gray-700"}`}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {activeTab === "evaluation" && (
              <section>
                <h2 className={`text-sm uppercase tracking-wider font-extrabold ${dark ? "text-gray-200" : "text-gray-800"}`}>Evaluation</h2>
                <div className="mt-3 space-y-4">
                  {evaluation ? (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          ["Overall", evaluation.overall],
                          ["Plot", evaluation.plot],
                          ["Characters", evaluation.characters],
                          ["Dialogue", evaluation.dialogue],
                          ["Pacing", evaluation.pacing],
                          ["Marketability", evaluation.marketability],
                        ].map(([label, value]) => (
                          <div key={label} className={`rounded-xl border px-3 py-2 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                            <p className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-400" : "text-gray-500"}`}>{label}</p>
                            <p className={`text-base font-extrabold mt-1 ${dark ? "text-white" : "text-gray-900"}`}>{Number(value || 0)}</p>
                          </div>
                        ))}
                      </div>
                      {evaluation.feedback ? (
                        <p className={`text-sm leading-relaxed ${dark ? "text-gray-300" : "text-gray-700"}`}>{evaluation.feedback}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className={`text-sm ${dark ? "text-gray-300" : "text-gray-700"}`}>No evaluation available for this shared project.</p>
                  )}
                </div>
              </section>
              )}

              {activeTab === "roles" && (
              <section>
                <h2 className={`text-sm uppercase tracking-wider font-extrabold ${dark ? "text-gray-200" : "text-gray-800"}`}>Roles</h2>
                <div className="mt-3 space-y-3">
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <div key={role._id || `${role.characterName}-${role.type}`} className={`rounded-xl border p-3 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className={`text-sm font-extrabold ${dark ? "text-white" : "text-gray-900"}`}>{role.characterName || "Unnamed Role"}</h3>
                          {role.gender ? (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${dark ? "bg-white/10 text-gray-200" : "bg-gray-100 text-gray-700"}`}>{role.gender}</span>
                          ) : null}
                        </div>
                        {role.type ? <p className={`mt-1 text-xs font-semibold ${dark ? "text-blue-200" : "text-blue-700"}`}>{role.type}</p> : null}
                        {role.description ? <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-gray-300" : "text-gray-700"}`}>{role.description}</p> : null}
                        {(role.ageRange?.min || role.ageRange?.max) ? (
                          <p className={`mt-2 text-xs font-semibold ${dark ? "text-gray-300" : "text-gray-600"}`}>
                            Age: {role.ageRange?.min || "-"} - {role.ageRange?.max || "-"}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className={`text-sm ${dark ? "text-gray-300" : "text-gray-700"}`}>No roles listed for this shared project.</p>
                  )}
                </div>
              </section>
              )}

              {activeTab === "synopsis" && (
              <section>
                <h2 className={`text-sm uppercase tracking-wider font-extrabold ${dark ? "text-gray-200" : "text-gray-800"}`}>Synopsis</h2>
                <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-gray-300" : "text-gray-700"}`}>{script.synopsis || "No synopsis available."}</p>
              </section>
              )}
            </div>

            {trailerUrl ? (
              <div className="mt-6">
                <h2 className={`text-sm uppercase tracking-wider font-extrabold ${dark ? "text-gray-200" : "text-gray-800"}`}>Trailer</h2>
                <video className="mt-2 w-full rounded-xl border border-black/10" controls preload="metadata" src={trailerUrl} />
              </div>
            ) : null}

            {isOpenForCollab ? (
              <div className="mt-6">
                <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${dark ? "text-teal-200" : "text-teal-700"}`}>
                  Request Collaboration
                </p>
                <RequestCollabButton script={script} />
              </div>
            ) : null}

            <div className={`mt-7 rounded-2xl border p-4 ${dark ? "bg-[#0b1426] border-[#1a3050]" : "bg-[#f8fafc] border-gray-200"}`}>
              <p className={`text-sm font-semibold ${dark ? "text-gray-200" : "text-gray-800"}`}>
                Want full project access and direct collaboration options?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={loginLink} className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">Login / Sign Up</Link>
                <Link to={getScriptCanonicalPath(script)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-gray-800 border border-gray-200 hover:bg-gray-50"}`}>
                  Open Full Page
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicScript;
