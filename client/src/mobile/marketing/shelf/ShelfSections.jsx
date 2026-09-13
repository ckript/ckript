import { Link } from "react-router-dom";
import CountdownTimer from "../../../components/competition/CountdownTimer";
import { COMPANY, COPYRIGHT_LINE } from "../../../constants/company";
import { countdownFor } from "../../../pages/landing/_shared/useChallenge";
import { LOGO_FOOTER_SRC } from "../../../pages/landing/_shared/theme";
import { FOOTER_CHIPS, MARQUEE_PHRASES, STEPS } from "./shelfContent";

/*
 * ShelfSections — the page itself, one exported component per band.
 *
 * They are grouped in one module rather than scattered across a dozen files
 * because each is a handful of elements with no state and no logic: splitting
 * them further would be more imports than code. Anything that DOES hold state
 * or reach for a hook stays in ShelfLanding, which is the orchestrator.
 *
 * None of these owns copy that the desktop page also shows. Tools, formats,
 * problem rows, partners and the footer destinations come in as props from the
 * shared `pages/landing/sections/*` data, so the marketing text has exactly one
 * home and the phone cannot drift from the desktop page it mirrors.
 */

const Diamond = () => <span className="ckm-landing__diamond" aria-hidden="true" />;

const Glyph = ({ name, className = "ckm-landing__chevron" }) => (
  <span className={`${className} material-symbols-outlined`} aria-hidden="true">{name}</span>
);

/* --- Hero ---------------------------------------------------------------
   The one image that changes with the audience, and the page's primary call
   repeated here for the thumb that has not scrolled yet. */
export function ShelfHero({ art, kicker, ctaLabel, onCta, ctaTo, onAbout }) {
  return (
    <section className="ckm-landing__hero" aria-labelledby="ckm-landing-title">
      <img className="ckm-landing__hero-art" src={art} alt="" width="1920" height="1100" fetchPriority="high" />
      <span className="ckm-landing__hero-shade" aria-hidden="true" />
      <div className="ckm-landing__hero-copy">
        <p className="ckm-landing__hero-kicker"><Diamond />{kicker}</p>
        <h1 id="ckm-landing-title">
          The Journey from<br />Page to Screen<i aria-hidden="true" />
        </h1>
        <p className="ckm-landing__hero-lead">
          Ckript brings powerful writing tools and a modern marketplace together, helping writers
          create exceptional scripts and producers discover the next great story worth producing.
        </p>
        <div className="ckm-landing__hero-actions">
          {ctaTo
            ? <Link className="ckm-landing__cta ckm-landing__cta--grow" to={ctaTo}>{ctaLabel}</Link>
            : <button type="button" className="ckm-landing__cta ckm-landing__cta--grow" onClick={onCta}>{ctaLabel}</button>}
          <button type="button" className="ckm-landing__cta ckm-landing__cta--quiet" onClick={onAbout}>
            Meet the Platform
          </button>
        </div>
      </div>
    </section>
  );
}

/* --- Marquee ------------------------------------------------------------
   The phrases are rendered twice so the 40s loop has no seam; the second copy
   is aria-hidden because it is the same sentence said again. */
export function ShelfMarquee() {
  return (
    <div className="ckm-landing__marquee" aria-label="Ckript principles">
      <div className="ckm-landing__marquee-track">
        {[0, 1].map((copy) => (
          <div className="ckm-landing__marquee-run" key={copy} aria-hidden={copy === 1 || undefined}>
            {MARQUEE_PHRASES.map((phrase) => (
              <span className="ckm-landing__marquee-phrase" key={phrase}>{phrase}<Diamond /></span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- How it works -------------------------------------------------------- */
export function ShelfSteps() {
  return (
    <section className="ckm-landing__section" aria-labelledby="ckm-landing-steps">
      <div className="ckm-landing__head">
        <span className="ckm-landing__eyebrow">How it works</span>
        <h2 className="ckm-landing__title" id="ckm-landing-steps">Find it. Watch it. Own it.</h2>
      </div>
      <div className="ckm-landing__shelf">
        {STEPS.map((step) => (
          <article className="ckm-landing__step" key={step.num}>
            <div className="ckm-landing__step-media">
              <img src={step.art} alt="" width="1200" height="800" loading="lazy" decoding="async" />
              <span className="ckm-landing__step-num">{step.num}</span>
            </div>
            <div className="ckm-landing__step-body">
              <strong>{step.title}</strong>
              <span>{step.desc}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* --- The seven tools ----------------------------------------------------
   A grouped list that opens a sheet, rather than the accordion this screen
   used to be: at 390pt an expanded panel pushes the next six rows off the
   fold, and the reader loses their place in the list they were scanning. */
export function ShelfTools({ features, onOpen }) {
  return (
    <section className="ckm-landing__section" aria-labelledby="ckm-landing-tools">
      <div className="ckm-landing__head">
        <span className="ckm-landing__eyebrow">What you get</span>
        <h2 className="ckm-landing__title" id="ckm-landing-tools">
          Built for writers. <em>Loved by producers.</em>
        </h2>
        <p className="ckm-landing__lead">
          Seven tools that turn your script from a file on your laptop into a film people actually
          want to make.
        </p>
      </div>
      <div className="ckm-landing__list">
        {features.map((feature, index) => (
          <button
            type="button"
            className="ckm-landing__row"
            key={feature.num}
            onClick={() => onOpen(index)}
          >
            <span className="ckm-landing__row-num">{feature.num}</span>
            <span className="ckm-landing__row-text">
              <span className="ckm-landing__row-title">{feature.tab}</span>
              <span className="ckm-landing__row-tag">{feature.tag}</span>
            </span>
            <Glyph name="chevron_right" />
          </button>
        ))}
      </div>
    </section>
  );
}

/* --- Formats ------------------------------------------------------------- */
export function ShelfFormats({ formats, onBrowse }) {
  return (
    <section className="ckm-landing__section" aria-labelledby="ckm-landing-formats">
      <div className="ckm-landing__head">
        <span className="ckm-landing__eyebrow">Built for every story</span>
        <h2 className="ckm-landing__title" id="ckm-landing-formats">
          One platform. <em>Every format.</em>
        </h2>
        <p className="ckm-landing__lead">
          From features to anime, writers showcase their work across every screen and every genre.
        </p>
      </div>
      <div className="ckm-landing__shelf">
        {formats.map((format) => (
          <button type="button" className="ckm-landing__format" key={format.title} onClick={onBrowse}>
            <img src={format.image} alt={format.alt || ""} width="750" height="1100" loading="lazy" decoding="async" />
            <span className="ckm-landing__format-copy">
              <strong>{format.title}</strong>
              <span>{format.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* --- Text-to-trailer ----------------------------------------------------- */
export function ShelfTrailer({ art, onWatch, startTo, onStart }) {
  return (
    <section className="ckm-landing__trailer" aria-labelledby="ckm-landing-trailer">
      <div className="ckm-landing__trailer-media">
        <img src={art} alt="" width="1920" height="1100" loading="lazy" decoding="async" />
        <span className="ckm-landing__trailer-badge">Text-to-Trailer AI</span>
        <span className="ckm-landing__trailer-time">0:30</span>
      </div>
      <div className="ckm-landing__trailer-body">
        <h2 id="ckm-landing-trailer">
          Your script, rendered<br /><em>in 30 seconds.</em>
        </h2>
        <p>
          Upload your pages and watch Ckript blend stock footage with AI-generated visuals into a
          cinematic teaser. It is the fastest way to make a producer feel your story.
        </p>
        <button type="button" className="ckm-landing__cta" onClick={onWatch}>
          <Glyph name="play_arrow" className="" />Watch a sample trailer
        </button>
        {startTo
          ? <Link className="ckm-landing__ghost" to={startTo}>Start with your script<Glyph name="arrow_forward" className="" /></Link>
          : <button type="button" className="ckm-landing__ghost" onClick={onStart}>Start with your script<Glyph name="arrow_forward" className="" /></button>}
      </div>
    </section>
  );
}

/* --- The problem, one side at a time ------------------------------------
   The desktop page shows both cards side by side. A phone cannot, so the
   audience switch picks one and the row underneath offers the other — which
   is also the cheapest way to discover the switch exists. */
export function ShelfProblem({ card, flipLabel, onFlip, ctaLabel, ctaTo, onCta }) {
  if (!card) return null;
  return (
    <section className="ckm-landing__problem" aria-labelledby="ckm-landing-problem">
      <span className="ckm-landing__eyebrow">The problem</span>
      <h2 className="ckm-landing__title" id="ckm-landing-problem">
        The industry is <span style={{ color: "var(--ckl-accent)" }}>broken</span> on both sides of the page.
      </h2>
      <article className="ckm-landing__problem-card" key={card.kind}>
        <span className="ckm-landing__eyebrow">{card.kicker}</span>
        <h3>{card.title[0]} <em>{card.title[1]}</em></h3>
        <ul className="ckm-landing__problem-rows">
          {card.rows.map((row) => (
            <li key={row}><Glyph name="arrow_forward" className="" />{row}</li>
          ))}
        </ul>
        {ctaTo
          ? <Link className="ckm-landing__cta ckm-landing__cta--accent" to={ctaTo}>{ctaLabel}<Glyph name="arrow_forward" className="" /></Link>
          : <button type="button" className="ckm-landing__cta ckm-landing__cta--accent" onClick={onCta}>{ctaLabel}<Glyph name="arrow_forward" className="" /></button>}
      </article>
      <button type="button" className="ckm-landing__flip" onClick={onFlip}>
        <span>{flipLabel}</span>
        <Glyph name="swap_horiz" className="" />
      </button>
    </section>
  );
}

/* --- Plans teaser -------------------------------------------------------
   The one place the two audiences are quoted different prices, which is the
   reason the switch at the top of the page exists at all. */
export function ShelfPlans({ title, sub, onOpen }) {
  return (
    <button type="button" className="ckm-landing__plans" onClick={onOpen}>
      <span className="ckm-landing__plans-top">
        <span className="ckm-landing__plans-kicker">Plans</span>
        <Glyph name="chevron_right" />
      </span>
      <strong>{title}</strong>
      <span className="ckm-landing__plans-sub">{sub}</span>
    </button>
  );
}

/* --- Partners ------------------------------------------------------------ */
export function ShelfPartners({ partnerKeys, partners, onOpen }) {
  return (
    <section className="ckm-landing__partners" aria-labelledby="ckm-landing-partners">
      <div className="ckm-landing__partners-rule">
        <Diamond />
        <span className="ckm-landing__eyebrow">In Partnership With</span>
        <Diamond />
      </div>
      <h2 id="ckm-landing-partners">The company <em>we keep.</em></h2>
      <p className="ckm-landing__partners-lead">
        Partnering with industry leaders to bring exceptional stories to the screen.
      </p>
      <div className="ckm-landing__partner-grid">
        {partnerKeys.map((key) => {
          const item = partners[key];
          return (
            <button
              type="button"
              className="ckm-landing__partner"
              key={key}
              onClick={() => onOpen(key)}
              aria-label={`Learn more about ${item.name}`}
            >
              {/* `accent` and `cardLogo` are the partner data's own — the two
                  wordmarks are different shapes and the shared file already
                  records how each one should be sized on a plate. */}
              <span className="ckm-landing__partner-plate">
                <img
                  src={item.logo}
                  alt=""
                  width="400"
                  height="180"
                  loading="lazy"
                  decoding="async"
                  style={item.cardLogo}
                />
                <i aria-hidden="true" style={{ background: item.accent }} />
              </span>
              <span className="ckm-landing__partner-meta">
                <span>{item.kicker}</span>
                <strong>{item.name}</strong>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* --- Final call ---------------------------------------------------------- */
export function ShelfFinal({ writerLabel, writerTo, onWriter, browseLabel, browseTo, onBrowse }) {
  return (
    <section className="ckm-landing__final" aria-labelledby="ckm-landing-final">
      <span className="ckm-landing__final-mark" aria-hidden="true" />
      <h2 id="ckm-landing-final">Your story deserves<br /><em>an audience.</em></h2>
      <p>
        Upload your script, shape a trailer, and put your work in front of the producers, directors,
        and investors who can make it real.
      </p>
      {writerTo
        ? <Link className="ckm-landing__cta" to={writerTo}>{writerLabel}</Link>
        : <button type="button" className="ckm-landing__cta" onClick={onWriter}>{writerLabel}</button>}
      {browseTo
        ? <Link className="ckm-landing__ghost" to={browseTo}>{browseLabel}</Link>
        : <button type="button" className="ckm-landing__ghost" onClick={onBrowse}>{browseLabel}</button>}
    </section>
  );
}

/* --- Live challenge -----------------------------------------------------
   Unchanged in behaviour from the page this replaces: it appears only while a
   competition is open or running, and a signed-out visitor is sent to sign in
   with the registration URL as the return path. */
export function ShelfChallenge({ challenge, user, onRegisterSignedOut }) {
  const { phase, competition, serverNow } = challenge || {};
  if (!competition || (phase !== "registration_open" && phase !== "live")) return null;

  const { at, label } = countdownFor(phase, competition.dates);
  if (!at) return null;

  const registering = phase === "registration_open";
  const to = registering
    ? `/challenge/register?c=${encodeURIComponent(competition.slug)}`
    : `/challenge/c/${encodeURIComponent(competition.slug)}`;

  return (
    <section className="ckm-landing__challenge" aria-labelledby="ckm-landing-challenge">
      <span className="ckm-landing__eyebrow">Live challenge</span>
      <h2 id="ckm-landing-challenge">{competition.name}</h2>
      <p className="ckm-landing__challenge-label">{label}</p>
      <div className="ckm-landing__challenge-clock" aria-hidden="true">
        <CountdownTimer target={at} serverNow={serverNow} size="sm" />
      </div>
      <p className="ckm-sr-only">
        {`${label} ${new Date(at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}.`}
      </p>
      {registering && !user ? (
        <button type="button" className="ckm-landing__cta ckm-landing__cta--ink" onClick={() => onRegisterSignedOut(to)}>
          Register
        </button>
      ) : (
        <Link className="ckm-landing__cta ckm-landing__cta--ink" to={to}>
          {registering ? "Register" : "See the theme"}
        </Link>
      )}
    </section>
  );
}

/* --- Footer -------------------------------------------------------------
   The chips replace the desktop page's three columns, which do not survive a
   390pt screen. Every destination survives, and so does the statutory block —
   it is a legal disclosure, not decoration. */
export function ShelfFooter({ onAction, resolveTo }) {
  return (
    <footer className="ckm-landing__footer">
      <img src={LOGO_FOOTER_SRC} alt="Ckript" width="3600" height="1028" loading="lazy" decoding="async" />
      <p className="ckm-landing__footer-tagline">From the page to the screen.</p>

      <div className="ckm-landing__chips">
        {FOOTER_CHIPS.map((chip) => {
          const to = chip.to || (chip.action ? resolveTo(chip.action) : "");
          return to
            ? <Link className="ckm-landing__chip" key={chip.label} to={to}>{chip.label}</Link>
            : <button type="button" className="ckm-landing__chip" key={chip.label} onClick={() => onAction(chip.action)}>{chip.label}</button>;
        })}
      </div>

      <p className="ckm-landing__copyright">{COPYRIGHT_LINE} · Made for storytellers.</p>

      <div className="ckm-landing__legal">
        <p>{COMPANY.description}</p>
        <p className="ckm-landing__legal-head">CORPORATE INFORMATION</p>
        <p><strong>Legal Entity:</strong> {COMPANY.legalName}</p>
        <p><strong>CIN:</strong> {COMPANY.cin}</p>
        <p><strong>Registered Office:</strong> {COMPANY.registeredOffice}</p>
        <p><strong>Contact:</strong> <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></p>
      </div>
    </footer>
  );
}
