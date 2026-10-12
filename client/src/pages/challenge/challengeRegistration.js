import api from "../../services/api";
import { genres as GENRE_OPTIONS, CP_FILM_LANGUAGE_OPTIONS } from "../CreateProject/constants";
import { COUNTRIES, EXPERIENCE_LEVELS } from "./constants";

const text = (value) => String(value ?? "").trim();
const failure = (cause, fallback) => ({
  ok: false,
  status: Number(cause?.response?.status || 0),
  message: cause?.response?.data?.message || fallback,
  flags: {
    externalPending: Boolean(cause?.response?.data?.externalPending),
    paymentPending: Boolean(cause?.response?.data?.paymentPending),
    paymentRequired: Boolean(cause?.response?.data?.paymentRequired),
  },
  cause,
});

export const CHALLENGE_REGISTRATION_MODE = Object.freeze({ FREE: "free", PAID: "paid" });
export const MAX_EXTERNAL_SCREENSHOT_BYTES = 8 * 1024 * 1024;
export const REGISTRATION_GENRES = GENRE_OPTIONS;
export const REGISTRATION_LANGUAGES = CP_FILM_LANGUAGE_OPTIONS;
export const REGISTRATION_COUNTRIES = COUNTRIES;
export const REGISTRATION_EXPERIENCE = EXPERIENCE_LEVELS;

export const emptyChallengeRegistration = () => ({
  country: "",
  language: "",
  genres: [],
  experienceLevel: "",
  portfolioUrl: "",
});

export const emptyExternalRegistration = () => ({
  provider: "",
  fullName: "",
  phone: "",
  externalRef: "",
});

export const challengeRegistrationMode = (competition = {}) => (
  competition?.entryFee?.mode === CHALLENGE_REGISTRATION_MODE.FREE
    ? CHALLENGE_REGISTRATION_MODE.FREE
    : CHALLENGE_REGISTRATION_MODE.PAID
);

export const challengeRegistrationPrices = (competition = {}) => ({
  INR: Number(competition?.entryFee?.inrMinor || 9800),
  USD: Number(competition?.entryFee?.usdMinor || 200),
});

export const challengeRegistrationPaths = (competition = {}, fallbackSlug = "") => {
  const slug = text(competition?.slug || fallbackSlug);
  const suffix = slug ? `?c=${encodeURIComponent(slug)}` : "";
  return {
    detail: slug ? `/challenge/c/${encodeURIComponent(slug)}` : "/challenge",
    dashboard: `/challenge/dashboard${suffix}`,
  };
};

export const validateChallengeRegistration = ({ form = {}, acceptRules = false, acceptCopyright = false } = {}) => {
  const errors = {};
  if (!COUNTRIES.includes(form.country)) errors.country = "Select your country.";
  if (!CP_FILM_LANGUAGE_OPTIONS.includes(form.language)) errors.language = "Choose your preferred language.";
  if (!Array.isArray(form.genres) || form.genres.length < 1) errors.genres = "Choose at least one genre.";
  else if (form.genres.length > 3) errors.genres = "Choose no more than three genres.";
  if (!EXPERIENCE_LEVELS.some((option) => option.value === form.experienceLevel)) {
    errors.experienceLevel = "Select your experience level.";
  }
  if (text(form.portfolioUrl) && !/^https?:\/\//i.test(text(form.portfolioUrl))) {
    errors.portfolioUrl = "Portfolio link must start with http:// or https://";
  }
  if (!acceptRules) errors.acceptRules = "Accept the competition rules to continue.";
  if (!acceptCopyright) errors.acceptCopyright = "Confirm the original-work policy to continue.";
  return { ok: Object.keys(errors).length === 0, errors, first: Object.keys(errors)[0] || "" };
};

export const validateExternalRegistration = ({ fields = {}, screenshot = null } = {}) => {
  if (!text(fields.provider)) return "Choose the platform you registered on.";
  if (!text(fields.fullName)) return "Enter the name you registered with.";
  if (!/^[+\d][\d\s()-]{6,}$/.test(text(fields.phone))) return "Enter a valid phone number.";
  if (text(fields.externalRef).length < 3) return "Enter your registration or booking ID.";
  if (screenshot && screenshot.size > MAX_EXTERNAL_SCREENSHOT_BYTES) return "Screenshot must be 8MB or smaller.";
  return "";
};

export const registrationPayload = ({ form = {}, acceptRules = false, acceptCopyright = false, currency = "" } = {}) => ({
  ...form,
  portfolioUrl: text(form.portfolioUrl),
  acceptRules: Boolean(acceptRules),
  acceptCopyright: Boolean(acceptCopyright),
  ...(currency ? { currency } : {}),
});

const call = async (request, fallback) => {
  try {
    const { data } = await request();
    return { ok: true, data };
  } catch (cause) {
    return failure(cause, fallback);
  }
};

export const registerForFreeChallenge = ({ competitionId, payload }) => call(
  () => api.post(`/competitions/${encodeURIComponent(competitionId)}/register`, payload),
  "Could not complete registration. Please try again.",
);

/** The entry fee for the checkout step: listed fee, Taxes (18%), total. No order is created. */
export const fetchChallengeRegistrationQuote = ({ competitionId, currency, country }) => call(
  () => api.post(`/competitions/${encodeURIComponent(competitionId)}/registration-quote`, { currency, country }),
  "Could not work out the entry fee.",
);

export const createChallengeRegistrationOrder = ({ competitionId, payload }) => call(
  () => api.post(`/competitions/${encodeURIComponent(competitionId)}/create-registration-order`, payload),
  "Could not prepare the payment. Please try again.",
);

export const verifyChallengeRegistrationPayment = ({ competitionId, payment }) => call(
  () => api.post(`/competitions/${encodeURIComponent(competitionId)}/verify-registration-payment`, payment),
  "The payment could not be confirmed yet.",
);

export const reconcileChallengeRegistrationPayment = ({ competitionId }) => call(
  () => api.post(`/competitions/${encodeURIComponent(competitionId)}/reconcile-registration-payment`),
  "No captured payment could be confirmed yet.",
);

export const loadExternalRegistration = ({ competitionId, signal } = {}) => call(
  () => api.get(`/competitions/${encodeURIComponent(competitionId)}/external-registration`, { signal }),
  "Could not load your third-party registration.",
);

export const submitExternalRegistration = ({ competitionId, fields, registration, screenshot }) => {
  const body = new FormData();
  body.append("provider", text(fields.provider));
  body.append("fullName", text(fields.fullName));
  body.append("phone", text(fields.phone));
  body.append("externalRef", text(fields.externalRef));
  body.append("country", registration.country || "");
  body.append("language", registration.language || "");
  (registration.genres || []).forEach((genre) => body.append("genres", genre));
  body.append("experienceLevel", registration.experienceLevel || "");
  body.append("portfolioUrl", text(registration.portfolioUrl));
  body.append("acceptRules", String(Boolean(registration.acceptRules)));
  body.append("acceptCopyright", String(Boolean(registration.acceptCopyright)));
  if (screenshot) body.append("screenshot", screenshot);
  // Do not set Content-Type: the browser supplies the multipart boundary.
  return call(
    () => api.post(`/competitions/${encodeURIComponent(competitionId)}/external-registration`, body),
    "Could not send your request. Please try again.",
  );
};

export const fetchRegistrationInvoice = ({ invoiceId }) => call(
  () => api.get(`/invoices/${encodeURIComponent(invoiceId)}/pdf`, { params: { download: 1 }, responseType: "blob" }),
  "Could not download the invoice just now. It stays available from your dashboard.",
);

const PENDING_KEY_PREFIX = "ckript.challenge.registration.pending.v1";
const pendingKey = ({ competitionId, userId } = {}) => (
  `${PENDING_KEY_PREFIX}:${encodeURIComponent(String(userId || ""))}:${encodeURIComponent(String(competitionId || ""))}`
);

export const rememberChallengeRegistrationPayment = ({ competitionId, userId, payment }) => {
  try {
    localStorage.setItem(pendingKey({ competitionId, userId }), JSON.stringify({ competitionId, userId, payment, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
};

export const readChallengeRegistrationPayment = ({ competitionId, userId } = {}) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingKey({ competitionId, userId })) || "null");
    if (!parsed || String(parsed.competitionId) !== String(competitionId) || String(parsed.userId) !== String(userId)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const forgetChallengeRegistrationPayment = ({ competitionId, userId } = {}) => {
  try { localStorage.removeItem(pendingKey({ competitionId, userId })); } catch { /* storage is optional */ }
};

export const loadChallengeRazorpaySdk = () => new Promise((resolve) => {
  if (typeof window === "undefined" || typeof document === "undefined") return resolve(false);
  if (window.Razorpay) return resolve(true);
  const existing = document.querySelector('script[data-razorpay-sdk="true"]');
  if (existing) {
    existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
    existing.addEventListener("error", () => resolve(false), { once: true });
    return undefined;
  }
  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.async = true;
  script.setAttribute("data-razorpay-sdk", "true");
  script.onload = () => resolve(Boolean(window.Razorpay));
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
  return undefined;
});
