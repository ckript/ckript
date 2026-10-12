import { useCallback, useContext, useState } from "react";
import { razorpayKeyFromOrder } from "../utils/razorpayKey";
import { AuthContext } from "../context/AuthContext";
import { useAuthModal } from "../context/AuthModalContext";
import { useCurrency } from "../context/CurrencyContext";
import api from "../services/api";
import { mergeSessionUser, openRecurringPlanCheckout, recurringStateOf } from "../utils/planSubscriptionCheckout";
import {
  hasActiveFilmIndustryProfessionalAccess,
  isFilmIndustryProfessionalRole,
} from "../utils/industryAccess";

/* ─────────────────────────────────────────────────────────────
   Single source of truth for the ₹1999 / month "Film Industry
   Professional" membership checkout.

   This is the one place the Razorpay order → verify → session-update
   contract lives, so every surface that sells this plan — the Pricing
   modal's industry ribbon today, anything tomorrow — shares one flow and
   can never drift apart. Consumers own their own success / "already active"
   UX through the callbacks passed to startCheckout — the hook only owns the
   payment. (Its writer-plan sibling is useWriterPlanCheckout.)
   ───────────────────────────────────────────────────────────── */

const RAZORPAY_SDK_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/* Load the Razorpay SDK once and reuse it. Resolves false (never throws)
   when the script is blocked or the network is down, so callers can show a
   friendly message instead of crashing the page. */
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

export function useFilmIndustryProfessionalCheckout() {
  const { user, setUser, loading: authLoading } = useContext(AuthContext);
  const { currency } = useCurrency() || {};
  const { openAuthModal } = useAuthModal();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isEligibleRole = isFilmIndustryProfessionalRole(user);
  const hasAccess = hasActiveFilmIndustryProfessionalAccess(user) && (user?.subscription?.plan === "pro" || user?.subscription?.plan === "diamond");
  // Whether the active plan renews by itself (Razorpay Subscription) or lapses at expiry.
  const billing = recurringStateOf(user);

  const reset = useCallback(() => {
    setError("");
    setMessage("");
    setLoading(false);
  }, []);

  /* Kick off (or renew) the membership purchase.

       isRenew        – renewing an already-active plan vs. a fresh activation
       returnTo       – in-app path the backend should bounce the user to post-verify
       signInRedirect – where the auth modal lands a signed-out user after sign-in
       onSuccess      – called with the verify response once the session is updated
       onAlreadyActive– called when an active member taps "buy" instead of "renew"
       onRequireAuth  – called just before the auth modal opens for a signed-out
                        user, so a host modal can dismiss itself first (the auth
                        surface must not stack behind it)
  */
  const startCheckout = useCallback(
    async ({
      isRenew = false,
      cycle = "monthly",
      returnTo = "",
      signInRedirect = "/pricing",
      onSuccess,
      onAlreadyActive,
      onRequireAuth,
      billing = null,
      saveBilling = false,
    } = {}) => {
      setError("");
      setMessage("");

      if (authLoading) return;

      if (!user) {
        // Send the visitor through sign-in; they return to the canonical
        // pricing surface to complete the purchase.
        if (!isRenew) {
          if (typeof onRequireAuth === "function") onRequireAuth();
          openAuthModal({ redirect: signInRedirect });
        }
        return;
      }

      if (!isEligibleRole) {
        setError("Only film industry professionals can activate this plan.");
        return;
      }

      if (hasAccess && !isRenew) {
        if (typeof onAlreadyActive === "function") onAlreadyActive();
        return;
      }

      setLoading(true);

      try {
        const ready = await loadRazorpayScript();
        if (!ready) {
          setError("Razorpay SDK failed to load. Are you connected to the internet?");
          setLoading(false);
          return;
        }

        // Recurring first: a Razorpay Subscription that renews until cancelled. The one-time order
        // below is only the fallback for when the server can't take a mandate right now.
        const recurring = await openRecurringPlanCheckout({
          plan: "fip",
          accessTier: "film_industry_professional",
          cycle,
          currency: currency || "INR",
          user,
          returnTo,
          billing,
          saveBilling,
          onVerifying: () => setMessage("Verifying payment..."),
        });
        if (recurring.outcome === "dismissed") {
          setLoading(false);
          return;
        }
        if (recurring.outcome === "success") {
          mergeSessionUser(recurring.data?.user, setUser);
          setMessage(recurring.data?.message || "Payment successful!");
          if (typeof onSuccess === "function") onSuccess(recurring.data);
          return;
        }
        if (recurring.message) setMessage(recurring.message);

        const { data: orderData } = await api.post(
          "/payment/film-industry-professional/create-razorpay-order",
          { currency: currency || "INR", cycle, ...(billing ? { billing, saveBilling } : {}) }
        );

        const options = {
          key: razorpayKeyFromOrder(orderData),
          amount: orderData.amount,
          currency: orderData.currency,
          name: "Ckript",
          description: "Diamond Plan",
          order_id: orderData.orderId,
          handler: async (response) => {
            try {
              setMessage("Verifying payment...");
              const { data: verifyData } = await api.post(
                "/payment/film-industry-professional/verify-razorpay-payment",
                {
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  returnTo,
                  cycle,
                }
              );

              // Merge the refreshed subscription into the persisted session
              // without clobbering the auth token / expiry we already hold.
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
              setLoading(false);
            }
          },
          prefill: {
            name: user.name || "",
            email: user.email || "",
          },
          theme: {
            color: "#0f1320",
          },
          modal: {
            ondismiss: () => {
              setLoading(false);
            },
          },
        };

        const paymentObject = new window.Razorpay(options);
        paymentObject.open();
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to initiate payment.");
        setLoading(false);
      }
    },
    [authLoading, user, isEligibleRole, hasAccess, openAuthModal, setUser, currency]
  );

  return {
    user,
    authLoading,
    isEligibleRole,
    hasAccess,
    billing,
    loading,
    error,
    message,
    setError,
    setMessage,
    startCheckout,
    reset,
  };
}

export default useFilmIndustryProfessionalCheckout;
