import { useCallback, useMemo, useRef, useState } from "react";
import { EditorContent } from "@tiptap/react";
import Corkboard from "../../../components/screenplay/Corkboard";
import ScreenplayEditor from "../../../components/screenplay/ScreenplayEditor";
import { TitlePageSheet } from "../../../components/screenplay/ScreenplayFocusMode";
import { DOC_SCENE_ID, getScenes } from "../../../components/screenplay/sceneIdentity";
import { useCreateProject } from "../../../pages/CreateProject/CreateProjectContext";
import Button from "../../components/buttons/Button";
import IconButton from "../../components/buttons/IconButton";
import InlineMessage from "../../components/feedback/InlineMessage";
import ActionSheet from "../../components/overlays/ActionSheet";
import Dialog from "../../components/overlays/Dialog";
import MobileShell from "../../shell/MobileShell";
import useCompetitionEditorPanel from "./CompetitionEditorPanel";
import EditorDock from "./EditorDock";
import CommentsSheet from "./overlays/CommentsSheet";
import ExitFlow from "./overlays/ExitFlow";
import NavigatorSheet from "./overlays/NavigatorSheet";
import PeopleDialog from "./overlays/PeopleDialog";
import ReportsDialog from "./overlays/ReportsDialog";
import VersionsDialog from "./overlays/VersionsDialog";
import TitlePageDialog from "./overlays/TitlePageDialog";
import { countOpenComments } from "./commentsModel";
import {
  buildEditorOverflowItems,
  describeSaveState,
  EDITOR_DOCK_TAB,
  EDITOR_SHELL_MODE,
  EDITOR_SHELL_SLOTS,
} from "./editorChrome";
import "./Editor.css";

/*
 * The mobile screenplay editor — /create-project step 1, "mode A" of the
 * approved wireframe (prefix: ckm-editor, plan §11 Phase 3, decisions D1–D5).
 *
 * WHAT THIS COMPONENT IS, AND IS NOT
 * ----------------------------------
 * It is CHROME. The editor itself is `components/screenplay/ScreenplayEditor` —
 * the same CodeMirror 6 host the desktop wizard mounts, with the same Fountain
 * classification, the same pagination, the same comment anchors and the same
 * collaborator locks. D1 is the reason this file is short: a forked mobile
 * editor would mean two Fountain parsers drifting apart, and the surface that
 * actually needed rebuilding for touch was never the editor — it was the three
 * desktop panes around it.
 *
 * So the transformation is: left rail + centre + right panel + ribbon → one
 * scroll surface, one docked bar, and sheets summoned one at a time (D5).
 *
 * IT READS THE ORCHESTRATOR'S CONTEXT, IT OWNS NO WIZARD STATE
 * ------------------------------------------------------------
 * `pages/CreateProject/index.jsx` owns every piece of create-project state and
 * publishes it through `CreateProjectContext`; `CreateProjectShell` is the
 * desktop chrome that reads it. This is the mobile chrome that reads the same
 * context. Autosave, the draft signature, the keepalive exit save, the working
 * draft snapshot and the recovery decision are all shared code, already tested,
 * and none of it is re-implemented here — which is also why "save/resume" needed
 * no mobile-specific work beyond showing the writer what it decided.
 *
 * LIVE SINCE 2026-08-09 (mode B). `/create-project` and `/create-project/:draftId`
 * are SCREEN routes now, and `CreateProjectChrome` mounts this whenever
 * `step === 1`. "Continue to details" hands over to `Wizard` — the reason the
 * route could not be promoted until that existed, since a promoted route whose
 * next step is desktop Tailwind form markup is what plan §2.2 forbids.
 */
export default function Editor() {
  const {
    canEditContent, collabLocks, collabMyUserId, collabRequestEdit,
    competitionMode, creationBlocked, currentElement, dark, editor, editorZoom,
    emphasisState, enforceGoldPlan, error, exportingScreenplay,
    focusedCommentId, handleCaretLine, handleExitEditor, handleExportScreenplay,
    handleImportScreenplayFile, handleNext, handleScreenplayChange, hasFullAccess,
    importNotice, isScreenplayFormat, lastSaved, saved, saving, sceneComments,
    screenplayApiRef, screenplayEnabled, screenplayFileInputRef, screenplayValue,
    setCurrentElement, setEmphasisState, setError, setScreenplayEnabled,
    setShowTitlePageModal, setTitle, setSaved,
    title, titlePage, titlePageActive, useScreenplayEditor,
    pendingRecovery, acceptPendingRecovery, dismissPendingRecovery,
    sceneSynopses, handleSynopsisChange, handleReorderScene, presenceBySceneId,
    outlineWithSceneIds, canComment, handleAddComment, handleReplyComment,
    handleFocusComment, setCommentResolved, deleteSceneComment, isCommentOrphaned,
    presenceEnabled, collabPeople, scriptId, setScreenplayValue,
  } = useCreateProject();

  const [dockTab, setDockTab] = useState(EDITOR_DOCK_TAB.ELEMENTS);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const overflowRef = useRef(null);
  const competitionEditor = useCompetitionEditorPanel();

  /* The same derivation the desktop focus mode uses, for the same reason: cards
     must key off the identity the LOCKS key off, or a card's lock badge and the
     editor's disagree. The zero-scene document is one lockable unit and not a
     card — the board's own empty state is the honest thing to show there. */
  const cardScenes = useMemo(
    () => getScenes(screenplayValue).filter((scene) => scene.sceneId !== DOC_SCENE_ID),
    [screenplayValue],
  );

  const save = describeSaveState({ saving, saved, lastSaved });

  // The recovery notice's timestamp is the snapshot's, and it is the writer's
  // only way to tell "the work I did on the train" from "something from a week
  // ago" before choosing which copy survives.
  const recoveredAt = pendingRecovery?.updatedAt
    ? new Date(pendingRecovery.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  const applyFormat = (control) => {
    const api = screenplayApiRef?.current;
    if (!api) return;
    if (control.action === "emphasis") api.applyEmphasis(control.kind);
    else if (control.action === "case") api.applyCase(control.kind);
    else if (control.action === "centered") api.applyCentered();
  };

  /* Hoisted out of the descriptor below rather than written inline: the ref is
     only ever read inside the handler, and keeping it out of an object literal
     built during render is what tells `react-hooks/refs` so. */
  const openImportPicker = useCallback((event) => {
    if (enforceGoldPlan(event)) screenplayFileInputRef.current?.click();
  }, [enforceGoldPlan, screenplayFileInputRef]);

  /*
   * The builder decides WHICH items exist; the screen decides what each one
   * does. Keeping the two apart is what lets a unit test read the capability
   * rules ("no publish step for a competition entry") without stubbing four
   * handlers — and it keeps the ref read inside a handler rather than inside an
   * argument evaluated during render.
   */
  const overflowActions = {
    navigator: () => setNavigatorOpen(true),
    comments: () => setCommentsOpen(true),
    people: () => setPeopleOpen(true),
    reports: () => setReportsOpen(true),
    versions: () => setVersionsOpen(true),
    cards: () => setCardsOpen(true),
    import: openImportPicker,
    export: () => setExportOpen(true),
    prose: () => setScreenplayEnabled((value) => !value),
    continue: handleNext,
  };

  const overflowItems = buildEditorOverflowItems({
    canEditContent,
    useScreenplayEditor,
    // Import is gold-plan gated on desktop through `enforceGoldPlan`, which
    // shows the pricing modal when it refuses. The item is offered and the gate
    // answers — hiding it would tell a free writer the feature does not exist.
    canImport: canEditContent && useScreenplayEditor,
    isScreenplayFormat,
    screenplayEnabled,
    hasFullAccess,
    competitionMode,
    exporting: Boolean(exportingScreenplay),
    /* `presenceEnabled` is `useScreenplayEditor && Boolean(scriptId)` — the same
       condition the comment FETCH is gated on upstream. A brand-new unsaved
       draft has no script to hang notes off, so the item is absent rather than
       present-and-empty, which is the placeholder dead end §2.8 forbids. */
    commentsEnabled: Boolean(presenceEnabled),
    openComments: countOpenComments(sceneComments),
    livePeople: Array.isArray(collabPeople) ? collabPeople.length : 0,
  }).map((item) => ({ ...item, onSelect: overflowActions[item.id] }));

  const appBar = (
    <>
      <div className="ckm-editor__bar">
        <IconButton
          icon="chevron_left"
          label="Exit the editor"
          variant="soft"
          className="ckm-editor__bar-exit"
          onClick={handleExitEditor}
        />

        {/* Inline-editable, as on desktop. `setSaved(false)` is not incidental:
            it is what tells the autosave loop the draft signature moved, so a
            title typed and then abandoned is still saved. */}
        <input
          type="text"
          className="ckm-editor__bar-title"
          aria-label="Project title"
          placeholder="Write your title here..."
          value={title}
          readOnly={!canEditContent}
          onChange={(event) => { setTitle(event.target.value); setSaved(false); }}
        />

        {/* One state, never two. `aria-live="polite"` because a save is a status
            change the writer did not ask to be interrupted by — SC 4.1.3. */}
        <span
          className={`ckm-editor__bar-save ckm-editor__bar-save--${save.state}`}
          role="status"
          aria-live="polite"
        >
          <span className="ckm-editor__bar-save-dot" aria-hidden="true" />
          <span className="ckm-editor__bar-save-label">{save.label}</span>
        </span>

        <IconButton
          ref={overflowRef}
          icon="more_vert"
          label="More editor actions"
          variant="soft"
          aria-haspopup="dialog"
          aria-expanded={overflowOpen}
          onClick={() => setOverflowOpen(true)}
        />
        
        {hasFullAccess && !competitionMode && (
          <IconButton
            icon="arrow_forward_ios"
            label="Continue to details"
            variant="soft"
            onClick={overflowActions.continue}
          />
        )}
      </div>

      {/* The banner slot: pinned under the bar rather than in the scroll body,
          because a plan limit or a failed save that scrolls out of sight is a
          message the writer never sees again. */}
      {pendingRecovery && (
        <InlineMessage
          tone="info"
          variant="panel"
          title={`Unsaved changes from this device were found${recoveredAt ? ` (${recoveredAt})` : ""}.`}
          className="ckm-editor__notice"
          action={(
            <>
              <Button size="sm" onClick={acceptPendingRecovery}>Restore my changes</Button>
              <Button size="sm" variant="tertiary" onClick={dismissPendingRecovery}>
                Keep the saved version
              </Button>
            </>
          )}
        >
          The saved version has also changed since then, so these were not restored
          automatically. Restoring replaces what you see now.
        </InlineMessage>
      )}

      {creationBlocked && (
        <InlineMessage tone="warning" variant="panel" title="You've reached your plan's script limit." className="ckm-editor__notice">
          You can keep writing this draft, but publishing another script needs an upgraded plan.
        </InlineMessage>
      )}

      {importNotice && (
        <InlineMessage tone="info" variant="panel" className="ckm-editor__notice">
          {importNotice}
        </InlineMessage>
      )}



      {competitionEditor.panel}
    </>
  );

  return (
    <MobileShell
      mode={EDITOR_SHELL_MODE}
      slots={EDITOR_SHELL_SLOTS}
      screenId="create-project-editor"
      className="ckm-editor"
      scrollClassName="ckm-editor__scroll"
      appBar={appBar}
      bottomNav={useScreenplayEditor ? (
        <EditorDock
          tab={dockTab}
          onTabChange={setDockTab}
          currentElement={currentElement}
          onSelectElement={(value) => screenplayApiRef?.current?.setElementType(value)}
          emphasis={emphasisState}
          onFormat={applyFormat}
          readOnly={!canEditContent}
        />
      ) : null}
      overlays={(
        <>
          <ActionSheet
            open={overflowOpen}
            onClose={() => setOverflowOpen(false)}
            title="Editor"
            items={overflowItems}
            returnFocusTo={overflowRef}
          />

          <ActionSheet
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            title="Export"
            description="A copy is prepared and downloaded to this device."
            items={[
              { id: "pdf", label: "PDF", icon: "picture_as_pdf", onSelect: () => handleExportScreenplay("pdf") },
              { id: "pdf-wm", label: "Watermarked PDF", icon: "branding_watermark", onSelect: () => handleExportScreenplay("pdf-wm") },
              { id: "fountain", label: "Fountain", icon: "description", onSelect: () => handleExportScreenplay("fountain") },
              { id: "fdx", label: "Final Draft (.fdx)", icon: "movie_edit", onSelect: () => handleExportScreenplay("fdx") },
            ]}
          />

          {/* The Navigator (D16). A Sheet, not a Dialog, and the contrast with
              Scene cards below is the whole of D15's rule: this one does not
              replace the script, it is a list you open, pick from, and leave. */}
          <NavigatorSheet
            open={navigatorOpen}
            onClose={() => setNavigatorOpen(false)}
            outline={outlineWithSceneIds}
            screenplayValue={screenplayValue}
            locks={collabLocks}
            myUserId={collabMyUserId}
            presenceBySceneId={presenceBySceneId}
            hasTitlePage={titlePageActive}
            onConfigureTitlePage={() => setShowTitlePageModal(true)}
            onGoToLine={(line) => screenplayApiRef?.current?.scrollToLine?.(line)}
            returnFocusTo={overflowRef}
          />

          {/* Version history (D19). A Dialog — the desktop surface is already a
              modal, just one with no dialog role, no focus trap and no Escape.
              The diff is a second VIEW inside it rather than desktop's expander
              inside a list row, which was a scroller inside a row inside the
              modal's scroller. */}
          <VersionsDialog
            open={versionsOpen}
            onClose={() => setVersionsOpen(false)}
            scriptId={scriptId}
            currentText={screenplayValue}
            onRestored={(fountainText) => {
              setScreenplayValue(fountainText);
              handleScreenplayChange(fountainText);
              setSaved(false);
            }}
            returnFocusTo={overflowRef}
          />

          {/* Reports (D20). A Dialog: inspecting, sorting and downloading a
              long generated report replaces writing for its duration. The
              presentation is mobile-specific, while parsing and file output
              stay shared with the desktop rail. */}
          <ReportsDialog
            open={reportsOpen}
            onClose={() => setReportsOpen(false)}
            value={screenplayValue}
            title={title}
            onJumpScene={(line) => screenplayApiRef?.current?.scrollToLine?.(line)}
            returnFocusTo={overflowRef}
          />

          {/* People (D18). A DIALOG, unlike its neighbour: this replaces the
              writer's task rather than the script — inviting someone, changing
              what they may do, revoking access. It also lets the invite form be
              a SECTION instead of desktop's modal-over-a-panel, which as a
              sheet would have been two modal layers. */}
          <PeopleDialog
            open={peopleOpen}
            onClose={() => setPeopleOpen(false)}
            scriptId={scriptId}
            myUserId={collabMyUserId}
            people={collabPeople}
            returnFocusTo={overflowRef}
          />

          {/* Comments (D17). A Sheet — notes about the script do not replace
              it — but the only one of these surfaces that WRITES, which is why
              it captures its range on open rather than reading the selection at
              submit time the way the desktop rail does. */}
          <CommentsSheet
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            comments={sceneComments}
            canComment={canComment}
            myUserId={collabMyUserId}
            isCommentOrphaned={isCommentOrphaned}
            getSelection={() => screenplayApiRef?.current?.getSelection?.() || null}
            onAddComment={handleAddComment}
            onReplyComment={handleReplyComment}
            onResolveComment={setCommentResolved}
            onDeleteComment={deleteSceneComment}
            onFocusComment={handleFocusComment}
            returnFocusTo={overflowRef}
          />

          {/* Scene cards (D15). A Dialog, not a Sheet: this REPLACES the script
              for its duration rather than sitting contextually above it, which
              is the line Sheet.jsx and Dialog.jsx draw between themselves. Focus
              returns to the overflow button, because that is where the writer
              was — the ActionSheet that listed it has closed by then. */}
          <Dialog
            open={cardsOpen}
            onClose={() => setCardsOpen(false)}
            title="Scene cards"
            description="One card per scene. Reorder them to restructure the script — the page updates with every move."
            closeLabel="Close scene cards"
            returnFocusTo={overflowRef}
            bodyClassName="ckm-editor__cards-body"
          >
            <Corkboard
              className="ckm-editor__cards"
              scenes={cardScenes}
              synopses={sceneSynopses}
              onSynopsisChange={handleSynopsisChange}
              onReorder={handleReorderScene}
              /* Opening a scene is a "take me back to the page" action, so the
                 board closes first and the scroll happens after the dialog has
                 released focus — otherwise the caret moves under a surface the
                 writer is still looking at. */
              onOpenScene={(line) => {
                setCardsOpen(false);
                requestAnimationFrame(() => screenplayApiRef?.current?.scrollToLine?.(line));
              }}
              locks={collabLocks}
              myUserId={collabMyUserId}
              presenceBySceneId={presenceBySceneId}
              canEdit={canEditContent}
              dark={dark}
            />
          </Dialog>

          {/* Unsaved-change protection. Hoisted into `overlays/ExitFlow` when
              the wizard arrived: leaving with unsaved work is one contract, and
              the mode a writer happens to be in must not change what happens to
              their draft. The three-outcome sheet and its discard confirmation
              are unchanged — see that file for why it is a sheet and not a
              two-button dialog. */}
          <ExitFlow />

          {/* The title-page configurator, opened from the TitlePageSheet below.
              A ckm-dialog rather than the desktop modal, which `nativeChrome`
              suppresses: that one has no dialog role, no focus trap and a
              footer that puts "Remove title page" next to "Save changes". */}
          <TitlePageDialog />

          {competitionEditor.overlays}
        </>
      )}
    >
      <div className="ckm-editor__page-stack">
        {/* The title page is a separate sheet above the script, tappable to
            edit — the same object desktop shows, at phone width. */}
        {useScreenplayEditor && titlePageActive && (
          <TitlePageSheet
            fields={titlePage}
            hasTitlePage
            onEdit={() => setShowTitlePageModal(true)}
            dark={dark}
          />
        )}

        <div className="ckm-editor__page">
          {useScreenplayEditor ? (
            <ScreenplayEditor
              value={screenplayValue}
              onChange={handleScreenplayChange}
              onElementChange={setCurrentElement}
              onEmphasisStateChange={setEmphasisState}
              onCaretLine={handleCaretLine}
              locks={collabLocks}
              myUserId={collabMyUserId}
              onRequestEdit={collabRequestEdit}
              comments={sceneComments}
              focusedCommentId={focusedCommentId}
              readOnly={!canEditContent}
              apiRef={screenplayApiRef}
              /* Zoom is the desktop rail's control. On a phone the page is
                 already fitted to the viewport width, so the editor is mounted
                 at whatever the wizard's stored zoom is and the chrome offers no
                 way to change it — pinch-zoom is the platform's answer. */
              zoom={editorZoom}
              dark={dark}
            />
          ) : (
            <div className="ckm-editor__prose">
              <EditorContent editor={editor} />
            </div>
          )}
        </div>
      </div>

      {/* The import path: a file input the overflow item clicks. Kept in the
          scroll body rather than the bar so nothing about it can affect the
          chrome's layout. */}
      <input
        ref={screenplayFileInputRef}
        type="file"
        className="ckm-editor__file"
        accept=".fountain,.txt,.fdx,.pdf,.docx,.doc,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        onChange={handleImportScreenplayFile}
        tabIndex={-1}
        aria-hidden="true"
      />
    </MobileShell>
  );
}
