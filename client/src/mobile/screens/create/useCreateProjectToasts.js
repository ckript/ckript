import { useEffect, useRef } from "react";
import { useCreateProject } from "../../../pages/CreateProject/CreateProjectContext";
import { useToast } from "../../components/feedback/toastContext";

/*
 * useCreateProjectToasts — re-raises the orchestrator's transient messages
 * through the mobile toast layer.
 *
 * `pages/CreateProject/index.jsx` raises messages by setting `toastMessage` and
 * rendering its own `position: fixed` bottom-centre card. On mobile that card
 * would land squarely on the editor's docked Elements bar and on the wizard's
 * sticky footer — the two controls a writer is most likely to be reaching for
 * when something goes wrong — so `nativeChrome` suppresses it.
 *
 * Suppressing it without this hook would silently swallow every plan-limit
 * refusal, every failed export and every media error. So the message is not
 * dropped, it is forwarded: one surface, app-wide, which is what §13 requires
 * (never two competing transient surfaces) and what the toast layer's placement
 * above the router already guarantees survives a navigation.
 *
 * TONE MAPPING. The orchestrator's vocabulary is `error | warning | info`, which
 * is three of the toast layer's four. `success` has no source here and is not
 * invented: nothing in create-project raises a "well done" toast, and mapping
 * info onto it would make a neutral notice claim something succeeded.
 *
 * The orchestrator also clears `toastMessage` on a 5-second timer of its own.
 * That timer is now irrelevant — the toast layer owns dismissal, including the
 * rule that an error or an actionable toast never auto-dismisses — but it is
 * harmless, and `seenRef` is what stops the clear-then-reset cycle re-raising
 * the same message.
 */

const TONE = Object.freeze({ error: "error", warning: "warning", info: "info" });

export default function useCreateProjectToasts() {
  const { toastMessage, setToastMessage, error, setError } = useCreateProject();
  const toast = useToast();
  const seenRef = useRef(null);

  useEffect(() => {
    if (!toastMessage) {
      seenRef.current = null;
      return;
    }
    // The orchestrator replaces the object wholesale on every raise, so identity
    // is a truthful "is this a new message?" test — and a repeat of the same
    // text (a second failed save, say) arrives as a new object and is raised
    // again, which is correct: it happened twice.
    if (seenRef.current === toastMessage) return;
    seenRef.current = toastMessage;

    toast.show({
      tone: TONE[toastMessage.type] || TONE.info,
      title: toastMessage.text,
      action: toastMessage.action?.label
        ? { label: toastMessage.action.label, onAction: toastMessage.action.onClick }
        : null,
    });

    // Handed over. Clearing immediately means the orchestrator's own 5s timer
    // has nothing left to clear, and a later message is unambiguously new.
    setToastMessage(null);
  }, [toastMessage, setToastMessage, toast]);
  useEffect(() => {
    if (error) {
      toast.show({
        tone: "warning",
        title: error,
        duration: 3000
      });
      setError("");
    }
  }, [error, setError, toast]);
}
