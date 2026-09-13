import { useContext, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { useAuthModal } from "../../../context/AuthModalContext";
import { COMPANY } from "../../../constants/company";
import { JUDGING_CRITERIA, ELIGIBILITY_EXAMPLES } from "../../../pages/challenge/constants";
import {
  CHALLENGE_DETAIL_STATUS,
  challengeCountdownTarget,
  challengeDetailAction,
} from "../../../pages/challenge/challengeDetail";
import useChallengeDetail from "../../../pages/challenge/useChallengeDetail";
import externalUrl from "../../../utils/externalUrl";
import { resolveMediaUrl } from "../../../utils/mediaUrl";
import Badge from "../../components/badges/Badge";
import Button from "../../components/buttons/Button";
import Card, { CardBody, CardMedia, CardText, CardTitle } from "../../components/cards/Card";
import EmptyState from "../../components/EmptyState";
import InlineMessage from "../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../components/feedback/Skeletons";
import PageHeader from "../../components/app-bars/PageHeader";
import MobileShell from "../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../shell/mobileShellModes";
import { LaureateCardMobile } from "./ChallengeHubCards";
import {
  challengePhaseLabel,
  formatChallengeCountdown,
  formatChallengeDate,
} from "./challengeHubModel";
import "./ChallengeDetailMobile.css";

const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

function DetailCountdown({ target, serverNow }) {
  const [offset] = useState(() => {
    const server = serverNow ? new Date(serverNow).getTime() : NaN;
    return Number.isFinite(server) ? server - Date.now() : 0;
  });
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  return <strong>{formatChallengeCountdown(target, now)}</strong>;
}

function DetailSection({ id, title, lead = "", children }) {
  return (
    <section id={id} className="ckm-challenge-detail__section" aria-labelledby={`${id}-title`}>
      <header>
        <h2 id={`${id}-title`}>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Timeline({ steps = [] }) {
  return (
    <ol className="ckm-challenge-detail__timeline">
      {steps.map((step) => (
        <li key={step.key} className={`is-${step.status || "upcoming"}`}>
          <span aria-hidden="true" />
          <div>
            <strong>{step.label}</strong>
            {step.date ? <time dateTime={step.date}>{formatChallengeDate(step.date)}</time> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PrizeCard({ title, items }) {
  return (
    <Card>
      <CardBody>
        <CardTitle as="h3">{title}</CardTitle>
        {list(items).length ? <ul className="ckm-challenge-detail__plain-list">{list(items).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <CardText>To be announced.</CardText>}
      </CardBody>
    </Card>
  );
}

function JudgeCard({ judge }) {
  return (
    <Card>
      <CardBody>
        <div className="ckm-challenge-detail__person">
          <span>{judge.photoUrl ? <img src={resolveMediaUrl(judge.photoUrl)} alt="" /> : <span aria-hidden="true">{String(judge.name || "J").charAt(0)}</span>}</span>
          <div><CardTitle as="h3">{judge.name || "Judge"}</CardTitle><p>{[judge.title, judge.company].filter(Boolean).join(" · ")}</p></div>
        </div>
        {judge.bio ? <CardText>{judge.bio}</CardText> : null}
        {judge.companyBio ? <CardText>{judge.companyBio}</CardText> : null}
        {(judge.linkedin || judge.imdb || judge.companyLink) ? (
          <div className="ckm-challenge-detail__links">
            {judge.linkedin ? <Button size="sm" variant="tertiary" href={externalUrl(judge.linkedin)} target="_blank" rel="noreferrer noopener">LinkedIn</Button> : null}
            {judge.imdb ? <Button size="sm" variant="tertiary" href={externalUrl(judge.imdb)} target="_blank" rel="noreferrer noopener">IMDb</Button> : null}
            {judge.companyLink ? <Button size="sm" variant="tertiary" href={externalUrl(judge.companyLink)} target="_blank" rel="noreferrer noopener">Company</Button> : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function SponsorCard({ sponsor }) {
  const tier = sponsor.tier === "Headline" ? "Headline partner" : sponsor.tier === "Media" ? "Media partner" : sponsor.tier || "Partner";
  return (
    <Card>
      {sponsor.logoUrl ? <CardMedia src={resolveMediaUrl(sponsor.logoUrl)} alt={sponsor.name || "Sponsor"} ratio="16 / 6" /> : null}
      <CardBody>
        <Badge>{tier}</Badge>
        <CardTitle as="h3">{sponsor.name || "Challenge partner"}</CardTitle>
        {sponsor.description ? <CardText>{sponsor.description}</CardText> : null}
        {sponsor.url ? <div className="ckm-challenge-detail__links"><Button size="sm" variant="tertiary" href={externalUrl(sponsor.url)} target="_blank" rel="noreferrer noopener">Visit website</Button></div> : null}
      </CardBody>
    </Card>
  );
}

// The Results section between the deadline and the announcement — what is coming, when, and where
// it will live. Same slot the laureates take once results are declared. An announcement date that
// has already passed is not repeated as a promise.
function ResultsPending({ competition, serverNow }) {
  // The SERVER's clock decides whether the announcement date has passed — the payload always
  // carries one, and reading the device clock during render is impure. Without a clock the date
  // is shown as given rather than judged.
  const serverTime = serverNow ? new Date(serverNow).getTime() : null;
  const resultsAt = competition?.dates?.resultsAt || null;
  const overdue = Boolean(resultsAt) && serverTime != null && new Date(resultsAt).getTime() <= serverTime;
  const submitted = Number.isFinite(competition?.scriptsSubmitted) ? competition.scriptsSubmitted : null;
  const when = resultsAt && !overdue ? ` on ${formatChallengeDate(resultsAt)}` : resultsAt ? ", as soon as the panel has finished" : "";
  return (
    <Card>
      <CardBody>
        <CardTitle as="h3">Judging in progress</CardTitle>
        <CardText>
          The writing window closed{competition?.dates?.endsAt ? ` on ${formatChallengeDate(competition.dates.endsAt)}` : ""}
          {submitted != null ? `, and ${submitted} ${submitted === 1 ? "script is" : "scripts are"} with the panel` : ""}.
          {" "}The winner, the runner-up and the special awards will be announced here{when}.
        </CardText>
        <CardText>Every honouree takes a permanent place in the Ckript Hall of Fame.</CardText>
        <div className="ckm-challenge-detail__links"><Button size="sm" variant="tertiary" to="/hall-of-fame">Visit the Hall of Fame</Button></div>
      </CardBody>
    </Card>
  );
}

// Declared results are also an induction, except for a challenge that ran by direct link only —
// the Hall of Fame excludes hidden and private competitions by design, and saying otherwise here
// would send its writers looking for a record that does not exist.
function HallOfFameNote({ visibility }) {
  const listed = !["hidden", "private"].includes(visibility);
  return (
    <Card>
      <CardBody>
        <CardTitle as="h3">Hall of Fame</CardTitle>
        <CardText>
          {listed
            ? "Every winner and special-award recipient above now holds a permanent place in the Ckript Hall of Fame."
            : "This challenge ran by direct link only, so its results stay on this page rather than in the public Hall of Fame."}
        </CardText>
        {listed ? <div className="ckm-challenge-detail__links"><Button size="sm" variant="tertiary" to="/hall-of-fame">Visit the Hall of Fame</Button></div> : null}
      </CardBody>
    </Card>
  );
}

function Results({ results }) {
  const people = [
    results?.winner ? { person: results.winner, award: "winner" } : null,
    results?.runnerUp ? { person: results.runnerUp, award: "runner_up" } : null,
    results?.secondRunnerUp ? { person: results.secondRunnerUp, award: "second_runner_up" } : null,
    ...list(results?.special).map((person) => ({ person, award: "special" })),
  ].filter(Boolean);
  if (!people.length) return <Card><CardBody><CardText>Results will be published here after judging.</CardText></CardBody></Card>;
  return <div className="ckm-challenge-detail__grid">{people.map(({ person, award }, index) => <LaureateCardMobile key={`${award}-${person.userId || index}`} person={person} award={award} />)}</div>;
}

export default function ChallengeDetailMobile({ user: suppliedUser = undefined, previewState = null, previewSlug = "" }) {
  const auth = useContext(AuthContext) || {};
  const user = suppliedUser === undefined ? auth.user : suppliedUser;
  const { slug: routeSlug = "" } = useParams();
  const slug = previewSlug || routeSlug;
  const location = useLocation();
  const navigate = useNavigate();
  const { openAuthModal } = useAuthModal();
  const liveDetail = useChallengeDetail({ slug, user, enabled: !previewState });
  const detail = previewState || liveDetail;
  const data = detail.public.data || {};
  const competition = data.competition;
  const entry = detail.entry.data || null;
  const publicStatus = detail.public.status;
  const entryPending = Boolean(user && competition && detail.entry.status === CHALLENGE_DETAIL_STATUS.LOADING);
  const entryFailed = detail.entry.status === CHALLENGE_DETAIL_STATUS.FAILED;
  const action = entryFailed
    ? { kind: "unavailable", label: "Entry status unavailable", disabled: true }
    : challengeDetailAction({ competition, entry, entryPending, phase: data.phase, user, fallbackSlug: slug });
  const countdown = challengeCountdownTarget(data.phase, competition?.dates);

  const signIn = () => openAuthModal({ redirect: `${location.pathname}${location.search}${location.hash}` });
  const runAction = () => {
    if (action.kind === "authenticate") return openAuthModal({ redirect: action.to });
    if (action.to) return navigate(action.to);
    if (action.targetId) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      document.getElementById(action.targetId)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    return undefined;
  };
  const retryOnReconnect = () => {
    detail.refresh();
    if (entryFailed) detail.retryEntry();
  };

  const header = (
    <PageHeader
      title={competition?.name || (publicStatus === CHALLENGE_DETAIL_STATUS.LOADING ? "Loading challenge" : "Challenge")}
      eyebrow={competition ? challengePhaseLabel(data.phase) : "Ckript competition"}
      backTo="/challenge"
      backLabel="Challenges"
      actions={!user ? <Button variant="tertiary" size="sm" onClick={signIn}>Sign in</Button> : null}
    />
  );

  const shell = (children) => (
    <MobileShell
      mode={MOBILE_SHELL_MODE.DETAIL}
      screenId="challenge-detail"
      className="ckm-challenge-detail"
      scrollClassName="ckm-challenge-detail__scroll"
      appBar={header}
      onConnectionRestored={retryOnReconnect}
    >
      {children}
    </MobileShell>
  );

  if (publicStatus === CHALLENGE_DETAIL_STATUS.LOADING) {
    return shell(<SkeletonGroup label="Loading challenge details" className="ckm-challenge-detail__loading"><SkeletonShape height={220} radius="var(--ckm-r-xl)" /><SkeletonShape height={180} radius="var(--ckm-r-xl)" /></SkeletonGroup>);
  }

  if (publicStatus === CHALLENGE_DETAIL_STATUS.FAILED) {
    return shell(<InlineMessage variant="panel" title="This challenge could not be loaded" onRetry={detail.refresh}>{detail.public.failure?.message}</InlineMessage>);
  }

  if (!competition) {
    return shell(<EmptyState titleAs="h2" icon="event_busy" title="Challenge not found" body="This challenge may be unavailable or the link may be incorrect." actions={<Button to="/challenge">Browse challenges</Button>} />);
  }

  const oneLiner = String(competition.overview || competition.shortDescription || "").split(/(?<=[.!?])\s/)[0] || "";
  const specialPrizes = list(competition.prizes?.special).map((item) => item.description ? `${item.title} — ${item.description}` : item.title);
  const sponsors = list(competition.sponsors).filter((item) => item.visibility !== "hidden");

  return shell(
    <>
      <header className="ckm-challenge-detail__hero">
        {competition.bannerUrl || competition.mobileBannerUrl ? <img src={resolveMediaUrl(competition.mobileBannerUrl || competition.bannerUrl)} alt="" /> : null}
        <div className="ckm-challenge-detail__hero-copy">
          <Badge tone={data.phase === "live" ? "accent" : "neutral"} dot={data.phase === "live"}>{challengePhaseLabel(data.phase)}</Badge>
          {oneLiner ? <p>{oneLiner}</p> : null}
          {countdown.target ? <div className="ckm-challenge-detail__countdown"><span>{countdown.label}</span><DetailCountdown key={`${countdown.target}:${data.serverNow || "device"}`} target={countdown.target} serverNow={data.serverNow} /></div> : null}
          <Button
            fullWidth
            to={["register", "dashboard"].includes(action.kind) ? action.to : null}
            onClick={["register", "dashboard"].includes(action.kind) ? undefined : runAction}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
          {action.reason ? <p className="ckm-challenge-detail__action-note">{action.reason}</p> : null}
          {entry ? <p className="ckm-challenge-detail__action-note">Registered as <strong>{entry.eventId}</strong></p> : null}
          {entryFailed ? <InlineMessage title="Your entry status is unavailable" onRetry={detail.retryEntry}>{detail.entry.failure?.message}</InlineMessage> : null}
        </div>
      </header>

      <DetailSection id="overview" title="At a glance">
        <Card><CardBody><dl className="ckm-challenge-detail__facts">
          <div><dt>Participants</dt><dd>{Number(competition.totalParticipants || 0).toLocaleString()}</dd></div>
          <div><dt>Prize pool</dt><dd>{competition.prizePool || "To be announced"}</dd></div>
          <div><dt>Eligibility</dt><dd>{competition.eligibility || "Open to all writers"}</dd></div>
          <div><dt>Format</dt><dd>{competition.format || "Ckript editor"}</dd></div>
        </dl></CardBody></Card>
      </DetailSection>

      {competition.theme?.title ? <DetailSection id="theme" title="The theme"><Card><CardBody><h3 className="ckm-challenge-detail__theme">{competition.theme.title}</h3>{competition.theme.brief ? <CardText>{competition.theme.brief}</CardText> : null}{list(competition.theme.allowedGenres).length ? <div className="ckm-challenge-detail__chips">{competition.theme.allowedGenres.map((genre) => <Badge key={genre}>{genre}</Badge>)}</div> : null}{competition.theme.guidelines ? <CardText>{competition.theme.guidelines}</CardText> : null}</CardBody></Card></DetailSection> : null}

      {/* Results — from the moment the window closes: what is coming during judging, the laureates
          and their Hall of Fame induction once declared. */}
      {data.phase === "judging" ? <DetailSection id="results" title="Results"><ResultsPending competition={competition} serverNow={data.serverNow} /></DetailSection> : null}
      {data.phase === "results" ? <DetailSection id="results" title="Results"><Results results={data.results} /><HallOfFameNote visibility={competition.visibility} /></DetailSection> : null}

      <DetailSection id="about" title="About the challenge"><Card><CardBody>{competition.overview ? <CardText>{competition.overview}</CardText> : null}<p className="ckm-challenge-detail__criteria">Judged on</p><div className="ckm-challenge-detail__chips">{JUDGING_CRITERIA.map((item) => <Badge key={item}>{item}</Badge>)}</div></CardBody></Card></DetailSection>

      <DetailSection id="eligibility" title="Who can enter"><Card><CardBody><CardText>Anyone who writes. Wherever you are, whatever you have written before.</CardText><div className="ckm-challenge-detail__chips">{ELIGIBILITY_EXAMPLES.map((item) => <Badge key={item}>{item}</Badge>)}</div></CardBody></Card></DetailSection>

      <DetailSection id="timeline" title="Timeline"><Card><CardBody><Timeline steps={data.timeline} /></CardBody></Card></DetailSection>

      <DetailSection id="prizes" title="Prizes"><div className="ckm-challenge-detail__grid"><PrizeCard title="Winner" items={competition.prizes?.winner} /><PrizeCard title="Runner-Up" items={competition.prizes?.runnerUp} />{list(competition.prizes?.secondRunnerUp).length ? <PrizeCard title="Second Runner-Up" items={competition.prizes?.secondRunnerUp} /> : null}<PrizeCard title="Special awards" items={specialPrizes} /></div></DetailSection>

      {list(competition.judges).length ? <DetailSection id="judges" title="Judges"><div className="ckm-challenge-detail__grid">{competition.judges.map((judge, index) => <JudgeCard key={`${judge.name}-${index}`} judge={judge} />)}</div></DetailSection> : null}

      {sponsors.length ? <DetailSection id="sponsors" title="Partners"><div className="ckm-challenge-detail__grid">{sponsors.map((sponsor, index) => <SponsorCard key={`${sponsor.name}-${index}`} sponsor={sponsor} />)}</div></DetailSection> : null}

      {list(competition.rules).length ? <DetailSection id="rules" title="Rules"><Card><CardBody><ol className="ckm-challenge-detail__plain-list is-numbered">{competition.rules.map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}</ol></CardBody></Card></DetailSection> : null}

      {list(competition.faq).length ? <DetailSection id="faq" title="Questions"><div className="ckm-challenge-detail__faq">{competition.faq.map((item, index) => <details key={`${item.q}-${index}`}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></DetailSection> : null}

      {list(competition.resources).length ? <DetailSection id="resources" title="Resources"><div className="ckm-challenge-detail__resource-links">{competition.resources.map((resource, index) => <Button key={`${resource.label}-${index}`} variant="secondary" href={externalUrl(resource.url)} target="_blank" rel="noreferrer noopener">{resource.label}</Button>)}</div></DetailSection> : null}

      {list(competition.communityLinks).length ? <DetailSection id="community" title="Community"><div className="ckm-challenge-detail__resource-links">{competition.communityLinks.map((link, index) => <Button key={`${link.label}-${index}`} variant="secondary" href={externalUrl(link.url)} target="_blank" rel="noreferrer noopener">{link.label}</Button>)}</div></DetailSection> : null}

      <DetailSection id="partner" title="Partner with us" lead="Sponsor a challenge, join the judging panel, or bring your community."><Button variant="secondary" href={`mailto:${COMPANY.supportEmail}?subject=${encodeURIComponent(`Partnership enquiry — ${competition.name}`)}`}>Get in touch</Button></DetailSection>
    </>,
  );
}
