import { useCallback, useContext, useMemo, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { useAuthModal } from "../context/AuthModalContext";
import { useCurrency } from "../context/CurrencyContext";
import api from "../services/api";
import { mergeSessionUser, openRecurringPlanCheckout, recurringStateOf } from "../utils/planSubscriptionCheckout";

/* ─────────────────────────────────────────────────────────────
   Single source of truth for the Writer's Business Model checkout
   (the ₹399 "Silver" and ₹699 "Gold" monthly plans).

   This mirrors useFilmIndustryProfessionalCheckout: the Razorpay
   order → verify → session-update contract lives in exactly one
   place, so every surface that sells writer plans — the Pricing
   modal today, anything tomorrow — shares the same flow and can
   never drift apart. Consumers own their success / "already active"
   UX through the callbacks; the hook only owns the payment + the
   account-state derivations that decide which button to show.
   ───────────────────────────────────────────────────────────── */

const RAZORPAY_SDK_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/* The tiers this hook can purchase, with the per-tier upload quota so a
   caller can render usage without re-encoding the business rules. */
export const WRITER_TIERS = {
  silver: { tier: "silver", accessTier: "writer_silver", quota: 8, price: 399, label: "Silver" },
  gold: { tier: "gold", accessTier: "writer_gold", quota: 20, price: 699, label: "Gold" },
};

export const WRITER_ROLES = ["writer", "creator"];

export const isWriterRole = (user) =>
  WRITER_ROLES.includes(String(user?.role || "").trim().toLowerCase());

/* Load the Razorpay SDK once and reuse it. Resolves false (never throws)
   when blocked or offline, so callers show a friendly message instead of
   crashing. Shares the same `data-razorpay-sdk` script the FIP hook uses. */
const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector('script[data-razorpay-sdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SDK_SRC;
    script.async = true;
    script.setAttribute("data-razorpay-sdk", "true");
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const isActiveTier = (user, accessTier) => {
  const sub = user?.subscription || {};
  if (String(sub.accessTier || "").trim().toLowerCase() !== accessTier) return false;
  if (String(sub.accessStatus || "").trim().toLowerCase() !== "active") return false;
  const expiry = sub.accessExpiresAt || sub.expiresAt;
  if (!expiry) return true;
  const t = new Date(expiry).getTime();
  return Number.isFinite(t) && t > Date.now();
};

const daysLeftFrom = (expiresAt) => {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

export function useWriterPlanCheckout() {
  const { user, setUser, loading: authLoading } = useContext(AuthContext);
  const { currency } = useCurrency() || {};
  const { openAuthModal } = useAuthModal();

  // `loading` carries which tier is mid-flight ("silver" | "gold" | "") so a
  // caller can show a spinner on the exact button that was pressed.
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isWriter = isWriterRole(user);
  const hasSilverAccess = useMemo(() => isActiveTier(user, "writer_silver"), [user]);
  const hasGoldAccess = useMemo(() => isActiveTier(user, "writer_gold"), [user]);
  const daysLeft = useMemo(() => daysLeftFrom(user?.subscription?.accessExpiresAt), [user]);
  // Whether the active plan renews by itself (Razorpay Subscription) or lapses at expiry.
  const billing = useMemo(() => recurringStateOf(user), [user]);

  const reset = useCallback(() => {
    setError("");
    setMessage("");
    setLoading("");
  }, []);

  /* Kick off (or renew) a writer plan purchase.

       tier          – "silver" | "gold"
       isRenew       – renewing an active plan vs. a fresh activation
       signInRedirect– where the auth modal lands a signed-out user
       onSuccess     – called with the verify response once the session updates
       onRequireAuth – called just before the auth modal opens for a signed-out
                       user, so a host modal can dismiss itself first
  */
  const startCheckout = useCallback(
    async ({ tier, isRenew = false, cycle = "monthly", signInRedirect = "/pricing", onSuccess, onRequireAuth, billing = null, saveBilling = false } = {}) => {
      const plan = WRITER_TIERS[tier];
      setError("");
      setMessage("");

      if (!plan) {
        setError("Unknown plan selected.");
        return;
      }
      if (authLoading) return;

      if (!user) {
        if (typeof onRequireAuth === "function") onRequireAuth();
        openAuthModal({ redirect: signInRedirect });
        return;
      }

      if (!isWriterRole(user)) {
        setError("Writer plans are available to writer and creator accounts only.");
        return;
      }

      setLoading(tier);

      try {
        const ready = await loadRazorpayScript();
        if (!ready) {
          setError("Razorpay SDK failed to load. Are you connected to the internet?");
          setLoading("");
          return;
        }

        // Recurring first: a Razorpay Subscription that renews until cancelled. The one-time order
        // below is only the fallback for when the server can't take a mandate right now.
        const recurring = await openRecurringPlanCheckout({
          plan: tier,
          accessTier: plan.accessTier,
          cycle,
          currency: currency || "INR",
          user,
          billing,
          saveBilling,
          onVerifying: () => setMessage("Verifying payment..."),
        });
        if (recurring.outcome === "dismissed") {
          setLoading("");
          return;
        }
        if (recurring.outcome === "success") {
          mergeSessionUser(recurring.data?.user, setUser);
          setMessage(recurring.data?.message || "Payment successful!");
          if (typeof onSuccess === "function") onSuccess(recurring.data);
          return;
        }
        if (recurring.message) setMessage(recurring.message);

        const { data: orderData } = await api.post("/payment/writer/create-razorpay-order", {
          tier,
          cycle,
          currency: currency || "INR",
          ...(billing ? { billing, saveBilling } : {}),
        });

        const options = {
          key: orderData.key,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Ckript",
          description: `${plan.label} Model Subscription`,
          order_id: orderData.orderId,
          handler: async (response) => {
            try {
              setMessage("Verifying payment...");
              const { data: verifyData } = await api.post("/payment/writer/verify-razorpay-payment", {
                tier,
                cycle,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              });

              // Merge refreshed subscription into the persisted session without
              // clobbering the auth token / expiry we already hold.
              const storedUser = JSON.parse(localStorage.getItem("user") || "null") || {};
              const updatedUser = {
                ...storedUser,
                ...(verifyData?.user || {}),
                token: storedUser.token,
                expiresAt: storedUser.expiresAt || verifyData?.user?.expiresAt,
              };
              setUser(updatedUser);
              localStorage.setItem("user", JSON.stringify(updatedUser));

              setMessage(isRenew ? "Plan renewed successfully!" : "Payment successful!");
              if (typeof onSuccess === "function") onSuccess(verifyData);
            } catch (verifyError) {
              setError(verifyError?.response?.data?.message || "Payment verification failed.");
              setLoading("");
            }
          },
          prefill: {
            name: user.name || "",
            email: user.email || "",
          },
          theme: { color: "#0f1320" },
          modal: {
            ondismiss: () => setLoading(""),
          },
        };

        const paymentObject = new window.Razorpay(options);
        paymentObject.open();
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to initiate payment.");
        setLoading("");
      }
    },
    [authLoading, user, openAuthModal, setUser, currency]
  );

  return {
    user,
    authLoading,
    isWriter,
    hasSilverAccess,
    hasGoldAccess,
    daysLeft,
    billing,
    loading, // "" | "silver" | "gold"
    error,
    message,
    setError,
    setMessage,
    startCheckout,
    reset,
  };
}

export default useWriterPlanCheckout;
