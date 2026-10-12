// The founder's wording rule: users read "Taxes" — never GST, GSTIN, CGST, SGST or IGST.
//
// The two places the statutory names are allowed are the tax invoice PDF (rendered by the server) and
// the finance portal (pages/finance), which the CA files returns from. Everything else in the client is
// scanned here, comments stripped, so a new screen cannot quietly say "GST" to a user.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = [/^pages[\\/]finance[\\/]/];
const FORBIDDEN = /\b(GST|GSTIN|CGST|SGST|IGST|UTGST)\b/;

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|json)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
};

/** Source with block comments, JSX comments and line comments removed (URLs keep their //). */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("user-facing copy never says GST", () => {
  const files = walk(root)
    .map((file) => ({ file, rel: path.relative(root, file) }))
    .filter(({ rel }) => !ALLOWED.some((re) => re.test(rel)));

  it("scans a meaningful part of the app", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("no client source outside the finance portal shows GST terminology", () => {
    const offenders = [];
    for (const { file, rel } of files) {
      const text = stripComments(fs.readFileSync(file, "utf8"));
      text.split(/\r?\n/).forEach((line, i) => {
        if (FORBIDDEN.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  // The server prices every checkout and returns the breakdown; the client only displays it. A
  // client-side "price × 1.18" would drift from the invoice the moment a rate, rounding or exemption
  // changes, so tax arithmetic in client code fails here.
  it("no client source computes taxes itself", () => {
    // A 1.18 multiplier anywhere; an 18% rate only beside a money-like name (an animation's
    // `index * 0.18` delay is not tax).
    const MONEY = "(?:price|amount|total|subtotal|fee|gross|net|base|cost|charge)";
    const RATE = "(?:0\\.18|18\\s*\\/\\s*100)\\b";
    const TAX_MATHS = new RegExp(
      `[*/]\\s*1\\.18\\b|\\b1\\.18\\s*\\*|${MONEY}\\w*\\)?\\s*\\*\\s*${RATE}|${RATE}\\s*\\*\\s*\\(?\\w*${MONEY}`,
      "i",
    );
    const offenders = [];
    for (const { file, rel } of files) {
      if (!/\.jsx?$/.test(file)) continue;
      const text = stripComments(fs.readFileSync(file, "utf8"));
      text.split(/\r?\n/).forEach((line, i) => {
        if (TAX_MATHS.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
