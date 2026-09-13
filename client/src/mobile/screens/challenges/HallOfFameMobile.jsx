import { useContext, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { useAuthModal } from "../../../context/AuthModalContext";
import { rewardLabel, yearSuffix } from "../../../components/competition/labels";
import useDynamicSeo from "../../../components/competition/useDynamicSeo";
import {
  HALL_OF_FAME_STATUS,
  hallOfFameDetailPath,
  hallOfFameProfilePath,
  readHallOfFameQuery,
  writeHallOfFameQuery,
} from "../../../pages/hall-of-fame/hallOfFame";
import { useHallOfFameDetail, useHallOfFameList } from "../../../pages/hall-of-fame/useHallOfFame";
import externalUrl from "../../../utils/externalUrl";
import { resolveMediaUrl } from "../../../utils/mediaUrl";
import AppBar from "../../components/app-bars/AppBar";
import PageHeader from "../../components/app-bars/PageHeader";
import Badge from "../../components/badges/Badge";
import Button from "../../components/buttons/Button";
import Card, { CardBody, CardMedia, CardText, CardTitle } from "../../components/cards/Card";
import EmptyState from "../../components/EmptyState";
import InlineMessage from "../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../components/feedback/Skeletons";
import NavBar from "../../components/navigation/NavBar";
import MobileShell from "../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../shell/mobileShellModes";
import { formatChallengeDate } from "./challengeHubModel";
import "./HallOfFameMobile.css";

const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

function Loading({ detail = false }) {
  return <SkeletonGroup label={detail ? "Loading competition record" : "Loading the Hall of Fame"} className="ckm-hall__loading"><SkeletonShape height={detail ? 220 : 280} radius="var(--ckm-r-xl)" /><SkeletonShape height={220} radius="var(--ckm-r-xl)" /></SkeletonGroup>;
}

function Person({ person, award }) {
  if (!person) return null;
  const rewards = list(person.rewards).map((type) => rewardLabel(type, { specialTitle: person.specialTitle })).filter(Boolean);
  const profile = hallOfFameProfilePath(person);
  return (
    <Card className={award === "winner" ? "ckm-hall__person--winner" : ""}>
      <CardBody>
        <Badge tone={award === "winner" ? "accent" : award === "runner_up" ? "info" : "neutral"}>{person.specialTitle || (award === "winner" ? "Winner" : award === "runner_up" ? "Runner-Up" : award === "second_runner_up" ? "Second Runner-Up" : "Special award")}</Badge>
        {person.badgeImage ? <img src={person.badgeImage} alt="" style={{ width: 56, height: 56, objectFit: "contain", marginTop: 10 }} /> : null}
        <div className="ckm-hall__person">
          <span>{person.profileImage ? <img src={resolveMediaUrl(person.profileImage)} alt="" /> : <span aria-hidden="true">{String(person.name || "W").charAt(0)}</span>}</span>
          <div><CardTitle as="h3" to={profile || null}>{person.name || "Writer"}</CardTitle>{person.scriptTitle ? <p>{person.scriptTitle}</p> : null}</div>
        </div>
        {person.logline ? <CardText>{person.logline}{person.loglineByAi ? " (AI-generated summary)" : ""}</CardText> : null}
        {rewards.length ? <div className="ckm-hall__chips">{rewards.map((label) => <Badge key={label}>{label}</Badge>)}</div> : null}
        {profile ? <Button to={profile} variant="tertiary" size="sm">Writer profile</Button> : null}
      </CardBody>
    </Card>
  );
}

function ArchiveCard({ competition }) {
  const people = [competition.winner, competition.runnerUp, competition.secondRunnerUp, ...list(competition.special)].filter(Boolean);
  return (
    <Card>
      <CardMedia src={resolveMediaUrl(competition.bannerUrl)} ratio="16 / 8" placeholderIcon="emoji_events" overlay={<Badge>{competition.year || "Archive"}</Badge>} />
      <CardBody>
        <CardTitle as="h2" to={hallOfFameDetailPath(competition.slug)}>{competition.name || "Challenge"}</CardTitle>
        {competition.theme ? <p className="ckm-hall__theme">{competition.theme}</p> : null}
        <dl className="ckm-hall__facts">
          <div><dt>Honourees</dt><dd>{people.length}</dd></div>
          <div><dt>Entrants</dt><dd>{Number(competition.totalParticipants || 0).toLocaleString()}</dd></div>
          <div><dt>Countries</dt><dd>{Number(competition.countriesRepresented || 0).toLocaleString()}</dd></div>
        </dl>
        {competition.winner ? <p className="ckm-hall__winner"><span>Winner</span><strong>{competition.winner.name}</strong>{competition.winner.scriptTitle ? <em>{competition.winner.scriptTitle}</em> : null}</p> : <CardText>Results archived.</CardText>}
        <Button to={hallOfFameDetailPath(competition.slug)} variant="secondary" fullWidth>Open permanent record</Button>
      </CardBody>
    </Card>
  );
}

function ArchiveList({ user, previewList = null }) {
  const { openAuthModal } = useAuthModal();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const query = readHallOfFameQuery(params);
  const live = useHallOfFameList({ query, enabled: !previewList });
  const archive = previewList || live;
  const data = archive.data || {};
  const pageInfo = data.pageInfo || {};
  const update = (patch) => setParams(writeHallOfFameQuery(params, patch), { replace: true });
  const member = Boolean(user);
  const MastheadHeading = member ? "h1" : "h2";
  const header = member
    ? <AppBar user={user} />
    : <PageHeader title="Hall of Fame" backTo="/" actions={<Button variant="tertiary" size="sm" onClick={() => openAuthModal({ redirect: `${location.pathname}${location.search}` })}>Sign in</Button>} />;

  return (
    <MobileShell mode={member ? MOBILE_SHELL_MODE.STANDARD : MOBILE_SHELL_MODE.PUBLIC} screenId="hall-of-fame" className="ckm-hall" scrollClassName="ckm-hall__scroll" appBar={header} bottomNav={member ? <NavBar user={user} /> : null} onConnectionRestored={archive.retry}>
      <header className="ckm-hall__masthead"><p>Permanent competition record</p><MastheadHeading>Every winner belongs here.</MastheadHeading><span>Browse every declared result, awarded writer, and separately published featured script.</span></header>
      {archive.status === HALL_OF_FAME_STATUS.LOADING ? <Loading /> : archive.status === HALL_OF_FAME_STATUS.FAILED ? (
        <InlineMessage variant="panel" title="The Hall of Fame is unavailable" onRetry={archive.retry}>{archive.failure?.message}</InlineMessage>
      ) : Number(pageInfo.total || 0) === 0 && query.year === "all" && query.competition === "all" ? (
        <EmptyState titleAs="h2" icon="emoji_events" title="No results yet" body="The first permanent record appears as soon as a challenge declares its results." actions={<Button to="/challenge">Browse challenges</Button>} />
      ) : (
        <>
          <div className="ckm-hall__filters">
            <label><span>Competition</span><select value={query.competition} onChange={(event) => update({ competition: event.target.value, page: 1 })}><option value="all">All competitions</option>{list(data.competitions).map((name) => <option key={name}>{name}</option>)}</select></label>
            <label><span>Year</span><select value={query.year} onChange={(event) => update({ year: event.target.value, page: 1 })}><option value="all">All years</option>{list(data.years).map((year) => <option key={year}>{year}</option>)}</select></label>
          </div>
          {!list(data.items).length ? <EmptyState titleAs="h2" icon="filter_alt_off" title="No matching records" body="Try another competition or year." actions={<Button variant="secondary" onClick={() => update({ competition: "all", year: "all", page: 1 })}>Clear filters</Button>} /> : <div className="ckm-hall__cards">{data.items.map((item) => <ArchiveCard key={item._id} competition={item} />)}</div>}
          {pageInfo.totalPages > 1 ? <nav className="ckm-hall__pager" aria-label="Hall of Fame pages"><Button variant="secondary" size="sm" disabled={pageInfo.page <= 1} onClick={() => update({ page: pageInfo.page - 1 })}>Previous</Button><span>Page {pageInfo.page} of {pageInfo.totalPages}</span><Button variant="secondary" size="sm" disabled={!pageInfo.hasMore} onClick={() => update({ page: pageInfo.page + 1 })}>Next</Button></nav> : null}
        </>
      )}
    </MobileShell>
  );
}

function RecordSection({ title, children }) {
  return <section className="ckm-hall__section"><h2>{title}</h2>{children}</section>;
}

function CompetitionRecord({ slug, previewDetail = null }) {
  const live = useHallOfFameDetail({ slug, enabled: !previewDetail });
  const record = previewDetail || live;
  const data = record.data;
  const competition = data?.competition;
  const [shareMessage, setShareMessage] = useState("");
  useDynamicSeo({
    title: competition?.name ? `${competition.name} | Hall of Fame | Ckript` : "",
    description: competition?.name ? `Meet the winners and featured writers from the ${competition.name} hosted by Ckript.` : "",
  });

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${competition.name} | Ckript Hall of Fame`, url });
      else await navigator.clipboard.writeText(url);
      setShareMessage(navigator.share ? "Shared." : "Link copied.");
    } catch (error) {
      if (error?.name !== "AbortError") setShareMessage("The link could not be shared.");
    }
  };

  const header = <PageHeader title={competition?.name || "Hall of Fame"} eyebrow="Permanent record" backTo="/hall-of-fame" backLabel="Hall of Fame" actions={competition ? <Button variant="tertiary" size="sm" icon="share" onClick={share}>Share</Button> : null} />;
  const shell = (children) => <MobileShell mode={MOBILE_SHELL_MODE.DETAIL} screenId="hall-of-fame-detail" className="ckm-hall ckm-hall--detail" scrollClassName="ckm-hall__scroll" appBar={header} onConnectionRestored={record.retry}>{children}</MobileShell>;

  if (record.status === HALL_OF_FAME_STATUS.LOADING) return shell(<Loading detail />);
  if (record.status === HALL_OF_FAME_STATUS.FAILED) return shell(<InlineMessage variant="panel" title="This record could not be loaded" onRetry={record.retry}>{record.failure?.message}</InlineMessage>);
  if (record.status === HALL_OF_FAME_STATUS.NOT_FOUND || !data) return shell(<EmptyState titleAs="h2" icon="workspace_premium" title="Competition record not found" body="The link may be incorrect, or results have not been declared." actions={<Button to="/hall-of-fame">Browse the Hall of Fame</Button>} />);

  const people = [data.results?.winner ? { person: data.results.winner, award: "winner" } : null, data.results?.runnerUp ? { person: data.results.runnerUp, award: "runner_up" } : null, data.results?.secondRunnerUp ? { person: data.results.secondRunnerUp, award: "second_runner_up" } : null, ...list(data.results?.special).map((person) => ({ person, award: "special" }))].filter(Boolean);
  const dateRange = [competition.dates?.startsAt, competition.dates?.endsAt].filter(Boolean).map(formatChallengeDate).join(" – ");
  return shell(<>
    <header className="ckm-hall__record-hero">{competition.bannerUrl ? <img src={resolveMediaUrl(competition.bannerUrl)} alt="" /> : null}<div><Badge tone="accent">Results declared</Badge><h2>{competition.name}{yearSuffix(competition.name, competition.year) ? ` ${competition.year}` : ""}</h2>{competition.theme?.title ? <p>{competition.theme.title}</p> : null}<span>{dateRange}</span>{competition.prizePool ? <strong>{competition.prizePool} prize pool</strong> : null}{shareMessage ? <small role="status">{shareMessage}</small> : null}</div></header>
    <RecordSection title="By the numbers"><Card><CardBody><dl className="ckm-hall__stats"><div><dt>Participants</dt><dd>{Number(data.stats?.totalParticipants || 0).toLocaleString()}</dd></div><div><dt>Countries</dt><dd>{Number(data.stats?.countriesRepresented || 0).toLocaleString()}</dd></div><div><dt>Scripts</dt><dd>{Number(data.stats?.scriptsSubmitted || 0).toLocaleString()}</dd></div><div><dt>Completion</dt><dd>{Number(data.stats?.completionRate || 0)}%</dd></div></dl></CardBody></Card></RecordSection>
    <RecordSection title="Honourees">{people.length ? <div className="ckm-hall__cards">{people.map(({ person, award }, index) => <Person key={`${award}-${person.userId || index}`} person={person} award={award} />)}</div> : <Card><CardBody><CardText>The results are archived, but no public writer profiles are available.</CardText></CardBody></Card>}</RecordSection>
    {competition.overview ? <RecordSection title="About this challenge"><Card><CardBody><CardText>{competition.overview}</CardText></CardBody></Card></RecordSection> : null}
    {list(data.featuredScripts).length ? <RecordSection title="Featured scripts"><div className="ckm-hall__cards">{data.featuredScripts.map((script) => <Card key={script._id}><CardMedia src={resolveMediaUrl(script.coverImage)} ratio="16 / 8" placeholderIcon="menu_book" /><CardBody><CardTitle as="h3" to={`/share/project/${encodeURIComponent(script._id)}`}>{script.title}</CardTitle>{script.genre ? <Badge>{script.genre}</Badge> : null}<CardText>By {script.writer?.name || "Writer"}</CardText><div className="ckm-hall__actions"><Button size="sm" to={`/share/project/${encodeURIComponent(script._id)}`}>Read script</Button>{hallOfFameProfilePath(script.writer) ? <Button size="sm" variant="tertiary" to={hallOfFameProfilePath(script.writer)}>Writer profile</Button> : null}</div></CardBody></Card>)}</div>{record.featuredFailure ? <InlineMessage title="More scripts could not be loaded" onRetry={record.loadMoreFeatured}>{record.featuredFailure.message}</InlineMessage> : null}{data.featuredScriptsPageInfo?.hasMore ? <Button fullWidth variant="secondary" pending={record.featuredPending} pendingLabel="Loading…" onClick={record.loadMoreFeatured}>Load more featured scripts</Button> : null}</RecordSection> : null}
    {list(competition.judges).length ? <RecordSection title="Judges"><div className="ckm-hall__disclosures">{competition.judges.map((judge, index) => <details key={`${judge.name}-${index}`}><summary><span>{judge.photoUrl ? <img src={resolveMediaUrl(judge.photoUrl)} alt="" /> : <span aria-hidden="true">{String(judge.name || "J").charAt(0)}</span>}</span><strong>{judge.name || "Judge"}<small>{[judge.title, judge.company].filter(Boolean).join(" · ")}</small></strong></summary><div>{judge.bio ? <p>{judge.bio}</p> : null}{judge.companyBio ? <p>{judge.companyBio}</p> : null}<div className="ckm-hall__actions">{judge.linkedin ? <Button size="sm" variant="tertiary" href={externalUrl(judge.linkedin)} target="_blank" rel="noreferrer noopener">LinkedIn</Button> : null}{judge.imdb ? <Button size="sm" variant="tertiary" href={externalUrl(judge.imdb)} target="_blank" rel="noreferrer noopener">IMDb</Button> : null}</div></div></details>)}</div></RecordSection> : null}
    {list(competition.sponsors).length ? <RecordSection title="Partners"><div className="ckm-hall__cards">{competition.sponsors.map((sponsor, index) => <Card key={`${sponsor.name}-${index}`}><CardBody>{sponsor.logoUrl ? <img className="ckm-hall__logo" src={resolveMediaUrl(sponsor.logoUrl)} alt={sponsor.name || "Partner"} /> : null}<Badge>{sponsor.tier || "Partner"}</Badge><CardTitle as="h3">{sponsor.name || "Challenge partner"}</CardTitle>{sponsor.description ? <CardText>{sponsor.description}</CardText> : null}{sponsor.url ? <Button size="sm" variant="tertiary" href={externalUrl(sponsor.url)} target="_blank" rel="noreferrer noopener">Visit website</Button> : null}</CardBody></Card>)}</div></RecordSection> : null}
    <p className="ckm-hall__privacy">Winning does not publish a private screenplay. Only scripts their writers separately chose to publish appear above.</p>
  </>);
}

export default function HallOfFameMobile({ user: suppliedUser = undefined, previewList = null, previewDetail = null, previewSlug = "" }) {
  const auth = useContext(AuthContext) || {};
  const user = suppliedUser === undefined ? auth.user : suppliedUser;
  const { slug: routeSlug = "" } = useParams();
  const slug = previewSlug || routeSlug;
  return slug ? <CompetitionRecord slug={slug} previewDetail={previewDetail} /> : <ArchiveList user={user} previewList={previewList} />;
}
