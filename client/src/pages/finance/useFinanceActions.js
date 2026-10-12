import { useCallback, useState } from "react";
import api from "../../services/financeApi";
import { money } from "./financeFormat";

/**
 * The control actions on the payments page — grants, plan changes, bank-review decisions.
 *
 * These hit the EXISTING admin endpoints and are therefore gated by adminOnly on the server. The
 * finance page only renders them for a viewer whose role is admin, so the server check and the UI
 * agree; the server remains the actual boundary, and an accountant who crafted the request by hand
 * would still be refused.
 *
 * Uses the normal authenticated client, not the admin console's session-scoped one: this page is
 * reached by logging in, not through the console's access-code gate, so authorisation comes from
 * the signed-in user's own role.
 *
 * Every action reports through `onResult(message, tone)` and re-fetches via `refresh()` — the row
 * a grant just changed must not keep showing its old state.
 *
 * Each action resolves to the response body on success and to null on failure (or when another
 * action is still running). The Overview and Taxes tabs own their data rather than reading it through
 * `useFinanceData`, so they use that to close their dialog and reload themselves.
 *
 * The tax actions (refund, back-fill issue, period lock) post to /admin/* behind adminOnly, exactly
 * like the rest: the finance role is never shown them and the server refuses them if forged.
 */
export default function useFinanceActions({ refresh, onResult }) {
  const [busy, setBusy] = useState("");

  const run = useCallback(async (key, request, successMessage) => {
    if (busy) return null;
    setBusy(key);
    try {
      const response = await request();
      const data = response?.data ?? {};
      onResult?.(typeof successMessage === "function" ? successMessage(data) : successMessage, "success");
      refresh?.();
      return data;
    } catch (error) {
      onResult?.(error?.response?.data?.message || "That action could not be completed.", "error");
      return null;
    } finally {
      setBusy("");
    }
  }, [busy, refresh, onResult]);

  return {
    busy,
    grantPremium: (user) => run(
      `premium-${user._id}`,
      () => api.post(`/admin/users/${user._id}/grant-premium`),
      `Premium granted to ${user.name || user.email}.`,
    ),
    removePremium: (user) => run(
      `remove-premium-${user._id}`,
      () => api.post(`/admin/users/${user._id}/remove-premium`),
      `Premium removed from ${user.name || user.email}.`,
    ),
    grantWriterPlan: (user, tier = "silver", cycle = "monthly") => run(
      `writer-plan-${user._id}`,
      () => api.post(`/admin/users/${user._id}/grant-writer-plan`, { tier, cycle }),
      `${tier} plan granted to ${user.name || user.email}.`,
    ),
    removeWriterPlan: (user) => run(
      `remove-writer-plan-${user._id}`,
      () => api.post(`/admin/users/${user._id}/remove-writer-plan`),
      `Writer plan removed from ${user.name || user.email}.`,
    ),
    approveBankReview: (review) => run(
      `bank-approve-${review._id}`,
      () => api.put(`/admin/bank-details/reviews/${review._id}/approve`),
      "Bank details approved.",
    ),
    rejectBankReview: (review, note = "") => run(
      `bank-reject-${review._id}`,
      () => api.put(`/admin/bank-details/reviews/${review._id}/reject`, { note }),
      "Bank details rejected.",
    ),
    unblockBankReview: (review) => run(
      `bank-unblock-${review._id}`,
      () => api.put(`/admin/bank-details/reviews/${review._id}/unblock`),
      "Bank updates unblocked.",
    ),
    /**
     * Refund a paid ledger entry, in full (amountMinor omitted) or in part. The server refunds at
     * Razorpay, books the reversal with its pro-rata taxes and issues the credit note.
     */
    refundPayment: (entry, { amountMinor, reason }) => run(
      `refund-${entry._id}`,
      () => api.post(`/admin/payments/${entry._id}/refund`, {
        reason,
        ...(amountMinor ? { amountMinor } : {}),
      }),
      (data) => {
        const amount = data?.amountMinor ? `${money(data.amountMinor, data.currency || entry.currency)} refunded` : "Refund issued";
        return data?.creditNote?.invoiceNumber
          ? `${amount}. Credit note ${data.creditNote.invoiceNumber} issued.`
          : `${amount}.`;
      },
    ),
    /** Issue the back-filled tax invoices for payments taken before taxes were charged. */
    issueGapInvoices: ({ notify = false } = {}) => run(
      "gap-issue",
      () => api.post("/admin/taxes/gap/issue", { confirm: "ISSUE", notify: Boolean(notify) }),
      (data) => {
        const issued = data?.issued?.length || 0;
        const failed = data?.failed?.length || 0;
        return `${issued} back-fill invoice${issued === 1 ? "" : "s"} issued${failed ? `, ${failed} failed — see the server log` : ""}.`;
      },
    ),
    /** Lock a filed month so no document can be dated inside it. */
    lockTaxPeriod: (period, note = "") => run(
      `period-lock-${period}`,
      () => api.post("/admin/taxes/period-lock", { period, ...(note ? { note } : {}) }),
      `${period} is locked.`,
    ),
  };
}
