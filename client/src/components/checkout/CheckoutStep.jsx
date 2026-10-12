import { useEffect, useState } from "react";
import PriceBreakdown from "./PriceBreakdown";
import BillingSection from "./BillingSection";
import useBillingDetails from "./useBillingDetails";
import { payLabel } from "../../utils/taxes";
import "./Checkout.css";

/* The checkout step every purchase passes through before the Razorpay sheet:
   the server's price breakdown (Subtotal · Taxes (18%) · Total), the buyer's
   billing details, and a pay button that states the exact total charged.

   `fetchQuote()` returns the server's `breakdown`; `quoteKey` re-fetches it
   when what is being bought changes (plan, cycle, currency…). `onPay` gets
   `{ billing, saveBilling }` to send with the order request. */
export default function CheckoutStep({
  title = "Review and pay",
  subtitle = "",
  fetchQuote,
  quoteKey = "",
  onPay,
  onBack,
  backLabel = "Back",
  busy = false,
  error = "",
  note = "",
  dark = false,
}) {
  const details = useBillingDetails();
  const [quote, setQuote] = useState({ key: null, breakdown: null, error: "" });

  useEffect(() => {
    let alive = true;
    Promise.resolve(fetchQuote?.())
      .then((b) => alive && setQuote({ key: quoteKey, breakdown: b || null, error: "" }))
      .catch((err) => alive && setQuote({
        key: quoteKey,
        breakdown: null,
        error: err?.response?.data?.message || "Could not work out the total. Try again.",
      }));
    return () => {
      alive = false;
    };
    // fetchQuote is recreated by parents on every render; quoteKey says when the thing bought changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);
  // A quote for something else (the plan or currency just changed) is treated as still loading.
  const breakdown = quote.key === quoteKey ? quote.breakdown : null;
  const quoteError = quote.key === quoteKey ? quote.error : "";

  const pay = () => {
    const prepared = details.prepare();
    if (prepared) onPay?.(prepared);
  };

  return (
    <div className={`ckx-co${dark ? " ckx-co--dark" : ""}`}>
      {title ? <h3 className="ckx-co__title">{title}</h3> : null}
      {subtitle ? <p className="ckx-co__sub">{subtitle}</p> : null}

      <PriceBreakdown breakdown={breakdown} loading={!breakdown && !quoteError} embedded />
      {note ? <p className="ckx-co__note">{note}</p> : null}

      <BillingSection details={details} embedded />

      <div className="ckx-co__actions">
        {onBack ? <button type="button" className="ckx-co__back" onClick={onBack} disabled={busy}>{backLabel}</button> : null}
        <button type="button" className="ckx-co__pay" onClick={pay} disabled={busy || !breakdown || !details.ready}>
          {busy ? "Opening payment…" : payLabel(breakdown)}
        </button>
      </div>
      {quoteError || error ? <p className="ckx-co__message" role="alert">{quoteError || error}</p> : null}
      <p className="ckx-co__note">
        Refunds and cancellations:{" "}
        <a href="/refund-policy" target="_blank" rel="noreferrer" className="ckx-co__link">see our policy</a>.
      </p>
    </div>
  );
}
