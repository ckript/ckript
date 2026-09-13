import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rewardLabel, yearSuffix } from "../../../components/competition/labels";
import { downloadChallengeCertificate } from "../../../pages/challenge/challengeHub";
import { resolveMediaUrl } from "../../../utils/mediaUrl";
import Badge from "../../components/badges/Badge";
import Button from "../../components/buttons/Button";
import Card, {
  CardBody,
  CardEyebrow,
  CardFooter,
  CardMedia,
  CardText,
  CardTitle,
} from "../../components/cards/Card";
import InlineMessage from "../../components/feedback/InlineMessage";
import {
  HONOUR_AWARDS,
  badgeImageForEntry,
  challengeAwardLabel,
  challengeDateRange,
  challengePhaseLabel,
  challengeResultSummary,
  challengeStatusLabel,
  challengeYear,
  formatChallengeCountdown,
  formatChallengeDate,
  nextChallengeDeadline,
} from "./challengeHubModel";

function ChallengeCountdown({ target, serverNow }) {
  const [offset] = useState(() => {
    const server = serverNow ? new Date(serverNow).getTime() : NaN;
    return Number.isFinite(server) ? server - Date.now() : 0;
  });
  const [now, setNow] = useState(() => Date.now() + offset);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);

  return <strong className="ckm-challenge-hub__countdown">{formatChallengeCountdown(target, now)}</strong>;
}

export function ChallengeCardMobile({ competition, variant = "live", serverNow }) {
  const past = variant === "past";
  const running = ["registration_open", "live"].includes(competition?.phase);
  const destination = `/challenge/c/${encodeURIComponent(competition?.slug || "")}`;
  const deadline = past ? null : nextChallengeDeadline(competition);
  const year = yearSuffix(competition?.name, competition?.year);

  return (
    <Card className={running ? "ckm-challenge-hub__card--live" : ""}>
      <CardMedia
        src={resolveMediaUrl(competition?.bannerUrl)}
        ratio="16 / 8"
        placeholderIcon="emoji_events"
        overlay={<Badge tone={running ? "accent" : "neutral"}>{past ? (competition?.resultsDeclaredAt ? "Concluded" : "Awaiting results") : challengePhaseLabel(competition?.phase)}</Badge>}
      />
      <CardBody>
        {year ? <CardEyebrow>{year}</CardEyebrow> : null}
        <CardTitle as="h2" to={destination}>{competition?.name || "Untitled challenge"}</CardTitle>
        {competition?.theme ? <p className="ckm-challenge-hub__theme">{competition.theme}</p> : null}
        {competition?.overview ? <CardText>{competition.overview}</CardText> : null}
        <dl className="ckm-challenge-hub__facts">
          <div><dt>Event</dt><dd>{challengeDateRange(competition)}</dd></div>
          {competition?.prizePool ? <div><dt>Prize pool</dt><dd>{competition.prizePool}</dd></div> : null}
        </dl>
      </CardBody>
      <CardFooter>
        {past ? (
          <>
            <span>{challengeResultSummary(competition)}</span>
            {(Number.isFinite(competition?.totalParticipants) || Number.isFinite(competition?.countriesRepresented)) ? (
              <span>
                {Number.isFinite(competition?.totalParticipants) ? `${competition.totalParticipants} entrants` : ""}
                {Number.isFinite(competition?.totalParticipants) && Number.isFinite(competition?.countriesRepresented) ? " · " : ""}
                {Number.isFinite(competition?.countriesRepresented) ? `${competition.countriesRepresented} countries` : ""}
              </span>
            ) : null}
          </>
        ) : deadline?.at ? (
          <><span>{deadline.label}</span><ChallengeCountdown key={`${deadline.at}:${serverNow || "device"}`} target={deadline.at} serverNow={serverNow} /></>
        ) : <span>{challengePhaseLabel(competition?.phase)}</span>}
      </CardFooter>
    </Card>
  );
}

const awardTone = (award) => (award === "winner" ? "accent" : award === "runner_up" ? "info" : "neutral");

export function LaureateCardMobile({ person, award }) {
  if (!person) return null;
  const profileKey = person.username || person.userId;
  const awardName = person.specialTitle || (award === "winner" ? "Winner" : award === "runner_up" ? "Runner-Up" : award === "second_runner_up" ? "Second Runner-Up" : "Special Award");
  return (
    <Card className="ckm-challenge-hub__laureate">
      <CardBody>
        <Badge tone={awardTone(award)}>{awardName}</Badge>
        {person.badgeImage ? <img src={person.badgeImage} alt="" style={{ width: 56, height: 56, objectFit: "contain", marginTop: 10 }} /> : null}
        <div className="ckm-challenge-hub__person">
          <span className="ckm-challenge-hub__avatar">
            {person.profileImage ? <img src={resolveMediaUrl(person.profileImage)} alt="" /> : <span aria-hidden="true">{String(person.name || "W").charAt(0)}</span>}
          </span>
          <div>
            <CardTitle as="h3" to={profileKey ? `/share/profile/${encodeURIComponent(profileKey)}` : null}>{person.name || "Writer"}</CardTitle>
            {person.scriptTitle ? <p>{person.scriptTitle}</p> : null}
          </div>
        </div>
        {person.logline ? <CardText>{person.logline}{person.loglineByAi ? " (AI summary)" : ""}</CardText> : null}
      </CardBody>
    </Card>
  );
}

function Timeline({ steps = [] }) {
  return (
    <ol className="ckm-challenge-hub__timeline">
      {steps.map((step) => (
        <li key={step.key} className={`is-${step.status || "upcoming"}`}>
          <span aria-hidden="true" />
          <div><strong>{step.label}</strong>{step.date ? <time dateTime={step.date}>{formatChallengeDate(step.date)}</time> : null}</div>
        </li>
      ))}
    </ol>
  );
}

export function EntryCardMobile({ item }) {
  const { entry = {}, competition = {}, timeline = [], phase } = item || {};
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const year = challengeYear(competition, entry);
  const award = entry?.result?.award || "none";
  const rewardNames = (entry?.rewardsGranted || [])
    .map((reward) => rewardLabel(reward.type, { specialTitle: entry?.result?.specialTitle }))
    .filter(Boolean);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    const result = await downloadChallengeCertificate({
      competitionId: competition?._id,
      competitionName: competition?.name,
    });
    if (!result.ok) setDownloadError(result.message);
    setDownloading(false);
  };

  return (
    <Card className="ckm-challenge-hub__entry">
      <CardBody>
        <div className="ckm-challenge-hub__entry-heading">
          <div>
            <CardEyebrow>{entry.eventId || "Challenge entry"}</CardEyebrow>
            <CardTitle as="h2">{competition.name || "Challenge"}{year && yearSuffix(competition.name, year) ? ` ${year}` : ""}</CardTitle>
          </div>
          <div className="ckm-challenge-hub__badges">
            <Badge tone="info">{challengeStatusLabel(entry.status)}</Badge>
            {competition.resultsDeclaredAt && award !== "none" ? <Badge tone={HONOUR_AWARDS.has(award) ? "accent" : "neutral"}>{challengeAwardLabel(entry)}</Badge> : null}
            {competition.resultsDeclaredAt && award !== "none" && badgeImageForEntry(competition, entry) ? <img src={badgeImageForEntry(competition, entry)} alt="" style={{ width: 48, height: 48, objectFit: "contain" }} /> : null}
          </div>
        </div>
        <dl className="ckm-challenge-hub__entry-stats">
          <div><dt>Registered</dt><dd>{formatChallengeDate(entry.createdAt) || "—"}</dd></div>
          <div><dt>Submitted</dt><dd>{formatChallengeDate(entry.submittedAt) || "—"}</dd></div>
          <div><dt>Pages</dt><dd>{entry.snapshot?.pageCount || "—"}</dd></div>
          <div><dt>Words</dt><dd>{entry.snapshot?.wordCount || "—"}</dd></div>
        </dl>
        {entry.snapshot?.title ? <p className="ckm-challenge-hub__script"><span>Script</span><strong>{entry.snapshot.title}</strong></p> : null}
        {rewardNames.length ? <div className="ckm-challenge-hub__rewards">{rewardNames.map((name) => <Badge key={name}>{name}</Badge>)}</div> : null}
        {downloadError ? <InlineMessage title="Certificate unavailable">{downloadError}</InlineMessage> : null}
        <div className="ckm-challenge-hub__entry-actions">
          {phase !== "results" ? <Button to={competition.slug ? `/challenge/dashboard?c=${encodeURIComponent(competition.slug)}` : "/challenge/dashboard"} variant="secondary" size="sm">Open dashboard</Button> : null}
          {entry.status === "judged" ? <Button variant="tertiary" size="sm" icon="download" pending={downloading} pendingLabel="Preparing…" onClick={download}>Certificate</Button> : null}
          <Button variant="tertiary" size="sm" trailingIcon={timelineOpen ? "expand_less" : "expand_more"} aria-expanded={timelineOpen} onClick={() => setTimelineOpen((open) => !open)}>
            {timelineOpen ? "Hide timeline" : "Show timeline"}
          </Button>
        </div>
        {timelineOpen ? <Timeline steps={timeline} /> : null}
      </CardBody>
    </Card>
  );
}

export function HallOfFameGroupMobile({ group }) {
  const competition = group?.competition || {};
  return (
    <section className="ckm-challenge-hub__honour-group" aria-labelledby={`honour-${competition._id}`}>
      <header>
        <div>
          <p>{competition.theme || "Hall of Fame"}</p>
          <h2 id={`honour-${competition._id}`}>{competition.name || "Challenge"}</h2>
          {competition.totalParticipants ? <span>{competition.totalParticipants} entrants · {competition.countriesRepresented || 0} countries</span> : null}
        </div>
        <Link to={`/hall-of-fame/${encodeURIComponent(competition.slug || "")}`}>Permanent record</Link>
      </header>
      <div className="ckm-challenge-hub__laureates">
        {(group.people || []).map(({ person, award }, index) => <LaureateCardMobile key={`${award}-${person?.userId || index}`} person={person} award={award} />)}
      </div>
    </section>
  );
}
