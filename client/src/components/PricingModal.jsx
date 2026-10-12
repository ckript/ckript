import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import useWriterPlanCheckout, { WRITER_TIERS } from "../hooks/useWriterPlanCheckout";
import useFilmIndustryProfessionalCheckout from "../hooks/useFilmIndustryProfessionalCheckout";
import { useAuthModal } from "../context/AuthModalContext";
import { AuthContext } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useCurrency } from "../context/CurrencyContext";
import CurrencyToggle from "./CurrencyToggle";
import { getPlanPrice, WRITER_PLAN_KEY } from "../config/pricing";
import { formatSubunits, formatCurrency } from "../utils/currency";
import { formatBillingDate } from "../utils/planSubscriptionCheckout";
import { useTaxConfig } from "../utils/taxes";
import CheckoutStep from "./checkout/CheckoutStep";
import useScrollLock from "../hooks/useScrollLock";
import { useContext } from "react";
import api from "../services/api";
import "./PricingModal.css";

/* ─────────────────────────────────────────────────────────────
   Ckript — Pricing modal · Design E ("Writer trio + industry ribbon").

   Port of "Pricing Modal v3.dc.html" from the Claude Design handoff. One
   editorial surface for the whole pricing story — the Free / Silver / Gold
   writer tiers as a three-up grid, with the ₹1999 Film Industry Professional
   plan as a ribbon beneath. It is the canonical pricing surface: opened as an
   overlay from anywhere via useAuthModal().openPricingModal(), and rendered by
   the /pricing route for deep links / new-tab opens.

   It is a real, account-aware checkout, not a static card. Writer plans run
   through useWriterPlanCheckout; the industry ribbon through
   useFilmIndustryProfessionalCheckout. Both share one Razorpay contract, so the
   button you see always matches what the backend will do — signed-out, wrong
   role, already-active, mid-payment, error and success states all included.
   ───────────────────────────────────────────────────────────── */

const FONT_LINK_ID = "ckript-authmodal-fonts";
function ensureModalFonts() {
  if (typeof document === "undefined" || document.getElementById(FONT_LINK_ID)) return;
  const pre1 = document.createElement("link");
  pre1.rel = "preconnect";
  pre1.href = "https://fonts.googleapis.com";
  const pre2 = document.createElement("link");
  pre2.rel = "preconnect";
  pre2.href = "https://fonts.gstatic.com";
  pre2.crossOrigin = "anonymous";
  const sheet = document.createElement("link");
  sheet.id = FONT_LINK_ID;
  sheet.rel = "stylesheet";
  sheet.href =
    "https://fonts.googleapis.com/css2?family=Baskervville:ital@0;1&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap";
  document.head.append(pre1, pre2, sheet);
}

/* 1:1 with the design's copy. */
const WRITER_PLANS = [
  {
    key: "free",
    name: "Free",
    price: "₹0",
    per: "/ month",
    feats: [
      "Upload 5 scripts",
      "Appear only in search section"
    ],
  },
  {
    key: "silver",
    name: "Silver",
    price: "₹399",
    per: "/ month",
    feats: [
      "Upload 8 scripts",
      "Appear in top script sections",
      "AI generated synopsis, logline and Roles",
      "AI evaluation",
      "Generate AI Thumbnail",
      "View who see scripts/profile"
    ],
  },
  {
    key: "gold",
    name: "Gold",
    price: "₹699",
    per: "/ month",
    variant: "gold",
    chip: "Best",
    feats: [
      "Upload 20 scripts",
      "Use writer studio tool",
      "Appear in top script section",
      "Appear in featured section",
      "AI generated synopsis, logline and Roles",
      "AI evaluation",
      "Generate AI Thumbnail",
      "View who see scripts/profile",
      "Ckript professional reader evaluation",
      "Upload Pitch video of script"
    ],
  },
];

const FIP_PLANS = [
  {
    key: "free",
    name: "Free Tier",
    feats: [
      "Access writer profiles (Work email required)",
      "Read script preview pages (Work email required)",
      "Access 1 verified writer contact",
      "Personalized script discovery & curated genre feeds",
    ],
    price: "₹0",
  },
  {
    key: "pro",
    name: "Diamond Plan",
    feats: [
      "Everything in Free Tier, plus:",
      "Unrestricted script and profile access",
      "Access 10 verified writer contacts",
      "Direct message to 10 writers",
      "Schedule 10 video meetings with writers",
    ],
    price: "₹1999",
  },
];

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="1" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const Spinner = () => <span className="pmx-spinner" aria-hidden="true" />;

const FOCUSABLE =
  'a[href],button:not(:disabled),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/* ── A writer tier card ───────────────────────────────────────── */
/* The success screen for a plan checkout. A recurring checkout can end three ways: the first charge
   went through (active), auto-renew was added to time already paid for (scheduled — the first charge
   comes when that time runs out), or Razorpay is still confirming the first charge (activating). */
function successCopy(verifyData, { label, activeTitle, activeBody, redirectTo }) {
  const status = verifyData?.status;
  const sub = verifyData?.user?.subscription || {};
  if (status === "scheduled") {
    const ends = formatBillingDate(sub.accessExpiresAt || verifyData?.startsAt);
    return {
      kicker: "Auto-renew on",
      title: "You're set.",
      body: `Your ${label} continues${ends ? ` until ${ends}` : ""} and renews automatically after that. You won't be charged until then.`,
      redirectTo,
    };
  }
  if (status === "activating") {
    return {
      kicker: "Payment received",
      title: "Almost there.",
      body: `Your ${label} switches on as soon as Razorpay confirms the first charge — usually within a minute. You can carry on; it activates on its own.`,
      redirectTo,
    };
  }
  const renews = verifyData?.recurring?.autoRenew
    ? ` It renews automatically${verifyData?.recurring?.nextChargeAt ? ` on ${formatBillingDate(verifyData.recurring.nextChargeAt)}` : ""} — cancel anytime from Settings.`
    : "";
  return { kicker: "Access granted", title: activeTitle, body: `${activeBody}${renews}`, redirectTo };
}

function TierCard({ plan, state }) {
  const { variant, chip } = plan;
  const isGold = variant === "gold";
  const {
    active,
    daysLeft,
    quota,
    uploadedCount,
    primaryLabel,
    primaryKind,
    primaryDisabled,
    primaryLoading,
    primaryLock,
    onPrimary,
    renewNote,
    secondaryLabel,
    onSecondary,
    secondaryLoading,
    switchNote,
    daysUntilReset,
  } = state;

  const remaining = quota != null && uploadedCount != null ? Math.max(0, quota - uploadedCount) : null;
  const quotaFull = quota != null && uploadedCount != null && uploadedCount >= quota;

  return (
    <div className={`pmx-tier${isGold ? " pmx-tier--gold" : ""}`}>
      {isGold && <span className="pmx-tier-bar" />}

      <div className="pmx-tier-top">
        <span className="pmx-tier-name">{plan.name}</span>
        {active ? (
          <span className="pmx-pill pmx-pill--active"><i />Active</span>
        ) : chip ? (
          <span className="pmx-chip pmx-chip--best">{chip}</span>
        ) : null}
      </div>

      <div className="pmx-tier-price">
        {plan.originalPrice && (
          <s style={{ color: "var(--pmx-text-muted, #888)", fontSize: "0.85em", marginRight: "8px", fontWeight: "normal", opacity: 0.8 }}>
            {plan.originalPrice}
          </s>
        )}
        <b>{plan.price}</b>
        <span>{plan.per}</span>
      </div>
      {plan.billingNote && <div className="pmx-billing-note">{plan.billingNote}</div>}

      {active && (renewNote || daysLeft > 0) && (
        <div className="pmx-pills">
          <span className="pmx-pill pmx-pill--days">{renewNote || `${daysLeft} days left`}</span>
        </div>
      )}

      <div className="pmx-tier-divider" />

      <ul className="pmx-feats">
        {plan.feats.map((f) => (
          <li key={f}>
            <i />
            {f}
          </li>
        ))}
      </ul>

      {active && quota != null && uploadedCount != null && (
        <div className="pmx-quota">
          <div className="pmx-quota-row">
            <span>Scripts uploaded</span>
            <span>
              <b>{uploadedCount}</b> / {quota}
            </span>
          </div>
          <div className="pmx-quota-track">
            <div
              className={`pmx-quota-fill${quotaFull ? " pmx-quota-fill--full" : ""}`}
              style={{ width: `${Math.min(100, (uploadedCount / quota) * 100)}%` }}
            />
          </div>
          <div className="pmx-quota-row" style={{ marginTop: 5 }}>
            <span style={{ fontSize: "11px", color: "var(--pmx-text-muted, #888)" }}>
              {daysUntilReset != null ? `Resets in ${daysUntilReset} days` : ""}
            </span>
            <span>{remaining} more available this month</span>
          </div>
        </div>
      )}

      <div className="pmx-tier-actions">
        <button
          type="button"
          className={`pmx-btn pmx-btn--${primaryKind}`}
          onClick={onPrimary}
          disabled={primaryDisabled || primaryLoading}
        >
          {primaryLoading ? <Spinner /> : primaryLock ? <LockIcon /> : null}
          {primaryLabel}
        </button>
        {onSecondary && (
          <button type="button" className="pmx-btn pmx-btn--ghost" onClick={onSecondary} disabled={secondaryLoading}>
            {secondaryLoading ? "Working…" : secondaryLabel}
          </button>
        )}
        {switchNote && <p className="pmx-switch-note">{switchNote}</p>}
      </div>
    </div>
  );
}

function PricingModalInner({ onClose, tab = "all" }) {
  const { user } = useContext(AuthContext);
  const { currency = "INR" } = useCurrency() || {};
  const [isAnnual, setIsAnnual] = useState(false);

  // Prices come from the shared matrix, formatted in the active currency (free plan is 0 anywhere).
  const priceLabelFor = (key) => {
    if (key === "free") return formatCurrency(0, currency);
    const basePrice = getPlanPrice(WRITER_PLAN_KEY[key], currency);
    if (isAnnual) {
      const monthlyMajor = basePrice / 100;
      const annualMajor = Math.round(monthlyMajor * 12 * 0.85);
      return currency === "USD" ? `$${annualMajor}` : `₹${annualMajor}`;
    }
    return formatSubunits(basePrice, currency);
  };
  
  const getOriginalPrice = (key, currency) => {
    if (key === "silver") {
      if (isAnnual) return currency === "USD" ? "$60" : "₹4788";
      return currency === "USD" ? "$12" : "₹999";
    }
    if (key === "gold") {
      if (isAnnual) return currency === "USD" ? "$108" : "₹8388";
      return currency === "USD" ? "$25" : "₹2299";
    }
    return null;
  };

  // Paid plans are Razorpay Subscriptions: say so next to the price, not only in the terms.
  const billingNote = isAnnual ? "Billed yearly · renews until you cancel" : "Billed monthly · renews until you cancel";
  // Listed prices are PRE-TAX (₹399); taxes are added in the checkout step. The muted "+ taxes" hint is
  // off by the founder's call and switchable without a release (SHOW_PLUS_TAXES_HINT).
  const taxConfig = useTaxConfig();
  const plusTaxes = taxConfig?.showPlusTaxesHint ? " + taxes" : "";

  const pricedWriterPlans = WRITER_PLANS.map((p) => ({
    ...p,
    price: priceLabelFor(p.key),
    originalPrice: getOriginalPrice(p.key, currency),
    per: p.key === "free" ? p.per : `${isAnnual ? "/ year" : "/ month"}${plusTaxes}`,
    billingNote: p.key === "free" ? "" : billingNote,
  }));
  const getFipPriceLabel = () => {
    const basePrice = getPlanPrice("film_industry_professional", currency);
    if (isAnnual) {
      const monthlyMajor = basePrice / 100;
      const annualMajor = Math.round(monthlyMajor * 12 * 0.85);
      return currency === "USD" ? `$${annualMajor}` : `₹${annualMajor}`;
    }
    return formatSubunits(basePrice, currency);
  };
  const fipPriceLabel = getFipPriceLabel();

  const getFipOriginalPrice = () => {
    if (isAnnual) return currency === "USD" ? "$300" : "₹23988";
    return null;
  };
  const fipOriginalPrice = getFipOriginalPrice();

  let effectiveTab = tab;
  if (tab === "all" && user?.role) {
    const role = user.role.toLowerCase();
    if (["writer", "creator"].includes(role)) effectiveTab = "writer";
    else if (["producer", "investor", "director", "studio"].includes(role)) effectiveTab = "industry";
  }
  const navigate = useNavigate();
  const titleId = useId();
  const cardRef = useRef(null);
  const previouslyFocused = useRef(null);

  const writer = useWriterPlanCheckout();
  const fip = useFilmIndustryProfessionalCheckout();
  const { openAuthModal } = useAuthModal();
  const toast = useToast();

  // Unified success view: whichever plan was purchased, we land the new member
  // with one confident screen. null | { kicker, title, body, redirectTo }
  const [success, setSuccess] = useState(null);

  // The checkout step (billing details + Subtotal · Taxes · Total) for the plan being bought, shown
  // before the Razorpay sheet whenever taxes are being charged. null | { plan, isRenew }
  const [checkoutPlan, setCheckoutPlan] = useState(null);

  // Upload usage for active writers, to draw the quota meter (same source the
  // dashboard uses). Fetched lazily while the modal is open.
  const [uploadedCount, setUploadedCount] = useState(null);
  const [daysUntilReset, setDaysUntilReset] = useState(null);

  useEffect(() => {
    if (!writer.isWriter) return;
    let alive = true;
    (async () => {
      try {
        const res = await api.get("/scripts/mine");
        const all = Array.isArray(res.data) ? res.data : [];
        let mine = all.filter((s) => !s?.isCollaborator);

        let cycleStart = null;
        let cycleEnd = null;
        const activatedAt = writer.user?.subscription?.accessActivatedAt;
        const expiresAt = writer.user?.subscription?.accessExpiresAt;

        if (activatedAt && expiresAt) {
          const start = new Date(activatedAt);
          const end = new Date(expiresAt);
          const now = new Date();

          if (now <= end) {
            let current = new Date(start);
            while (current <= now) {
              current.setMonth(current.getMonth() + 1);
            }
            cycleEnd = current > end ? end : current;

            let previous = new Date(current);
            previous.setMonth(previous.getMonth() - 1);
            cycleStart = previous;

            const diffTime = cycleEnd.getTime() - now.getTime();
            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (alive) setDaysUntilReset(daysLeft > 0 ? daysLeft : 0);
          }
        }

        if (cycleStart) {
          mine = mine.filter((s) => new Date(s.createdAt) >= cycleStart);
        }

        if (alive) setUploadedCount(mine.length);
      } catch {
        /* non-fatal — the meter just won't render */
      }
    })();
    return () => {
      alive = false;
    };
  }, [writer.isWriter, writer.user?.subscription?.accessActivatedAt, writer.user?.subscription?.accessExpiresAt]);

  const busy = !success && (Boolean(writer.loading) || Boolean(fip.loading));

  const goTo = useCallback(
    (path) => {
      onClose();
      navigate(path || "/home");
    },
    [navigate, onClose]
  );

  // ── Writer plan checkout wiring ───────────────────────────────
  const runWriter = useCallback(
    (tier, isRenew = false, extra = {}) => {
      writer.startCheckout({
        ...extra,
        tier,
        isRenew,
        cycle: isAnnual ? "annual" : "monthly",
        signInRedirect: "/pricing",
        onRequireAuth: onClose, // never stack auth behind this modal
        onSuccess: (verifyData) =>
          setSuccess(
            successCopy(verifyData, {
              label: `${WRITER_TIERS[tier].label} plan`,
              activeTitle: "You're all set.",
              activeBody: `Your ${WRITER_TIERS[tier].label} plan is active. Upload more scripts and reach the top sections from your dashboard.`,
              redirectTo: "/dashboard",
            }),
          ),
      });
    },
    [writer, onClose, isAnnual]
  );

  // With taxes on, a signed-in writer goes through the checkout step first; otherwise straight to
  // payment, exactly as before (the hook still handles signed-out and wrong-role visitors).
  const buyWriter = useCallback(
    (tier, isRenew = false) => {
      if (taxConfig?.chargingEnabled && writer.user && writer.isWriter) {
        setCheckoutPlan({ plan: tier, isRenew });
        return;
      }
      runWriter(tier, isRenew);
    },
    [taxConfig, writer.user, writer.isWriter, runWriter]
  );

  // ── FIP checkout wiring ───────────────────────────────────────
  const runFip = useCallback(
    (isRenew = false, extra = {}) => {
      fip.startCheckout({
        ...extra,
        isRenew,
        cycle: isAnnual ? "annual" : "monthly",
        signInRedirect: "/pricing",
        onRequireAuth: onClose,
        onAlreadyActive: () => goTo("/home"),
        onSuccess: (verifyData) =>
          setSuccess(
            successCopy(verifyData, {
              label: "Diamond Plan",
              activeTitle: "You're in, Professional.",
              activeBody:
                "Your Diamond Plan membership is now active. Writer contacts, direct messaging and meetings are unlocked.",
              redirectTo: verifyData?.redirectTo || "/home",
            }),
          ),
      });
    },
    [fip, onClose, goTo, isAnnual]
  );

  const buyFip = useCallback(
    (isRenew = false) => {
      if (taxConfig?.chargingEnabled && fip.user && fip.isEligibleRole && (isRenew || !fip.hasAccess)) {
        setCheckoutPlan({ plan: "fip", isRenew });
        return;
      }
      runFip(isRenew);
    },
    [taxConfig, fip.user, fip.isEligibleRole, fip.hasAccess, runFip]
  );

  const checkoutLabel = checkoutPlan
    ? checkoutPlan.plan === "fip"
      ? "Diamond Plan"
      : `${WRITER_TIERS[checkoutPlan.plan]?.label || ""} plan`
    : "";

  // ── Per-tier button derivation ────────────────────────────────
  // The free tier needs no payment, so its signed-out path opens the auth modal
  // directly (the checkout hook is payment-only). Silver/Gold defer to the hook.
  const tierState = useCallback(
    (key) => {
      const signedOut = !writer.user;
      const wrongRole = Boolean(writer.user) && !writer.isWriter;
      // Don't let anyone act until we know who they are — mirrors the gating the
      // old /pricing page added before it became this modal.
      const checkingSession = writer.authLoading;

      if (key === "free") {
        const active = writer.isWriter && !writer.hasSilverAccess && !writer.hasGoldAccess;
        return {
          active,
          quota: null,
          primaryLabel: checkingSession ? "Checking session…" : signedOut ? "Start free" : "Go to dashboard",
          primaryKind: active ? "active" : "outline",
          primaryDisabled: checkingSession,
          primaryLoading: false,
          primaryLock: false,
          onPrimary: () => {
            if (signedOut) {
              onClose();
              openAuthModal({ redirect: "/dashboard" });
            } else {
              goTo("/dashboard");
            }
          },
        };
      }

      const meta = WRITER_TIERS[key]; // silver | gold
      const active = key === "silver" ? writer.hasSilverAccess : writer.hasGoldAccess;
      const loadingThis = writer.loading === key;

      if (active) {
        // A plan on a Razorpay Subscription renews by itself; anything else lapses at expiry and is
        // offered auto-renew (which starts when the paid time runs out — never a double charge).
        const renewing = writer.billing.autoRenew && writer.billing.accessTier === meta.accessTier;
        return {
          active: true,
          daysLeft: writer.daysLeft,
          renewNote: renewing
            ? `Renews ${formatBillingDate(writer.billing.nextChargeAt || writer.billing.accessExpiresAt)}`
            : writer.billing.accessExpiresAt
              ? `Ends ${formatBillingDate(writer.billing.accessExpiresAt)}`
              : "",
          quota: meta.quota,
          uploadedCount,
          daysUntilReset,
          primaryLabel: "Go to dashboard",
          primaryKind: "active",
          primaryDisabled: false,
          primaryLoading: false,
          primaryLock: false,
          onPrimary: () => goTo("/dashboard"),
          secondaryLabel: renewing
            ? "Manage billing"
            : writer.billing.billingMode === "recurring"
              ? "Resume auto-renew"
              : "Turn on auto-renew",
          onSecondary: renewing ? () => goTo("/profile?tab=settings") : () => buyWriter(key, true),
          secondaryLoading: loadingThis,
        };
      }

      // Holding the OTHER writer tier: buying this one starts it today and replaces that one.
      const otherActive = key === "silver" ? writer.hasGoldAccess : writer.hasSilverAccess;
      const otherLabel = key === "silver" ? WRITER_TIERS.gold.label : WRITER_TIERS.silver.label;

      return {
        active: false,
        quota: null,
        primaryLabel: loadingThis
          ? "Processing…"
          : checkingSession
            ? "Checking session…"
            : wrongRole
              ? "For writers only"
              : otherActive
                ? `Switch to ${meta.label}`
                : "Choose",
        primaryKind: key === "gold" ? "accent" : "outline",
        primaryDisabled: wrongRole || checkingSession,
        primaryLoading: loadingThis,
        primaryLock: false,
        onPrimary: () => buyWriter(key, false),
        switchNote: otherActive
          ? `Starts today and replaces your ${otherLabel} plan. Days left on ${otherLabel} aren't carried over.`
          : "",
      };
    },
    [writer, uploadedCount, daysUntilReset, goTo, buyWriter, onClose, openAuthModal]
  );

  const freeState = useMemo(() => tierState("free"), [tierState]);
  const silverState = useMemo(() => tierState("silver"), [tierState]);
  const goldState = useMemo(() => tierState("gold"), [tierState]);
  const stateByKey = { free: freeState, silver: silverState, gold: goldState };

  // ── FIP ribbon derivation ─────────────────────────────────────
  const fipState = useMemo(() => {
    if (fip.hasAccess) {
      const expiresAt = fip.user?.subscription?.accessExpiresAt;
      const dLeft = expiresAt
        ? Math.max(0, Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)))
        : null;
      const renewing = fip.billing.autoRenew && fip.billing.accessTier === "film_industry_professional";
      return {
        active: true,
        daysLeft: dLeft,
        renewNote: renewing
          ? `Renews ${formatBillingDate(fip.billing.nextChargeAt || expiresAt)}`
          : expiresAt
            ? `Ends ${formatBillingDate(expiresAt)}`
            : "",
        label: "Go to dashboard",
        kind: "active",
        disabled: false,
        loading: false,
        lock: false,
        onClick: () => goTo("/home"),
        secondaryLabel: renewing
          ? "Manage billing"
          : fip.billing.billingMode === "recurring"
            ? "Resume auto-renew"
            : "Turn on auto-renew",
        onSecondary: renewing ? () => goTo("/profile?tab=settings") : () => buyFip(true),
      };
    }
    if (fip.authLoading) {
      return { label: "Checking…", kind: "buy", disabled: true, loading: false, lock: false, onClick: () => {} };
    }
    if (Boolean(fip.user) && !fip.isEligibleRole) {
      return {
        label: "For industry pros",
        kind: "buy",
        disabled: true,
        loading: false,
        lock: false,
        onClick: () => {},
      };
    }
    return {
      label: fip.loading ? "Processing…" : "Get access",
      kind: "buy",
      disabled: false,
      loading: Boolean(fip.loading),
      lock: !fip.loading,
      onClick: () => buyFip(false),
    };
  }, [fip, goTo, buyFip]);

  useScrollLock();

  // ── Modal chrome: fonts, focus restore ────────────────────────
  useEffect(() => {
    ensureModalFonts();
    previouslyFocused.current = document.activeElement;
    // Move focus into the dialog for screen readers + keyboard users.
    const id = window.setTimeout(() => {
      const node = cardRef.current?.querySelector(FOCUSABLE);
      node?.focus?.({ preventScroll: true });
    }, 30);
    return () => {
      window.clearTimeout(id);
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === "function") prev.focus({ preventScroll: true });
    };
  }, []);

  // Esc to close (never mid-payment) + a lightweight focus trap.
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const nodes = cardRef.current?.querySelectorAll(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const list = Array.from(nodes);
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose, busy]
  );

  const globalMsg = writer.message || fip.message;
  const globalErr = writer.error || fip.error;

  // Checkout feedback surfaces as a toast above the modal, never as an in-card
  // banner — consistent with the auth surfaces. The terminal success *screen*
  // (a deliberate post-payment confirmation) is intentionally kept.
  useEffect(() => {
    if (globalErr) toast.error(globalErr);
  }, [globalErr, toast]);
  useEffect(() => {
    if (globalMsg) toast.info(globalMsg);
  }, [globalMsg, toast]);

  return (
    <Motion.div
      className="pmx-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <Motion.div
        ref={cardRef}
        className="pmx-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        initial={{ opacity: 0, y: 22, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.99 }}
        transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
      >
        {success ? (
          <div className="pmx-success">
            <div className="pmx-success-mark" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="pmx-success-kicker">{success.kicker}</div>
            <h2 className="pmx-success-title" id={titleId}>
              {success.title}
            </h2>
            <p className="pmx-success-body">{success.body}</p>
            <button type="button" className="pmx-success-cta" onClick={() => goTo(success.redirectTo)}>
              Continue
            </button>
          </div>
        ) : checkoutPlan ? (
          <div className="pmx-checkout">
            <CheckoutStep
              title={`${checkoutLabel} · ${isAnnual ? "yearly" : "monthly"}`}
              subtitle={`${billingNote}. Taxes are added at checkout.`}
              quoteKey={`${checkoutPlan.plan}-${isAnnual ? "annual" : "monthly"}-${currency}`}
              fetchQuote={async () => {
                const { data } = await api.post("/payment/plans/quote", {
                  plan: checkoutPlan.plan,
                  cycle: isAnnual ? "annual" : "monthly",
                  currency,
                });
                return data?.breakdown;
              }}
              onPay={({ billing, saveBilling }) =>
                checkoutPlan.plan === "fip"
                  ? runFip(checkoutPlan.isRenew, { billing, saveBilling })
                  : runWriter(checkoutPlan.plan, checkoutPlan.isRenew, { billing, saveBilling })}
              onBack={() => setCheckoutPlan(null)}
              backLabel="Back to plans"
              busy={busy}
              error={checkoutPlan.plan === "fip" ? fip.error : writer.error}
            />
          </div>
        ) : (
          <>
            {(effectiveTab === "all" || effectiveTab === "writer") && (
              <>
                <div className="pmx-head">
                  <div>
                    <div className="pmx-eyebrow">
                      <i />
                      <span>For Writers</span>
                    </div>
                    <h2 className="pmx-title" id={titleId}>
                      Get your pages seen.
                    </h2>
                  </div>
                  <div className="pmx-head-aside">
                    {effectiveTab === "writer" ? "Choose a writer plan below." : "Choose a writer plan — or get industry access below."}
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <CurrencyToggle />
                    <div style={{ display: "flex", alignItems: "center", background: "var(--pmx-bg-elevated, #1c1c1e)", padding: "4px", borderRadius: "8px", gap: "4px", fontSize: "12px", fontWeight: "600", color: "#888" }}>
                      <button 
                        type="button" 
                        onClick={() => setIsAnnual(false)} 
                        style={{ padding: "4px 12px", borderRadius: "6px", background: !isAnnual ? "var(--pmx-bg-active, #2c2c2e)" : "transparent", color: !isAnnual ? "#fff" : "inherit", transition: "all 0.2s" }}>
                        Monthly
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setIsAnnual(true)} 
                        style={{ padding: "4px 12px", borderRadius: "6px", background: isAnnual ? "var(--pmx-bg-active, #2c2c2e)" : "transparent", color: isAnnual ? "#fff" : "inherit", transition: "all 0.2s" }}>
                        Annually <span style={{ color: "#4ade80", fontSize: "10px", marginLeft: "2px" }}>-15%</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pmx-trio">
                  {pricedWriterPlans.map((plan) => (
                    <TierCard key={plan.key} plan={plan} state={stateByKey[plan.key]} />
                  ))}
                </div>
              </>
            )}

            {/* ── Industry Cards ── */}
            {(effectiveTab === "all" || effectiveTab === "industry") && (
              <>
                <div className="pmx-head" style={effectiveTab === "all" ? { marginTop: 48, paddingTop: 48, borderTop: "1px solid var(--pmx-border, #333)" } : {}}>
                  <div>
                    <div className="pmx-eyebrow">
                      <i />
                      <span>Industry Professionals</span>
                    </div>
                    <h2 className="pmx-title" id={effectiveTab === "industry" ? titleId : undefined}>
                      Discover exceptional scripts & writers.
                    </h2>
                  </div>
                  {effectiveTab === "industry" && (
                    <>
                      <div className="pmx-head-aside">
                        Choose a plan below.
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                        <CurrencyToggle />
                        <div style={{ display: "flex", alignItems: "center", background: "var(--pmx-bg-elevated, #1c1c1e)", padding: "4px", borderRadius: "8px", gap: "4px", fontSize: "12px", fontWeight: "600", color: "#888" }}>
                          <button 
                            type="button" 
                            onClick={() => setIsAnnual(false)} 
                            style={{ padding: "4px 12px", borderRadius: "6px", background: !isAnnual ? "var(--pmx-bg-active, #2c2c2e)" : "transparent", color: !isAnnual ? "#fff" : "inherit", transition: "all 0.2s" }}>
                            Monthly
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setIsAnnual(true)} 
                            style={{ padding: "4px 12px", borderRadius: "6px", background: isAnnual ? "var(--pmx-bg-active, #2c2c2e)" : "transparent", color: isAnnual ? "#fff" : "inherit", transition: "all 0.2s" }}>
                            Annually <span style={{ color: "#4ade80", fontSize: "10px", marginLeft: "2px" }}>-15%</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="pmx-duo" style={{ marginTop: "40px" }}>
                {FIP_PLANS.map((plan) => {
                  const isFree = plan.key === "free";
                  const isActivePlan = isFree ? (fip.hasAccess && fip.user?.subscription?.plan === "free") : fipState.active;

                  return (
                    <div className={`pmx-tier${plan.key === "pro" ? " pmx-tier--gold" : ""}`} key={plan.key} style={{ width: "100%" }}>
                      {plan.key === "pro" && <span className="pmx-tier-bar" />}
                      <div className="pmx-tier-top">
                        <span className="pmx-tier-name">{plan.name}</span>
                        {isActivePlan ? (
                          <span className="pmx-pill pmx-pill--active" style={{ marginLeft: "auto" }}><i />Active</span>
                        ) : plan.key === "pro" ? (
                          <span className="pmx-chip pmx-chip--best" style={{ marginLeft: "auto" }}>Recommended</span>
                        ) : null}
                      </div>
                      
                      <div className="pmx-tier-price">
                        {!isFree && fipOriginalPrice && (
                          <s style={{ color: "var(--pmx-text-muted, #888)", fontSize: "0.85em", marginRight: "8px", fontWeight: "normal", opacity: 0.8 }}>
                            {fipOriginalPrice}
                          </s>
                        )}
                        <b>{isFree ? "₹0" : fipPriceLabel}</b>
                        <span>{isFree ? "/ month" : `${isAnnual ? "/ year" : "/ month"}${plusTaxes}`}</span>
                      </div>
                      {!isFree && <div className="pmx-billing-note">{billingNote}</div>}

                      {!isFree && fipState.active && (fipState.renewNote || fipState.daysLeft > 0) && (
                        <div className="pmx-pills">
                          <span className="pmx-pill pmx-pill--days">{fipState.renewNote || `${fipState.daysLeft} days left`}</span>
                        </div>
                      )}
                      
                      <div className="pmx-tier-divider" />
                      
                      <div style={{ textAlign: "left", flex: 1 }}>
                        <ul className="pmx-feats">
                          {plan.feats.map((f, i) => (
                            <li key={i}>
                              <i />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pmx-tier-actions" style={{ marginTop: 24 }}>
                        {!isFree ? (
                          <>
                            <button
                              type="button"
                              className={`pmx-btn pmx-btn--${fipState.kind}`}
                              style={{ width: "100%" }}
                              onClick={fipState.onClick}
                              disabled={fipState.disabled || fipState.loading}
                            >
                              {fipState.loading ? <Spinner /> : fipState.lock ? <LockIcon /> : null}
                              {fipState.label === "Upgrade to Diamond Plan" ? "For industry pros" : fipState.label}
                            </button>
                            {fipState.onSecondary && (
                              <button type="button" className="pmx-btn pmx-btn--ghost" onClick={fipState.onSecondary} disabled={Boolean(fip.loading)}>
                                {fip.loading ? "Working…" : fipState.secondaryLabel}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            className="pmx-btn pmx-btn--outline"
                            style={{ width: "100%" }}
                            onClick={() => {
                              if (!fip.user) goTo("/producer-director-onboarding");
                              else goTo("/home");
                            }}
                            disabled={fipState.disabled || fipState.loading}
                          >
                            {fipState.label === "For industry pros" ? "For industry pros" : "Get Started"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}

          </>
        )}

        <button type="button" className="pmx-close" aria-label="Close" onClick={onClose} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      </Motion.div>
    </Motion.div>
  );
}

export default function PricingModal({ open, onClose, tab = "all" }) {
  return (
    <AnimatePresence>{open && <PricingModalInner key="pricing-modal-v3" onClose={onClose} tab={tab} />}</AnimatePresence>
  );
}
