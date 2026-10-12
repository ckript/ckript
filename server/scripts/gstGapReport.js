// The tax back-fill for the gap period (GST_BILLING_PROMPT.md D8).
//
// Ckript's GST registration took effect on 4 Oct 2026, but checkout only started adding taxes when
// GST_ENABLED was switched on. Every payment in between was taxable and paid at the pre-tax price, so
// the 18% is CARVED OUT of what was paid and a tax invoice is issued for it. Payments before 4 Oct are
// never touched.
//
// DRY RUN BY DEFAULT — prints the payments and writes a CSV for the CA, changes nothing:
//
//   node scripts/gstGapReport.js                    # report + CSV (no change)
//   node scripts/gstGapReport.js --issue            # issue the tax invoices (CA sign-off first!)
//   node scripts/gstGapReport.js --issue --email    # ...and email each buyer their tax invoice
//
// Idempotent: a payment that already has a tax invoice is skipped, so re-running is safe.
//
// Deadline: a tax invoice for a service is due within 30 days of the supply (CGST Rules r.47) and the
// October sales belong in the October GSTR-1 (due 11 Nov 2026) — so run --issue before 3 Nov 2026.
//
// The same report and the same "issue" action are in the finance portal (Taxes tab → Back-fill).
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const issue = process.argv.includes("--issue");
const email = process.argv.includes("--email");

const money = (minor) => ((Number(minor) || 0) / 100).toFixed(2);
const cell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const run = async () => {
  // Imported after dotenv so every lazily-read setting sees the real environment.
  const { findGapPayments, gapDeadlines, gapRow, issueGapInvoices } = await import("../utils/tax/gap.js");
  const { taxLiabilityFrom } = await import("../config/tax.js");

  await mongoose.connect(process.env.MONGO_URI);
  const rows = (await findGapPayments()).map(gapRow);
  const deadlines = gapDeadlines(rows[0]?.paidAt);

  console.log(`Registration date (taxes owed from): ${taxLiabilityFrom().toISOString()}`);
  console.log(`Gap payments without a tax invoice: ${rows.length}`);
  if (deadlines.invoiceBy) {
    console.log(`Earliest payment: ${new Date(rows[0].paidAt).toISOString()}`);
    console.log(`Issue its tax invoice by: ${deadlines.invoiceBy.toISOString().slice(0, 10)} (r.47, 30 days)`);
    console.log(`GSTR-1 for that month is due: ${deadlines.returnDue.toISOString().slice(0, 10)}`);
  }

  const byCurrency = rows.reduce((acc, r) => {
    const c = acc[r.currency] || { paid: 0, taxable: 0, taxes: 0, count: 0 };
    c.paid += r.paidMinor; c.taxable += r.taxableMinor; c.taxes += r.taxMinor; c.count += 1;
    acc[r.currency] = c;
    return acc;
  }, {});
  for (const [currency, t] of Object.entries(byCurrency)) {
    console.log(`  ${currency}: ${t.count} payments · paid ${money(t.paid)} · taxable ${money(t.taxable)} · taxes ${money(t.taxes)}`);
  }

  const header = ["Paid at", "Kind", "Description", "Buyer", "Email", "Currency", "Paid", "Taxable value", "Taxes", "CGST", "SGST", "IGST", "Supply type", "Place of supply", "Payment ID", "Ledger entry"];
  const csv = [header, ...rows.map((r) => [new Date(r.paidAt).toISOString(), r.kind, r.label, r.buyer, r.email, r.currency, money(r.paidMinor), money(r.taxableMinor), money(r.taxMinor), money(r.cgstMinor), money(r.sgstMinor), money(r.igstMinor), r.supplyType, r.placeOfSupply, r.paymentId, r.ledgerEntryId])]
    .map((r) => r.map(cell).join(",")).join("\r\n");
  const out = path.resolve(`tax-gap-report-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(out, `﻿${csv}`);
  console.log(`CSV written: ${out}`);

  if (!issue) {
    console.log("\nDry run — nothing was issued. Re-run with --issue after the CA has checked the CSV.");
  } else {
    const result = await issueGapInvoices({ notify: email, source: "scripts/gstGapReport.js" });
    console.log(`\nIssued ${result.issued.length} tax invoices; ${result.failed.length} failed.`);
    result.issued.slice(0, 20).forEach((r) => console.log(`  ${r.invoiceNumber}  (ledger ${r.ledgerEntryId})`));
    if (result.failed.length) console.log(`Failed ledger entries: ${result.failed.join(", ")}`);
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
