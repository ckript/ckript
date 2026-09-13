import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { htmlToPlainText } from "./htmlText.js";
import {
  PARTICIPANT_LINES,
  buildResultMail,
  buildSubmissionMail,
  competitionLinks,
  resultCopy,
} from "./competitionMail.js";

/**
 * The results mail is the one message from the whole challenge a writer keeps. These tests pin
 * what it must carry: the same prize lines the competition page promised, the cash set apart with
 * how it is paid (and never printed twice), the badge artwork, the script's own numbers, the
 * certificate note, and links that point at real pages.
 */

const competition = {
  name: "The Final Draft",
  slug: "the-final-draft",
  badgeImages: { winner: "https://cdn.example.com/winner.png", special: "https://cdn.example.com/special.png", participant: "https://cdn.example.com/participant.png" },
  prizes: {
    winner: ["Priority Producer Showcase"],
    runnerUp: [],
    secondRunnerUp: [],
    special: [{ title: "Best Dialogues", description: "", cashMinor: 100000, cashCurrency: "INR", badgeUrl: "https://cdn.example.com/dialogue.png" }],
    grants: {
      winner: { enabled: true, plan: "gold", planDays: 60, featured: true, aiTrailer: true, cashMinor: 900000, cashCurrency: "INR" },
      runnerUp: { enabled: true, plan: "silver", planDays: 30, featured: true, aiTrailer: false, cashMinor: 0, cashCurrency: "INR" },
      secondRunnerUp: { enabled: true, plan: "silver", planDays: 14, featured: false, aiTrailer: false, cashMinor: 0, cashCurrency: "INR" },
    },
  },
};

const entry = (award, extra = {}) => ({
  eventId: "CGSC-RL4ATBKA",
  result: { award, specialTitle: "", ...extra },
  snapshot: { title: "The Distance Between Us", pageCount: 56, wordCount: 3324, sceneCount: 27 },
});

const count = (s, needle) => s.split(needle).length - 1;

describe("the words", () => {
  test("a competition whose name starts with 'The' is never 'the The'", () => {
    const copy = resultCopy({ award: "winner", competitionName: "The Final Draft", scriptTitle: "X" });
    assert.equal(copy.subtitle, "“X” took first place in The Final Draft.");
    assert.equal(resultCopy({ award: "runner_up", competitionName: "Monsoon Sprint", scriptTitle: "X", submittedCount: 42 }).subtitle, "“X” placed second in the Monsoon Sprint among 42 scripts.");
  });

  test("each outcome has its own headline", () => {
    assert.equal(resultCopy({ award: "winner" }).title, "You won.");
    assert.equal(resultCopy({ award: "runner_up" }).title, "Runner-Up.");
    assert.equal(resultCopy({ award: "second_runner_up" }).title, "Second Runner-Up.");
    assert.equal(resultCopy({ award: "special", specialTitle: "Best Dialogues" }).title, "Best Dialogues.");
    assert.equal(resultCopy({ award: "participant" }).title, "Thank you for competing.");
  });

  test("links point at the real pages, and at the hubs when there is no slug", () => {
    assert.deepEqual(competitionLinks(competition, "https://ckript.com/"), {
      dashboard: "https://ckript.com/challenge/dashboard?c=the-final-draft",
      results: "https://ckript.com/challenge/c/the-final-draft",
      hallOfFame: "https://ckript.com/hall-of-fame/the-final-draft",
    });
    assert.deepEqual(competitionLinks({}, ""), {
      dashboard: "https://ckript.com/challenge/dashboard",
      results: "https://ckript.com/challenge",
      hallOfFame: "https://ckript.com/hall-of-fame",
    });
  });
});

describe("the winner's mail", () => {
  const mail = buildResultMail({ competition, entry: entry("winner"), writerName: "Piyush Kumar Maurya", baseUrl: "https://ckript.com", certificateAttached: true, submittedCount: 42 });
  const text = htmlToPlainText(mail.html);

  test("carries the promised prize lines, the admin's extra included", () => {
    for (const line of ["Gold plan for 60 days", "Featured placement when you publish your script", "AI trailer for your script", "Winner badge", "Priority Producer Showcase"]) {
      assert.ok(mail.html.includes(line), `html: ${line}`);
      assert.ok(mail.text.includes(`- ${line}`), `text: ${line}`);
    }
  });

  test("sets the cash apart with how it is paid, and prints the amount once", () => {
    assert.equal(count(mail.html, "₹9,000"), 1);
    assert.ok(mail.html.includes("₹9,000 will be paid to you directly by Ckript, outside the platform."));
    assert.equal(count(mail.text, "₹9,000"), 1);
    assert.ok(!mail.html.includes("cash prize, paid directly by Ckript"), "the list line would be the same reward twice");
  });

  test("shows the badge artwork, the script's numbers and the certificate note", () => {
    assert.match(mail.html, /<img src="https:\/\/cdn\.example\.com\/winner\.png" alt="Winner badge" width="128"/);
    assert.ok(mail.html.includes(">56<") && mail.html.includes(">3,324<") && mail.html.includes(">27<"));
    assert.ok(mail.html.includes("Your certificate is attached to this email"));
    assert.ok(mail.text.includes("Pages: 56  ·  Words: 3,324  ·  Scenes: 27"));
  });

  test("names the writer, the script and the field", () => {
    assert.ok(text.includes("Hi Piyush Kumar Maurya,"));
    assert.ok(text.includes("“The Distance Between Us” took first place in The Final Draft among 42 scripts."));
    assert.equal(mail.preheader, "“The Distance Between Us” took first place in The Final Draft among 42 scripts.");
  });

  test("points at the dashboard, the results and the Hall of Fame", () => {
    assert.ok(mail.html.includes('href="https://ckript.com/challenge/dashboard?c=the-final-draft"'));
    assert.ok(mail.html.includes('href="https://ckript.com/challenge/c/the-final-draft"'));
    assert.ok(mail.html.includes('href="https://ckript.com/hall-of-fame/the-final-draft"'));
    assert.ok(mail.text.includes("Open your dashboard: https://ckript.com/challenge/dashboard?c=the-final-draft"));
    assert.ok(mail.text.includes("Your Hall of Fame record: https://ckript.com/hall-of-fame/the-final-draft"));
  });

  test("the text alternative is plain text", () => {
    assert.ok(!mail.text.includes("<"));
    assert.ok(!mail.text.includes("&amp;"));
  });
});

describe("the other outcomes", () => {
  test("a special award carries its own lines and its own artwork", () => {
    const mail = buildResultMail({ competition, entry: entry("special", { specialTitle: "Best Dialogues" }), writerName: "Ana", baseUrl: "https://ckript.com" });
    assert.ok(mail.html.includes("Best Dialogues."));
    assert.ok(mail.html.includes("Best Dialogues badge"));
    assert.equal(count(mail.html, "₹1,000"), 1);
    assert.match(mail.html, /<img src="https:\/\/cdn\.example\.com\/dialogue\.png"/);
    assert.ok(!mail.html.includes("special.png"), "the award's own image wins over the shared one");
  });

  test("a special award typed fresh at declare time carries the badge alone", () => {
    const mail = buildResultMail({ competition, entry: entry("special", { specialTitle: "Most Original Voice" }), baseUrl: "https://ckript.com" });
    assert.ok(mail.html.includes("Most Original Voice badge"));
    assert.ok(!mail.html.includes("Cash prize"));
  });

  test("a participant is thanked, keeps their lines, and is sent to the results first", () => {
    const mail = buildResultMail({ competition, entry: entry("participant"), writerName: "Noor", baseUrl: "https://ckript.com" });
    assert.ok(mail.html.includes("Thank you for competing."));
    for (const line of PARTICIPANT_LINES) assert.ok(mail.html.includes(line), line);
    assert.match(mail.html, /class="cta" href="https:\/\/ckript\.com\/challenge\/c\/the-final-draft"[^>]*>See the results</);
    assert.ok(!mail.html.includes("hall-of-fame"), "no Hall of Fame record to point at");
    assert.match(mail.html, /<img src="https:\/\/cdn\.example\.com\/participant\.png"/);
    assert.ok(mail.html.includes("Your certificate is ready in your challenge dashboard."));
  });

  test("a runner-up with no cash gets no cash panel and no artwork when none was uploaded", () => {
    const mail = buildResultMail({ competition, entry: entry("runner_up"), baseUrl: "https://ckript.com" });
    assert.ok(mail.html.includes("Runner-Up."));
    assert.ok(mail.html.includes("Silver plan for 30 days"));
    assert.ok(!mail.html.includes("Cash prize"));
    assert.ok(!mail.html.includes("cdn.example.com"));
  });

  test("an entry with nothing configured still renders — the defaults are the old grants", () => {
    const mail = buildResultMail({ competition: { name: "Old Challenge" }, entry: { result: { award: "winner" } } });
    assert.ok(mail.html.includes("Gold plan for 30 days"));
    assert.ok(mail.html.includes("Hi there,"));
    assert.ok(mail.html.includes("https://ckript.com/challenge/dashboard"));
  });

  test("everything typed is escaped", () => {
    const hostile = "<script>alert(1)</script>";
    const mail = buildResultMail({
      competition: { name: hostile, slug: "x", prizes: { winner: [hostile] } },
      entry: { result: { award: "winner" }, snapshot: { title: hostile } },
      writerName: hostile,
    });
    assert.ok(!mail.html.includes("<script>"));
  });
});

describe("the submission receipt", () => {
  const mail = buildSubmissionMail({
    competition,
    entry: entry("none"),
    writerName: "Jiya",
    scriptTitle: "The Distance Between Us",
    submittedAt: new Date("2026-09-04T18:30:00Z"),
    baseUrl: "https://ckript.com",
  });

  test("records the script, the entry ID, the time and the numbers", () => {
    const text = htmlToPlainText(mail.html);
    assert.ok(text.includes("Submission received."));
    assert.ok(text.includes("CGSC-RL4ATBKA"));
    assert.ok(text.includes("Fri, 04 Sep 2026 18:30:00 GMT"));
    assert.ok(mail.html.includes(">56<") && mail.html.includes(">3,324<"));
    assert.ok(mail.html.includes('href="https://ckript.com/challenge/dashboard?c=the-final-draft"'));
  });

  test("the text alternative says the same", () => {
    assert.ok(mail.text.includes('Your script "The Distance Between Us" was submitted to The Final Draft at Fri, 04 Sep 2026 18:30:00 GMT.'));
    assert.ok(mail.text.includes("Entry ID: CGSC-RL4ATBKA"));
    assert.ok(mail.text.includes("Open your dashboard: https://ckript.com/challenge/dashboard?c=the-final-draft"));
  });
});
