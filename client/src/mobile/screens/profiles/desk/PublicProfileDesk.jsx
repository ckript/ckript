import { useMemo, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { PUBLIC_PROFILE_STATUS, usePublicProfile } from "../../../../pages/profile/usePublicProfile";
import { resolveMediaUrl } from "../../../../utils/mediaUrl";
import MobileShell from "../../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../../shell/mobileShellModes";
import { buildPublicProfileView } from "../public-profile/publicProfileModel";
import ProfileDesk, { DeskBar, DeskCta, DeskPortraitViewer, DeskState } from "./ProfileDesk";
import {
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
import {
  DESK_TAB,
  DESK_VIEWER,
  deskAbout,
  deskAudienceOf,
  deskProjects,
  deskStats,
  deskStatus,
  deskTabs,
  readDeskTab,
  writeDeskTab,
} from "./profileDeskModel";
import "./ProfileDesk.css";

/*
 * PublicProfileDesk — the shared profile at /share/profile/:id, signed out.
 *
 * The prototype's 2a and 2b with every authenticated affordance removed rather
 * than disabled: a visitor who cannot follow is not helped by a Follow button
 * that refuses them. What stays is the shelf, the professional facts and the
 * one honest ask — sign in — which is exactly what the dock is for.
 *
 * There is no Activity tab. The sanitized public projection has no collection
 * endpoint behind it, and a tab that can only ever be empty is worse than two
 * tabs that are full.
 */
export default function PublicProfileDesk({ previewData = undefined }) {
  const { id } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [portraitOpen, setPortraitOpen] = useState(false);

  const result = usePublicProfile({ id, enabled: previewData === undefined });
  const profile = previewData?.user ?? result.profile;
  const scripts = previewData?.scripts ?? result.scripts;
  const status = previewData ? PUBLIC_PROFILE_STATUS.READY : result.status;

  const view = useMemo(() => buildPublicProfileView(profile || {}, scripts), [profile, scripts]);
  const projects = useMemo(() => deskProjects(scripts), [scripts]);
  const about = useMemo(() => deskAbout(view), [view]);
  const tabs = useMemo(() => deskTabs({ view, viewer: DESK_VIEWER.PUBLIC }), [view]);
  const tab = readDeskTab(searchParams, tabs);
  const signIn = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  const baseId = "ckm-desk-public";

  const bar = (
    <DeskBar
      back={{ label: "Ckript", to: "/" }}
      title={profile ? view.name : "Shared profile"}
      action={{ label: "Sign in", to: signIn }}
    />
  );

  if (status === PUBLIC_PROFILE_STATUS.LOADING) {
    return (
      <MobileShell mode={MOBILE_SHELL_MODE.PUBLIC} screenId="public-profile" scrollClassName="ckm-desk__scroll">
        <div className="ckm-desk">
          {bar}
          <DeskLoading shape="shelf" label="Loading this profile…" />
        </div>
      </MobileShell>
    );
  }

  if (!profile) {
    const isPrivate = status === PUBLIC_PROFILE_STATUS.PRIVATE;
    return (
      <MobileShell mode={MOBILE_SHELL_MODE.PUBLIC} screenId="public-profile" scrollClassName="ckm-desk__scroll">
        <div className="ckm-desk">
          {bar}
          <DeskState
            icon={isPrivate ? "lock_person" : "person_search"}
            title={isPrivate ? "This profile is private" : "Profile unavailable"}
            body={result.message || "This link may be unavailable or incorrect."}
          >
            <DeskCta label="Sign in to Ckript" to={signIn} />
            {status === PUBLIC_PROFILE_STATUS.FAILED
              ? <DeskCta label="Try again" tone="quiet" onClick={result.retry} />
              : null}
          </DeskState>
        </div>
      </MobileShell>
    );
  }

  const selectTab = (key) => setSearchParams(writeDeskTab(searchParams, key), { replace: true });

  return (
    <ProfileDesk
      mode={MOBILE_SHELL_MODE.PUBLIC}
      screenId="public-profile"
      audience={deskAudienceOf(view)}
      bar={bar}
      dock={<DeskCta label="Sign in to connect" to={signIn} />}
      overlays={(
        <DeskPortraitViewer
          open={portraitOpen}
          src={view.image ? resolveMediaUrl(view.image) : ""}
          name={view.name}
          caption={view.role}
          onClose={() => setPortraitOpen(false)}
        />
      )}
      onConnectionRestored={result.retry}
    >
      <DeskIdentity
        name={view.name}
        image={view.image}
        verified={view.professional}
        role={view.role}
        status={deskStatus({ view, profile })}
        onPortrait={view.image ? () => setPortraitOpen(true) : null}
      />

      <DeskStats cells={deskStats(view)} onSelect={selectTab} label={`${view.name}'s totals`} />

      <DeskTabList tabs={tabs} value={tab} onChange={selectTab} baseId={baseId} label={`${view.name}'s sections`} />

      {tab === DESK_TAB.WORK ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          {projects.length ? (
            <>
              <DeskLeadProject project={projects[0]} to={`/share/project/${encodeURIComponent(projects[0].id)}`} />
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
            <DeskEmpty
              icon="description"
              title="No public projects"
              body="This writer has not shared any work publicly yet."
            />
          )}
        </DeskPanel>
      ) : null}

      {tab === DESK_TAB.MANDATE ? (
        <DeskPanel tabKey={tab} baseId={baseId}>
          {about.length ? (
            <DeskList tall>
              {about.map(([label, value]) => <DeskFactRow key={label} label={label} value={value} />)}
            </DeskList>
          ) : null}
          {view.mandates?.genres?.length ? (<><DeskLabel first={!about.length}>Reading for</DeskLabel><DeskChips values={view.mandates.genres} /></>) : null}
          {view.mandates?.formats?.length ? (<><DeskLabel>Formats</DeskLabel><DeskChips values={view.mandates.formats} /></>) : null}
          {!about.length && !view.mandates?.genres?.length && !view.mandates?.formats?.length ? (
            <DeskEmpty
              icon="policy"
              title="No mandate published"
              body="This member has not said what they are reading for yet."
            />
          ) : null}
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

          {view.skills.length ? (<><DeskLabel>Skills</DeskLabel><DeskChips values={view.skills} /></>) : null}
          {view.genres.length ? (<><DeskLabel>Genres</DeskLabel><DeskChips values={view.genres} /></>) : null}
          {view.tags.length ? (<><DeskLabel>Specialized tags</DeskLabel><DeskChips values={view.tags} /></>) : null}

          {view.links.length ? (
            <>
              <DeskLabel>Public links</DeskLabel>
              <DeskList>
                {view.links.map((link) => (
                  <DeskFactRow key={link.key} label={link.label} value="Open" href={link.url} chevron />
                ))}
              </DeskList>
            </>
          ) : null}

          <p className="ckm-desk__footnote">
            Sign in to follow {view.name}, message them, or ask for their contact details.
          </p>
        </DeskPanel>
      ) : null}
    </ProfileDesk>
  );
}
