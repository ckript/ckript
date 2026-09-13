import { useCallback, useContext, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { useAuthModal } from "../../../context/AuthModalContext";
import { FEATURES } from "../../../pages/landing/sections/Features/features.data";
import { FORMATS } from "../../../pages/landing/sections/Formats/formats.data";
import { PROBLEM_CARDS } from "../../../pages/landing/sections/Problem/problem.data";
import { PARTNERS, PARTNER_KEYS } from "../../../pages/landing/sections/Partners/partners.data";
import { LOGO_SRC, ROUTES, TRAILER_VIDEO_SRC } from "../../../pages/landing/_shared/theme";
import useChallenge from "../../../pages/landing/_shared/useChallenge";
import Button from "../../components/buttons/Button";
import IconButton from "../../components/buttons/IconButton";
import Dialog from "../../components/overlays/Dialog";
import Sheet from "../../components/overlays/Sheet";
import SegmentedControl from "../../components/tabs/SegmentedControl";
import MobileShell from "../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../shell/mobileShellModes";
import {
  landingAccountPath,
  landingActionLabels,
  landingDiscoveryPath,
  landingWriterPath,
} from "../landingModel";
import {
  AUDIENCE,
  AUDIENCE_TABS,
  SHELF_AUDIENCE,
  resolveAudience,
} from "./shelfContent";
import {
  ShelfChallenge,
  ShelfFinal,
  ShelfFooter,
  ShelfFormats,
  ShelfHero,
  ShelfMarquee,
  ShelfPartners,
  ShelfPlans,
  ShelfProblem,
  ShelfSteps,
  ShelfTools,
  ShelfTrailer,
} from "./ShelfSections";
import "./ShelfLanding.css";

/*
 * ShelfLanding — the mobile landing page, redesigned as "The Shelf".
 *
 * Direction 1c of the landing prototype, which is the one the pricing
 * prototype builds on ("The Shelf landing with the pricing flow it opens").
 * The page browses like a store: a light ground, rounded white cards, snap
 * shelves, and a thumb-reachable action bar.
 *
 * WHAT THE AUDIENCE SWITCH IS FOR. A segmented control in the nav re-aims the
 * hero, the problem card and the plans teaser, so a producer never reads writer
 * pricing first. It is the organising idea of the design, not a filter: the
 * desktop page shows both problem cards side by side and a 390pt screen cannot,
 * so one is chosen and the other is one tap away underneath it.
 *
 * WHAT THIS ORCHESTRATES, AND WHY THE SECTIONS DO NOT. Everything with state or
 * a hook lives here — the audience, the four overlays, the challenge fetch, the
 * auth-aware destinations. `ShelfSections` is stateless markup fed by props, so
 * "what does this page DO?" is answerable from one file.
 *
 * NOTHING THE PREVIOUS PAGE DID WAS DROPPED. The live-challenge countdown, the
 * real trailer video, the partner dialog with its switcher, the whole menu, the
 * footer's destinations and the statutory block are all still here; several
 * changed shape to survive the new layout, and the notes below say which.
 */

export default function ShelfLanding({ user: userProp = undefined }) {
  const auth = useContext(AuthContext);
  const user = userProp === undefined ? auth?.user : userProp;
  const challenge = useChallenge();
  const {
    openAuthModal,
    openAboutModal,
    openPricingModal,
    openProducerOnboarding,
    openWriterOnboarding,
  } = useAuthModal();

  const [audience, setAudience] = useState(AUDIENCE.WRITER);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolIndex, setToolIndex] = useState(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [activePartner, setActivePartner] = useState(null);
  const videoRef = useRef(null);

  const view = SHELF_AUDIENCE[resolveAudience(audience)];
  const partner = activePartner ? PARTNERS[activePartner] : null;
  const tool = toolIndex == null ? null : FEATURES[toolIndex];

  /* The signed-in labels are role-aware and shared with the desktop page —
     a writer is offered "Create a project", a producer "See featured scripts".
     Restating them here would be a second copy that drifts. */
  const labels = landingActionLabels(user);
  const accountPath = landingAccountPath(user);
  const writerPath = landingWriterPath(user);
  const discoveryPath = landingDiscoveryPath(user);

  const problemCard = useMemo(
    () => PROBLEM_CARDS.find((card) => card.kind === view.problemKind) || PROBLEM_CARDS[0],
    [view.problemKind],
  );

  /*
   * The one call to action, repeated in the hero and the docked bar.
   *
   * Signed out it opens plans, because the prototype makes choosing a plan the
   * way in and the sign-up flow the step after it. Signed in it is simply the
   * way back to the app.
   */
  const openPlans = useCallback(() => openPricingModal(), [openPricingModal]);
  const primaryLabel = user ? "Dashboard" : "Get started";

  const closeTrailer = useCallback(() => {
    const video = videoRef.current;
    video?.pause?.();
    if (video) video.currentTime = 0;
    setTrailerOpen(false);
  }, []);

  /* The menu closes first so the sheet it opens is not stacked on a dialog. */
  const closeMenuThen = (action) => () => {
    setMenuOpen(false);
    window.setTimeout(action, 300);
  };

  const runAction = useCallback((action) => {
    if (action === "pricing") openPlans();
    else if (action === "about") openAboutModal();
    else if (action === "writer") openWriterOnboarding();
    else openProducerOnboarding();
  }, [openPlans, openAboutModal, openWriterOnboarding, openProducerOnboarding]);

  /* A signed-in visitor gets a real destination; a signed-out one gets the
     onboarding flow for the side of the product they asked about. */
  const resolveTo = useCallback((action) => {
    if (!user) return "";
    if (action === "writer") return writerPath;
    if (action === "producer") return discoveryPath;
    return "";
  }, [user, writerPath, discoveryPath]);

  const appBar = (
    <header className="ckm-landing__bar">
      <div className="ckm-landing__bar-row">
        <Link className="ckm-landing__brand" to="/" aria-label="Ckript home">
          <img src={LOGO_SRC} alt="Ckript" width="3600" height="1028" />
        </Link>
        <div className="ckm-landing__bar-actions">
          {user ? (
            <Link className="ckm-landing__bar-link" to={accountPath}>{labels.account}</Link>
          ) : (
            <button type="button" className="ckm-landing__bar-link" onClick={() => openAuthModal()}>
              Sign in
            </button>
          )}
          <IconButton icon="menu" label="Open menu" size="sm" onClick={() => setMenuOpen(true)} />
        </div>
      </div>

      {/* The switch that re-aims the page. A pair of toggle buttons rather than
          a radio group: it changes what is shown, not a value being submitted. */}
      <div className="ckm-landing__audience" role="group" aria-label="Who are you?">
        {AUDIENCE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={audience === tab.value}
            onClick={() => setAudience(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );

  const overlays = (
    <>
      {/* The docked call. Absolute inside the shell so it rides above the one
          scroll surface without opening a second one. */}
      <div className="ckm-landing__dock">
        {user ? (
          <Link className="ckm-landing__cta ckm-landing__cta--grow ckm-landing__cta--pill ckm-landing__cta--ink" to={accountPath}>
            {primaryLabel}
          </Link>
        ) : (
          <button
            type="button"
            className="ckm-landing__cta ckm-landing__cta--grow ckm-landing__cta--pill ckm-landing__cta--ink"
            onClick={openPlans}
          >
            {primaryLabel}
          </button>
        )}
        <Link className="ckm-landing__dock-search" to={ROUTES.search || "/search"} aria-label="Search scripts">
          <span className="material-symbols-outlined" aria-hidden="true">search</span>
        </Link>
      </div>

      {/* One tool, in a sheet. The accordion this replaces pushed the six rows
          below it off the fold every time it opened. */}
      <Sheet
        open={Boolean(tool)}
        onClose={() => setToolIndex(null)}
        title={tool?.title || "Tool"}
        className="ckm-landing__sheet"
        footer={<Button fullWidth onClick={() => setToolIndex(null)}>Got it</Button>}
      >
        {tool ? (
          <>
            <div className="ckm-landing__sheet-top">
              <span className="ckm-landing__sheet-num">{tool.num}</span>
              <span className="ckm-landing__sheet-tag">{tool.tag}</span>
            </div>
            <h3>{tool.title}</h3>
            <p className="ckm-landing__sheet-italic">{tool.italic}</p>
            <p className="ckm-landing__sheet-desc">{tool.desc}</p>
            <ul className="ckm-landing__sheet-bullets">
              {tool.bullets.map((bullet) => (
                <li key={bullet}><span className="ckm-landing__diamond" aria-hidden="true" />{bullet}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Sheet>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Explore Ckript" bodyClassName="ckm-landing__menu">
        <nav aria-label="Marketing menu" className="ckm-landing__menu-links">
          {user ? (
            <Link to={writerPath} onClick={() => setMenuOpen(false)}>Scripts</Link>
          ) : (
            <button type="button" onClick={closeMenuThen(openWriterOnboarding)}>Scripts</button>
          )}
          <Link to={ROUTES.challenges} onClick={() => setMenuOpen(false)}>Challenge</Link>
          {user ? (
            <Link to={discoveryPath} onClick={() => setMenuOpen(false)}>For producers</Link>
          ) : (
            <button type="button" onClick={closeMenuThen(openProducerOnboarding)}>For producers</button>
          )}
          <button type="button" onClick={closeMenuThen(openPlans)}>Pricing</button>
          <Link to={ROUTES.contact} onClick={() => setMenuOpen(false)}>Contact</Link>
          {user ? (
            <Link className="ckm-landing__menu-account" to={accountPath} onClick={() => setMenuOpen(false)}>{labels.account}</Link>
          ) : (
            <button className="ckm-landing__menu-account" type="button" onClick={closeMenuThen(() => openAuthModal())}>
              Sign in
            </button>
          )}
        </nav>
      </Dialog>

      <Dialog
        open={trailerOpen}
        onClose={closeTrailer}
        title="Ckript sample trailer"
        bodyClassName="ckm-landing__trailer-dialog"
      >
        <video
          ref={videoRef}
          src={TRAILER_VIDEO_SRC}
          controls
          autoPlay
          playsInline
          controlsList="nodownload"
          preload="metadata"
          aria-label="Ckript sample trailer"
        />
        <p>A short example of how a screenplay can become a visual pitch.</p>
      </Dialog>

      <Dialog
        open={Boolean(partner)}
        onClose={() => setActivePartner(null)}
        title={partner?.name || "Production partner"}
        description="Ckript partnership"
        bodyClassName="ckm-landing__partner-dialog"
      >
        {partner ? (
          <>
            <SegmentedControl
              label="Production partner"
              name="landing-partner"
              value={activePartner}
              onChange={setActivePartner}
              options={PARTNER_KEYS.map((key) => ({ value: key, label: PARTNERS[key].name }))}
            />
            <div className="ckm-landing__partner-plate">
              <img src={partner.logo} alt={partner.name} width="400" height="180" />
            </div>
            <p className="ckm-landing__eyebrow">{partner.tag}</p>
            <p>{partner.desc}</p>
            <blockquote>{partner.pull}</blockquote>
            <Button href={partner.href} target="_blank" rel="noopener noreferrer" trailingIcon="open_in_new">
              Visit {partner.site}
            </Button>
          </>
        ) : null}
      </Dialog>
    </>
  );

  return (
    <MobileShell
      mode={MOBILE_SHELL_MODE.PUBLIC}
      screenId="landing"
      className="ckm-landing"
      scrollClassName="ckm-landing__scroll"
      appBar={appBar}
      overlays={overlays}
    >
      <article className="ckm-landing__page">
        <ShelfHero
          art={view.heroArt}
          kicker={view.heroKicker}
          ctaLabel={primaryLabel}
          ctaTo={user ? accountPath : ""}
          onCta={openPlans}
          onAbout={() => openAboutModal()}
        />

        <ShelfMarquee />

        <ShelfChallenge
          challenge={challenge}
          user={user}
          onRegisterSignedOut={(to) => openAuthModal({ redirect: to })}
        />

        <ShelfSteps />

        <ShelfTools features={FEATURES} onOpen={setToolIndex} />

        <ShelfFormats
          formats={FORMATS}
          onBrowse={user ? undefined : openProducerOnboarding}
        />

        <ShelfTrailer
          art="/landing/ai/trailer-cinema.webp"
          onWatch={() => setTrailerOpen(true)}
          startTo={user ? writerPath : ""}
          onStart={openWriterOnboarding}
        />

        <ShelfProblem
          card={problemCard}
          flipLabel={view.flip}
          onFlip={() => setAudience(audience === AUDIENCE.WRITER ? AUDIENCE.INDUSTRY : AUDIENCE.WRITER)}
          ctaLabel={user
            ? (problemCard.kind === "writer" ? labels.writer : labels.discovery)
            : problemCard.cta}
          ctaTo={user ? (problemCard.kind === "writer" ? writerPath : discoveryPath) : ""}
          onCta={() => runAction(problemCard.kind === "writer" ? "writer" : "producer")}
        />

        <ShelfPlans title={view.teaseTitle} sub={view.teaseSub} onOpen={openPlans} />

        <ShelfPartners
          partnerKeys={PARTNER_KEYS}
          partners={PARTNERS}
          onOpen={setActivePartner}
        />

        <ShelfFinal
          writerLabel={user ? labels.writer : "Start with your script"}
          writerTo={user ? writerPath : ""}
          onWriter={openWriterOnboarding}
          browseLabel={user ? labels.discovery : "Browse scripts"}
          browseTo={user ? discoveryPath : ""}
          onBrowse={openProducerOnboarding}
        />

        <ShelfFooter onAction={runAction} resolveTo={resolveTo} />
      </article>
    </MobileShell>
  );
}
