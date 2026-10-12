import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { useAuthModal } from "../context/AuthModalContext";
import {
  cancelRecurringPlan,
  fetchRecurringPlan,
  mergeSessionUser,
  planBillingView,
} from "../utils/planSubscriptionCheckout";

/* Settings card for the member's paid plan: what it is, whether it renews by
   itself, when the next charge is, and the switch to stop it. Self-contained
   like GoogleCalendarCard — it re-syncs from Razorpay on mount, so a renewal
   whose webhook went missing still shows up here. The mobile counterpart is
   PlanBillingSettingsMobile; both read planBillingView so they say the same. */
const PlanBillingCard = ({ dark = false }) => {
  const { user, setUser } = useContext(AuthContext);
  const { openPricingModal } = useAuthModal();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "ok"|"err", text }

  const refresh = useCallback(async () => {
    try {
      const data = await fetchRecurringPlan();
      if (data?.user) mergeSessionUser(data.user, setUser);
    } catch {
      /* keep what the session already knows */
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const view = planBillingView(user);

  const turnOff = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const data = await cancelRecurringPlan();
      if (data?.user) mergeSessionUser(data.user, setUser);
      setNotice({ type: "ok", text: data?.message || "Automatic renewal is off." });
      setConfirming(false);
    } catch (err) {
      setNotice({ type: "err", text: err?.response?.data?.message || "Couldn't turn off automatic renewal." });
    } finally {
      setBusy(false);
    }
  };

  const box = dark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-100 bg-gray-50/60";
  const ghost = `shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-60 ${
    dark ? "border-white/10 text-white/70 hover:bg-white/[0.06]" : "border-gray-200 text-gray-600 hover:bg-gray-100"
  }`;
  const primary = "shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#D14D37] hover:bg-[#b53c29] !text-white transition disabled:opacity-60";

  return (
    <div className={`flex flex-col gap-3 py-3 px-4 rounded-xl border ${box}`}>
      <div className="flex items-center justify-between gap-3 max-[480px]:flex-col max-[480px]:items-start">
        <div className="min-w-0">
          <p className={`text-[13px] font-semibold ${dark ? "text-white/70" : "text-gray-700"}`}>{view.title}</p>
          <p className={`text-[11px] ${view.failing ? "text-amber-500" : dark ? "text-white/35" : "text-gray-500"}`}>
            {loading ? "Checking…" : view.description}
          </p>
        </div>
        {!loading && !confirming && (
          view.renewing ? (
            <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={ghost}>
              Cancel auto-renew
            </button>
          ) : (
            <button type="button" onClick={() => openPricingModal(view.pricingTab)} disabled={busy} className={primary}>
              {view.actionLabel}
            </button>
          )
        )}
      </div>

      {confirming && (
        <div className={`flex flex-col gap-2 rounded-lg px-3 py-2 ${dark ? "bg-white/[0.03]" : "bg-white"}`}>
          <p className={`text-[12px] ${dark ? "text-white/60" : "text-gray-600"}`}>{view.cancelPrompt}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={ghost}>
              Keep renewing
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className={primary}>
              {busy ? "…" : "Turn off auto-renew"}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className={`text-[12px] font-medium ${notice.type === "ok" ? "text-emerald-500" : "text-red-500"}`}>
          {notice.text}
        </div>
      )}
    </div>
  );
};

export default PlanBillingCard;
