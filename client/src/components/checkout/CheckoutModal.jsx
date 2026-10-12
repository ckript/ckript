import { useEffect, useId } from "react";
import CheckoutStep from "./CheckoutStep";
import "./Checkout.css";

/* The checkout step in an overlay, for surfaces that have no room of their own (an AI trailer, a
   consultation booking). Escape or the backdrop closes it unless a payment is being opened. */
export default function CheckoutModal({ open, onClose, dark = false, busy = false, ...stepProps }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  return (
    <div
      className="ckx-co__overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}
    >
      <div className={`ckx-co__dialog${dark ? " ckx-co__dialog--dark" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <span id={titleId} className="ckx-co__sr">{stepProps.title || "Review and pay"}</span>
        <CheckoutStep {...stepProps} busy={busy} dark={dark} onBack={onClose} backLabel="Cancel" />
      </div>
    </div>
  );
}
