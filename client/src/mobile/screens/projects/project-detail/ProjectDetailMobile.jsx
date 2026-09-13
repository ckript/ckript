/*
 * ProjectDetailMobile — the native authenticated project-detail screen (D28 read, D29 write).
 *
 * It serves all THREE route forms — `/script/:id`, `/script/:heading/:writer` and the root-level
 * `/:heading/:writer` — because the server resolves all three to one payload and one canonical
 * path. The screen does not know which alias it was reached by; `useProjectDetail` does, and
 * rewrites the URL to the canonical one exactly as the desktop page always has.
 *
 * WHAT THIS SCREEN IS
 * -------------------
 * D28 built "read the project": load and canonicalize, the three failure states, the header, the
 * role-aware recommended action, the sections, the trailer, the reader, bookmark and public share.
 * D29 added the writes that go with them — request a purchase, decide on one, review or rate,
 * reveal a contact, open a conversation, ask for a meeting, and the owner's own edit and delete.
 *
 * The rule D28 set — a missing BUTTON never means a missing FACT — did not go away when the
 * buttons arrived; it inverted. Every action that is NOT offered still says why in words, because
 * the reasons are real product states: a quota spent this month, an account type that cannot buy,
 * an editor locked while an admin reviews a submission, a competition entry that cannot be
 * deleted. A phone has no tooltip and no hover, so a greyed-out control is a dead end the viewer
 * cannot inspect. There are no disabled controls on this screen for that reason: an action is
 * either live or replaced by the sentence that explains its absence.
 *
 * WHAT IT DELIBERATELY DROPS FROM THE DESKTOP WORKBENCH
 * ----------------------------------------------------
 *   • The eight-tab rail. On a phone, tabs hide four fifths of a page the viewer is trying to
 *     read end to end; the sections are stacked and the recommended action scrolls to one.
 *   • The readiness meter and its five-stage journey chrome. `deriveScriptJourney` is still the
 *     source for what is readable and what is complete, but a writer-facing progress dial on a
 *     buyer's screen is desktop-era decoration.
 *   • AI-trailer purchase, the hold modal and the invoice tools: owner/finance surfaces with their
 *     own phases.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AuthContext } from "../../../../context/AuthContext";
import {
  assertReview,
  requestCalendarConnectUrl,
} from "../../../../pages/script-detail/projectActions";
import {
  deriveScriptJourney,
  getRecommendedAction,
  getViewerCapabilities,
} from "../../../../pages/script-detail/scriptDetailModel";
import {
  PROJECT_DETAIL_STATUS,
  useProjectDetail,
} from "../../../../pages/script-detail/useProjectDetail";
import { useProjectActions } from "../../../../pages/script-detail/useProjectActions";
import {
  getMeetingsLimit,
  getMessageWritersLimit,
  getRemainingMeetings,
  getRemainingMessageWriters,
  hasAnyFipAccess,
  hasMessagedWriter,
  hasScheduledMeeting,
} from "../../../../utils/industryAccess";
import { resolveMediaUrl } from "../../../../utils/mediaUrl";
import { getProfileCanonicalPath } from "../../../../utils/profilePath";
import PageHeader from "../../../components/app-bars/PageHeader";
import Badge from "../../../components/badges/Badge";
import Button from "../../../components/buttons/Button";
import IconButton from "../../../components/buttons/IconButton";
import EmptyState from "../../../components/EmptyState";
import InlineMessage from "../../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../../components/feedback/Skeletons";
import { useToast } from "../../../components/feedback/toastContext";
import TextArea from "../../../components/forms/TextArea";
import TrailerDialog from "../../../components/media/TrailerDialog";
import ConfirmDialog from "../../../components/overlays/ConfirmDialog";
import Sheet from "../../../components/overlays/Sheet";
import MobileShell from "../../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../../shell/mobileShellModes";
import { shareProject } from "../../../data/shareProject";
import MeetingSheet from "../../../components/meetings/MeetingSheet";
import { emptyMeetingDraft } from "../../../components/meetings/meetingModel";
import FeedbackSheet from "./components/FeedbackSheet";
import ProjectReaderDialog from "./components/ProjectReaderDialog";
import ProjectSection from "./components/ProjectSection";
import PurchaseRequestList from "./components/PurchaseRequestList";
import PurchaseRequestSheet from "./components/PurchaseRequestSheet";
import { StarReadout } from "./components/StarRating";
import {
  buildDealTerms,
  buildEvidence,
  buildStoryFacts,
  describeCompletionProgress,
  describeContactStanding,
  describeCredit,
  describeFeedbackStanding,
  describeMeetingStanding,
  describeMessageStanding,
  describeOwnerManage,
  describeProjectStatus,
  describePurchaseAction,
  describeReaderAccess,
  describeTransactionStanding,
  formatMoney,
  getSection,
  resolveRecommendedAction,
} from "./projectDetailModel";
import "./ProjectDetailMobile.css";

const has = (value) => String(value ?? "").trim().length > 0;

function ProjectDetailLoading() {
  return (
    <SkeletonGroup label="Loading this project" className="ckm-project__loading">
      <SkeletonShape height={180} radius="var(--ckm-r-lg)" />
      <SkeletonShape height={96} radius="var(--ckm-r-lg)" />
      <SkeletonShape height={220} radius="var(--ckm-r-lg)" />
    </SkeletonGroup>
  );
}

export default function ProjectDetailMobile({
  user: userProp = undefined,
  previewData = null,
  canonicalize = true,
  backTo = "/search",
  screenId = "project-detail",
  /*
   * The lists the API would have supplied, for the sweep harness only.
   *
   * `previewData` settles the PROJECT; these settle the three collections that arrive separately —
   * the writer's incoming requests, the reviews, and this viewer's own rating. Without them a
   * sweep of the owner's screen measures an empty list and reports the decision controls as
   * absent, which is the "a sweep only measures what it rendered" failure the D28 entry recorded.
   * They are a separate prop rather than extra keys on the payload so nothing can mistake a
   * fixture for something the server sends.
   */
  previewLists = null,
}) {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const auth = useContext(AuthContext);
  const user = userProp ?? auth?.user ?? null;

  const detail = useProjectDetail({
    id: params.id,
    projectHeading: params.projectHeading,
    writerUsername: params.writerUsername,
    user,
    pathname: location.pathname,
    onCanonicalPath: canonicalize ? (path) => navigate(path, { replace: true }) : undefined,
    // The harness supplies a settled project so a five-width sweep measures the same screen twice.
    enabled: !previewData,
  });

  const script = previewData ?? detail.script;
  const status = previewData ? PROJECT_DETAIL_STATUS.READY : detail.status;

  /*
   * One `notify`, and it is the toast.
   *
   * The desktop page raises a notice strip that lives inside the page and scrolls with it. On a
   * phone the control that started the write is frequently inside a sheet the viewer is about to
   * close, so the confirmation has to survive that close — which is what the app-level toast layer
   * is for, and why it is exempt from the overlay inertness sweep.
   */
  const notify = useCallback((message, tone = "success") => {
    if (tone === "error") toast.error(message);
    else toast.success(message);
  }, [toast]);

  const actions = useProjectActions({
    script,
    user,
    setUser: auth?.setUser || null,
    refresh: detail.refresh,
    notify,
    enabled: !previewData,
  });

  const [trailerOpen, setTrailerOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  /*
   * Every sheet's DRAFT lives here, not in the sheet.
   *
   * A sheet stays mounted while closed (its exit animation needs it to), so a sheet that seeded
   * its own fields would have to do it in an effect keyed on `open` — and an effect that writes
   * state is an effect that can wipe what the user typed on any unrelated re-render. Seeding
   * happens in the handler that opens the sheet, which is the same arrangement the discovery
   * filter dialog uses and the only one where "when is this reset" has a single answer.
   */
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseNote, setPurchaseNote] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState({ rating: 0, comment: "" });
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingDraft, setMeetingDraft] = useState(emptyMeetingDraft());
  const [approveTarget, setApproveTarget] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [declineNote, setDeclineNote] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const sectionRefs = useRef({});

  const capabilities = useMemo(() => getViewerCapabilities({ script: script || {}, user: user || {} }), [script, user]);
  const journey = useMemo(() => deriveScriptJourney({ script: script || {}, capabilities }), [script, capabilities]);
  const recommended = useMemo(
    () => getRecommendedAction({ script: script || {}, capabilities, journey }),
    [script, capabilities, journey],
  );

  const reader = useMemo(
    () => describeReaderAccess({ script: script || {}, capabilities, journey }),
    [script, capabilities, journey],
  );
  const projectStatus = useMemo(() => describeProjectStatus(script || {}), [script]);
  const transaction = useMemo(
    () => describeTransactionStanding({ script: script || {}, capabilities }),
    [script, capabilities],
  );
  const purchase = useMemo(
    () => describePurchaseAction({ script: script || {}, capabilities }),
    [script, capabilities],
  );
  const contact = useMemo(
    () => describeContactStanding({
      script: script || {},
      capabilities,
      revealed: actions.revealedContact,
      stats: actions.revealStats,
    }),
    [script, capabilities, actions.revealedContact, actions.revealStats],
  );
  const requests = previewLists?.requests ?? actions.requests;
  const reviews = previewLists?.reviews ?? actions.reviews;
  const myReview = previewLists?.myReview ?? actions.myReview;
  const myRating = previewLists?.myRating ?? actions.myRating;

  const feedback = useMemo(
    () => describeFeedbackStanding({ script: script || {}, capabilities, myReview, myRating }),
    [script, capabilities, myReview, myRating],
  );
  const manage = useMemo(
    () => describeOwnerManage({ script: script || {}, capabilities }),
    [script, capabilities],
  );

  const writerId = String(script?.creator?._id || "");
  const entitled = hasAnyFipAccess(user);
  const messaging = useMemo(() => describeMessageStanding({
    script: script || {},
    capabilities,
    entitled,
    alreadyMessaged: hasMessagedWriter(user, writerId),
    remaining: getRemainingMessageWriters(user),
    limit: getMessageWritersLimit(user),
  }), [script, capabilities, entitled, user, writerId]);
  const meeting = useMemo(() => describeMeetingStanding({
    capabilities,
    entitled,
    alreadyScheduled: hasScheduledMeeting(user, writerId),
    // The server's own answer to "how many are left" wins once it has given one, because it
    // counted the meeting that was just booked and the cached account has not.
    remaining: actions.meetingStats?.remainingMeetings ?? getRemainingMeetings(user),
    limit: actions.meetingStats?.meetingsLimit ?? getMeetingsLimit(user),
  }), [capabilities, entitled, user, writerId, actions.meetingStats]);

  const action = useMemo(
    () => resolveRecommendedAction({ recommended, reader, script: script || {} }),
    [recommended, reader, script],
  );

  /*
   * The two feedback lists are fetched only when they can say something.
   *
   * Reviews are read when the project has any, or when this viewer could write one; producer
   * ratings when the project has any, or when this viewer could leave one. A detail screen that
   * always fired both would add two authenticated requests to every project open on a mobile
   * connection for sections most viewers cannot act on.
   */
  const scriptId = String(script?._id || "");
  const wantsReviews = Number(script?.reviewCount || 0) > 0 || Boolean(capabilities.reader);
  const wantsRatings = Number(script?.producerRating?.count || 0) > 0 || Boolean(capabilities.industry);
  const { loadReviews, loadRatings } = actions;
  useEffect(() => {
    if (previewData || !scriptId) return;
    if (wantsReviews) loadReviews({ page: 1 });
    if (wantsRatings) loadRatings();
  }, [previewData, scriptId, wantsReviews, wantsRatings, loadReviews, loadRatings]);

  const scrollToSection = useCallback((sectionId) => {
    const node = sectionRefs.current[sectionId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    // Moving the viewport is not moving focus. A section reached by the recommended action has to
    // become the keyboard's position too, or the next Tab returns to the top of the page.
    node.focus?.({ preventScroll: true });
  }, []);

  const onShare = useCallback(async () => {
    const outcome = await shareProject(script);
    if (outcome === "copied") toast.success("Link copied", script?.title);
    if (outcome === "failed") toast.error("Could not share this project", "Copy the link from your browser instead.");
  }, [script, toast]);

  const runAction = useCallback(() => {
    if (action.kind === "reader") setReaderOpen(true);
    else if (action.kind === "trailer") setTrailerOpen(true);
    else if (action.kind === "link") navigate(action.to);
    else scrollToSection(action.section);
  }, [action, navigate, scrollToSection]);

  const onMessageWriter = useCallback(async () => {
    const path = await actions.messageWriter();
    if (path) navigate(path);
  }, [actions, navigate]);

  const onConnectCalendar = useCallback(async () => {
    setConnecting(true);
    const result = await requestCalendarConnectUrl({
      returnTo: `${location.pathname}${location.search || ""}`,
    });
    if (!result.ok) {
      setConnecting(false);
      toast.error(result.message);
      return;
    }
    // A full-page redirect out of the app, not a route change: the consent page is Google's.
    window.location.href = result.data.url;
  }, [location.pathname, location.search, toast]);

  const onDelete = useCallback(async () => {
    const removed = await actions.remove();
    if (!removed) return;
    setDeleteOpen(false);
    toast.success("Project removed", script?.title);
    navigate(getProfileCanonicalPath(user || {}, { viewerId: user?._id, viewerRole: user?.role }), { replace: true });
  }, [actions, navigate, script?.title, toast, user]);

  /*
   * Opening a sheet is also what SEEDS it.
   *
   * A producer changing an existing rating starts from what they gave last time; everyone else
   * starts from empty. Doing that here rather than inside the sheet means "when does this reset"
   * has one answer — at the tap that opened it — instead of depending on which prop changed last.
   */
  const openPurchase = useCallback(() => {
    setPurchaseNote("");
    setPurchaseOpen(true);
  }, []);

  const openFeedback = useCallback(() => {
    const existing = feedback.mode === "review" ? myReview : myRating;
    setFeedbackDraft({
      rating: Number(existing?.rating || 0),
      comment: String((feedback.mode === "review" ? existing?.comment : existing?.review) || ""),
    });
    setFeedbackOpen(true);
  }, [feedback.mode, myReview, myRating]);

  const openMeeting = useCallback(() => {
    setMeetingDraft({
      ...emptyMeetingDraft(script?.title || ""),
      // The connect leg is shown BEFORE the form when we already know the calendar is missing,
      // rather than after three fields have been typed and lost to a redirect.
      needsCalendar: !user?.googleCalendar?.connected,
    });
    setMeetingOpen(true);
  }, [script?.title, user?.googleCalendar?.connected]);

  const onFeedbackSubmit = useCallback(async ({ rating, comment }) => {
    if (feedback.mode === "review") return actions.submitReview({ rating, comment });
    const saved = await actions.submitRating({ rating, review: comment });
    return Boolean(saved);
  }, [actions, feedback.mode]);

  const header = (
    <PageHeader
      title={script?.title || (status === PROJECT_DETAIL_STATUS.LOADING ? "Loading project" : "Project")}
      eyebrow={script ? describeCredit(script) : ""}
      backTo={backTo}
      backLabel="Back"
      actions={script ? (
        <>
          {detail.canBookmark && (
            <IconButton
              icon={detail.isBookmarked ? "bookmark" : "bookmark_add"}
              label={`${detail.isBookmarked ? "Remove" : "Save"} ${script.title || "this project"}`}
              active={detail.isBookmarked}
              disabled={detail.bookmarkPending}
              onClick={detail.toggleBookmark}
            />
          )}
          <IconButton icon="ios_share" label={`Share ${script.title || "this project"}`} onClick={onShare} />
        </>
      ) : null}
    />
  );

  const shell = (children, overlays = null) => (
    <MobileShell
      mode={MOBILE_SHELL_MODE.DETAIL}
      screenId={screenId}
      className="ckm-project"
      scrollClassName="ckm-project__scroll"
      appBar={header}
      onConnectionRestored={detail.reload}
      overlays={overlays}
    >
      {children}
    </MobileShell>
  );

  if (status === PROJECT_DETAIL_STATUS.LOADING) return shell(<ProjectDetailLoading />);

  /*
   * BLOCKED is not an error and does not offer a retry.
   *
   * The viewer's account is the reason, so the two ways forward are the two the desktop page
   * offers — sign up with a business email, or buy the plan — and pressing "try again" on a
   * decision the server will keep making is the trap this state exists to avoid.
   */
  if (status === PROJECT_DETAIL_STATUS.BLOCKED) {
    return shell(
      <EmptyState
        icon="lock"
        titleAs="h2"
        title="This project needs a verified industry account"
        body={detail.failure?.message || "You need a business email or a plan to open this project."}
        actions={(
          <>
            <Button variant="primary" to="/pricing">See industry plans</Button>
            <Button variant="secondary" to="/search">Browse projects</Button>
          </>
        )}
      />,
    );
  }

  if (status === PROJECT_DETAIL_STATUS.ERROR || !script) {
    const notFound = Boolean(detail.failure?.notFound);
    return shell(
      notFound ? (
        <EmptyState
          icon="search_off"
          titleAs="h2"
          title="This project is not here"
          body="The link may be out of date, or the writer may have removed the project."
          actions={<Button variant="secondary" to="/search">Browse projects</Button>}
        />
      ) : (
        <InlineMessage
          variant="panel"
          title="This project could not be loaded"
          onRetry={detail.reload}
        >
          {detail.failure?.message || "Check your connection and try again."}
        </InlineMessage>
      ),
    );
  }

  const cover = resolveMediaUrl(script.trailerThumbnail || script.coverImage || "");
  const storyFacts = buildStoryFacts(script);
  const evidence = buildEvidence(script);
  const dealTerms = buildDealTerms(script);
  const completion = describeCompletionProgress(script);
  const registerSection = (id) => (node) => { sectionRefs.current[id] = node; };
  const producerAggregate = script.producerRating || {};

  return shell(
    <>
      <div className="ckm-project__hero">
        {cover
          ? <img className="ckm-project__cover" src={cover} alt="" />
          : <img className="ckm-project__cover" src="/common-thumbnail.png" alt="" />}
        <div className="ckm-project__hero-meta">
          <Badge tone={projectStatus.tone}>{projectStatus.label}</Badge>
          <Badge tone="neutral" variant="outline">{formatMoney(script.price)}</Badge>
          {journey.hasTrailer && (
            <Button variant="tertiary" icon="play_circle" onClick={() => setTrailerOpen(true)}>
              Trailer
            </Button>
          )}
        </div>
        <p className="ckm-project__status-detail">{projectStatus.detail}</p>
      </div>

      {/*
        * The recommended action is one control and it is always honest about where it goes: it
        * either opens the reader, opens the trailer, leaves for payment or the editor, or scrolls
        * to the section that explains the situation. It is never a disabled button.
        */}
      <div className="ckm-project__action">
        <Button variant="primary" onClick={runAction} className="ckm-project__action-button">
          {action.label}
        </Button>
        <p className="ckm-project__standing" data-tone={transaction.tone}>
          <b>{transaction.headline}.</b> {transaction.note}
        </p>
      </div>

      {has(script.logline) && <p className="ckm-project__logline">{script.logline}</p>}

      <ProjectSection section={getSection("story")} ref={registerSection("story")}>
        {has(script.synopsis)
          ? <p className="ckm-project__prose">{script.synopsis}</p>
          : <p className="ckm-project__muted">The writer has not added a synopsis yet.</p>}
        {completion && <p className="ckm-project__note">{completion}</p>}
        {storyFacts.length > 0 && (
          <dl className="ckm-project__facts">
            {storyFacts.map((fact) => (
              <div key={fact.key}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {Array.isArray(script.tags) && script.tags.length > 0 && (
          <ul className="ckm-project__tags">
            {script.tags.slice(0, 12).map((tag) => (
              <li key={String(tag)}><Badge size="sm">{String(tag)}</Badge></li>
            ))}
          </ul>
        )}
      </ProjectSection>

      <ProjectSection section={getSection("read")} ref={registerSection("read")}>
        <p className="ckm-project__prose">{reader.note}</p>
        {reader.canOpen ? (
          <Button variant="secondary" icon="auto_stories" onClick={() => setReaderOpen(true)}>
            {reader.label}
          </Button>
        ) : (
          <p className="ckm-project__muted">Nothing to open yet.</p>
        )}
      </ProjectSection>

      <ProjectSection section={getSection("evidence")} ref={registerSection("evidence")}>
        {evidence.length > 0 ? (
          <ul className="ckm-project__evidence">
            {evidence.map((row) => (
              <li key={row.key}>
                <span className="ckm-project__evidence-value">{row.value}</span>
                <span className="ckm-project__evidence-label">{row.label}</span>
                <span className="ckm-project__evidence-note">{row.note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ckm-project__muted">
            This project has not been evaluated or reviewed yet, so there is nothing here to weigh.
          </p>
        )}
      </ProjectSection>

      <ProjectSection section={getSection("feedback")} ref={registerSection("feedback")}>
        {Number(producerAggregate.count || 0) > 0 && (
          <p className="ckm-project__aggregate">
            <StarReadout value={producerAggregate.average} count={producerAggregate.count} />
            <span>
              {Number(producerAggregate.average || 0).toFixed(1)} from {producerAggregate.count}
              {" "}
              {Number(producerAggregate.count) === 1 ? "industry rating" : "industry ratings"}
            </span>
          </p>
        )}

        <p className="ckm-project__prose"><b>{feedback.headline}.</b> {feedback.note}</p>

        {feedback.mode === "rating" && myRating && (
          <p className="ckm-project__note">
            You gave {Number(myRating.rating || 0)}/5
            {has(myRating.review) ? `: “${myRating.review}”` : "."}
          </p>
        )}
        {feedback.mode === "review" && myReview && (
          <p className="ckm-project__note">
            You gave {Number(myReview.rating || 0)}/5
            {has(myReview.comment) ? `: “${myReview.comment}”` : "."}
          </p>
        )}

        {(feedback.canSubmit || (feedback.mode === "rating" && myRating)) && (
          <Button variant="secondary" icon="rate_review" onClick={openFeedback}>
            {feedback.label}
          </Button>
        )}

        {reviews.length > 0 && (
          <ul className="ckm-project__reviews">
            {reviews.map((review) => (
              <li key={review._id}>
                <p className="ckm-project__review-head">
                  <span>{review?.user?.name || "A reader"}</span>
                  <StarReadout value={review?.rating} />
                </p>
                <p className="ckm-project__review-body">{review?.comment}</p>
              </li>
            ))}
          </ul>
        )}
        {actions.reviewsTotal > reviews.length && (
          <p className="ckm-project__muted">
            Showing {reviews.length} of {actions.reviewsTotal} reviews.
          </p>
        )}
      </ProjectSection>

      <ProjectSection section={getSection("deal")} ref={registerSection("deal")}>
        <dl className="ckm-project__facts ckm-project__facts--deal">
          {dealTerms.map((term) => (
            <div key={term.key}>
              <dt>{term.label}</dt>
              <dd>{term.value}</dd>
            </div>
          ))}
        </dl>
        {has(script?.legal?.customInvestorTerms) && capabilities.canPurchase && (
          <>
            <h3 className="ckm-project__subhead">The writer&apos;s own conditions</h3>
            <p className="ckm-project__prose">{script.legal.customInvestorTerms}</p>
          </>
        )}
      </ProjectSection>

      <ProjectSection
        section={getSection("purchase", capabilities.owner ? "Purchase requests" : "")}
        ref={registerSection("purchase")}
      >
        {capabilities.owner ? (
          <PurchaseRequestList
            requests={requests}
            loading={actions.requestsLoading}
            decidingId={actions.decidingId}
            onApprove={setApproveTarget}
            onDecline={(row) => { setDeclineNote(""); setDeclineTarget(row); }}
          />
        ) : (
          <>
            <p className="ckm-project__prose">{purchase.note}</p>
            {purchase.kind === "request" && (
              <Button variant="primary" icon="shopping_bag" onClick={openPurchase}>
                {purchase.label}
              </Button>
            )}
            {purchase.kind === "payment" && (
              <Button variant="primary" icon="payments" to={purchase.to}>{purchase.label}</Button>
            )}
          </>
        )}
      </ProjectSection>

      <ProjectSection section={getSection("contact")} ref={registerSection("contact")}>
        <p className="ckm-project__prose">{contact.headline}.</p>
        <p className="ckm-project__note">{contact.note}</p>

        {contact.available && contact.contact && (
          <dl className="ckm-project__facts">
            {contact.contact.email && (
              <div><dt>Email</dt><dd><a href={`mailto:${contact.contact.email}`}>{contact.contact.email}</a></dd></div>
            )}
            {contact.contact.phone && (
              <div><dt>Phone</dt><dd><a href={`tel:${contact.contact.phone}`}>{contact.contact.phone}</a></dd></div>
            )}
          </dl>
        )}

        {contact.id === "can-reveal" && (
          <Button
            variant="secondary"
            icon="contact_page"
            pending={actions.revealPending}
            pendingLabel="Revealing…"
            onClick={actions.revealContact}
          >
            Reveal contact details
          </Button>
        )}
        {actions.revealError && (
          <InlineMessage variant="inline" tone="error" title="">{actions.revealError}</InlineMessage>
        )}

        {!capabilities.owner && (
          <div className="ckm-project__writer-actions">
            <div>
              {messaging.canAct ? (
                <Button
                  variant="secondary"
                  icon="chat"
                  pending={actions.messagePending}
                  pendingLabel="Opening…"
                  onClick={onMessageWriter}
                >
                  {messaging.label}
                </Button>
              ) : null}
              <p className="ckm-project__note">{messaging.note}</p>
            </div>
            <div>
              {meeting.canAct ? (
                <Button variant="secondary" icon="event" onClick={openMeeting}>
                  {meeting.label}
                </Button>
              ) : null}
              <p className="ckm-project__note">{meeting.note}</p>
            </div>
          </div>
        )}

        <Button
          variant="tertiary"
          to={getProfileCanonicalPath(script.creator || {}, { viewerId: user?._id, viewerRole: user?.role })}
        >
          Open writer profile
        </Button>
      </ProjectSection>

      {manage.visible && (
        <ProjectSection section={getSection("manage")} ref={registerSection("manage")}>
          <p className="ckm-project__note">{manage.editNote}</p>
          {manage.canEdit && (
            <Button variant="secondary" icon="edit" to={manage.editPath}>Edit this project</Button>
          )}
          <p className="ckm-project__note">{manage.deleteNote}</p>
          {manage.canDelete && (
            <Button variant="destructive" icon="delete" onClick={() => setDeleteOpen(true)}>
              Delete this project
            </Button>
          )}
        </ProjectSection>
      )}
    </>,
    <>
      <TrailerDialog
        key={script._id || "no-trailer"}
        open={trailerOpen}
        project={script}
        onClose={() => setTrailerOpen(false)}
      />
      <ProjectReaderDialog
        open={readerOpen}
        script={script}
        reader={reader}
        onClose={() => setReaderOpen(false)}
      />
      <PurchaseRequestSheet
        open={purchaseOpen}
        projectTitle={script.title}
        price={formatMoney(script.price)}
        note={purchaseNote}
        onNoteChange={setPurchaseNote}
        pending={actions.requestPending}
        onSubmit={actions.submitPurchaseRequest}
        onClose={() => setPurchaseOpen(false)}
      />
      <FeedbackSheet
        open={feedbackOpen}
        title={feedback.mode === "review" ? "Write a review" : "Rate this project"}
        description={script.title}
        ratingLabel={feedback.mode === "review" ? "Your rating out of 5" : "Your producer rating out of 5"}
        commentLabel={feedback.mode === "review" ? "Your review" : "Notes for the writer"}
        commentHint={feedback.mode === "review"
          ? "Public to the writer and to other members."
          : "Optional. Only the rating is required."}
        commentRequired={feedback.mode === "review"}
        draft={feedbackDraft}
        onDraftChange={setFeedbackDraft}
        submitLabel={feedback.mode === "review" ? "Submit review" : "Save rating"}
        pending={feedback.mode === "review" ? actions.reviewSubmitting : actions.ratingSubmitting}
        validate={feedback.mode === "review"
          ? assertReview
          : ({ rating }) => (rating ? "" : "Choose a rating before saving.")}
        onSubmit={onFeedbackSubmit}
        onClose={() => setFeedbackOpen(false)}
      />
      <MeetingSheet
        open={meetingOpen}
        writerName={script?.creator?.name || "the writer"}
        projectTitle={script.title}
        draft={meetingDraft}
        onDraftChange={setMeetingDraft}
        pending={actions.meetingPending}
        connecting={connecting}
        onSubmit={actions.requestMeeting}
        onConnect={onConnectCalendar}
        onClose={() => setMeetingOpen(false)}
      />

      {/*
        * Approving is confirmed, and the confirmation says the part the desktop page never did:
        * an approval locks this project to that one buyer for three days, and a second approval is
        * refused until the first either pays or lapses. That is not a detail — it is the whole
        * consequence of the tap, and the writer learns it from the server's refusal otherwise.
        */}
      <ConfirmDialog
        open={Boolean(approveTarget)}
        title="Approve this request?"
        message={approveTarget
          ? `${approveTarget.name} will be asked to pay ${approveTarget.amount}. This project is held for them for three days — you cannot approve anyone else until they pay or the approval lapses.`
          : ""}
        confirmLabel="Approve request"
        cancelLabel="Not yet"
        pending={Boolean(approveTarget) && actions.decidingId === approveTarget.id}
        onCancel={() => setApproveTarget(null)}
        onConfirm={async () => {
          const done = await actions.approveRequest(approveTarget?.id);
          if (done) setApproveTarget(null);
        }}
      />

      <Sheet
        open={Boolean(declineTarget)}
        onClose={() => setDeclineTarget(null)}
        title="Decline this request"
        description={declineTarget ? `${declineTarget.name} · ${declineTarget.amount}` : ""}
        footer={(
          <Button
            variant="primary"
            fullWidth
            pending={Boolean(declineTarget) && actions.decidingId === declineTarget.id}
            pendingLabel="Declining…"
            onClick={async () => {
              const done = await actions.rejectRequest(declineTarget?.id, declineNote);
              if (done) setDeclineTarget(null);
            }}
          >
            Decline request
          </Button>
        )}
      >
        <TextArea
          label="Reason (they will see this)"
          hint="A sentence is enough. Declining does not stop them asking again later."
          value={declineNote}
          onChange={(event) => setDeclineNote(event.target.value)}
          rows={4}
          maxLength={500}
          optional
        />
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        destructive
        title={`Remove “${script.title}”?`}
        message={manage.deleteConfirm || ""}
        confirmLabel="Remove project"
        cancelLabel="Keep it"
        pending={actions.deletePending}
        error={actions.deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={onDelete}
      />
    </>,
  );
}
