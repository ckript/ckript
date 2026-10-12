import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  challengeRegistrationMode,
  createChallengeRegistrationOrder,
  emptyChallengeRegistration,
  fetchChallengeRegistrationQuote,
  emptyExternalRegistration,
  fetchRegistrationInvoice,
  forgetChallengeRegistrationPayment,
  loadChallengeRazorpaySdk,
  loadExternalRegistration,
  readChallengeRegistrationPayment,
  reconcileChallengeRegistrationPayment,
  registerForFreeChallenge,
  registrationPayload,
  rememberChallengeRegistrationPayment,
  submitExternalRegistration,
  validateChallengeRegistration,
  validateExternalRegistration,
  verifyChallengeRegistrationPayment,
} from "./challengeRegistration";
import { fetchTaxConfig } from "../../utils/taxes";

const userIdOf = (user) => String(user?._id || user?.id || user?.sid || "");

export default function useChallengeRegistration({ competition = null, user = null, enabled = true, onComplete = null } = {}) {
  const competitionId = String(competition?._id || "");
  const userId = userIdOf(user);
  const paid = challengeRegistrationMode(competition) === "paid";
  const [form, setForm] = useState(emptyChallengeRegistration);
  const [acceptRules, setAcceptRules] = useState(false);
  const [acceptCopyright, setAcceptCopyright] = useState(false);
  const [currency, setCurrency] = useState(() => String(user?.preferredCurrency || "INR").toUpperCase() === "USD" ? "USD" : "INR");
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [gatewayReady, setGatewayReady] = useState(false);
  const [gatewayBlocked, setGatewayBlocked] = useState(false);
  const [success, setSuccess] = useState(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [pendingNonce, setPendingNonce] = useState(0);
  /* The server's price for the entry, taxes included, while taxes are being charged. */
  const [breakdown, setBreakdown] = useState(null);

  const [externalLoading, setExternalLoading] = useState(false);
  const [externalRequest, setExternalRequest] = useState(null);
  const [externalFields, setExternalFields] = useState(emptyExternalRegistration);
  const [externalScreenshot, setExternalScreenshot] = useState(null);
  const [externalError, setExternalError] = useState("");
  const [externalSubmitting, setExternalSubmitting] = useState(false);

  const mounted = useRef(true);
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const commit = useCallback((fn) => { if (mounted.current) fn(); }, []);

  useEffect(() => {
    if (!enabled || !competitionId || !paid) return undefined;
    let alive = true;
    fetchTaxConfig()
      .then((config) => (config?.chargingEnabled
        ? fetchChallengeRegistrationQuote({ competitionId, currency, country: form.country })
        : null))
      .then((result) => { if (alive && mounted.current) setBreakdown(result?.ok ? result.data?.breakdown || null : null); });
    return () => { alive = false; };
  }, [enabled, competitionId, paid, currency, form.country]);

  const pendingPayment = useMemo(
    () => (enabled && competitionId && userId ? readChallengeRegistrationPayment({ competitionId, userId }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [competitionId, enabled, pendingNonce, userId],
  );

  const applyComplete = useCallback(async (data) => {
    forgetChallengeRegistrationPayment({ competitionId, userId });
    commit(() => {
      setPendingNonce((value) => value + 1);
      setSuccess(data);
      setServerError("");
      setProcessing(false);
      setRecovering(false);
    });
    await completeRef.current?.(data);
    return true;
  }, [commit, competitionId, userId]);

  useEffect(() => {
    if (!enabled || !competitionId || !paid || success) return undefined;
    let cancelled = false;
    loadChallengeRazorpaySdk().then((ready) => {
      if (cancelled) return;
      commit(() => {
        setGatewayReady(ready);
        setGatewayBlocked(!ready);
      });
    });
    return () => { cancelled = true; };
  }, [commit, competitionId, enabled, paid, success]);

  useEffect(() => {
    if (!enabled || !competitionId) return undefined;
    const controller = new AbortController();
    setExternalLoading(true);
    loadExternalRegistration({ competitionId, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      commit(() => {
        setExternalLoading(false);
        if (!result.ok) {
          setExternalError(result.message);
          return;
        }
        const request = result.data?.request || null;
        setExternalRequest(request);
        if (request) {
          setExternalFields({
            provider: request.provider || "",
            fullName: request.fullName || "",
            phone: request.phone || "",
            externalRef: request.externalRef || "",
          });
        }
      });
    });
    return () => controller.abort();
  }, [commit, competitionId, enabled]);

  const setField = useCallback((key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setServerError("");
  }, []);

  const setAcceptance = useCallback((key, value) => {
    if (key === "acceptRules") setAcceptRules(Boolean(value));
    if (key === "acceptCopyright") setAcceptCopyright(Boolean(value));
    setErrors((current) => ({ ...current, [key]: "" }));
    setServerError("");
  }, []);

  const validate = useCallback(() => {
    const result = validateChallengeRegistration({ form, acceptRules, acceptCopyright });
    setErrors(result.errors);
    return result;
  }, [acceptCopyright, acceptRules, form]);

  const recoverPayment = useCallback(async ({ payment = null } = {}) => {
    if (!enabled || !competitionId || recovering) return false;
    setRecovering(true);
    setServerError("");
    const result = payment
      ? await verifyChallengeRegistrationPayment({ competitionId, payment })
      : await reconcileChallengeRegistrationPayment({ competitionId });
    if (!result.ok) {
      commit(() => {
        setRecovering(false);
        setServerError(result.message);
      });
      return false;
    }
    return applyComplete(result.data);
  }, [applyComplete, commit, competitionId, enabled, recovering]);

  const autoRecovery = useRef("");
  useEffect(() => {
    const paymentId = pendingPayment?.payment?.razorpay_payment_id || "";
    if (!paymentId || success || recovering || autoRecovery.current === paymentId) return;
    autoRecovery.current = paymentId;
    recoverPayment({ payment: pendingPayment.payment });
  }, [pendingPayment, recoverPayment, recovering, success]);

  const submit = useCallback(async () => {
    if (!enabled || !competitionId || processing || success) return false;
    setServerError("");
    const validation = validate();
    if (!validation.ok) return false;
    const payload = registrationPayload({ form, acceptRules, acceptCopyright, currency });

    setProcessing(true);
    if (!paid) {
      const result = await registerForFreeChallenge({ competitionId, payload });
      if (!result.ok) {
        commit(() => { setProcessing(false); setServerError(result.message); });
        return false;
      }
      return applyComplete(result.data);
    }

    if (!window.Razorpay) {
      const ready = await loadChallengeRazorpaySdk();
      commit(() => { setGatewayReady(ready); setGatewayBlocked(!ready); });
      if (!ready) {
        commit(() => {
          setProcessing(false);
          setServerError("The payment provider could not load. Check your connection or blocker for checkout.razorpay.com, then try again.");
        });
        return false;
      }
    }

    const order = await createChallengeRegistrationOrder({ competitionId, payload });
    if (!order.ok) {
      commit(() => { setProcessing(false); setServerError(order.message); });
      return false;
    }
    if (order.data?.registrationComplete) return applyComplete(order.data);

    return new Promise((resolve) => {
      const checkout = new window.Razorpay({
        key: order.data.key,
        amount: order.data.amount,
        currency: order.data.currency,
        name: "CKRIPT",
        description: `Registration for ${competition?.name || "challenge"}`,
        order_id: order.data.orderId,
        handler: async (payment) => {
          rememberChallengeRegistrationPayment({ competitionId, userId, payment });
          commit(() => setPendingNonce((value) => value + 1));
          const verified = await verifyChallengeRegistrationPayment({ competitionId, payment });
          if (!verified.ok) {
            commit(() => {
              setProcessing(false);
              setServerError(`${verified.message} Your payment is saved on this device; use Confirm payment below or contact support with ${payment?.razorpay_payment_id || "the payment ID"}.`);
            });
            resolve(false);
            return;
          }
          await applyComplete(verified.data);
          resolve(true);
        },
        prefill: { name: user?.name || "", email: user?.email || "", contact: user?.phone || "" },
        theme: { color: "#8B1E1E" },
        confirm_close: true,
        modal: {
          ondismiss: () => {
            commit(() => setProcessing(false));
            resolve(false);
          },
        },
      });
      checkout.on?.("payment.failed", (response) => {
        const reason = response?.error?.description || "Payment was not completed. You can try again with the same order.";
        commit(() => { setProcessing(false); setServerError(reason); });
      });
      checkout.open();
    });
  }, [acceptCopyright, acceptRules, applyComplete, commit, competition?.name, competitionId, currency, enabled, form, paid, processing, success, user, userId, validate]);

  const submitExternal = useCallback(async () => {
    if (!enabled || !competitionId || externalSubmitting) return false;
    setExternalError("");
    const validation = validate();
    if (!validation.ok) return false;
    const externalFailure = validateExternalRegistration({ fields: externalFields, screenshot: externalScreenshot });
    if (externalFailure) {
      setExternalError(externalFailure);
      return false;
    }
    setExternalSubmitting(true);
    const result = await submitExternalRegistration({
      competitionId,
      fields: externalFields,
      registration: registrationPayload({ form, acceptRules, acceptCopyright }),
      screenshot: externalScreenshot,
    });
    commit(() => setExternalSubmitting(false));
    if (!result.ok) {
      commit(() => setExternalError(result.message));
      return false;
    }
    commit(() => {
      setExternalRequest(result.data?.request || null);
      setExternalScreenshot(null);
    });
    return true;
  }, [acceptCopyright, acceptRules, commit, competitionId, enabled, externalFields, externalScreenshot, externalSubmitting, form, validate]);

  const downloadInvoice = useCallback(async (invoice = success?.invoice) => {
    if (!invoice?._id || invoiceBusy) return { ok: false, message: "No invoice is available." };
    setInvoiceBusy(true);
    const result = await fetchRegistrationInvoice({ invoiceId: invoice._id });
    commit(() => setInvoiceBusy(false));
    return result;
  }, [commit, invoiceBusy, success?.invoice]);

  return {
    form,
    acceptRules,
    acceptCopyright,
    currency,
    breakdown,
    errors,
    serverError,
    processing,
    gatewayReady,
    gatewayBlocked,
    success,
    invoiceBusy,
    recovering,
    pendingPayment,
    setField,
    setAcceptance,
    setCurrency,
    setServerError,
    submit,
    recoverPayment,
    downloadInvoice,
    external: {
      loading: externalLoading,
      request: externalRequest,
      fields: externalFields,
      screenshot: externalScreenshot,
      error: externalError,
      submitting: externalSubmitting,
      setFields: setExternalFields,
      setScreenshot: setExternalScreenshot,
      setError: setExternalError,
      submit: submitExternal,
    },
  };
}
