/**
 * The certificate as an email attachment.
 *
 * Results day used to be a notification and a download link; the certificate itself waited in the
 * dashboard for whoever came looking. Now it travels with the results email. Built from the same
 * generator the dashboard download uses, so the two can never differ, and best-effort by design:
 * a PDF that fails to render must never stop the results going out — the download stays available.
 */
import { generateCompetitionCertificate } from "./competitionCertificatePdf.js";

const safeFileName = (value) =>
  String(value || "certificate")
    .replace(/[^\w.-]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100);

export const certificateFileName = (competitionName, eventId) =>
  `${safeFileName(`${competitionName} certificate ${eventId}`)}.pdf`;

/**
 * @returns {Promise<{filename: string, content: Buffer, contentType: string}>} a nodemailer attachment
 */
export const certificateAttachment = async ({ competition, entry, writerName, declaredAt }) => {
  if (!competition?.name || !entry?.eventId) throw new Error("certificate needs a competition and an entry");
  const content = await generateCompetitionCertificate({
    writerName: writerName || "Writer",
    competitionName: competition.name,
    scriptTitle: entry.snapshot?.title || "",
    award: entry.result?.award || "participant",
    specialTitle: entry.result?.specialTitle || "",
    eventId: entry.eventId,
    declaredAt: declaredAt || competition.resultsDeclaredAt || new Date(),
    stats: {
      pageCount: entry.snapshot?.pageCount,
      wordCount: entry.snapshot?.wordCount,
      sceneCount: entry.snapshot?.sceneCount,
    },
  });
  return { filename: certificateFileName(competition.name, entry.eventId), content, contentType: "application/pdf" };
};

/** The same, but never throws: a failed render is logged and the results mail goes without it. */
export const tryCertificateAttachment = async (args) => {
  try {
    return await certificateAttachment(args);
  } catch (error) {
    console.error("[competition] certificate attachment failed:", error?.message || error);
    return null;
  }
};
