import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Medal } from "lucide-react";
import publicApi from "../../services/publicApi";
import { yearSuffix } from "./labels";

/**
 * A writer's competition record, for the public profile and their own profile view.
 *
 * Deliberately achievement-only: badges earned and challenges completed. No scores, no rankings, no
 * mention of anyone who lost — a competition history should read like a credit list, not a
 * scoreboard. The server only returns judged entries, so nothing about an in-flight competition
 * leaks through this component either.
 */

const AWARD_STYLES = {
  winner: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  runner_up: "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
  second_runner_up: "bg-stone-100 text-stone-700 dark:bg-stone-700/60 dark:text-stone-200",
  special: "bg-[#D14D37]/10 text-[#D14D37]",
  participant: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
};

const CompetitionAchievements = ({ userId, badges = [], className = "" }) => {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    publicApi
      .get(`/competitions/history/${userId}`)
      .then(({ data }) => { if (alive) setHistory(data.history || []); })
      .catch(() => { /* a profile must still render if this fails */ });
    return () => { alive = false; };
  }, [userId]);

  const shownBadges = Array.isArray(badges) ? badges : [];
  if (!shownBadges.length && !history.length) return null;

  // The most recent win, promoted out of the history list into a banner. Winning a competition is
  // the strongest credential a writer has here, so it should not be one row among many.
  // `competitionSlug` is blank for a hidden competition, which has no public record to link to.
  const topWin = history.find((row) => row.award === "winner");

  return (
    <section className={className}>
      {topWin ? (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-transparent p-5 dark:border-amber-700 dark:from-amber-900/20">
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Hall of Fame Winner
              </p>
              <p className="mt-1 text-gray-800 dark:text-gray-100">
                Winner of the{" "}
                {topWin.competitionSlug ? (
                  <Link to={`/hall-of-fame/${topWin.competitionSlug}`} className="font-semibold text-[#D14D37] hover:underline">
                    {topWin.competitionName} {yearSuffix(topWin.competitionName, topWin.year)}
                  </Link>
                ) : (
                  <span className="font-semibold">{topWin.competitionName} {yearSuffix(topWin.competitionName, topWin.year)}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {shownBadges.length ? (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Badges</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {shownBadges.map((badge, i) => (
              // A badge awarded with the competition's own artwork shows that artwork; one without
              // keeps the medal chip. The label stays visible either way — the image is decoration
              // on top of the record, not a replacement for it.
              badge.imageUrl ? (
                <span
                  key={`${badge.id}-${i}`}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-50 py-1 pl-1 pr-3 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                  data-badge-image=""
                >
                  <img src={badge.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  {badge.label}
                  {badge.awardedAt ? <span className="font-normal opacity-70">{new Date(badge.awardedAt).getFullYear()}</span> : null}
                </span>
              ) : (
                <span
                  key={`${badge.id}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                >
                  <Medal className="h-3.5 w-3.5" aria-hidden="true" />
                  {badge.label}
                  {badge.awardedAt ? <span className="font-normal opacity-70">{new Date(badge.awardedAt).getFullYear()}</span> : null}
                </span>
              )
            ))}
          </div>
        </div>
      ) : null}

      {history.length ? (
        <div className={shownBadges.length ? "mt-6" : ""}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Competition history</h3>
          <ul className="mt-3 space-y-2">
            {history.map((row, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {row.competitionName}{" "}
                    <span className="font-normal text-gray-500 dark:text-gray-400">{yearSuffix(row.competitionName, row.year)}</span>
                  </p>
                  {row.scriptTitle ? (
                    <p className="truncate text-xs text-gray-600 dark:text-gray-300">{row.scriptTitle}</p>
                  ) : null}
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${AWARD_STYLES[row.award] || AWARD_STYLES.participant}`}>
                  <Trophy className="h-3 w-3" aria-hidden="true" /> {row.achievement}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default CompetitionAchievements;
