import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../../../services/api";
import { AuthContext } from "../../../context/AuthContext";
import { clearDraft, isResumable, loadDraft, saveDraft } from "./authDraft";
import {
  accountStepNumber,
  isValidEmail,
  isValidHttpUrl,
  isValidPassword,
  isValidPhone,
  isValidUsername,
  MAX_STORY_TAGS,
  normalizeReferral,
  readRefusal,
  REFERRAL_STORAGE_KEY,
  refusalField,
  REFUSAL,
  resolveRole,
  stepsForRole,
} from "./authModel";

/*
 * useMobileSignUp — one stepper for all three sign-up flows (Phase 8, D59).
 *
 * The desktop equivalents are three files totalling ~3,600 lines that agree on
 * their first three steps, create the account at the same point, run the same
 * OTP leg, and then diverge only in which profile fields they collect and which
 * endpoint they post them to. This holds that shared spine once and treats the
 * divergence as data (see `authModel.stepsForRole` and `SAVE_POINTS` below).
 *
 * THREE THINGS THIS OWNS THAT A SIMPLER STEPPER WOULD NOT:
 *
 *   THE ACCOUNT IS CREATED IN THE MIDDLE, NOT AT THE END. Step 3 calls
 *   POST /auth/join for real. Everything after it is profile data on an account
 *   that already exists, which is why there is a "Finish later" from step 4 on
 *   and no way to lose an account by closing a tab. It also means the flow can
 *   be *re-entered* signed in, so the screen never assumes a signed-out viewer.
 *
 *   PROGRESSIVE SAVE. Each role's later steps write as they pass, not in one
 *   submit at the end. A phone that dies on step 7 keeps steps 4-6.
 *
 *   THE STEP LIVES IN THE URL. This hook does not own `step` — the screen reads
 *   it from the query and hands it in. That is what makes browser back mean
 *   "previous step" and a return from the mail app land where it left off, and
 *   it is why `goToStep` is a callback the screen supplies rather than state
 *   here.
 */

const WRITER_TERMS_VERSION = "writer-onboarding-v2026-03-24";
const INVESTOR_TERMS_VERSION = "investor-onboarding-v2026-03-24";
const PRIVACY_POLICY_VERSION = "registration-privacy-v2026-03-24";

export const TERMS_ROUTE = Object.freeze({
  writer: "/terms-conditions?tab=writer",
  producer: "/terms-conditions?tab=investor",
  industry: "/terms-conditions?tab=investor",
});
export const PRIVACY_ROUTE = "/registration-privacy-policy";

const EMPTY_ACCOUNT = Object.freeze({
  name: "",
  email: "",
  phone: "",
  password: "",
  referralCode: "",
});

const EMPTY_PROFILE = Object.freeze({
  username: "",
  bio: "",
  company: "",
  jobTitle: "",
  subRole: "",
  representationStatus: "unrepresented",
  wgaMember: false,
  sgaMember: false,
  previousCredits: "",
  links: Object.freeze({ portfolio: "", instagram: "", twitter: "", linkedin: "", imdb: "" }),
  /* Required by PUT /onboarding/writer-profile, and never written to the draft
     — special-category data, see authDraft.sanitise and authOptions. */
  diversity: Object.freeze({ gender: "", nationality: "" }),
  demographicPrivacy: "searchable",
});

const mergeProfile = (profile) => ({
  ...EMPTY_PROFILE,
  ...(profile || {}),
  links: { ...EMPTY_PROFILE.links, ...(profile?.links || {}) },
  // A draft never carries this back, so it always resets to empty on resume —
  // which is the intended behaviour, not a gap.
  diversity: { ...EMPTY_PROFILE.diversity, ...(profile?.diversity || {}) },
});

/*
 * Where each role's collected profile goes. Kept as a table rather than as
 * branches inside the submit handler so "what does a producer's identity step
 * write, and where?" is one lookup rather than a read of the whole file.
 *
 * The payload shapes are the ones the desktop modals already send; the server
 * contract is unchanged by D59 and this is deliberately not the place to
 * renegotiate it.
 */
const SAVE_POINTS = {
  writer: {
    username: null, // collected now, written with the rest of the profile below
    about: null,
    guilds: null,
    /*
     * One profile write, on leaving Links — the same point the desktop modal
     * writes at. It is deliberately not split across steps 4-7: the endpoint
     * takes the whole writerProfile object, so calling it per step would send
     * four progressively-less-empty copies of the same record and make the
     * server's "Gender and Nationality are required" check fire on the first.
     * Interruption before this point is covered by the draft, not by a write.
     */
    links: async ({ account, profile }) => {
      await api.put("/onboarding/writer-profile", {
        ...profile,
        username: profile.username.trim().toLowerCase(),
        phone: account.phone.trim(),
      });
      return {};
    },
    tags: null, // genres and tags are sent with /onboarding/complete below
    terms: async ({ genres, tags, updateSessionUser }) => {
      const { data } = await api.post("/onboarding/complete", {
        genres,
        tags,
        plan: "free",
        agreementAccepted: true,
        termsVersion: WRITER_TERMS_VERSION,
        privacyPolicyAccepted: true,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      });
      if (data?.user) updateSessionUser(data.user);
      return {};
    },
  },
  producer: {
    username: null,
    identity: async ({ profile }) => {
      await api.put("/users/update", {
        username: profile.username.trim().toLowerCase(),
        subRole: profile.subRole,
        jobTitle: profile.jobTitle.trim(),
        company: profile.company.trim(),
        bio: profile.bio.trim(),
        linkedInUrl: profile.links.linkedin,
        imdbUrl: profile.links.imdb,
        socialLinks: { instagram: profile.links.instagram, twitter: profile.links.twitter },
      });
      return {};
    },
    credits: async ({ profile }) => {
      await api.put("/users/update", { previousCredits: profile.previousCredits.trim() });
      return {};
    },
    discover: async ({ genres, formats }) => {
      await api.put("/users/update", { preferredGenres: genres, preferredFormats: formats });
      return {};
    },
    terms: async ({ updateSessionUser }) => {
      const { data } = await api.put("/users/update", {
        onboardingComplete: true,
        privacyPolicyAccepted: true,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: INVESTOR_TERMS_VERSION,
      });
      updateSessionUser(data);
      return {};
    },
  },
  industry: {
    username: null,
    identity: async ({ profile }) => {
      await api.put("/users/update", {
        username: profile.username.trim().toLowerCase(),
        subRole: profile.subRole,
        jobTitle: profile.jobTitle.trim(),
        company: profile.company.trim(),
        bio: profile.bio.trim(),
        linkedInUrl: profile.links.linkedin,
        imdbUrl: profile.links.imdb,
      });
      return {};
    },
    discover: async ({ genres, formats }) => {
      await api.put("/users/update", { preferredGenres: genres, preferredFormats: formats });
      return {};
    },
    terms: async ({ updateSessionUser }) => {
      const { data } = await api.put("/users/update", {
        onboardingComplete: true,
        privacyPolicyAccepted: true,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: INVESTOR_TERMS_VERSION,
      });
      updateSessionUser(data);
      return {};
    },
  },
};

/*
 * Whether a step may be left, and what to say if not. Returns a map of
 * field -> message; empty means "go ahead".
 *
 * Every rule here is a client mirror of a server rule (see authModel), so a
 * refusal the server would issue anyway costs a tap instead of a round trip on
 * a phone connection — but the server stays the authority and every submit
 * still reads its answer.
 */
function validateStep(stepId, state) {
  const { account, profile, genres, tags, agreeTerms, agreePrivacy, role, usernameStatus } = state;
  const errors = {};

  if (stepId === "name") {
    if (!account.name.trim()) errors.name = "Tell us your name.";
    else if (account.name.trim().length < 2) errors.name = "That looks too short to be a name.";
  }

  if (stepId === "contact") {
    if (!isValidEmail(account.email)) errors.email = "Enter a valid email address.";
    if (!isValidPhone(account.phone)) errors.phone = "Enter a valid phone number, e.g. +91 98765 43210.";
  }

  if (stepId === "password") {
    if (!isValidPassword(account.password)) {
      errors.password = "Your password does not meet all five requirements yet.";
    }
  }

  if (stepId === "username") {
    if (!isValidUsername(profile.username)) {
      errors.username = "Use 3–30 characters: lowercase letters, numbers or underscores.";
    } else if (usernameStatus?.state === "unavailable") {
      // Caught here rather than at the end: finding out on step 9 that the
      // username chosen on step 4 was taken is the worst version of this.
      errors.username = "That one is taken. Try another.";
    } else if (usernameStatus?.state === "checking") {
      errors.username = "Just checking that one is free…";
    }
  }

  if (stepId === "about" && role.key === "writer") {
    // Required by the server (PUT /onboarding/writer-profile refuses without
    // both). Each list carries "Prefer not to say", so answering costs nothing.
    if (!profile.diversity.gender) errors.gender = "Choose one, or \"Prefer not to say\".";
    if (!profile.diversity.nationality) errors.nationality = "Choose one, or \"Prefer not to say\".";
  }

  if (stepId === "identity") {
    if (!profile.company.trim()) errors.company = "Which company are you with?";
    if (role.key === "industry" && !profile.subRole) errors.subRole = "Pick the closest description of your role.";
  }

  if (stepId === "links" || stepId === "identity") {
    const invalid = Object.entries(profile.links)
      .filter(([, value]) => value && !isValidHttpUrl(value))
      .map(([name]) => name);
    if (invalid.length) errors.links = "Those links need to be full web addresses.";
  }

  if (stepId === "tags") {
    if (!genres.length) errors.genres = "Pick at least one genre so your work can be found.";
    if (tags.length > MAX_STORY_TAGS) errors.tags = `Choose up to ${MAX_STORY_TAGS} tags.`;
  }

  if (stepId === "terms") {
    if (!agreeTerms) errors.agreeTerms = "Accept the Terms & Conditions to finish.";
    if (!agreePrivacy) errors.agreePrivacy = "Accept the Privacy Policy to finish.";
  }

  return errors;
}

export default function useMobileSignUp({ roleKey, step, goToStep, onComplete } = {}) {
  const { join, updateSessionUser, user } = useContext(AuthContext);
  const role = useMemo(() => resolveRole(roleKey), [roleKey]);
  const steps = useMemo(() => stepsForRole(role.key), [role.key]);
  const accountStep = useMemo(() => accountStepNumber(role.key), [role.key]);

  /* Read once, on the first render for this role. A draft that reloaded itself
     on every render would fight the person typing. */
  const draftRef = useRef(null);
  if (draftRef.current?.roleKey !== role.key) {
    draftRef.current = { roleKey: role.key, value: loadDraft(role.key) };
  }
  const draft = draftRef.current.value;

  const [account, setAccount] = useState(() => ({ ...EMPTY_ACCOUNT, ...(draft?.account || {}) }));
  const [profile, setProfile] = useState(() => mergeProfile(draft?.profile));
  const [genres, setGenres] = useState(() => draft?.genres || []);
  const [formats, setFormats] = useState(() => draft?.formats || []);
  const [tags, setTags] = useState(() => draft?.tags || []);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  /* True once POST /auth/join has succeeded — the line after which abandoning
     the flow leaves a real account rather than nothing. `user` is checked too
     so a re-entry on an existing session knows where it stands. */
  const [accountCreated, setAccountCreated] = useState(() => Boolean(draft?.accountCreated || user));

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [refusal, setRefusal] = useState(null);
  const [verification, setVerification] = useState(null);
  const [usernameStatus, setUsernameStatus] = useState({ state: "idle", message: "" });
  const [referralStatus, setReferralStatus] = useState({ state: "idle", message: "" });
  const [resumeOffered, setResumeOffered] = useState(() => isResumable(draft));

  const usernameRequestRef = useRef(0);
  const referralRequestRef = useRef(0);

  const current = steps[Math.min(Math.max(step, 1), steps.length) - 1];
  const isLast = step >= steps.length;
  const total = steps.length;

  /* What the resume prompt has to show before someone can answer it: how far
     the draft got, and how old it is. Both are facts the draft already carries;
     without them the offer is "continue something" with no way to tell whether
     that something is worth continuing. */
  const resumePoint = useMemo(() => {
    if (!draft) return null;
    const index = Math.min(Math.max(draft.step || 1, 1), steps.length) - 1;
    return { step: index + 1, total: steps.length, title: steps[index].title, savedAt: draft.savedAt };
  }, [draft, steps]);

  /* A referral in the URL wins over a stored one, and is stored so it survives
     the OTP detour through the mail app. Mirrors AuthContext's own capture. */
  const adoptReferral = useCallback((value) => {
    const code = normalizeReferral(value);
    if (!code) return;
    setAccount((prev) => (normalizeReferral(prev.referralCode) === code ? prev : { ...prev, referralCode: code }));
    try {
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);
    } catch { /* the in-memory value still reaches the join payload */ }
  }, []);

  useEffect(() => {
    if (account.referralCode) return;
    try {
      const stored = normalizeReferral(window.localStorage.getItem(REFERRAL_STORAGE_KEY));
      if (stored) setAccount((prev) => ({ ...prev, referralCode: stored }));
    } catch { /* no stored referral is the normal case */ }
  }, [account.referralCode]);

  /* Persist after every meaningful change. `authDraft` strips the password and
     the special-category fields on the way in AND on the way out, so this
     cannot leak by forgetting to. */
  useEffect(() => {
    saveDraft(role.key, { step, account, profile, genres, formats, tags, accountCreated });
  }, [role.key, step, account, profile, genres, formats, tags, accountCreated]);

  /* Live username availability. Debounced, and guarded by a request id so a
     slow early response cannot overwrite a fast later one — the classic way
     these fields end up showing the wrong answer. */
  useEffect(() => {
    if (current?.id !== "username") return undefined;
    const username = String(profile.username || "").trim().toLowerCase();
    if (!username) {
      setUsernameStatus({ state: "idle", message: "3–30 characters: a–z, 0–9 or _." });
      return undefined;
    }
    if (!isValidUsername(username)) {
      setUsernameStatus({ state: "invalid", message: "Use 3–30 lowercase letters, numbers or underscores." });
      return undefined;
    }

    const requestId = usernameRequestRef.current + 1;
    usernameRequestRef.current = requestId;
    setUsernameStatus({ state: "checking", message: "Checking…" });

    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/onboarding/check-username", { params: { username } });
        if (usernameRequestRef.current !== requestId) return;
        setUsernameStatus(data?.available
          ? { state: "available", message: `${username} is yours.` }
          : { state: "unavailable", message: "That one is taken. Try another." });
      } catch {
        if (usernameRequestRef.current !== requestId) return;
        // Not an error the person can act on — the submit will ask the server
        // again, and the server is the authority either way.
        setUsernameStatus({ state: "unknown", message: "We couldn't check that just now." });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [current?.id, profile.username]);

  /* Same shape for the referral code, on the step that collects it. */
  useEffect(() => {
    if (current?.id !== "contact") return undefined;
    const code = normalizeReferral(account.referralCode);
    if (!code) {
      setReferralStatus({ state: "idle", message: "" });
      return undefined;
    }

    const requestId = referralRequestRef.current + 1;
    referralRequestRef.current = requestId;
    setReferralStatus({ state: "checking", message: "Checking…" });

    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/auth/validate-referral/${encodeURIComponent(code)}`);
        if (referralRequestRef.current !== requestId) return;
        setReferralStatus(data?.valid
          ? { state: "valid", message: data.referrerName ? `Referred by ${data.referrerName}.` : "Referral applied." }
          : { state: "invalid", message: "We don't recognise that referral code." });
      } catch {
        if (referralRequestRef.current !== requestId) return;
        setReferralStatus({ state: "unknown", message: "" });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [current?.id, account.referralCode]);

  const createAccount = useCallback(async () => {
    const payload = {
      name: account.name.trim(),
      email: account.email.trim().toLowerCase(),
      phone: account.phone.trim(),
      password: account.password,
      role: role.role,
    };
    /*
     * `subRole` is NOT sent here, though POST /auth/join accepts it. The account
     * is created on step 3 and the industry flow does not ask which kind of
     * professional until step 5, so anything sent here would be an empty string
     * dressed up as a value. The `identity` save point writes it through
     * /users/update the moment it is actually known.
     */
    const code = normalizeReferral(account.referralCode);
    if (code) payload.referralCode = code;

    const data = await join(payload);
    setAccountCreated(true);

    if (data?.requiresVerification) {
      const record = readRefusal(data);
      setVerification({
        email: record.email || payload.email,
        expirySeconds: record.otpExpirySeconds,
        cooldownSeconds: record.resendCooldownSeconds,
      });
      return { verify: true };
    }
    return { verify: false };
  }, [account, role, join]);

  /*
   * The primary action. One function for every step, because from the person's
   * side it is one button — the difference between "next" and "create my
   * account" and "finish" is what the step means, not what they did.
   */
  const advance = useCallback(async () => {
    if (submitting) return;

    const stepErrors = validateStep(current.id, {
      account, profile, genres, formats, tags, agreeTerms, agreePrivacy, role, usernameStatus,
    });
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setRefusal(null);
    setSubmitting(true);

    try {
      if (current.createsAccount && !accountCreated) {
        const { verify } = await createAccount();
        if (verify) return; // the screen renders the OTP step from `verification`
        goToStep(step + 1);
        return;
      }

      /*
       * The draft deliberately does not persist `profile.diversity` (special-
       * category data — see authDraft), so resuming after a reload comes back
       * with those two answers missing. The writer profile write REQUIRES them,
       * so without this the server would refuse two steps later with "Gender
       * and Nationality are required" — a message about a question that is now
       * behind the person, on a step whose form cannot show it.
       *
       * Send them back to the step that asks, and say why. The cost of the
       * privacy rule is one re-answered step, and it should be paid here where
       * it can be explained rather than as a 400 further on.
       */
      if (role.key === "writer" && current.id === "links"
        && !(profile.diversity.gender && profile.diversity.nationality)) {
        const aboutStep = steps.findIndex((entry) => entry.id === "about") + 1;
        setErrors({
          gender: !profile.diversity.gender ? 'Choose one, or "Prefer not to say".' : "",
          nationality: !profile.diversity.nationality ? 'Choose one, or "Prefer not to say".' : "",
        });
        setRefusal({
          code: REFUSAL.UNKNOWN,
          message: "We don't keep these two answers when a sign-up is interrupted, so they need choosing again.",
        });
        goToStep(aboutStep);
        return;
      }

      const save = SAVE_POINTS[role.key]?.[current.id];
      if (save) {
        await save({ account, profile, genres, formats, tags, updateSessionUser });
      }

      if (isLast) {
        clearDraft(role.key);
        onComplete?.();
        return;
      }
      goToStep(step + 1);
    } catch (error) {
      const next = readRefusal(error);
      setRefusal(next);
      const field = refusalField(next.code);
      if (field) setErrors({ [field]: next.message });
      // A refusal that names a field the visitor already passed means going
      // back is the only way to fix it. Send them there rather than leaving
      // them on a step whose form cannot show the problem.
      if (field === "email" || field === "referralCode") goToStep(2);
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting, current, accountCreated, createAccount, goToStep, step, role, steps,
    account, profile, genres, formats, tags, agreeTerms, agreePrivacy, usernameStatus,
    updateSessionUser, isLast, onComplete,
  ]);

  /* The OTP step resolved. The account is verified and adopted, so the flow
     picks up at the step after the one that created it. */
  const onVerified = useCallback(() => {
    setVerification(null);
    goToStep(accountStep + 1);
  }, [goToStep, accountStep]);

  const back = useCallback(() => {
    if (verification) {
      // Back out of the OTP step to the password step, but the account already
      // exists — so this is "let me check my email later", not "undo".
      setVerification(null);
      return;
    }
    if (step > 1) goToStep(step - 1);
  }, [verification, step, goToStep]);

  const discardDraft = useCallback(() => {
    clearDraft(role.key);
    draftRef.current = { roleKey: role.key, value: null };
    setAccount({ ...EMPTY_ACCOUNT });
    setProfile(mergeProfile(null));
    setGenres([]);
    setFormats([]);
    setTags([]);
    setAccountCreated(Boolean(user));
    setResumeOffered(false);
    goToStep(1);
  }, [role.key, user, goToStep]);

  const keepDraft = useCallback(() => setResumeOffered(false), []);

  const toggleTag = useCallback((tag) => {
    setTags((current) => {
      if (current.includes(tag)) return current.filter((entry) => entry !== tag);
      if (current.length >= MAX_STORY_TAGS) return current;
      return [...current, tag];
    });
  }, []);

  const setLink = useCallback((name, value) => {
    setProfile((prev) => ({ ...prev, links: { ...prev.links, [name]: value } }));
  }, []);

  const setDemographic = useCallback((name, value) => {
    setProfile((prev) => ({ ...prev, diversity: { ...prev.diversity, [name]: value } }));
  }, []);

  return {
    role,
    steps,
    step,
    total,
    current,
    isLast,
    accountStep,
    accountCreated,
    account,
    setAccount,
    profile,
    setProfile,
    setLink,
    setDemographic,
    genres,
    setGenres,
    formats,
    setFormats,
    tags,
    setTags,
    toggleTag,
    agreeTerms,
    setAgreeTerms,
    agreePrivacy,
    setAgreePrivacy,
    submitting,
    errors,
    refusal,
    setRefusal,
    verification,
    usernameStatus,
    referralStatus,
    adoptReferral,
    resumeOffered,
    resumePoint,
    keepDraft,
    discardDraft,
    advance,
    back,
    onVerified,
    /* A refusal on the LAST field is not the only reason to leave; from the
       account step on, the account exists and leaving is a legitimate choice
       rather than an abandonment. The screen offers this, the hook says when. */
    canFinishLater: accountCreated && step > accountStep && !verification,
  };
}
