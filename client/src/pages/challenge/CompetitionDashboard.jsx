import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Home, CalendarDays, Trophy, Users, BookOpen, PenLine,
  Lock, Copy, Check, CheckCircle2, AlertCircle, ExternalLink,
} from "lucide-react";
import { AuthContext } from "../../context/AuthContext";
import useChallengeDashboard from "./useChallengeDashboard";
import { CHALLENGE_DASHBOARD_STATUS, challengeDashboardTab } from "./challengeDashboard";
import CountdownTimer from "../../components/competition/CountdownTimer";
import PhaseTimeline from "../../components/competition/PhaseTimeline";
import CompetitionJourney from "../../components/competition/CompetitionJourney";
import CompetitionParticipants from "../../components/competition/CompetitionParticipants";
import ReferralDrive from "../../components/competition/ReferralDrive";
import { rewardLabel } from "../../components/competition/labels";
import "./challenge.css";
import {
  JUDGING_CRITERIA, WRITING_RESOURCES, STUDIO_LOCKED_MESSAGE, PARTICIPANT_COMPLETION_MESSAGE,
} from "./constants";

/**
 * The participant's home while the clock runs.
 *
 * This page is OPERATED rather than read, so it is laid out as an instrument: the phase and the time
 * left sit above the section nav where they answer themselves from whichever tab you are standing
 * in, and everything below is the detail you go looking for. Coral appears only on the running
 * clock — the status chips, the journey and the results all read by weight instead.
 */

// Icons are stored as rendered elements, the way the hub stores its tab icons: a destructured param
// renamed to PascalCase and used only inside JSX is not seen as used by no-unused-vars in this
// config, which is why the previous `icon: Home` form failed lint.
const ICON = "h-4 w-4";
const SECTIONS = [
  { key: "home", label: "Home", icon: <Home className={ICON} aria-hidden="true" /> },
  { key: "event", label: "Event", icon: <CalendarDays className={ICON} aria-hidden="true" /> },
  { key: "prizes", label: "Prizes", icon: <Trophy className={ICON} aria-hidden="true" /> },
  { key: "community", label: "Community", icon: <Users className={ICON} aria-hidden="true" /> },
  { key: "resources", label: "Resources", icon: <BookOpen className={ICON} aria-hidden="true" /> },
  { key: "studio", label: "Script Studio", icon: <PenLine className={ICON} aria-hidden="true" /> },
];

// `style` is how a card takes a token value — the same inline idiom CompetitionCard and WinnerCard
// use, since challenge.css deliberately ships surfaces rather than a utility set.
const Card = ({ children, className = "", style }) => (
  <div className={`ckc-card ckc-card-pad ${className}`} style={style}>
    {children}
  </div>
);

// Registration and submission are FACTS, not live states: both chips stay quiet and rank is carried
// by weight. The accent on this page belongs to the running clock and nothing else.
const PILL_INK = { brand: "var(--ckc-ink)" };

const Pill = ({ tone = "neutral", children }) => (
  <span className="ckc-chip" style={{ color: PILL_INK[tone] }}>{children}</span>
);

// A score is a measurement, so it is drawn as well as written: the criterion reads as prose, the
// figure in the slug-line voice with tabular figures so a column of them lines up, and the bar is an
// accent fill on a quiet cream track.
const ScoreBar = ({ label, value }) => (
  <div>
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ fontSize: 14, color: "var(--ckc-body)" }}>{label}</span>
      <span className="ckc-meta" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
    <div style={{ marginTop: 7, height: 4, borderRadius: 2, background: "var(--ckc-cream)" }}>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "var(--ckc-accent)",
          width: `${Math.max(0, Math.min(100, Number(value) || 0))}%`,
        }}
      />
    </div>
  </div>
);

const AIResults = ({ ai }) => {
  if (!ai?.processedAt && !ai?.logline) return null;
  const ev = ai.evaluation || null;
  return (
    <Card>
      <h3 className="ckc-title ckc-h3">Your AI story materials</h3>
      {ai.logline ? (
        <div className="mt-5">
          <p className="ckc-meta">Logline</p>
          {/* A logline is the pitch, so it is set the way every other pitch on these pages is. */}
          <p style={{ marginTop: 7, fontFamily: "var(--ckc-display)", fontStyle: "italic", fontSize: "1.0625rem", lineHeight: 1.5, color: "var(--ckc-ink)" }}>
            {ai.logline}
          </p>
        </div>
      ) : null}
      {ai.synopsis ? (
        <div className="mt-5">
          <p className="ckc-meta">Synopsis</p>
          <p className="ckc-prose mt-2 whitespace-pre-line" style={{ fontSize: 14 }}>{ai.synopsis}</p>
        </div>
      ) : null}
      {ev ? (
        <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--ckc-rule)" }}>
          <p className="ckc-meta">Evaluation</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {["plot", "characters", "dialogue", "pacing", "marketability", "overall"].map((key) => (
              ev[key] !== undefined ? <ScoreBar key={key} label={key[0].toUpperCase() + key.slice(1)} value={ev[key]} /> : null
            ))}
          </div>
          {ev.feedback ? <p className="ckc-prose mt-5" style={{ fontSize: 14 }}>{ev.feedback}</p> : null}
        </div>
      ) : null}
    </Card>
  );
};

const CompetitionDashboard = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext) || {};
  // One route serves every competition, so the one being looked at travels in `?c=` from whichever
  // page linked here. Resolving "the active competition" instead would show a writer the wrong
  // event's clock, theme and entry — and their own is the one with a deadline.
  const [searchParams, setSearchParams] = useSearchParams();
  const slug = searchParams.get("c") || "";
  const dashboard = useChallengeDashboard({ slug, user, communityEnabled: challengeDashboardTab(searchParams.get("tab")) === "community" });
  const { competition, entry, phase, timeline, results, referrals, referralCode, serverNow } = dashboard.data || {};
  const loading = dashboard.status === CHALLENGE_DASHBOARD_STATUS.LOADING;
  const section = challengeDashboardTab(searchParams.get("tab"));
  const setSection = (next) => {
    const updated = new URLSearchParams(searchParams);
    if (next === "home") updated.delete("tab"); else updated.set("tab", next);
    if (slug) updated.set("c", slug);
    setSearchParams(updated, { replace: true });
  };
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if ([CHALLENGE_DASHBOARD_STATUS.NOT_FOUND, CHALLENGE_DASHBOARD_STATUS.NOT_REGISTERED].includes(dashboard.status)) navigate("/challenge", { replace: true });
  }, [dashboard.status, navigate]);

  if (dashboard.status === CHALLENGE_DASHBOARD_STATUS.FAILED) {
    return <div className="ckc" style={{ minHeight: "100vh", padding: 48, textAlign: "center" }}><p className="ckc-prose">{dashboard.failure?.message}</p><button type="button" className="ckc-btn mt-4" onClick={dashboard.refresh}>Try again</button></div>;
  }

  if (loading || !competition || !entry) {
    return (
      <div className="ckc" style={{ minHeight: "100vh" }}>
        <p className="ckc-meta" style={{ padding: "96px 16px", textAlign: "center" }}>Loading…</p>
      </div>
    );
  }

  const hasSubmitted = ["submitted", "ai_processed", "judged"].includes(entry.status);
  const isLive = phase === "live";

  // Where the competition stands, named by the SERVER — the same `timeline` payload PhaseTimeline and
  // CompetitionJourney render, so the masthead can never disagree with the strip below it.
  const currentStep = (timeline || []).find((step) => step.status === "current");

  const openEditor = async () => {
    const scriptId = await dashboard.openEditor();
    if (scriptId) navigate(`/create-project/${scriptId}?ctx=competition`);
  };

  const renderOpenEditorButton = () => (
    <div>
      <button
        type="button"
        onClick={openEditor}
        disabled={dashboard.opening}
        className="ckc-btn"
      >
        {dashboard.opening ? "Opening…" : entry.scriptId ? "Continue writing" : "Open Script Editor"}
      </button>
      {dashboard.openError ? (
        <p style={{ marginTop: 10, fontSize: 14, color: "var(--ckc-accent-text)" }}>{dashboard.openError}</p>
      ) : null}
    </div>
  );

  // Submitted is DONE, not live — so it reads as a settled inset in ink, the way a completed step
  // reads in the journey strip. There is no green in this palette on purpose.
  const renderSubmittedCard = () => (
    <Card style={{ background: "var(--ckc-cream)" }}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--ckc-ink)" }} aria-hidden="true" />
        <div>
          <p className="ckc-title ckc-h3">Script submitted</p>
          <p style={{ marginTop: 5, fontSize: 14, lineHeight: 1.6, color: "var(--ckc-muted)" }}>
            Submitted {new Date(entry.submittedAt).toLocaleString()}. Your script is locked and safe.
          </p>
        </div>
      </div>
    </Card>
  );

  const awardLabel = {
    winner: "Winner",
    runner_up: "Runner-Up",
    second_runner_up: "Second Runner-Up",
    special: entry.result?.specialTitle || "Special Award",
    participant: "Participant",
  }[entry.result?.award];
  // The competition's own artwork for this badge, when the admin uploaded one: a special award's
  // own image first, then the image for its kind. Mirrors badgeImageFor on the server.
  const badgeImage = (() => {
    const award = entry.result?.award;
    if (award === "special" && entry.result?.specialTitle) {
      const wanted = String(entry.result.specialTitle).trim().toLowerCase();
      const row = (competition.prizes?.special || []).find((s) => String(s?.title || "").trim().toLowerCase() === wanted);
      if (row?.badgeUrl) return row.badgeUrl;
    }
    const kind = { winner: "winner", runner_up: "runnerUp", second_runner_up: "secondRunnerUp", special: "special", participant: "participant" }[award];
    return kind ? String(competition.badgeImages?.[kind] || "") : "";
  })();

  const renderHome = () => (
    <div className="ckc-stack">
      <Card>
        <CompetitionJourney steps={timeline} />
      </Card>

      {isLive ? (
        <>
          {competition.theme?.title ? (
            // The brief. Once released this is the single most important thing a writer reads on the
            // page, so it gets the display serif, italic, and room to breathe.
            <Card style={{ padding: "30px 32px" }}>
              <p className="ckc-meta" style={{ color: "var(--ckc-accent-text)" }}>Your theme</p>
              <h2 className="ckc-title ckc-h2" style={{ marginTop: 12, fontStyle: "italic" }}>{competition.theme.title}</h2>
              {competition.theme.brief ? (
                <p className="ckc-prose whitespace-pre-line" style={{ marginTop: 16 }}>{competition.theme.brief}</p>
              ) : null}
              {competition.theme.allowedGenres?.length ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {competition.theme.allowedGenres.map((g) => (
                    <span key={g} className="ckc-chip">{g}</span>
                  ))}
                </div>
              ) : null}
              {competition.theme.guidelines ? (
                <p
                  className="ckc-prose whitespace-pre-line"
                  style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--ckc-rule)", fontSize: 14, color: "var(--ckc-muted)" }}
                >
                  {competition.theme.guidelines}
                </p>
              ) : null}
            </Card>
          ) : null}

          {hasSubmitted ? renderSubmittedCard() : <Card>{renderOpenEditorButton()}</Card>}
        </>
      ) : null}

      {phase === "judging" ? (
        <Card>
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--ckc-muted)" }} aria-hidden="true" />
            <div>
              <p className="ckc-title ckc-h3">Submissions closed</p>
              <p className="ckc-prose" style={{ marginTop: 6, fontSize: 14 }}>
                AI processing and judging are underway. We'll email you the moment results are announced.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {phase === "results" ? (
        <Card className={entry.result?.award && entry.result.award !== "participant" && entry.result.award !== "none"
          ? "ckc-live" : ""}>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5" style={{ color: "var(--ckc-muted)" }} aria-hidden="true" />
            <h2 className="ckc-title ckc-h2">Results are in</h2>
          </div>
          {badgeImage && entry.result.award !== "none" ? (
            <img src={badgeImage} alt="" style={{ width: 96, height: 96, objectFit: "contain", marginTop: 16 }} />
          ) : null}
          {awardLabel && entry.result.award !== "none" ? (
            <p className="ckc-title ckc-h3" style={{ marginTop: 14 }}>{awardLabel}</p>
          ) : null}
          {["winner", "runner_up", "second_runner_up", "special"].includes(entry.result?.award) ? (
            <p className="ckc-prose" style={{ marginTop: 8 }}>
              Congratulations — your rewards have been added to your account.
            </p>
          ) : (
            <p className="ckc-prose" style={{ marginTop: 8 }}>{PARTICIPANT_COMPLETION_MESSAGE(competition.name)}</p>
          )}

          {/* The competition released the script when results were declared. Say so — otherwise a
              winner has a "featured placement" prize with no idea that publishing is what claims it,
              and everyone else does not know their script is theirs to work on again. */}
          {entry.status === "judged" ? (
            <p
              className="ckc-prose"
              style={{ marginTop: 16, padding: "12px 14px", borderRadius: 3, background: "var(--ckc-cream)", fontSize: 14 }}
            >
              Your script is unlocked — you'll find it in{" "}
              <Link to="/dashboard" className="ckc-link">your drafts</Link>.
              {entry.rewardsGranted?.some((r) => r.type === "featured_script")
                ? " Publish it to claim your featured placement."
                : " It's yours to edit, publish or co-write as you like."}
            </p>
          ) : null}
          {entry.rewardsGranted?.length ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {/* Ledger keys are machine strings — raw, a category winner read "badge special".
                  rewardLabel humanises them, names the award, and drops internal bookkeeping. */}
              {entry.rewardsGranted
                .map((reward) => rewardLabel(reward.type, { specialTitle: entry.result?.specialTitle }))
                .filter(Boolean)
                .map((label, i) => (
                  <li key={i} className="ckc-chip">
                    <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </li>
                ))}
            </ul>
          ) : null}
          {results?.winner ? (
            <p style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--ckc-rule)", fontSize: 14, color: "var(--ckc-muted)" }}>
              Winner: <strong style={{ fontWeight: 500, color: "var(--ckc-ink)" }}>{results.winner.name}</strong>{results.winner.scriptTitle ? ` — ${results.winner.scriptTitle}` : ""}
            </p>
          ) : null}
        </Card>
      ) : null}

      <AIResults ai={entry.ai} />

      <Link to="/challenge?tab=mine" className="ckc-card ckc-card-pad">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="ckc-title ckc-h3">My Competitions</p>
            <p style={{ marginTop: 4, fontSize: 14, color: "var(--ckc-muted)" }}>
              Every challenge you've entered, and what you won.
            </p>
          </div>
          <ExternalLink className="h-4 w-4 shrink-0" style={{ color: "var(--ckc-muted)" }} aria-hidden="true" />
        </div>
      </Link>
    </div>
  );

  const renderEvent = () => (
    <div className="ckc-stack">
      {competition.theme && (competition.theme.title || competition.theme.brief || (competition.theme.allowedGenres || []).length > 0 || competition.theme.writingPrompt) && (
        <Card>
          <h2 className="ckc-title ckc-h3">Theme & Genre</h2>
          {competition.theme.title && <h3 className="ckc-title mt-4" style={{ fontSize: 18 }}>{competition.theme.title}</h3>}
          {competition.theme.brief && <p className="ckc-prose mt-2" style={{ whiteSpace: 'pre-wrap' }}>{competition.theme.brief}</p>}
          {(competition.theme.allowedGenres || []).length > 0 && (
            <div className="mt-4">
              <h4 className="ckc-title" style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--ckc-muted)' }}>Allowed Genres</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {competition.theme.allowedGenres.map(g => <span key={g} className="ckc-chip">{g}</span>)}
              </div>
            </div>
          )}
          {competition.theme.writingPrompt && (
            <div className="mt-4">
              <h4 className="ckc-title" style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--ckc-muted)' }}>Writing Prompt</h4>
              <p className="ckc-prose mt-2" style={{ whiteSpace: 'pre-wrap', fontStyle: 'italic', borderLeft: '3px solid var(--ckc-rule)', paddingLeft: '12px' }}>
                {competition.theme.writingPrompt}
              </p>
            </div>
          )}
        </Card>
      )}
      <Card>
        <h2 className="ckc-title ckc-h3">Rules</h2>
        <ol className="ckc-prose mt-4 list-decimal space-y-2 pl-5">
          {(competition.rules || []).map((rule, i) => <li key={i}>{rule}</li>)}
        </ol>
      </Card>
      <Card>
        <h2 className="ckc-title ckc-h3">Judging criteria</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {JUDGING_CRITERIA.map((c) => (
            <span key={c} className="ckc-chip">{c}</span>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="ckc-title ckc-h3">Eligibility & format</h2>
        <p className="ckc-prose mt-3">{competition.eligibility || "Open to all writers."}</p>
        <p className="ckc-prose mt-2">{competition.format}</p>
      </Card>
      <Card>
        <h2 className="ckc-title ckc-h3">Timeline</h2>
        <div className="mt-4"><PhaseTimeline steps={timeline} serverNow={serverNow} /></div>
      </Card>
    </div>
  );

  const renderPrizes = () => (
    <div className="ckc-grid">
      {[
        { title: "Winner", items: competition.prizes?.winner || [] },
        { title: "Runner-Up", items: competition.prizes?.runnerUp || [] },
        ...(competition.prizes?.secondRunnerUp?.length ? [{ title: "Second Runner-Up", items: competition.prizes.secondRunnerUp }] : []),
        { title: "Special Awards", items: (competition.prizes?.special || []).map((s) => (s.description ? `${s.title} — ${s.description}` : s.title)) },
      ].map((group) => (
        <Card key={group.title}>
          <h3 className="ckc-title ckc-h3">{group.title}</h3>
          <ul className="mt-4 space-y-2">
            {/* Rank reads by weight, not by a hue per prize — none of these is the thing that is
                live, so the bullet is decorative and stays out of the way. */}
            {group.items.length ? group.items.map((item, i) => (
              <li key={i} className="flex gap-2" style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ckc-body)" }}>
                <span style={{ color: "var(--ckc-muted)" }} aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            )) : <li style={{ fontSize: 14, color: "var(--ckc-muted)" }}>To be announced.</li>}
          </ul>
        </Card>
      ))}
    </div>
  );

  const renderCommunity = () => (
    <div className="ckc-stack">
      <Card>
        <h2 className="ckc-title ckc-h3">Community</h2>
        <p className="ckc-prose mt-2" style={{ fontSize: 14 }}>Talk to the other writers taking part.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(competition.communityLinks || []).length ? competition.communityLinks.map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noreferrer noopener" className="ckc-btn ckc-btn-quiet">
              {link.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )) : <p style={{ fontSize: 14, color: "var(--ckc-muted)" }}>Community links will appear here soon.</p>}
        </div>
      </Card>

      <ReferralDrive
        competitionId={competition._id}
        competitionName={competition.name}
        referrals={referrals}
        referralCode={referralCode}
        historyState={dashboard.referrals}
        onLoadMore={dashboard.loadMoreReferrals}
        onRetry={dashboard.retryReferrals}
      />

      <Card>
        <h2 className="ckc-title ckc-h3">Who else is writing</h2>
        <div className="mt-5">
          <CompetitionParticipants state={dashboard.participants} pendingId={dashboard.followPending} followError={dashboard.followError} onToggleFollow={dashboard.toggleFollow} onLoadMore={dashboard.loadMoreParticipants} onRetry={dashboard.retryParticipants} />
        </div>
      </Card>
    </div>
  );

  const renderResources = () => (
    <div className="ckc-stack">
      {WRITING_RESOURCES.map((resource) => (
        <Card key={resource.title}>
          <h3 className="ckc-title ckc-h3">{resource.title}</h3>
          <p className="ckc-prose mt-2" style={{ fontSize: 14 }}>{resource.body}</p>
        </Card>
      ))}
      {(competition.resources || []).length ? (
        <Card>
          <h3 className="ckc-title ckc-h3">More from Ckript</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {competition.resources.map((resource, i) => (
              <a key={i} href={resource.url} target="_blank" rel="noreferrer noopener" className="ckc-btn ckc-btn-quiet">
                {resource.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );

  const renderStudio = () => {
    if (hasSubmitted) {
      return (
        <div className="ckc-stack">
          {renderSubmittedCard()}
          <Card>
            <h2 className="ckc-title ckc-h3">Your submission</h2>
            {/* A count is a figure, so it is set like one: the numeral leads in the display serif with
                tabular figures and the label reads beneath it. `dt` still precedes `dd` in the DOM
                because a description list is only valid that way — column-reverse does the flipping. */}
            <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
              {[
                ["Words", entry.snapshot?.wordCount],
                ["Pages", entry.snapshot?.pageCount],
                ["Scenes", entry.snapshot?.sceneCount],
                ["Characters", entry.snapshot?.charCount],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="ckc-meta mt-1.5">{label}</dt>
                  <dd
                    style={{
                      fontFamily: "var(--ckc-display)",
                      fontSize: "2rem",
                      lineHeight: 1.05,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--ckc-ink)",
                    }}
                  >
                    {value ?? 0}
                  </dd>
                </div>
              ))}
            </dl>
            {entry.snapshot?.title ? (
              <p style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--ckc-rule)", fontSize: 14, color: "var(--ckc-muted)" }}>
                Title: <strong style={{ fontWeight: 500, color: "var(--ckc-ink)" }}>{entry.snapshot.title}</strong>
              </p>
            ) : null}
          </Card>
        </div>
      );
    }

    if (!isLive) {
      return (
        <Card className="text-center">
          {/* Decorative, never read — the one place the faint tone belongs. */}
          <Lock className="mx-auto h-10 w-10" style={{ color: "var(--ckc-faint)" }} aria-hidden="true" />
          <p className="ckc-lede" style={{ margin: "18px auto 0" }}>{STUDIO_LOCKED_MESSAGE}</p>
          {competition.dates?.startsAt && phase !== "judging" && phase !== "results" ? (
            <p className="ckc-meta" style={{ marginTop: 14 }}>
              Opens in <CountdownTimer target={competition.dates.startsAt} serverNow={serverNow} size="sm" />
            </p>
          ) : null}
        </Card>
      );
    }

    return (
      <Card>
        <h2 className="ckc-title ckc-h3">Script Studio</h2>
        <p className="ckc-prose mt-2" style={{ fontSize: 14 }}>
          Write in the Ckript editor. Your work saves automatically — submit when you're ready.
        </p>
        <div className="mt-5">{renderOpenEditorButton()}</div>
      </Card>
    );
  };

  const content = {
    home: renderHome, event: renderEvent, prizes: renderPrizes,
    community: renderCommunity, resources: renderResources, studio: renderStudio,
  }[section]();

  return (
    <div className="ckc" style={{ minHeight: "100vh", paddingBottom: 96 }}>
      <div style={{ margin: "0 auto", maxWidth: 1120, padding: "48px 24px 0" }}>
        <header className="ckc-masthead">
          <p className="ckc-meta">{competition.name}</p>
          <h1 className="ckc-title ckc-h1">Welcome, {user?.name || "writer"}</h1>

          {/* One status line: where the competition stands, where the writer stands, and the ID they
              quote when something goes wrong. Only the genuinely running phase earns the accent. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {currentStep ? (
              <span className={`ckc-chip ${isLive ? "ckc-chip-live" : ""}`}>
                {isLive ? <span className="ckc-dot" aria-hidden="true" /> : null}
                {currentStep.label}
              </span>
            ) : null}
            <Pill tone="success">Registered</Pill>
            {hasSubmitted ? <Pill tone="brand">Submitted</Pill> : null}
            <span className="ckc-meta">Event ID</span>
            <span style={{ fontFamily: "var(--ckc-mono)", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", color: "var(--ckc-ink)" }}>
              {entry.eventId}
            </span>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(entry.eventId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{ color: copied ? "var(--ckc-accent-text)" : "var(--ckc-muted)" }}
              aria-label="Copy Event ID"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* The clock leads. A 48-hour challenge IS its clock, and it has to answer from whichever
            section you are standing in — so it sits above the nav rather than three cards into Home. */}
        {phase === "announced" || phase === "registration_open" || phase === "registration_closed" ? (
          <Card style={{ marginTop: 34, padding: "28px 32px" }}>
            <CountdownTimer target={competition.dates?.startsAt} serverNow={serverNow} label="Competition starts in" onExpire={dashboard.refresh} />
            <p className="ckc-prose" style={{ marginTop: 18, fontSize: 14 }}>
              The theme is revealed the moment the clock hits zero. Then you have 48 hours.
            </p>
          </Card>
        ) : null}

        {isLive ? (
          <Card className="ckc-live" style={{ marginTop: 34, padding: "28px 32px" }}>
            <CountdownTimer target={competition.dates?.endsAt} serverNow={serverNow} label="Time remaining" onExpire={dashboard.refresh} />
          </Card>
        ) : null}

        <nav className="ckc-tabs" style={{ marginTop: 36 }} aria-label="Dashboard sections">
          {SECTIONS.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              aria-current={section === key ? "page" : undefined}
              className="ckc-tab inline-flex items-center gap-2"
            >
              {icon} {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0" style={{ marginTop: 36 }}>
          {content}
        </div>
      </div>
    </div>
  );
};

export default CompetitionDashboard;
