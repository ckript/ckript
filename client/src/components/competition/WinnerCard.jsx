import { Link } from "react-router-dom";
import { Avatar } from "./ui";

/**
 * A person who won something — the unit the Hall of Fame is actually about.
 *
 * The archive lists competitions; the Hall of Fame lists WRITERS. Same data, opposite emphasis: the
 * writer's name and face lead, and the competition is the footnote that says when.
 *
 * Links to the writer's profile and nothing else. Competition entries stay private drafts, so there
 * is deliberately no path from here to a script — the server does not even return a scriptId.
 */

// Placing reads by WEIGHT, not by a different hue each time: the winner's rule is the accent, the
// others are quiet. A card per award colour would turn the roll of honour into a paint chart.
const AWARD_ACCENT = {
  winner: "var(--ckc-accent-text)",
  runner_up: "var(--ckc-faint)",
  second_runner_up: "var(--ckc-faint)",
  special: "var(--ckc-faint)",
};

const AWARD_LABEL = { winner: "Winner", runner_up: "Runner-Up", second_runner_up: "Second Runner-Up", special: "Special Award" };

const WinnerCard = ({ person, award, competitionName, year }) => {
  if (!person) return null;

  return (
    <Link to={`/share/profile/${person.userId}`} className="ckc-card ckc-card-pad">
      {/* The award is the first thing read, on its own rule — this is a roll of honour, so what
          they won leads and the person follows. */}
      <p
        className="ckc-meta"
        style={{ color: AWARD_ACCENT[award] || AWARD_ACCENT.special, paddingBottom: 12, borderBottom: "1px solid var(--ckc-rule)" }}
      >
        {person.specialTitle || AWARD_LABEL[award] || "Award"}
      </p>
      {/* The competition's own artwork for this badge, when the admin uploaded one. */}
      {person.badgeImage ? (
        <img src={person.badgeImage} alt="" style={{ width: 56, height: 56, objectFit: "contain", marginTop: 14 }} />
      ) : null}

      <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
        <Avatar src={person.profileImage} name={person.name} size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="ckc-title truncate" style={{ fontSize: "1.1875rem" }}>{person.name}</h3>
          {person.username ? (
            <p className="ckc-meta truncate" style={{ marginTop: 3 }}>@{person.username}</p>
          ) : null}
        </div>
      </div>

      {person.scriptTitle ? (
        <p style={{ marginTop: 18, fontFamily: "var(--ckc-display)", fontStyle: "italic", fontSize: "1.0625rem", color: "var(--ckc-ink)" }}>
          {person.scriptTitle}
        </p>
      ) : null}

      {person.logline ? (
        <>
          <p className="line-clamp-3" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "var(--ckc-muted)" }}>
            {person.logline}
          </p>
          {/* Provenance, not decoration. A logline here is either the writer's own pitch or the one
              the AI read off their script, and a roll of honour must not let those pass as the same
              thing. The slug-line voice keeps it a caption rather than a second claim. */}
          {person.loglineByAi ? (
            <p className="ckc-meta" style={{ marginTop: 7 }}>AI-generated logline</p>
          ) : null}
        </>
      ) : null}

      {/* Omitted when the card sits under a competition heading that already says this. */}
      {competitionName ? (
        <p className="ckc-meta" style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--ckc-rule)" }}>
          {competitionName}{year ? ` · ${year}` : ""}
        </p>
      ) : null}
    </Link>
  );
};

export default WinnerCard;
