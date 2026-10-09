import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { useDarkMode } from "../context/DarkModeContext";
import api from "../services/api";
import ProjectCard from "../components/ProjectCard";
import SearchSkeleton from "../components/skeleton/SearchSkeleton";
import { getProfileCanonicalPath } from "../utils/profilePath";

/* ── Filter Constants ───────────────────────────────── */
const GENRES = [
  "Thriller", "Drama", "Comedy", "Sci-Fi", "Horror", "Romance",
  "Action", "Mystery", "Fantasy", "Animation", "Crime", "Adventure",
];

const CONTENT_TYPES = [
  { key: "movie", label: "Movie" },
  { key: "tv_series", label: "TV Series" },
  { key: "short_film", label: "Short Film" },
  { key: "web_series", label: "Web Series" },
  { key: "documentary", label: "Documentary" },
  { key: "micro_drama", label: "Micro Drama" },
  { key: "anime", label: "Anime" },
  { key: "book", label: "Book" },
  { key: "startup", label: "Startup" },
  { key: "songs", label: "Songs" },
  { key: "standup_comedy", label: "Standup Comedy" },
  { key: "dialogues", label: "Dialogues" },
  { key: "poet", label: "Poet" },
];

const BUDGETS = [
  { key: "micro", label: "Micro" },
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "blockbuster", label: "Blockbuster" },
];

const PREMIUM_OPTIONS = [
  { key: "all", label: "All" },
  { key: "free", label: "Free Only" },
  { key: "premium", label: "Premium Only" },
];

const SORT_OPTIONS = [
  { key: "", label: "Relevance" },
  { key: "engagement", label: "Trending" },
  { key: "views", label: "Most Viewed" },
  { key: "score", label: "Top Rated" },
  { key: "price_high", label: "Highest Paid" },
  { key: "price_low", label: "Price: Low→High" },
];

/* ── Icons ──────────────────────────────────────────── */
const FilterIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
  </svg>
);

const ChevronDown = ({ open }) => (
  <svg className={`w-4 h-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

const XIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/* ── Theme Tokens ───────────────────────────────────── */
const getTokens = (dark) => dark ? {
  // Page
  pageBg: "-m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-screen bg-[#0a1628]",
  // Header
  title: "text-white",
  subtitle: "text-slate-400",
  accentBar: "from-blue-400 to-cyan-400",
  // Search bar
  searchWrap: "bg-[#0f1d35]/80 backdrop-blur-sm border-[#1a3050] hover:border-[#2a4570]",
  searchFocused: "!border-blue-500/40 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/10",
  searchIcon: "text-slate-500",
  searchInput: "text-white placeholder:text-slate-500",
  searchClearBtn: "bg-[#1a3050] hover:bg-[#243d5e]",
  searchClearIcon: "text-slate-400",
  searchHint: "text-slate-600 border-slate-700/60",
  // Tabs
  tabBar: "bg-[#0f1d35]/60 backdrop-blur-sm border border-[#1a3050]/50",
  tabActive: "bg-gradient-to-r from-[#1e3a5f] to-[#2a5a8f] text-white shadow-lg shadow-[#1e3a5f]/30",
  tabIdle: "text-slate-400 hover:text-slate-200",
  // Filter button
  filterBtnActive: "bg-gradient-to-r from-[#1e3a5f] to-[#2a5a8f] text-white border-[#1e3a5f] shadow-lg shadow-[#1e3a5f]/20",
  filterBtnIdle: "bg-[#0f1d35]/80 text-slate-300 border-[#1a3050] hover:border-[#2a4570] hover:bg-[#132744]",
  // Filter tags
  filterTag: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  filterTagX: "hover:bg-blue-500/20",
  clearAll: "text-slate-500 hover:text-red-400",
  // Filter panel
  filterPanel: "bg-[#0f1d35]/90 backdrop-blur-sm border-[#1a3050] shadow-2xl shadow-black/20",
  filterDivider: "border-[#1a3050]/60",
  filterClearMobile: "text-red-400 hover:text-red-300 border-red-500/20 bg-red-500/10",
  // Pill
  pillActive: "bg-gradient-to-r from-[#1e3a5f] to-[#2a5a8f] text-white border-transparent shadow-md shadow-[#1e3a5f]/20",
  pillIdle: "bg-[#0a1628] text-slate-400 border-[#1a3050] hover:border-[#2a4570] hover:text-slate-200 hover:bg-[#0f1d35]",
  filterLabel: "text-slate-500",
  // Loading
  spinnerTrack: "border-[#1a3050]",
  spinnerColor: "border-t-blue-400",
  spinnerText: "text-slate-500",
  // Empty state
  genreHint: "text-slate-500",
  genreBtn: "text-slate-400 bg-[#0f1d35]/80 border-[#1a3050] hover:border-blue-500/30 hover:text-blue-400 hover:bg-[#132744] hover:shadow-lg hover:shadow-blue-500/5",
  // No results
  noResultBg: "bg-[#0f1d35]/60",
  noResultIcon: "text-slate-600",
  noResultTitle: "text-slate-200",
  noResultSub: "text-slate-500",
  noResultBtn: "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/20",
  // Results
  resultCount: "text-slate-500",
  sectionBar: "bg-gradient-to-b from-blue-400 to-cyan-400",
  sectionTitle: "text-slate-200",
  sectionCount: "text-slate-500",
  // Person card
  personCard: "bg-[#0f1d35]/70 backdrop-blur-sm border-[#1a3050]/80 hover:bg-[#132744] hover:border-[#2a4570] hover:shadow-xl hover:shadow-blue-500/5",
  personAvatarBg: "bg-[#1a3050]",
  personName: "text-white group-hover:text-blue-400",
  personBio: "text-slate-500",
  personGenreTag: "text-slate-500 bg-[#0a1628]",
  personFollowers: "text-slate-500",
  personChevron: "text-slate-600 group-hover:text-slate-400",
  // Project card
  projectCard: "bg-[#0f1d35]/70 backdrop-blur-sm border-[#1a3050]/80 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1.5 hover:border-[#2a4570]",
  projectEmptyCover: "from-[#0a1628] via-[#0f1d35] to-[#1a3050]",
  projectEmptyIcon: "text-slate-700",
  projectTitle: "text-white group-hover:text-blue-400",
  projectDesc: "text-slate-500",
  projectStatIcon: "text-slate-600",
  projectStatValue: "text-slate-400",
  projectScoreStar: "text-amber-400",
  projectScoreValue: "text-amber-400",
} : {
  pageBg: "",
  title: "text-gray-900",
  subtitle: "text-gray-400",
  accentBar: "from-[#1e3a5f] to-[#3a7bd5]",
  searchWrap: "bg-white border-gray-200 shadow-sm",
  searchFocused: "!border-[#1e3a5f]/30 shadow-lg shadow-[#1e3a5f]/5",
  searchIcon: "text-gray-400",
  searchInput: "text-gray-900 placeholder:text-gray-400",
  searchClearBtn: "bg-gray-100 hover:bg-gray-200",
  searchClearIcon: "text-gray-500",
  searchHint: "text-gray-300 border-gray-200",
  tabBar: "bg-gray-50/80",
  tabActive: "bg-white text-[#1e3a5f] shadow-sm",
  tabIdle: "text-gray-400 hover:text-gray-600",
  filterBtnActive: "bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-sm",
  filterBtnIdle: "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm",
  filterTag: "bg-[#1e3a5f]/[0.06] text-[#1e3a5f]",
  filterTagX: "hover:bg-[#1e3a5f]/10",
  clearAll: "text-gray-400 hover:text-red-500",
  filterPanel: "bg-white border-gray-100 shadow-sm",
  filterDivider: "border-gray-100",
  filterClearMobile: "text-red-500 hover:text-red-600 border-red-200 bg-red-50",
  pillActive: "bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-sm shadow-[#1e3a5f]/15",
  pillIdle: "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700 hover:shadow-sm",
  filterLabel: "text-gray-400",
  spinnerTrack: "border-gray-100",
  spinnerColor: "border-t-[#1e3a5f]",
  spinnerText: "text-gray-400",
  genreHint: "text-gray-300",
  genreBtn: "text-gray-500 bg-white border-gray-150 hover:border-[#1e3a5f]/30 hover:text-[#1e3a5f] hover:shadow-sm",
  noResultBg: "bg-gray-50",
  noResultIcon: "text-gray-300",
  noResultTitle: "text-gray-600",
  noResultSub: "text-gray-400",
  noResultBtn: "bg-[#1e3a5f] hover:bg-[#162d4a] text-white shadow-sm",
  resultCount: "text-gray-400",
  sectionBar: "bg-[#1e3a5f]",
  sectionTitle: "text-gray-900",
  sectionCount: "text-gray-400",
  personCard: "bg-white border-gray-100/80 hover:bg-gray-50/50 hover:border-gray-200",
  personAvatarBg: "bg-gray-100",
  personName: "text-gray-900 group-hover:text-[#1e3a5f]",
  personBio: "text-gray-400",
  personGenreTag: "text-gray-400 bg-gray-50",
  personFollowers: "text-gray-400",
  personChevron: "text-gray-300 group-hover:text-gray-500",
  projectCard: "bg-white border-gray-100/80 hover:shadow-xl hover:shadow-gray-200/40 hover:-translate-y-1",
  projectEmptyCover: "from-slate-50 via-gray-50 to-slate-100",
  projectEmptyIcon: "text-gray-200",
  projectTitle: "text-gray-900 group-hover:text-[#1e3a5f]",
  projectDesc: "text-gray-400",
  projectStatIcon: "text-gray-400",
  projectStatValue: "text-gray-500",
  projectScoreStar: "text-gray-400",
  projectScoreValue: "text-gray-600",
};

/* ── Reusable Components ────────────────────────────── */
const Pill = ({ active, onClick, children, t }) => {
  const base = "px-3.5 py-[7px] rounded-xl text-[12px] font-semibold transition-all duration-200 whitespace-nowrap border cursor-pointer select-none";
  const styles = active ? t.pillActive : t.pillIdle;
  return <button onClick={onClick} className={`${base} ${styles}`}>{children}</button>;
};

const FilterSection = ({ label, children, t }) => (
  <div className="space-y-2.5">
    <h4 className={`text-[11px] font-bold uppercase tracking-widest pl-0.5 ${t.filterLabel}`}>{label}</h4>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const budgetLabel = { micro: "Micro", low: "Low", medium: "Medium", high: "High", blockbuster: "Blockbuster" };

/* ── Main Component ─────────────────────────────────── */
const Search = () => {
  const { isDarkMode: dark } = useDarkMode();
  const t = getTokens(dark);

  const [searchParams] = useSearchParams();
  const allowedTabs = ["all", "projects", "writers", "investors"];
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeTab, setActiveTab] = useState(
    allowedTabs.includes(searchParams.get("type")) ? searchParams.get("type") : "all"
  );
  const [results, setResults] = useState({ users: [], scripts: [] });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  /* Filter state (project filters) */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [selectedContentType, setSelectedContentType] = useState("");
  const [selectedBudget, setSelectedBudget] = useState("");
  const [selectedPremium, setSelectedPremium] = useState("all");
  const [selectedSort, setSelectedSort] = useState("");

  // Sync from URL params when navigating from navbar
  useEffect(() => {
    const urlQ = searchParams.get("q") || "";
    const urlType = searchParams.get("type") || "all";
    const normalizedType = allowedTabs.includes(urlType) ? urlType : "all";
    if (urlQ && urlQ !== query) setQuery(urlQ);
    if (normalizedType !== activeTab) setActiveTab(normalizedType);
  }, [searchParams]);

  const showProjectFilters = activeTab === "all" || activeTab === "projects";

  const activeFilterCount = [
    selectedGenre,
    selectedContentType,
    selectedBudget,
    selectedPremium !== "all" ? selectedPremium : "",
    selectedSort,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSelectedGenre("");
    setSelectedContentType("");
    setSelectedBudget("");
    setSelectedPremium("all");
    setSelectedSort("");
  };

  const tabs = [
    { key: "all", label: "All" },
    { key: "projects", label: "Projects" },
    { key: "writers", label: "Writers" },
    { key: "investors", label: "Investors" },
  ];

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (query.trim()) {
        doSearch();
      } else if (showProjectFilters && activeFilterCount > 0) {
        // Allow filter-only browsing (no search query)
        doSearch();
      } else {
        setResults({ users: [], scripts: [] });
        setSearched(false);
      }
    }, 400);
    return () => clearTimeout(debounce);
  }, [query, activeTab, selectedGenre, selectedContentType, selectedBudget, selectedPremium, selectedSort]);

  const doSearch = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.append("q", query.trim());
      params.append("type", activeTab);

      // Add project filters
      if (showProjectFilters) {
        if (selectedGenre) params.append("genre", selectedGenre);
        if (selectedContentType) params.append("contentType", selectedContentType);
        if (selectedBudget) params.append("budget", selectedBudget);
        if (selectedPremium === "premium") params.append("premium", "true");
        else if (selectedPremium === "free") params.append("premium", "false");
      }

      const { data } = await api.get(`/search?${params.toString()}`);

      // Client-side sort for search results
      let scripts = data.scripts || [];
      if (selectedSort && showProjectFilters) {
        scripts = [...scripts].sort((a, b) => {
          switch (selectedSort) {
            case "views": return (b.views || 0) - (a.views || 0);
            case "score": return (b.scriptScore?.overall || 0) - (a.scriptScore?.overall || 0);
            case "price_high": return (b.price || 0) - (a.price || 0);
            case "price_low": return (a.price || 0) - (b.price || 0);
            case "engagement": return (b.unlockCount || 0) - (a.unlockCount || 0);
            default: return 0;
          }
        });
      }

      setResults({ ...data, scripts });
    } catch {
      setResults({ users: [], scripts: [] });
    }
    setLoading(false);
  };

  const totalResults = (results.users?.length || 0) + (results.scripts?.length || 0);

  const roleColors = {
    writer: "#1e3a5f", creator: "#1e3a5f", investor: "#1e3a5f",
    reader: "#1e3a5f", producer: "#1e3a5f", director: "#1e3a5f",
    actor: "#1e3a5f", industry: "#1e3a5f", professional: "#1e3a5f",
  };

  const getProfileImage = (user) => {
    if (!user.profileImage) return null;
    return user.profileImage.startsWith("http") ? user.profileImage : `${(import.meta.env.VITE_API_URL || "http://localhost:5002").replace(/\/api\/?$/, "").replace(/\/$/, "")}${user.profileImage}`;
  };

  const getCoverImage = (script) => {
    if (!script.coverImage) return null;
    return script.coverImage.startsWith("http") ? script.coverImage : `${(import.meta.env.VITE_API_URL || "http://localhost:5002").replace(/\/api\/?$/, "").replace(/\/$/, "")}${script.coverImage}`;
  };

  const ease = [0.25, 0.46, 0.45, 0.94];

  return (
    <div className={t.pageBg}>
    <div className="max-w-5xl mx-auto max-[580px]:overflow-x-hidden max-[450px]:px-1 max-[320px]:px-0.5">

      {/* ── Header + Search ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="mb-6"
      >
        <div className="flex items-end justify-between gap-4 mb-5 max-[580px]:mb-4 max-[380px]:mb-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className={`w-1 h-6 rounded-full bg-gradient-to-b ${t.accentBar}`} />
              <h1 className={`text-2xl max-[580px]:text-[26px] max-[380px]:text-[22px] font-extrabold tracking-tight ${t.title}`}>Search</h1>
            </div>
            <p className={`text-[13px] max-[580px]:text-[12px] max-[380px]:text-[11px] font-medium ml-[18px] max-[580px]:ml-[14px] max-[380px]:ml-[10px] ${t.subtitle}`}>
              Discover talent & projects across the platform
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div className={`relative rounded-xl border transition-all duration-300 ${t.searchWrap} ${focused ? t.searchFocused : ""}`}>
          <div className="absolute left-4 max-[380px]:left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className={`w-[18px] h-[18px] ${t.searchIcon}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search by name, genre, title, skills..."
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            className={`app-search-input ${dark ? "app-search-input-dark" : ""} w-full h-12 max-[580px]:h-11 max-[380px]:h-10 pl-12 max-[580px]:pl-10 max-[380px]:pl-9 pr-12 max-[580px]:pr-10 max-[380px]:pr-9 bg-transparent rounded-xl text-[14px] max-[580px]:text-[13px] max-[380px]:text-[12px] focus:outline-none ${t.searchInput}`}
          />
          {query ? (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className={`absolute right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${t.searchClearBtn}`}
            >
              <svg className={`w-3.5 h-3.5 ${t.searchClearIcon}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <div className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold border rounded-md px-1.5 py-0.5 select-none pointer-events-none hidden sm:block ${t.searchHint}`}>
              ⌘K
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Category tabs + Filter toggle ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08, ease }}
        className="mb-6"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3 max-[580px]:flex-col max-[580px]:items-stretch max-[450px]:gap-2 max-[300px]:gap-1.5">
          <div className="flex items-center gap-3 max-[580px]:flex-col max-[580px]:items-stretch max-[450px]:gap-2 max-[300px]:gap-1.5">
            {/* Category tabs */}
            <div className={`inline-flex items-center rounded-full p-1 gap-0.5 ${t.tabBar} max-[580px]:w-full max-[580px]:overflow-x-auto max-[580px]:whitespace-nowrap max-[450px]:overflow-visible max-[450px]:whitespace-normal max-[450px]:grid max-[450px]:grid-cols-2 max-[450px]:rounded-2xl max-[450px]:p-1.5 max-[450px]:gap-1 max-[300px]:p-1 max-[300px]:gap-0.5` }>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-5 max-[580px]:px-3.5 max-[450px]:px-2.5 max-[300px]:px-2 py-2 max-[580px]:py-1.5 max-[450px]:py-2 max-[300px]:py-1.5 rounded-full max-[450px]:rounded-xl text-[13px] max-[580px]:text-[12px] max-[450px]:text-[11px] max-[300px]:text-[10px] leading-tight font-semibold transition-all duration-250 whitespace-nowrap max-[450px]:whitespace-normal max-[450px]:text-center max-[450px]:w-full ${activeTab === tab.key
                    ? t.tabActive
                    : t.tabIdle
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filter toggle — only when projects are visible */}
            {showProjectFilters && (
              <button
                onClick={() => setFiltersOpen(!filtersOpen)}
                className={`relative inline-flex items-center justify-center gap-2 px-4 max-[580px]:px-3 max-[450px]:px-2.5 max-[300px]:px-2 py-2.5 max-[580px]:py-2 max-[450px]:py-1.5 max-[300px]:py-1.5 rounded-xl text-[13px] max-[580px]:text-[12px] max-[450px]:text-[11px] max-[300px]:text-[10px] font-semibold transition-all duration-200 border max-[580px]:w-full ${filtersOpen || activeFilterCount > 0
                  ? t.filterBtnActive
                  : t.filterBtnIdle
                  }`}
              >
                <FilterIcon />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-white/20 rounded-md text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown open={filtersOpen} />
              </button>
            )}
          </div>

          {/* Active filter tags */}
          {showProjectFilters && activeFilterCount > 0 && (
            <div className="hidden sm:flex items-center gap-2 flex-wrap">
              {selectedGenre && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${t.filterTag}`}>
                  {selectedGenre}
                  <button onClick={() => setSelectedGenre("")} className={`rounded p-0.5 transition-colors ${t.filterTagX}`}><XIcon /></button>
                </span>
              )}
              {selectedContentType && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${t.filterTag}`}>
                  {CONTENT_TYPES.find(c => c.key === selectedContentType)?.label || selectedContentType}
                  <button onClick={() => setSelectedContentType("")} className={`rounded p-0.5 transition-colors ${t.filterTagX}`}><XIcon /></button>
                </span>
              )}
              {selectedBudget && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${t.filterTag}`}>
                  {budgetLabel[selectedBudget]} Budget
                  <button onClick={() => setSelectedBudget("")} className={`rounded p-0.5 transition-colors ${t.filterTagX}`}><XIcon /></button>
                </span>
              )}
              {selectedPremium !== "all" && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${t.filterTag}`}>
                  {selectedPremium === "premium" ? "Premium" : "Free"}
                  <button onClick={() => setSelectedPremium("all")} className={`rounded p-0.5 transition-colors ${t.filterTagX}`}><XIcon /></button>
                </span>
              )}
              {selectedSort && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${t.filterTag}`}>
                  {SORT_OPTIONS.find(s => s.key === selectedSort)?.label}
                  <button onClick={() => setSelectedSort("")} className={`rounded p-0.5 transition-colors ${t.filterTagX}`}><XIcon /></button>
                </span>
              )}
              <button onClick={clearAllFilters} className={`text-[11px] font-semibold transition-colors px-2 py-1 ${t.clearAll}`}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* ── Collapsible filter panel ── */}
        <AnimatePresence>
          {showProjectFilters && filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className={`border rounded-2xl p-5 sm:p-6 space-y-5 mb-4 ${t.filterPanel}`}>
                {/* Sort By */}
                <FilterSection label="Sort By" t={t}>
                  {SORT_OPTIONS.map((opt) => (
                    <Pill key={opt.key} active={selectedSort === opt.key} onClick={() => setSelectedSort(selectedSort === opt.key ? "" : opt.key)} t={t}>
                      <span className="flex items-center">{opt.label}</span>
                    </Pill>
                  ))}
                </FilterSection>

                <div className={`border-t ${t.filterDivider}`} />

                {/* Genre */}
                <FilterSection label="Genre" t={t}>
                  <Pill active={!selectedGenre} onClick={() => setSelectedGenre("")} t={t}>All Genres</Pill>
                  {GENRES.map((g) => (
                    <Pill key={g} active={selectedGenre === g} onClick={() => setSelectedGenre(selectedGenre === g ? "" : g)} t={t}>{g}</Pill>
                  ))}
                </FilterSection>

                <div className={`border-t ${t.filterDivider}`} />

                {/* Content Type */}
                <FilterSection label="Content Type" t={t}>
                  <Pill active={!selectedContentType} onClick={() => setSelectedContentType("")} t={t}>All Types</Pill>
                  {CONTENT_TYPES.map((ct) => (
                    <Pill key={ct.key} active={selectedContentType === ct.key} onClick={() => setSelectedContentType(selectedContentType === ct.key ? "" : ct.key)} t={t}>{ct.label}</Pill>
                  ))}
                </FilterSection>

                <div className={`border-t ${t.filterDivider}`} />

                {/* Budget + Premium row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FilterSection label="Budget Range" t={t}>
                    <Pill active={!selectedBudget} onClick={() => setSelectedBudget("")} t={t}>Any</Pill>
                    {BUDGETS.map((b) => (
                      <Pill key={b.key} active={selectedBudget === b.key} onClick={() => setSelectedBudget(selectedBudget === b.key ? "" : b.key)} t={t}>{b.label}</Pill>
                    ))}
                  </FilterSection>

                  <FilterSection label="Pricing" t={t}>
                    {PREMIUM_OPTIONS.map((p) => (
                      <Pill key={p.key} active={selectedPremium === p.key} onClick={() => setSelectedPremium(p.key)} t={t}>{p.label}</Pill>
                    ))}
                  </FilterSection>
                </div>

                {/* Clear All (mobile) */}
                {activeFilterCount > 0 && (
                  <div className="flex sm:hidden justify-end pt-2">
                    <button onClick={clearAllFilters} className={`text-[12px] font-semibold transition-colors px-3 py-1.5 border rounded-xl ${t.filterClearMobile}`}>
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── States ── */}

      {/* Loading */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SearchSkeleton />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty — no query */}
      {!loading && !searched && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease }}
          className="text-center py-16"
        >
          <p className={`text-[13px] font-medium mb-6 ${t.genreHint}`}>Popular genres</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-lg mx-auto">
            {["Thriller", "Drama", "Comedy", "Sci-Fi", "Horror", "Romance", "Action", "Mystery"].map((g) => (
              <button
                key={g}
                onClick={() => setQuery(g)}
                className={`px-4 py-2 text-[13px] font-medium border rounded-xl transition-all duration-200 ${t.genreBtn}`}
              >
                {g}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* No results */}
      {!loading && searched && totalResults === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-24"
        >
          <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-4 ${t.noResultBg}`}>
            <svg className={`w-5 h-5 ${t.noResultIcon}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className={`text-[15px] font-semibold mb-1 ${t.noResultTitle}`}>No results{query ? ` for "${query}"` : ""}</p>
          <p className={`text-[13px] mb-4 ${t.noResultSub}`}>Try different keywords or adjust your filters</p>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${t.noResultBtn}`}>
              Clear all filters
            </button>
          )}
        </motion.div>
      )}

      {/* ── Results ── */}
      {!loading && searched && totalResults > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* Result count */}
          <p className={`text-[12px] font-medium mb-6 ${t.resultCount}`}>
            {totalResults} result{totalResults !== 1 ? "s" : ""}
          </p>

          {/* ── People ── */}
          {results.users?.length > 0 && (
            <section className="mb-10">
              {activeTab === "all" && (
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-1 h-4 rounded-full ${t.sectionBar}`} />
                  <h2 className={`text-[13px] font-bold uppercase tracking-wider ${t.sectionTitle}`}>People</h2>
                  <span className={`text-[11px] font-medium ml-1 ${t.sectionCount}`}>{results.users.length}</span>
                </div>
              )}

              <div className="space-y-2">
                {results.users.map((user, i) => {
                  const img = getProfileImage(user);
                  const color = roleColors[user.role] || "#6b7280";

                  return (
                    <motion.div
                      key={user._id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.3, ease }}
                    >
                      <Link
                        to={getProfileCanonicalPath(user)}
                        className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-all duration-200 group ${t.personCard}`}
                      >
                        {/* Avatar */}
                        <div className={`w-11 h-11 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${t.personAvatarBg}`}>
                          {img ? (
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[14px] font-bold" style={{ color: dark ? "#93c5fd" : color }}>
                              {user.name?.charAt(0)?.toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5">
                            <h3 className={`text-[14px] font-semibold truncate transition-colors ${t.personName}`}>
                              {user.name}
                            </h3>
                            <span
                                title={user.role === 'investor' ? 'Film Industry Professional' : undefined}
                                className="text-[10px] font-bold uppercase tracking-wide px-2 py-[2px] rounded-full"
                                style={{ color: dark ? "#93c5fd" : color, backgroundColor: dark ? "rgba(59,130,246,0.12)" : color + "10" }}
                              >
                                {user.role === 'investor' ? 'FIP' : user.role === 'creator' ? 'Writer' : user.role}
                              </span>
                            {user.writerProfile?.wgaMember && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wide ${dark ? "text-blue-400 bg-blue-500/10" : "text-[#1e3a5f] bg-[#1e3a5f]/8"}`}>WGA</span>
                            )}
                            {user.writerProfile?.sgaMember && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wide ${dark ? "text-blue-400 bg-blue-500/10" : "text-[#1e3a5f] bg-[#1e3a5f]/8"}`}>SWA</span>
                            )}
                          </div>
                          {user.bio && (
                            <p className={`text-[12px] line-clamp-1 mt-0.5 ${t.personBio}`}>{user.bio}</p>
                          )}
                          {user.sid && (
                            <p className={`text-[10px] font-semibold mt-0.5 ${t.personFollowers}`}>SID: {user.sid}</p>
                          )}
                        </div>

                        {/* Right side — meta */}
                        <div className="flex items-center gap-4 flex-shrink-0">
                          {user.writerProfile?.genres?.length > 0 && (
                            <div className="hidden sm:flex items-center gap-1">
                              {user.writerProfile.genres.slice(0, 2).map((g) => (
                                <span key={g} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${t.personGenreTag}`}>{g}</span>
                              ))}
                            </div>
                          )}
                          <span className={`text-[11px] font-medium tabular-nums whitespace-nowrap ${t.personFollowers}`}>
                            {user.followerCount || 0} <span className="hidden sm:inline">follower{(user.followerCount || 0) !== 1 ? "s" : ""}</span>
                          </span>
                          <svg className={`w-4 h-4 transition-colors ${t.personChevron}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Projects ── */}
          {results.scripts?.length > 0 && (
            <section>
              {activeTab === "all" && (
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-1 h-4 rounded-full ${t.sectionBar}`} />
                  <h2 className={`text-[13px] font-bold uppercase tracking-wider ${t.sectionTitle}`}>Projects</h2>
                  <span className={`text-[11px] font-medium ml-1 ${t.sectionCount}`}>{results.scripts.length}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.scripts.map((script, i) => (
                  <motion.div
                    key={script._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3, ease }}
                  >
                    <ProjectCard project={script} userName={script.creator?.name || "Unknown"} />
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </motion.div>
      )}
    </div>
    </div>
  );
};

export default Search;
