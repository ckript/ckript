import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../../../../context/AuthContext";
import { useAuthModal } from "../../../../context/AuthModalContext";
import {
  cancelRecurringPlan,
  fetchRecurringPlan,
  mergeSessionUser,
  planBillingView,
} from "../../../../utils/planSubscriptionCheckout";
import Button from "../../../components/buttons/Button";
import InlineMessage from "../../../components/feedback/InlineMessage";
import ConfirmDialog from "../../../components/overlays/ConfirmDialog";

/*
 * Plan & billing, mobile. The same state and wording as the desktop
 * PlanBillingCard (both read planBillingView), built from the mobile kit:
 * the plan's renewal state is a durable condition, so it is an InlineMessage,
 * and turning renewal off is confirmed in a ConfirmDialog.
 */
export default function PlanBillingSettingsMobile({ onSuccess }) {
  const { user, setUser } = useContext(AuthContext);
  const { openPricingModal } = useAuthModal();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

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
    setError("");
    try {
      const data = await cancelRecurringPlan();
      if (data?.user) mergeSessionUser(data.user, setUser);
      setConfirming(false);
      if (typeof onSuccess === "function") onSuccess(data?.message || "Automatic renewal is off.");
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't turn off automatic renewal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <InlineMessage tone={view.failing ? "warning" : view.renewing ? "success" : "info"} title={view.title}>
        {loading ? "Checking…" : view.description}
      </InlineMessage>
      {!loading ? (
        view.renewing ? (
          <Button variant="secondary" fullWidth disabled={busy} onClick={() => setConfirming(true)}>
            Cancel auto-renew
          </Button>
        ) : (
          <Button fullWidth onClick={() => openPricingModal(view.pricingTab)}>
            {view.actionLabel}
          </Button>
        )
      ) : null}
      {confirming ? (
        <ConfirmDialog
          open
          destructive
          pending={busy}
          title="Turn off auto-renew?"
          message={view.cancelPrompt}
          confirmLabel="Turn off auto-renew"
          cancelLabel="Keep renewing"
          error={error}
          onCancel={() => {
            if (!busy) {
              setConfirming(false);
              setError("");
            }
          }}
          onConfirm={turnOff}
        />
      ) : null}
    </>
  );
}
