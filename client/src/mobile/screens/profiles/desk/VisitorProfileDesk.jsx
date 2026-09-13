import { useCallback, useContext, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../../context/AuthContext";
import { AUTHENTICATED_PROFILE_STATUS } from "../../../../pages/profile/authenticatedProfile";
import { useAuthenticatedProfile } from "../../../../pages/profile/useAuthenticatedProfile";
import {
  readProfileCollectionLocation,
  writeProfileCollectionLocation,
} from "../../../../pages/profile/profileCollections";
import { useProfileCollections } from "../../../../pages/profile/useProfileCollections";
import ActionSheet from "../../../components/overlays/ActionSheet";
import ConfirmDialog from "../../../components/overlays/ConfirmDialog";
import { useToast } from "../../../components/feedback/toastContext";
import MobileShell from "../../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../../shell/mobileShellModes";
import { buildVisitorProfileView } from "../visitor-profile/visitorProfileModel";
import ProfileCollectionsMobile from "../profile-collections/ProfileCollectionsMobile";
import ProfileDesk, { DeskBanner, DeskBar, DeskCta, DeskPortraitViewer, DeskState } from "./ProfileDesk";
import {
  DeskAct,
  DeskActions,
  DeskChips,
  DeskEmpty,
  DeskFactRow,
  DeskIdentity,
  DeskLabel,
  DeskLeadProject,
  DeskList,
  DeskLoading,
  DeskPanel,
  DeskProjectGrid,
  DeskProjectTile,
  DeskStats,
  DeskTabList,
} from "./ProfileDeskParts";
import { DeskComposeSheet, DeskPickList, DeskRevealSheet } from "./ProfileDeskSheets";
import {
  DESK_ASK,
  DESK_TAB,
  DESK_VIEWER,
  deskAsk,
  deskAbout,
  deskAudienceOf,
  deskProjects,
  deskQuota,
  deskRefusal,
  deskStats,
  deskStatus,
  deskTabs,
  readDeskTab,
  writeDeskTab,
} from "./profileDeskModel";
import { resolveMediaUrl } from "../../../../utils/mediaUrl";
import "./ProfileDesk.css";

/*
 * VisitorProfileDesk — somebody else's profile, signed in.
 *
 * The prototype's 2a (writer, "Slate") and 2b (producer, "Deal desk") are this
 * one screen. It is a DETAIL surface, not a tab root: the prototype's bar opens
 * with a back chevron, and that is the honest reading — you arrive here from a
 * search result, a message or a share link, and the way out is back.
 *
 * WHAT THE DOCK IS FOR. The prototype docks a script request on 2a and a
 * meeting booking on 2b — in both cases the one ask that costs the viewer
 * something. Ours are the two the product actually meters: a writer's contact
 * details, and a pitch to an investor. Everything cheap (follow, message,
 * share) stays in the row under the name, so the dock never changes meaning
 * out from under the thumb.
 */

const AUDIENCE_BACK = Object.freeze({
  writer: { label: "Writers", to: "/search?scope=people" },
  industry: { label: "Industry", to: "/search?scope=people" },
});

const EMPTY_PANEL = Object.freeze({
  [DESK_TAB.WORK]: {
    icon: "description",
    title: "No scripts published yet",
    body: "This writer has not made any work public. Follow them to hear when the first script lands.",
  },
  [DESK_TAB.MANDATE]: {
    icon: "policy",
    title: "No mandate published",
    body: "This member has not said what they are reading for yet.",
  },
});

/*
 * `previewData` / `previewCollection` are the same fixture seam ProjectDetail
 * already uses (mobile/dev/ProjectDetailHarness.jsx): this screen is
 * personalized end to end, so the only way to look at the same pixels twice is
 * to hand it the payload instead of the network. They are never passed in
 * production — MobileRoutes mounts the screen without them.
 */
/*
 * `profileState` is supplied by AuthenticatedProfileRoute, which fetches above
 * the owner/visitor split so that ownership is decided from the loaded profile
 * rather than from the URL — see the note there. When it is absent (the preview
 * fixtures and the render tests mount this screen directly) the screen falls
 * back to fetching its own, so there is exactly one code path in production and
 * the standalone mounts keep working.
 */
export default function VisitorProfileDesk({
  user,
  profileState: suppliedState = null,
  previewData = null,
  previewCollection = null,
}) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setUser } = useContext(AuthContext);
  const toast = useToast();

  const moreRef = useRef(null);
  const messageRef = useRef(null);
  const dockRef = useRef(null);
  const [sheet, setSheet] = useState(null);
  const [message, setMessage] = useState("");
  const [pitchScripts, setPitchScripts] = useState([]);
  const [pitchDraft, setPitchDraft] = useState({ scriptId: "", note: "" });
  const [portraitOpen, setPortraitOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const handleCanonicalPath = useCallback((path) => {
    if (path && path !== location.pathname) navigate(`${path}${location.search}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const liveState = useAuthenticatedProfile({
    profileKey: (previewData || suppliedState) ? "" : id,
    viewer: user,
    setViewer: setUser,
    onCanonicalPath: handleCanonicalPath,
  });
  const ownState = previewData ? { ...liveState, ...previewData } : liveState;
  const profileState = suppliedState || ownState;

  const ready = profileState.status === AUTHENTICATED_PROFILE_STATUS.READY;
  const collectionLocation = readProfileCollectionLocation(searchParams, { own: false });
  const liveCollection = useProfileCollections({
    profileId: profileState.profile?._id,
    section: "activity",
    page: collectionLocation.page,
    enabled: ready && !previewData,
  });
  const collectionState = previewCollection ? { ...liveCollection, ...previewCollection } : liveCollection;

  const view = useMemo(() => buildVisitorProfileView({
    profile: profileState.profile || {},
    scripts: profileState.scripts,
    viewer: user,
    relationship: profileState.relationship,
    contact: profileState.contact,
    contactStats: profileState.contactStats,
  }), [profileState.contact, profileState.contactStats, profileState.profile, profileState.relationship, profileState.scripts, user]);

  const projects = useMemo(() => deskProjects(profileState.scripts), [profileState.scripts]);
  const about = useMemo(() => deskAbout(view), [view]);
  const tabs = useMemo(() => deskTabs({ view, viewer: DESK_VIEWER.VISITOR }), [view]);
  const tab = readDeskTab(searchParams, tabs);
  const audience = deskAudienceOf(view);
  const ask = useMemo(() => deskAsk({ view, signedIn: true }), [view]);
  const quota = useMemo(() => deskQuota(view), [view]);

  const selectTab = useCallback((key) => {
    setSearchParams(writeDeskTab(searchParams, key), { replace: true });
  }, [searchParams, setSearchParams]);

  const updateCollectionLocation = useCallback((_section, page = 1) => {
    setSearchParams(writeProfileCollectionLocation(searchParams, { section: "activity", page }));
  }, [searchParams, setSearchParams]);

  const reloadProfile = profileState.reload;
  const reloadCollections = collectionState.reload;
  const reloadAll = useCallback(() => {
    reloadProfile();
    reloadCollections();
  }, [reloadCollections, reloadProfile]);

  /* The hook's own stable callback, not the object it hangs off: `profileState`
     is a conditional (see the fixture seam above) and would be a new identity
     on every render. */
  const clearActionError = profileState.clearActionError;
  const closeSheet = useCallback(() => {
    setSheet(null);
    clearActionError();
  }, [clearActionError]);

  /* --- The loading and refusal surfaces --------------------------------- */

  if (profileState.status === AUTHENTICATED_PROFILE_STATUS.LOADING) {
    return (
      <MobileShell mode={MOBILE_SHELL_MODE.DETAIL} screenId="profile-visitor" scrollClassName="ckm-desk__scroll">
        <div className="ckm-desk">
          <DeskBar back={AUDIENCE_BACK.writer} title="Profile" />
          <DeskLoading shape="shelf" label="Loading this profile…" />
        </div>
      </MobileShell>
    );
  }

  if (!ready) {
    const refusal = deskRefusal(profileState.status);
    const canRequest = profileState.status === AUTHENTICATED_PROFILE_STATUS.PRIVATE
      && Boolean(profileState.failure?.profileId);
    return (
      <MobileShell mode={MOBILE_SHELL_MODE.DETAIL} screenId="profile-visitor" scrollClassName="ckm-desk__scroll">
        <div className="ckm-desk">
          <DeskBar back={AUDIENCE_BACK.writer} title="Profile" />
          <DeskState
            icon={refusal.icon}
            title={refusal.title}
            body={profileState.actionError || profileState.failure?.message || refusal.body}
          >
            {canRequest ? (
              <DeskCta
                label={profileState.relationship.followRequestPending ? "Cancel follow request" : "Send follow request"}
                pending={profileState.pending.follow}
                onClick={profileState.follow}
              />
            ) : null}
            {profileState.status === AUTHENTICATED_PROFILE_STATUS.RESTRICTED
              ? <DeskCta label="See access options" tone="accent" to="/pricing" />
              : null}
            {profileState.status === AUTHENTICATED_PROFILE_STATUS.FAILED
              ? <DeskCta label="Try again" onClick={profileState.reload} />
              : null}
          </DeskState>
        </div>
      </MobileShell>
    );
  }

  /* --- Actions ---------------------------------------------------------- */

  const submitMessage = async () => {
    if (!await profileState.sendMessage(message)) return;
    setMessage("");
    setSheet(null);
    toast.success("Message sent", `Your conversation with ${view.name} has started.`);
  };

  const openPitch = async () => {
    setSheet("pitch");
    profileState.clearActionError();
    const result = await profileState.loadPitchScripts();
    if (!result.ok) return;
    setPitchScripts(result.data);
    setPitchDraft((current) => ({ ...current, scriptId: current.scriptId || result.data[0]?._id || "" }));
  };

  const submitPitch = async () => {
    if (!await profileState.sendPitch(pitchDraft)) return;
    setSheet(null);
    setPitchDraft({ scriptId: "", note: "" });
    toast.success("Pitch sent", `${view.name} can now review your project.`);
  };

  const revealContact = async () => {
    if (!await profileState.revealContact()) return;
    toast.success("Contact revealed", "One reveal was deducted from this period's allowance.");
  };

  const confirmBlock = async () => {
    if (!await profileState.toggleBlock()) return;
    setBlockOpen(false);
    toast.success("Member blocked", "Following and messaging are now unavailable.");
  };

  const shareProfile = async () => {
    const url = `${window.location.origin}/share/profile/${encodeURIComponent(id || view.name)}`;
    try {
      if (navigator.share) await navigator.share({ title: view.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied", "The profile link is on your clipboard.");
      }
    } catch {
      // A cancelled share sheet and a clipboard the browser will not grant are
      // the same thing from here: the viewer simply did not get a link, and
      // saying so is more use than a success they did not earn.
      toast.info("Nothing was copied", url);
    }
  };

  const openDock = () => {
    if (ask.kind === DESK_ASK.PITCH) return openPitch();
    if (ask.kind === DESK_ASK.MESSAGE) return setSheet("message");
    return setSheet("reveal");
  };

  /* --- Chrome ----------------------------------------------------------- */

  const status = deskStatus({ view, profile: profileState.profile || {} });
  const statCells = deskStats(view);
  const baseId = "ckm-desk-visitor";

  const bar = (
    <DeskBar
      back={AUDIENCE_BACK[audience] || AUDIENCE_BACK.writer}
      title={view.name}
      action={{ label: "More options", icon: "more_horiz", onClick: () => setSheet("more"), buttonRef: moreRef }}
    />
  );

  const dock = ask.kind === DESK_ASK.NONE ? null : (
    <DeskCta
      label={ask.label}
      icon={ask.icon}
      tone={ask.tone}
      pending={profileState.pending.contact || profileState.pending.pitch}
      onClick={openDock}
    />
  );

  const overlays = (
    <>
      <DeskPortraitViewer
        open={portraitOpen}
        src={view.image ? resolveMediaUrl(view.image) : ""}
        name={view.name}
        caption={view.role}
        onClose={() => setPortraitOpen(false)}
      />

      <ActionSheet
        open={sheet === "more"}
        onClose={closeSheet}
        title={view.name}
        description={view.role}
        returnFocusTo={moreRef}
        items={[
          { id: "share", label: "Share profile", icon: "ios_share", onSelect: shareProfile },
          view.blockedByCurrent
            ? {
              id: "unblock",
              label: `Unblock ${view.name}`,
              icon: "lock_open",
              onSelect: async () => {
                if (await profileState.toggleBlock()) toast.success("Member unblocked");
              },
            }
            : {
              id: "block",
              label: `Block ${view.name}`,
              icon: "block",
              destructive: true,
              onSelect: () => {
                profileState.clearActionError();
                setSheet(null);
                setBlockOpen(true);
              },
            },
        ]}
      />

      <DeskComposeSheet
        open={sheet === "message"}
        onClose={closeSheet}
        title={`Message ${view.name}`}
        hint="Say which script you read and what you are offering."
        value={message}
        onChange={setMessage}
        onSend={submitMessage}
        pending={profileState.pending.message}
        error={profileState.actionError}
        returnFocusTo={messageRef}
      />

      <DeskComposeSheet
        open={sheet === "pitch"}
        onClose={closeSheet}
        title={`Pitch to ${view.name}`}
        hint="Add a note about why this project is right for them (optional)."
        sendLabel="Send pitch"
        value={pitchDraft.note}
        onChange={(note) => setPitchDraft((current) => ({ ...current, note }))}
        onSend={submitPitch}
        pending={profileState.pending.pitch}
        error={profileState.actionError}
        returnFocusTo={dockRef}
        requireText={false}
        canSend={Boolean(pitchDraft.scriptId)}
      >
        <DeskPickList
          options={pitchScripts.map((script) => ({ value: script._id, label: script.title || "Untitled project" }))}
          value={pitchDraft.scriptId}
          onChange={(scriptId) => setPitchDraft((current) => ({ ...current, scriptId }))}
          emptyLabel="You have no projects to pitch yet. Publish one first."
        />
      </DeskComposeSheet>

      <DeskRevealSheet
        open={sheet === "reveal"}
        onClose={closeSheet}
        name={view.name}
        quota={quota}
        contact={view.contact}
        pending={profileState.pending.contact}
        error={profileState.actionError}
        onConfirm={revealContact}
        returnFocusTo={dockRef}
      />

      <ConfirmDialog
        open={blockOpen}
        onCancel={() => setBlockOpen(false)}
        onConfirm={confirmBlock}
        title={`Block ${view.name}?`}
        message="You will stop following each other, and neither of you will be able to follow or message the other until you unblock them."
        confirmLabel="Block member"
        destructive
        pending={profileState.pending.block}
        error={profileState.actionError}
        returnFocusTo={moreRef}
      />
    </>
  );

  return (
    <ProfileDesk
      mode={MOBILE_SHELL_MODE.DETAIL}
      screenId="profile-visitor"
      audience={audience}
      bar={bar}
      dock={dock}
      overlays={overlays}
      onConnectionRestored={reloadAll}
    >
      {profileState.actionError && !sheet && !blockOpen ? (
        <DeskBanner
          tone="error"
          icon="error"
          title="That did not go through"
          body={profileState.actionError}
          action={{ label: "Retry", onClick: reloadAll }}
        />
      ) : null}

      {view.blockedByProfile ? (
        <DeskBanner
          tone="ink"
          icon="block"
          title="This member has blocked you"
          body="You cannot follow or message them."
        />
      ) : view.blockedByCurrent ? (
        <DeskBanner
          tone="ink"
          icon="block"
          title={`You blocked ${view.name}`}
          body="Unblock from the options menu to follow or message them again."
        />
      ) : null}

      <DeskIdentity
        name={view.name}
        image={view.image}
        verified={view.credentials.length > 0 || view.professional}
        role={[view.role, view.location].filter(Boolean).join(" · ")}
        status={status}
        onPortrait={view.image ? () => setPortraitOpen(true) : null}
      />

      <DeskActions>
        <DeskAct
          label={view.followLabel}
          solid={!profileState.relationship.isFollowing && !profileState.relationship.followRequestPending}
          disabled={!view.canFollow}
          pending={profileState.pending.follow}
          onClick={profileState.follow}
        />
        {view.canMessage ? (
          <DeskAct
            label="Message"
            icon="mail"
            buttonRef={messageRef}
            onClick={() => { profileState.clearActionError(); setSheet("message"); }}
          />
        ) : null}
        <DeskAct label="Share profile" icon="ios_share" iconOnly onClick={shareProfile} />
      </DeskActions>

      <DeskStats cells={statCells} onSelect={selectTab} label={`${view.name}'s totals`} />

      <DeskTabList tabs={tabs} value={tab} onChange={selectTab} baseId={baseId} label={`${view.name}'s sections`} />

      {tab === DESK_TAB.WORK ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          {projects.length ? (
            <>
              <DeskLeadProject
                project={projects[0]}
                to={`/share/project/${encodeURIComponent(projects[0].id)}`}
                flag={projects[0].flag}
              />
              {projects.length > 1 ? (
                <DeskProjectGrid>
                  {projects.slice(1).map((project) => (
                    <DeskProjectTile
                      key={project.id}
                      project={project}
                      to={`/share/project/${encodeURIComponent(project.id)}`}
                    />
                  ))}
                </DeskProjectGrid>
              ) : null}
            </>
          ) : (
            <DeskEmpty {...EMPTY_PANEL[DESK_TAB.WORK]} />
          )}
        </DeskPanel>
      ) : null}

      {tab === DESK_TAB.MANDATE ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          {view.mandates?.genres?.length || view.mandates?.formats?.length || about.length ? (
            <>
              {about.length ? (
                <DeskList tall>
                  {about.map(([label, value]) => <DeskFactRow key={label} label={label} value={value} />)}
                </DeskList>
              ) : null}
              {view.mandates?.genres?.length ? (
                <>
                  <DeskLabel first={!about.length}>Reading for</DeskLabel>
                  <DeskChips values={view.mandates.genres} />
                </>
              ) : null}
              {view.mandates?.formats?.length ? (
                <>
                  <DeskLabel>Formats</DeskLabel>
                  <DeskChips values={view.mandates.formats} />
                </>
              ) : null}
              <p className="ckm-desk__footnote">
                Unsolicited files are not read. Reach out through Ckript and the request is logged against your account.
              </p>
            </>
          ) : (
            <DeskEmpty {...EMPTY_PANEL[DESK_TAB.MANDATE]} />
          )}
        </DeskPanel>
      ) : null}

      {tab === DESK_TAB.ABOUT ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          <p className="ckm-desk__prose">{view.bio}</p>

          {about.length && view.writer ? (
            <DeskList>
              {about.map(([label, value]) => <DeskFactRow key={label} label={label} value={value} />)}
            </DeskList>
          ) : null}

          {view.credentials.length ? (
            <>
              <DeskLabel>Verified</DeskLabel>
              <DeskChips values={view.credentials} />
            </>
          ) : null}

          {view.skills.length ? (<><DeskLabel>Skills</DeskLabel><DeskChips values={view.skills} /></>) : null}
          {view.genres.length ? (<><DeskLabel>Genres</DeskLabel><DeskChips values={view.genres} /></>) : null}
          {view.tags.length ? (<><DeskLabel>Specialized tags</DeskLabel><DeskChips values={view.tags} /></>) : null}

          {view.links.length ? (
            <>
              <DeskLabel>Links</DeskLabel>
              <DeskList>
                {view.links.map((link) => (
                  <DeskFactRow key={link.url} label={link.label} value="Open" href={link.url} chevron />
                ))}
              </DeskList>
            </>
          ) : null}

          {view.writer ? (
            <>
              <DeskLabel>Contact</DeskLabel>
              {view.contact ? (
                <DeskList>
                  {view.contact.email ? <DeskFactRow label="Email" value={view.contact.email} /> : null}
                  {view.contact.phone ? <DeskFactRow label="Phone" value={view.contact.phone} /> : null}
                  {view.contact.links.map((link) => (
                    <DeskFactRow key={link.key} label={link.label} value="Open" href={link.url} chevron />
                  ))}
                </DeskList>
              ) : (
                <p className="ckm-desk__footnote">
                  {view.canReveal
                    ? view.contactLimitReached
                      ? `You have used all ${view.contactLimit} contact reveals for this period.`
                      : `${view.contactRemaining} of ${view.contactLimit} contact reveals remain. Reveal from the button below.`
                    : "Contact details are not available for this profile or account."}
                </p>
              )}
            </>
          ) : null}
        </DeskPanel>
      ) : null}

      {tab === DESK_TAB.ACTIVITY ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          <ProfileCollectionsMobile
            state={collectionState}
            section="activity"
            page={collectionLocation.page}
            onLocationChange={updateCollectionLocation}
          />
        </DeskPanel>
      ) : null}
    </ProfileDesk>
  );
}
