import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Save, ArrowLeft, Eye, MoreVertical, UploadCloud, LayoutDashboard, Palette, Clock, CheckSquare, Trophy, Users, Star, MessageSquare, Download, Link2, Bell, Award, Mail, Settings, Activity, ClipboardCheck } from "lucide-react";
import { adminApi } from "../../AdminDashboard";
import OverviewModule from "./modules/OverviewModule";
import BrandingModule from "./modules/BrandingModule";
import TimelineModule from "./modules/TimelineModule";
import ThemeModule from "./modules/ThemeModule";
import PrizesModule from "./modules/PrizesModule";
import JudgesModule from "./modules/JudgesModule";
import JudgingModule from "./modules/JudgingModule";
import SponsorsModule from "./modules/SponsorsModule";
import CommunityModule from "./modules/CommunityModule";
import ResourcesModule from "./modules/ResourcesModule";
import SettingsModule from "./modules/SettingsModule";
import RulesModule from "./modules/RulesModule";

// The API speaks ISO UTC, but <input type="datetime-local"> speaks local wall-clock time
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

/* Eleven destinations, all of which do something. Five were removed: SEO wrote fields no page reads,
   and Notifications / Certificates / Emails / Analytics had no render branch at all — every one
   fell through to a "currently being built" placeholder, so a quarter of the navigation advertised
   features that did not exist. (Referral analytics already exists for real at its own admin
   endpoint; the stub was hiding it rather than linking it.) */
const SIDEBAR_NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "branding", label: "Branding & Media", icon: Palette },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "theme", label: "Theme & Requirements", icon: CheckSquare },
  { id: "rules", label: "Rules & Eligibility", icon: CheckSquare },
  { id: "prizes", label: "Prizes", icon: Trophy },
  { id: "judges", label: "Panel (public bios)", icon: Users },
  { id: "judging", label: "Judging & Scoring", icon: ClipboardCheck },
  { id: "sponsors", label: "Sponsors", icon: Star },
  { id: "community", label: "Community", icon: MessageSquare },
  { id: "resources", label: "Resources", icon: Download },
  { id: "settings", label: "Settings", icon: Settings, danger: true },
];

// The competitions list is a TAB inside AdminDashboard, not a route of its own: App.jsx declares
// /admin and /admin/competitions/:id, but never /admin/competitions. Navigating there fell through
// the two-segment catch-all (/:projectHeading/:writerUsername) and dropped the admin on a public
// ScriptDetail page for a script that does not exist.
const ADMIN_LIST = "/admin";

/**
 * The admin session token adminApi signs its requests with. AdminDashboard gates /admin behind an
 * access code and keeps the result here; this route had no gate at all, so a logged-out visitor
 * loading /admin/competitions/new rendered the entire console — all fifteen modules and the Danger
 * Zone — while every request it made 401'd. The data was never exposed, but the console should not
 * draw itself for someone who cannot use it.
 */
const hasAdminSession = () => {
  try {
    return Boolean(JSON.parse(sessionStorage.getItem("admin-session") || "{}").token);
  } catch {
    return false;
  }
};

export default function AdminCompetitionsEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const allowed = hasAdminSession();

  // Send an unauthenticated visitor to the admin entrance rather than rendering the console.
  useEffect(() => {
    if (!allowed) navigate(ADMIN_LIST, { replace: true });
  }, [allowed, navigate]);
  
  const [activeTab, setActiveTab] = useState("overview");
  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const loadCompetition = async () => {
      try {
        setLoading(true);
        const { data } = await adminApi.get("/admin/competitions");
        const found = data.competitions.find(c => c._id === id);
        if (found) {
          setCompetition(found);
        } else {
          setError("Competition not found.");
        }
      } catch {
        setError("Failed to load.");
      } finally {
        setLoading(false);
      }
    };

    if (id === "new") {
      // Mock new competition payload
      setCompetition({
        name: "",
        entryFee: { mode: "paid", inrMinor: 9800, usdMinor: 200 },
        dates: { regOpensAt: "", regClosesAt: "", startsAt: "", endsAt: "" },
        prizes: { winner: [], runnerUp: [], secondRunnerUp: [], special: [] },
        detailedPrizes: [],
        rules: [""],
        faq: [],
        judges: [],
        sponsors: [],
        communityLinks: [],
        resources: []
      });
      setLoading(false);
    } else {
      loadCompetition();
    }
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...competition,
        dates: Object.fromEntries(
          Object.entries(competition.dates || {})
            .map(([k, v]) => {
              // If it's already an ISO string (e.g. unmodified from API, or from TimelineModule), leave it.
              // If it's a local input string, convert it. If empty, return null to clear it in Mongo.
              const isIso = typeof v === 'string' && v.endsWith('Z');
              return [k, isIso ? v : (v ? fromLocalInput(v) : null)];
            })
            // we do NOT filter here, so nulls are sent to overwrite/clear existing dates
        )
      };

      if (id === "new") {
        const { data } = await adminApi.post("/admin/competitions", payload);
        navigate(`/admin/competitions/${data.competition._id}`);
      } else {
        await adminApi.put(`/admin/competitions/${id}`, payload);
      }
    } catch (err) {
      alert("Failed to save: " + (err?.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };
  /**
   * Save first, then publish. The server validates the STORED document, so publishing without
   * flushing unsaved edits would reject on fields the admin can see filled in on screen.
   */
  const handlePublish = async () => {
    if (!window.confirm("Publish this competition? It becomes visible to everyone and registration opens on its scheduled date.")) return;
    setPublishing(true);
    try {
      await adminApi.put(`/admin/competitions/${id}`, competition);
      await adminApi.post(`/admin/competitions/${id}/publish`);
      setCompetition((prev) => ({ ...prev, lifecycle: "published" }));
      alert("Competition published.");
    } catch (err) {
      // The server explains exactly what is missing ("Add at least one rule before publishing.").
      alert(err?.response?.data?.message || err.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleArchive = async () => {
    if (!window.confirm("Are you sure you want to archive this competition?")) return;
    try {
      await adminApi.post(`/admin/competitions/${id}/archive`);
      navigate(ADMIN_LIST);
    } catch (err) {
      alert("Failed to archive: " + (err?.response?.data?.message || err.message));
    }
  };

  const handleDelete = async () => {
    // The server refuses this once anyone has entered or results are declared, and says why — so
    // the confirm only has to cover the case that is actually allowed to proceed.
    if (!window.confirm("Permanently delete this competition? This cannot be undone.")) return;
    try {
      await adminApi.delete(`/admin/competitions/${id}`);
      navigate(ADMIN_LIST);
    } catch (err) {
      alert("Failed to delete: " + (err?.response?.data?.message || err.message));
    }
  };

  const updateField = (key, value) => {
    setCompetition(prev => ({ ...prev, [key]: value }));
  };

  // Render nothing at all without a session — the redirect above runs after the first paint, and
  // one frame of the full console is still one frame too many.
  if (!allowed) return null;
  if (loading) return <div className="p-8 text-[#888]">Loading editor...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="flex h-screen bg-[#fbfbfa] text-[#111] overflow-hidden">
      
      {/* Left Sidebar */}
      <div className="w-64 bg-[#f4f2f0] border-r border-[#eaeaea] flex flex-col">
        <div className="p-4 border-b border-[#eaeaea] flex items-center gap-2">
          <button onClick={() => navigate(ADMIN_LIST)} className="p-1.5 hover:bg-[#e4e2e0] rounded-md transition-colors text-[#555]">
            <ArrowLeft size={16} />
          </button>
          <span className="font-semibold text-sm truncate">{competition.name || "Untitled Competition"}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {SIDEBAR_NAV.map((nav) => {
            const Icon = nav.icon;
            const isActive = activeTab === nav.id;
            return (
              <button
                key={nav.id}
                onClick={() => setActiveTab(nav.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all ${
                  isActive 
                    ? "bg-white shadow-sm text-[#111] font-semibold" 
                    : "text-[#555] hover:bg-[#e4e2e0] font-medium"
                } ${nav.danger && !isActive ? "text-red-600 hover:bg-red-50" : ""}`}
              >
                <Icon size={16} className={isActive ? (nav.danger ? "text-red-500" : "text-[#111]") : "opacity-70"} />
                {nav.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative">
        
        {/* Sticky Header */}
        <div className="h-16 bg-white border-b border-[#eaeaea] px-6 flex items-center justify-between shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold font-serif">{SIDEBAR_NAV.find(n => n.id === activeTab)?.label}</h1>
            <span className="px-2.5 py-1 bg-[#fff0ed] text-[#c94b3a] rounded-full text-xs font-bold uppercase tracking-wide">
              {competition.lifecycle}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[#111] hover:bg-[#333] shadow-md rounded-lg transition-all disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Draft"}
            </button>
            {/* Publishing is what makes a competition public — without this control nothing created
                in this editor could ever appear on /challenge, the Hall of Fame or the landing page,
                because every public query filters lifecycle: "published". */}
            {competition.lifecycle !== "published" ? (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[#c94b3a] hover:bg-[#b03e2f] shadow-md rounded-lg transition-all disabled:opacity-50"
              >
                <UploadCloud size={16} />
                {publishing ? "Publishing..." : "Publish"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Scrollable Form Area */}
        <div className="flex-1 overflow-y-auto bg-[#fbfbfa]">
          <div className="max-w-4xl mx-auto p-8 pb-32">
            
            {activeTab === "overview" && (
              <OverviewModule data={competition} onChange={updateField} />
            )}
            
            {activeTab === "rules" && (
              <RulesModule data={competition} onChange={updateField} />
            )}

            {activeTab === "branding" && (
              <BrandingModule data={competition} onChange={updateField} />
            )}
            
            {activeTab === "timeline" && (
              <TimelineModule data={competition} onChange={updateField} />
            )}
            
            {activeTab === "theme" && (
              <ThemeModule data={competition} onChange={updateField} />
            )}

            {activeTab === "prizes" && (
              <PrizesModule data={competition} onChange={updateField} />
            )}

            {activeTab === "judges" && (
              <JudgesModule data={competition} onChange={updateField} />
            )}

            {/* Takes competitionId, NOT data/onChange: the rubric is saved through its own endpoint
                because CONTENT_FIELDS deliberately drops `judging` from the editor's global save. */}
            {activeTab === "judging" && (
              <JudgingModule competitionId={id} />
            )}

            {activeTab === "sponsors" && (
              <SponsorsModule data={competition} onChange={updateField} />
            )}

            {activeTab === "community" && (
              <CommunityModule data={competition} onChange={updateField} />
            )}

            {activeTab === "resources" && (
              <ResourcesModule data={competition} onChange={updateField} />
            )}


            {activeTab === "settings" && (
              <SettingsModule 
                data={competition} 
                onChange={updateField} 
                onArchive={handleArchive} 
                onDelete={handleDelete} 
              />
            )}
            

          </div>
        </div>
      </div>

      {/* Slide-over Preview Pane */}

    </div>
  );
}
