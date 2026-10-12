import BillingDetailsForm from "./BillingDetailsForm";
import { billingSummary } from "../../utils/taxes";
import "./Checkout.css";

/* "Billing details" inside a checkout: a one-line summary of saved details with "Change", or the form
   with a "Save as my billing details" tick. Driven by useBillingDetails(). */
export default function BillingSection({ details, dark = false, embedded = false }) {
  const { billing, saved, editing, setEditing, setBilling, states, showErrors, saveBilling, setSaveBilling } = details;
  const body = (
    <div className="ckx-co__billing">
      <div className="ckx-co__billing-head">
        <span className="ckx-co__label">Billing details</span>
        {billing && saved && !editing ? (
          <button type="button" className="ckx-co__link" onClick={() => setEditing(true)}>Change</button>
        ) : null}
      </div>
      {!billing ? (
        <div className="ckx-co__skeleton" style={{ height: 44 }} role="status" aria-label="Loading billing details" />
      ) : editing ? (
        <>
          <BillingDetailsForm value={billing} onChange={setBilling} states={states} showErrors={showErrors} embedded />
          <label className="ckx-co__check">
            <input type="checkbox" checked={saveBilling} onChange={(e) => setSaveBilling(e.target.checked)} />
            Save as my billing details
          </label>
        </>
      ) : (
        <div className="ckx-co__summary">{billingSummary(billing, states)}</div>
      )}
    </div>
  );
  if (embedded) return body;
  return <div className={`ckx-co${dark ? " ckx-co--dark" : ""}`}>{body}</div>;
}
