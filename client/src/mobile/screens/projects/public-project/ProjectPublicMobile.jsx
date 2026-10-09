import { useContext, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { AuthContext } from "../../../../context/AuthContext";
import { getScriptCanonicalPath } from "../../../../utils/scriptPath";
import { PUBLIC_PROJECT_STATUS, usePublicProject } from "../../../../pages/script-detail/usePublicProject";
import { resolveMediaUrl } from "../../../../utils/mediaUrl";
import PageHeader from "../../../components/app-bars/PageHeader";
import Badge from "../../../components/badges/Badge";
import Icon from "../../../components/Icon";
import Button from "../../../components/buttons/Button";
import InlineMessage from "../../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../../components/feedback/Skeletons";
import TrailerDialog from "../../../components/media/TrailerDialog";
import MobileShell from "../../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../../shell/mobileShellModes";
import { buildPublicProjectSections, formatPublicPrice } from "./publicProjectModel";
import "./ProjectPublicMobile.css";

export default function ProjectPublicMobile({ previewData = undefined }) {
  const { id } = useParams();
  const location = useLocation();
  const result = usePublicProject({ id, enabled: previewData === undefined });
  const project = previewData ?? result.project;
  const status = previewData !== undefined ? PUBLIC_PROJECT_STATUS.READY : result.status;
  const [trailerOpen, setTrailerOpen] = useState(false);
  const sections = useMemo(() => buildPublicProjectSections(project || {}), [project]);
  const loginTo = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  const { user } = useContext(AuthContext);

  if (user && !previewData && project) {
    return <Navigate to={getScriptCanonicalPath(project)} replace />;
  }

  if (status === PUBLIC_PROJECT_STATUS.LOADING) {
    return (
      <MobileShell mode={MOBILE_SHELL_MODE.PUBLIC} screenId="public-project" appBar={<PageHeader title="Shared project" backTo="/" />}>
        <SkeletonGroup label="Loading shared project" className="ckm-public-project__loading">
          <SkeletonShape height={190} radius="var(--ckm-r-lg)" />
          <SkeletonShape height={120} radius="var(--ckm-r-lg)" />
          <SkeletonShape height={220} radius="var(--ckm-r-lg)" />
        </SkeletonGroup>
      </MobileShell>
    );
  }

  if (!project) {
    return (
      <MobileShell mode={MOBILE_SHELL_MODE.PUBLIC} screenId="public-project" appBar={<PageHeader title="Shared project" backTo="/" />}>
        <div className="ckm-public-project__state">
          <InlineMessage
            tone="error"
            title={status === PUBLIC_PROJECT_STATUS.NOT_FOUND ? "Project unavailable" : "Could not load project"}
            onRetry={status === PUBLIC_PROJECT_STATUS.FAILED ? result.retry : undefined}
          >
            {result.message || "This link may be private, expired, or incorrect."}
          </InlineMessage>
          <Button to="/" variant="secondary" fullWidth>Go to Ckript</Button>
        </div>
      </MobileShell>
    );
  }

  const cover = resolveMediaUrl(project.coverImage);
  const trailer = resolveMediaUrl(project.uploadedTrailerUrl || project.trailerUrl);
  const creatorKey = project.creator?.username || project.creator?._id;

  return (
    <MobileShell
      mode={MOBILE_SHELL_MODE.PUBLIC}
      screenId="public-project"
      className="ckm-public-project"
      appBar={<PageHeader title="Shared project" backTo="/" actions={<Button to={loginTo} variant="tertiary" size="sm">Sign in</Button>} />}
      onConnectionRestored={result.retry}
      overlays={<TrailerDialog open={trailerOpen} onClose={() => setTrailerOpen(false)} project={project} />}
    >
      <article className="ckm-public-project__page">
        <div className={`ckm-public-project__cover ${!cover ? "ckm-public-project__cover--empty" : ""}`}>
          {cover ? <img src={cover} alt="" /> : <Icon name="auto_awesome_mosaic" size={48} />}
        </div>
        <div className="ckm-public-project__hero">
          <p className="ckm-public-project__eyebrow">Public project preview</p>
          <h2 className="ckm-public-project__title">{project.title || "Untitled project"}</h2>
          <div className="ckm-public-project__badges">
            <Badge tone="info">{project.primaryGenre || project.genre || "Screenplay"}</Badge>
            <Badge tone="success">{formatPublicPrice(project.price)}</Badge>
            {project.viewableScript ? <Badge tone="neutral">Preview available</Badge> : null}
          </div>
          <p className="ckm-public-project__credit">
            By {creatorKey ? <Link to={`/share/profile/${encodeURIComponent(creatorKey)}`}>{project.creator?.name || "Writer"}</Link> : (project.creator?.name || "Writer")}
          </p>
          <div className="ckm-public-project__actions">
            {trailer ? <Button variant="secondary" icon="play_arrow" onClick={() => setTrailerOpen(true)}>Watch trailer</Button> : null}
            <Button to={loginTo} fullWidth={!trailer}>Sign in to continue</Button>
          </div>
          <p className="ckm-public-project__access-note">
            This public page shares project details only. Sign in to request collaboration, contact the writer, or access any available screenplay preview.
          </p>
        </div>

        {sections.map((section) => (
          <section className="ckm-public-project__section" key={section.id} aria-labelledby={`public-${section.id}`}>
            <h2 id={`public-${section.id}`}>{section.title}</h2>
            {section.score ? <p className="ckm-public-project__score"><strong>{section.score}</strong><span>/100</span></p> : null}
            {section.body ? <p className="ckm-public-project__body">{section.body}</p> : null}
            {section.facts ? <dl className="ckm-public-project__facts">{section.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
            {section.groups?.map(([label, values]) => <div className="ckm-public-project__group" key={label}><h3>{label}</h3><div>{values.map((value) => <Badge key={value}>{value}</Badge>)}</div></div>)}
            {section.roles ? <ul className="ckm-public-project__roles">{section.roles.map((role, index) => <li key={role._id || `${role.characterName}-${index}`}><strong>{role.characterName || "Unnamed role"}</strong><span>{[role.type, role.gender, role.description].filter(Boolean).join(" · ") || "Details not shared"}</span></li>)}</ul> : null}
          </section>
        ))}
      </article>
    </MobileShell>
  );
}
