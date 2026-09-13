import { useCallback, useContext, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../../context/AuthContext";
import { AUTHENTICATED_PROFILE_STATUS } from "../../../../pages/profile/authenticatedProfile";
import { updateAccountSettings } from "../../../../pages/profile/accountSecurity";
import { deleteOwnProject } from "../../../../pages/profile/ownerInbox";
import { OWNER_INBOX_STATUS, useOwnerInbox } from "../../../../pages/profile/useOwnerInbox";
import {
  mergeOwnProfileUpdate,
  saveOwnProfile,
  uploadOwnProfileImage,
} from "../../../../pages/profile/profileEditor";
import { useAuthenticatedProfile } from "../../../../pages/profile/useAuthenticatedProfile";
import {
  readProfileCollectionLocation,
  removeSavedProjectFromViewer,
  writeProfileCollectionLocation,
} from "../../../../pages/profile/profileCollections";
import { useProfileCollections } from "../../../../pages/profile/useProfileCollections";
import { useToast } from "../../../components/feedback/toastContext";
import ActionSheet from "../../../components/overlays/ActionSheet";
import ConfirmDialog from "../../../components/overlays/ConfirmDialog";
import NavBar from "../../../components/navigation/NavBar";
import MobileShell from "../../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../../shell/mobileShellModes";
import { buildOwnerProfileView } from "../owner-profile/ownerProfileModel";
import ProfileCollectionsMobile from "../profile-collections/ProfileCollectionsMobile";
import ProfileDesk, { DeskBanner, DeskBar, DeskCta, DeskState } from "./ProfileDesk";
import ProfileEditorDialog from "./ProfileEditorDialog";
import {
  DeskCaughtUp,
  DeskChips,
  DeskEmpty,
  DeskFactRow,
  DeskIdentity,
  DeskLabel,
  DeskList,
  DeskLoading,
  DeskPanel,
  DeskProgress,
  DeskRequestCard,
  DeskStackRow,
  DeskStats,
  DeskSwitchRow,
  DeskTabList,
} from "./ProfileDeskParts";
import {
  DESK_TAB,
  DESK_VIEWER,
  deskAbout,
  deskAudienceOf,
  deskOwnerStats,
  deskProjects,
  deskStatus,
  deskTabs,
  readDeskTab,
  writeDeskTab,
} from "./profileDeskModel";
import "./ProfileDesk.css";

/*
 * OwnerProfileDesk — your own profile. Prototype 2c ("My profile") and 2d
 * ("My desk").
 *
 * IT IS NOT THE VISITOR SCREEN WITH AN EDIT BUTTON, and that was the mistake
 * this file was rewritten to correct. The two screens share a frame — bar,
 * identity, stat strip, segmented control, dock — and share nothing below it,
 * because they answer different questions. A visitor asks "who is this and what
 * have they written?". An owner asks "what is waiting on me, and what am I
 * showing the world?". So the panels are:
 *
 *   Scripts / Queue — your work, with the controls only you get: status,
 *                     views, and the overflow that can delete it.
 *   Requests        — the inbox. Meeting requests and follow requests are the
 *                     same event and are answered in the same card.
 *   Saved           — your collections, which no visitor can see.
 *   About           — the facts, every row an entry point to the editor.
 *
 * The tab set itself lives in `DESK_IA` rather than in an `own` flag, so the
 * two audiences can never quietly collapse into one again.
 *
 * TWO SWITCHES, ONE MUTATION. 2c's "Open to work" toggle is what decides
 * whether anybody can find you. Ours are the two real settings behind it —
 * `isPrivate` and, for a writer, `allowIndustryContact` — both written through
 * the same `updateAccountSettings` that Account & security calls.
 */

/*
 * `previewData` / `previewCollection` / `previewInbox` are the fixture seam
 * ProjectDetail already uses. This screen is personalized end to end, so the
 * only way to look at the same pixels twice is to hand it the payload instead
 * of the network. MobileRoutes mounts it without them.
 */
/*
 * `profileState` is supplied by AuthenticatedProfileRoute, which fetches above
 * the owner/visitor split so that ownership is decided from the loaded profile
 * rather than from the URL — see the note there. When it is absent (the preview
 * fixtures and the render tests mount this screen directly) the screen falls
 * back to fetching its own, so there is exactly one code path in production and
 * the standalone mounts keep working.
 */
export default function OwnerProfileDesk({
  user,
  profileState: suppliedState = null,
  previewData = null,
  previewCollection = null,
  previewInbox = null,
}) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setUser } = useContext(AuthContext);
  const toast = useToast();

  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [settingBusy, setSettingBusy] = useState("");
  const [scriptSheet, setScriptSheet] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletedIds, setDeletedIds] = useState([]);
  const profileKey = id || user?._id;

  const canonicalize = useCallback((path) => {
    if (path && path !== location.pathname) navigate(`${path}${location.search}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  /* An empty key is how this file already disables the fetch for a preview; a
     supplied state disables it for the same reason. */
  const liveState = useAuthenticatedProfile({
    profileKey: (previewData || suppliedState) ? "" : profileKey,
    viewer: user,
    onCanonicalPath: canonicalize,
  });
  const ownState = previewData ? { ...liveState, ...previewData } : liveState;
  const profileState = suppliedState || ownState;
  const ready = profileState.status === AUTHENTICATED_PROFILE_STATUS.READY;

  const collectionLocation = readProfileCollectionLocation(searchParams, { own: true });
  const liveCollection = useProfileCollections({
    profileId: profileState.profile?._id,
    section: collectionLocation.section,
    page: collectionLocation.page,
    enabled: ready && !previewData,
  });
  const collectionState = previewCollection ? { ...liveCollection, ...previewCollection } : liveCollection;

  const liveInbox = useOwnerInbox({ viewerId: user?._id, enabled: ready && !previewInbox });
  const inbox = previewInbox ? { ...liveInbox, ...previewInbox } : liveInbox;

  const view = useMemo(() => buildOwnerProfileView({
    profile: profileState.profile || {},
    scripts: profileState.scripts,
    purchasedScripts: profileState.purchasedScripts,
    bookmarkedScripts: profileState.bookmarkedScripts,
    collectionCounts: collectionState.data?.counts,
  }), [collectionState.data?.counts, profileState.bookmarkedScripts, profileState.profile, profileState.purchasedScripts, profileState.scripts]);

  /* A deleted project is soft-deleted: the server keeps it and Account &
     security still lists it, but it must leave this shelf immediately or the
     row the owner just deleted sits there until the next fetch. */
  const projects = useMemo(
    () => deskProjects(profileState.scripts).filter((project) => !deletedIds.includes(project.id)),
    [deletedIds, profileState.scripts],
  );
  const about = useMemo(() => deskAbout(view), [view]);
  const audience = deskAudienceOf(view);
  /* The queue is the source of truth for the badge once it has loaded. Until
     then — and if it fails — the profile payload's own pending-follow count is
     the weaker but still true answer, so a badge is never wrong by omission
     just because one of two endpoints was slow. */
  const waiting = inbox.status === OWNER_INBOX_STATUS.READY
    ? inbox.pending
    : view.pendingFollowRequests;
  const tabs = useMemo(
    () => deskTabs({ view, viewer: DESK_VIEWER.OWNER, counts: { [DESK_TAB.INBOX]: waiting } }),
    [view, waiting],
  );
  const tab = readDeskTab(searchParams, tabs);

  const selectTab = useCallback((key) => {
    setSearchParams(writeDeskTab(searchParams, key), { replace: true });
  }, [searchParams, setSearchParams]);

  const updateCollectionLocation = useCallback((section, page = 1) => {
    setSearchParams(writeProfileCollectionLocation(searchParams, { section, page }));
  }, [searchParams, setSearchParams]);

  const syncViewer = useCallback((update) => {
    const next = mergeOwnProfileUpdate(user || {}, update || {});
    setUser(next);
    try {
      localStorage.setItem("user", JSON.stringify(next));
    } catch {
      // The authenticated in-memory profile remains authoritative when storage
      // is unavailable (private mode, quota exhaustion, or test environments).
    }
  }, [setUser, user]);

  const reloadProfile = profileState.reload;
  const reloadCollections = collectionState.reload;
  const reloadInbox = inbox.reload;
  const reloadAll = useCallback(() => {
    reloadProfile();
    reloadCollections();
    reloadInbox();
  }, [reloadCollections, reloadInbox, reloadProfile]);

  /* --- Loading and failure ---------------------------------------------- */

  const bareShell = (children) => (
    <MobileShell
      mode={MOBILE_SHELL_MODE.STANDARD}
      screenId="profile-owner"
      scrollClassName="ckm-desk__scroll"
      bottomNav={<NavBar user={user} />}
    >
      <div className="ckm-desk">
        <DeskBar own title="My profile" />
        {children}
      </div>
    </MobileShell>
  );

  if (profileState.status === AUTHENTICATED_PROFILE_STATUS.LOADING) {
    return bareShell(<DeskLoading shape="rows" label="Loading your profile…" />);
  }

  if (!ready) {
    return bareShell(
      <DeskState
        icon="cloud_off"
        title="Could not load your profile"
        body={profileState.failure?.message || "Check your connection and try again."}
      >
        <DeskCta label="Try again" onClick={profileState.reload} />
      </DeskState>,
    );
  }

  /* --- Mutations --------------------------------------------------------- */

  const save = async (draft) => {
    if (saving) return { ok: false, message: "A profile update is already in progress." };
    setSaving(true);
    setEditorError("");
    try {
      const result = await saveOwnProfile({ draft, profile: profileState.profile });
      if (!result.ok) {
        setEditorError(result.message);
        return result;
      }
      profileState.applyProfileUpdate(result.data);
      syncViewer(result.data);
      toast.success("Profile updated", "Your identity and professional overview are current.");
      if (result.data?.canonicalPath && result.data.canonicalPath !== location.pathname) {
        navigate(result.data.canonicalPath, { replace: true });
      }
      return result;
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file) => {
    if (uploading) return { ok: false, message: "An image upload is already in progress." };
    setUploading(true);
    setEditorError("");
    try {
      const result = await uploadOwnProfileImage(file);
      if (!result.ok) {
        setEditorError(result.message);
        return result;
      }
      profileState.applyProfileUpdate(result.data);
      syncViewer(result.data);
      return result;
    } finally {
      setUploading(false);
    }
  };

  /* One mutation for both switches, and it is the same one Account & security
     calls. The optimistic path is deliberately absent: a visibility control
     that says "public" while the server still says "private" is the worst of
     both, so the switch waits and the row is disabled while it does. */
  const changeSetting = async (key, payload, message) => {
    if (settingBusy) return;
    setSettingBusy(key);
    try {
      const result = await updateAccountSettings(payload);
      if (!result.ok) {
        toast.error("That did not save", result.message);
        return;
      }
      profileState.applyProfileUpdate(result.data?.user || payload);
      syncViewer(result.data?.user || payload);
      toast.success(message);
    } finally {
      setSettingBusy("");
    }
  };

  const decideAsk = async (item, accept) => {
    const result = await inbox.decide(item, accept);
    if (!result.ok) {
      toast.error("That did not go through", result.message);
      return;
    }
    if (item.kind === "follow") {
      toast.success(accept ? `${item.name} can now follow you` : "Request removed");
      /* The banner and the manage row both count pending follow requests from
         the profile payload, which has not changed — keep them honest. */
      profileState.applyProfileUpdate({
        pendingFollowRequestCount: Math.max(0, view.pendingFollowRequests - 1),
      });
      return;
    }
    toast.success(accept ? "Meeting accepted" : "Meeting declined");
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const result = await deleteOwnProject(deleteTarget.id);
      if (!result.ok) {
        setDeleteError(result.message);
        return;
      }
      setDeletedIds((current) => [...current, deleteTarget.id]);
      setDeleteTarget(null);
      toast.success(`“${deleteTarget.title}” was deleted`, "It stays in Account & security until you clear it.");
      window.dispatchEvent(new CustomEvent("scriptDeleted", { detail: { id: deleteTarget.id } }));
    } finally {
      setDeleting(false);
    }
  };

  const removeSaved = async (projectId) => {
    const result = await collectionState.removeSaved(projectId);
    if (!result.ok) return;
    setUser((current) => {
      if (!current) return current;
      const next = removeSavedProjectFromViewer(current, projectId, result.data?.source);
      try { localStorage.setItem("user", JSON.stringify(next)); } catch { /* memory state remains authoritative */ }
      return next;
    });
    if (result.pageBecameEmpty) updateCollectionLocation("bookmarks", collectionLocation.page - 1);
    toast.success("Removed from saved projects");
    window.dispatchEvent(new CustomEvent("bookmarkUpdated", {
      detail: { scriptId: projectId, bookmarked: false, source: result.data?.source },
    }));
  };

  /* --- Chrome ------------------------------------------------------------ */

  const profile = profileState.profile || {};
  const isPrivate = Boolean(profile.isPrivate);
  const openToContact = profile.allowIndustryContact !== false;
  /* The dot belongs to the switch below, not to the name — see DeskIdentity. */
  const status = { meta: deskStatus({ view, profile }).meta };
  const openEditor = () => { setEditorError(""); setEditorOpen(true); };
  const baseId = "ckm-desk-owner";

  const bar = (
    <DeskBar
      own
      title={view.writer ? "My profile" : "My desk"}
      action={{ label: "Edit", onClick: openEditor }}
    />
  );

  const dock = view.writer
    ? <DeskCta label="Add a project" icon="add" to="/create-project" />
    : <DeskCta label="Post a mandate" icon="add" to="/mandates" />;

  const overlays = (
    <>
      {editorOpen ? (
        <ProfileEditorDialog
          open={editorOpen}
          profile={profileState.profile}
          pending={saving}
          uploadPending={uploading}
          error={editorError}
          onClose={() => { setEditorOpen(false); setEditorError(""); }}
          onSave={save}
          onUpload={upload}
        />
      ) : null}

      <ActionSheet
        open={Boolean(scriptSheet)}
        onClose={() => setScriptSheet(null)}
        title={scriptSheet?.title}
        description={scriptSheet?.statusDetail}
        items={scriptSheet ? [
          { id: "open", label: "Open the project", icon: "open_in_new", to: `/script/${encodeURIComponent(scriptSheet.id)}` },
          { id: "manage", label: "Edit in your dashboard", icon: "edit", to: "/dashboard" },
          {
            id: "delete",
            label: "Delete the project",
            icon: "delete",
            destructive: true,
            onSelect: () => { setScriptSheet(null); setDeleteError(""); setDeleteTarget(scriptSheet); },
          },
        ] : []}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Delete “${deleteTarget?.title || ""}”?`}
        message="It comes off your profile and out of search straight away. Account & security keeps a record, and only our team can restore it."
        confirmLabel="Delete project"
        destructive
        pending={deleting}
        error={deleteError}
      />
    </>
  );

  return (
    <ProfileDesk
      mode={MOBILE_SHELL_MODE.STANDARD}
      screenId="profile-owner"
      audience={audience}
      bar={bar}
      dock={dock}
      bottomNav={<NavBar user={user} />}
      overlays={overlays}
      onConnectionRestored={reloadAll}
    >
      {isPrivate ? (
        <DeskBanner
          tone="ink"
          icon="visibility_off"
          title="Your profile is hidden"
          body="Only approved followers can see it, and you will not appear in search."
          action={{
            label: "Unhide",
            pending: settingBusy === "privacy",
            onClick: () => changeSetting("privacy", { isPrivate: false }, "You are discoverable again"),
          }}
        />
      ) : null}

      <DeskIdentity
        name={view.name}
        image={view.image}
        verified={view.professional}
        role={[view.role, view.location].filter(Boolean).join(" · ")}
        status={status}
        editable
        onPortrait={openEditor}
      />

      <DeskSwitchRow
        label={isPrivate ? "Private account" : "Discoverable"}
        note={isPrivate
          ? "Only approved followers can see your profile."
          : "Producers and writers can find you in search."}
        checked={!isPrivate}
        pending={settingBusy === "privacy"}
        controlLabel="Discoverable in search"
        onChange={(next) => changeSetting(
          "privacy",
          { isPrivate: !next },
          next ? "You are discoverable again" : "Your profile is hidden",
        )}
      />

      {view.writer ? (
        <DeskSwitchRow
          label={openToContact ? "Open to contact" : "Not taking contact"}
          note="Verified industry professionals may spend a credit to see your contact details."
          checked={openToContact}
          pending={settingBusy === "contact"}
          controlLabel="Open to industry contact"
          onChange={(next) => changeSetting(
            "contact",
            { allowIndustryContact: next },
            next ? "You are open to industry contact" : "Industry contact is off",
          )}
        />
      ) : null}

      {!view.completion.isComplete ? (
        <DeskProgress
          percent={view.completion.percentage}
          label={`Profile ${view.completion.percentage}% complete`}
          cta={view.completion.totalFields
            ? `${view.completion.completedFields} of ${view.completion.totalFields}`
            : "Finish it"}
          onClick={openEditor}
        />
      ) : null}

      <DeskStats cells={deskOwnerStats(view)} onSelect={selectTab} label="Your totals" />

      <DeskTabList tabs={tabs} value={tab} onChange={selectTab} baseId={baseId} label="Your profile sections" />

      {/* --- Your work ---------------------------------------------------- */}
      {tab === DESK_TAB.WORK ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          {projects.length ? (
            <>
              <DeskList tall>
                {projects.map((project) => (
                  <DeskStackRow
                    key={project.id}
                    title={project.title}
                    meta={[project.metaPlain, project.views ? `${project.views.toLocaleString("en-US")} views` : ""]
                      .filter(Boolean).join(" · ")}
                    score={project.badge}
                    pill={{ label: project.statusLabel, tone: project.statusTone }}
                    to={`/script/${encodeURIComponent(project.id)}`}
                    onMore={() => setScriptSheet(project)}
                    moreLabel={`Options for ${project.title}`}
                  />
                ))}
              </DeskList>
              <p className="ckm-desk__footnote">
                Drafts and projects in review are visible only to you. Deleting one is not reversible from here.
              </p>
            </>
          ) : (
            <DeskEmpty
              icon="note_add"
              title="No projects yet"
              body="Upload a script and Ckript builds its title page, page count and scene index for you."
              action={{ label: "Add a project", to: "/create-project" }}
            />
          )}
        </DeskPanel>
      ) : null}

      {/* --- What is waiting on you --------------------------------------- */}
      {tab === DESK_TAB.INBOX ? (
        <DeskPanel tabKey={tab} baseId={baseId} rows>
          {inbox.status === OWNER_INBOX_STATUS.LOADING ? (
            <DeskLoading shape="cards" label="Loading what needs you…" />
          ) : inbox.status === OWNER_INBOX_STATUS.FAILED ? (
            <DeskEmpty
              icon="cloud_off"
              title="Could not load your requests"
              body={inbox.error || "Check your connection and try again."}
              action={{ label: "Try again", onClick: inbox.reload, quiet: true }}
            />
          ) : inbox.items.length ? (
            <>
              {inbox.items.map((item) => (
                <DeskRequestCard
                  key={item.key}
                  item={item}
                  pending={inbox.actingKey === item.key}
                  disabled={Boolean(inbox.actingKey) && inbox.actingKey !== item.key}
                  onDecide={decideAsk}
                />
              ))}
              {inbox.pending === 0 ? <DeskCaughtUp>All caught up — nothing waiting on you.</DeskCaughtUp> : null}
              {inbox.error ? <p className="ckm-desk__footnote">{inbox.error}</p> : null}
              <p className="ckm-desk__footnote">
                Declining is quiet — the other person only sees that you did not accept.
              </p>
            </>
          ) : (
            <DeskEmpty
              icon="mark_email_unread"
              title="Nothing waiting on you"
              body={view.writer
                ? "Meeting requests from producers and follow requests land here."
                : "Follow requests and the meetings writers accept land here."}
              action={{ label: "Share your profile", to: "/profile?tab=about", quiet: true }}
            />
          )}
        </DeskPanel>
      ) : null}

      {/* --- What you are reading for (industry) --------------------------- */}
      {tab === DESK_TAB.MANDATE ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          {about.length || view.mandates?.genres?.length || view.mandates?.formats?.length ? (
            <>
              <DeskList tall>
                {about.map(([label, value]) => (
                  <DeskFactRow key={label} label={label} value={value} onClick={openEditor} chevron />
                ))}
              </DeskList>
              <DeskLabel>Reading for</DeskLabel>
              {view.mandates?.genres?.length
                ? <DeskChips values={view.mandates.genres} />
                : <p className="ckm-desk__footnote">No genres set — writers cannot match you without them.</p>}
              <DeskLabel>Formats</DeskLabel>
              {view.mandates?.formats?.length
                ? <DeskChips values={view.mandates.formats} />
                : <p className="ckm-desk__footnote">No formats set yet.</p>}
            </>
          ) : (
            <DeskEmpty
              icon="policy"
              title="No mandate yet"
              body="Writers cannot find you without one. Two lines about what you are reading for is enough."
              action={{ label: "Edit the mandate", onClick: openEditor }}
            />
          )}
        </DeskPanel>
      ) : null}

      {/* --- Yours alone --------------------------------------------------- */}
      {tab === DESK_TAB.SAVED ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          <ProfileCollectionsMobile
            state={collectionState}
            section={collectionLocation.section}
            page={collectionLocation.page}
            own
            onLocationChange={updateCollectionLocation}
            onRemoveSaved={removeSaved}
          />
          {view.stats.length ? (
            <>
              <DeskLabel>Your numbers</DeskLabel>
              <DeskList>
                {view.stats.map((stat) => (
                  <DeskFactRow key={stat.key} label={stat.label} value={String(stat.value)} />
                ))}
                <DeskFactRow label="Followers" value={String(view.followers)} />
                <DeskFactRow label="Following" value={String(view.following)} />
              </DeskList>
            </>
          ) : null}
        </DeskPanel>
      ) : null}

      {/* --- What the world sees ------------------------------------------- */}
      {tab === DESK_TAB.ABOUT ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          <button type="button" className="ckm-desk__bio" onClick={openEditor}>
            <span className="ckm-desk__bio-head">
              Bio
              <span className="ckm-desk__bio-edit">Edit</span>
            </span>
            <span className="ckm-desk__bio-text">{view.bio}</span>
          </button>

          <DeskLabel>Details</DeskLabel>
          <DeskList>
            {view.username ? <DeskFactRow label="Username" value={`@${view.username}`} onClick={openEditor} chevron /> : null}
            {view.email ? <DeskFactRow label="Email" value={view.email} to="/profile?tab=settings" chevron /> : null}
            {view.phone ? <DeskFactRow label="Phone" value={view.phone} onClick={openEditor} chevron /> : null}
            {about.map(([label, value]) => (
              <DeskFactRow key={label} label={label} value={value} onClick={openEditor} chevron />
            ))}
          </DeskList>

          {view.skills.length ? (<><DeskLabel>Skills</DeskLabel><DeskChips values={view.skills} /></>) : null}
          {view.genres.length ? (<><DeskLabel>Genres</DeskLabel><DeskChips values={view.genres} /></>) : null}
          {view.tags.length ? (<><DeskLabel>Specialized tags</DeskLabel><DeskChips values={view.tags} /></>) : null}
          {view.badges.length ? (
            <><DeskLabel>Achievements</DeskLabel><DeskChips values={view.badges.map((badge) => ({ label: badge.label, imageUrl: badge.imageUrl }))} /></>
          ) : null}

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

          <DeskLabel>Manage</DeskLabel>
          <DeskList>
            <DeskFactRow label="Account &amp; security" value="Open" to="/profile?tab=settings" chevron />
            {view.writer
              ? <DeskFactRow label="Collaboration requests" value="Open" to="/collaborations" chevron />
              : null}
            <DeskFactRow label="Follow requests" value="Open" to="/follow-requests" chevron />
          </DeskList>

          <p className="ckm-desk__footnote">Tap any row to edit it. This is what a visitor sees.</p>
        </DeskPanel>
      ) : null}
    </ProfileDesk>
  );
}
