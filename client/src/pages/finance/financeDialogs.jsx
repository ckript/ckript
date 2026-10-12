import { useState } from "react";
import { Button, Dialog, Field, Input, Textarea } from "../admin/ui";
import { longDay, money, toMajorInput, toMinorUnits } from "./financeFormat";

/**
 * The confirmations behind the three admin-only tax actions on /finance.
 *
 * Each one is rendered ONLY by a section whose `actions` prop is non-null — an admin viewer. The
 * finance role never mounts these, and the server (adminOnly) refuses the request if it is forged.
 *
 * Each dialog is mounted fresh per use (the caller renders it only while open), so its form state
 * starts empty every time without an effect to reset it.
 */

/** Refund a paid ledger entry, in full or in part, with a reason. */
export function RefundDialog({ entry, busy = false, onClose, onConfirm }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const paid = Math.abs(Number(entry?.amountMinor) || 0);
  const beforeTaxes = entry?.supplyType === "pre_gst";

  const submit = () => {
    if (!reason.trim()) { setError("Give a reason for the refund."); return; }
    let amountMinor;
    if (amount.trim()) {
      amountMinor = toMinorUnits(amount);
      if (!amountMinor) { setError("Enter an amount like 250 or 250.50, or leave it empty for a full refund."); return; }
      if (paid && amountMinor > paid) { setError(`That is more than was paid (${money(paid, entry.currency)}).`); return; }
    }
    setError("");
    onConfirm({ amountMinor, reason: reason.trim() });
  };

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      title="Refund payment"
      width={480}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy}>Refund</Button>
        </>
      )}
    >
      <div className="fin-stack">
        <p className="ado-copy" style={{ margin: 0 }}>
          {entry?.user?.name || "This buyer"} paid <strong>{money(paid, entry?.currency)}</strong>
          {entry?.label ? ` for ${entry.label}` : ""}. The refund is sent through Razorpay and returns the
          money <strong>including taxes</strong> — a partial refund takes back its proportional share of them.
          {beforeTaxes
            ? " This payment was taken before taxes were charged, so the refund is booked as a reversal with no credit note."
            : " A credit note is issued against the original tax invoice and the taxes are reversed in the books."}
        </p>
        <Field label={`Amount (${entry?.currency || "INR"})`} help="Leave empty to refund everything not yet refunded.">
          {(ids) => (
            <Input {...ids} inputMode="decimal" placeholder={toMajorInput(paid)} value={amount}
              onChange={(e) => setAmount(e.target.value)} disabled={busy} />
          )}
        </Field>
        <Field label="Reason" required error={error}>
          {(ids) => (
            <Textarea {...ids} rows={3} maxLength={200} value={reason}
              onChange={(e) => setReason(e.target.value)} disabled={busy} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** Issue the back-filled tax invoices. Typing ISSUE is the confirmation, because they are permanent. */
export function IssueGapDialog({ count = 0, deadline = null, busy = false, onClose, onConfirm }) {
  const [typed, setTyped] = useState("");
  const [notify, setNotify] = useState(false);
  const ready = typed.trim() === "ISSUE";

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      title="Issue back-fill invoices"
      width={480}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm({ notify })} disabled={!ready} loading={busy}>
            Issue invoices
          </Button>
        </>
      )}
    >
      <div className="fin-stack">
        <p className="ado-copy" style={{ margin: 0 }}>
          This issues a numbered tax invoice for each of the <strong>{count}</strong> payment{count === 1 ? "" : "s"} taken
          before taxes were charged at checkout, carving the taxes out of what was paid. Issued invoices cannot be
          withdrawn — only credited. Payments that already have an invoice are skipped, so it is safe to run again.
          {deadline ? <> Issue by <strong>{longDay(deadline)}</strong>.</> : null}
        </p>
        <label className="fin-check">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={busy} />
          Email buyers their invoice
        </label>
        <Field label="Type ISSUE to confirm">
          {(ids) => (
            <Input {...ids} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** Lock a past month once its GSTR-1 has been filed. */
export function LockPeriodDialog({ period, busy = false, onClose, onConfirm }) {
  const [note, setNote] = useState("");

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      title={`Lock ${period}`}
      width={460}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm({ note: note.trim() })} loading={busy}>Lock period</Button>
        </>
      )}
    >
      <div className="fin-stack">
        <p className="ado-copy" style={{ margin: 0 }}>
          Lock {period} only after its GSTR-1 has been filed. Once locked, no tax invoice or credit note can be
          dated inside it — anything late goes into the next open month. This cannot be undone from here.
        </p>
        <Field label="Note" help="Optional — e.g. the GSTR-1 acknowledgement number.">
          {(ids) => (
            <Textarea {...ids} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
