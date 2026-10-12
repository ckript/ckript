# Ckript — GST on every payment: implementation prompt

> **How to use this file.** The business decisions in **§1.3** were confirmed on 2026-10-11:
> - tax is added at checkout on top of the listed price
> - 18% applies to the full amount, foreign buyers included
> - it applies to payments from 4 Oct 2026
> - users only ever see the word "Taxes"
>
> Only the SAC codes remain for the CA. Paste everything below the line into Claude Code at the repo
> root, preferably in plan mode, and run it phase by phase (§12) with one PR per phase.
>
> All `file:line` references were captured on 2026-10-11 at commit `0622211`. Re-locate them by
> function name if lines have moved.

---

## 0. Mission

You are adding **Indian GST** to every money flow in **Ckript**, a screenplay marketplace. The stack:

- **Server:** `server/`, Express 5 + Mongoose (ESM).
- **Client:** `client/`, React + Vite, desktop pages plus the mobile shell under `client/src/mobile/`.
- **Payments:** **Razorpay only**, in **INR and USD**.

When you are done, every amount the platform collects must be:

1. **Priced** with the correct GST: **18% on the full amount, for every buyer, India or abroad**. Internally that is CGST 9% + SGST 9% for Delhi buyers, and IGST 18% for everyone else, foreign buyers included. Users only ever see one line: **"Taxes (18%)"**.
2. **Charged server-authoritatively.** The Razorpay order amount includes GST, and the client never sends a price or a tax.
3. **Snapshotted immutably** at order time, re-verified at capture, and frozen on every record that describes the payment.
4. **Documented** by a Rule 46-compliant **Tax Invoice**, export invoice or **Credit Note**, with a gap-free number series per financial year.
5. **Booked** in the ledger, so `/finance` produces **GSTR-1 and GSTR-3B-ready** figures. GST is a liability, never revenue.
6. **Shown correctly** in every UI (desktop and mobile), every email, every PDF and the legal text.

**"No corner left untouched" is enforced, not hoped for.** A source-audit test (§11.1) must make it impossible to add a new checkout that bypasses GST, exactly as `server/utils/ledgerCoverage.test.js` already does for the ledger.

### The wording rule (founder's decision — applies to every phase)

**User-facing copy never says "GST", "GSTIN", "CGST", "SGST" or "IGST". It says "Taxes".** That covers:
- the pricing menu, checkout, pay buttons and success screens
- emails, in-app notifications, receipts and the agreement PDFs
- the profile and billing pages, and the legal pages ("applicable taxes")

On desktop and mobile alike.

There are exactly **two exceptions**, both because the law requires them:
1. **The tax invoice / credit note PDF.** CGST Rules r.46 requires it to show the supplier GSTIN and the CGST/SGST/IGST rate and amount separately. Keep a friendly summary line "Taxes (18%)" at the top of the totals, and put the statutory breakup under it.
2. **The finance portal's statutory views and exports** (`/finance`, which only finance and admin see). The CA files GSTR-1 and GSTR-3B from these, so column names follow the return format. Summary cards still say "Taxes collected".

Enforce the rule with a test (§11.2): a grep over `client/src` (excluding `pages/finance/**`) and over the email and notification templates fails on any of those words in user-visible strings.

### House rules you must keep (these already exist in this codebase)

1. **Amounts are server-authoritative.** The client sends ids, currency and a billing profile. It never sends prices or tax, and it never computes tax: it renders server quotes.
2. **Never fail a captured payment.** Post-capture writes (invoice, ledger, emails) are non-fatal and idempotent on the Razorpay payment id. Tax computation *before* order creation **is** fatal: refuse to create an order you cannot tax.
3. **Integer minor units for all tax math** (paise and cents). No floats, no `toFixed` in calculations, no major-unit rupees in new fields.
4. **Snapshot, never recompute.** Reports, PDFs and refunds read the frozen snapshot. They never re-derive tax from current config, because rates and SAC mappings change and history must not change with them.
5. **Read env lazily.** `dotenv.config()` runs after ES imports are evaluated, so a module-level `process.env.X || fallback` always captures the fallback. Use getters, as in `server/utils/companyContacts.js`.
6. **Payment surfaces live at `/finance`, never in the admin console.** Reads go on `financeRoutes.js` (`financeOnly`); mutations go on `adminRoutes.js` (`adminOnly`); the UI gates controls with the `actions`/`canControl` prop.
7. **Every money or grant handler writes a LedgerEntry.** Add new handlers to `MONEY_HANDLERS` in `ledgerCoverage.test.js`.
8. **Verify merges with ESLint `no-undef`** (parse the JSON output), not just `vite build`, because the build passes with dangling identifiers.
9. **Shell gotchas.** Write long scripts to files rather than long bash heredocs, and use `rg`, not `grep -r`.

---

## 1. Facts and decisions

### 1.1 Seller identity (from the GST registration certificate)

| Field | Value |
|---|---|
| Legal name / trade name | **CKRIPT PRIVATE LIMITED** |
| GSTIN | **07AAOCC0556A1ZZ**. The checksum is valid. Use it as the known-good test fixture. |
| State / code | **Delhi / 07**. This is the supplier state that decides intra- vs inter-state supply. |
| PAN | AAOCC0556A. Derive it from GSTIN characters 3–12; do not store it separately. |
| Registration type | Regular |
| Registration valid from | **04/10/2026** |
| Principal place of business (print exactly) | Suit D, 400A, 12 Ajeet Singh House, Yusuf Sarai Commercial Complex, Near Green Park Metro Station Exit-2, New Delhi, Delhi – 110016 |
| CIN | U62099DL2026PTC468691 (already in `companyContacts.js`) |

**Address fix.** The `COMPANY.location` default in `server/utils/companyContacts.js` reads "SUIT-D, 400-A, 4th Floor, 12 **Ajit** Singh House…". That does not match the registration, which says **Ajeet** and gives no floor. A tax invoice must carry the registered address.

- Add getters `COMPANY.gstin`, `COMPANY.gstStateCode`, `COMPANY.registeredAddress` and `COMPANY.pan`. They are env-overridable: `COMPANY_GSTIN`, `COMPANY_GST_STATE_CODE`, `COMPANY_REGISTERED_ADDRESS`.
- Keep `client/src/constants/company.js` (`registeredOffice`) in sync. The landing footer and policy pages read it.
- Fix the hardcoded "Ckript Private Limited" in the footer at `server/utils/mailDocument.js:411` to use `COMPANY.legalName`.

### 1.2 What is sold today, and who keeps the money

| # | Product | Price source | Money split today |
|---|---|---|---|
| P1 | Film Industry Professional (FIP) plan, monthly or annual, **auto-renewing** (Razorpay Subscription; one-time order only as a fallback) | `server/config/pricing.js` `PLAN_PRICES` (INR 199900 / USD 2500 minor units); annual = 12 × 0.85; billed through a Razorpay **Plan** whose amount is fixed at creation (`models/RazorpayPlan.js`) | 100% platform |
| P2 | Writer Silver / Gold, monthly or annual, **auto-renewing** (same as P1) | same (39900/500, 69900/900; **USD placeholders**) | 100% platform |
| P3 | Script purchase (after writer approval) | `ScriptPurchaseRequest.amount \|\| Script.price` (INR major units) **+ 5% buyer fee**; USD via live FX | Writer gets 100% of the base (wallet credited instantly); platform keeps the 5% |
| P4 | Script hold / option, 30 days | `Script.holdFee \|\| 200` (INR major) + 5% | same as P3 |
| P5 | AI trailer | `TRAILER_PRICE_MATRIX` (`scriptController.js:160-167`, **major units**, fixed INR/USD) | 100% platform |
| P6 | Competition entry fee | `Competition.entryFee.{inrMinor,usdMinor}` (default 9800 / 200) | 100% platform |
| P7 | Consultation booking (new) | `Availability.consultationPrice` (unvalidated, "paise by comment"), else hardcoded tiers chosen by `req.body.duration` (`consultationController.js:154-159`) | Professional gets 90%, platform keeps 10% |
| — | Free grants: admin plan grants, competition prize plan-days, referral plan-days, free-access scripts, free competitions, external registrations, consultations while `CONSULTATION_PAYMENTS_ENABLED` is off, Spotlight | — | No consideration |
| — | Competition **cash prizes** | `Competition.grants.*.cashMinor` | Platform **pays out**. Not a supply by the platform. |

**`platformTax` is a commission, not a tax.** `SCRIPT_PURCHASE_PLATFORM_TAX_RATE = 0.05` (`scriptController.js:282`) and every `platformTaxAmount` / `platformTaxRate` / `platformTaxPercent` field are a **5% platform commission**. The invoice rows even mark it as `type:"Tax"` (`scriptController.js:6605-6609`, `:7096-7100`). Once real GST exists this naming becomes a legal and UX hazard. Rename it everywhere to `platformFee*` (server, client, tests, notes, PDFs). Accept the old key names on read only, for backward compatibility with stored documents.

### 1.3 Decisions — CONFIRMED (2026-10-11)

Implement every row as **config** in `server/config/tax.js`, so a later change is a config change and not a rewrite. Only D5 still carries a `// TODO-CA:` comment.

| # | Decision | Confirmed answer — implement exactly this |
|---|---|---|
| D1 | When tax applies | **Tax liability starts 2026-10-04 00:00 IST** (`TAX_LIABILITY_FROM`, the registration date). **Charging tax on top at checkout starts at cut-over** (`GST_ENABLED=true` + `GST_CHARGE_FROM`, the deploy moment). Payments made **before 4 Oct are pre-GST and never touched.** Payments between 4 Oct and cut-over are handled by D8. |
| D2 | Price display / pricing mode | **Exclusive everywhere.** The pricing menu, plan cards, listing cards, competition pages and consultation slots show the **pre-tax price only** (₹399 / month, no tax wording). At checkout, before the pay button, the buyer sees `Subtotal ₹399.00 · Taxes (18%) ₹71.82 · Total ₹470.82`, and the button says **"Pay ₹470.82"**. That total is the amount charged. |
| D3 | Script purchase and hold (P3/P4) | **Tax on the full amount (principal model).** The platform is the supplier of the whole sale. Lines: script price (taxable) + platform fee 5% (taxable); **18% on the sum**. Example: ₹10,000 + ₹500 fee = ₹10,500 taxable + ₹1,890 taxes = **₹12,390**. The writer's payout is unchanged: 100% of the script price, never reduced by taxes. |
| D4 | Consultation (P7) | **Tax on the full amount (principal model).** ₹8,000 consultation → ₹1,440 taxes → **₹9,440** charged. The professional's payout is unchanged: 90% of the pre-tax price. Taxes never come out of the professional's share. |
| D5 | SAC code per product | Rate **18%** for every product. SAC codes are **`TODO-CA`**, with these candidates: plans `998431`/`998439`/`997331`; script sale (licence/transfer of literary rights) `997336`; platform fee `998599`; competition entry `998596`; AI trailer `999612`/`998439`; consultation `998399`. |
| D6 | Foreign buyers (USD, or outside India) | **18% too, as IGST.** No LUT and no zero-rating. Reported as "export **with** payment of IGST" (GSTR-1 table 6A, WPAY). The buyer sees `Taxes (18%)` like everyone else. |
| D7 | Foreign buyer whose USD order fell back to INR | Same as D6: 18% IGST. |
| D8 | Gap period: 4 Oct 2026 → cut-over (paid, but no tax added) | **Apply tax to these too, by treating what was collected as tax-inclusive** (taxable = paid × 100/118, taxes = the rest). Issue tax invoices for them in the new series via `server/scripts/gstGapReport.js`. It runs as a **dry run by default** and needs `--issue` to write (§10). Payments before 4 Oct: untouched. |
| D9 | Business buyers | Optional **"Business tax ID"** field (validated as a GSTIN; never labelled "GST" in the UI), saved in billing details. When present, the invoice is B2B. |
| D10 | Writers or professionals who are themselves GST-registered | **Capture** an optional business tax ID on payout profiles, show it in finance, and **compute nothing** (`TODO-CA`: input tax credit and reverse charge on what the platform pays them). |
| D11 | USD plan prices (`writer_silver` $5, `writer_gold` $9 marked "confirm") | Leave as is, plus 18% at checkout ($5 → $5.90). Print a startup warning while unconfirmed. |
| D12 | Invoice series | One series for all tax invoices, `CK/<FY>/<seq>` (for example `CK/2627/000123`, 14 characters), and one for credit notes, `CN/<FY>/<seq>`. The product kind is a field, not part of the number. |

**Recommendation passed on to the founder** (not a blocker): India's consumer dark-pattern guidelines treat charges revealed only at checkout as "drip pricing". A small muted "+ taxes" next to the listed price removes that risk without changing the ₹399 headline. Ship it **off** (founder's call) behind `SHOW_PLUS_TAXES_HINT`, so it can be switched on without a release.

---

## 2. Architecture

### 2.1 Config: `server/config/tax.js` (new; every value read lazily)

- **Env, read lazily:**
  - `gstEnabled()`: env `GST_ENABLED`, which switches on charging taxes at checkout.
  - `gstChargeFrom()`: the cut-over moment.
  - `taxLiabilityFrom()`: fixed at **2026-10-04T00:00:00+05:30**, overridable by env `TAX_LIABILITY_FROM`.
  - `showPlusTaxesHint()`: env `SHOW_PLUS_TAXES_HINT`, default **false**.
- **No LUT config.** Exports are taxed (D6).
- `SUPPLIER` comes from the `COMPANY` getters.
- `RATE_TABLE`: rows of `{ key: "standard", rateBps: 1800, from: "2017-07-01", to: null }`. Rates are in **basis points** with effective dates, so a future rate change is a data change and history stays correct.
- `PRODUCT_TAX`: one entry per sellable line kind, holding `{ sac, description, rateKey, pricingMode: "exclusive", invoiceable }`. Every line is the platform's own supply (D3/D4, principal model). Kinds:
  - `plan_fip`, `plan_writer_silver`, `plan_writer_gold`
  - `script_price`, `script_platform_fee`
  - `hold_price`, `hold_platform_fee`
  - `ai_trailer`, `competition_registration`, `consultation`
  - `grant` (no consideration), `cash_prize` (out of scope)
- `TAX_LABEL = "Taxes"`: the only word the client may show for tax (see the wording rule).
- `STATE_CODES`: the complete GST state and UT code table (01–38, plus 97 Other Territory and 96 Foreign Country for reporting), with names.
  - Expose it to the client through a public `GET /api/tax/config`. That returns the state list, `{ label: "Taxes", ratePercent: 18 }` and the hint flag.
  - It must **not** return the supplier GSTIN or any "GST" wording.
  - **Do not duplicate the table in client code.**

### 2.2 Engine: `server/utils/gst/` (new; pure functions, no I/O, exhaustively unit-tested)

- **`validateGstin(str)`** returns `{ valid, stateCode, pan, reason }`.
  - Normalise first: uppercase and trim.
  - Format check: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`.
  - Checksum: base-36 with alternating factors 1 and 2; add `floor(p/36) + p%36`; check digit = `(36 − sum%36) % 36`.
  - The state code must exist in `STATE_CODES`.
- **`resolvePlaceOfSupply({ billing, geo, payment })`** returns `{ stateCode, stateName, country, basis, evidence[], needsReview }`.
  - **B2B (valid GSTIN):** the GSTIN's state. The GSTIN state must match the declared billing state, otherwise reject with 422.
  - **B2C in India:** the declared billing state (required at checkout).
  - **No address on record:** the supplier's location, per IGST s.12(2)(b), with `basis: "supplier_location_fallback"`.
  - **Foreign:** billing country ≠ IN. Store **all** evidence: declared country, the IP country (reuse `fetchRoughLocation` from `analyticsController`), and Razorpay's `payment.international` and card country after capture. Contradictory evidence sets `needsReview: true` for the finance queue. It does **not** block the payment.
  - **The place of supply never changes the amount.** Everyone pays 18% (D6). It decides only the internal CGST+SGST vs IGST split and how the sale is reported, so a checkout never has to wait for it.
- **`classifySupply(...)`** returns one of:
  - `intra` (CGST + SGST)
  - `inter` (IGST)
  - `export_igst`: foreign buyer, IGST 18%, reported as export with payment of tax
  - `sez_igst`: a business buyer who ticks "SEZ unit/developer", also IGST 18%
  - `no_consideration` (grants and free access)
  - `out_of_scope` (cash prizes)
  - `pre_gst`: payments before 2026-10-04 IST, and the read-time default for legacy records
  - `gap_inclusive`: paid 4 Oct → cut-over; tax carved out of the amount already paid (D8)
- **`computeTax({ amountMinor, pricingMode, rateBps, supplyType })`** returns `{ taxableMinor, cgstMinor, sgstMinor, igstMinor, totalTaxMinor, grossMinor }`.
  - **Exclusive** (every live checkout): `totalTax = roundHalfUp(taxable × rateBps / 10000)`.
  - **Inclusive**, used **only** by the D8 gap back-fill: `taxable = roundHalfUp(gross × 10000 / (10000 + rateBps))` and `totalTax = gross − taxable`.
  - **Intra split:** `cgst = floor(totalTax / 2)`, `sgst = totalTax − cgst`. Compute the total tax **once** and then split it. This keeps the buyer's total identical whether the supply is intra or inter. Computing 9% + 9% separately gives a different total for some odd-paise amounts.
  - **Invariant, which must hold for every input:** `taxable + cgst + sgst + igst === gross`.
- **`priceOrder({ lines, billing, currency, fx, at })`** is the **only** function that prices a checkout.
  - It returns the quote (for display) and the snapshot (for persistence).
  - The quote endpoints, order creation and the capture re-check all call it.
  - USD lines are taxed in USD minor units. INR equivalents are stored alongside, with `fxRate`, `fxSource` and `fxDate`, because GST returns are in INR (CGST Rules r.34).
  - Flag that the current FX source (`open.er-api.com` with a hardcoded fallback of 88) is not a defensible r.34 source. Prefer the RBI reference rate or a CA-approved source.

#### Rounding fixtures (rate 18%, verified)

Use these in the engine tests:

**What buyers pay** (exclusive, all in minor units; the pricing menu shows the "Listed" column):

| Product | Listed | Taxes (18%) | Charged | Delhi split (CGST / SGST) |
|---|---|---|---|---|
| Writer Silver, monthly | 39900 (₹399) | 7182 | **47082 (₹470.82)** | 3591 / 3591 |
| Writer Gold, monthly | 69900 | 12582 | **82482** | 6291 / 6291 |
| FIP, monthly | 199900 | 35982 | **235882** | 17991 / 17991 |
| Writer Silver, annual | 407000 | 73260 | **480260** | 36630 / 36630 |
| Writer Gold, annual | 713000 | 128340 | **841340** | 64170 / 64170 |
| FIP, annual | 2039000 | 367020 | **2406020** | 183510 / 183510 |
| Competition entry | 9800 | 1764 | **11564** | 882 / 882 |
| Script ₹10,000 + 5% fee | 1050000 | 189000 | **1239000** | 94500 / 94500 |
| Consultation ₹8,000 | 800000 | 144000 | **944000** | 72000 / 72000 |
| Consultation ₹15,000 | 1500000 | 270000 | **1770000** | 135000 / 135000 |
| Writer Silver, USD | 500 ($5) | 90 | **590 ($5.90)** | IGST 90 (export) |
| Writer Gold, USD | 900 | 162 | **1062** | IGST 162 |
| FIP, USD | 2500 | 450 | **2950** | IGST 450 |
| Competition, USD | 200 | 36 | **236** | IGST 36 |
| 1 paise | 1 | 0 | **1** | 0 / 0 |

**D8 gap back-fill** (inclusive, carved out of what was already paid):

| Paid | Taxable | Taxes | Delhi split |
|---|---|---|---|
| 39900 | 33814 | 6086 | 3043 / 3043 |
| 69900 | 59237 | 10663 | 5331 / 5332 (odd split) |
| 9800 | 8305 | 1495 | 747 / 748 |

Add a property test over 10,000 random amounts (1 to 10⁸ paise) × both modes × every supply type, asserting the invariant and that tax ≥ 0.

### 2.3 Tax snapshot sub-schema: `server/models/schemas/taxSnapshot.js` (new)

```
engineVersion, computedAt, supplyType, pricingMode, reverseCharge:false,
supplier:   { gstin, stateCode, legalName, address },
recipient:  { type: individual|business, name, legalName, gstin, isSez, email,
              address{line1,line2,city,stateCode,stateName,pincode,country} },
placeOfSupply: { stateCode, stateName, country, basis, evidence[], needsReview },
currency,
lines: [{ kind, sac, description, qty:1, unit:"OTH", rateBps, supplier,
          grossListMinor, discountMinor, taxableMinor, cgstMinor, sgstMinor, igstMinor, totalMinor }],
totals: { taxableMinor, cgstMinor, sgstMinor, igstMinor, taxMinor, grossMinor },
inr:    { fxRate, fxSource, fxDate, taxableMinor, cgstMinor, sgstMinor, igstMinor, grossMinor },
exportDeclaration   // "Supply meant for export on payment of IGST" for export_igst
```

Every line's `supplier` is `"platform"` (principal model, D3/D4). The writer's and professional's payouts are **not** lines on the buyer's supply. They are what the platform pays out, recorded as they are today (wallet credit / `professionalAmount`) and computed from the **pre-tax** price.

Embed it as `tax` on every record that describes a payment:

- `LedgerEntry`. Set it at create only; the append-only hooks at `LedgerEntry.js:136-154` must allow it at insert.
- `Invoice`
- buyer-side `Transaction`
- `Consultation`
- `CompetitionRegistrationIntent` and `CompetitionEntry.payment`
- `ScriptOption`
- `ScriptPurchaseRequest`
- `Script.trailerRequestPayment`

Legacy documents have no `tax`. Read them as `supplyType: "pre_gst"` and **never** rewrite append-only ledger rows.

Also put a **compact** version in the Razorpay `order.notes`: `gst_v`, `pos`, `taxable`, `tax`, `sup`.

- Razorpay allows at most **15 notes of 256 characters each**, and the existing notes (`planOrderNotes`, script notes) already use several.
- Add a test that every order's notes object stays within those limits.

### 2.4 Billing profile (new)

- **UI labels.** In the UI this is **"Billing details"**, and the GSTIN field is labelled **"Business tax ID (optional)"**. The words GST/GSTIN never appear (wording rule). The field still validates as a GSTIN.
- **`User.billingProfile`** holds `{ type, name, legalName, gstin, isSez, address{…}, email, updatedAt }`.
  - It is separate from `User.address` (the public profile, `User.js:41-48`). Prefill it from that address.
  - The user model has **no** GSTIN, business-name or billing-address fields today.
- **`GET` / `PUT /api/users/billing-profile`** validates:
  - GSTIN checksum, and that the GSTIN state equals the address state
  - an Indian pincode is 6 digits and the state comes from `STATE_CODES`
  - country is ISO-3166 alpha-2
  - business ⇒ GSTIN + legal name + full address
  - Sanitise through the existing `sanitizeRequest` and `requestValue` helpers.
- Every checkout endpoint accepts an optional `billing` override for this purchase only.
  - The server resolves saved profile + override, validates it, and snapshots it.
  - **Required:** country; if India, state.
  - Pass name, email and contact to Razorpay `prefill`.
- Writers and professionals also get `payoutTaxProfile { pan?, gstin?, isGstRegistered }` for D10, placed next to `bankDetails` (`User.js:424`).

### 2.5 One Razorpay path

1. **One signature verifier.** There are three today: `utils/razorpaySignature.js:25`, `utils/scriptHold.js:6 isValidRazorpaySignature`, and an inline HMAC at `competitionController.js:1017-1025`. Keep only `razorpaySignature.js`.
2. **One order creator.** `createOrderWithUsdFallback` (`utils/razorpayOrder.js:5`) is the only `orders.create` site. Keep it that way, but make it **require a `tax` snapshot** when GST is enabled, and throw without one. On the INR fallback it must **re-price** through `priceOrder` with currency INR and the D7 classification. Today it only swaps `amount` for `inrAmount`, which would leave a USD tax snapshot on an INR order.
3. **One capture check, `readVerifiedOrder(orderId, paymentId, expect)`.** It fetches the order and payment and asserts:
   - signature
   - `order.notes` binding (purpose/type, userId, subject id)
   - `amount_paid === tax.totals.grossMinor`
   - currency match
   - payment `captured`

   Model it on `validateScriptHoldPayment` (`utils/scriptHold.js:18`), the strictest verifier in the codebase. **Every** verify handler uses it.
4. **Gateway-fee capture.** On capture, store Razorpay's `payment.fee` and `payment.tax` (GST on Razorpay's fee, which is input tax credit) in minor units on the ledger entry's metadata, for reconciliation.
5. **Webhooks (subscription events only today).**
   - `POST /api/webhooks/razorpay` already exists:
     - handler `razorpayWebhook` in `paymentController.js`, dispatcher `handleRazorpayWebhookEvent` in `utils/planSubscription.js`
     - mounted with a **raw body** before `express.json` in `server.js`
     - verified with `RAZORPAY_WEBHOOK_SECRET`
     - handles only `subscription.*` events, for plan renewals
   - **Extend that same endpoint. Do not add a second one.** Add `payment.captured`, `order.paid`, `payment.failed`, `refund.processed` and `refund.failed`.
   - Dispatch on `order.notes.purpose`/`type` to the **same idempotent finalise functions** the browser verify handlers call.
   - This is required for compliance: a captured payment must get its tax invoice even if the buyer closes the tab before the callback. Today only competition registration (`reconcileRegistrationPayment`, `competitionController.js:1063`) and plan subscriptions (`syncRecurringPlan`) have a recovery path.

---

## 3. Server: every surface, one by one

Each paid surface must do all of the following:

- **(a)** a quote endpoint returns `priceOrder().quote`
- **(b)** order creation calls `priceOrder` and stores the snapshot in the order notes and on the pre-order record
- **(c)** verify calls `readVerifiedOrder`
- **(d)** freeze the snapshot on the domain record, buyer `Transaction` and `LedgerEntry`
- **(e)** issue the tax document (§4)
- **(f)** send the payment receipt email with the invoice
- **(g)** be listed in `MONEY_HANDLERS` and `TAX_HANDLERS` (§11.1)

### O1 — FIP plan
- **Handlers:** `paymentController.js:179 createRazorpayOrder` and `:292 verifyRazorpayPayment`.
- **Consolidate the annual price** computed inline at `:201-204` into `utils/planCheckout.js planAmountMinor` (`:33`). That helper rounds the annual price to a whole rupee or dollar, which is fine as the **list** price. The 15% annual discount becomes a `discountMinor` line, so taxable value = list − discount.
- **Delete the duplicate `*_MODEL.amount` constants** (`paymentController.js:33-61`) in favour of `PLAN_PRICES`. Delete the unused `getPlanAmount` (`config/pricing.js:17`).
- **Tighten the amount check.** `readVerifiedPlanOrder` (`planCheckout.js:56`) checks `amount_paid >= planAmountMinor`. Change it to `=== tax.totals.grossMinor`.
- **Fill the gaps:** add the missing buyer **Transaction** and the missing receipt **email**, and fix the empty `creatorSid` on plan invoices (the user is selected with only `"role subscription"` at `:301`).

### O1/O2 recurring — plans as Razorpay Subscriptions (the primary path)
Plans now auto-renew. The one-time order handlers above are only the fallback, used when `PLAN_RECURRING_BILLING=false` or Razorpay refuses to create a subscription.

**The recurring path:**
- **Checkout:** `paymentController.js` `createPlanSubscription` (`POST /api/payment/subscriptions`) and `verifyPlanSubscription` (`/subscriptions/verify`).
- **Renewals:** the webhook above, plus the `syncRecurringPlan` safety net (called from `GET /subscriptions/current` and from `getMe` when a renewal is due).
- **Every charge — first payment and each renewal — is booked by one function:** `utils/planSubscription.js applySubscriptionCharge`. Its pure core is `planChargeEffect`.

**GST work on that path:**
- **Each renewal charge is its own supply.** It needs its own tax snapshot, its own tax invoice in the FY series, and its own ledger tax fields. Compute the snapshot **at charge time**, inside `applySubscriptionCharge`, from the billing profile **as it is then**. A member who moves state between renewals changes the place of supply of later invoices only.
- **The charged amount is fixed by the Razorpay Plan,** so the Razorpay Plan amount must be the **tax-added total**: ₹470.82 for Silver monthly, $5.90 for Silver USD (the §2.2 table). Because everyone pays 18% (D6) and the total tax is computed once, that total is the same for every buyer. So **one Razorpay Plan per (plan, cycle, currency)** is enough.
  - **Creation:** `ensureRazorpayPlan` must be called with `priceOrder(...).totals.grossMinor`, not with `planAmountMinor`.
  - **Charge check:** `planChargeEffect` must compare the payment to that same gross. Today it compares to `planAmountMinor`, which is pre-tax.
  - **Existing Razorpay Plans:** the `RazorpayPlan` cache is keyed on the amount, so the new gross automatically creates new Plans for new subscribers.
- **Subscriptions created before cut-over** still bill the pre-tax amount (₹399). Until they are moved, treat those charges as **tax-inclusive** (the D8 carve-out). Then migrate them to the new Plan with `subscriptions.update({ plan_id, schedule_change_at: "cycle_end" })`, after emailing the member: "From <date> your plan renews at ₹470.82 including taxes".
  - Card mandates above the original amount may need the member to re-authorise. Surface a "Renewal needs your approval" state from the `subscription.pending` webhook.
- **The pricing menu keeps showing ₹399 / month** (D2). The tax-added total appears in the checkout step that opens before the Razorpay sheet.
- **A GST rate change** creates new Razorpay Plans for new subscribers. Existing subscriptions must be moved with `subscriptions.update({ plan_id })`, which needs a migration script, or they keep billing the old gross.
- **Authorisation payments buy nothing.** `planChargeEffect` treats a deferred start's token payment as `authorization`. These are not supplies: no invoice, no GST.
- **Charges on superseded mandates are still supplies.** A `stale_charge` (money on a mandate the user replaced) **is** a supply. It is invoiced and booked like any other charge, and is the natural candidate for a refund plus credit note (§5).
- **Coverage tests already guard part of this.** `ledgerCoverage.test.js` already checks that `applySubscriptionCharge` books and invoices. Extend `taxCoverage.test.js` (§11.1) the same way.

### O2 — Writer Silver/Gold
- **Handlers:** `paymentController.js:577 createWriterRazorpayOrder` and `:637 verifyWriterRazorpayPayment`.
- The annual price is inline at `:602-605`. Make the same changes as O1, including `:654`.

### O3 — Script purchase
- **Handlers:**
  - `scriptController.js:5740 createScriptPurchaseOrder`
  - `getScriptPurchasePricing :1134`
  - `buildCurrencyQuote :5962` (computes "tax" as total − base after converting each separately; replace)
  - `getScriptPurchaseQuote :5981`
  - `verifyScriptPurchase :6173`
- **Lines (D3, tax on the full amount):**
  - `script_price`: the writer's price, **taxable**.
  - `script_platform_fee`: 5% of the price, **taxable**.
  - **Taxes**: 18% of (price + fee), computed once on the sum. Example: ₹10,000 + ₹500 + ₹1,890 = **₹12,390**.
  - The buyer sees `Script price · Platform fee (5%) · Taxes (18%) · Total`.
  - Compute **every line in the charged currency**. Today the INR split is computed and only the total is converted, so a USD buyer's documents carry INR rows.
- **Bind verify to the purchase.** `verifyScriptPurchase` checks the **signature only** (`:6384`), so any genuine order/payment pair passes, including a ₹98 competition payment. Replace it with `readVerifiedOrder`, binding `notes.type === "script_purchase_after_approval"`, userId, scriptId and requestId.
- **Route invoicing through the shared issuer.** The paid-purchase invoice bypasses `issueInvoice`: `Invoice.create` at `:6575` uses its own numbering, `buildScriptPurchaseInvoiceNumber` (`:1438-1444`). It never sets `kind`, `currency` or `amountCharged`, so they default to `"script"`, `"INR"` and `0`, and its PDF is rendered inline at `:6637`. Move it to the new tax-document issuer.
- **Writer payout (D3).** The writer wallet is credited `base` (`:6426-6429`). That stays exactly the same: 100% of the pre-tax script price. Taxes are the platform's liability and never appear in, or reduce, the writer's numbers.
- **Free access (`:6507`, `:6700`).** Free access is `no_consideration`. It gets an **"Access Confirmation (no consideration)"** document, **not** a "Tax Invoice".
- **Other documents carrying the commission** must follow the rename and add a **"Taxes (18%)"** line. That means the agreement PDF (`agreementPdf.js:124-126`, fed from `:1012-1013`), `purchaseRequestAcceptancePdf.js:107`, and `scriptSubmissionPdf.js:168-171`, which re-implements the 5% as its own constant. Delete that constant.
- **Notifications** have literal "5%" strings at `:4342`, `:4443`, `:4853`, `:6693`, `:7046` and `:7096`. Drive them from config and show the total "incl. taxes".

### O4 — Script hold
- **Handlers:** `scriptController.js:6777 createScriptHoldOrder`, `getScriptHoldQuote :6000`, `verifyScriptHold :6860`. The verifier is already strict; keep it and move it onto `readVerifiedOrder`.
- **Lines:** `hold_price` plus `hold_platform_fee`, both taxable, plus 18% taxes on the sum, as in O3. The creator's payout stays the pre-tax hold fee.
- **Fix wrong records:**
  - `ScriptOption.platformCut`'s comment says 10%; the real value is 5%.
  - The hold invoice mixes INR rows with a charged-currency total (`:7092-7102`). Fix that.
- **Centralise `holdFee || 200`.** It is duplicated in about five places; move it into config.

### O5 — AI trailer
- **Handlers:** `scriptController.js:7317 createScriptTrailerOrder` and `:7385 verifyScriptTrailerPayment`.
- **Convert `TRAILER_PRICE_MATRIX`** (`:160-167`) to minor units and move it to `config/pricing.js`.
- **Stop trusting the request body.** Verify currently stores `amount`, `currency`, `duration` and `quality` **from `req.body`** (`:7388-7456`). Read them from the order notes and snapshot instead, through `readVerifiedOrder`.
- **Add the missing buyer Transaction.** The comment at `:7495` claims one is written; none is.

### O6 — Competition entry fee
- **Handlers:**
  - `competitionController.js:794 createRegistrationOrder`
  - `utils/competitionRegistration.js:19 competitionRegistrationCharge`
  - `:997 verifyRegistrationPayment`
  - `:703 finalizeRegistrationPayment`
  - `:1063 reconcileRegistrationPayment`
  - `:628 issueRegistrationInvoice`
- **Order reuse** (`:891-911`) must **not** reuse an order when its stored snapshot no longer matches. That happens when the billing state or country changed, or when the order predates GST cut-over. In those cases, cancel the reuse and create a fresh order.
- **Fix `issueRegistrationInvoice`.** It skips the ledger write when an invoice already exists (`:632-633`) and omits `providerOrderId`. Fix both.
- **Set the default fee in one place.** It lives in both `Competition.js:101-102` and `competitionRegistration.js:3`; pick one.
- **Free mode:** `registerForCompetition` (`:532`) is `no_consideration`.
- **External registrations** (`externalRegistrationController.js:475`) are ledger grants with no consideration and no invoice; that is deliberate (`:35`). Keep it, with `supplyType: "no_consideration"`.

### O7 — Consultation (currently almost entirely outside the books)
- **Handlers:** `consultationController.js:118 createOrder` and `:252 verifyPayment`.
- **Missing records:** consultations write **no** LedgerEntry, Transaction or Invoice. Add:
  - a LedgerEntry `kind: "consultation"`, plus `subjectType: "Consultation"` (both are missing from the enums in `LedgerEntry.js:37-46` and `:95-99`)
  - an `INVOICE_KINDS.consultation`
  - every consultation handler in `MONEY_HANDLERS`
- **Pricing:**
  - `Availability.consultationPrice` and `currency` are stored raw from the request body (`availabilityController.js:77-78`). Validate them as integer minor units with a min and max, and restrict currency to the supported list.
  - The duration fallback (`:154-159`) charges ₹8,000 for **any** duration other than 60. Make duration an enum, and price from config.
  - The Availability path passes `inrAmount: null`, so there is no INR fallback. Make it consistent with the other surfaces.
- **Lines (D4, tax on the full amount):**
  - One taxable line, `consultation`, at the professional's price, plus 18% taxes. ₹8,000 → **₹9,440** charged to the writer.
  - **The tax invoice goes to the writer** for the full amount.
  - **The professional's split is unchanged:** `platformFee = 10%` and `professionalAmount = 90%`, both of the **pre-tax** price. Taxes never come out of the professional's share.
  - Store the split from the snapshot's taxable amount, **not** from `order.amount`. Today it is `order.amount`, which would now include taxes.
- **When payments are disabled:** `CONSULTATION_PAYMENTS_ENABLED !== "true"` (`:83`, `:169-197`) saves a "paid" consultation with no charge. Record it as `no_consideration`. Today `sendConsultationPaidWriterEmail` (`emailService.js:1426`) says "successfully paid" even though nothing was charged; fix that.
- **Fix the professional's email.** `sendConsultationBookedEmail` (`emailService.js:1459`, line `:1468`) tells the professional "You will receive the full X". That is wrong: show the consultation price, the 10% platform fee, and their net. Never the writer's taxes.
- **Refunds:** `rejectConsultation :404` and `cancelConsultation :491` use the shared refund path (§5).
- **Payouts:** `adminProcessPayout :575` only marks a payout complete with a reference from the request body. Out of GST scope, but record it as a ledger payout event so finance can reconcile the professional's share.

### Grants and zero-consideration paths
These all write `tax.supplyType = "no_consideration"` (or `out_of_scope`) and **issue no tax invoice**. Keep `listPriceMinor` for "revenue foregone".

- **Admin grants** (`adminController.js`): `grantPremiumModelToUser :895`, `grantWriterPlanToUser :1042`, `grantFipPlanToUser :1104`.
- **Competition rewards:** `competitionAdminController.js:82 grantSubscription` (from `adminDeclareResults :660`).
- **Paths that write no ledger grant today** — add one:
  - referral-tier plan days (`competitionAdminController.js:880-891`)
  - prize featured placement and prize AI trailer (`:759-760`)
  - `scripts/grantGoldPlan.js`
  - free consultations
- **Cash prizes** (`competitionAdminController.js:762`) are booked as kind `cash_prize` with `listPriceMinor = cashMinor`, i.e. as "revenue foregone". That is wrong: a cash prize is money **owed out**. Mark it `out_of_scope`, exclude it from every GST and revenue figure, and add `cash_prize` to the finance `KINDS` filter. Today it is missing from `financeController.js:16-24`, so `?kind=cash_prize` silently returns everything.
- **Dormant paid paths:** `onboardingController.js:702-719` (`completeOnboarding`, plan "paid") creates a pending ₹130 Subscription with a "Stripe TODO". Remove it, or make it throw, so no un-taxed paid path exists. `credits` ledger kind is dead; leave it but cover it in the audit.

---

## 4. Tax documents (overhaul `Invoice` and `utils/invoiceIssue.js`)

### 4.1 Document types

`documentType` is one of:

| Value | Used for |
|---|---|
| `tax_invoice` | Domestic supplies; exports use the same type with an export declaration |
| `credit_note` | Refunds and downward corrections, under CGST Act s.34 |
| `debit_note` | Upward corrections; rare, but supported |
| `access_confirmation` | Zero consideration. Not a tax document. |
| `legacy_invoice` | Every existing document, read-time default |

### 4.2 Numbering (CGST Rules r.46(b))

Today's numbers look like `PREFIX-YYYYMMDD-<last 8 of payment id>` (`invoiceIssue.js:61`), for example `CKR-PLN-20261011-ABCD1234`. That is **25 characters and not consecutive**. A non-legacy number must be:

- **≤ 16 characters**, using only `A–Z`, `0–9`, `-` and `/`
- **consecutive** within its series
- **unique per financial year** (April–March, **Asia/Kolkata**)

**Implementation:**
- Add a `DocumentSeries` collection: `{ series, fy, next }`. Allocate with `findOneAndUpdate({series, fy}, {$inc:{next:1}}, {upsert:true, new:true})`.
- Allocate the number **only at issuance**, after capture. If the insert fails after a number was allocated, write a `cancelled` placeholder document so GSTR-1 Table 13 still accounts for every number. **Never leave silent gaps.**
- Keep the legacy numbers on legacy documents. New documents get `series`, `fy`, `seq` and `documentType`.
- **Dates and FY in IST.** `buildInvoiceNumber` uses `toISOString()`, which is UTC, so a payment between 00:00 and 05:29 IST gets the previous day's date, and the FY boundary lands on the wrong side of midnight on 1 April.
- **Idempotency stays** on `paymentReference`. A retried callback or webhook must never allocate a second number.

### 4.3 Mandatory content (r.46)

Render this in `utils/invoicePdf.js` from the snapshot only:

- **Title:** "TAX INVOICE", "CREDIT NOTE", and so on. The header today just says "INVOICE" (`invoicePdf.js:173`).
- **Supplier:** legal name, **registered** address, **GSTIN**, CIN, and optionally PAN.
- **Document:** number and date (IST).
- **Recipient:** name and address. Also **GSTIN** for B2B, and the "SEZ" flag. Today's "Billed to" (`:202`) shows only name, email and SID.
- **Place of supply:** state name and code, or the country for an export. Always print it.
- **Lines:** SAC, description, quantity, unit, gross, discount, taxable value, and rate plus amount for **CGST, SGST and IGST, each shown separately**.
- **Totals:** subtotal (taxable), a friendly **"Taxes (18%)"** line, then the statutory breakup under it (CGST 9% + SGST 9%, or IGST 18%), then the grand total and the **amount in words**. The invoice PDF is the **only** buyer-facing place where "GST", "GSTIN", "CGST", "SGST" or "IGST" may appear, because r.46 requires them.
- **Reverse charge:** "Whether tax is payable on reverse charge: **No**".
- **Exports:** "Supply meant for export on payment of IGST", plus the currency and INR equivalents (D6, no LUT).
- **D8 gap invoices** (paid 4 Oct → cut-over) carry the original payment date as the date of supply. They show the carved-out taxable value and taxes, and include a note: "Amount received inclusive of taxes".
- **Credit notes:** the original invoice number and date, the reason, and the same place of supply and rates as the original.
- **Signature:** "Authorised Signatory" with the existing signature image (`brandAssets.SIGNATURE`, `COMPANY.founder`).

**Remove from buyer documents:**
- the "Net per premium sale" (writer earnings) figure (`invoicePdf.js:313-317`)
- every `type:"Tax"` label on commission rows
- the commission rows' "Tax" type in `invoicePdf.test.js:30` fixtures

`Invoice.platformFeeRate` defaults to **0.2** while the real rate is 0.05. Fix the default and stop printing it.

### 4.4 Immutability and retention

- An issued tax document **never changes value**. The `pdfDesignVersion` re-render (`invoiceController.js:11`, `INVOICE_DESIGN_VERSION = 4` at `invoicePdf.js:38`) may change layout only. It renders from the stored snapshot, and **legacy (before 4 Oct) documents must never gain tax lines** on re-render.
- Corrections such as a wrong GSTIN or a wrong state are made by a **credit note plus a re-issued invoice**. Never edit in place. That correction is an admin-only action (`adminRoutes.js`) and is audit-logged (`AuditLog`).
- Retain the documents for **72 months** (CGST s.36). Make sure nothing deletes the Cloudinary PDFs, and keep `pdfPath` plus a content hash.

### 4.5 Access and delivery

- **New `GET /api/invoices`**, the user's own documents, paginated. Users have **no** way to list their invoices today: the ids only come back in verify responses.
- **`GET /api/invoices/:id/pdf`** keeps its owner-or-admin rule. Add finance-role read access through `financeRoutes.js`.
- **Receipt email on every successful payment, with the invoice PDF attached.** None exists today for plans, script purchases, holds, trailers or competition fees. Build it in the shared on-palette mail family (`mailDocument.js` with `notify.js`), not as a one-off template.
- **Finance list projection.** `getInvoices` (`adminController.js:1529`, projection at `:1575-1601`) drops `kind`, `currency`, `amountCharged` and `competition`. Include them plus every tax field.

### 4.6 E-invoicing (IRN/QR)

Mandatory only above **₹5 crore aggregate turnover**. Build an adapter interface (`einvoiceProvider`, no-op by default, `EINVOICE_ENABLED` flag) for B2B tax invoices and credit notes, so switching it on later is a configuration change.

---

## 5. Refunds and credit notes

Build one shared `refundPayment({ ledgerEntry, amountMinor, reason, actor })`. It:

1. calls the Razorpay refund API
2. calls `recordReversal` against the **original** entry, found by `providerPaymentId`, with a **pro-rata tax reversal** (integer apportionment that preserves the invariant on both the refund and the remainder)
3. issues a **credit note** referencing the original invoice
4. sends the refund email
5. is idempotent on the refund id

A refund of a **pre-GST** payment issues no credit note; it only reverses. Credit notes must be issued before the s.34 deadline (30 November after the end of the FY, or the annual-return date if earlier). Show a warning in finance when one is late.

Wire every refund path through it:

- **`rejectConsultation` and `cancelConsultation`** (`consultationController.js:404`, `:491`). Today they refund at Razorpay with **no** ledger reversal.
- **`rejectScriptPurchase`** (`scriptController.js:4673`). Its refund branch, which holds the codebase's only `recordReversal` call, is **dead code**: it requires `paymentStatus === "escrow_held"`, which nothing sets any more. Either delete it or re-wire it to the real state machine.
- **`releaseHold`** (`:4918`) cancels without a refund. Confirm that is the intended policy, and document it in the refund policy.
- **No refund path exists** for plans, paid script purchases, holds, trailers or competition fees. Add an **admin-only** "Refund (full/partial)" action on `/finance` (with `canControl`) that calls `refundPayment`.
- **Webhook `refund.processed` / `refund.failed`** updates the same records.

---

## 6. Ledger and the finance portal (`/finance`)

The finance portal is where the CA works, so **every change in this prompt must be visible there**. If a payment, tax, invoice, credit note or payout exists anywhere in the product, finance can see it, filter it and export it.

The existing rules still apply:
- **One page, two audiences.** The finance role is read-only; admin gets the controls through the `canControl` / `actions` prop.
- **Reads** go on `financeRoutes.js` (`financeOnly`). **Mutations** go on `adminRoutes.js` (`adminOnly`).
- **Wording.** Cards and headings say **"Taxes"** ("Taxes collected"). The statutory tables and exports use the return's own column names (CGST/SGST/IGST, GSTIN), because the CA files from them. This is one of the two allowed exceptions to the wording rule.
- **Currencies never mix.** Never add INR and USD together: every figure is per currency. USD rows also carry their INR equivalent, because returns are filed in INR.

### 6.1 Ledger (`utils/ledger.js`)

- `recordPayment`, `recordGrant` and `recordReversal` take the `tax` snapshot. A reversal carries the pro-rata negative taxes.
- **`LedgerEntry.invoice` is never populated today.** Link every paid entry to its tax document.
- Add `kind: "consultation"` and `subjectType: "Consultation"`.
- Store `gatewayFeeMinor` and `gatewayTaxMinor` (Razorpay's fee, and the tax on that fee, which is input tax credit).
- **Payouts to writers and professionals are costs, not revenue.** Under the principal model (D3/D4) the whole sale is the platform's revenue, and what the writer or professional receives is paid out of it. Record each payout as a ledger event (`settlement: "payout"`) so the portal can show it. That covers the writer wallet credit on a sale or hold, and the consultation `professionalAmount`. Payouts carry **no** tax.

### 6.2 Server: finance endpoints

| Endpoint | Change |
|---|---|
| `getFinanceSummary` (`financeController.js:60`) | Per currency, per kind, per month: **Collected** (gross), **Revenue (excl. taxes)**, **Taxes collected** (with CGST/SGST/IGST in a `breakdown` object), **Payouts to creators**, **Refunds** (with their negative taxes), and **Granted free** (foregone, untaxed). Count exports and gap back-filled payments separately. |
| `listFinanceEntries` (`:123`) | Return the tax fields and the document number. Filter by `supplyType` (Delhi / other state / export / gap / pre-tax), by `hasDocument`, by period, and by kind. |
| `KINDS` (`:16-24`) | Add `consultation` and `cash_prize`. Today `?kind=cash_prize` is silently ignored and returns everything. |
| `exportFinanceCsv` (`:165`, columns `:174-178`) | Add: document type, document number, document date, SAC, place-of-supply code and name, buyer business tax ID, supply type, rate, taxable, CGST, SGST, IGST, taxes, gross, payout, and INR equivalents with FX rate and source. |
| `getInvoices` (`adminController.js:1529`, projection `:1575-1601`) | Stop dropping `kind`, `currency`, `amountCharged` and `competition`. Add document type, series and number, and every tax field. Filter by document type. |
| `getPayments` (`adminController.js:1499`) | Add taxable, taxes and total paid from the buyer Transaction's snapshot. |
| `getInvestorPurchases` (`adminController.js:1482`) | Today it lists unlocks with no amounts. Return script price, platform fee, taxes, total paid and writer payout. |
| **New** `GET /api/finance/consultations` | The read side of consultations, which today live only in the admin console (`pages/admin/sections/ConsultationsSection.jsx`): price, taxes, charged, platform fee (10%), professional payout, payout status, refund and credit note. `adminProcessPayout` and refunds stay on `adminRoutes.js`. |
| **New** `GET /api/finance/plans` | Every plan member: plan, cycle, **billing mode (auto-renew / one-time)**, Razorpay status (active / pending / halted / cancelled), next charge date and amount **incl. taxes**, last payment, and access end date. |
| **New** `GET /api/finance/taxes/gstr1?period=YYYY-MM` | JSON plus CSVs laid out like the GST offline-tool sheets: **b2b**, **b2cl**, **b2cs**, **exp** (all **WPAY**, D6), **cdnr**, **cdnur**, **hsn** (B2B and B2C split), and **docs** (Table 13, including cancelled numbers). Put thresholds such as the B2CL inter-state limit in config, and confirm them with the CA. |
| **New** `GET /api/finance/taxes/gstr3b?period=YYYY-MM` | 3.1(a) taxable outward supplies (domestic, including gap back-fill), 3.1(b) exports **on payment of IGST** (D6: nothing is zero-rated without tax), and 3.2 inter-state supplies to unregistered persons by place of supply. |
| **New** `GET /api/finance/taxes/register?type=invoice\|credit_note&period=` | The document register. |
| **New** `GET /api/finance/taxes/review` | The `needsReview` place-of-supply queue. |
| **New** `GET /api/finance/taxes/reconciliation?period=` | Every captured Razorpay payment matched to its tax document. **Any capture without a document is listed as an error, and the target is zero.** Also gateway fee and tax-on-fee totals. |
| **New** `GET /api/finance/taxes/gap` | D8: every payment from 2026-10-04 IST to cut-over, with its carved-out taxable and taxes, and whether a gap invoice has been issued yet. |
| **New** `POST /api/admin/taxes/gap/issue` (admin only) | Runs the same code as `gstGapReport.js --issue`. It requires a typed confirmation, is idempotent per payment, and is audit-logged. |
| **New** `POST /api/admin/taxes/period-lock` (admin only) | After the GSTR-1 for a month is filed, lock it. No document may then be dated inside a locked period; late items go into the next open period. |
| **Refund** `POST /api/admin/payments/:ledgerEntryId/refund` (admin only) | Full or partial, through `refundPayment` (§5). Produces the reversal plus the credit note. |

### 6.3 Finance portal UI (`client/src/pages/finance/`)

Extend `FinanceHome.jsx`'s section list and `useFinanceData.js`. Every table also renders as stacked rows at 375 px wide, and the page never scrolls sideways. `/finance` is a mobile migration fallback in `mobileRouteManifest.js`, so the desktop page is what phones get.

| Tab | What it must show |
|---|---|
| **Overview** (`LedgerSection.jsx`) | A month picker. Per-currency cards: **Collected · Revenue (excl. taxes) · Taxes collected · Payouts to creators**. "By type" gains a Taxes column. "Granted free" is unchanged (no taxes). The entries table (`:104-120`) gains Taxable, Taxes, Supply (Delhi / Other state / Export / Gap back-fill / Before taxes) and a link to the document number. `KINDS :24-33` gains `consultation`. |
| **Payments** (`FinanceSections.jsx PaymentsTable :46-69`) | Taxable, Taxes and Total paid. Admin gets a **Refund** action per row. |
| **Invoices** (`InvoicesTable :151-172`, which today has no amount column at all) | Document type, number, date, buyer, place of supply, business tax ID, taxable, taxes (an expanded row shows CGST/SGST/IGST), total, currency, and a PDF link. Filter: Tax invoice / Credit note / Before taxes (legacy). Legacy pre-4-Oct invoices are labelled **"Before taxes"**. |
| **Script purchases** (`PurchasesTable :174-186`, which today shows the base `s.price` as "Amount") | Script price · Platform fee · Taxes · Paid · Writer payout. |
| **Challenges** (`ChallengesTable :84-149`) | Fee · Taxes · Paid · Document. |
| **Consultations** (new tab, from `/api/finance/consultations`) | Price · Taxes · Charged · Platform fee · Professional payout · Payout status · Refund / credit note. Admin actions (process payout, refund) arrive through `actions`, so the finance role sees none. |
| **Plans** (`PremiumTable`, `WriterPlansTable`, which today show no amounts) | Plan · Cycle · **Auto-renew / One-time** · Status (a pending/halted renewal is highlighted) · Next charge (date and amount incl. taxes) · Last payment · Access ends. |
| **Taxes** (new tab) | A month picker, then: a summary (taxable, CGST, SGST, IGST, total taxes, export count); GSTR-1 sheet downloads (b2b, b2cl, b2cs, exp, cdnr, cdnur, hsn, docs); the GSTR-3B figures; the document register; the place-of-supply **review queue**; **reconciliation** (captures without a document in red; the badge must read 0); the **gap-period panel** (4 Oct → cut-over payments, back-fill status, and an admin-only "Issue gap invoices" button with confirmation); and the admin-only **period lock**. |
| **Bank reviews** (`BankReviewsTable :237-258`) | Unchanged. |

**Rules for every tab:**
- **Server CSVs only for filed data.** Anything filed with the government is exported by the **server** CSV endpoints. `DataTable.jsx:144-182`'s client export covers only rendered columns, so keep it for convenience only.
- **Tests.** `financeAccess.test.jsx` (`:114-156`) gains cases proving: the finance role sees every new tab with **no** control buttons (refund, gap issue, period lock, payout); admin sees them; and the server refuses those mutations for the finance role even when forged. Add render tests for the Taxes tab and for the per-currency split (INR and USD never summed).

### 6.4 Money figures outside `/finance`

- **Admin overview.** `getStats` (`adminController.js:425`, `:492-496`) sums signed amounts across **mixed currencies** into `totalRevenue`, and `OverviewSection.jsx:130` prints it as `₹${totalRevenue.toFixed(2)}`. Make it per currency and **net of taxes**. The same fix applies to the PDF "Total Revenue" (`dashboardShared.jsx:168-195`) and the "complete report" (`AdminDashboard.jsx:722-776`).
- **Writer "earnings"** are computed as unlocks × list price (`dashboardController.js:44-55`, `transactionController.js:435-440`). Switch them to actual payouts credited. Taxes never enter writer or professional earnings.
- **`getWalletBalance`** (`transactionController.js:231`) hardcodes INR. Fine for the wallet, but label it.
- **`requestWithdrawal`** (`:249`) adds `amount` without `Number()`, so a string concatenates. Coerce it and validate it.

---

## 7. Client: every surface, desktop and mobile

**Ground truth today:**

- There is no GST in client code, and no billing-profile field anywhere.
- Only the script purchase shows a breakdown. Plans, challenge entry, AI trailer and consultations show one client-side number, and the server charges its own amount, which the buyer first sees inside the Razorpay sheet.
- There is no user-facing invoice or payment history page on either platform. Mobile copy still says "Open it from Payments in your account" (`ProjectCheckoutMobile.jsx:137`, `:145`).

### 7.1 Principles for the client

1. **No client price or tax math.** Delete every client-side copy of the 5% fee, the annual 0.85 factor, the trailer table and the consultation prices. All of them can drift from the server. Every checkout fetches a **server quote** and renders it.
   - Quote endpoints: `POST /api/scripts/purchase/quote` and `/hold/quote` exist but no live client calls them; add plan, trailer, competition and consultation quotes.
   - Quotes are re-fetched when the currency changes. The billing state or business tax ID never changes the total, because everyone pays 18% (D6).
   - The pay button shows the quote's `grossMinor`: **"Pay ₹470.82"**.
2. **Two stages: listed price, then the checkout step (D2).**
   - **Listed prices show the pre-tax amount only.** That covers pricing cards, listing cards, competition pages and consultation slots: "₹399 / month", with no tax wording (unless `SHOW_PLUS_TAXES_HINT` adds a muted "+ taxes").
   - **Clicking buy opens a checkout step** (a sheet on mobile, a panel in the modal on desktop) with billing details and the breakdown, **before** the Razorpay sheet opens.
3. **One shared `<PriceBreakdown quote={…} />`** component (desktop plus a mobile skin). It shows exactly:
   - the lines (e.g. "Writer Gold · monthly ₹699.00", or "Script price ₹10,000.00 · Platform fee (5%) ₹500.00")
   - **Subtotal**
   - **Taxes (18%)**: one line, never split, never called GST
   - **Total**
   - for plans, "Renews monthly at ₹470.82 until you cancel"
4. **One shared `<BillingDetailsForm />`** (desktop plus mobile), titled **"Billing details"**. It covers individual vs business, name, country, state (from `GET /api/tax/config`), city and pincode. Business buyers add **"Business tax ID (optional)"**, legal name, address and an SEZ tick.
   - It does inline business-tax-ID format feedback (format only; the server is authoritative). The error copy says "That tax ID doesn't look right", never "GSTIN".
   - It prefills from the saved billing profile, falling back to the profile address (`pages/profile/profileEditor.js:122`, `:167-180`).
   - A "Save as my billing details" tick persists the details.
   - Use it in **every** checkout, ahead of the pay button.
5. **One formatter.** Route every amount through `utils/currency.js` `formatSubunits` / `formatCurrency` (or the bound versions in `CurrencyContext`, `:62-63`, currently unused). Remove the parallel helpers:
   - `checkout.js:88 formatInr`, plus a **different** `formatInr` in `producerLedger.js:23` (and `formatShortInr` `:31-36`)
   - `LedgerSection.jsx:18-22`, `PrizesModule.jsx:55-57`, `projectDetailModel.js:42-50`, `publicProjectModel.js:3-6`, `mobile/screens/Holds.jsx:47`
   - every raw `"₹"`, `toFixed` and `/100`, listed in §7.6
6. **One Razorpay loader and one key reader.** There are 8 copies of the SDK loader; keep only `utils/loadRazorpaySdk.js`. Three live checkouts bypass `razorpayKeyFromOrder`: `useWriterPlanCheckout.js:146`, `useProjectCheckout.js:271`, `useChallengeRegistration.js:199`. Send billing name and email in `prefill`.
7. **One currency source.** Challenge registration reads `user.preferredCurrency` (`useChallengeRegistration.js:31`), the trailer and consultation flows have their own selectors, and plans and scripts use `CurrencyContext`. Use `CurrencyContext` everywhere. Both plan hooks also omit `currency` from their `useCallback` deps (`useWriterPlanCheckout.js:199`, `useFilmIndustryProfessionalCheckout.js:194`). Fix both.

### 7.2 Checkout surfaces (all live ones)

| # | Surface | Desktop | Mobile | What changes |
|---|---|---|---|---|
| C1 | Plans (FIP, Silver, Gold) | `components/PricingModal.jsx` (`/pricing` via `pages/PricingRoute.jsx`, plus an overlay via `context/AuthModalContext.jsx:289`); hooks `useWriterPlanCheckout.js` and `useFilmIndustryProfessionalCheckout.js` | Same modal, from `mobile/marketing/shelf/ShelfLanding.jsx:114/:131/:244`; `/pricing` = `migration("pricing")` | Price cards show the **pre-tax** price from a server **plan quote** ("₹399 / month", keeping the existing "Billed monthly · renews until you cancel" note, with no tax wording). Pressing Choose opens the checkout step: billing details plus `PriceBreakdown`, "Taxes (18%) ₹71.82", "Pay ₹470.82". Only then does the Razorpay subscription sheet open, for ₹470.82. This replaces `config/pricing.js` + `priceLabelFor` (`:251-260`) + the FIP annual math (`:280-295`). Remove the hardcoded/dead strings (`WRITER_PLANS :54-99`, `FIP_PLANS :101-125`, `"₹0"` at `:748` which also shows in USD mode, `WRITER_TIERS.price` in the hook `:24-27`). The strike-through anchors (`:262-272`, `:292`) become config, or are removed if unjustified (a fake "was" price is a dark pattern). Annual prices get digit grouping (`:257`, `:285`). Add billing details + breakdown before pay; the success screen (`:627-642`) shows the invoice number and a download. |
| C2 | Script purchase | `pages/ScriptPaymentPage.jsx` (`/script/:id/pay`), panel `:222-246`, note `:238-240`; `pages/script-detail/checkout.js` (`PLATFORM_TAX_RATE :43`, `getPurchasePricing :48-58`, `readOrderPricing :66-78`, which **whitelists fields and will drop GST**); `useProjectCheckout.js` | `mobile/screens/projects/checkout/ProjectCheckoutMobile.jsx` (panel `:323-338`) + `checkoutModel.js` (`buildAmountRows :35-44`, `AMOUNT_NOTE :46`, pay label `:151-160` keeps the **client** estimate even after server pricing) | Replace the client estimate with the server quote from the start. Rename "Platform Commission (5%)" to **"Platform fee (5%)"** and add **"Taxes (18%)"** on the full amount (price + fee, D3). Pass the snapshot through untouched (no whitelist). Desktop must show the charged currency and INR-fallback line that mobile already shows (`ProjectCheckoutMobile.jsx:215`, `:334`); desktop never renders `lastCharge`. |
| C3 | Purchase request (pre-approval) | `features/script-workbench/ScriptWorkbenchPage.jsx:177` ("After approval" = `price*1.05` inline, list price not request amount) | `ProjectDetailMobile.jsx:749` (`PurchaseRequestSheet`, base only); approve confirmation `:797-800` says "will be asked to pay {base}", which understates | Both show "≈ total incl. platform fee and GST, final at checkout" from a server quote for the request amount. |
| C4 | AI trailer | `pages/ScriptDetail.jsx` (`trailerPriceMap :307-314` is client-only; price embedded in a free-text note `:321-327`; order `:759`; verify posts client `amount` at `:781`; success is an `alert()` at `:806`) + dialog in `ScriptWorkbenchPage.jsx:134-165` | **Missing** (deliberately absent, `ProjectDetailMobile.jsx:31`) | Fetch a trailer quote, add the breakdown, billing details, an invoice download on success and a proper success state. Stop sending `amount` on verify. Admin `dashboardShared.jsx:216-233 parseTrailerRequestNote` and `AdminDashboard.jsx:2914-2934` parse the price out of the note; read the snapshot instead. Decide whether mobile gets trailer purchase (record the parity decision). |
| C5 | Competition entry | `pages/challenge/CompetitionRegister.jsx` (`/challenge/register`, radios `:156` raw `₹${/100}`, "Pay to register" `:160` with no amount), `challengeRegistration.js` (fallback 9800/200 at `:46-49`), `useChallengeRegistration.js` | `mobile/screens/challenges/ChallengeRegisterMobile.jsx` (radios `:176`, "Continue to payment" `:133` with no amount) | Breakdown, billing details, and the amount on the button. Remove the client fee fallback. The copy "stays available from your dashboard" (`challengeRegistration.js:149-152`, mobile `:53`) is false today: point it at the new Billing page. Also hardcoded marketing: `pages/landing/sections/Challenge/challenge.data.js:162` "₹98 (INR) or $2 (USD)" (rendered at `ChallengesPage.jsx:237`, `:103`). Drive it from the competition record, labelled per D2. |
| C6 | Consultation | `pages/Profile.jsx` `handleDirectBooking :577-656`; hardcoded "30 Min - ?8000 / $9" and "1 Hour - ?15000 / $16" at `:3423-3424` and "INR (?)" at `:3405`. The **"?" is a literal mis-encoded ₹**. "100% refund guarantee" `:3504`; "Pay & Book Consultation" `:3525` with no amount. Triggers `:1305-1318`, `:1370-1380`, `features/profile-pc/components/ProfileWorkspaceSections.jsx:188-192` | **Missing** | Fetch a consultation quote (from the professional's Availability, server-validated), add the breakdown, billing details, the amount on the button, and an invoice on success. Make the refund-guarantee copy match the credit-note policy. Show professionals their price / 10% platform fee / payout (never the writer's taxes) (`pages/Dashboard.jsx:631`, `:1683`; `features/producer-workspace/ProducerDashboardPage.jsx:901`). |
| C7 | Script hold / option | **No live purchase UI.** The only one is the dead `RazorpayScriptPayment.jsx`; the handlers in `ScriptDetail.jsx:739-751` are dead | Holds list `mobile/screens/Holds.jsx:47/:99/:260` (`/offer-holds`); `holdsModel.js:173-178` parses `platformCut`/`creatorPayout`, which are never shown | The server is still taxed (O4). Holds lists show "fee incl. taxes" from the snapshot. If a hold purchase UI is (re)built, it uses C2's components. |

### 7.3 Prices shown outside checkout (base price only; label them consistently)

Listing cards show the **writer's price**, not the buyer's total. Per D2 they show the pre-tax price only; with `SHOW_PLUS_TAXES_HINT` on, add a muted "+ fee & taxes". Use the shared formatter everywhere.

- **Desktop:**
  - `components/ProjectCard.jsx:347`, `:405`
  - `components/ScriptCard.jsx:71-72`, `:210`
  - `pages/PublicScript.jsx:262`
  - `pages/ScriptReader.jsx:268` ("Request to Buy – ₹{price}", unformatted)
  - `features/investor-desk/investorDesk.js:107-112`, `components/LeadStory.jsx:211`, `ProjectRailCard.jsx:85`
  - `features/featured-broadsheet/featuredBroadsheet.js:126-127 getPriceLabel` prints **"$" on INR prices** (bug). Used at `FeaturedProjectsPage.jsx:655/:691/:741/:836`, `SpotlightCard.jsx:54`, `LeadStory.jsx:93`, `DetailSheet.jsx:137`.
- **Mobile:**
  - `public-project/publicProjectModel.js:3-6`, `ProjectPublicMobile.jsx:86`
  - `discovery/components/DiscoveryProjectCard.jsx:50-51`, `:67`
  - `FeaturedLeadCard.jsx:94` shows "$" while `featuredModel.js:186` shows "₹" on the same screen
  - `screens/sections/ProjectsSection.jsx:258`, `mobile/data/dashboardModel.js:191`
- **Admin:** `pages/AdminScriptView.jsx:914-920`, `:1103` ("₹… INR", double label), `:1362`.
- **SEO:** `seo/schemaUtils.js:45-49`, `:130-136` JSON-LD `Offer` (`price "0"`, `priceCurrency "USD"`). If real prices are published there, they must match the listed (pre-tax) display, with `valueAddedTaxIncluded: false`.

### 7.4 Writer and professional price-setting and payout previews

- **Writer previews must state that the buyer pays the platform fee and taxes on top, and that neither reduces the writer's payout** (D3). Example preview: "Buyer pays ₹12,390 (₹10,000 + 5% fee + taxes) · You receive ₹10,000". Today the commission, buyer total and payout are computed on the client from **four** separate 5% constants:
  - Upload (`/upload`): `pages/ScriptUpload.jsx:721-731`, `publishInvoiceRows :2719-2740`, `:3020`
    - desktop render `components/script-upload/ScriptUploadWorkspace.jsx:190`, `:643-657` (hides the commission and buyer total)
    - mobile render `mobile/screens/upload/panels/UploadPanels.jsx:1057`, `:1063`, `:1088-1098` (shows all 4 rows)
  - Create project (`/create-project`): `pages/CreateProject/index.jsx:567-574`, and `publishSummaryRows :1441-1467`, which is rendered nowhere
    - desktop `steps/Step5Publish.jsx:38`, `:45`, `:52`
    - mobile `mobile/screens/create/panels/StepPanels.jsx:162`, `:213`

  Replace them with a server **payout preview** (`POST /api/scripts/pricing-preview`) that returns writer price, platform fee, taxes, buyer total and writer payout.
- **Settle one preset list and one price guide.** The presets disagree: `[5…50]` vs `[49…249]`; the default price 10 is not a preset; and there are two different `FORMAT_PRICE_GUIDE` tables. Move them to config.
- **Professional payout tax profile (D10).** Add an optional "PAN / Business tax ID" block next to bank details (never labelled GST):
  - desktop `components/EditProfileModal.jsx` Banking tab (`:1321-1440`)
  - mobile `AccountSettingsMobile.jsx:267` → `AccountCredentialsMobile.jsx:53-155`
  - API `pages/profile/accountCredentials.js:101-121`

### 7.5 New: Billing page (desktop and mobile)

- **Desktop:** a "Billing & invoices" section in `Profile.jsx` settings (beside the currency toggle at `:2660-2680`; tabs are URL-addressable).
- **Mobile:** an entry in `AccountSettingsMobile.jsx` (next to currency `:262`) plus a screen registered in `mobile/routes/mobileRouteManifest.js`.
- **Contents:**
  - the saved billing profile (edit with `BillingDetailsForm`)
  - a list of tax invoices and credit notes from `GET /api/invoices`, with number, date, what was bought, total, GST and a PDF link
- Point every "available from your dashboard" / "from Payments in your account" line at it.
- `components/Transactions.jsx` (imported at `Profile.jsx:13`, never rendered) can be revived or deleted. Do not leave it half-wired.
- **Industry "Money in and out"** (`ProducerDashboardPage.jsx:702-758`, `producerLedger.js:497-509`; its "Export CSV" at `:712` exports the deal ledger, and `producerLedger.js:515-531` has the column "Amount (INR)") plus mobile `IndustryDashboardMobile.jsx:86-123`. Show amounts actually paid (incl. taxes) next to the base, and label them.

### 7.6 Finance and admin UI

- **`/finance`**: fully specified in **§6.3**. That covers every tab, column, control and test. Do not duplicate it here.
- **Admin:**
  - `sections/OverviewSection.jsx:130` "Total Revenue" (`₹${totalRevenue.toFixed(2)}`, mixed currencies) → per currency, net of taxes (§6.4).
  - `dashboardShared.jsx:168-195` PDF export "Total Revenue" (`:194`), and `AdminDashboard.jsx:722-776` "complete report": same fix.
  - `sections/ConsultationsSection.jsx:82` (literal "?" for ₹), `:92-100`, `:196-199`, `:268-269` "Platform Fee Split": show price, taxes, charged, platform fee and professional payout, plus the credit-note links. Its read-only view moves into the finance portal's Consultations tab (§6.3); payout controls stay here.
  - `DiscountCodesSection.jsx` + `DiscountCodeFormModal` (`dashboardShared.jsx:928-1038`) call `/admin/discount-codes`, **which does not exist on the server**. No buyer coupon input exists either. Leave it out of scope, but if coupons are ever built, a discount shown on the invoice **reduces the taxable value before taxes** (CGST s.15(3)) and must be a discount line in the snapshot.
  - The admin competition fee editor (`pages/admin/competitions/modules/OverviewModule.jsx:19`, `:81-103`; `AdminCompetitionsEditor.jsx:101`) states that the fee entered is the **pre-tax** listed price; taxes are added at checkout (D2).
- **Raw-money sites to convert to the shared formatter:**
  - `Dashboard.jsx:631/:809/:1683`
  - `ProducerDashboardPage.jsx:901`
  - `ConsultationsSection.jsx:82/:196/:269`
  - `OverviewSection.jsx:130`
  - `DiscountCodesSection.jsx:51-59`
  - `dashboardShared.jsx:978/:998/:1003`
  - `ScriptCard.jsx:72`, `PublicScript.jsx:262`, `ScriptReader.jsx:268`
  - `ScriptUploadWorkspace.jsx:190/:656`, `Step5Publish.jsx:45/:52`
  - `CompetitionRegister.jsx:156`, `ChallengeRegisterMobile.jsx:176`
  - `PricingModal.jsx:257/:264-269/:285/:292/:748`
  - `Profile.jsx:3405/:3423-3424`, `ScriptDetail.jsx:318/:326`
  - `featuredBroadsheet.js:127`, `featuredModel.js:186`, `DiscoveryProjectCard.jsx:51`, `ProjectsSection.jsx:258`, `dashboardModel.js:251`
  - `UploadPanels.jsx:1057`, `StepPanels.jsx:213`
  - `challenge.data.js:162`, `ScriptUpload.jsx:3020`
- **Mis-encoded ₹ (literal "?")** at `Profile.jsx:3405/:3423-3424` and `ConsultationsSection.jsx:82`. Fix the bytes and add a test that greps `client/src` for `\?\d` money patterns and U+FFFD.

### 7.7 Legal pages (client side of §9)

- **`data/termsData.js`** (`/terms-of-service`):
  - §59 Pricing `:2554-2589`. **`:2584` already says "all prices are exclusive of applicable taxes"**, but no price in the UI says so. That now matches D2: the listed price is pre-tax and taxes are added at checkout. Keep the clause and make the checkout step say it.
  - §61 Auto-renewal `:2628-2665` describes auto-renew, but plans are one-off orders with a "Renew" button. Correct it.
  - §63 Billing `:2724-2751`, §65 Taxes `:2796-2841` (GST `:2805`), §66 Invoices `:2845-2871`, §67 Refunds `:2875-2910`, §71 `:3031-3070`, §89 `:3696-3717`.
  - Also `:704`, `:899`, `:4942`, `:5405`, `:5611`.
- **`data/legalText.json`** (`/privacy-policy`): `:555-575` (GST `:566`, invoice `:569`), `:579-603` (competition fees `:590`, taxes `:593`), `:1707-1725`.
- **`pages/WriterTermsConditions.jsx`** `:93`, `:100-104`; **`pages/InvestorTermsConditions.jsx`** `:91-93`, `:99-100` ("commissions non-refundable"), `:107`. These are linked from `ScriptPaymentPage.jsx:278-290` and `checkoutModel.js:106-113`.
- **Create the missing Refund & Cancellation Policy page and route.** The terms cite it repeatedly, but it does not exist. Cover refunds being documented with a credit note, and taxes being refunded with the amount (say "taxes", not "GST").

### 7.8 Dead code: delete, don't tax-enable

- **Components:** `components/PricingPlans.jsx`, `RazorpayScriptPayment.jsx`, `BookConsultationModal.jsx`, `ConsultationSettings.jsx`, `Transactions.jsx` (unless revived in §7.5), `BankDetails.jsx`, `pages/script-detail/ScriptDetailCinematic.jsx` (+ its test).
- **Admin:** `dashboardShared.jsx:619-656 TransactionTable`.
- **Pages and backups:** `Profile_hero_clean.jsx`, `Join.jsx`, `TopList.jsx.bak*`.
- **Unused values:**
  - `ScriptDetail.jsx:57-63` (`BUYER_COMMISSION_RATE`, `getBuyerCheckoutTotal`), `:265-266`, `:739-751`, `:1378`
  - `CreateProject publishSummaryRows`
- Confirm each is unreferenced (imports **and** lazy routes) before deleting, and keep the client build and ESLint `no-undef` clean.

### 7.9 Client tests to update or add

- **Update:**
  - Script purchase: `pages/script-detail/checkout.test.js`, `pages/ScriptPaymentPage.test.jsx` (expects "Platform Commission (5%)"), `useProjectCheckout.test.jsx`, `mobile/.../checkoutModel.test.js`, `ProjectCheckoutMobile.render.test.jsx`.
  - Challenge: `challengeRegistration.test.js`, `useChallengeRegistration.test.jsx`, `ChallengeRegisterMobile.render.test.jsx` ("INR · ₹98"), `externalRegistrationPanel.test.jsx`.
  - Ledger, holds and finance: `producerLedger.test.js`, `industryDashboard.test.js`, `Holds.render.test.jsx`, `holdsModel.test.js`, `financeAccess.test.jsx`.
  - Upload and create: `panels.render.test.jsx` (upload + create), `Upload.render.test.jsx`, `ScriptUploadWorkspace.test.jsx`, `Wizard.render.test.jsx`.
  - Project display and dashboard: `publicProjectModel.test.js`, `projectDetailModel.test.js`, `ProjectDetailMobile.render.test.jsx`, `dashboardModel.test.js`, `Dashboard.render.test.jsx`.
  - Misc: `investorDesk.test.js`, `PrizesModule.test.jsx`, `razorpayKey.test.js`, `Card.test.jsx`.
- **Update the dev harness fixtures:** `mobile/dev/CheckoutHarness.jsx`, `ChallengeRegisterHarness.jsx`, `UploadHarness.jsx`, `IndustryWorkspaceHarness.jsx`, `ProjectDetailHarness.jsx`, `PrimitiveGallery.jsx`, `mobile/data/dashboardData.js`.
- **Add (none exist today):**
  - PricingModal: the cards show the **pre-tax** price only; the checkout step shows Taxes (18%) and the tax-added total; INR/USD; monthly/annual
  - both plan hooks
  - trailer checkout
  - consultation checkout
  - `PriceBreakdown` (intra / inter / export / pending state)
  - `BillingDetailsForm` (business tax ID checksum, state required for India, business requires a tax ID; no "GST" text anywhere)
  - **wording guard**: a test that fails if any user-facing string in `client/src` (excluding `pages/finance/**`) contains `GST`, `GSTIN`, `CGST`, `SGST` or `IGST`
  - the Billing page
  - a test asserting that no client file contains price/tax constants (`0.05`, `1.05`, `0.85`, `PLATFORM_TAX`)

---

## 8. Emails, notifications and other PDFs

| File | Location | Change |
|---|---|---|
| `emailService.js` | `sendPurchaseRequestEmail :450` (₹ at `:481/:487`) | Show "price + platform fee + taxes = total" from the snapshot, never a recomputed 5% |
| `emailService.js` | `sendPurchaseApprovedEmail :499` (`:526/:529`) | Same as above |
| `emailService.js` | `sendPurchaseRejectedEmail :566` (`:588/:594`) | Refund wording: "a credit note has been issued" |
| `emailService.js` | `sendConsultationPaidWriterEmail :1426` | Breakdown; no "paid" claim when payments are disabled |
| `emailService.js` | `sendConsultationBookedEmail :1459` | Consultation price, 10% platform fee, your payout (taxes are the writer's, never shown here) |
| `emailService.js` | `sendConsultationRejectedEmail :1493` | Refund plus credit note |
| new | — | **Payment receipt + tax invoice** for every paid surface; **refund + credit note** |
| `competitionMail.js` | `cashFor :105`, `buildResultMail :117` | Cash prizes: no tax wording. Optionally add a note that applicable income-tax deductions may apply (CA). |
| `scriptController.js` | in-app notifications with ₹ at `:4342`, `:4443`, `:4853`, `:6693`, `:7046` | Show amounts "incl. taxes" and the fee as "platform fee" |
| `competitionAdminController.js` | `:779-781` | Same |
| `agreementPdf.js`, `purchaseRequestAcceptancePdf.js`, `scriptSubmissionPdf.js` | — | Rename the commission and add a "Taxes (18%)" line |
| `mailDocument.js` | `:411` | Use `COMPANY.legalName` |

---

## 9. Legal and content

- **Terms and policies:** `client/src/data/termsData.js` (GST mention around `:2805`), `client/src/data/legalText.json`, `pages/WriterTermsConditions.jsx`, `pages/InvestorTermsConditions.jsx`, and the refund/cancellation and pricing/FAQ copy. They must state:
  - listed prices exclude taxes; **taxes of 18% are added at checkout**, for buyers in India and abroad (D2/D6)
  - that a tax invoice is issued for every payment, and how business buyers add their business tax ID
  - that refunds are documented with credit notes
  - the marketplace (agent) model for scripts and consultations, per D3/D4
  - the professional's 10% platform fee (taxes are charged to the writer, never deducted from the professional)
- **No GSTIN on the website** (wording rule). It appears only on tax invoices. Replace "GST" in the legal pages with "applicable taxes" (`termsData.js:2805`, `legalText.json:566`).
- If the CA wants it, re-generate `extracted_terms.txt` / `parsed_terms.json` if they are build inputs; check this first.

---

## 10. Cut-over and historical data

Three periods, each with exactly one treatment:

| Payment date (IST) | Treatment | `supplyType` | Document |
|---|---|---|---|
| Before **2026-10-04 00:00** | Not taxable. Never touched. | `pre_gst` | the existing legacy invoice, labelled "Before taxes" in finance |
| **2026-10-04 → cut-over** (paid, no tax added) | **Taxed by carving 18% out of what was paid** (D8). | `gap_inclusive` | a new tax invoice in the `CK/<FY>/` series, linked to the legacy one |
| From cut-over (`GST_CHARGE_FROM`) | 18% added on top at checkout (D2). | `intra` / `inter` / `export_igst` / `sez_igst` | a tax invoice at capture |

- **Default off.** With `GST_ENABLED=false`, behaviour is byte-for-byte what it is today. Prove it with tests that run the existing flows with the flag off.
- **Snapshot wins at the boundary.** An order created **before** cut-over but captured after is fulfilled at the amount agreed then, and treated as `gap_inclusive`. After cut-over, refuse to **reuse** a pre-cut-over open order; competition order reuse (`competitionController.js:891-911`) is the case here.
- **Recurring plans** created before cut-over keep billing the pre-tax amount until migrated (§3, O1/O2 recurring). Each of those charges is `gap_inclusive`, never `pre_gst`, because it falls after 4 Oct.
- **No destructive migration.** Legacy records read as `supplyType: "pre_gst"` and `documentType: "legacy_invoice"`. The ledger is append-only: gap invoices are **new** documents linked to the existing ledger rows. Existing rows are never rewritten.
- **`server/scripts/gstGapReport.js`** (D8). The same code also backs `GET /api/finance/taxes/gap` and `POST /api/admin/taxes/gap/issue` (§6.2).
  - **Default (dry run):** lists every captured payment from **2026-10-04 00:00 IST** to cut-over: amount, currency, kind, buyer state if known, and the carved-out taxable and taxes. It writes a CSV and changes nothing.
  - **`--issue`:** issues the gap tax invoices. It is idempotent per payment id, numbers them in the FY series, and records the taxes on new linked ledger-tax rows.
  - **Deadline:** a tax invoice for a service must be issued within **30 days of the supply** (CGST Rules r.47). So the payments of 4 Oct must be invoiced by **3 Nov 2026**. The October back-fill must also land before the **October GSTR-1 (due 11 Nov 2026)**. Print both dates in the dry-run output, and show them as a banner on the finance Taxes tab until the back-fill is done.
- **Runbook.** Add a section to `README.md`, or a new `docs/TAXES.md`, covering:
  - the env vars: `GST_ENABLED`, `GST_CHARGE_FROM`, `TAX_LIABILITY_FROM` (default 2026-10-04), `SHOW_PLUS_TAXES_HINT`, `COMPANY_GSTIN`, `COMPANY_GST_STATE_CODE`, `COMPANY_REGISTERED_ADDRESS`, `RAZORPAY_WEBHOOK_SECRET`, `EINVOICE_ENABLED`
  - the Razorpay dashboard setup (Subscriptions activated; webhook with `subscription.*` plus the payment and refund events)
  - running the gap back-fill (dry run → CA check → `--issue`)
  - the monthly GSTR-1 and GSTR-3B export procedure from the finance Taxes tab
  - period locking

---

## 11. Tests and guards

### 11.1 `server/utils/taxCoverage.test.js` (new; source audit, like `ledgerCoverage.test.js`)

- `orders.create` appears **only** in `utils/razorpayOrder.js`.
- Every caller of `createOrderWithUsdFallback` also calls `priceOrder` in the same handler (`TAX_HANDLERS` list, all seven order sites).
- Every verify handler calls `readVerifiedOrder` and passes `tax` into `record*` and the document issuer.
- No source file references `platformTax` (outside the read-compat shim).
- No literal `0.05`, `0.1`, `* 0.85`, `"5%"` or `"10%"` price math outside `config/`.
- Every `LedgerEntry.kind` and `Invoice.kind` has a `PRODUCT_TAX` mapping.
- Every `refund` call goes through `refundPayment`.
- **Extend `MONEY_HANDLERS`** with the consultation handlers, `verifyRegistrationPayment`, `reconcileRegistrationPayment`, `approveExternalRegistration`, `adminDeclareResults` grants, the referral grants, the webhook dispatcher and `refundPayment`.

### 11.2 Engine unit tests

- **GSTIN checksum:** valid `07AAOCC0556A1ZZ`; mutate each character in turn, and every mutation must fail.
- **Place-of-supply matrix:**

  | Buyer | Expected |
  |---|---|
  | Delhi B2C | CGST + SGST |
  | Maharashtra (27) B2C | IGST |
  | B2B GSTIN 29… | IGST |
  | B2B GSTIN 07… | CGST + SGST |
  | GSTIN state ≠ declared state | 422 |
  | SEZ business buyer | `sez_igst`, IGST 18% |
  | Foreign buyer (USD) | `export_igst`, IGST 18%, **same total as a domestic buyer** |
  | Paid 2026-10-03 23:59 IST | `pre_gst`, no taxes |
  | Paid 2026-10-04 00:00 IST, before cut-over | `gap_inclusive`, carved out (₹399 → 33814 + 6086) |
  | Paid after cut-over | taxes added on top (₹399 → ₹470.82) |
  | Foreign + INR fallback | IGST (D7) |
  | No address | supplier location, CGST + SGST |
  | Contradictory evidence | `needsReview` |

- The §2.2 rounding fixtures, plus the property test.
- **Wording guard** (the founder's rule): a test that scans user-facing strings and fails on `GST`, `GSTIN`, `CGST`, `SGST` or `IGST`. It covers JSX text and string literals in `client/src` (excluding `pages/finance/**` and tests), plus `server/utils/emailService.js`, `notify.js`, `competitionMail.js`, the notification strings in the controllers, `agreementPdf.js` and `purchaseRequestAcceptancePdf.js`. The allow-list is exactly `invoicePdf.js` and the finance tax exports.
- **Payouts are tax-free**: for a script sale, hold and consultation, the writer or professional payout equals the pre-tax amount it was before this change. Assert it with the §2.2 table amounts.
- **FY numbering:**
  - 50 concurrent issuances produce 1..50 with no gaps and no duplicates
  - 2027-03-31 23:59:59 IST and 2027-04-01 00:00:00 IST land in different FYs
  - 00:30 IST is dated the IST day, not the UTC day
  - every number matches `^[A-Z0-9/-]{1,16}$`
- **Refunds:** full and partial pro-rata invariants; a pre-GST refund issues no credit note; refunds are idempotent on the refund id.
- **Razorpay notes:** ≤ 15 keys, ≤ 256 characters each.

### 11.3 Update existing tests

- `invoiceIssue.test.js` `PAID_SURFACES` (`:35-41`): add consultation.
- `invoicePdf.test.js` (`:30`, `:134`, `:151`): the address and CIN assertions now use the registered address and GSTIN.
- `registrationInvoice.test.js`: the fee literals.
- `ledger.test.js`, `ledgerCoverage.test.js`, `planCheckout.test.js`, `scriptHold.test.js`, `razorpaySignature.test.js`, `transactionProjection.test.js`.
- The client tests listed in §7.

### 11.4 End-to-end (Razorpay **test mode**, local only)

For **each** of the seven paid surfaces, run three buyers:

1. **Delhi B2C, INR**
2. **Karnataka B2B with a valid test GSTIN, INR**
3. **US buyer, USD**: pays .90 for Silver, shown as "Taxes (18%) $0.90", invoiced as an export on payment of IGST

For each run, check:
- the order amount equals the quote total
- the verify handler accepts the payment, and a replayed unrelated payment is **rejected**
- the PDF has every r.46 field
- the ledger row, Transaction and receipt email are correct
- the payment shows up in GSTR-1 rows in the right table
- a refund produces a credit note and a CDNR/CDNUR row

Then kill the browser before the verify callback and confirm the **webhook** alone completes fulfilment and invoicing.

Render the PDFs and the checkout UIs with **puppeteer-core plus the system Chrome**, not happy-dom, and attach screenshots to the PR. Headless Chrome follows the OS dark theme, so force a light colour scheme when screenshotting PDFs and emails.

### 11.5 Gates for every PR

- `cd server && npm test`
- `cd client && npm test`
- `npx eslint` on the touched files. Parse the JSON output and fail on `no-undef`.
- `cd client && npm run build`

---

## 12. Phases (one PR each; do not merge a phase with failing gates)

| Phase | Scope | Behaviour change |
|---|---|---|
| **P0** | Money-integrity fixes that would corrupt GST data: bind `verifyScriptPurchase` and `verifyScriptTrailerPayment` to their orders; stop trusting the body in the trailer flow; one signature verifier; consolidate prices and units (§3 duplicates, trailer matrix to minor units, writer price/holdFee validation — `updateScript` sets `Number(price)` with no clamp at `scriptController.js:2585`, `holdFee` raw at `:2602`, `uploadScript` at `:3038/:3042`; negative or NaN prices must be impossible); fix `fxRate` on INR fallback (notes keep the USD rate, so INR Transactions record ~88, `:6442`, `:6996`); make `readOrderCharge` fail loudly instead of silently booking the list price (`:131-144`); paid-script invoice currency and amount; `requestWithdrawal` number coercion; rename `platformTax` → `platformFee` | Bug fixes only |
| **P1** | `config/tax.js`, `utils/gst/`, the `taxSnapshot` schema, the billing profile (model, API, validation), `GET /api/tax/config`, the `DocumentSeries` counter, all engine tests | None (flag off) |
| **P2** | Wire O1–O7 (quote, order, verify, snapshot, ledger, Transaction), `readVerifiedOrder`, the re-pricing INR fallback, gateway-fee capture, consultations into the books, `taxCoverage.test.js` | Behind the flag |
| **P3** | Tax documents (types, numbering, r.46 PDF, immutability), receipt emails, `GET /api/invoices`, `refundPayment` + credit notes, the admin refund action | Behind the flag |
| **P4** | Client desktop + mobile (§7), the billing-profile UI, legal and content (§9) | Behind the flag (UI reads `/api/tax/config`) |
| **P5** | Finance: summary/CSV tax columns, GSTR-1/3B, registers, review queue, reconciliation, period lock, webhooks | Behind the flag |
| **P6** | Cut-over: gap report, runbook, flip `GST_ENABLED`, monitor the reconciliation endpoint for captures without documents | Live |

---

## 13. Out of scope (do not implement; list them for the CA in the PR description)

- **TCS under s.52**, plus GSTR-8 as an e-commerce operator. Only relevant if any writer or professional is GST-registered (D10).
- **Income-tax deductions**: the e-commerce operator TDS on payouts to writers and professionals (formerly s.194-O), and TDS on competition cash-prize winnings.
- **Reverse charge** on services the company imports (AI APIs, cloud and email providers). This is accounting, not checkout.
- Claiming **input tax credit** on Razorpay fees. P5 only captures the data.
- **Refund of IGST paid on exports** (RFD-01). Exports are taxed (D6), so the CA *may* claim that tax back; that needs Razorpay **e-FIRA** / bank realisation proof per USD receipt. Data is captured; the claim is the CA's.
- **Reverse charge / input tax credit on what the platform pays writers and professionals** under the principal model (D3/D4). This includes whether buying literary rights from an author attracts reverse charge.
- **E-invoicing** go-live once turnover crosses ₹5 crore (§4.6 only builds the adapter).
- **Gating the test-checkout routes.** POST `/api/payment/film-industry-professional/test-checkout` and `/api/payment/writer/activate-test-subscription` grant free paid plans in production. This is a security issue with its own task, but `taxCoverage.test.js` must still classify them as `no_consideration` grants.

## 14. Definition of done

- [ ] Every §1.3 decision is implemented as config, exactly as confirmed. Only the SAC codes (D5) carry `TODO-CA`.
- [ ] Pricing menus and listings show the **pre-tax** price only (₹399). Checkout shows `Subtotal · Taxes (18%) · Total` and "Pay ₹470.82", and the charged amount equals that total. This holds for plans (including recurring renewals), scripts, holds, trailers, competitions and consultations.
- [ ] Foreign buyers pay 18% too, shown as "Taxes".
- [ ] Script and consultation taxes are on the **full** amount. Writer and professional payouts are unchanged and tax-free.
- [ ] **No user-facing string says GST/GSTIN/CGST/SGST/IGST** (wording-guard test green). They appear only on the tax invoice PDF and in finance statutory views.
- [ ] Payments before 4 Oct 2026 are untouched. 4 Oct → cut-over payments have gap invoices (back-fill run before 3 Nov 2026).
- [ ] All seven paid surfaces (O1–O7) quote, charge, verify, snapshot, book and invoice with taxes, on desktop and mobile.
- [ ] Every client checkout (C1–C7) renders a server quote through `PriceBreakdown`, with the amount on the pay button.
- [ ] The client has no price or tax constants, and every amount goes through `utils/currency.js`.
- [ ] Billing details are captured before payment. The Billing page lists every invoice and credit note on desktop and mobile.
- [ ] Every zero-consideration path is tagged and produces no tax invoice.
- [ ] Every refund produces a reversal and a credit note.
- [ ] Every number is ≤ 16 characters, consecutive, FY-scoped and IST-dated. Cancelled numbers are accounted for.
- [ ] The PDF carries every r.46 field, the registered address and the GSTIN. No buyer document shows writer earnings or calls a commission "Tax".
- [ ] **Finance portal (§6.3) updated end to end:**
  - Overview cards per currency: Collected / Revenue (excl. taxes) / Taxes collected / Payouts.
  - Tax columns on Payments, Invoices, Script purchases and Challenges.
  - The new Consultations, Plans (auto-renew status) and Taxes tabs: GSTR-1/3B exports, register, review queue, reconciliation at **zero** missing documents, gap panel, period lock.
  - Admin-only refund, gap-issue and lock controls, which the finance role neither sees nor can call.
- [ ] The webhook completes fulfilment and invoicing without the browser.
- [ ] `taxCoverage.test.js` and `ledgerCoverage.test.js` pass, and a deliberately added un-taxed checkout makes them fail.
- [ ] With `GST_ENABLED=false`, every existing test passes unchanged.
- [ ] The runbook is written, and the gap report has been produced for the CA.
- [ ] Admin console revenue figures are per currency and net of taxes.
