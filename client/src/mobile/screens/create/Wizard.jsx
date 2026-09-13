import { useRef, useState } from "react";
import { useCreateProject } from "../../../pages/CreateProject/CreateProjectContext";
import Button from "../../components/buttons/Button";
import IconButton from "../../components/buttons/IconButton";
import InlineMessage from "../../components/feedback/InlineMessage";
import formatFileSize from "../../components/forms/formatFileSize";
import ActionSheet from "../../components/overlays/ActionSheet";
import MobileShell from "../../shell/MobileShell";
import { describeSaveState } from "./editorChrome";
import CoverCropDialog from "./overlays/CoverCropDialog";
import DraftsSheet from "./overlays/DraftsSheet";
import ExitFlow from "./overlays/ExitFlow";
import SubmittedDialog from "./overlays/SubmittedDialog";
import { DETAILS_PANELS } from "./panels/DetailsPanels";
import { ClassifyPanel, FilmInfoPanel, PublishPanel } from "./panels/StepPanels";
import {
  buildWizardOverflowItems,
  describeWizardFooter,
  describeWizardPosition,
  WIZARD_SHELL_MODE,
  WIZARD_SHELL_SLOTS,
} from "./wizardChrome";
import "./Wizard.css";

/*
 * The mobile publish wizard — /create-project steps 2–5, "mode B" of the
 * approved wireframe (prefix: ckm-create-project, plan §11 Phase 3).
 *
 * WHAT THE DESKTOP SHAPE WAS, AND WHAT SURVIVED
 * ---------------------------------------------
 * `CreateProjectShell` draws a 158px "Project setup" rail listing all five
 * steps with connector lines, a second horizontal stepper for narrow screens, a
 * banner stack, and a footer carrying Back/Next *plus* word counts, zoom
 * controls and a prose toggle. Three navigators for one position.
 *
 * On a phone there is one. The position line lives in the app bar ("Step 3 of
 * 5 · Classify"), the footer carries Back and Next and nothing else, and the
 * step-2 sub-stepper is gone entirely — its information is the second line of
 * the app bar. Nothing was dropped that told the writer where they are; three
 * things that told them the same thing were collapsed into one.
 *
 * THE FOOTER IS A SHELL SLOT (see wizardChrome.js)
 * A `flow` screen has no bottom chrome, so this is a declared slot override —
 * the mechanism the editor introduced. The point is that the footer *displaces*
 * the form rather than covering it: the last field of a panel must stay
 * reachable above Next, and on a phone the last field is often the one being
 * typed into.
 *
 * IT OWNS NO WIZARD STATE. Every value and every setter is the orchestrator's,
 * read from `CreateProjectContext` — the same context `CreateProjectShell`
 * reads. `handleNext` is what walks the sub-panels and runs per-panel
 * validation; `handlePublish` is what submits. This file decides what is on
 * screen, never what is true.
 */
export default function Wizard() {
  const {
    cancelProjectMediaUpload, competitionMode, confirmMediaUploadPreflight, creationBlocked,
    detailsStep, detailsSubSteps, drafts, error,
    exiting, handleBack, handleExitEditor, handleNext, handlePublish, hasPublishAccess,
    lastSaved, legal, loading, mediaUploadActive, mediaUploadPreflight, rightsLicensing,
    saved, saving, setError, setStep, step, title,
    pendingMediaRecovery, pendingRecovery, acceptPendingRecovery, dismissPendingRecovery,
  } = useCreateProject();

  const [overflowOpen, setOverflowOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const overflowRef = useRef(null);

  const position = describeWizardPosition({ step, detailsStep, detailsSubSteps });
  const save = describeSaveState({ saving, saved, lastSaved });
  const footer = describeWizardFooter({
    step,
    creationBlocked,
    loading,
    agreedToTerms: Boolean(legal?.agreedToTerms),
    ownershipConfirmed: Boolean(rightsLicensing?.legalAcknowledgement?.ownershipConfirmed),
    hasPublishAccess,
    exiting,
    mediaRecovery: pendingMediaRecovery,
    mediaUploadActive,
    mediaUploadPreflight: Boolean(mediaUploadPreflight),
  });

  const recoveredAt = pendingRecovery?.updatedAt
    ? new Date(pendingRecovery.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  /*
   * Which body to draw. Step 2 resolves through `detailsSubSteps`, which the
   * orchestrator derives from the active film/publishing track — so the mobile
   * wizard cannot show a panel the desktop one would not, and a writer resuming
   * a draft lands on the exact panel they left (D7, via lib/workingDraft.js).
   */
  const detailsPanel = detailsSubSteps[detailsStep] || detailsSubSteps[0];
  const Panel = step === 2
    ? (DETAILS_PANELS[detailsPanel?.key] || DETAILS_PANELS.basics)
    : step === 3 ? ClassifyPanel
      : step === 4 ? FilmInfoPanel
        : PublishPanel;

  const overflowActions = {
    drafts: () => setDraftsOpen(true),
    editor: () => { setStep(1); setError(""); },
  };

  const overflowItems = buildWizardOverflowItems({
    drafts: drafts.length,
    /* In competition mode there is one entry and no marketplace project to
       switch to. An item that is real for one writer and a dead end for another
       is the placeholder §2.8 forbids. */
    canSwitchProject: !competitionMode,
  }).map((item) => ({ ...item, onSelect: overflowActions[item.id] }));

  const appBar = (
    <>
      <div className="ckm-create-project__bar">
        {/*
          * Exit, not Back. The footer's Back walks the flow; this leaves the
          * project entirely, and it is the same action the browser's own back
          * gesture triggers (the orchestrator intercepts popstate). Two controls
          * in one bar that both say "Back" and do different things is the
          * ambiguity this split removes — a correction to the §4.3 wireframe,
          * which listed Back in both places.
          */}
        <IconButton
          icon="close"
          label="Leave this project"
          variant="soft"
          onClick={handleExitEditor}
        />

        <div className="ckm-create-project__bar-text">
          {/* The project title is the screen's h1 — the wizard is about this
              project, and every panel heading nests under it. */}
          <h1 className="ckm-create-project__bar-title">{title?.trim() || "Untitled project"}</h1>
          {/* One string, not three spans: a position line assembled from
              separate elements is announced as five separate stops. */}
          <p className="ckm-create-project__bar-position">
            {position.panelLabel
              ? `${position.position} · ${position.label} · ${position.panelLabel}`
              : `${position.position} · ${position.label}`}
          </p>
        </div>

        <span
          className={`ckm-create-project__save ckm-create-project__save--${save.state}`}
          role="status"
          aria-live="polite"
        >
          <span className="ckm-create-project__save-dot" aria-hidden="true" />
          <span className="ckm-create-project__save-label">{save.label}</span>
        </span>

        <IconButton
          ref={overflowRef}
          icon="more_vert"
          label="More project actions"
          variant="soft"
          aria-haspopup="dialog"
          aria-expanded={overflowOpen}
          onClick={() => setOverflowOpen(true)}
        />
      </div>

      {/* A progress bar the position line can be read against. `aria-hidden`
          because the line above already says "Step 3 of 5" in words — a
          progressbar role would announce the same fact a second time as "60
          percent", which is not what a writer wants to hear. */}
      <div className="ckm-create-project__progress" aria-hidden="true">
        <span
          className="ckm-create-project__progress-fill"
          style={{ width: `${(position.step / position.total) * 100}%` }}
        />
      </div>

      {/*
        * Notices live in the fixed chrome, under the bar rather than in the
        * scroll body. A validation error that scrolls out of sight is the
        * failure this placement exists to prevent: `handleNext` refuses to
        * advance and sets `error`, and if that message is 400px up the panel the
        * writer sees a Next button that simply stopped working.
        */}
      {pendingRecovery && (
        <InlineMessage
          tone="info"
          variant="panel"
          title={`Unsaved changes from this device were found${recoveredAt ? ` (${recoveredAt})` : ""}.`}
          className="ckm-create-project__notice"
          action={(
            <>
              <Button size="sm" onClick={acceptPendingRecovery}>Restore my changes</Button>
              <Button size="sm" variant="tertiary" onClick={dismissPendingRecovery}>
                Keep the saved version
              </Button>
            </>
          )}
        >
          The saved version has also changed since then, so these were not restored automatically.
          Restoring replaces what you see now.
        </InlineMessage>
      )}

      {creationBlocked && (
        <InlineMessage
          tone="warning"
          variant="panel"
          title="You've reached your plan's script limit."
          className="ckm-create-project__notice"
          action={<Button size="sm" to="/pricing">View plans</Button>}
        >
          You can keep editing this project, but publishing another one needs an upgraded plan.
        </InlineMessage>
      )}

      {mediaUploadPreflight && (
        <InlineMessage
          tone="warning"
          variant="panel"
          title="Large media upload"
          className="ckm-create-project__notice"
        >
          {mediaUploadPreflight.files.map((file) => `${file.label}: ${file.name} (${formatFileSize(file.size)})`).join(" · ")}. {" "}
          Total {formatFileSize(mediaUploadPreflight.totalBytes)}. Videos upload in confirmed
          chunks, so a connection drop can continue from the last accepted chunk. Choose
          &ldquo;Start uploads&rdquo; when you are ready.
        </InlineMessage>
      )}

      {pendingMediaRecovery && !mediaUploadPreflight && !mediaUploadActive && (
        <InlineMessage
          tone="warning"
          variant="panel"
          title={pendingMediaRecovery.cancelledTypes?.length > 0 && !pendingMediaRecovery.failedTypes?.length
            ? "Media upload cancelled. Your project is still saved."
            : "Your project is saved, but some media did not upload."}
          className="ckm-create-project__notice"
        >
          {pendingMediaRecovery.cancelledTypes?.length > 0 && !pendingMediaRecovery.failedTypes?.length
            ? "Retry the cancelled uploads when you are ready. Cancelling discards the upload session, so each file starts again at 0%."
            : "Continue to resume each video at its last confirmed chunk. A cover image starts again; you can also replace or remove any highlighted file. Nothing else needs re-entering."}
        </InlineMessage>
      )}

      {mediaUploadActive && (
        <InlineMessage
          tone="info"
          variant="panel"
          title="Your project is saved. Media is uploading now."
          className="ckm-create-project__notice"
          action={<Button size="sm" variant="tertiary" onClick={cancelProjectMediaUpload}>Cancel uploads</Button>}
        >
          Keep Ckript open while data is moving. If the connection drops, Continue resumes videos
          from their last confirmed chunks without submitting the project again. Cancel discards
          the sessions instead.
        </InlineMessage>
      )}


    </>
  );

  const bottomBar = (
    <div className="ckm-create-project__footer">
      {/* The reason a primary is refused, as visible text. Desktop puts it in a
          `title` attribute, which never appears on a touch device — there is no
          hover — so a phone writer met a greyed-out Submit with no way at all to
          find out what was missing. */}
      {footer.next.blockedReason && (
        <p className="ckm-create-project__footer-reason" id="ckm-cp-blocked">
          {footer.next.blockedReason}
        </p>
      )}

      <div className="ckm-create-project__footer-actions">
        <Button variant="secondary" disabled={footer.back.disabled} onClick={handleBack}>
          {footer.back.label}
        </Button>
        <Button
          fullWidth
          pending={loading}
          disabled={footer.next.disabled}
          trailingIcon={footer.next.kind === "next" ? "arrow_forward" : "check"}
          aria-describedby={footer.next.blockedReason ? "ckm-cp-blocked" : undefined}
          onClick={footer.next.kind === "start-media"
            ? confirmMediaUploadPreflight
            : footer.next.kind === "publish" ? handlePublish : handleNext}
        >
          {footer.next.label}
        </Button>
      </div>
    </div>
  );

  return (
    <MobileShell
      mode={WIZARD_SHELL_MODE}
      slots={WIZARD_SHELL_SLOTS}
      screenId="create-project-wizard"
      className="ckm-create-project"
      scrollClassName="ckm-create-project__scroll"
      appBar={appBar}
      bottomNav={bottomBar}
      overlays={(
        <>
          <ActionSheet
            open={overflowOpen}
            onClose={() => setOverflowOpen(false)}
            title="Project"
            items={overflowItems}
            returnFocusTo={overflowRef}
          />
          <DraftsSheet
            open={draftsOpen}
            onClose={() => setDraftsOpen(false)}
            returnFocusTo={overflowRef}
          />
          <CoverCropDialog />
          <SubmittedDialog />
          <ExitFlow />
        </>
      )}
    >
      {/* Keyed by the exact panel, so React remounts on every move. That is what
          resets scroll to the top of the new panel — without it, walking from a
          long panel to a short one leaves the writer looking at blank space. */}
      <div className="ckm-create-project__panel" key={`${step}-${detailsPanel?.key ?? ""}`}>
        <Panel />
      </div>
    </MobileShell>
  );
}
