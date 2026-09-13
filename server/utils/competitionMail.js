/**
 * The competition's own mail: the results mail every entrant receives when results are declared,
 * and the receipt a writer gets the moment their script is submitted.
 *
 * The results mail used to be one sentence — "You won the X! Your rewards have been added to your
 * account." — with the certificate stapled on. It is the one message from the whole challenge a
 * writer keeps, so it now reads like a result: what placed, what it brings (the same prize lines the
 * competition page promised, from competitionRewards.js, so the two can never disagree), the
 * badge artwork the admin uploaded, the script's own numbers, and where to go next.
 *
 * Pure functions: they take the documents and return { html, text, preheader }. The controller
 * decides who gets what and when; this decides only how it reads.
 */
import { badgeImageFor, composePrizeLines, formatCash, resolveGrants, specialGrantFor } from "./competitionRewards.js";
import { button, facts, heading, image, links, list, panel, paragraphs, renderMailDocument, stats } from "./mailDocument.js";

const AWARD_PLACING = Object.freeze({ winner: "winner", runner_up: "runnerUp", second_runner_up: "secondRunnerUp" });
const ORDINAL = Object.freeze({ winner: "first", runner_up: "second", second_runner_up: "third" });

/** What a participant keeps: the lines the old completion sentence made, as a list. */
export const PARTICIPANT_LINES = Object.freeze([
  "Participant badge on your profile",
  "Your AI evaluation and story materials, yours to keep",
  "Your script stays in your Ckript library",
]);

const clean = (value) => String(value ?? "").trim();
const quote = (title) => (clean(title) ? `“${clean(title)}”` : "your script");
/** "the The Final Draft" is what naive interpolation produces; competitions often start with "The". */
const withThe = (name) => (/^the\b/i.test(name) ? name : `the ${name}`);
const count = (value) => (Number(value) > 0 ? Number(value).toLocaleString("en-US") : "");

/** Where the mails point. The slug-less fallbacks are the hub pages, never a 404. */
export const competitionLinks = (competition, baseUrl) => {
  const base = clean(baseUrl).replace(/\/+$/, "") || "https://ckript.com";
  const slug = clean(competition?.slug);
  const s = encodeURIComponent(slug);
  return {
    dashboard: slug ? `${base}/challenge/dashboard?c=${s}` : `${base}/challenge/dashboard`,
    results: slug ? `${base}/challenge/c/${s}` : `${base}/challenge`,
    hallOfFame: slug ? `${base}/hall-of-fame/${s}` : `${base}/hall-of-fame`,
  };
};

const snapshotStats = (entry) =>
  [["Pages", entry?.snapshot?.pageCount], ["Words", entry?.snapshot?.wordCount], ["Scenes", entry?.snapshot?.sceneCount]]
    .map(([label, value]) => [label, count(value)])
    .filter(([, value]) => value);

/** The words for each outcome. One place, so the subject, the headline and the text agree. */
export const resultCopy = ({ award, specialTitle = "", competitionName = "", scriptTitle = "", submittedCount = 0 } = {}) => {
  const name = clean(competitionName) || "the challenge";
  const inName = withThe(name);
  const script = quote(scriptTitle);
  const among = Number(submittedCount) > 1 ? ` among ${Number(submittedCount)} scripts` : "";
  const eyebrow = `${name} · Results`;
  const placing = ORDINAL[award];
  if (award === "winner") {
    return {
      eyebrow, title: "You won.",
      subtitle: `${script} took first place in ${inName}${among}.`,
      lead: "The jury has read every script, and yours came out on top. Everything you have won is already on your account:",
      badgeAlt: "Winner badge",
    };
  }
  if (placing) {
    const label = award === "runner_up" ? "Runner-Up" : "Second Runner-Up";
    return {
      eyebrow, title: `${label}.`,
      subtitle: `${script} placed ${placing} in ${inName}${among}.`,
      lead: `${placing === "second" ? "Second" : "Third"} place, from a jury reading blind. Here is what it brings:`,
      badgeAlt: `${label} badge`,
    };
  }
  if (award === "special") {
    const title = clean(specialTitle) || "Special Award";
    return {
      eyebrow, title: `${title}.`,
      subtitle: `A special award for ${script} in ${inName}.`,
      lead: `The jury singled your script out for ${title}. Here is what the award carries:`,
      badgeAlt: `${title} badge`,
    };
  }
  return {
    eyebrow, title: "Thank you for competing.",
    subtitle: `${script} went the distance in ${inName}. Writing a screenplay in 48 hours is the hard part, and you did it.`,
    lead: "The results are out. Here is what stays with you:",
    badgeAlt: "Participant badge",
  };
};

/** The prize lines for this outcome — the same lines the competition page promised. */
export const prizeLinesFor = (competition, award, specialTitle = "") => {
  const placing = AWARD_PLACING[award];
  if (placing) return composePrizeLines(competition)[placing] || [];
  if (award === "special") {
    const wanted = clean(specialTitle).toLowerCase();
    const row = composePrizeLines(competition).special.find((s) => clean(s.title).toLowerCase() === wanted);
    return row ? row.lines : [`${clean(specialTitle) || "Special award"} badge`];
  }
  return [...PARTICIPANT_LINES];
};

/** The cash this outcome carries, formatted, or "" — the ledger's amount, never the mail's own idea. */
export const cashFor = (competition, award, specialTitle = "") => {
  const placing = AWARD_PLACING[award];
  const grant = placing ? resolveGrants(competition)[placing] : award === "special" ? specialGrantFor(competition, specialTitle) : null;
  return grant && Number(grant.cashMinor) > 0 ? formatCash(grant.cashMinor, grant.cashCurrency) : "";
};

const CERTIFICATE_ATTACHED = "Your certificate is attached to this email, and stays available in your challenge dashboard.";
const CERTIFICATE_DASHBOARD = "Your certificate is ready in your challenge dashboard.";

/**
 * @returns {{ html: string, text: string, preheader: string }}
 */
export const buildResultMail = ({ competition, entry, writerName = "", baseUrl = "", certificateAttached = false, submittedCount = 0 } = {}) => {
  const award = clean(entry?.result?.award) || "participant";
  const specialTitle = clean(entry?.result?.specialTitle);
  const copy = resultCopy({ award, specialTitle, competitionName: competition?.name, scriptTitle: entry?.snapshot?.title, submittedCount });
  const cash = cashFor(competition, award, specialTitle);
  // The cash line is set apart below with how it is paid; printing it in the list as well would be
  // the same reward twice, the thing composePrizeLines exists to prevent.
  const lines = prizeLinesFor(competition, award, specialTitle).filter((line) => !(cash && /cash prize/i.test(line)));
  const badge = badgeImageFor(competition, award, specialTitle);
  const urls = competitionLinks(competition, baseUrl);
  const placed = award !== "participant";
  const name = clean(writerName) || "there";
  const numbers = snapshotStats(entry);
  const certificateNote = certificateAttached ? CERTIFICATE_ATTACHED : CERTIFICATE_DASHBOARD;
  const cashNote = cash ? `${cash} will be paid to you directly by Ckript, outside the platform. We will write to you about the transfer.` : "";
  const primary = placed ? { text: "Open your dashboard", url: urls.dashboard } : { text: "See the results", url: urls.results };
  const secondary = placed
    ? [{ text: "See the full results", url: urls.results }, { text: "Your Hall of Fame record", url: urls.hallOfFame }]
    : [{ text: "Open your dashboard", url: urls.dashboard }];

  const html = renderMailDocument({
    title: copy.title,
    preheader: copy.subtitle,
    blocks: [
      heading({ eyebrow: copy.eyebrow, title: copy.title, subtitle: copy.subtitle, align: "center" }),
      image({ src: badge, alt: copy.badgeAlt, width: 128 }),
      paragraphs(`Hi ${name},\n\n${copy.lead}`),
      list(lines),
      cash ? panel({ eyebrow: "Cash prize", text: cashNote }) : "",
      stats(numbers),
      panel({ eyebrow: "Certificate", text: certificateNote }),
      button({ ...primary, align: "center" }),
      links(secondary, { align: "center" }),
    ],
  });

  const text = [
    `Hi ${name},`,
    "",
    copy.title,
    copy.subtitle,
    "",
    copy.lead,
    ...lines.map((line) => `- ${line}`),
    ...(cash ? ["", `Cash prize: ${cashNote}`] : []),
    ...(numbers.length ? ["", numbers.map(([label, value]) => `${label}: ${value}`).join("  ·  ")] : []),
    "",
    certificateNote,
    "",
    `${primary.text}: ${primary.url}`,
    ...secondary.map((link) => `${link.text}: ${link.url}`),
  ].join("\n");

  return { html, text, preheader: copy.subtitle };
};

/**
 * The receipt for a submission. Carries what the writer will want later — the entry ID, the exact
 * time, the script's numbers — because "submitted at <UTC string>" was all they got before.
 */
export const buildSubmissionMail = ({ competition, entry, writerName = "", scriptTitle = "", submittedAt = null, baseUrl = "" } = {}) => {
  const name = clean(writerName) || "there";
  const title = clean(scriptTitle) || clean(entry?.snapshot?.title) || "Untitled";
  const competitionName = clean(competition?.name) || "the challenge";
  const when = submittedAt ? new Date(submittedAt) : new Date();
  const whenText = Number.isNaN(when.getTime()) ? "" : when.toUTCString();
  const urls = competitionLinks(competition, baseUrl);
  const numbers = snapshotStats(entry);
  const eventId = clean(entry?.eventId);

  const html = renderMailDocument({
    title: `Submission received — ${competitionName}`,
    preheader: `${quote(title)} was submitted to ${competitionName}. Your script is now locked.`,
    blocks: [
      heading({ eyebrow: competitionName, title: "Submission received.", subtitle: `${quote(title)} is in. Your script is now locked, and the panel will read it exactly as you left it.` }),
      paragraphs(`Hi ${name},\n\nThat is the hard part done. Here is your entry as we recorded it:`),
      facts([["Script", title], ["Entry ID", eventId], ["Submitted", whenText]]),
      stats(numbers),
      paragraphs("We will email you the moment results are announced. Until then, your dashboard keeps your entry's timeline and materials."),
      button({ text: "Open your dashboard", url: urls.dashboard }),
    ],
  });

  const text = [
    `Hi ${name},`,
    "",
    `Your script "${title}" was submitted to ${competitionName}${whenText ? ` at ${whenText}` : ""}. Your script is now locked.`,
    ...(eventId ? [`Entry ID: ${eventId}`] : []),
    ...(numbers.length ? [numbers.map(([label, value]) => `${label}: ${value}`).join("  ·  ")] : []),
    "",
    "We will email you when results are announced.",
    "",
    `Open your dashboard: ${urls.dashboard}`,
  ].join("\n");

  return { html, text, preheader: `${quote(title)} was submitted to ${competitionName}.` };
};
