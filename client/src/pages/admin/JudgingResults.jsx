import { Fragment, useEffect, useState } from "react";
import { adminApi } from "../AdminDashboard";

/**
 * What the judge panel decided, on the same screen as the form that declares results.
 *
 * Deliberately a SUGGESTION SURFACE, not a decision engine. The one thing it can do to the declare
 * form is pre-fill it, by calling the setters that form already owns — the admin then sees the same
 * three selects, edits anything, and still has to clear the same confirmation. `adminDeclareResults`
 * and its irreversible grant loop are not touched by any of this.
 *
 * It lives beside the declare form rather than on its own screen for one reason: a ranking on one
 * page and a declaration on another is how the two come to disagree.
 *
 * The admin is NOT blind here. Writer names are shown, because the person handing out prizes is
 * accountable for who gets them and already sees names everywhere else in this console. Only the
 * judge is blind.
 */

const pct = (n) => (n === null || n === undefined ? "—" : `${n}`);

export default function JudgingResults({ dark, competitionId, cls, onPrefill, canPrefill }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState({});
  // Keyed by entry id: what the admin has typed but not yet committed. Kept apart from `data` so a
  // half-typed "7" on the way to "75" never looks like a saved score.
  const [finalDraft, setFinalDraft] = useState({});
  const [savingFinal, setSavingFinal] = useState("");

  const saveFinalScore = async (entryId) => {
    const raw = finalDraft[entryId];
    setSavingFinal(entryId);
    try {
      const { data: saved } = await adminApi.put(
        `/admin/competitions/${competitionId}/entries/${entryId}/final-score`,
        { finalScore: raw === "" ? null : Number(raw) }
      );
      // Patch in place rather than refetching the whole leaderboard: a reload would collapse every
      // open detail row the admin was reading to make this very decision.
      setData((prev) => (prev ? {
        ...prev,
        leaderboard: prev.leaderboard.map((r) => (r.entryId === entryId ? { ...r, finalScore: saved.finalScore } : r)),
      } : prev));
      setFinalDraft((d) => { const next = { ...d }; delete next[entryId]; return next; });
    } catch (err) {
      setError(err?.response?.data?.message || "Could not save the final score.");
    } finally {
      setSavingFinal("");
    }
  };

  useEffect(() => {
    let cancelled = false;
    adminApi
      .get(`/admin/competitions/${competitionId}/judging`)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.message || "Could not load judging results."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [competitionId]);

  if (loading) return null;
  if (error) return <p className={`mb-4 text-xs ${cls.body(dark)}`}>{error}</p>;

  const rows = data?.leaderboard || [];
  const meta = data?.meta || {};
  const nominations = data?.nominations || [];
  const panel = (data?.panel || []).filter((p) => p.status === "active");
  const scored = rows.filter((r) => r.weightedMean !== null);

  // Inert on every competition judged without a panel, which is every competition that exists today.
  if (!panel.length && !scored.length) return null;

  const finished = panel.filter((p) => p.submittedCount > 0).length;

  const prefill = () => {
    const ranked = scored.slice().sort((a, b) => a.suggestedRank - b.suggestedRank);
    // A tie at the top means the panel did not choose, so neither does this — leaving the field
    // blank makes the admin look, which is the correct outcome.
    const first = ranked[0] && !ranked[0].tiedWith.length ? ranked[0] : null;
    const second = ranked.find((r) => r.suggestedRank === 2 && !r.tiedWith.length) || null;
    const third = ranked.find((r) => r.suggestedRank === 3 && !r.tiedWith.length) || null;
    const specials = nominations
      .filter((n) => n.suggested)
      .map((n) => ({ entryId: n.suggested.entryId, title: n.label }));

    onPrefill({ winnerEntryId: first?.entryId || "", runnerUpEntryId: second?.entryId || "", secondRunnerUpEntryId: third?.entryId || "", specialAwards: specials });
  };

  return (
    <div className={`${cls.card(dark)} mb-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={`${cls.heading(dark)} text-base`}>Judge panel</h3>
          <p className={`mt-1 text-xs ${cls.body(dark)}`}>
            {finished} of {panel.length} judges have scored · {meta.scoredEntryCount || 0} of {meta.entryCount || 0} entries covered
            {meta.hasTies ? " · ties present" : ""}
          </p>
        </div>
        {canPrefill && scored.length ? (
          <button type="button" onClick={prefill} className={cls.ghost(dark)}>Use suggested ranking</button>
        ) : null}
      </div>

      {/* Stated rather than enforced: one unresponsive judge must not be able to freeze a
          competition, so incomplete coverage is a warning the admin weighs, not a block. */}
      {panel.length && finished < panel.length ? (
        <p className={`mt-2 text-xs ${cls.body(dark)}`}>
          Judging is not finished. You can still declare — the shortfall is shown so you decide with it in view.
        </p>
      ) : null}

      {!scored.length ? (
        <p className={`mt-4 text-xs ${cls.body(dark)}`}>No scores submitted yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={`text-xs uppercase tracking-wide ${dark ? "text-white/50" : "text-gray-500"}`}>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Entry</th>
                <th className="py-2 pr-3">Writer</th>
                <th className="py-2 pr-3 text-right">Score</th>
                <th className="py-2 pr-3 text-right">Judges</th>
                <th className="py-2 pr-3 text-right">Spread</th>
                {/* The admin's own number, deliberately beside the panel's rather than replacing it:
                    the mean is arithmetic over whoever was assigned, this is a judgement, and the two
                    disagreeing is worth seeing. */}
                <th className="py-2 pr-3 text-right">Final</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {scored.map((row) => (
                // The key belongs on the Fragment, not the <tr>: a row and its detail row are one
                // list item, and keying the inner element leaves the fragment unkeyed.
                <Fragment key={row.entryId}>
                  <tr className={dark ? "border-t border-white/10" : "border-t border-gray-100"}>
                    <td className="py-2 pr-3 font-bold tabular-nums">
                      {row.suggestedRank}
                      {row.tiedWith.length ? <span className="ml-1 text-[11px] font-normal text-[#8a5a1c]">tied</span> : null}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs opacity-70">{row.eventId}</span>
                      <span className="ml-2">{row.title || "Untitled"}</span>
                    </td>
                    <td className="py-2 pr-3">{row.writer?.name || "—"}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{pct(row.weightedMean)}</td>
                    {/* Beside the score, always. With two judges and an abstention, "the aggregate"
                        is one person's opinion, and the number alone hides that. */}
                    <td className="py-2 pr-3 text-right tabular-nums">{row.judgeCount}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.spread}</td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`Final score for ${row.eventId}`}
                        // ?? not ||, so a saved 0 shows as 0 rather than an empty box.
                        value={finalDraft[row.entryId] ?? (row.finalScore ?? "")}
                        onChange={(e) => setFinalDraft((d) => ({ ...d, [row.entryId]: e.target.value }))}
                        onBlur={() => { if (finalDraft[row.entryId] !== undefined) saveFinalScore(row.entryId); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        disabled={savingFinal === row.entryId}
                        placeholder="—"
                        className={`w-16 rounded-md border px-2 py-1 text-right text-sm tabular-nums ${dark ? "border-white/15 bg-white/[0.04] text-white" : "border-gray-200 bg-white text-gray-900"}`}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setOpen((o) => ({ ...o, [row.entryId]: !o[row.entryId] }))}
                        className={`text-xs underline ${cls.body(dark)}`}
                      >
                        {open[row.entryId] ? "Hide" : "Detail"}
                      </button>
                    </td>
                  </tr>
                  {open[row.entryId] ? (
                    <tr className={dark ? "bg-white/[0.02]" : "bg-gray-50"}>
                      <td colSpan={8} className="px-3 py-3">
                        {row.partialScores ? (
                          <p className="mb-2 text-xs text-[#8a5a1c]">
                            At least one judge scored only part of the rubric — their weights were renormalised across what they did mark.
                          </p>
                        ) : null}
                        <div className="mb-3 flex flex-wrap gap-3 text-xs">
                          {(meta.criteria || []).map((c) => (
                            <span key={c.key} className={cls.body(dark)}>
                              {c.label} <b>{row.perCriterion?.[c.key]?.mean ?? "—"}</b>
                              <span className="opacity-60"> ({c.weight}%)</span>
                            </span>
                          ))}
                        </div>
                        <div className="space-y-2">
                          {row.judgeBreakdown.map((j, i) => (
                            <div key={i} className="text-xs">
                              <b>{j.judgeName}</b>
                              <span className="opacity-60"> · {j.status}</span>
                              {Object.keys(j.marks || {}).length ? (
                                <span className="ml-2 opacity-80">
                                  {(meta.criteria || []).map((c) => `${c.label} ${j.marks[c.key] ?? "—"}`).join(" · ")}
                                </span>
                              ) : null}
                              {j.comment ? <p className={`mt-1 ${cls.body(dark)}`}>{j.comment}</p> : null}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nominations.some((n) => n.nominations.length) ? (
        <div className={`mt-5 border-t pt-4 ${dark ? "border-white/10" : "border-gray-100"}`}>
          <h4 className={`text-xs font-bold uppercase tracking-wide ${dark ? "text-white/50" : "text-gray-500"}`}>Special award nominations</h4>
          <div className="mt-3 space-y-3">
            {nominations.filter((n) => n.nominations.length).map((award) => (
              <div key={award.key} className="text-sm">
                <p className={`font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
                  {award.label}
                  {award.tied ? <span className="ml-2 text-[11px] font-normal text-[#8a5a1c]">tied — pick one</span> : null}
                </p>
                <ul className="mt-1 space-y-1">
                  {award.nominations.map((n) => (
                    <li key={n.entryId} className={`text-xs ${cls.body(dark)}`}>
                      <span className="font-mono opacity-70">{n.eventId}</span> {n.title || "Untitled"}
                      <b className="ml-2">{n.count} nomination{n.count === 1 ? "" : "s"}</b>
                      {n.judges?.map((j, i) => (
                        <span key={i} className="block pl-4 opacity-80">{j.name}: {j.reason}</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
