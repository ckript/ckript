import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "./dashboardShared";
import JudgingResults from "./JudgingResults";
import ScreenplayReadOnly from "../../components/ScreenplayReadOnly";
import TagSelect from "../../components/TagSelect";
import { genres as GENRE_OPTIONS } from "../CreateProject/constants";

/**
 * Competition administration: create and schedule a challenge, publish it, review entries, and
 * declare results.
 *
 * Kept entirely in this file so AdminDashboard only gains a tab entry and one switch case.
 */

const PHASE_LABELS = {
  announced: "Announced",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  live: "Live",
  judging: "Judging",
  results: "Results declared",
};

const cls = {
  card: (dark) => `rounded-xl border p-5 ${dark ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"}`,
  input: (dark) => `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[#D14D37] ${dark ? "border-white/10 bg-white/[0.04] text-white" : "border-gray-300 bg-white text-gray-900"}`,
  label: (dark) => `block text-xs font-semibold uppercase tracking-wide ${dark ? "text-white/50" : "text-gray-500"}`,
  primary: "rounded-lg bg-[#D14D37] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b8402d] disabled:cursor-not-allowed disabled:bg-gray-400",
  ghost: (dark) => `rounded-lg border px-4 py-2 text-sm font-medium ${dark ? "border-white/10 text-white/70 hover:bg-white/[0.06]" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`,
  heading: (dark) => `text-lg font-bold ${dark ? "text-white" : "text-gray-900"}`,
  body: (dark) => (dark ? "text-white/70" : "text-gray-600"),
};

const PhasePill = ({ phase, lifecycle }) => (
  <span className="inline-flex items-center gap-2">
    <span className="rounded-full bg-[#D14D37]/10 px-2.5 py-1 text-[11px] font-bold text-[#D14D37]">
      {PHASE_LABELS[phase] || phase}
    </span>
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-gray-700 dark:bg-white/10 dark:text-white/70">
      {lifecycle}
    </span>
  </span>
);

export default function AdminCompetitions({ isDark: dark = false }) {
  const navigate = useNavigate();
  const [view, setView] = useState({ mode: "list", id: null });
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const flash = (message) => { setNotice(message); setTimeout(() => setNotice(""), 4000); };

  const loadCompetitions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/competitions");
      setCompetitions(data.competitions || []);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load competitions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCompetitions(); }, [loadCompetitions]);

  // ── List ──────────────────────────────────────────────────────────────────
  if (view.mode === "list") {
    return (
      <div>
        <div className="mb-5 flex items-center justify-between">
          <h2 className={cls.heading(dark)}>Competitions</h2>
          <button type="button" onClick={() => navigate("/admin/competitions/new")} className={cls.primary}>
            New Competition
          </button>
        </div>

        {notice ? <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</p> : null}
        {error ? <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}

        {loading ? (
          <p className={cls.body(dark)}>Loading…</p>
        ) : competitions.length === 0 ? (
          <div className={cls.card(dark)}>
            <p className={cls.body(dark)}>No competitions yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {competitions.map((competition) => (
              <div key={competition._id} className={`${cls.card(dark)} flex flex-wrap items-center justify-between gap-4`}>
                <div className="min-w-0">
                  <p className={`font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{competition.name}</p>
                  <p className={`mt-1 text-xs ${cls.body(dark)}`}>
                    {competition.dates?.startsAt ? new Date(competition.dates.startsAt).toLocaleString() : "No start date"}
                    {" · "}{competition.entryCount} registered · {competition.submittedCount} submitted
                  </p>
                  <div className="mt-2"><PhasePill phase={competition.phase} lifecycle={competition.lifecycle} /></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => navigate(`/admin/competitions/${competition._id}`)} className={cls.ghost(dark)}>Edit</button>
                  <button type="button" onClick={() => setView({ mode: "entries", id: competition._id })} className={cls.ghost(dark)}>Entries</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view.mode === "edit") {
    // Left for backwards compatibility if state somehow gets here
    navigate(`/admin/competitions/${view.id}`);
    return null;
  }

  return (
    <CompetitionEntries
      dark={dark}
      competitionId={view.id}
      onBack={() => { setView({ mode: "list" }); loadCompetitions(); }}
      onDeclared={flash}
    />
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

// ── Entries + declare results ───────────────────────────────────────────────

// An AI run claims an entry by stamping ai.startedAt, and hands the claim back (startedAt → null)
// whenever it records an error — so a run that died mid-flight, in a deploy or a crash, leaves
// startedAt set with no error, no logline and no processedAt. That looks exactly like an entry
// nothing has touched yet, which is why the AI cell used to show it as "—" and offer no way out:
// the entry then reached declare-results with an empty logline. The server will retake a claim only
// once it is older than its own stale window, so a run younger than that is reported as still in
// flight rather than offered a retry that would silently do nothing.
const AI_STALE_RUN_MS = 15 * 60_000; // keep in step with STALE_RUN_MS in server/controllers/competitionAI.js
const aiRunStalled = (ai) =>
  Boolean(ai?.startedAt) && !ai?.processedAt && Date.now() - new Date(ai.startedAt).getTime() >= AI_STALE_RUN_MS;
const aiRunInFlight = (ai) => Boolean(ai?.startedAt) && !ai?.processedAt && !aiRunStalled(ai);

function CompetitionEntries({ dark, competitionId, onBack, onDeclared }) {
  const [state, setState] = useState({ entries: [], phase: null, competition: null, rewardLines: null, loading: true });
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [retrying, setRetrying] = useState("");

  const [winnerEntryId, setWinnerEntryId] = useState("");
  const [runnerUpEntryId, setRunnerUpEntryId] = useState("");
  const [secondRunnerUpEntryId, setSecondRunnerUpEntryId] = useState("");
  const [specialAwards, setSpecialAwards] = useState([]);
  const [declaring, setDeclaring] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.get(`/admin/competitions/${competitionId}/entries`);
      setState({ entries: data.entries || [], phase: data.phase, competition: data.competition, rewardLines: data.rewardLines || null, loading: false });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load entries.");
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [competitionId]);

  useEffect(() => { load(); }, [load]);

  const submitted = state.entries.filter((e) => ["submitted", "ai_processed", "judged"].includes(e.status));
  const declared = Boolean(state.competition?.resultsDeclaredAt);

  const retryAI = async (entryId) => {
    setRetrying(entryId);
    try {
      await adminApi.post(`/admin/competitions/${competitionId}/entries/${entryId}/retry-ai`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Retry failed.");
    } finally {
      setRetrying("");
    }
  };

  const declare = async () => {
    const winner = submitted.find((e) => e._id === winnerEntryId);
    const runnerUp = submitted.find((e) => e._id === runnerUpEntryId);
    const secondRunnerUp = submitted.find((e) => e._id === secondRunnerUpEntryId);
    // ONE filtered list drives the confirmation, the participant arithmetic and the request. They
    // used to disagree: a row with a recipient but no award name was listed in the confirm dialog as
    // receiving an award, then dropped by the POST filter — so that writer silently got only a
    // participant badge, and the quoted "everyone else" count was wrong.
    const validSpecials = specialAwards.filter((a) => a.entryId && a.title.trim())
      .map((a) => ({ ...a, title: a.title.trim() }));
    const incomplete = specialAwards.filter((a) => (a.entryId && !a.title.trim()) || (!a.entryId && a.title.trim()));
    if (incomplete.length) {
      setError("Every special award needs both a recipient and an award name.");
      return;
    }
    // Quoted from the competition's OWN reward configuration (server-composed, the same lines the
    // public page prints) — this dialog used to recite fixed copy whatever Prizes said.
    const lines = state.rewardLines || {};
    const describe = (placingLines) => (placingLines?.length ? placingLines.join(", ") : "rewards as configured under Prizes");
    const specialLines = (title) => {
      const row = (lines.special || []).find((s) => String(s.title || "").toLowerCase() === title.toLowerCase());
      return row?.lines?.length ? row.lines.join(", ") : `${title} badge`;
    };
    const mentionsCash = (text) => /cash prize/i.test(text);
    const placingLines = [
      `Winner: ${winner?.userId?.name || "—"} — ${describe(lines.winner)}`,
      runnerUp ? `Runner-Up: ${runnerUp.userId?.name} — ${describe(lines.runnerUp)}` : null,
      secondRunnerUp ? `Second Runner-Up: ${secondRunnerUp.userId?.name} — ${describe(lines.secondRunnerUp)}` : null,
      ...validSpecials.map((a) => {
        const entry = submitted.find((e) => e._id === a.entryId);
        return `"${a.title}": ${entry?.userId?.name || "—"} — ${specialLines(a.title)}`;
      }),
    ].filter(Boolean);
    const summary = [
      ...placingLines,
      `Everyone else who submitted (${Math.max(0, submitted.length - 1 - (runnerUp ? 1 : 0) - (secondRunnerUp ? 1 : 0) - validSpecials.length)}) — participant badge`,
      placingLines.some(mentionsCash) ? "Cash prizes are NOT paid by the platform: Ckript pays them directly, and Finance records them as owed." : null,
    ].filter(Boolean).join("\n");

    if (!window.confirm(`Declare results?\n\n${summary}\n\nThis cannot be undone.`)) return;

    setDeclaring(true);
    setError("");
    try {
      const { data } = await adminApi.post(`/admin/competitions/${competitionId}/results`, {
        winnerEntryId,
        runnerUpEntryId: runnerUpEntryId || undefined,
        secondRunnerUpEntryId: secondRunnerUpEntryId || undefined,
        specialAwards: validSpecials,
      });
      onDeclared(`Results declared — ${data.counts.winners} winner, ${data.counts.runnerUp} runner-up, ${data.counts.secondRunnerUp || 0} second runner-up, ${data.counts.special} special, ${data.counts.participants} participants.`);
      onBack();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to declare results.");
    } finally {
      setDeclaring(false);
    }
  };

  const entryOptions = submitted.map((e) => (
    <option key={e._id} value={e._id}>{e.userId?.name || "Unknown"} — {e.snapshot?.title || "Untitled"} ({e.eventId})</option>
  ));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={cls.heading(dark)}>{state.competition?.name || "Entries"}</h2>
          <p className={`mt-1 text-xs ${cls.body(dark)}`}>
            {state.entries.length} registered · {submitted.length} submitted · {PHASE_LABELS[state.phase] || state.phase}
          </p>
        </div>
        <button type="button" onClick={onBack} className={cls.ghost(dark)}>← Back</button>
      </div>

      {error ? <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}

      {/* The panel's verdict, above the form it pre-fills. Renders nothing at all when a
          competition has no judges and no scores, which is every competition predating this. */}
      {!declared ? (
        <JudgingResults
          dark={dark}
          competitionId={competitionId}
          cls={cls}
          canPrefill={state.phase === "judging"}
          onPrefill={({ winnerEntryId: w, runnerUpEntryId: r, secondRunnerUpEntryId: s, specialAwards: sp }) => {
            // Calls the declare form's OWN setters. The admin sees the same selects, already
            // filled, and still has to press Declare and clear the same confirmation. The third
            // placing only lands when the competition has that tier switched on.
            setWinnerEntryId(w);
            setRunnerUpEntryId(r);
            setSecondRunnerUpEntryId(state.rewardLines?.secondRunnerUp?.length ? (s || "") : "");
            setSpecialAwards(sp);
          }}
        />
      ) : null}

      {state.phase === "judging" && !declared ? (
        <div className={`${cls.card(dark)} mb-5 border-[#D14D37]/40`}>
          <h3 className={`${cls.heading(dark)} text-base`}>Declare results</h3>
          <p className={`mt-1 text-xs ${cls.body(dark)}`}>Rewards are granted automatically, exactly as configured under Prizes, and cannot be taken back.</p>
          {state.rewardLines ? (
            <ul className={`mt-2 space-y-1 text-xs ${cls.body(dark)}`}>
              <li><b>Winner:</b> {(state.rewardLines.winner || []).join(", ") || "—"}</li>
              <li><b>Runner-Up:</b> {(state.rewardLines.runnerUp || []).join(", ") || "—"}</li>
              {state.rewardLines.secondRunnerUp?.length ? <li><b>Second Runner-Up:</b> {state.rewardLines.secondRunnerUp.join(", ")}</li> : null}
              {(state.rewardLines.special || []).filter((s) => s.title).map((s) => (
                <li key={s.title}><b>{s.title}:</b> {(s.lines || []).join(", ")}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={cls.label(dark)}>Winner (required)</label>
              <select value={winnerEntryId} onChange={(e) => setWinnerEntryId(e.target.value)} className={`${cls.input(dark)} mt-1`}>
                <option value="">Select an entry…</option>
                {entryOptions}
              </select>
            </div>
            <div>
              <label className={cls.label(dark)}>Runner-Up (optional)</label>
              <select value={runnerUpEntryId} onChange={(e) => setRunnerUpEntryId(e.target.value)} className={`${cls.input(dark)} mt-1`}>
                <option value="">None</option>
                {entryOptions}
              </select>
            </div>
            {/* Only offered when the competition has the tier switched on under Prizes; the server
                refuses a second runner-up for a competition that does not. */}
            {state.rewardLines?.secondRunnerUp?.length ? (
              <div>
                <label className={cls.label(dark)}>Second Runner-Up (optional)</label>
                <select value={secondRunnerUpEntryId} onChange={(e) => setSecondRunnerUpEntryId(e.target.value)} className={`${cls.input(dark)} mt-1`}>
                  <option value="">None</option>
                  {entryOptions}
                </select>
              </div>
            ) : null}
          </div>

          <label className={`${cls.label(dark)} mt-5`}>Special awards</label>
          {/* The titles configured on the competition itself (Prizes → Special). adminListEntries
              already returns the whole competition document, so this needs no extra request. */}
          <datalist id="special-award-titles">
            {(state.competition?.prizes?.special || [])
              .map((p) => p?.title)
              .filter(Boolean)
              .map((title) => <option key={title} value={title} />)}
          </datalist>
          <div className="mt-2 space-y-2">
            {specialAwards.map((award, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <select
                  value={award.entryId}
                  onChange={(e) => setSpecialAwards(specialAwards.map((a, j) => (j === i ? { ...a, entryId: e.target.value } : a)))}
                  className={`${cls.input(dark)} flex-1 min-w-[200px]`}
                >
                  <option value="">Select an entry…</option>
                  {entryOptions}
                </select>
                {/* Free text, as required — award names are not a fixed vocabulary. The competition's
                    own configured awards are offered as suggestions so the declared title matches
                    what was advertised instead of being retyped from memory. */}
                <input
                  value={award.title}
                  list="special-award-titles"
                  placeholder="Award name, e.g. Best Dialogue"
                  onChange={(e) => setSpecialAwards(specialAwards.map((a, j) => (j === i ? { ...a, title: e.target.value } : a)))}
                  className={`${cls.input(dark)} flex-1 min-w-[160px]`}
                />
                <button type="button" onClick={() => setSpecialAwards(specialAwards.filter((_, j) => j !== i))} className={cls.ghost(dark)}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => setSpecialAwards([...specialAwards, { entryId: "", title: "" }])} className={cls.ghost(dark)}>+ Add special award</button>
          </div>

          <button type="button" onClick={declare} disabled={!winnerEntryId || declaring} className={`${cls.primary} mt-5`}>
            {declaring ? "Declaring…" : "Declare results"}
          </button>
        </div>
      ) : null}

      {declared ? (
        <div className={`${cls.card(dark)} mb-5`}>
          <p className={`text-sm font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
            Results declared {new Date(state.competition.resultsDeclaredAt).toLocaleString()}
          </p>
        </div>
      ) : null}

      {state.loading ? (
        <p className={cls.body(dark)}>Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className={dark ? "text-white/50" : "text-gray-500"}>
                {["Writer", "Event ID", "Status", "Submitted", "Pages / Words", "AI", "Result", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.entries.map((entry) => (
                <tr key={entry._id} className={`border-t ${dark ? "border-white/10" : "border-gray-200"}`}>
                  <td className="px-3 py-3">
                    <p className={`font-medium ${dark ? "text-white" : "text-gray-900"}`}>{entry.userId?.name || "—"}</p>
                    <p className={`text-xs ${cls.body(dark)}`}>{entry.userId?.email}</p>
                  </td>
                  <td className={`px-3 py-3 font-mono text-xs ${cls.body(dark)}`}>{entry.eventId}</td>
                  <td className={`px-3 py-3 ${cls.body(dark)}`}>{entry.status}</td>
                  <td className={`px-3 py-3 text-xs ${cls.body(dark)}`}>
                    {entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : "—"}
                  </td>
                  <td className={`px-3 py-3 text-xs ${cls.body(dark)}`}>
                    {entry.snapshot?.pageCount || 0} / {entry.snapshot?.wordCount || 0}
                  </td>
                  <td className="px-3 py-3 max-w-[280px]">
                    {entry.ai?.error || aiRunStalled(entry.ai) ? (
                      <div>
                        <p className="text-xs text-red-500">
                          {entry.ai?.error
                            || `Stalled — started ${new Date(entry.ai.startedAt).toLocaleString()} and never finished.`}
                        </p>
                        <button
                          type="button"
                          onClick={() => retryAI(entry._id)}
                          disabled={retrying === entry._id}
                          className="mt-1 text-xs font-semibold text-[#D14D37] hover:underline"
                        >
                          {retrying === entry._id ? "Retrying…" : "Retry AI"}
                        </button>
                      </div>
                    ) : aiRunInFlight(entry.ai) ? (
                      <span className={`text-xs ${cls.body(dark)}`}>
                        Running since {new Date(entry.ai.startedAt).toLocaleTimeString()}…
                      </span>
                    ) : entry.ai?.logline ? (
                      <div>
                        <p className={`text-xs ${cls.body(dark)} ${expanded[entry._id] ? "" : "line-clamp-2"}`}>{entry.ai.logline}</p>
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [entry._id]: !prev[entry._id] }))}
                          className="mt-1 text-xs font-medium text-[#D14D37] hover:underline"
                        >
                          {expanded[entry._id] ? "Less" : "More"}
                        </button>
                        {entry.ai.evaluation?.overall ? (
                          <p className={`mt-1 text-xs font-semibold ${dark ? "text-white/70" : "text-gray-700"}`}>
                            Score {entry.ai.evaluation.overall}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className={`text-xs ${cls.body(dark)}`}>—</span>
                    )}
                  </td>
                  <td className={`px-3 py-3 text-xs ${cls.body(dark)}`}>
                    {entry.result?.specialTitle || entry.result?.award || "—"}
                  </td>
                  <td className="px-3 py-3">
                    {entry.snapshot?.fountainContent || entry.snapshot?.textContent ? (
                      <button type="button" onClick={() => setSnapshot(entry)} className={cls.ghost(dark)}>View</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {snapshot ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onMouseDown={() => setSnapshot(null)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className={`flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl ${dark ? "bg-[#141414]" : "bg-white"}`}
          >
            <div className={`flex items-center justify-between border-b px-5 py-4 ${dark ? "border-white/10" : "border-gray-200"}`}>
              <div>
                <p className={`font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{snapshot.snapshot?.title || "Untitled"}</p>
                <p className={`text-xs ${cls.body(dark)}`}>{snapshot.userId?.name} · {snapshot.eventId}</p>
              </div>
              <button type="button" onClick={() => setSnapshot(null)} className={cls.ghost(dark)}>Close</button>
            </div>
            <div className="overflow-y-auto p-5">
              <ScreenplayReadOnly
                text={snapshot.snapshot?.fountainContent || snapshot.snapshot?.textContent || ""}
                dark={dark}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
