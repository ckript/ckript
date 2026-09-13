import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Trophy, Award, Sparkles, ArrowLeft, ExternalLink, X, User } from "lucide-react";
import { Section, Card, Stat, Avatar } from "../../components/competition/ui";
import { rewardLabel, yearSuffix } from "../../components/competition/labels";
import useDynamicSeo from "../../components/competition/useDynamicSeo";
import externalUrl from "../../utils/externalUrl";
import { HALL_OF_FAME_STATUS, hallOfFameProfilePath } from "./hallOfFame";
import { useHallOfFameDetail } from "./useHallOfFame";
import "../challenge/challenge.css";

/**
 * One competition's permanent record.
 *
 * A finished competition is a document, so it is set like one: a masthead, then ruled sections in
 * the order the record is read — who won, what was written, who judged, what it added up to.
 *
 * Winners link to their PROFILE, never to their script: competition entries stay private drafts and
 * are not published by winning. The Featured Scripts section only ever shows scripts a writer has
 * separately chosen to publish, so it is empty (and hidden) until that happens.
 */

// `userId` first: buildPublicResults shapes laureates with userId (the shared WinnerCard reads the
// same field), and only the featured-script writers below carry `_id`. Reading `_id` alone sent every
// winner without a username to /share/profile/undefined — a dead link on the one page that exists to
// point at the people.
const WinnerBlock = ({ person, label, icon, prominent = false }) => {
  if (!person) return null;
  return (
    <Card>
      {/* The award leads, on its own rule, the way the shared WinnerCard sets it — this is a roll of
          honour, so what they won is read before who won it. Only the top placing takes the accent;
          the rest stay in the slug-line voice so the coral keeps meaning something. */}
      <p
        className="ckc-meta flex items-center gap-1.5"
        style={{
          color: prominent ? "var(--ckc-accent-text)" : undefined,
          paddingBottom: 12,
          borderBottom: "1px solid var(--ckc-rule)",
        }}
      >
        {icon}
        {person.specialTitle || label}
      </p>
      {/* The competition's own artwork for this badge, when the admin uploaded one. */}
      {person.badgeImage ? (
        <img src={person.badgeImage} alt="" style={{ width: 64, height: 64, objectFit: "contain", marginTop: 14 }} />
      ) : null}

      <div className={`mt-4 flex items-start gap-4 ${prominent ? "sm:gap-5" : ""}`}>
        <Avatar src={person.profileImage} name={person.name} size={prominent ? 72 : 52} />
        <div className="min-w-0 flex-1">
          <h3
            className={`ckc-title ${prominent ? "ckc-h2" : ""}`}
            style={prominent ? undefined : { fontSize: "1.1875rem" }}
          >
            {person.name}
          </h3>
          {person.scriptTitle ? (
            <p style={{ marginTop: 6, fontFamily: "var(--ckc-display)", fontStyle: "italic", fontSize: "1.0625rem", color: "var(--ckc-ink)" }}>
              {person.scriptTitle}
            </p>
          ) : null}
          {person.logline ? (
            <>
              <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "var(--ckc-muted)" }}>
                {person.logline}
              </p>
              {/* Same note the shared WinnerCard carries: a logline is either the writer's pitch or
                  the AI's reading of their script, and the reader gets to tell which. */}
              {person.loglineByAi ? (
                <p className="ckc-meta" style={{ marginTop: 7 }}>AI-generated logline</p>
              ) : null}
            </>
          ) : null}

          {person.rewards?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {person.rewards
                .map((type) => rewardLabel(type, { specialTitle: person.specialTitle }))
                .filter(Boolean).map((label_, i) => (
                <span key={i} className="ckc-chip">
                  {label_}
                </span>
              ))}
            </div>
          ) : null}

          <Link to={hallOfFameProfilePath(person)} className="ckc-link mt-4 inline-flex items-center gap-1.5" style={{ fontSize: 14 }}>
            View writer profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Card>
  );
};

const HallOfFameDetail = () => {
  const { slug } = useParams();
  const [selectedJudge, setSelectedJudge] = useState(null);
  const [selectedSponsor, setSelectedSponsor] = useState(null);
  const record = useHallOfFameDetail({ slug });
  const data = record.data;
  const loading = record.status === HALL_OF_FAME_STATUS.LOADING;
  const notFound = record.status === HALL_OF_FAME_STATUS.NOT_FOUND;

  // Per-page metadata so search engines can discover competition history over time. Set at runtime
  // because the slug is dynamic — the build-time prerender only covers the static /hall-of-fame index.
  const competitionName = data?.competition?.name;
  useDynamicSeo({
    title: competitionName ? `${competitionName} | Hall of Fame | Ckript` : "",
    description: competitionName
      ? `Meet the winners and featured writers from the ${competitionName} hosted by Ckript.`
      : "",
  });

  if (loading) {
    return (
      <div className="ckc" style={{ minHeight: "100vh" }}>
        <p className="ckc-meta mx-auto max-w-5xl px-4 py-20 text-center">Loading…</p>
      </div>
    );
  }

  if (record.status === HALL_OF_FAME_STATUS.FAILED) {
    return (
      <div className="ckc" style={{ minHeight: "100vh" }}>
        <div className="mx-auto max-w-3xl px-4 py-20">
          <Card className="text-center">
            <h1 className="ckc-title ckc-h2">The record could not be loaded</h1>
            <p style={{ marginTop: 10, lineHeight: 1.6, color: "var(--ckc-muted)" }}>{record.failure?.message}</p>
            <button type="button" className="ckc-btn mt-6" onClick={record.retry}>Try again</button>
          </Card>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="ckc" style={{ minHeight: "100vh" }}>
        <div className="mx-auto max-w-3xl px-4 py-20">
          <Card className="text-center">
            <Trophy className="mx-auto h-10 w-10" style={{ color: "var(--ckc-faint)" }} aria-hidden="true" />
            <h1 className="ckc-title ckc-h2" style={{ marginTop: 16 }}>Competition not found</h1>
            <p style={{ marginTop: 10, lineHeight: 1.6, color: "var(--ckc-muted)" }}>
              This competition either doesn't exist or its results haven't been announced yet.
            </p>
            <Link to="/hall-of-fame" className="ckc-btn mt-6">
              Back to the Hall of Fame
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  const { competition, results, stats, featuredScripts } = data;
  // Everyone the record honours, in placing order, for the induction line below the roll.
  const honourees = [results.winner, results.runnerUp, results.secondRunnerUp, ...(results.special || [])].filter(Boolean);
  // "Mira Sen, Dev Kapoor and Ana Ruiz" — one sentence, not a list.
  const listNames = (people) => {
    const names = people.map((p) => p.name).filter(Boolean);
    return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  };
  const dateRange = [competition.dates?.startsAt, competition.dates?.endsAt]
    .filter(Boolean)
    .map((d) => new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }))
    .join(" – ");

  return (
    <div className="ckc" style={{ minHeight: "100vh" }}>
      {competition.bannerUrl ? (
        <img src={competition.bannerUrl} alt="" className="h-48 w-full object-cover sm:h-64" />
      ) : (
        /* No banner, no decoration standing in for one — just the quiet band that closes the top of
           the page, so the record starts with its own masthead. */
        <div className="w-full" style={{ height: 10, background: "var(--ckc-cream)", borderBottom: "1px solid var(--ckc-rule)" }} />
      )}

      <div className="mx-auto max-w-5xl px-4 pb-16">
        <Link to="/hall-of-fame" className="ckc-meta mt-6 inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Hall of Fame
        </Link>

        <header className="ckc-masthead" style={{ marginTop: 18 }}>
          <h1 className="ckc-title ckc-h1">
            {competition.name}{" "}
            <span style={{ color: "var(--ckc-muted)" }}>{yearSuffix(competition.name, competition.year)}</span>
          </h1>
          {/* The theme is the one line of the record that stays coral: it is what the event was. */}
          {competition.theme?.title ? (
            <p style={{ marginTop: -6, fontFamily: "var(--ckc-display)", fontStyle: "italic", fontSize: "1.25rem", color: "var(--ckc-accent-text)" }}>
              {competition.theme.title}
            </p>
          ) : null}
          <p className="ckc-meta" style={{ letterSpacing: "0.06em" }}>{dateRange}</p>
          {competition.prizePool ? (
            <span className="ckc-chip" style={{ alignSelf: "flex-start" }}>{competition.prizePool}</span>
          ) : null}
        </header>

        {results.winner || results.runnerUp || results.secondRunnerUp ? (
          <>
            <hr className="ckc-rule" style={{ marginTop: 40 }} />
            {/* This is the Results section of a finished challenge — the landing page hands a
                concluded competition here — so it says so, in the slug-line voice above the roll. */}
            <Section eyebrow="Results" title="Winners">
              <div className="ckc-stack">
                <WinnerBlock person={results.winner} label="Winner" icon={<Trophy className="h-4 w-4" style={{ color: "var(--ckc-accent)" }} aria-hidden="true" />} prominent />
                <WinnerBlock person={results.runnerUp} label="Runner-Up" icon={<Award className="h-4 w-4" style={{ color: "var(--ckc-faint)" }} aria-hidden="true" />} />
                <WinnerBlock person={results.secondRunnerUp} label="Second Runner-Up" icon={<Award className="h-4 w-4" style={{ color: "var(--ckc-faint)" }} aria-hidden="true" />} />
              </div>
            </Section>
          </>
        ) : null}

        {results.special?.length ? (
          <>
            <hr className="ckc-rule" />
            <Section eyebrow={results.winner || results.runnerUp || results.secondRunnerUp ? undefined : "Results"} title="Special awards">
              <div className="grid gap-5 sm:grid-cols-2">
                {results.special.map((person, i) => (
                  <WinnerBlock key={i} person={person} label="Special award" icon={<Sparkles className="h-4 w-4" style={{ color: "var(--ckc-faint)" }} aria-hidden="true" />} />
                ))}
              </div>
            </Section>
          </>
        ) : null}

        {honourees.length ? (
          <>
            <hr className="ckc-rule" />
            {/* The record is also an induction. Winning a challenge puts a writer in the Hall of Fame
                for good, and the page that announces the result is where that should be said. */}
            <Section eyebrow="Hall of Fame" title="A permanent place">
              <Card>
                <p className="ckc-prose">
                  {listNames(honourees)} now {honourees.length === 1 ? "holds" : "hold"} a permanent place in the
                  Ckript Hall of Fame — the roll of every writer who has won a challenge here. This page is
                  their record; the Hall lists them beside every winner before and after.
                </p>
                <Link to="/hall-of-fame" className="ckc-link mt-4 inline-block" style={{ fontSize: 14 }}>
                  Browse the Hall of Fame
                </Link>
              </Card>
            </Section>
          </>
        ) : null}

        {featuredScripts?.length ? (
          <>
            <hr className="ckc-rule" />
            <Section title="Featured scripts">
              <div className="ckc-grid">
                {featuredScripts.map((script) => (
                  /* Not the shared Card here: it always carries its own padding, and this one holds
                     a full-bleed cover above the text. */
                  <div key={script._id} className="ckc-card overflow-hidden">
                    {script.coverImage ? (
                      <img src={script.coverImage} alt="" className="h-36 w-full object-cover" />
                    ) : (
                      <div className="h-36 w-full" style={{ background: "var(--ckc-cream)", borderBottom: "1px solid var(--ckc-rule)" }} />
                    )}
                    <div className="ckc-card-pad">
                      <h3 className="ckc-title ckc-h3">{script.title}</h3>
                      {script.genre ? <p className="ckc-meta" style={{ marginTop: 6 }}>{script.genre}</p> : null}
                      <p style={{ marginTop: 10, fontSize: 14, color: "var(--ckc-muted)" }}>{script.writer.name}</p>
                      <div className="mt-4 flex gap-5">
                        <Link to={`/share/project/${script._id}`} className="ckc-link" style={{ fontSize: 14 }}>
                          Read script
                        </Link>
                        {hallOfFameProfilePath(script.writer) ? (
                          <Link to={hallOfFameProfilePath(script.writer)} style={{ fontSize: 14, fontWeight: 500, color: "var(--ckc-muted)" }}>
                            View writer
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {record.featuredFailure ? <p className="ckc-meta mt-4">{record.featuredFailure.message}</p> : null}
              {data.featuredScriptsPageInfo?.hasMore ? (
                <button type="button" className="ckc-btn mt-6" disabled={record.featuredPending} onClick={record.loadMoreFeatured}>
                  {record.featuredPending ? "Loading…" : "Load more featured scripts"}
                </button>
              ) : null}
            </Section>
          </>
        ) : null}

        {competition.judges?.length ? (
          <>
            <hr className="ckc-rule" />
            <Section title="Judges">
              <div className="ckc-grid">
                {competition.judges.map((judge, i) => (
                  <Card 
                    key={i}
                    onClick={() => setSelectedJudge(judge)}
                    className="cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-1"
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar src={judge.photoUrl} name={judge.name} size={48} />
                      <div className="min-w-0">
                        <p className="ckc-title ckc-h3">{judge.name}</p>
                        {judge.title ? (
                          <p className="ckc-meta" style={{ marginTop: 5 }}>
                            {judge.title}
                            {judge.company ? (
                              <>
                                {" @ "}
                                {judge.companyLink ? (
                                  <a href={externalUrl(judge.companyLink)} target="_blank" rel="noreferrer noopener" className="hover:underline hover:text-[#111] transition-colors text-inherit">
                                    {judge.company}
                                  </a>
                                ) : (
                                  judge.company
                                )}
                              </>
                            ) : ""}
                          </p>
                        ) : judge.company ? (
                          <p className="ckc-meta" style={{ marginTop: 5 }}>
                            {judge.companyLink ? (
                              <a href={externalUrl(judge.companyLink)} target="_blank" rel="noreferrer noopener" className="hover:underline hover:text-[#111] transition-colors text-inherit">
                                {judge.company}
                              </a>
                            ) : (
                              judge.company
                            )}
                          </p>
                        ) : null}
                        {judge.bio ? (
                          <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "var(--ckc-muted)" }}>{judge.bio}</p>
                        ) : null}
                        {judge.companyBio ? (
                          <div className="mt-4 text-sm" style={{ color: "var(--ckc-muted)" }}>
                            <p className="font-semibold text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--ckc-ink)" }}>About {judge.company}</p>
                            <p className="line-clamp-3">{judge.companyBio}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </Section>
          </>
        ) : null}

        {(competition.sponsors?.filter(s => s.tier !== 'Community')?.length > 0) ? (
          <>
            <hr className="ckc-rule" />
            <Section title="Sponsors">
              <div className="flex flex-wrap items-center gap-5">
                {competition.sponsors.filter(s => s.tier !== 'Community').map((sponsor, i) => {
                  const mark = (
                    <span className="flex items-center gap-3">
                      {sponsor.logoUrl
                        ? <img src={sponsor.logoUrl} alt={sponsor.name} className="h-8 object-contain" />
                        : <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ckc-ink)" }}>{sponsor.name}</span>}
                      {sponsor.tier ? <span className="ckc-chip">{sponsor.tier === 'Headline' ? 'Headline Partner' : sponsor.tier === 'Media' ? 'Media Partner' : `${sponsor.tier} Sponsor`}</span> : null}
                    </span>
                  );
                  
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedSponsor(sponsor)}
                      className="ckc-card transition hover:opacity-80 focus:outline-none cursor-pointer"
                      style={{ padding: "12px 16px" }}
                    >
                      {mark}
                    </button>
                  );
                })}
              </div>
            </Section>
          </>
        ) : null}

        {(competition.sponsors?.filter(s => s.tier === 'Community')?.length > 0) ? (
          <>
            <hr className="ckc-rule" />
            <Section title="Community Partners">
              <div className="flex flex-wrap items-center gap-5">
                {competition.sponsors.filter(s => s.tier === 'Community').map((sponsor, i) => {
                  const mark = (
                    <span className="flex items-center gap-3">
                      {sponsor.logoUrl
                        ? <img src={sponsor.logoUrl} alt={sponsor.name} className="h-8 object-contain" />
                        : <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ckc-ink)" }}>{sponsor.name}</span>}
                    </span>
                  );
                  
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedSponsor(sponsor)}
                      className="ckc-card transition hover:opacity-80 focus:outline-none cursor-pointer"
                      style={{ padding: "12px 16px" }}
                    >
                      {mark}
                    </button>
                  );
                })}
              </div>
            </Section>
          </>
        ) : null}

        <hr className="ckc-rule" />
        <Section title="By the numbers">
          <Card>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="Participants" value={stats.totalParticipants} />
              <Stat label="Countries" value={stats.countriesRepresented} />
              <Stat label="Scripts submitted" value={stats.scriptsSubmitted} />
              <Stat label="Completion rate" value={`${stats.completionRate}%`} />
            </dl>
          </Card>
        </Section>
      </div>

      {/* Judge Detail Modal */}
      {selectedJudge && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedJudge(null)}
          style={{ margin: 0 }}
        >
          <div 
            className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative p-6">
              <button 
                onClick={() => setSelectedJudge(null)}
                className="absolute top-4 right-4 p-2 text-gray-500 hover:text-black transition-colors rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-4 mb-6">
                {selectedJudge.photoUrl ? (
                  <img src={selectedJudge.photoUrl} alt="" className="h-20 w-20 rounded-full object-cover shadow-sm" />
                ) : (
                  <div className="h-20 w-20 rounded-full flex items-center justify-center text-gray-400" style={{ background: "var(--ckc-cream)" }}>
                    <User className="w-8 h-8" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold" style={{ color: "var(--ckc-ink)" }}>{selectedJudge.name}</h3>
                  <p className="font-medium mt-1" style={{ color: "var(--ckc-accent-text)" }}>{selectedJudge.title}</p>
                  
                  {selectedJudge.company && (
                    <div className="text-sm mt-1" style={{ color: "var(--ckc-muted)" }}>
                      {selectedJudge.companyLink ? (
                        <a href={externalUrl(selectedJudge.companyLink)} target="_blank" rel="noreferrer noopener" className="hover:underline flex items-center gap-1 transition-colors hover:text-[#111]">
                          {selectedJudge.company} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span>{selectedJudge.company}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {selectedJudge.bio && (
                <div className="mb-6">
                  <h4 className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--ckc-ink)" }}>About {selectedJudge.name}</h4>
                  <p className="whitespace-pre-wrap leading-relaxed text-sm" style={{ color: "var(--ckc-body)" }}>{selectedJudge.bio}</p>
                </div>
              )}

              {selectedJudge.companyBio && (
                <div className="mb-6 p-4 rounded-lg" style={{ background: "var(--ckc-cream)" }}>
                  <h4 className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--ckc-ink)" }}>About {selectedJudge.company}</h4>
                  <p className="whitespace-pre-wrap leading-relaxed text-sm" style={{ color: "var(--ckc-body)" }}>{selectedJudge.companyBio}</p>
                </div>
              )}

              {(selectedJudge.linkedin || selectedJudge.imdb) && (
                <div className="flex gap-4 mt-6 pt-4" style={{ borderTop: "1px solid var(--ckc-rule)" }}>
                  {selectedJudge.linkedin && (
                    <a href={externalUrl(selectedJudge.linkedin)} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-[#0A66C2] hover:underline">
                      LinkedIn
                    </a>
                  )}
                  {selectedJudge.imdb && (
                    <a href={externalUrl(selectedJudge.imdb)} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-[#E4B714] hover:underline">
                      IMDb
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sponsor Detail Modal */}
      {selectedSponsor && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedSponsor(null)}
          style={{ margin: 0 }}
        >
          <div 
            className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative p-6">
              <button 
                onClick={() => setSelectedSponsor(null)}
                className="absolute top-4 right-4 p-2 text-gray-500 hover:text-black transition-colors rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center text-center mb-6 pt-4">
                {selectedSponsor.logoUrl ? (
                  <img src={selectedSponsor.logoUrl} alt={selectedSponsor.name} className="h-24 object-contain mb-4" />
                ) : (
                  <div className="h-20 w-20 rounded-full flex items-center justify-center text-gray-400 mb-4" style={{ background: "var(--ckc-cream)" }}>
                    <span className="font-bold text-xl">{selectedSponsor.name.charAt(0)}</span>
                  </div>
                )}
                
                <h3 className="text-xl font-bold" style={{ color: "var(--ckc-ink)" }}>{selectedSponsor.name}</h3>
                {selectedSponsor.tier && (
                  <span className="ckc-chip mt-2">{selectedSponsor.tier}</span>
                )}
              </div>

              {selectedSponsor.description && (
                <div className="mb-6">
                  <p className="whitespace-pre-wrap leading-relaxed text-sm text-center" style={{ color: "var(--ckc-body)" }}>{selectedSponsor.description}</p>
                </div>
              )}

              {selectedSponsor.url && (
                <div className="flex justify-center mt-6 pt-4" style={{ borderTop: "1px solid var(--ckc-rule)" }}>
                  <a href={externalUrl(selectedSponsor.url)} target="_blank" rel="noreferrer noopener" className="ckc-btn flex items-center gap-2">
                    Visit Website <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HallOfFameDetail;
