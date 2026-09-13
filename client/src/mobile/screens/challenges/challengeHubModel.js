const PHASE_LABELS = Object.freeze({
  announced: "Announced",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  live: "Writing under way",
  judging: "Judging",
  results: "Results declared",
});

const STATUS_LABELS = Object.freeze({
  registered: "Registered",
  writing: "Writing",
  submitted: "Submitted",
  ai_processed: "In judging",
  judged: "Complete",
});

const AWARD_LABELS = Object.freeze({
  winner: "Winner",
  runner_up: "Runner-Up",
  second_runner_up: "Second Runner-Up",
  special: "Special Award",
  participant: "Participated",
  none: "Did not submit",
});

export const HONOUR_AWARDS = Object.freeze(new Set(["winner", "runner_up", "second_runner_up", "special"]));

export const challengePhaseLabel = (phase) => PHASE_LABELS[phase] || String(phase || "Challenge").replace(/_/g, " ");
export const challengeStatusLabel = (status) => STATUS_LABELS[status] || String(status || "Registered").replace(/_/g, " ");
export const challengeAwardLabel = (entry = {}) => (
  entry?.result?.specialTitle || AWARD_LABELS[entry?.result?.award || "none"] || "Participated"
);

// The competition's own artwork for an entrant's badge: a special award's own image first, then
// the image for its kind. Mirrors badgeImageFor on the server. "" means a text chip.
const BADGE_KIND = Object.freeze({ winner: "winner", runner_up: "runnerUp", second_runner_up: "secondRunnerUp", special: "special", participant: "participant" });
export const badgeImageForEntry = (competition = {}, entry = {}) => {
  const award = entry?.result?.award;
  if (award === "special" && entry?.result?.specialTitle) {
    const wanted = String(entry.result.specialTitle).trim().toLowerCase();
    const row = (Array.isArray(competition?.prizes?.special) ? competition.prizes.special : []).find((s) => String(s?.title || "").trim().toLowerCase() === wanted);
    if (row?.badgeUrl) return row.badgeUrl;
  }
  const kind = BADGE_KIND[award];
  return kind ? String(competition?.badgeImages?.[kind] || "") : "";
};

export function challengeYear(competition = {}, entry = {}) {
  const value = competition?.dates?.startsAt || entry?.createdAt;
  const year = value ? new Date(value).getFullYear() : NaN;
  return Number.isFinite(year) ? year : "";
}

export function formatChallengeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function challengeDateRange(competition = {}) {
  const start = formatChallengeDate(competition?.dates?.startsAt);
  const end = formatChallengeDate(competition?.dates?.endsAt);
  if (!start) return "Dates to be announced";
  return end && end !== start ? `${start} – ${end}` : start;
}

export function nextChallengeDeadline(competition = {}) {
  const dates = competition?.dates || {};
  if (competition.phase === "registration_open") return { label: "Registration closes", at: dates.regClosesAt };
  if (competition.phase === "registration_closed") return { label: "Theme releases", at: dates.startsAt };
  if (competition.phase === "live") return { label: "Writing deadline", at: dates.endsAt };
  if (competition.phase === "announced") return { label: "Registration opens", at: dates.regOpensAt };
  return null;
}

export function formatChallengeCountdown(target, now = Date.now()) {
  const remaining = new Date(target).getTime() - Number(now);
  if (!Number.isFinite(remaining) || remaining <= 0) return "Now";
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function challengeResultSummary(competition = {}) {
  if (!competition.resultsDeclaredAt) return "Results have not been announced yet.";
  const names = [
    competition.winner?.name ? `Winner: ${competition.winner.name}` : "",
    competition.runnerUp?.name ? `Runner-Up: ${competition.runnerUp.name}` : "",
  ].filter(Boolean);
  return names.join(" · ") || "Results archived.";
}
