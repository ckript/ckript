import { useCallback, useEffect, useState } from "react";
import { billingErrors, billingPayload, fetchBillingProfile, useTaxConfig } from "../../utils/taxes";

/* The billing-details state every checkout shares: load the saved details (or a prefill from the
   profile), let the buyer change them, validate before paying, and say whether to save them.

   `prepare()` returns `{ billing, saveBilling }` for the order request, or null (and reveals the
   errors) when something must be fixed first. */
export default function useBillingDetails({ enabled = true } = {}) {
  const config = useTaxConfig();
  const [billing, setBilling] = useState(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveBilling, setSaveBilling] = useState(true);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchBillingProfile().then(({ saved: isSaved, billing: b }) => {
      if (!alive) return;
      setBilling(b);
      setSaved(isSaved);
      setEditing(!isSaved);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  const prepare = useCallback(() => {
    if (!billing) return null;
    if (Object.keys(billingErrors(billing)).length) {
      setShowErrors(true);
      setEditing(true);
      return null;
    }
    return { billing: billingPayload(billing), saveBilling: editing ? saveBilling : false };
  }, [billing, editing, saveBilling]);

  return {
    states: config?.states || [],
    chargingEnabled: Boolean(config?.chargingEnabled),
    configLoaded: Boolean(config),
    billing,
    setBilling,
    saved,
    editing,
    setEditing,
    saveBilling,
    setSaveBilling,
    showErrors,
    ready: Boolean(billing),
    prepare,
  };
}
