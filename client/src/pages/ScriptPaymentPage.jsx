import { useContext, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AuthContext } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useDarkMode } from "../context/DarkModeContext";
import {
  CHECKOUT_STANDING,
  formatInr,
  purchaseFileName,
} from "./script-detail/checkout";
import {
  modificationLabel,
  negotiationLabel,
  paymentStructureLabel,
  rightsTypeLabel,
} from "./script-detail/scriptDealLabels";
import { useProjectCheckout } from "./script-detail/useProjectCheckout";
import { PROJECT_DETAIL_STATUS, useProjectDetail } from "./script-detail/useProjectDetail";
import { getScriptCanonicalPath } from "../utils/scriptPath";
import PriceBreakdown from "../components/checkout/PriceBreakdown";
import BillingSection from "../components/checkout/BillingSection";
import useBillingDetails from "../components/checkout/useBillingDetails";
import { payLabel } from "../utils/taxes";

/*
 * The desktop screenplay checkout.
 *
 * D30 moved everything this page KNOWS into `script-detail/checkout.js` (the requests, the
 * pricing, the standing, the acceptances, the gateway loader, the pending-charge record) and
 * everything it REMEMBERS into `script-detail/useProjectCheckout.js`, both of which the native
 * mobile screen at the same URL calls. What is left here is the desktop presentation of those
 * facts and nothing else.
 *
 * Three things this page used to do itself and no longer does:
 *   • its own copies of the four rights/deal enum maps — DEF-28's fourth copy, now the shared
 *     vocabulary in `scriptDealLabels.js`;
 *   • its own Razorpay SDK loader, which rejected where the other two copies in this client
 *     resolved false;
 *   • `window.confirm("Payment successful. Do you want to download your invoice now?")` — a
 *     blocking browser dialog fired 120ms after the success banner, over two buttons that were
 *     already on screen offering the same download.
 */
export default function ScriptPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { isDarkMode } = useDarkMode();
  const { currency } = useCurrency() || {};

  /*
   * The shared read layer, without its canonicalization: this URL is `/script/:id/pay`, which has
   * no heading/username form, and rewriting it would navigate the buyer off their own checkout.
   */
  const detail = useProjectDetail({ id, user, pathname: location.pathname });
  const script = detail.script;

  const [notice, setNotice] = useState("");

  const checkout = useProjectCheckout({
    script,
    user,
    currency,
    refresh: detail.refresh,
    notify: (message, tone) => setNotice(tone === "error" ? "" : message),
  });

  const scriptPath = useMemo(
    () => getScriptCanonicalPath(script || { _id: id }) || `/script/${id}`,
    [script, id],
  );

  const { standing, pricing, success } = checkout;
  // Billing details are asked for only while taxes are being charged (they address the tax invoice).
  const billingDetails = useBillingDetails();
  const askBilling = billingDetails.chargingEnabled && checkout.requiresPayment && standing.canPay && !success;
  const startPayment = () => {
    if (!askBilling) return checkout.pay();
    const prepared = billingDetails.prepare();
    return prepared ? checkout.pay(prepared) : false;
  };
  const rights = script?.rightsLicensing || {};
  const licenseMonths = Number(rights?.timeBound?.licenseDurationMonths || 0);
  const royaltyPercent = Number(rights?.royaltySettings?.percentage || 0);
  const customWriterTerms = checkout.customTerms;

  const takeDocument = async (kind) => {
    const blob = kind === "terms"
      ? await checkout.downloadAcceptedTerms()
      : await checkout.openInvoice({ download: kind === "invoice-download" });
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    if (kind === "invoice-open") {
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = kind === "terms"
      ? purchaseFileName(script?.title, "accepted_terms")
      : `${success?.invoiceNumber || "invoice"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const t = {
    page: isDarkMode ? "bg-[#070e1a]" : "bg-gray-50",
    card: isDarkMode ? "bg-[#0d1829] border-white/[0.08]" : "bg-white border-gray-200",
    title: isDarkMode ? "text-white" : "text-gray-900",
    sub: isDarkMode ? "text-gray-300" : "text-gray-600",
    muted: isDarkMode ? "text-gray-500" : "text-gray-500",
    row: isDarkMode ? "border-white/[0.08]" : "border-gray-200",
    inset: isDarkMode ? "bg-white/[0.03] border-white/[0.08]" : "bg-gray-50 border-gray-200",
    btnPrimary: "bg-[#1e3a5f] hover:bg-[#254a75] text-white",
    btnSecondary: isDarkMode
      ? "bg-white/[0.05] border-white/[0.08] text-white hover:bg-white/[0.1]"
      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50",
  };

  if (detail.status === PROJECT_DETAIL_STATUS.LOADING) {
    return (
      <div className={`min-h-[60vh] flex items-center justify-center ${t.page}`}>
        <div className={`w-10 h-10 border-2 rounded-full animate-spin ${isDarkMode ? "border-white/15 border-t-white/70" : "border-gray-200 border-t-gray-600"}`} />
      </div>
    );
  }

  if (detail.status !== PROJECT_DETAIL_STATUS.READY || !script) {
    return (
      <div className={`min-h-screen ${t.page}`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className={`rounded-2xl border p-6 ${t.card}`}>
            <h1 className={`text-xl font-bold mb-2 ${t.title}`}>Payment Page Unavailable</h1>
            <p className={t.sub}>{detail.failure?.message || "Script not found."}</p>
            <button
              type="button"
              onClick={() => navigate(scriptPath)}
              className={`mt-5 px-4 py-2 rounded-xl text-sm font-semibold border transition ${t.btnSecondary}`}
            >
              Back to Script
            </button>
          </div>
        </div>
      </div>
    );
  }

  const acceptanceRow = (key, label) => (
    <label className={`flex items-start gap-2.5 text-sm ${t.sub}`}>
      <input
        type="checkbox"
        checked={Boolean(checkout.acceptances[key])}
        onChange={(event) => checkout.setAcceptance(key, event.target.checked)}
        className="mt-0.5"
      />
      <span>{label}</span>
    </label>
  );

  return (
    <div className={`min-h-screen ${t.page}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-7 sm:py-10">
        <button
          type="button"
          onClick={() => navigate(scriptPath)}
          className={`inline-flex items-center gap-2 text-sm mb-5 ${t.muted} ${isDarkMode ? "hover:text-white" : "hover:text-gray-700"}`}
        >
          <span aria-hidden="true">&#8592;</span>
          Back to Script
        </button>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className={`rounded-2xl border p-5 sm:p-7 ${t.card}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <p className={`text-xs font-bold uppercase tracking-[0.2em] mb-2 ${t.muted}`}>Investor Payment</p>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${t.title}`}>Pay for Script Access</h1>
              <p className={`text-sm mt-2 ${t.sub}`}>
                Complete payment to unlock full script content for {script.title}.
              </p>
            </div>
            <div className={`rounded-xl border px-4 py-3 min-w-[180px] ${t.inset}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${t.muted}`}>Writer</p>
              <p className={`text-sm font-semibold mt-1 ${t.title}`}>{script.creator?.name || "Unknown"}</p>
            </div>
          </div>

          {/* One standing, in the same words on both platforms. It replaces the three
              independently-computed banners this page used to render. */}
          <div
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              standing.id === CHECKOUT_STANDING.OWNED
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : standing.canPay
                ? "border-sky-300 bg-sky-50 text-sky-800"
                : "border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            <b>{standing.headline}.</b> {standing.note}
          </div>

          {checkout.pendingCharge && !success && (
            <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <b>A payment from this browser was never confirmed.</b>{" "}
              You were charged for this screenplay but the confirmation did not reach us. Nothing is
              charged twice.
              <button
                type="button"
                onClick={checkout.retryPendingCharge}
                className="ml-2 font-semibold underline"
              >
                {checkout.recovering ? "Confirming…" : "Confirm it now"}
              </button>
            </div>
          )}

          {(success || notice) && (
            <div className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success?.message || notice}
              {success?.invoiceNumber ? ` Invoice ${success.invoiceNumber} has been generated.` : ""}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={`rounded-xl border p-4 sm:p-5 ${t.inset}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${t.muted}`}>Payment Breakdown</p>
              <div className={`space-y-2.5 text-sm ${t.sub}`}>
                {checkout.breakdown ? (
                  // The server's own figures: script price, platform fee, Taxes (18%), total.
                  <PriceBreakdown breakdown={checkout.breakdown} dark={isDarkMode} />
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span>Script price</span>
                      <span className={`font-semibold ${t.title}`}>{formatInr(pricing.baseAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Platform fee ({pricing.platformFeePercent}%)</span>
                      <span className={`font-semibold ${t.title}`}>{formatInr(pricing.platformFeeAmount)}</span>
                    </div>
                    <div className={`flex items-center justify-between gap-3 pt-2 border-t ${t.row}`}>
                      <span className={`font-bold ${t.title}`}>Total Payable</span>
                      <span className={`text-lg font-extrabold ${t.title}`}>{formatInr(pricing.totalAmount)}</span>
                    </div>
                  </>
                )}
                <p className={`text-xs pt-1 ${t.muted}`}>
                  The writer receives the full script price. The platform fee{checkout.breakdown?.taxMinor > 0 ? " and taxes are" : " is"} paid by the buyer on top.
                </p>
                {askBilling && <BillingSection details={billingDetails} dark={isDarkMode} />}
                {/* The 72-hour window the server enforces twice and this page never used to state. */}
                {standing.window?.note && (
                  <p className={`text-xs font-semibold pt-1 ${t.sub}`}>{standing.window.note}</p>
                )}
              </div>
            </div>

            <div className={`rounded-xl border p-4 sm:p-5 ${t.inset}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${t.muted}`}>Terms &amp; Conditions</p>
              <div className="space-y-3.5 text-sm">
                <div className={`rounded-lg border p-3 ${isDarkMode ? "border-white/[0.1] bg-white/[0.02]" : "border-gray-200 bg-white"}`}>
                  <p className={`font-semibold mb-1.5 ${t.title}`}>Rights &amp; Licensing Summary</p>
                  <div className={`space-y-1.5 text-xs ${t.sub}`}>
                    <p><span className="font-semibold">Rights Type:</span> {rightsTypeLabel(rights?.rightsType)}</p>
                    <p><span className="font-semibold">Modification Rights:</span> {modificationLabel(rights?.modificationRights)}</p>
                    <p><span className="font-semibold">Payment Structure:</span> {paymentStructureLabel(rights?.paymentStructure)}</p>
                    <p><span className="font-semibold">Negotiation:</span> {negotiationLabel(rights?.negotiationMode)}</p>
                    <p>
                      <span className="font-semibold">License Duration:</span>{" "}
                      {rights?.rightsType === "exclusive_license"
                        ? (licenseMonths ? `${licenseMonths} months` : "Time-bound")
                        : "Not time-bound"}
                    </p>
                    {royaltyPercent > 0 && (
                      <p><span className="font-semibold">Royalty:</span> {royaltyPercent}%</p>
                    )}
                  </div>
                  <p className="mt-2 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                    EXCLUSIVE RIGHTS ENFORCEMENT: once this agreement is settled, parallel buyer sales are blocked.
                  </p>
                </div>

                <div className={`rounded-lg border p-3 ${isDarkMode ? "border-white/[0.1] bg-white/[0.02]" : "border-gray-200 bg-white"}`}>
                  <p className={`font-semibold mb-1.5 ${t.title}`}>Platform Terms &amp; Conditions</p>
                  <p className={t.sub}>
                    Platform usage, payment rules, and dispute handling apply to this transaction.
                  </p>
                  <Link to="/terms-of-service" target="_blank" rel="noreferrer" className={`inline-block mt-2 hover:underline font-semibold ${isDarkMode ? "text-blue-300" : "text-[#1e3a5f]"}`}>
                    Read Platform Terms
                  </Link>
                </div>

                <div className={`rounded-lg border p-3 ${isDarkMode ? "border-white/[0.1] bg-white/[0.02]" : "border-gray-200 bg-white"}`}>
                  <p className={`font-semibold mb-1.5 ${t.title}`}>Writer Terms &amp; Conditions</p>
                  <p className={t.sub}>
                    Rights transfer and writer obligations for approved script access requests apply.
                  </p>
                  <Link to="/terms-conditions?tab=writer" target="_blank" rel="noreferrer" className={`inline-block mt-2 hover:underline font-semibold ${isDarkMode ? "text-blue-300" : "text-[#1e3a5f]"}`}>
                    Read Writer Terms
                  </Link>
                </div>

                {customWriterTerms && (
                  <div className={`rounded-lg border p-3 ${isDarkMode ? "border-white/[0.1] bg-white/[0.02]" : "border-gray-200 bg-white"}`}>
                    <p className={`font-semibold mb-1.5 ${t.title}`}>Writer Custom Terms</p>
                    <p className={`text-xs whitespace-pre-wrap leading-relaxed ${t.sub}`}>{customWriterTerms}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`mt-5 rounded-xl border p-4 ${t.inset}`}>
            <div className="space-y-2.5">
              {acceptanceRow("platform", "I agree to the Platform Terms & Conditions.")}
              {acceptanceRow("writer", "I agree to the Writer Terms & Conditions.")}
              {acceptanceRow("rights", "I have reviewed and accept the writer-defined rights and licensing summary.")}
              {customWriterTerms && acceptanceRow("custom", "I agree to the writer custom terms shown above.")}
            </div>

            {checkout.error && (
              <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {checkout.error}
              </div>
            )}

            {/* The refused reason is TEXT, in DOM order before the control, and the control stays
                pressable: pressing it with a box unticked is how a buyer finds out which box. */}
            {standing.canPay && checkout.missingAcceptance && (
              <p className={`mt-3 text-sm ${t.sub}`}>{checkout.missingAcceptance}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {standing.canPay && !success && (
                <button
                  type="button"
                  onClick={startPayment}
                  aria-busy={checkout.processing || undefined}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${t.btnPrimary}`}
                >
                  {checkout.processing
                    ? "Processing Payment..."
                    : checkout.requiresPayment
                    ? (checkout.breakdown ? payLabel(checkout.breakdown) : `Pay ${formatInr(pricing.totalAmount)}`)
                    : "Get Full Script (Free)"}
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate(scriptPath)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold border transition ${t.btnSecondary}`}
              >
                {success ? "View Script" : "Cancel"}
              </button>

              {success?.invoice?._id && (
                <>
                  <button
                    type="button"
                    onClick={() => takeDocument("invoice-download")}
                    aria-busy={checkout.documentBusy === "invoice-download" || undefined}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold border transition ${t.btnSecondary}`}
                  >
                    {checkout.documentBusy === "invoice-download" ? "Preparing Invoice..." : "Download Invoice"}
                  </button>
                  <button
                    type="button"
                    onClick={() => takeDocument("invoice-open")}
                    aria-busy={checkout.documentBusy === "invoice-open" || undefined}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold border transition ${t.btnSecondary}`}
                  >
                    Open Invoice
                  </button>
                </>
              )}

              {success?.purchaseRequestId && (
                <button
                  type="button"
                  onClick={() => takeDocument("terms")}
                  aria-busy={checkout.documentBusy === "terms" || undefined}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold border transition ${t.btnSecondary}`}
                >
                  Download Accepted Terms PDF
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
