import { breakdownRows } from "../../utils/taxes";
import "./Checkout.css";

/* The server's quote, as rows: each line, Subtotal, Taxes (18%), Total.
   Renders exactly what the server priced — the client does no tax math. */
export default function PriceBreakdown({ breakdown, loading = false, note = "", dark = false, embedded = false }) {
  const rows = breakdownRows(breakdown);
  const body = loading || !breakdown ? (
    <div className="ckx-co__skeleton" aria-label="Working out the total" role="status" />
  ) : (
    <div className="ckx-co__breakdown" aria-label="Price breakdown">
      {rows.map((row) => (
        <div key={row.key} className={`ckx-co__row ckx-co__row--${row.kind}`}>
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
  if (embedded) return body;
  return (
    <div className={`ckx-co${dark ? " ckx-co--dark" : ""}`}>
      {body}
      {note ? <p className="ckx-co__note">{note}</p> : null}
    </div>
  );
}
