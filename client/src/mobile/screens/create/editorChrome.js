import { CORE_ELEMENTS, MORE_ELEMENT_GROUPS } from "../../../components/screenplay/screenplayElements";
import { CP_ELEMENT_GLYPH } from "../../../pages/CreateProject/constants";
import { MOBILE_SHELL_MODE } from "../../shell/mobileShellModes";

/*
 * Ckript Mobile — the screenplay editor's chrome model (plan §11 Phase 3,
 * decisions D2–D5 and the approved low-fidelity wireframe of 2026-08-09).
 *
 * Everything here is data, not JSX: what the docked bar contains, what the
 * overflow sheet offers, and which shell slots the editor overrides. Keeping it
 * out of the components is what makes the chrome testable without mounting
 * CodeMirror, and what makes "which controls exist on this bar?" a question with
 * one answer instead of a scan through render code.
 */

/*
 * D2 — the one documented shell-slot override in the app.
 *
 * The editor is an `immersive` surface: it owns the whole viewport and paints
 * its own dark ground. But immersive's default is *no* chrome slots at all, and
 * the editor has two bars it must keep — the top bar (exit · title · save state
 * · overflow) and the docked Elements/Format row.
 *
 * They go in the shell's slots rather than being hand-rolled inside the body for
 * one reason worth stating: the shell's slots are `flex: none` siblings of the
 * one scroll surface, so the docked bar *displaces* the script instead of
 * covering it. A `position: fixed` bar of our own would sit on top of the caret
 * line the writer is typing on, which is the single failure this whole surface
 * exists to avoid.
 *
 * A correction to D2 as written: D2 assumed the manifest entry stays `flow` and
 * step 1 overrides two slots. Under `flow` the app bar is already allowed and
 * the bottom nav already forbidden, so "override two slots" would have been a
 * no-op; the honest expression is immersive + both slots forced back on. The
 * mode this constant belongs to is therefore named alongside it.
 */
export const EDITOR_SHELL_MODE = MOBILE_SHELL_MODE.IMMERSIVE;

export const EDITOR_SHELL_SLOTS = Object.freeze({
  appBar: true,
  bottomNav: true,
});

/*
 * D3/D4 — ONE docked bar with a tab switch, not two stacked bars (approved
 * wireframe, frame B). Two bars would eat ~110px of a 640px-tall viewport with
 * the keyboard up, which is most of what is left of the page.
 */
export const EDITOR_DOCK_TAB = Object.freeze({
  ELEMENTS: "elements",
  FORMAT: "format",
});

export const EDITOR_DOCK_TABS = Object.freeze([
  { id: EDITOR_DOCK_TAB.ELEMENTS, label: "Elements" },
  { id: EDITOR_DOCK_TAB.FORMAT, label: "Format" },
]);

/*
 * The core six, in Tab-cycle order, with the glyph vocabulary the desktop editor
 * already uses. Imported rather than re-listed: a seventh core element added to
 * `screenplayElements.js` must appear here without anyone remembering to do it
 * (D1 — one engine, two chromes).
 */
export const EDITOR_ELEMENT_CHIPS = Object.freeze(
  CORE_ELEMENTS.map((element) => Object.freeze({
    value: element.value,
    label: element.label,
    glyph: CP_ELEMENT_GLYPH[element.value],
    /* The desktop bar shows "Tab 3" as a hint. On a phone there is no Tab key,
       so the number is noise — but it is still the element's position in the
       cycle, which is worth saying to a screen reader that cannot see the row. */
    position: element.tab,
  })),
);

export const EDITOR_MORE_ELEMENT_GROUPS = Object.freeze(
  MORE_ELEMENT_GROUPS.map((group) => Object.freeze(
    group.map((element) => Object.freeze({
      value: element.value,
      label: element.label,
      glyph: CP_ELEMENT_GLYPH[element.value],
    })),
  )),
);

/*
 * D4 — the Format row applies to whatever `apiRef.getSelection()` reports.
 *
 * The desktop pill preserves the selection with `onMouseDown` +
 * `preventDefault()`. That trick has nothing to preserve on touch: there is no
 * mousedown before a touch selection settles, and preventing a synthesized
 * mouse event does not hold a native one. So these are ordinary buttons, and
 * the editor keeps the selection in its own state across the blur.
 *
 * `kind` is the argument to the imperative API; `action` says which method.
 */
export const EDITOR_FORMAT_CONTROLS = Object.freeze([
  { id: "bold", action: "emphasis", kind: "bold", label: "Bold", glyph: "format_bold" },
  { id: "italic", action: "emphasis", kind: "italic", label: "Italic", glyph: "format_italic" },
  { id: "underline", action: "emphasis", kind: "underline", label: "Underline", glyph: "format_underlined" },
  { id: "upper", action: "case", kind: "upper", label: "UPPERCASE", text: "AA" },
  { id: "lower", action: "case", kind: "lower", label: "lowercase", text: "aa" },
  { id: "centered", action: "centered", kind: null, label: "Centre line", glyph: "format_align_center" },
]);

/*
 * D5 — every desktop rail becomes a bottom sheet, summoned one at a time from
 * the overflow. This list is the editor's whole "what else can I do?" surface,
 * so an item that is not built yet is *absent*, never present-and-inert: a menu
 * entry that does nothing is the placeholder dead end §2.8 forbids.
 *
 * Built here (Phase 3 bullet 2): the writing-surface controls and the two exits.
 * Added 2026-08-11: Scene cards, Navigator, Comments, People and Version
 * history. Added 2026-08-12: Reports, the last surface named by bullet 4.
 * (Title page lives in the Navigator's Pages tab, which is where desktop puts
 * it and where DEF-13 shows it was missing.)
 *
 * D15 (2026-08-11) — A CORRECTION TO D5: THE CORKBOARD IS NOT A SHEET.
 *
 * D5 says "every desktop rail becomes a bottom sheet", and for the rails that is
 * right. The corkboard is not a rail. On desktop it is `centerView === "cards"`
 * — the OTHER HALF OF A VIEW SWITCH, which replaces the script page rather than
 * sitting beside it. Our own primitives say what that makes it: Sheet.jsx is
 * documented for "a short, contextual task ... the strip of scrim above it is
 * what says the thing you were doing is still there", and a board of sixty index
 * cards that the writer restructures a screenplay in is not that. Dialog.jsx is
 * documented for "a task that REPLACES the screen for its duration ... picking
 * from a long filtered list", and it is not a route because the desktop view is
 * component state with no URL of its own (§5.2 — nothing here is addressable).
 *
 * So Scene cards is listed here with the sheet items, and opens a `ckm-dialog`.
 * The guard is `useScreenplayEditor`, not `canEditContent`: a reader who cannot
 * edit can still want to see the shape of the script, and the board's own
 * `canEdit` already withholds every control that writes. Prose mode is the real
 * exclusion — a book format has no sluglines, so the board would be empty.
 *
 * Descriptors only: which items exist, and what each one says. The handlers are
 * attached by the screen, keyed on `id`. That split is what keeps this function
 * a pure policy decision that a unit test can read.
 */
export function buildEditorOverflowItems({
  canEditContent = false,
  canImport = false,
  isScreenplayFormat = false,
  screenplayEnabled = false,
  hasFullAccess = false,
  competitionMode = false,
  exporting = false,
  useScreenplayEditor = false,
  openComments = 0,
  commentsEnabled = false,
  livePeople = 0,
} = {}) {
  const items = [];

  /*
   * The two ways to move around a long script come first, because they are what
   * a writer reaches the overflow for most often once a draft exists — import
   * and export are session bookends. Navigator before Scene cards: jumping to a
   * scene is the everyday act, restructuring the script is the occasional one.
   *
   * Both are guarded on `useScreenplayEditor` rather than `canEditContent` — a
   * reader who cannot edit still needs to navigate, and each surface withholds
   * its own writing controls. Prose mode is the real exclusion, since a book
   * format has neither sluglines nor screenplay pages.
   */
  if (useScreenplayEditor) {
    items.push({
      id: "navigator",
      label: "Navigator",
      hint: "Jump to a scene or a page",
      icon: "list",
    });
    items.push({
      id: "cards",
      label: "Scene cards",
      hint: "See the shape of the script, and reorder it",
      icon: "dashboard",
    });
    items.push({
      id: "reports",
      label: "Reports",
      hint: "Scene and character summaries",
      icon: "assessment",
    });
  }

  /*
   * Comments is the one item whose HINT carries live state. Desktop shows the
   * open count on the rail tab, which is visible the whole time; behind an
   * overflow menu the count is the only thing that tells a writer there is
   * anything to look at without opening it. Zero is stated rather than hidden,
   * because "no open comments" and "I have not counted" are different answers.
   *
   * `commentsEnabled` is a collaboration capability, not an editing one — a
   * reader with comment access can comment on a script they cannot edit, and a
   * writer with neither still needs to READ the notes on their own draft, which
   * is why the item appears whenever the surface exists at all.
   */
  if (commentsEnabled) {
    items.push({
      id: "comments",
      label: "Comments",
      hint: openComments === 1 ? "1 open note" : `${openComments} open notes`,
      icon: "chat_bubble",
    });

    /*
     * People sits beside Comments because they are the same conversation: who
     * is on this script, and what they have said about it. Its hint counts the
     * people IN the document right now rather than the access list, because
     * "two people are here" is what changes minute to minute and what a writer
     * opens it to check; the access list changes once a month.
     */
    /*
     * Version history sits with the collaboration items rather than beside
     * Export, because on a shared script "what did it look like on Tuesday" and
     * "who changed it" are the same question.
     *
     * ITS HINT IS STATIC, AND THAT IS DELIBERATE. Comments can say "3 open
     * notes" because the orchestrator already holds them; the version list does
     * not exist until something asks the server for it, and fetching it on every
     * editor mount to populate a line of menu text is the duplicate, noncritical
     * request §15 forbids. The count appears inside the dialog, where the data
     * actually is.
     */
    items.push({
      id: "versions",
      label: "Version history",
      hint: "Snapshots you can come back to",
      icon: "history",
    });

    items.push({
      id: "people",
      label: "People",
      hint: livePeople === 1 ? "1 person here now" : `${livePeople} people here now`,
      icon: "group",
    });
  }

  if (canImport) {
    items.push({
      id: "import",
      label: "Import a script",
      hint: "Fountain, Final Draft, PDF or Word",
      icon: "file_upload",
    });
  }

  items.push({
    id: "export",
    label: "Export",
    hint: exporting ? "Preparing your file…" : "PDF, Fountain or Final Draft",
    icon: "file_download",
    disabled: exporting,
  });

  // Only offered where it is real: prose mode exists for book formats, and the
  // toggle is meaningless — and destructive-looking — on a screenplay-only one.
  if (isScreenplayFormat && canEditContent) {
    items.push({
      id: "prose",
      label: screenplayEnabled ? "Switch to rich text" : "Switch to screenplay",
      hint: screenplayEnabled ? "Write as prose instead" : "Back to screenplay formatting",
      icon: screenplayEnabled ? "notes" : "movie",
    });
  }

  return items;
}

/*
 * The save state as one value, because the three states are mutually exclusive
 * and rendering them from three booleans is how "Saving…" and "Saved" end up on
 * screen at the same time.
 */
export function describeSaveState({ saving = false, saved = false, lastSaved = null } = {}) {
  if (saving) return { state: "saving", label: "Saving…" };
  if (saved) {
    const at = lastSaved instanceof Date && !Number.isNaN(lastSaved.getTime())
      ? lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    return { state: "saved", label: at ? `Saved ${at}` : "Saved" };
  }
  return { state: "unsaved", label: "Unsaved changes" };
}
