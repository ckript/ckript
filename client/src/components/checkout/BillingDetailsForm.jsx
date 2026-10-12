import { useId } from "react";
import { COUNTRIES } from "../../pages/challenge/constants";
import { billingErrors, isIndia } from "../../utils/taxes";
import "./Checkout.css";

/* "Billing details" — who the tax invoice is addressed to. Controlled: the
   parent owns `value` and gets every change through `onChange`.

   Wording rule: the GSTIN field is "Business tax ID (optional)". The word GST
   never appears here, in labels or in errors. */
export default function BillingDetailsForm({ value, onChange, states = [], showErrors = false, embedded = false, dark = false }) {
  const id = useId();
  const errors = showErrors ? billingErrors(value) : {};
  const set = (patch) => onChange({ ...value, ...patch });
  const business = value.type === "business";
  const india = isIndia(value.country);

  const field = (key, label, input, { wide = false } = {}) => (
    <label className={`ckx-co__field${wide ? " ckx-co__field--wide" : ""}`} htmlFor={`${id}-${key}`}>
      <span>{label}</span>
      {input}
      {errors[key] ? <em className="ckx-co__error" role="alert">{errors[key]}</em> : null}
    </label>
  );
  const text = (key, props = {}) => (
    <input
      id={`${id}-${key}`}
      value={value[key] || ""}
      onChange={(e) => set({ [key]: e.target.value })}
      aria-invalid={Boolean(errors[key]) || undefined}
      {...props}
    />
  );

  const form = (
    <div className="ckx-co__billing-form">
      <div className="ckx-co__toggle" role="group" aria-label="Buying as">
        <button type="button" aria-pressed={!business} onClick={() => set({ type: "individual" })}>Individual</button>
        <button type="button" aria-pressed={business} onClick={() => set({ type: "business" })}>Business</button>
      </div>
      <div className="ckx-co__grid">
        {business
          ? field("legalName", "Registered business name", text("legalName", { autoComplete: "organization" }), { wide: true })
          : field("name", "Name on the invoice", text("name", { autoComplete: "name" }), { wide: true })}
        {field("country", "Country", (
          <select id={`${id}-country`} value={value.country || ""} onChange={(e) => set({ country: e.target.value, stateCode: isIndia(e.target.value) ? value.stateCode : "" })}>
            <option value="">Select…</option>
            <option value="India">India</option>
            {COUNTRIES.filter((c) => c !== "India").map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ))}
        {india ? field("stateCode", "State", (
          <select id={`${id}-stateCode`} value={value.stateCode || ""} onChange={(e) => set({ stateCode: e.target.value })}>
            <option value="">Select…</option>
            {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        )) : field("city", "City", text("city", { autoComplete: "address-level2" }))}
        {business ? field("line1", "Business address", text("line1", { autoComplete: "address-line1" }), { wide: true }) : null}
        {india ? field("city", "City", text("city", { autoComplete: "address-level2" })) : null}
        {india ? field("pincode", "PIN code", text("pincode", { inputMode: "numeric", maxLength: 6, autoComplete: "postal-code" })) : null}
        {india ? field("businessTaxId", "Business tax ID (optional)", text("businessTaxId", {
          placeholder: "15 characters",
          maxLength: 15,
          autoCapitalize: "characters",
          onChange: (e) => set({ businessTaxId: e.target.value.toUpperCase().replace(/\s+/g, "") }),
        }), { wide: true }) : null}
      </div>
      {india && value.businessTaxId ? (
        <label className="ckx-co__check">
          <input type="checkbox" checked={Boolean(value.isSez)} onChange={(e) => set({ isSez: e.target.checked })} />
          This business is a Special Economic Zone (SEZ) unit or developer
        </label>
      ) : null}
    </div>
  );

  if (embedded) return form;
  return <div className={`ckx-co${dark ? " ckx-co--dark" : ""}`}>{form}</div>;
}
