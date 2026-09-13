import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { certificateAttachment, certificateFileName, tryCertificateAttachment } from "./competitionCertificateMail.js";

const competition = { name: "The Final Draft", resultsDeclaredAt: new Date("2026-09-10T12:00:00Z") };
const entry = {
  eventId: "CGSC-RL4ATBKA",
  result: { award: "second_runner_up", specialTitle: "" },
  snapshot: { title: "The Distance Between Us", pageCount: 56, wordCount: 3324, sceneCount: 27 },
};

describe("the certificate travels with the results mail", () => {
  test("renders a real PDF named for the competition and the entry", async () => {
    const attachment = await certificateAttachment({ competition, entry, writerName: "Piyush Kumar Maurya", declaredAt: competition.resultsDeclaredAt });
    assert.equal(attachment.contentType, "application/pdf");
    assert.equal(attachment.filename, "The-Final-Draft-certificate-CGSC-RL4ATBKA.pdf");
    assert.ok(Buffer.isBuffer(attachment.content));
    assert.equal(attachment.content.subarray(0, 4).toString(), "%PDF");
    assert.ok(attachment.content.length > 2000, "a certificate is more than a header");
  });

  test("file names never carry characters a mail client or a filesystem would choke on", () => {
    assert.equal(certificateFileName('Ckript: "Global" Challenge / 2026', "CGSC-1"), "Ckript-Global-Challenge-2026-certificate-CGSC-1.pdf");
  });

  test("a render that cannot happen returns null instead of throwing, so the results still go out", async () => {
    assert.equal(await tryCertificateAttachment({ competition: null, entry, writerName: "x" }), null);
    assert.equal(await tryCertificateAttachment({ competition, entry: {}, writerName: "x" }), null);
  });
});
