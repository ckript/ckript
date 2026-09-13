// Human labels for the reward ledger.
//
// `entry.rewardsGranted` stores machine keys (`subscription_gold`) because it doubles as the
// idempotency ledger — grantOnce keys on those exact strings, so they must never be reworded for
// display. This maps them to something a reader understands.
//
// Kept out of ui.jsx so that file exports only components (fast-refresh requirement).

export const REWARD_LABELS = {
  subscription_gold: "Gold subscription",
  subscription_silver: "Silver subscription",
  badge_winner: "Winner badge",
  badge_runner_up: "Runner-Up badge",
  badge_special: "Special award badge",
  badge_participant: "Participant badge",
  badge_second_runner_up: "Second Runner-Up badge",
  featured_script: "Featured script",
  ai_trailer: "AI trailer",
  cash_prize: "Cash prize, paid directly by Ckript",
  notified: null,   // internal bookkeeping — deliberately never shown
};

/**
 * @param type          a key from the reward ledger
 * @param specialTitle  the award's real name, when the reward is a special-award badge
 *
 * A category award is called what it is called. Given "Best Dialogue" the badge reads "Best Dialogue
 * badge", not "Special award badge" — the whole point of naming an award is that the name survives.
 * An older entry with no title falls back to the generic wording.
 *
 * Takes an options OBJECT rather than a positional title on purpose: `rewards.map(rewardLabel)` is
 * the natural thing to write, and map passes (value, index, array) — a positional second parameter
 * would receive the index and render "0 badge". Destructuring a number yields undefined instead.
 */
export const rewardLabel = (type, { specialTitle = "" } = {}) => {
  if (type === "badge_special") {
    const title = String(specialTitle || "").trim();
    return title ? `${title} badge` : REWARD_LABELS.badge_special;
  }
  if (type in REWARD_LABELS) return REWARD_LABELS[type];
  if (String(type || "").startsWith("referral_")) return "Referral reward";
  return String(type || "").replace(/_/g, " ");
};

/**
 * The year to show beside a competition name, or "" when the name already carries it.
 *
 * Competitions are deliberately named with their year ("Global Script Challenge 2026") because the
 * slug — and therefore the Hall of Fame URL — derives from the name. Appending the year again gives
 * "Global Script Challenge 2026 2026".
 */
export const yearSuffix = (name, year) => {
  if (!year) return "";
  return String(name || "").includes(String(year)) ? "" : String(year);
};
