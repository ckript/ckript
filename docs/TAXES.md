# Taxes (GST) — runbook

CKRIPT PRIVATE LIMITED is GST-registered (GSTIN `07AAOCC0556A1ZZ`, Delhi, from 4 Oct 2026). This page covers
switching taxes on, back-filling the payments made before that, filing each month, and handling refunds. The
full design and the decisions behind it are in `GST_BILLING_PROMPT.md`.

## What users see

- **Listed prices are pre-tax.** Plans show ₹399 / month; scripts, holds, AI trailers, competition entry and
  consultations show their listed price.
- **Checkout adds 18% "Taxes" on the full amount** (price + any platform fee, the whole consultation), for buyers in
  India and abroad: `Subtotal · Taxes (18%) · Total`, and the button says **"Pay ₹470.82"**.
- **Users only ever read "Taxes".** The word GST appears only on the tax invoice PDF (the law requires the GSTIN and
  the CGST/SGST/IGST split there) and in the finance portal. A test fails the build otherwise
  (`client/src/utils/taxWording.test.js`, `server/utils/taxCoverage.test.js`).
- **Every payment gets a tax invoice** (`CK/2627/000123`) by email and under **Settings → Billing & invoices**;
  every refund gets a credit note (`CN/2627/000045`).
- **Writer and professional payouts are unchanged.** Taxes never reduce them.

## Settings (`server/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `GST_ENABLED` | `false` | Add taxes at checkout. Off = checkout exactly as before taxes. |
| `GST_CHARGE_FROM` | — | When you switched it on (for the record). |
| `TAX_LIABILITY_FROM` | `2026-10-04T00:00:00+05:30` | Registration date. Earlier payments are never taxed. |
| `SHOW_PLUS_TAXES_HINT` | `false` | A muted "+ taxes" next to listed prices. |
| `COMPANY_GSTIN` / `COMPANY_GST_STATE_CODE` / `COMPANY_REGISTERED_ADDRESS` | certificate values | Printed on tax invoices only. |
| `RAZORPAY_WEBHOOK_SECRET` | — | Required for plan renewals and dashboard refunds. |

## Razorpay dashboard

1. **Subscriptions** activated on the account (plans are auto-renewing).
2. **Settings → Webhooks →** URL `<backend>/api/webhooks/razorpay`, with the same secret as
   `RAZORPAY_WEBHOOK_SECRET`. Events: every `subscription.*`, plus `payment.captured`, `order.paid` and
   `refund.processed`.

## Switching taxes on (cut-over)

1. Deploy with `GST_ENABLED=false` and check `/finance → Taxes` loads.
2. Set `GST_ENABLED=true` and `GST_CHARGE_FROM=<now>`, then restart. New checkouts add 18%.
3. Auto-renewing plans created **before** this still renew at the pre-tax price. Those renewals are invoiced with the
   taxes carved out of what was paid. To move them to ₹470.82, email the members, then update each subscription's
   Razorpay plan (`subscriptions.update({ plan_id, schedule_change_at: "cycle_end" })`).

## Back-fill: payments from 4 Oct 2026 until cut-over

These buyers paid the pre-tax price, so the 18% is **carved out** of what they paid (₹399 → ₹338.14 + ₹60.86 taxes)
and a tax invoice is issued for each.

**Deadline:** tax invoices are due within 30 days of the supply (CGST Rules r.47), so the 4 Oct payments must be
invoiced **by 3 Nov 2026**. October sales belong in the October GSTR-1, which is **due 11 Nov 2026**.

```bash
cd server
node scripts/gstGapReport.js            # dry run: prints totals, writes tax-gap-report-<date>.csv
node scripts/gstGapReport.js --issue    # after the CA has checked the CSV
node scripts/gstGapReport.js --issue --email   # …and email each buyer their tax invoice
```

The same report and an **Issue back-fill invoices** button (admin only, type `ISSUE` to confirm) are in
`/finance → Taxes`. Re-running is safe: payments that already have a tax invoice are skipped.

## Every month

1. `/finance → Taxes`, pick the month.
2. **Reconciliation** must show **0** payments without a tax document. "Paid before taxes switched on" rows mean the
   back-fill has not been run yet.
3. Download the GSTR-1 tables (b2b, b2cl, b2cs, exp, cdnr, cdnur, hsn, docs) and use the GSTR-3B figures. Everything
   is in INR. USD sales use the stored exchange rate; that rate is from open.er-api.com and is a TODO-CA to replace with
   the RBI reference rate.
4. Clear the **review queue**: sales whose place of supply had contradictory evidence.
5. After filing, **lock the month** (admin). Any later document is reported in the next open month.

## Refunds

- **Admin:** `/finance → Overview` (or Payments), then **Refund** on the payment. Full or partial; a reason is required.
  The money, taxes included, goes back; a credit note is issued and the ledger gets a reversal.
- **Consultations** (rejected or cancelled) refund automatically through the same path.
- **Refunds made in the Razorpay dashboard** are booked by the `refund.processed` webhook.
- **What users are promised** is the public [Refund & Cancellation Policy](/refund-policy)
  (`client/src/pages/RefundPolicy.jsx`). It only describes what the code does — change both together.

## Still for the CA

- **SAC codes** per product (`server/config/tax.js`, `PRODUCT_TAX`, marked TODO-CA).
- **The B2CL threshold** (`server/utils/tax/returns.js`).
- **Exchange rate source** for USD sales (Rule 34).
- **Refund of IGST paid on exports** (RFD-01; needs Razorpay e-FIRA per USD receipt).
- **Reverse charge or input tax credit on payouts** to writers and professionals (they can add a PAN / business tax ID).
- **TCS (s.52)** if a writer or professional is GST-registered, and **income-tax TDS** on payouts and prize winnings.

## Where the code lives

| Area | Files |
|---|---|
| Decisions and config | `server/config/tax.js` |
| Tax engine (pure, tested) | `server/utils/tax/engine.js` |
| Checkout pricing and stored quotes | `server/utils/tax/checkout.js`, `server/models/PaymentQuote.js` |
| Billing details | `server/utils/tax/billing.js`, `GET/PUT /api/users/billing-profile` |
| Tax invoices and credit notes | `server/utils/invoiceIssue.js`, `server/utils/tax/taxInvoicePdf.js`, `server/utils/tax/documentNumber.js` |
| Refunds | `server/utils/tax/refunds.js` |
| Back-fill | `server/utils/tax/gap.js`, `server/scripts/gstGapReport.js` |
| Returns | `server/utils/tax/returns.js`, `server/controllers/financeTaxController.js` |
| Webhook | `server/utils/razorpayWebhook.js` |
| Client | `client/src/utils/taxes.js`, `client/src/components/checkout/*`, `client/src/components/BillingInvoicesCard.jsx`, `client/src/pages/finance/*` |
