/*
 * useProjectCheckout — the state around the buyer's screenplay purchase (D30).
 *
 * `checkout.js` is what each step IS; this is what a screen has to REMEMBER while the buyer moves
 * through them: which boxes are ticked, whether the gateway script has loaded, whether a payment is
 * in flight, what the server last refused and why, what was unlocked, and — the one that matters —
 * whether there is a charge this browser took but never got verified.
 *
 * It is one hook and not three because the steps are not independent. Creating an order RECORDS the
 * acceptances; a dismissed sheet leaves that record standing, so the next attempt must not re-ask;
 * a verified payment changes the PROJECT (the caller's `refresh` re-reads it) and produces two
 * documents the buyer will want. A screen that wired those together itself would get the fan-out
 * subtly wrong on each platform, which is the mistake D28 and D29 removed from the read and write
 * halves of this same surface.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It never navigates, never renders, never opens a window and never raises a browser dialog. It
 * hands back blobs and lets each platform decide what a "download" means there — a desktop tab and
 * an anchor click, a phone's share sheet or its own viewer. A hook that reached for
 * `window.confirm` would be a hook only a desktop could use, and the old page had exactly one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assertAcceptances,
  confirmFreeAccess,
  createPurchaseOrder,
  fetchPurchaseQuote,
  fetchTaxConfigForCheckout,
  describeCheckoutStanding,
  describeOrderCharge,
  emptyAcceptances,
  fetchAcceptedTermsPdf,
  fetchInvoicePdf,
  forgetPendingCharge,
  loadRazorpaySdk,
  readCustomWriterTerms,
  readOrderPricing,
  readPendingCharge,
  rememberPendingCharge,
  verifyPurchase,
} from "./checkout";
import { getViewerCapabilities } from "./scriptDetailModel";

const noop = () => {};

/** The gateway sheet's own branding, kept in one place so both platforms open the same one. */
export const RAZORPAY_THEME_COLOR = "#1e3a5f";

export function useProjectCheckout({
  script = null,
  user = null,
  /** The buyer's display/charge currency, from `CurrencyContext`. Empty lets the server decide. */
  currency = "",
  /** `useProjectDetail().refresh` — re-reads the project in place after an unlock. */
  refresh = null,
  /** How this platform tells the viewer what happened: (message, "success" | "error") => void. */
  notify = noop,
  enabled = true,
} = {}) {
  const scriptId = String(script?._id || "");
  const viewerId = String(user?._id || user?.id || "");

  const [acceptances, setAcceptances] = useState(emptyAcceptances);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [gatewayReady, setGatewayReady] = useState(false);
  const [gatewayBlocked, setGatewayBlocked] = useState(false);
  const [success, setSuccess] = useState(null);
  /* What the gateway was actually asked to charge, once an order exists (DEF-31). */
  const [lastCharge, setLastCharge] = useState(null);
  /* The server's own pricing, which replaces this client's estimate the moment an order exists. */
  const [orderPricing, setOrderPricing] = useState(null);
  /* The server's breakdown — price, platform fee, Taxes (18%), total — which is what the screen shows
     and what the pay button states. The client never computes tax. */
  const [breakdown, setBreakdown] = useState(null);
  const [documentBusy, setDocumentBusy] = useState("");
  const [recovering, setRecovering] = useState(false);
  /*
   * The pending charge is READ, not stored twice.
   *
   * `localStorage` is the record; a copy of it in React state would be a second answer to "is
   * there a charge owing a verification", and the two would disagree the moment a write happened
   * outside a render (which is exactly when this record is written — inside the gateway's
   * callback). The nonce is what re-reads it after a write.
   */
  const [chargeNonce, setChargeNonce] = useState(0);

  const refreshRef = useRef(refresh);
  const notifyRef = useRef(notify);
  useEffect(() => {
    refreshRef.current = refresh;
    notifyRef.current = notify;
  });

  /*
   * The screen may unmount while the gateway sheet is open — a back gesture on a phone does exactly
   * that. The verify request still has to be made, and its RESULT still has to be recorded, but the
   * setState calls that follow must not run against a dead tree. This ref is what makes "finish the
   * request, skip the render" expressible.
   */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const commit = useCallback((apply) => { if (mountedRef.current) apply(); }, []);

  const announce = useCallback((message, tone = "success") => {
    if (message) notifyRef.current?.(message, tone);
  }, []);

  const capabilities = useMemo(
    () => getViewerCapabilities({ script: script || {}, user: user || {} }),
    [script, user],
  );
  const standing = useMemo(
    () => describeCheckoutStanding({ script, capabilities }),
    [script, capabilities],
  );
  const pendingCharge = useMemo(
    () => (enabled && scriptId ? readPendingCharge({ scriptId, userId: viewerId }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, scriptId, viewerId, chargeNonce],
  );
  const rereadPendingCharge = useCallback(() => setChargeNonce((value) => value + 1), []);

  const customTerms = readCustomWriterTerms(script || {});
  const requiresPayment = standing.pricing.totalAmount > 0;

  useEffect(() => {
    if (!enabled || !requiresPayment || !standing.canPay || !scriptId) return undefined;
    let alive = true;
    // Only while taxes are being charged: with them off the estimate above is already exact.
    fetchTaxConfigForCheckout()
      .then((config) => (config?.chargingEnabled ? fetchPurchaseQuote({ scriptId, currency }) : null))
      .then((b) => { if (alive && mountedRef.current && b) setBreakdown(b); });
    return () => { alive = false; };
  }, [enabled, requiresPayment, standing.canPay, scriptId, currency]);

  /*
   * Load the gateway as soon as it is known to be needed, not when the button is pressed.
   *
   * On a phone this script is ~100 KB over whatever connection the buyer has; fetching it at press
   * time is a second of nothing happening after the one tap that matters most on this screen. A
   * free unlock never loads it at all.
   */
  useEffect(() => {
    if (!enabled || !requiresPayment || !standing.canPay) return undefined;
    let cancelled = false;
    (async () => {
      const ready = await loadRazorpaySdk();
      if (cancelled) return;
      commit(() => {
        setGatewayReady(ready);
        setGatewayBlocked(!ready);
      });
    })();
    return () => { cancelled = true; };
  }, [enabled, requiresPayment, standing.canPay, commit]);

  const setAcceptance = useCallback((key, value) => {
    setAcceptances((current) => ({ ...current, [key]: Boolean(value) }));
    setError("");
  }, []);

  /* ── A verified payment, wherever it came from ────────────────────────────── */

  const applyVerified = useCallback(async (data, { charged = true } = {}) => {
    const invoice = data?.invoice || null;
    forgetPendingCharge();
    commit(() => {
      rereadPendingCharge();
      setSuccess({
        message: data?.message
          || (charged ? "Payment confirmed. The full screenplay is unlocked." : "Access confirmed. The full screenplay is unlocked."),
        invoice,
        invoiceNumber: invoice?.invoiceNumber || "",
        purchaseRequestId: data?.purchaseRequest?.id || data?.purchaseRequestId || "",
      });
      setError("");
    });
    announce(charged ? "Payment complete. The screenplay is unlocked." : "The screenplay is unlocked.", "success");
    await refreshRef.current?.();
  }, [announce, commit, rereadPendingCharge]);

  /* ── The charge this browser owes a verification for ──────────────────────── */

  const retryPendingCharge = useCallback(async () => {
    const record = readPendingCharge({ scriptId, userId: viewerId });
    if (!record) {
      commit(rereadPendingCharge);
      return false;
    }
    commit(() => { setRecovering(true); setError(""); });
    const result = await verifyPurchase({ scriptId: record.scriptId, payment: record.payment });
    if (!result.ok) {
      commit(() => {
        setRecovering(false);
        setError(result.message);
      });
      return false;
    }
    await applyVerified(result.data, { charged: true });
    commit(() => setRecovering(false));
    return true;
  }, [scriptId, viewerId, applyVerified, commit, rereadPendingCharge]);

  /*
   * Retry it once, automatically, on the way in.
   *
   * The buyer did not do anything wrong and should not have to press a button labelled "finish the
   * payment you already made". If the retry succeeds they simply arrive on the unlocked screen; if
   * it fails, `pendingCharge` is still set and the screen says so with a manual retry.
   */
  const autoRetriedRef = useRef("");
  useEffect(() => {
    if (!enabled || !pendingCharge || success || recovering) return;
    if (autoRetriedRef.current === pendingCharge.payment.razorpay_payment_id) return;
    autoRetriedRef.current = pendingCharge.payment.razorpay_payment_id;
    retryPendingCharge();
  }, [enabled, pendingCharge, success, recovering, retryPendingCharge]);

  /* ── Pay ──────────────────────────────────────────────────────────────────── */

  // `billing` / `saveBilling` come from the billing-details section when taxes are being charged. A
  // click event passed straight in carries neither, which is the taxes-off path.
  const pay = useCallback(async ({ billing = null, saveBilling = false } = {}) => {
    if (!scriptId || processing || !standing.canPay) return false;

    setError("");
    setProcessing(true);

    const finish = (message = "") => {
      commit(() => {
        setProcessing(false);
        if (message) setError(message);
      });
      return false;
    };

    /*
     * The acceptances are checked BEFORE anything expensive happens.
     *
     * This is what lets both screens keep the pay control live instead of disabling it: pressing it
     * with a box unticked produces the sentence that says which box, which a `disabled` attribute
     * cannot do — it removes the control from the tab order and takes its `aria-describedby` with
     * it. The same reasoning as the wizard footer's refusal text, one step further.
     */
    const missing = assertAcceptances({ acceptances, script: script || {} });
    if (missing) return finish(missing);

    if (requiresPayment && !window.Razorpay) {
      const ready = await loadRazorpaySdk();
      commit(() => { setGatewayReady(ready); setGatewayBlocked(!ready); });
      if (!ready) {
        return finish("The payment gateway could not load. Check your connection or any blocker for checkout.razorpay.com, then try again.");
      }
    }

    const order = await createPurchaseOrder({ scriptId, acceptances, script: script || {}, currency, billing, saveBilling });
    if (!order.ok) {
      // A 409/410 here means the standing on screen is out of date — someone else bought it, or
      // the window closed while this page was open. Re-reading the project is what corrects the
      // screen; repeating the request would only produce the same refusal.
      if (order.status === 409 || order.status === 410) await refreshRef.current?.();
      return finish(order.message);
    }

    if (order.data?.noPaymentRequired) {
      const confirmed = await confirmFreeAccess({ scriptId });
      if (!confirmed.ok) return finish(confirmed.message);
      await applyVerified(confirmed.data, { charged: false });
      commit(() => setProcessing(false));
      return true;
    }

    // Stated before the sheet opens, so the screen can name the currency the gateway will use
    // rather than the one this client estimated (DEF-31), and so the breakdown switches from our
    // arithmetic to the server's the moment the server has done it.
    commit(() => {
      setLastCharge(describeOrderCharge(order.data));
      setOrderPricing(readOrderPricing(order.data, standing.pricing.baseAmount));
      if (order.data?.breakdown) setBreakdown(order.data.breakdown);
    });

    return new Promise((resolve) => {
      const options = {
        key: order.data.keyId,
        amount: order.data.amount,
        currency: order.data.currency,
        name: "Ckript",
        description: `Screenplay purchase: ${script?.title || "project"}`,
        order_id: order.data.orderId,
        handler: async (response) => {
          /*
           * The money has moved by the time this runs. Write the payment down BEFORE asking the
           * server about it, so a verification that never arrives is recoverable (DEF-32).
           */
          rememberPendingCharge({
            scriptId,
            userId: viewerId,
            title: script?.title || "",
            payment: response,
          });
          /*
           * This attempt IS the first verification of that charge, so it counts as the one
           * automatic retry. Without this the recovery effect below would see a fresh pending
           * charge, fire its own verify against the same failure, and replace the sentence that
           * tells the buyer their money was taken with a bare "Payment verification failed."
           */
          autoRetriedRef.current = response?.razorpay_payment_id || "";
          commit(rereadPendingCharge);

          const verified = await verifyPurchase({ scriptId, payment: response });
          if (!verified.ok) {
            commit(() => {
              setProcessing(false);
              setError(`${verified.message} Your payment was taken and is saved on this device — reopen this page to finish unlocking, or contact support with payment ${response?.razorpay_payment_id || ""}.`);
            });
            resolve(false);
            return;
          }
          await applyVerified(verified.data, { charged: true });
          commit(() => setProcessing(false));
          resolve(true);
        },
        prefill: { name: user?.name || "", email: user?.email || "", contact: user?.phone || "" },
        theme: { color: RAZORPAY_THEME_COLOR },
        modal: {
          // Dismissing the sheet is not a failure and gets no error line: the acceptances are
          // already recorded on the server, so the buyer can simply press pay again.
          ondismiss: () => {
            commit(() => setProcessing(false));
            resolve(false);
          },
        },
      };

      try {
        new window.Razorpay(options).open();
      } catch {
        finish("The payment sheet could not be opened. Try again.");
        resolve(false);
      }
    });
  }, [
    scriptId, processing, standing.canPay, requiresPayment, acceptances, script,
    currency, user, viewerId, applyVerified, commit, standing.pricing.baseAmount,
    rereadPendingCharge,
  ]);

  /* What is still unticked, as the sentence a press would produce. "" once the form is ready. */
  const missingAcceptance = useMemo(
    () => assertAcceptances({ acceptances, script: script || {} }),
    [acceptances, script],
  );

  /* ── The two documents ────────────────────────────────────────────────────── */

  const openInvoice = useCallback(async ({ download = false } = {}) => {
    const invoiceId = success?.invoice?._id;
    commit(() => { setDocumentBusy(download ? "invoice-download" : "invoice-open"); setError(""); });
    const result = await fetchInvoicePdf({ invoiceId, download });
    commit(() => setDocumentBusy(""));
    if (!result.ok) {
      commit(() => setError(result.message));
      return null;
    }
    return result.data;
  }, [success, commit]);

  const downloadAcceptedTerms = useCallback(async () => {
    commit(() => { setDocumentBusy("terms"); setError(""); });
    const result = await fetchAcceptedTermsPdf({ purchaseRequestId: success?.purchaseRequestId });
    commit(() => setDocumentBusy(""));
    if (!result.ok) {
      commit(() => setError(result.message));
      return null;
    }
    return result.data;
  }, [success, commit]);

  return {
    capabilities,
    standing,
    pricing: orderPricing || standing.pricing,
    breakdown,
    paymentWindow: standing.window,
    customTerms,
    requiresPayment,

    acceptances,
    setAcceptance,
    missingAcceptance,

    processing,
    gatewayReady,
    gatewayBlocked,
    error,
    setError,
    success,
    lastCharge,

    pendingCharge,
    recovering,
    retryPendingCharge,

    documentBusy,
    openInvoice,
    downloadAcceptedTerms,

    pay,
  };
}
