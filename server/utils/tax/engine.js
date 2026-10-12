/**
 * The tax engine. PURE — no I/O, no config reads, no clock — so every rule is pinned by a test.
 *
 * Money is always INTEGER MINOR UNITS (paise / cents). The two invariants every function here keeps:
 *
 *   1. taxable + cgst + sgst + igst === gross, exactly, for every input.
 *   2. The total tax is computed ONCE on the whole amount and then split. Computing 9% + 9% separately
 *      produces a different total for some odd-paise amounts, which would make a Delhi buyer and a
 *      Mumbai buyer pay different prices for the same thing.
 */

export const ENGINE_VERSION = 1;

/** Supply types. Only the first four carry tax; the rest exist so every payment has a classification. */
export const SUPPLY = Object.freeze({
  INTRA: "intra",               // buyer in the supplier's state: CGST + SGST
  INTER: "inter",               // another Indian state: IGST
  EXPORT: "export_igst",        // outside India: IGST, export on payment of tax (no LUT, by decision)
  SEZ: "sez_igst",              // SEZ unit/developer: IGST
  PRE_GST: "pre_gst",           // paid before the registration date: not taxable
  NO_CONSIDERATION: "no_consideration", // grants and free access
  OUT_OF_SCOPE: "out_of_scope", // cash prizes and other money owed OUT
});

const TAXED = new Set([SUPPLY.INTRA, SUPPLY.INTER, SUPPLY.EXPORT, SUPPLY.SEZ]);
export const isTaxedSupply = (supplyType) => TAXED.has(supplyType);

const int = (value) => {
  const n = Math.round(Number(value) || 0);
  return Number.isFinite(n) ? n : 0;
};

/** Round half up on a non-negative rational a/b, using integers only. */
const divRoundHalfUp = (numerator, denominator) => {
  if (denominator <= 0) return 0;
  const q = Math.floor(numerator / denominator);
  const r = numerator - q * denominator;
  return r * 2 >= denominator ? q + 1 : q;
};

/** Split a total tax into the statutory components for a place of supply. */
export const splitTax = (taxMinor, intra) => {
  const tax = Math.max(0, int(taxMinor));
  if (intra) {
    const cgst = Math.floor(tax / 2);
    return { cgstMinor: cgst, sgstMinor: tax - cgst, igstMinor: 0 };
  }
  return { cgstMinor: 0, sgstMinor: 0, igstMinor: tax };
};

/** Taxes ADDED on top of a pre-tax amount (every live checkout). */
export const computeTax = ({ taxableMinor, rateBps, intra }) => {
  const taxable = Math.max(0, int(taxableMinor));
  const tax = divRoundHalfUp(taxable * int(rateBps), 10000);
  return { taxableMinor: taxable, taxMinor: tax, ...splitTax(tax, intra), grossMinor: taxable + tax };
};

/** Taxes CARVED OUT of an amount already paid (the 4 Oct → cut-over back-fill only). */
export const carveOutTax = ({ grossMinor, rateBps, intra }) => {
  const gross = Math.max(0, int(grossMinor));
  const taxable = divRoundHalfUp(gross * 10000, 10000 + int(rateBps));
  const tax = gross - taxable;
  return { taxableMinor: taxable, taxMinor: tax, ...splitTax(tax, intra), grossMinor: gross };
};

/**
 * Distribute `total` across `weights` so the parts are integers summing EXACTLY to `total`
 * (largest-remainder method). Used to put the once-computed tax onto individual lines.
 */
export const allocate = (total, weights) => {
  const amount = int(total);
  const ws = weights.map((w) => Math.max(0, int(w)));
  const sum = ws.reduce((a, b) => a + b, 0);
  if (!ws.length) return [];
  if (sum === 0) return ws.map((_, i) => (i === 0 ? amount : 0));
  const raw = ws.map((w) => (amount * w) / sum);
  const parts = raw.map((v) => Math.floor(v));
  let remainder = amount - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder -= 1) parts[order[k].i] += 1;
  return parts;
};

// ── Business tax ID (GSTIN) ─────────────────────────────────────────────────

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const gstinCheckDigit = (first14) => {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = GSTIN_CHARS.indexOf(first14[i]);
    if (value < 0) return "";
    const product = value * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
};

/**
 * Validate a business tax ID. `knownStateCode` lets the caller reject state codes that don't exist
 * without this module importing the state table.
 */
export const validateGstin = (input, { knownStateCode } = {}) => {
  const value = String(input || "").toUpperCase().replace(/\s+/g, "");
  if (!value) return { valid: false, reason: "empty", value };
  if (!GSTIN_PATTERN.test(value)) return { valid: false, reason: "format", value };
  if (gstinCheckDigit(value.slice(0, 14)) !== value[14]) return { valid: false, reason: "checksum", value };
  const stateCode = value.slice(0, 2);
  if (typeof knownStateCode === "function" && !knownStateCode(stateCode)) {
    return { valid: false, reason: "state", value };
  }
  return { valid: true, value, stateCode, pan: value.slice(2, 12) };
};

// ── Place of supply ─────────────────────────────────────────────────────────

/**
 * Where the supply is made, for reporting. Under the founder's decisions it NEVER changes the amount
 * (everyone pays 18%); it decides only CGST+SGST versus IGST and which return table the sale lands in.
 *
 * Order of precedence:
 *   1. a valid business tax ID → its state (B2B: the registered recipient's location)
 *   2. a declared billing country outside India → foreign
 *   3. a declared Indian billing state
 *   4. the profile address on record
 *   5. the supplier's own state (IGST Act s.12(2)(b): no address on record)
 */
export const resolvePlaceOfSupply = ({ billing = {}, profile = {}, geoCountry = "", supplierStateCode }) => {
  const evidence = [];
  const declaredCountry = String(billing.country || "").toUpperCase();
  const profileCountry = String(profile.country || "").toUpperCase();
  const geo = String(geoCountry || "").toUpperCase();
  if (declaredCountry) evidence.push(`billing country ${declaredCountry}`);
  if (profileCountry) evidence.push(`profile country ${profileCountry}`);
  if (geo) evidence.push(`ip country ${geo}`);

  // Declared abroad while the IP says India is a contradiction worth a human look; it never blocks.
  const foreign = (country, basis) => ({ country, stateCode: "96", basis, evidence, needsReview: geo === "IN" });

  if (billing.gstinStateCode) {
    return { country: "IN", stateCode: billing.gstinStateCode, basis: "business_tax_id", evidence, needsReview: false };
  }
  if (declaredCountry && declaredCountry !== "IN") return foreign(declaredCountry, "billing_country");
  if (declaredCountry === "IN" && billing.stateCode) {
    return {
      country: "IN",
      stateCode: billing.stateCode,
      basis: "billing_state",
      evidence,
      needsReview: Boolean(geo && geo !== "IN"),
    };
  }
  if (profileCountry && profileCountry !== "IN") return foreign(profileCountry, "profile_country");
  if (profile.stateCode) {
    return { country: "IN", stateCode: profile.stateCode, basis: "profile_address", evidence, needsReview: Boolean(geo && geo !== "IN") };
  }
  if (!declaredCountry && !profileCountry && geo && geo !== "IN") {
    // Only an IP points abroad. Treat as foreign but flag it: one weak signal is not proof.
    return { country: geo, stateCode: "96", basis: "ip_country", evidence, needsReview: true };
  }
  return {
    country: "IN",
    stateCode: supplierStateCode,
    basis: "supplier_location_fallback",
    evidence,
    needsReview: false,
  };
};

/** The supply type for a place of supply. */
export const classifySupply = ({ placeOfSupply, supplierStateCode, isSez = false }) => {
  if (placeOfSupply?.country && placeOfSupply.country !== "IN") return SUPPLY.EXPORT;
  if (isSez) return SUPPLY.SEZ;
  return placeOfSupply?.stateCode === supplierStateCode ? SUPPLY.INTRA : SUPPLY.INTER;
};

// ── Snapshot ────────────────────────────────────────────────────────────────

/**
 * Price a set of lines and freeze the result.
 *
 * `lines`: [{ kind, description, sac, amountMinor }] — PRE-TAX amounts in the charged currency.
 * `mode`: "exclusive" adds tax (live checkout); "inclusive" carves it out (gap back-fill).
 * The snapshot is what every record, document and report reads afterwards. Nothing recomputes it.
 */
export const buildTaxSnapshot = ({
  lines,
  currency = "INR",
  rateBps,
  mode = "exclusive",
  supplyType,
  placeOfSupply,
  supplier,
  recipient = {},
  fx = null,
  computedAt,
  gap = false,
}) => {
  const taxed = isTaxedSupply(supplyType);
  const intra = supplyType === SUPPLY.INTRA;
  const clean = (lines || []).map((line) => ({
    kind: String(line.kind || ""),
    description: String(line.description || ""),
    sac: String(line.sac || ""),
    amountMinor: Math.max(0, int(line.amountMinor)),
  }));
  const linesTotal = clean.reduce((a, l) => a + l.amountMinor, 0);

  let totals;
  if (!taxed) {
    totals = { taxableMinor: linesTotal, taxMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, grossMinor: linesTotal };
  } else if (mode === "inclusive") {
    totals = carveOutTax({ grossMinor: linesTotal, rateBps, intra });
  } else {
    totals = computeTax({ taxableMinor: linesTotal, rateBps, intra });
  }

  // Put the line amounts on the TAXABLE base (inclusive mode shrinks them proportionally), then
  // allocate each statutory component across lines so every column sums exactly to its total.
  const weights = clean.map((l) => l.amountMinor);
  const lineTaxable = mode === "inclusive" && taxed ? allocate(totals.taxableMinor, weights) : weights;
  const lineCgst = allocate(totals.cgstMinor, weights);
  const lineSgst = allocate(totals.sgstMinor, weights);
  const lineIgst = allocate(totals.igstMinor, weights);

  const builtLines = clean.map((line, i) => {
    const taxMinor = lineCgst[i] + lineSgst[i] + lineIgst[i];
    return {
      kind: line.kind,
      description: line.description,
      sac: line.sac,
      qty: 1,
      unit: "OTH",
      rateBps: taxed ? int(rateBps) : 0,
      taxableMinor: lineTaxable[i],
      cgstMinor: lineCgst[i],
      sgstMinor: lineSgst[i],
      igstMinor: lineIgst[i],
      taxMinor,
      totalMinor: lineTaxable[i] + taxMinor,
    };
  });

  const inr = fx && currency !== "INR" && Number(fx.rate) > 0
    ? {
      fxRate: Number(fx.rate),
      fxSource: String(fx.source || ""),
      fxDate: fx.date || computedAt || null,
      taxableMinor: Math.round(totals.taxableMinor * Number(fx.rate)),
      cgstMinor: Math.round(totals.cgstMinor * Number(fx.rate)),
      sgstMinor: Math.round(totals.sgstMinor * Number(fx.rate)),
      igstMinor: Math.round(totals.igstMinor * Number(fx.rate)),
      grossMinor: Math.round(totals.grossMinor * Number(fx.rate)),
    }
    : {
      fxRate: 1,
      fxSource: "same_currency",
      fxDate: computedAt || null,
      taxableMinor: totals.taxableMinor,
      cgstMinor: totals.cgstMinor,
      sgstMinor: totals.sgstMinor,
      igstMinor: totals.igstMinor,
      grossMinor: totals.grossMinor,
    };

  return {
    engineVersion: ENGINE_VERSION,
    computedAt: computedAt || null,
    supplyType,
    pricingMode: mode,
    reverseCharge: false,
    supplier: supplier || {},
    recipient,
    placeOfSupply: placeOfSupply || {},
    currency: String(currency || "INR").toUpperCase(),
    rateBps: taxed ? int(rateBps) : 0,
    lines: builtLines,
    totals,
    inr,
    exportDeclaration: supplyType === SUPPLY.EXPORT ? "Supply meant for export on payment of IGST" : "",
    // Paid between the registration date and cut-over: the amount already collected is treated as
    // tax-inclusive (D8). Still classified intra/inter/export like any other sale, for the returns.
    gap: Boolean(gap),
  };
};

/**
 * A snapshot scaled down to part of its gross — a partial refund's credit note. Every component is
 * re-allocated from the original so the credit note's columns still sum exactly, and the refund can
 * never reverse more tax than was charged.
 */
export const scaleSnapshot = (snapshot, grossMinor) => {
  if (!snapshot) return null;
  const original = snapshot.totals || {};
  const target = Math.min(Math.max(0, int(grossMinor)), int(original.grossMinor));
  if (target === int(original.grossMinor)) return { ...snapshot, lines: snapshot.lines.map((l) => ({ ...l })) };
  const [taxable, cgst, sgst, igst] = allocate(target, [
    original.taxableMinor, original.cgstMinor, original.sgstMinor, original.igstMinor,
  ]);
  const weights = snapshot.lines.map((l) => l.taxableMinor);
  const lt = allocate(taxable, weights);
  const lc = allocate(cgst, weights);
  const ls = allocate(sgst, weights);
  const li = allocate(igst, weights);
  const rate = original.grossMinor ? target / original.grossMinor : 0;
  const inr = snapshot.inr || {};
  return {
    ...snapshot,
    lines: snapshot.lines.map((line, i) => ({
      ...line,
      taxableMinor: lt[i],
      cgstMinor: lc[i],
      sgstMinor: ls[i],
      igstMinor: li[i],
      taxMinor: lc[i] + ls[i] + li[i],
      totalMinor: lt[i] + lc[i] + ls[i] + li[i],
    })),
    totals: { taxableMinor: taxable, cgstMinor: cgst, sgstMinor: sgst, igstMinor: igst, taxMinor: cgst + sgst + igst, grossMinor: target },
    inr: {
      ...inr,
      taxableMinor: Math.round((inr.taxableMinor || 0) * rate),
      cgstMinor: Math.round((inr.cgstMinor || 0) * rate),
      sgstMinor: Math.round((inr.sgstMinor || 0) * rate),
      igstMinor: Math.round((inr.igstMinor || 0) * rate),
      grossMinor: Math.round((inr.grossMinor || 0) * rate),
    },
  };
};

/** The client-facing breakdown. Says "Taxes" — never GST — by the founder's wording rule. */
export const publicBreakdown = (snapshot, { label = "Taxes", lineLabels = {} } = {}) => {
  if (!snapshot) return null;
  const ratePercent = snapshot.rateBps / 100;
  return {
    currency: snapshot.currency,
    lines: snapshot.lines.map((l) => ({
      kind: l.kind,
      label: lineLabels[l.kind] || l.description,
      amountMinor: snapshot.pricingMode === "inclusive" ? l.totalMinor : l.taxableMinor,
    })),
    subtotalMinor: snapshot.totals.taxableMinor,
    taxLabel: snapshot.totals.taxMinor > 0 ? `${label} (${ratePercent}%)` : label,
    taxRatePercent: ratePercent,
    taxMinor: snapshot.totals.taxMinor,
    totalMinor: snapshot.totals.grossMinor,
    taxesIncluded: snapshot.pricingMode === "inclusive",
  };
};

// ── Amount in words (Indian numbering), for the tax invoice ─────────────────

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
  "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const threeDigits = (n) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
};

const integerInWords = (value) => {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${integerInWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
};

export const amountInWords = (minor, currency = "INR") => {
  const total = Math.max(0, int(minor));
  const major = Math.floor(total / 100);
  const fraction = total % 100;
  const [majorName, minorName] = String(currency).toUpperCase() === "USD" ? ["US Dollars", "Cents"] : ["Rupees", "Paise"];
  const head = `${majorName} ${integerInWords(major)}`;
  return fraction ? `${head} and ${twoDigits(fraction)} ${minorName} Only` : `${head} Only`;
};
