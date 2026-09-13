import { Link } from "react-router-dom";
import { INDUSTRY_SUB_ROLES, MAX_STORY_TAGS } from "../authModel";
import {
  FORMAT_OPTIONS,
  GENDER_OPTIONS,
  GENRE_OPTIONS,
  GUILDS,
  LINK_FIELDS,
  NATIONALITY_OPTIONS,
  REPRESENTATION_OPTIONS,
  TAG_OPTIONS,
} from "../authOptions";
import { PRIVACY_ROUTE, TERMS_ROUTE } from "../useMobileSignUp";
import {
  AuthBlock,
  AuthCard,
  AuthFieldError,
  AuthFieldRow,
  AuthMarkRow,
  AuthNote,
  AuthPasswordRow,
  AuthPasswordStrength,
  AuthPickRow,
  AuthStatus,
  AuthSwitchRow,
  AuthTextArea,
  AuthTickRow,
} from "./AuthControls";

/*
 * SignUpPanels — one panel per step id, for every role.
 *
 * Extracted from the screen because §6 asks route screens to stay
 * orchestration-focused, and because this is the part that is genuinely
 * per-role: the orchestrator handles the URL, the bar, the rail, the footer and
 * the OTP detour identically for all three, and only what goes inside the panel
 * differs.
 *
 * Panels are keyed by step id, so a role's step list (authModel.stepsForRole)
 * is the only thing that decides which appear and in what order. Adding a role
 * means a row in the catalogue and a step list — not a branch in here.
 *
 * Every panel is a plain fragment of grouped rows. It owns no submit button and
 * no navigation: the docked footer does that, once, for every step, so the
 * primary action cannot end up in two places or move between steps.
 *
 * `openPicker` is how a row asks for the wheel sheet. The sheet itself is owned
 * by the screen, because it is an overlay on the shell and only the screen can
 * put one there — see SignUpMobile.
 */

const asOptions = (values) => values.map((value) => ({ value, label: value }));

/* The picked list, said back in the caption rather than left for the reader to
   count: with forty rows on screen, "which did I choose?" is otherwise a scroll
   rather than a glance. */
function pickedSummary(picked, max) {
  if (!picked.length) return max ? `Pick up to ${max}.` : "Pick at least one.";
  const left = max ? max - picked.length : 0;
  return max ? `${picked.join(" · ")} — ${left} left` : picked.join(" · ");
}

export default function SignUpPanels({ flow, openPicker }) {
  const {
    current, role, account, setAccount, profile, setProfile, setLink, setDemographic, errors,
  } = flow;

  const setAccountField = (name) => (event) => {
    const { value } = event.target;
    setAccount((prev) => ({ ...prev, [name]: value }));
  };
  const setProfileField = (name) => (event) => {
    const { value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  /* Functional update, not `[...list, value]`: two taps inside one render pass
     both read the same closed-over array, and the second silently discards the
     first. On a list of forty-eight rows that is not a corner case. */
  const toggleIn = (setList, value, max) => {
    setList((current) => {
      if (current.includes(value)) return current.filter((entry) => entry !== value);
      if (max && current.length >= max) return current;
      return [...current, value];
    });
  };

  switch (current.id) {
    case "name":
      return (
        <>
          <AuthCard invalid={Boolean(errors.name)}>
            <AuthFieldRow
              label="Name"
              placeholder="Maya Okonkwo"
              autoComplete="name"
              autoFocus
              value={account.name}
              error={errors.name}
              onChange={setAccountField("name")}
            />
          </AuthCard>
          <AuthFieldError>{errors.name}</AuthFieldError>
          {!errors.name && <AuthNote>However you want to be credited.</AuthNote>}
        </>
      );

    case "contact":
      return (
        <>
          <AuthCard invalid={Boolean(errors.email || errors.phone || errors.referralCode)}>
            <AuthFieldRow
              label="Email"
              placeholder="you@studio.com"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={account.email}
              error={errors.email}
              onChange={setAccountField("email")}
            />
            <AuthFieldRow
              label="Phone"
              placeholder="+44 7700 900 000"
              inputMode="tel"
              autoComplete="tel"
              value={account.phone}
              error={errors.phone}
              onChange={setAccountField("phone")}
            />
            <AuthFieldRow
              label="Referral"
              placeholder="Optional"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={account.referralCode}
              error={errors.referralCode}
              onChange={setAccountField("referralCode")}
            />
          </AuthCard>

          <AuthFieldError>{errors.email || errors.phone || errors.referralCode}</AuthFieldError>
          <AuthStatus state={flow.referralStatus?.state}>{flow.referralStatus?.message}</AuthStatus>
          <AuthNote>Your verification code goes to that email. Your number is never shown on your profile.</AuthNote>
        </>
      );

    case "password":
      return (
        <>
          <AuthCard invalid={Boolean(errors.password)}>
            <AuthPasswordRow
              label="Password"
              hideLabel
              placeholder="••••••••"
              autoComplete="new-password"
              value={account.password}
              error={errors.password}
              onChange={setAccountField("password")}
            />
          </AuthCard>

          <AuthPasswordStrength value={account.password} />
          <AuthFieldError>{errors.password}</AuthFieldError>

          {/* Stated before the button, not after: the next tap creates a real
              account and sends an email, and that is worth knowing first. */}
          <AuthNote>Tapping below creates your account and emails you a 6-digit code.</AuthNote>
        </>
      );

    case "username":
      return (
        <>
          <AuthCard invalid={Boolean(errors.username)}>
            <AuthFieldRow
              label="Username"
              hideLabel
              ariaLabel="Username"
              prefix="ckript.com/"
              placeholder="mayaok"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={profile.username}
              error={errors.username}
              onChange={(event) => setProfile((prev) => ({
                ...prev,
                username: event.target.value.toLowerCase().replace(/\s+/g, ""),
              }))}
              trailing={(
                <span
                  className={["ckm-auth__ok", "material-symbols-outlined",
                    flow.usernameStatus?.state === "available" ? "is-on" : ""].filter(Boolean).join(" ")}
                  aria-hidden="true"
                >
                  check_circle
                </span>
              )}
            />
          </AuthCard>

          <AuthFieldError>{errors.username}</AuthFieldError>
          <AuthStatus state={flow.usernameStatus?.state}>{flow.usernameStatus?.message}</AuthStatus>
        </>
      );

    case "about":
      return (
        <>
          <AuthBlock label="Short bio">
            <AuthTextArea
              label="Short bio"
              rows={4}
              maxLength={600}
              placeholder="Lagos-born, London-based. I write crime with a sense of humour."
              value={profile.bio}
              onChange={setProfileField("bio")}
            />
          </AuthBlock>

          {/*
            * Gender and nationality are required by the server, so they are
            * asked for plainly and explained rather than slipped in. Both lists
            * include "Prefer not to say", and this is the one part of the form
            * the draft never writes to storage.
            */}
          <AuthBlock>
            <AuthCard invalid={Boolean(errors.gender || errors.nationality)}>
              <AuthPickRow
                label="Representation"
                value={REPRESENTATION_OPTIONS.find((o) => o.value === profile.representationStatus)?.label || ""}
                onOpen={() => openPicker({
                  title: "Representation",
                  options: REPRESENTATION_OPTIONS,
                  value: profile.representationStatus,
                  onPick: (value) => setProfile((prev) => ({ ...prev, representationStatus: value })),
                })}
              />
              <AuthPickRow
                label="Gender"
                value={profile.diversity.gender}
                error={errors.gender}
                onOpen={() => openPicker({
                  title: "Gender",
                  options: asOptions(GENDER_OPTIONS),
                  value: profile.diversity.gender,
                  onPick: (value) => setDemographic("gender", value),
                })}
              />
              <AuthPickRow
                label="Nationality"
                value={profile.diversity.nationality}
                error={errors.nationality}
                onOpen={() => openPicker({
                  title: "Nationality",
                  options: asOptions(NATIONALITY_OPTIONS),
                  value: profile.diversity.nationality,
                  onPick: (value) => setDemographic("nationality", value),
                })}
              />
            </AuthCard>
            <AuthFieldError>{errors.gender || errors.nationality}</AuthFieldError>
            <AuthNote>
              Nationality is used for competition eligibility and the diversity reporting you can opt
              out of below.
            </AuthNote>
          </AuthBlock>

          <AuthBlock>
            <AuthCard>
              <AuthSwitchRow
                label="Findable by producers"
                checked={profile.demographicPrivacy === "searchable"}
                onChange={(next) => setProfile((prev) => ({
                  ...prev,
                  demographicPrivacy: next ? "searchable" : "private",
                }))}
              />
            </AuthCard>
            <AuthNote>
              Off, and your answers are stored but never used to surface you in a search.
            </AuthNote>
          </AuthBlock>
        </>
      );

    case "guilds":
      return (
        <AuthBlock label="Guilds — optional">
          <AuthCard>
            {GUILDS.map((guild) => (
              <AuthMarkRow
                key={guild.key}
                label={`${guild.title} member`}
                detail={guild.detail}
                checked={Boolean(profile[guild.key])}
                onToggle={(next) => setProfile((prev) => ({ ...prev, [guild.key]: next }))}
              />
            ))}
          </AuthCard>
          <AuthNote>
            Our team verifies before the badge appears — you can add proof later from your profile.
          </AuthNote>
        </AuthBlock>
      );

    case "links":
      return (
        <AuthBlock label="Links — all optional">
          <AuthCard invalid={Boolean(errors.links)}>
            {LINK_FIELDS.map((field) => (
              <AuthFieldRow
                key={field.name}
                label={field.label}
                placeholder={field.placeholder || "Optional"}
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={profile.links[field.name]}
                onChange={(event) => setLink(field.name, event.target.value)}
              />
            ))}
          </AuthCard>
          <AuthFieldError>{errors.links}</AuthFieldError>
        </AuthBlock>
      );

    case "identity":
      return (
        <>
          <AuthBlock>
            <AuthCard invalid={Boolean(errors.company)}>
              <AuthFieldRow
                label="Company"
                placeholder="Vance & Co."
                autoComplete="organization"
                value={profile.company}
                error={errors.company}
                onChange={setProfileField("company")}
              />
              <AuthFieldRow
                label="Title"
                placeholder="Head of Development"
                autoComplete="organization-title"
                value={profile.jobTitle}
                onChange={setProfileField("jobTitle")}
              />
            </AuthCard>
            <AuthFieldError>{errors.company}</AuthFieldError>
          </AuthBlock>

          {role.key === "industry" && (
            <AuthBlock>
              <AuthCard invalid={Boolean(errors.subRole)}>
                <AuthPickRow
                  label="Your role"
                  value={profile.subRole}
                  error={errors.subRole}
                  onOpen={() => openPicker({
                    title: "Your role",
                    options: asOptions(INDUSTRY_SUB_ROLES),
                    value: profile.subRole,
                    onPick: (value) => setProfile((prev) => ({ ...prev, subRole: value })),
                  })}
                />
              </AuthCard>
              <AuthFieldError>{errors.subRole}</AuthFieldError>
            </AuthBlock>
          )}

          <AuthBlock label="Short bio">
            <AuthTextArea
              label="Short bio"
              rows={3}
              maxLength={600}
              placeholder="We back first features with teeth."
              value={profile.bio}
              onChange={setProfileField("bio")}
            />
          </AuthBlock>

          <AuthBlock label="Links">
            <AuthCard invalid={Boolean(errors.links)}>
              <AuthFieldRow
                label="LinkedIn"
                placeholder="linkedin.com/in/…"
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={profile.links.linkedin}
                onChange={(event) => setLink("linkedin", event.target.value)}
              />
              <AuthFieldRow
                label="IMDb"
                placeholder="imdb.com/name/…"
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={profile.links.imdb}
                onChange={(event) => setLink("imdb", event.target.value)}
              />
            </AuthCard>
            <AuthFieldError>{errors.links}</AuthFieldError>
          </AuthBlock>
        </>
      );

    case "credits":
      return (
        <AuthBlock label="Notable credits">
          <AuthTextArea
            label="Notable credits"
            rows={6}
            maxLength={1200}
            placeholder={"Nightshift (2024)\nThe Long Grass (2021)"}
            value={profile.previousCredits}
            onChange={setProfileField("previousCredits")}
          />
          <AuthNote>Titles, roles and years. One per line is fine.</AuthNote>
        </AuthBlock>
      );

    case "tags":
      return (
        <>
          <AuthBlock label="Genres you write">
            <AuthCard invalid={Boolean(errors.genres)}>
              {GENRE_OPTIONS.map((genre) => (
                <AuthTickRow
                  key={genre}
                  label={genre}
                  selected={flow.genres.includes(genre)}
                  onToggle={() => toggleIn(flow.setGenres, genre)}
                />
              ))}
            </AuthCard>
            <AuthFieldError>{errors.genres}</AuthFieldError>
            <AuthNote>{pickedSummary(flow.genres)}</AuthNote>
          </AuthBlock>

          <AuthBlock label={`Story tags — up to ${MAX_STORY_TAGS}`}>
            <AuthCard invalid={Boolean(errors.tags)}>
              {TAG_OPTIONS.map((tag) => (
                <AuthTickRow
                  key={tag}
                  label={tag}
                  selected={flow.tags.includes(tag)}
                  disabled={flow.tags.length >= MAX_STORY_TAGS}
                  onToggle={() => flow.toggleTag(tag)}
                />
              ))}
            </AuthCard>
            <AuthFieldError>{errors.tags}</AuthFieldError>
            <AuthNote>{pickedSummary(flow.tags, MAX_STORY_TAGS)}</AuthNote>
          </AuthBlock>
        </>
      );

    case "discover":
      return (
        <>
          <AuthBlock label="Formats">
            <AuthCard>
              {FORMAT_OPTIONS.map((format) => (
                <AuthTickRow
                  key={format.value}
                  label={format.label}
                  selected={flow.formats.includes(format.value)}
                  onToggle={() => toggleIn(flow.setFormats, format.value)}
                />
              ))}
            </AuthCard>
          </AuthBlock>

          <AuthBlock label="Genres">
            <AuthCard>
              {GENRE_OPTIONS.map((genre) => (
                <AuthTickRow
                  key={genre}
                  label={genre}
                  selected={flow.genres.includes(genre)}
                  onToggle={() => toggleIn(flow.setGenres, genre)}
                />
              ))}
            </AuthCard>
            <AuthNote>Shapes what we surface first. You can change it any time.</AuthNote>
          </AuthBlock>
        </>
      );

    case "terms":
      return (
        <>
          <AuthCard invalid={Boolean(errors.agreeTerms || errors.agreePrivacy)}>
            <AuthMarkRow
              label="I accept the Terms"
              checked={flow.agreeTerms}
              error={errors.agreeTerms}
              onToggle={(next) => flow.setAgreeTerms(next)}
            />
            <AuthMarkRow
              label="I accept the Privacy Policy"
              checked={flow.agreePrivacy}
              error={errors.agreePrivacy}
              onToggle={(next) => flow.setAgreePrivacy(next)}
            />
          </AuthCard>

          <AuthFieldError>{errors.agreeTerms || errors.agreePrivacy}</AuthFieldError>

          <AuthNote>
            Read the{" "}
            <Link to={TERMS_ROUTE[role.key]} target="_blank" rel="noopener noreferrer">
              Terms &amp; Conditions
            </Link>{" "}
            and the{" "}
            <Link to={PRIVACY_ROUTE} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>.
          </AuthNote>
        </>
      );

    default:
      /* Not reachable through the step lists, and deliberately not a crash: an
         edited URL should never be able to blank the screen. */
      return (
        <AuthNote>That step doesn&apos;t exist. Use Back to return to the previous one.</AuthNote>
      );
  }
}
