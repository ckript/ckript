import nodemailer from "nodemailer";
import Notification from "../models/Notification.js";
import mailFrom from "./mailFrom.js";
import { CONTACTS, signatureHtml, signatureText } from "./companyContacts.js";
import { escapeHtml } from "./escapeHtml.js";
import {
  button,
  fineprint,
  heading,
  isMailDocument,
  isThemedMailDocument,
  panel,
  paragraphs,
  renderMailDocument,
  wrapMailFragment,
} from "./mailDocument.js";

let cachedTransporter = null;

const trimTrailingSlash = (value = "") => String(value || "").trim().replace(/\/+$/, "");

/**
 * Where links in these mails point. Exported so the competition controllers can hand it to the mail
 * builders — an email cannot follow a relative path, and this is the one fallback chain for it.
 */
export const resolveClientBaseUrl = () => {
  const base =
    trimTrailingSlash(process.env.PUBLIC_CLIENT_URL)
    || trimTrailingSlash(process.env.CLIENT_URL)
    || trimTrailingSlash(process.env.FRONTEND_URL)
    || trimTrailingSlash(process.env.APP_URL);

  if (!base) return "https://ckript.com";
  if (/^https?:\/\//i.test(base)) return base;
  return `https://${base}`;
};

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  const emailUser = String(process.env.EMAIL_USER || "").trim();
  const emailPassword = String(process.env.EMAIL_PASSWORD || "").replace(/\s+/g, "");
  if (!emailUser || !emailPassword) {
    return null;
  }

  if (process.env.EMAIL_HOST && process.env.EMAIL_PORT) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      auth: { user: emailUser, pass: emailPassword },
    });
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser, pass: emailPassword },
    tls: { rejectUnauthorized: false },
  });

  return cachedTransporter;
};

export const createNotification = async ({
  userId,
  type = "collab_update",
  from = null,
  script = null,
  message = "",
  actionToken = "",
}) => {
  if (!userId) return null;

  try {
    return await Notification.create({
      user: userId,
      type,
      from,
      script,
      message,
      actionToken: String(actionToken || "").trim().slice(0, 256),
    });
  } catch (error) {
    console.error("Failed to create notification:", error.message);
    return null;
  }
};

/**
 * The plain-text sign-off, appended HERE rather than in each caller so every text alternative
 * carries the contact addresses without the caller remembering to.
 */
const withSignature = (body = "", append) => {
  const source = String(body || "");
  if (!source.trim()) return source;
  return source.includes("</body>")
    ? source.replace("</body>", `${append}\n</body>`)
    : source + append;
};

/**
 * Every HTML body leaves as the platform's document.
 *
 *   - A document from mailDocument.js already carries the masthead, the footer and the addresses:
 *     sent as it is.
 *   - A bare fragment — `<p>Hi …</p>`, which is what most callers still pass — is dressed in that
 *     document, with the sign-off it used to get appended.
 *   - A full document from somewhere else is left alone, with the contact strip appended the way
 *     it always was, because rewrapping someone else's <html> would nest two documents.
 */
const dressHtml = (html, { title, preheader }) => {
  const source = String(html || "");
  if (!source.trim()) return source;
  if (isThemedMailDocument(source)) return source;
  if (isMailDocument(source)) {
    return withSignature(source, `\n<hr style="border:none;border-top:1px solid #e7e5df;margin:20px 0;" />\n<div style="color:#9a978f;font-size:12px;line-height:1.7;">\n              <p style="margin:0 0 8px 0;">Regards,<br/><strong>Team ${escapeHtml(CONTACTS.name)}</strong></p>${signatureHtml()}\n</div>`);
  }
  return wrapMailFragment(source, { title, preheader });
};

export const sendEmailNotification = async ({
  to,
  subject,
  html,
  text,
  // Optional nodemailer attachments ({ filename, content, contentType }). The competition results
  // mail carries the entrant's certificate this way.
  attachments = [],
  // The inbox preview line. Falls back to the tagline when a caller has nothing better.
  preheader = "",
}) => {
  const transporter = getTransporter();
  if (!transporter || !to) {
    return { success: false, skipped: true };
  }

  try {
    const info = await transporter.sendMail({
      from: mailFrom(),
      to,
      subject,
      attachments: Array.isArray(attachments) && attachments.length ? attachments : undefined,
      html: dressHtml(html, { title: subject, preheader }),
      text: withSignature(text, `\n\nRegards,\nTeam ${CONTACTS.name}${signatureText()}`),
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Failed to send email notification:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Names, titles and the inviter's note are free text somebody typed; the block helpers escape what
 * they are given, so nothing here reaches the HTML raw.
 */
export const sendInviteEmail = async ({ to, recipientName, scriptTitle, token, role, message = "" }) => {
  const inviteUrl = `${resolveClientBaseUrl()}/invite/${token}`;
  const safeRecipient = recipientName || "there";
  const title = String(scriptTitle || "a script").trim() || "a script";
  const safeRole = String(role || "collaborator").trim() || "collaborator";
  // "an editor", "a co-writer": the role is a noun somebody chose from a list.
  const asRole = `${/^[aeiou]/i.test(safeRole) ? "an" : "a"} ${safeRole}`;
  const note = String(message || "").trim();

  return sendEmailNotification({
    to,
    subject: `Invitation to collaborate on ${scriptTitle}`,
    preheader: `You've been invited to join “${title}” as ${asRole}.`,
    html: renderMailDocument({
      title: `Invitation to collaborate on ${title}`,
      preheader: `You've been invited to join “${title}” as ${asRole}.`,
      blocks: [
        heading({ eyebrow: "Collaboration invite", title: `Join “${title}”.`, subtitle: `You've been invited to work on this script as ${asRole} on Ckript.` }),
        paragraphs(`Hi ${safeRecipient},\n\nAccept the invitation below and the script opens in your Ckript workspace with ${safeRole} access.`),
        note ? panel({ eyebrow: "Message", text: note }) : "",
        button({ text: "Accept invitation", url: inviteUrl }),
        fineprint("This invite expires in 72 hours."),
      ],
    }),
    text: `Hi ${safeRecipient},\n\nYou've been invited to join "${scriptTitle}" as ${asRole} on Ckript.\n${message ? `Message: ${message}\n\n` : ""}Accept invitation: ${inviteUrl}\n\nThis invite expires in 72 hours.`,
  });
};

/**
 * The judge's set-password link.
 *
 * An email cannot follow a relative path, so this is the one place the invite becomes an absolute
 * URL. The admin console builds its own from window.location.origin precisely to avoid depending on
 * these env vars; here there is no browser to ask, so resolveClientBaseUrl's fallback chain is used.
 */
export const sendJudgeInviteEmail = async ({ to, name, invitePath, competitionName = "" }) => {
  const url = `${resolveClientBaseUrl()}${invitePath}`;
  const safeName = name || "there";
  const context = competitionName
    ? `You have been invited to judge ${competitionName} on Ckript.`
    : "You have been invited to judge on Ckript.";

  return sendEmailNotification({
    to,
    subject: "Your Ckript judging account",
    preheader: context,
    html: renderMailDocument({
      title: "Your Ckript judging account",
      preheader: context,
      blocks: [
        heading({ eyebrow: "Judging panel", title: "Your judging account.", subtitle: context }),
        paragraphs(`Hi ${safeName},\n\nUse the button below to choose your password. Nobody else sees it — not even the organiser who invited you.`),
        button({ text: "Set your password", url }),
        fineprint("This link works once and expires in 72 hours. If it has expired, ask the organiser for a new one."),
      ],
    }),
    text: `Hi ${name || "there"},\n\n${competitionName ? `You have been invited to judge "${competitionName}" on Ckript.` : "You have been invited to judge on Ckript."}\n\nChoose your password here (nobody else sees it, not even the organiser):\n${url}\n\nThis link works once and expires in 72 hours.`,
  });
};

/** Told they are on a panel. Sent on assignment, separately from the account invite. */
export const sendJudgeAssignmentEmail = async ({ to, name, competitionName }) => {
  const url = `${resolveClientBaseUrl()}/judge`;
  const safeName = name || "there";
  const safeCompetition = competitionName || "a competition";

  return sendEmailNotification({
    to,
    subject: `You have been added to the judging panel for ${competitionName || "a competition"}`,
    preheader: `You are on the judging panel for ${safeCompetition}.`,
    html: renderMailDocument({
      title: `Judging panel — ${safeCompetition}`,
      preheader: `You are on the judging panel for ${safeCompetition}.`,
      blocks: [
        heading({ eyebrow: "Judging panel", title: "You're on the panel.", subtitle: `You have been added to the judging panel for ${safeCompetition}.` }),
        paragraphs(`Hi ${safeName},\n\nEntries are shown to you anonymously — an entry code, the title and the script, never the writer. Your scores are yours alone until the organiser gathers the panel's.`),
        button({ text: "Open your judging console", url }),
      ],
    }),
    text: `Hi ${name || "there"},\n\nYou have been added to the judging panel for "${competitionName || "a competition"}".\n\nEntries are shown to you anonymously — an entry code, the title and the script, never the writer.\n\nOpen your judging console: ${url}`,
  });
};
