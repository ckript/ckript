import { useCallback, useContext, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../../context/AuthContext";
import {
  readReaderProfileLocation,
  readerFollowLabel,
  readerProfileShare,
  READER_PROFILE_SECTIONS,
  READER_PROFILE_STATUS,
  writeReaderProfileLocation,
} from "../../../../pages/reader-profile/readerProfile";
import { useReaderProfile } from "../../../../pages/reader-profile/useReaderProfile";
import {
  mergeOwnProfileUpdate,
  saveOwnProfile,
  uploadOwnProfileImage,
} from "../../../../pages/profile/profileEditor";
import { resolveMediaUrl } from "../../../../utils/mediaUrl";
import PageHeader from "../../../components/app-bars/PageHeader";
import Badge from "../../../components/badges/Badge";
import Button from "../../../components/buttons/Button";
import InlineMessage from "../../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../../components/feedback/Skeletons";
import NavBar from "../../../components/navigation/NavBar";
import SegmentedControl from "../../../components/tabs/SegmentedControl";
import { useToast } from "../../../components/feedback/toastContext";
import MobileShell from "../../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../../shell/mobileShellModes";
import DiscoveryProjectCard from "../../discovery/components/DiscoveryProjectCard";
import ProfileEditorDialog from "../../profiles/desk/ProfileEditorDialog";
import "./ReaderProfileMobile.css";

const dateLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

const ReviewRow = ({ review }) => (
  <article className="ckm-reader-profile__review">
    <div>
      <Badge tone="accent">{Number(review.rating) || 0} / 5</Badge>
      <span>{dateLabel(review.createdAt)}</span>
    </div>
    <p>{review.comment || "No written review."}</p>
    {review.script?._id ? <Link to={`/reader/script/${encodeURIComponent(review.script._id)}`}>Open {review.script.title || "project"} <span aria-hidden="true">→</span></Link> : null}
  </article>
);

export default function ReaderProfileMobile({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setUser } = useContext(AuthContext);
  const toast = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const profileId = id || user?._id;
  const { section, page } = readReaderProfileLocation(searchParams);

  const canonicalize = useCallback((path) => {
    if (!id && path) {
      const query = searchParams.toString();
      navigate(`${path}${query ? `?${query}` : ""}`, { replace: true });
    }
  }, [id, navigate, searchParams]);
  const state = useReaderProfile({ profileId, section, page, viewer: user, onCanonicalPath: canonicalize });
  const data = state.data;
  const profile = data?.profile;
  const tabs = useMemo(() => READER_PROFILE_SECTIONS.map((item) => ({
    value: item.key,
    label: item.label.replace("Scripts read", "Read"),
    count: data?.counts?.[item.key] == null ? undefined : data.counts[item.key],
  })), [data?.counts]);

  const updateLocation = (nextSection, nextPage = 1) => {
    setSearchParams(writeReaderProfileLocation(searchParams, { section: nextSection, page: nextPage }));
  };

  const syncViewer = useCallback((update) => {
    const next = mergeOwnProfileUpdate(user || {}, update || {});
    setUser(next);
    try { localStorage.setItem("user", JSON.stringify(next)); } catch { /* memory state remains authoritative */ }
  }, [setUser, user]);

  const save = async (draft) => {
    if (saving) return { ok: false, message: "A profile update is already in progress." };
    setSaving(true);
    setEditorError("");
    try {
      const result = await saveOwnProfile({ draft, profile });
      if (!result.ok) { setEditorError(result.message); return result; }
      state.applyProfileUpdate(result.data);
      syncViewer(result.data);
      toast.success("Profile updated");
      return result;
    } finally { setSaving(false); }
  };

  const upload = async (file) => {
    setUploading(true);
    setEditorError("");
    try {
      const result = await uploadOwnProfileImage(file);
      if (!result.ok) { setEditorError(result.message); return result; }
      state.applyProfileUpdate(result.data);
      syncViewer(result.data);
      return result;
    } finally { setUploading(false); }
  };

  const share = async () => {
    const payload = readerProfileShare(profile, window.location.origin);
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(payload.url);
        toast.success("Profile link copied");
      }
    } catch (error) {
      if (error?.name !== "AbortError") toast.error("Could not share this profile");
    }
  };

  const header = <PageHeader title={profile?.name || "Reader profile"} eyebrow="Reader" backTo="/reader" />;
  const shell = (children, overlays = null) => (
    <MobileShell
      mode={MOBILE_SHELL_MODE.STANDARD}
      screenId="reader-profile"
      className="ckm-reader-profile"
      appBar={header}
      bottomNav={<NavBar user={user} />}
      onConnectionRestored={state.reload}
      overlays={overlays}
    >
      {children}
    </MobileShell>
  );

  if (state.status === READER_PROFILE_STATUS.LOADING) {
    return shell(<SkeletonGroup label="Loading reader profile" className="ckm-reader-profile__loading"><SkeletonShape height={230} /><SkeletonShape height={180} /></SkeletonGroup>);
  }
  if (!profile) {
    const privateProfile = state.status === READER_PROFILE_STATUS.PRIVATE;
    const action = privateProfile && state.failure?.profileId
      ? <Button pending={state.followPending} onClick={state.follow}>{state.failure?.relationship?.followRequestPending ? "Cancel request" : "Request to follow"}</Button>
      : null;
    return shell(<div className="ckm-reader-profile__state"><InlineMessage variant="panel" tone={state.status === READER_PROFILE_STATUS.FAILED ? "error" : "info"} title={privateProfile ? "This reader profile is private" : "Reader profile unavailable"} action={action} onRetry={state.status === READER_PROFILE_STATUS.FAILED ? state.reload : null}>{state.failure?.message}</InlineMessage></div>);
  }

  const overlays = data.own && editorOpen ? (
    <ProfileEditorDialog
      open
      profile={profile}
      pending={saving}
      uploadPending={uploading}
      error={editorError}
      onClose={() => { setEditorOpen(false); setEditorError(""); }}
      onSave={save}
      onUpload={upload}
    />
  ) : null;

  const privateCollection = data.pagination.privateCollection;
  return shell(
    <article className="ckm-reader-profile__page">
      <section className="ckm-reader-profile__hero" aria-labelledby="reader-profile-name">
        <div className="ckm-reader-profile__cover">{profile.coverImage ? <img src={resolveMediaUrl(profile.coverImage)} alt="" /> : null}</div>
        <div className="ckm-reader-profile__identity">
          <div className="ckm-reader-profile__avatar">{profile.profileImage ? <img src={resolveMediaUrl(profile.profileImage)} alt="" /> : <span aria-hidden="true">{String(profile.name || "R").charAt(0)}</span>}</div>
          <div><p>Reader</p><h2 id="reader-profile-name">{profile.name || "Ckript reader"}</h2><span>{profile.createdAt ? `Member since ${dateLabel(profile.createdAt)}` : "Ckript member"}</span></div>
        </div>
        <div className="ckm-reader-profile__stats"><span><strong>{profile.followers?.length || 0}</strong> followers</span><span><strong>{profile.following?.length || 0}</strong> following</span><span><strong>{data.counts.reviews}</strong> reviews</span></div>
        <div className="ckm-reader-profile__actions">
          {data.own ? <Button onClick={() => setEditorOpen(true)}>Edit profile</Button> : <Button pending={state.followPending} disabled={data.relationship.blockedByCurrent || data.relationship.blockedByProfile} onClick={state.follow}>{readerFollowLabel(data.relationship)}</Button>}
          <Button variant="secondary" onClick={share}>Share</Button>
        </div>
        {state.actionError ? <InlineMessage tone="error">{state.actionError}</InlineMessage> : null}
      </section>

      {profile.bio || profile.skills?.length ? <section className="ckm-reader-profile__about"><h2>About</h2><p>{profile.bio || "No bio added yet."}</p>{profile.skills?.length ? <div>{profile.skills.map((skill) => <Badge key={skill}>{skill}</Badge>)}</div> : null}</section> : null}

      <section className="ckm-reader-profile__collection" aria-labelledby="reader-collection-title">
        <h2 id="reader-collection-title">Reader activity</h2>
        <SegmentedControl label="Reader activity" name="reader-activity" value={section} options={tabs} onChange={(value) => updateLocation(value, 1)} />
        {privateCollection ? (
          <InlineMessage variant="panel" title={`${section === "read" ? "Reading history" : "Favorites"} are private`}>Only this reader can view saved projects and reading history.</InlineMessage>
        ) : data.items.length ? (
          section === "reviews"
            ? <div className="ckm-reader-profile__reviews">{data.items.map((review) => <ReviewRow key={review._id} review={review} />)}</div>
            : <div className="ckm-reader-profile__projects">{data.items.map((project) => <DiscoveryProjectCard key={project._id} project={project} onOpen={() => navigate(`/reader/script/${encodeURIComponent(project._id)}`)} />)}</div>
        ) : (
          <InlineMessage variant="panel" title={section === "reviews" ? "No reviews yet" : section === "favorites" ? "No favorites saved" : "No scripts read yet"}>{data.own ? "Activity will appear here as you explore projects." : "There is nothing to show in this section yet."}</InlineMessage>
        )}
        {data.pagination.totalPages > 1 ? <nav className="ckm-reader-profile__pagination" aria-label={`${section} pages`}><Button variant="secondary" disabled={!data.pagination.hasPrevious} onClick={() => updateLocation(section, page - 1)}>Previous</Button><span>Page {page} of {data.pagination.totalPages}</span><Button variant="secondary" disabled={!data.pagination.hasNext} onClick={() => updateLocation(section, page + 1)}>Next</Button></nav> : null}
      </section>
    </article>,
    overlays,
  );
}
