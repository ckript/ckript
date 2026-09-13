import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { JUDGING_CRITERIA, PARTICIPANT_COMPLETION_MESSAGE, STUDIO_LOCKED_MESSAGE, WRITING_RESOURCES } from "../../../pages/challenge/constants";
import {
  CHALLENGE_DASHBOARD_STATUS,
  CHALLENGE_DASHBOARD_TABS,
  challengeDashboardTab,
} from "../../../pages/challenge/challengeDashboard";
import useChallengeDashboard from "../../../pages/challenge/useChallengeDashboard";
import { rewardLabel } from "../../../components/competition/labels";
import { isWriterRole } from "../../../utils/industryAccess";
import externalUrl from "../../../utils/externalUrl";
import { resolveMediaUrl } from "../../../utils/mediaUrl";
import Badge from "../../components/badges/Badge";
import Button from "../../components/buttons/Button";
import IconButton from "../../components/buttons/IconButton";
import Card, { CardActions, CardBody, CardText, CardTitle } from "../../components/cards/Card";
import EmptyState from "../../components/EmptyState";
import InlineMessage from "../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../components/feedback/Skeletons";
import LoadMore from "../../components/lists/LoadMore";
import NavBar from "../../components/navigation/NavBar";
import PageHeader from "../../components/app-bars/PageHeader";
import Tabs, { TabPanel } from "../../components/tabs/Tabs";
import MobileShell from "../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../shell/mobileShellModes";
import { formatChallengeCountdown, formatChallengeDate } from "./challengeHubModel";
import "./ChallengeDashboardMobile.css";

const submitted = (entry) => ["submitted", "ai_processed", "judged"].includes(entry?.status);
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

function Countdown({ target, serverNow, label }) {
  const [offset] = useState(() => {
    const server = serverNow ? new Date(serverNow).getTime() : NaN;
    return Number.isFinite(server) ? server - Date.now() : 0;
  });
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  return <div className="ckm-challenge-dashboard__countdown"><span>{label}</span><strong>{formatChallengeCountdown(target, now)}</strong></div>;
}

function Timeline({ steps = [] }) {
  return <ol className="ckm-challenge-dashboard__timeline">{steps.map((step) => <li key={step.key} className={`is-${step.status || "upcoming"}`}><span aria-hidden="true" /><div><strong>{step.label}</strong>{step.date ? <time dateTime={step.date}>{formatChallengeDate(step.date)}</time> : null}</div></li>)}</ol>;
}

function Section({ title, children, lead = "" }) {
  return <section className="ckm-challenge-dashboard__section"><header><h2>{title}</h2>{lead ? <p>{lead}</p> : null}</header>{children}</section>;
}

function EditorAction({ dashboard, entry, navigate }) {
  const open = async () => {
    const scriptId = await dashboard.openEditor();
    if (scriptId) navigate(`/create-project/${encodeURIComponent(scriptId)}?ctx=competition`);
  };
  return <><Button fullWidth pending={dashboard.opening} pendingLabel="Opening editor…" onClick={open}>{entry.scriptId ? "Continue writing" : "Open Script Editor"}</Button>{dashboard.openError ? <InlineMessage>{dashboard.openError}</InlineMessage> : null}</>;
}

function Studio({ data, dashboard, navigate }) {
  const { competition, entry, phase, serverNow } = data;
  if (submitted(entry)) return <div className="ckm-challenge-dashboard__stack"><InlineMessage tone="success" title="Script submitted">Submitted {entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : "successfully"}. Your competition script is locked.</InlineMessage><Card><CardBody><CardTitle as="h2">Your submission</CardTitle><dl className="ckm-challenge-dashboard__stats">{[["Words", entry.snapshot?.wordCount], ["Pages", entry.snapshot?.pageCount], ["Scenes", entry.snapshot?.sceneCount], ["Characters", entry.snapshot?.charCount]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Number(value || 0).toLocaleString()}</dd></div>)}</dl>{entry.snapshot?.title ? <CardText>Title: <strong>{entry.snapshot.title}</strong></CardText> : null}</CardBody></Card></div>;
  if (phase !== "live") return <EmptyState titleAs="h2" icon="lock" title="Script Studio is locked" body={STUDIO_LOCKED_MESSAGE} actions={competition.dates?.startsAt && !["judging", "results"].includes(phase) ? <Countdown target={competition.dates.startsAt} serverNow={serverNow} label="Opens in" /> : null} />;
  return <Card><CardBody><CardTitle as="h2">Script Studio</CardTitle><CardText>Write in the Ckript editor. It saves automatically; the final submission confirmations stay inside the editor.</CardText><CardActions><EditorAction dashboard={dashboard} entry={entry} navigate={navigate} /></CardActions></CardBody></Card>;
}

function ReferralPanel({ data, dashboard }) {
  const state = dashboard.referrals;
  const progress = state.progress || data.referrals;
  const code = state.referralCode || data.referralCode;
  const link = code && typeof window !== "undefined" ? `${window.location.origin}/${code}` : "";
  const [copied, setCopied] = useState(false);
  return <Card><CardBody><CardTitle as="h2">Bring other writers in</CardTitle><CardText>Verified writers who join through your link count toward this challenge&apos;s rewards.</CardText>{link ? <div className="ckm-challenge-dashboard__copy"><code>{link}</code><IconButton icon={copied ? "check" : "content_copy"} label={copied ? "Referral link copied" : "Copy referral link"} onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }} /></div> : null}{progress ? <div className="ckm-challenge-dashboard__referral-progress"><strong>{Number(progress.count || 0)}</strong><span>qualified</span>{progress.next ? <p>{progress.next.needed} more for {progress.next.label}</p> : <p>Top tier reached</p>}</div> : null}{state.status === CHALLENGE_DASHBOARD_STATUS.FAILED && !state.items.length ? <InlineMessage title="Referral history unavailable" onRetry={dashboard.retryReferrals}>{state.failure?.message}</InlineMessage> : state.status === CHALLENGE_DASHBOARD_STATUS.LOADING && !state.items.length ? <SkeletonShape height={84} radius="var(--ckm-r-lg)" /> : state.items.length ? <><ul className="ckm-challenge-dashboard__referrals">{state.items.map((row, index) => <li key={`${row.username || row.name}-${row.registeredAt || index}`}><span><strong>{row.name}</strong>{row.username ? <small>@{row.username}</small> : null}</span><Badge tone={row.status === "qualified" ? "success" : "neutral"}>{row.status === "qualified" ? "Qualified" : "Awaiting verification"}</Badge></li>)}</ul><LoadMore loaded={state.items.length} total={state.total} pageSize={state.limit} pending={state.status === CHALLENGE_DASHBOARD_STATUS.LOADING} error={state.failure?.message || ""} onLoadMore={dashboard.loadMoreReferrals} onRetry={dashboard.retryReferrals} noun="referrals" /></> : <p className="ckm-challenge-dashboard__muted">Nobody has joined through your link yet.</p>}</CardBody></Card>;
}

function ParticipantPanel({ dashboard }) {
  const state = dashboard.participants;
  if (state.status === CHALLENGE_DASHBOARD_STATUS.LOADING && !state.items.length) return <SkeletonGroup label="Loading participants"><SkeletonShape height={90} radius="var(--ckm-r-lg)" /><SkeletonShape height={90} radius="var(--ckm-r-lg)" /></SkeletonGroup>;
  if (state.status === CHALLENGE_DASHBOARD_STATUS.FAILED && !state.items.length) return <InlineMessage variant="panel" title="Participant room unavailable" onRetry={dashboard.retryParticipants}>{state.failure?.message}</InlineMessage>;
  if (!state.items.length) return <EmptyState compact titleAs="h3" icon="group" title="No participants to show yet" body="Registered writers will appear here." />;
  return <>{dashboard.followError ? <InlineMessage>{dashboard.followError}</InlineMessage> : null}<ul className="ckm-challenge-dashboard__participants">{state.items.map((person) => <li key={person._id}>{person.profileImage ? <img src={resolveMediaUrl(person.profileImage)} alt="" /> : <span className="ckm-challenge-dashboard__avatar" aria-hidden="true">{String(person.name || "W").charAt(0)}</span>}<div><Link to={person.canonicalPath}>{person.name || "Writer"}</Link>{person.username ? <small>@{person.username}</small> : null}{person.bio ? <p>{person.bio}</p> : person.isPrivate ? <p>Private profile</p> : null}</div>{!person.isSelf ? <Button size="sm" variant="secondary" pending={dashboard.followPending === String(person._id)} pendingLabel="Updating…" onClick={() => dashboard.toggleFollow(person)}>{person.isFollowing ? "Following" : person.followRequestPending ? "Requested" : "Follow"}</Button> : <Badge>You</Badge>}</li>)}</ul><LoadMore loaded={state.items.length} total={state.total} pageSize={state.limit} pending={state.status === CHALLENGE_DASHBOARD_STATUS.LOADING} error={state.failure?.message || ""} onLoadMore={dashboard.loadMoreParticipants} onRetry={dashboard.retryParticipants} noun="writers" /></>;
}

function Home({ data, dashboard, navigate }) {
  const { competition, entry, phase, timeline, results } = data;
  const award = entry.result?.award || "none";
  return <div className="ckm-challenge-dashboard__stack"><Card><CardBody><CardTitle as="h2">Your challenge journey</CardTitle><Timeline steps={timeline} /></CardBody></Card>{phase === "live" && competition.theme?.title ? <Card><CardBody><Badge tone="accent">Your theme</Badge><h2 className="ckm-challenge-dashboard__theme">{competition.theme.title}</h2>{competition.theme.brief ? <CardText>{competition.theme.brief}</CardText> : null}</CardBody></Card> : null}{phase === "live" && !submitted(entry) ? <Card><CardBody><EditorAction dashboard={dashboard} entry={entry} navigate={navigate} /></CardBody></Card> : null}{submitted(entry) ? <InlineMessage tone="success" title="Script submitted">Your script is locked and safe. Submission remains final.</InlineMessage> : null}{phase === "judging" ? <InlineMessage tone="info" title="Judging is underway">We&apos;ll email you when results are announced.</InlineMessage> : null}{phase === "results" ? <Card><CardBody><Badge tone={award !== "none" && award !== "participant" ? "accent" : "neutral"}>Results</Badge><CardTitle as="h2">{award === "winner" ? "Winner" : award === "runner_up" ? "Runner-Up" : award === "special" ? entry.result?.specialTitle || "Special award" : "Challenge complete"}</CardTitle><CardText>{["winner", "runner_up", "special"].includes(award) ? "Congratulations — your rewards have been added to your account." : PARTICIPANT_COMPLETION_MESSAGE(competition.name)}</CardText>{results?.winner ? <CardText>Winner: <strong>{results.winner.name}</strong>{results.winner.scriptTitle ? ` — ${results.winner.scriptTitle}` : ""}</CardText> : null}{entry.rewardsGranted?.length ? <ul className="ckm-challenge-dashboard__rewards">{entry.rewardsGranted.map((reward, index) => <li key={`${reward.type}-${index}`}><Badge tone="success">{rewardLabel(reward.type, { specialTitle: entry.result?.specialTitle })}</Badge></li>)}</ul> : null}{entry.status === "judged" ? <CardActions><Button variant="secondary" pending={dashboard.certificatePending} pendingLabel="Preparing certificate…" onClick={dashboard.downloadCertificate}>Download certificate</Button></CardActions> : null}{dashboard.certificateError ? <InlineMessage>{dashboard.certificateError}</InlineMessage> : null}</CardBody></Card> : null}{entry.ai?.processedAt || entry.ai?.logline ? <Card><CardBody><CardTitle as="h2">Your AI story materials</CardTitle>{entry.ai.logline ? <><p className="ckm-challenge-dashboard__label">Logline</p><CardText>{entry.ai.logline}</CardText></> : null}{entry.ai.synopsis ? <><p className="ckm-challenge-dashboard__label">Synopsis</p><CardText>{entry.ai.synopsis}</CardText></> : null}{entry.ai.evaluation ? <dl className="ckm-challenge-dashboard__evaluation">{Object.entries(entry.ai.evaluation).filter(([, value]) => typeof value === "number").map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl> : null}</CardBody></Card> : null}<Button variant="secondary" fullWidth to="/challenge?tab=mine">View all my challenges</Button></div>;
}

export default function ChallengeDashboardMobile({ user: userProp = undefined, previewState = null, previewSlug = "" }) {
  const auth = useContext(AuthContext) || {};
  const user = userProp === undefined ? auth.user : userProp;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const slug = previewSlug || params.get("c") || "";
  const tab = challengeDashboardTab(params.get("tab"));
  const live = useChallengeDashboard({ slug, user, enabled: !previewState && isWriterRole(user), communityEnabled: tab === "community" });
  const dashboard = previewState || live;
  const data = dashboard.data || {};
  const competition = data.competition;
  const entry = data.entry;
  const selectTab = (next) => { const updated = new URLSearchParams(params); if (next === "home") updated.delete("tab"); else updated.set("tab", next); if (slug) updated.set("c", slug); setParams(updated, { replace: true }); };
  const header = <PageHeader title={competition?.name || "Challenge dashboard"} subtitle="Participant dashboard" backTo="/challenge?tab=mine" backLabel="My challenges" />;
  const shell = (children) => <MobileShell mode={MOBILE_SHELL_MODE.STANDARD} screenId="challenge-dashboard" className="ckm-challenge-dashboard" scrollClassName="ckm-challenge-dashboard__scroll" appBar={header} bottomNav={<NavBar user={user} />} onConnectionRestored={dashboard.refresh}>{children}</MobileShell>;
  if (!isWriterRole(user)) return shell(<EmptyState titleAs="h2" icon="edit_off" title="A writer account is required" body="Only writer and creator accounts can use a participant dashboard." actions={<Button to="/challenge">Browse challenges</Button>} />);
  if (dashboard.status === CHALLENGE_DASHBOARD_STATUS.LOADING) return shell(<SkeletonGroup label="Loading challenge dashboard"><SkeletonShape height={116} radius="var(--ckm-r-lg)" /><SkeletonShape height={260} radius="var(--ckm-r-lg)" /></SkeletonGroup>);
  if (dashboard.status === CHALLENGE_DASHBOARD_STATUS.FAILED) return shell(<InlineMessage variant="panel" title="Dashboard unavailable" onRetry={dashboard.refresh}>{dashboard.failure?.message}</InlineMessage>);
  if (dashboard.status === CHALLENGE_DASHBOARD_STATUS.NOT_FOUND || !competition) return shell(<EmptyState titleAs="h2" icon="event_busy" title="Challenge not found" body="This challenge may be unavailable or the link may be incorrect." actions={<Button to="/challenge">Browse challenges</Button>} />);
  if (dashboard.status === CHALLENGE_DASHBOARD_STATUS.NOT_REGISTERED || !entry) return shell(<EmptyState titleAs="h2" icon="how_to_reg" title="You are not registered" body="Open the challenge record to check whether registration is still available." actions={<Button to={`/challenge/c/${encodeURIComponent(competition.slug || slug)}`}>View challenge</Button>} />);
  const current = data.timeline?.find((step) => step.status === "current");
  return shell(<><header className="ckm-challenge-dashboard__masthead"><div><Badge tone={data.phase === "live" ? "accent" : "neutral"} dot={data.phase === "live"}>{current?.label || data.phase}</Badge>{submitted(entry) ? <Badge tone="success">Submitted</Badge> : <Badge>Registered</Badge>}</div><h2>Welcome back, {user?.name || "writer"}.</h2><div className="ckm-challenge-dashboard__event"><span>Event ID</span><code>{entry.eventId}</code></div>{["announced", "registration_open", "registration_closed"].includes(data.phase) && competition.dates?.startsAt ? <Countdown target={competition.dates.startsAt} serverNow={data.serverNow} label="Challenge starts in" /> : null}{data.phase === "live" && competition.dates?.endsAt ? <Countdown target={competition.dates.endsAt} serverNow={data.serverNow} label="Time remaining" /> : null}</header><Tabs tabsId="challenge-dashboard" label="Dashboard sections" tabs={CHALLENGE_DASHBOARD_TABS} value={tab} onChange={selectTab} />
    <TabPanel tabsId="challenge-dashboard" id="home" value={tab}><Home data={data} dashboard={dashboard} navigate={navigate} /></TabPanel>
    <TabPanel tabsId="challenge-dashboard" id="event" value={tab}><div className="ckm-challenge-dashboard__stack">{competition.theme?.title ? <Card><CardBody><CardTitle as="h2">Theme &amp; genre</CardTitle><h3 className="ckm-challenge-dashboard__theme">{competition.theme.title}</h3>{competition.theme.brief ? <CardText>{competition.theme.brief}</CardText> : null}{competition.theme.writingPrompt ? <blockquote>{competition.theme.writingPrompt}</blockquote> : null}</CardBody></Card> : null}<Card><CardBody><CardTitle as="h2">Rules</CardTitle><ol className="ckm-challenge-dashboard__plain-list">{list(competition.rules).map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}</ol></CardBody></Card><Card><CardBody><CardTitle as="h2">Judging criteria</CardTitle><div className="ckm-challenge-dashboard__badges">{JUDGING_CRITERIA.map((item) => <Badge key={item}>{item}</Badge>)}</div></CardBody></Card><Card><CardBody><CardTitle as="h2">Eligibility &amp; format</CardTitle><CardText>{competition.eligibility || "Open to all writers."}</CardText><CardText>{competition.format}</CardText></CardBody></Card><Card><CardBody><CardTitle as="h2">Timeline</CardTitle><Timeline steps={data.timeline} /></CardBody></Card></div></TabPanel>
    <TabPanel tabsId="challenge-dashboard" id="prizes" value={tab}><div className="ckm-challenge-dashboard__stack">{[["Winner", competition.prizes?.winner], ["Runner-Up", competition.prizes?.runnerUp], ["Special awards", list(competition.prizes?.special).map((item) => item.description ? `${item.title} — ${item.description}` : item.title)]].map(([title, items]) => <Card key={title}><CardBody><CardTitle as="h2">{title}</CardTitle>{list(items).length ? <ul className="ckm-challenge-dashboard__plain-list">{list(items).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <CardText>To be announced.</CardText>}</CardBody></Card>)}</div></TabPanel>
    <TabPanel tabsId="challenge-dashboard" id="community" value={tab}><div className="ckm-challenge-dashboard__stack"><Section title="Community" lead="Meet the other writers taking part.">{list(competition.communityLinks).length ? <div className="ckm-challenge-dashboard__actions">{competition.communityLinks.map((link, index) => <Button key={`${link.label}-${index}`} variant="secondary" href={externalUrl(link.url)} target="_blank" rel="noreferrer noopener">{link.label}</Button>)}</div> : <p className="ckm-challenge-dashboard__muted">Community links will appear here soon.</p>}</Section><ReferralPanel data={data} dashboard={dashboard} /><Section title="Who else is writing"><ParticipantPanel dashboard={dashboard} /></Section></div></TabPanel>
    <TabPanel tabsId="challenge-dashboard" id="resources" value={tab}><div className="ckm-challenge-dashboard__stack">{WRITING_RESOURCES.map((resource) => <Card key={resource.title}><CardBody><CardTitle as="h2">{resource.title}</CardTitle><CardText>{resource.body}</CardText></CardBody></Card>)}{list(competition.resources).length ? <Section title="More from Ckript"><div className="ckm-challenge-dashboard__actions">{competition.resources.map((resource, index) => <Button key={`${resource.label}-${index}`} variant="secondary" href={externalUrl(resource.url)} target="_blank" rel="noreferrer noopener">{resource.label}</Button>)}</div></Section> : null}</div></TabPanel>
    <TabPanel tabsId="challenge-dashboard" id="studio" value={tab}><Studio data={data} dashboard={dashboard} navigate={navigate} /></TabPanel>
  </>);
}
