import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_GRANTS,
  DEFAULT_SPECIAL_GRANT,
  MAX_PLAN_DAYS,
  PLACING_AWARD,
  badgeImageFor,
  composePrizeLines,
  sanitizeBadgeImages,
  formatCash,
  grantLines,
  resolveGrants,
  sanitizeGrant,
  sanitizeGrants,
  sanitizeSpecialAwards,
  specialGrantFor,
} from "./competitionRewards.js";

/**
 * The rewards module is the one definition the declare flow, the public pages and the confirmation
 * dialog all read. These tests pin the promises that matter: an older competition with no
 * configuration grants exactly what the old hardcoded handler did, every surface prints the same
 * words for the same grant, and a tier that is not enabled is never promised.
 */

describe("defaults reproduce the pre-configuration behaviour", () => {
  test("a competition with no prizes.grants resolves to the historical grants", () => {
    const grants = resolveGrants({ prizes: { winner: ["Cash Prize"] } });
    assert.deepEqual(grants.winner, { enabled: true, plan: "gold", planDays: 30, featured: true, aiTrailer: true, cashMinor: 0, cashCurrency: "INR" });
    assert.deepEqual(grants.runnerUp, { enabled: true, plan: "silver", planDays: 30, featured: true, aiTrailer: false, cashMinor: 0, cashCurrency: "INR" });
    assert.equal(grants.secondRunnerUp.enabled, false, "second runner-up never existed before, so it starts off");
    assert.equal(grants.secondRunnerUp.plan, "silver");
    assert.equal(grants.secondRunnerUp.planDays, 14);
  });

  test("a competition with no prizes at all resolves the same way", () => {
    assert.deepEqual(resolveGrants({}), sanitizeGrants(undefined));
    assert.deepEqual(resolveGrants(null).winner, DEFAULT_GRANTS.winner);
  });

  test("the placing → award mapping covers every placing", () => {
    assert.deepEqual(PLACING_AWARD, { winner: "winner", runnerUp: "runner_up", secondRunnerUp: "second_runner_up" });
  });
});

describe("sanitising keeps every field valid", () => {
  test("unknown plan, out-of-range days, negative cash and a bad currency fall back", () => {
    const g = sanitizeGrant({ plan: "platinum", planDays: 9999, featured: "yes", cashMinor: -5, cashCurrency: "eur" }, DEFAULT_GRANTS.runnerUp);
    assert.equal(g.plan, "silver");
    assert.equal(g.planDays, MAX_PLAN_DAYS);
    assert.equal(g.featured, true);
    assert.equal(g.cashMinor, 0);
    assert.equal(g.cashCurrency, "INR");
    assert.equal(g.enabled, true);
  });

  test("valid values are kept as given, days floored at one, currency upper-cased", () => {
    const g = sanitizeGrant({ enabled: true, plan: "none", planDays: 0.4, featured: false, aiTrailer: true, cashMinor: 500000, cashCurrency: "usd" }, DEFAULT_GRANTS.secondRunnerUp);
    assert.deepEqual(g, { enabled: true, plan: "none", planDays: 1, featured: false, aiTrailer: true, cashMinor: 500000, cashCurrency: "USD" });
  });

  test("special awards keep their title and description and gain valid grant fields", () => {
    const rows = sanitizeSpecialAwards([
      { title: " Best Dialogue ", description: "Jury citation", plan: "gold", planDays: 400, cashMinor: "250000" },
      { title: "", description: "" },
      null,
      "junk",
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { title: "Best Dialogue", description: "Jury citation", plan: "gold", planDays: MAX_PLAN_DAYS, featured: false, cashMinor: 250000, cashCurrency: "INR", badgeUrl: "" });
    assert.deepEqual(rows[1], { title: "", description: "", ...DEFAULT_SPECIAL_GRANT, badgeUrl: "" });
  });
});

describe("badge artwork", () => {
  const competition = {
    badgeImages: { winner: "https://cdn.example.com/winner.png", special: "https://cdn.example.com/special.png", participant: "javascript:alert(1)" },
    prizes: { special: [{ title: "Best Dialogue", badgeUrl: "https://cdn.example.com/dialogue.png" }, { title: "Best Theme", badgeUrl: "" }] },
  };

  test("only http(s) images survive sanitising; every kind is always present", () => {
    assert.deepEqual(sanitizeBadgeImages(competition.badgeImages), {
      winner: "https://cdn.example.com/winner.png", runnerUp: "", secondRunnerUp: "", special: "https://cdn.example.com/special.png", participant: "",
    });
    assert.deepEqual(sanitizeBadgeImages(undefined), { winner: "", runnerUp: "", secondRunnerUp: "", special: "", participant: "" });
  });

  test("a placing takes its kind's image, a special award its own before the shared one", () => {
    assert.equal(badgeImageFor(competition, "winner"), "https://cdn.example.com/winner.png");
    assert.equal(badgeImageFor(competition, "runner_up"), "");
    assert.equal(badgeImageFor(competition, "participant"), "", "a javascript: URL is not an image");
    assert.equal(badgeImageFor(competition, "special", "best dialogue"), "https://cdn.example.com/dialogue.png");
    assert.equal(badgeImageFor(competition, "special", "Best Theme"), "https://cdn.example.com/special.png");
    assert.equal(badgeImageFor(competition, "special", "Typed fresh"), "https://cdn.example.com/special.png");
    assert.equal(badgeImageFor({}, "winner"), "");
    assert.equal(badgeImageFor(competition, "none"), "");
  });
});

describe("special awards carry what was configured for their title", () => {
  const competition = { prizes: { special: [{ title: "Best Dialogue", plan: "silver", planDays: 30, featured: true, cashMinor: 500000 }] } };

  test("matched case-insensitively and trimmed", () => {
    assert.deepEqual(specialGrantFor(competition, "  best dialogue "), { plan: "silver", planDays: 30, featured: true, cashMinor: 500000, cashCurrency: "INR" });
  });

  test("a title typed fresh at declare time carries the badge alone", () => {
    assert.deepEqual(specialGrantFor(competition, "Most Original Voice"), { ...DEFAULT_SPECIAL_GRANT });
    assert.deepEqual(specialGrantFor(competition, ""), { ...DEFAULT_SPECIAL_GRANT });
  });
});

describe("one wording for every surface", () => {
  test("formatCash prints whole amounts without decimals in the currency's own locale", () => {
    assert.equal(formatCash(5000000, "INR"), "₹50,000");
    assert.equal(formatCash(120000, "USD"), "$1,200");
    assert.equal(formatCash(9950, "USD"), "$99.50");
  });

  test("grant lines read money, plan, placements, badge — in that order", () => {
    const lines = grantLines({ plan: "gold", planDays: 30, featured: true, aiTrailer: true, cashMinor: 5000000, cashCurrency: "INR" }, { badgeLabel: "Winner" });
    assert.deepEqual(lines, [
      "₹50,000 cash prize, paid directly by Ckript",
      "Gold plan for 30 days",
      "Featured placement when you publish your script",
      "AI trailer for your script",
      "Winner badge",
    ]);
  });

  test("a grant with nothing but the badge prints only the badge", () => {
    assert.deepEqual(grantLines({ plan: "none", featured: false, aiTrailer: false, cashMinor: 0 }, { badgeLabel: "Second Runner-Up" }), ["Second Runner-Up badge"]);
  });

  test("composePrizeLines puts the platform's grants before the admin's extras and drops the old seeded lines", () => {
    const composed = composePrizeLines({
      prizes: {
        winner: ["Cash Prize", "Gold Subscription (30 days)", "Producer meetings", "  ", ""],
        runnerUp: ["Featured placement when you publish your script"],
        grants: { winner: { plan: "none", featured: false, aiTrailer: false, cashMinor: 10000000, cashCurrency: "INR" } },
        special: [{ title: "Best Dialogue", description: "Jury citation", plan: "silver", planDays: 30 }],
      },
    });
    assert.deepEqual(composed.winner, ["₹1,00,000 cash prize, paid directly by Ckript", "Winner badge", "Producer meetings"]);
    // Runner-up was not configured, so the historical default stands; its seeded extra is dropped.
    assert.deepEqual(composed.runnerUp, ["Silver plan for 30 days", "Featured placement when you publish your script", "Runner-Up badge"]);
    assert.deepEqual(composed.special, [{ title: "Best Dialogue", description: "Jury citation", badgeUrl: "", lines: ["Silver plan for 30 days", "Best Dialogue badge"] }]);
  });

  test("typed lines that describe platform items are not printed twice beside the grant", () => {
    // The Final Draft's real lists: amounts, subscriptions with their own day counts, trailers with a
    // length, badges — all of which the grants now express — plus one genuine extra.
    const composed = composePrizeLines({
      prizes: {
        winner: ["INR 9,000", "Featured placement when you publish your script", "Gold Subscription (60 days)", "AI Trailer (60 sec)", "Winner Badge", "Priority Producer Showcase"],
        runnerUp: ["INR 5,000", "Ai trailer(30sec)", "Silver Subscription (30 days)", "Runner-Up Badge"],
        grants: {
          winner: { plan: "gold", planDays: 60, featured: true, aiTrailer: true, cashMinor: 900000, cashCurrency: "INR" },
          runnerUp: { plan: "silver", planDays: 30, featured: true, aiTrailer: true, cashMinor: 500000, cashCurrency: "INR" },
        },
        special: [{ title: "Best Dialogues", description: "INR 1,000", cashMinor: 100000 }],
      },
    });
    assert.deepEqual(composed.winner, [
      "₹9,000 cash prize, paid directly by Ckript",
      "Gold plan for 60 days",
      "Featured placement when you publish your script",
      "AI trailer for your script",
      "Winner badge",
      "Priority Producer Showcase",
    ]);
    assert.deepEqual(composed.runnerUp, [
      "₹5,000 cash prize, paid directly by Ckript",
      "Silver plan for 30 days",
      "Featured placement when you publish your script",
      "AI trailer for your script",
      "Runner-Up badge",
    ]);
    // A description that is only an amount is the grant, not a description.
    assert.deepEqual(composed.special, [{ title: "Best Dialogues", description: "", badgeUrl: "", lines: ["₹1,000 cash prize, paid directly by Ckript", "Best Dialogues badge"] }]);
  });

  test("a second runner-up tier prints nothing until it is enabled", () => {
    assert.deepEqual(composePrizeLines({ prizes: {} }).secondRunnerUp, []);
    const enabled = composePrizeLines({ prizes: { grants: { secondRunnerUp: { enabled: true } } } });
    assert.deepEqual(enabled.secondRunnerUp, ["Silver plan for 14 days", "Second Runner-Up badge"]);
  });
});
