import User from "../models/User.js";
import { resolveAllowedUrl, asPostalPathSegment } from "../utils/outboundRequest.js";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { sendOTPEmail, sendWelcomeEmail, sendInvestorWelcomeEmail, sendPasswordResetOTPEmail } from "../utils/emailService.js";
import {
  generateOTP,
  generateOTPExpiry,
  generateOTPResendAvailableAt,
  getOTPExpirySeconds,
  getOTPResendCooldownSeconds,
  getRemainingResendCooldownSeconds,
  hashOTP,
  isHashedOTP,
  isOTPExpired,
  verifyHashedOTP,
} from "../utils/otpHelper.js";
import { notifyAdminWorkflowEvent } from "../utils/adminWorkflowAlerts.js";
import { getProfileCompletion } from "../utils/profileCompletion.js";
import { getAdminBranchAccessStatus } from "../utils/adminBranchAccess.js";
import { hasBusinessEmail, isFilmIndustryProfessionalRole } from "../utils/industryAccess.js";
import { canRevokeRemoteSession } from "../utils/accountSecurity.js";

const DEFAULT_LANGUAGE = "en";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const SUPPORTED_LANGUAGE_CODES = new Set(["en", "hi", "es", "fr", "de", "ja", "ko", "zh-CN"]);
const LANGUAGE_CODE_ALIASES = {
  zh: "zh-CN",
  "zh-cn": "zh-CN",
};

const normalizeLanguagePreference = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_LANGUAGE;

  const mapped = LANGUAGE_CODE_ALIASES[raw.toLowerCase()] || raw;
  return SUPPORTED_LANGUAGE_CODES.has(mapped) ? mapped : DEFAULT_LANGUAGE;
};

const generateToken = (id, sessionId) => {
  const expiresIn = process.env.JWT_EXPIRES_IN || "30d";
  const payload = sessionId ? { id, sessionId } : { id };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
  // Decode to get the exact expiry timestamp
  const decoded = jwt.decode(token);
  return { token, expiresAt: decoded.exp * 1000 }; // ms epoch
};

import crypto from "crypto";
import { isInviteExpired } from "../utils/inviteToken.js";
import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";
import axios from "axios";
import { syncIfRenewalDue } from "../utils/planSubscription.js";
import { getRazorpayClient } from "../utils/razorpayClient.js";

const addSessionToUser = async (req, user) => {
  const sessionId = crypto.randomUUID();
  const rawDevice = req.headers["user-agent"] || "Unknown Device";
  const ip = req.ip || req.connection?.remoteAddress || "Unknown IP";

  const parser = new UAParser(rawDevice);
  const browser = parser.getBrowser().name || "Unknown";
  const os = parser.getOS().name || "Unknown";
  
  let location = "Unknown Location";
  if (ip && ip !== "Unknown IP") {
    // In local development req.ip is often ::1, 127.0.0.1, or ::ffff:127.0.0.1
    if (ip === "::1" || ip === "127.0.0.1" || ip.includes("127.0.0.1")) {
      location = "Localhost";
    } else {
      try {
        const apiKey = process.env.IP_API_KEY;
        if (apiKey) {
          const response = await axios.get(`https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&ip=${ip}`);
          if (response.data) {
            const cityRegion = response.data.city || response.data.state_prov || "Unknown City";
            location = `${cityRegion}, ${response.data.country_code2 || response.data.country_name || "Unknown Country"}`;
          }
        } else {
          const geo = geoip.lookup(ip);
          if (geo) {
            const cityRegion = geo.city || geo.region || "Unknown City";
            location = `${cityRegion}, ${geo.country || "Unknown Country"}`;
          }
        }
      } catch (err) {
        console.error("IP Geolocation API failed:", err.message);
        const geo = geoip.lookup(ip);
        if (geo) {
          const cityRegion = geo.city || geo.region || "Unknown City";
          location = `${cityRegion}, ${geo.country || "Unknown Country"}`;
        }
      }
    }
  }

  if (!user.activeSessions) {
    user.activeSessions = [];
  }
  
  user.activeSessions.push({ 
    sessionId, 
    device: rawDevice,
    browser,
    os,
    location,
    ip, 
    loginTime: new Date(), 
    lastSeen: new Date() 
  });
  
  // Limit to 20 active sessions
  if (user.activeSessions.length > 20) {
    user.activeSessions.shift();
  }
  await user.save();
  return sessionId;
};

// Comprehensive email validation
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  // Trim and convert to lowercase
  email = email.trim().toLowerCase();
  
  // Check length
  if (email.length > 254 || email.length < 5) return false;
  
  // More comprehensive email regex (RFC 5322 Official Standard)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email)) return false;
  
  // Additional checks
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const [localPart, domain] = parts;
  
  // Local part validation
  if (localPart.length > 64 || localPart.length === 0) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;
  
  // Domain validation
  if (domain.length === 0 || domain.startsWith('-') || domain.endsWith('-')) return false;
  if (domain.includes('..')) return false;
  if (!domain.includes('.')) return false;
  
  // Check for valid TLD (at least 2 characters)
  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) return false;
  
  return true;
};

// Sanitize email
const sanitizeEmail = (email) => {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
};

const normalizeOptionalDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalizeOtpInput = (otp) => String(otp || "").trim();

const isValidOtpInput = (otp) => /^\d{6}$/.test(otp);

const buildVerificationResponse = (email) => ({
  requiresVerification: true,
  email,
  otpExpirySeconds: getOTPExpirySeconds(),
  resendCooldownSeconds: getOTPResendCooldownSeconds(),
});

/**
 * Roles a stranger may give themselves at signup.
 *
 * `role` arrives in the request body and used to go straight into User.create, validated by nothing
 * but the Mongoose enum — which contains `admin` and `finance`. Signing up as `role: "finance"` and
 * verifying your own OTP therefore returned a token that `financeOnly` accepts, exposing every
 * payment, invoice, user record and bank review. `admin` reached the whole admin API: its extra
 * access-code check lives in `login`, which the signup path never touches, and the branch guard
 * tests the SERVER's branch, with `master` in the default allow-list.
 *
 * So elevated roles are grant-only now: `admin`, `finance` and `judge` can be reached solely by an
 * admin changing an existing account, never by asking for them at the door.
 *
 * An unknown or elevated value falls back to the default rather than 400ing, deliberately. A refusal
 * would confirm which role names are real, and a would-be attacker learns nothing from a signup that
 * simply behaves normally.
 */
const PUBLIC_SIGNUP_ROLES = new Set([
  "creator", "writer", "reader",
  "investor", "producer", "director", "actor", "industry", "professional",
]);
const DEFAULT_SIGNUP_ROLE = "creator";

export const resolvePublicSignupRole = (requested) => {
  const value = String(requested ?? "").trim().toLowerCase();
  return PUBLIC_SIGNUP_ROLES.has(value) ? value : DEFAULT_SIGNUP_ROLE;
};

const CONTACT_REQUIRED_ROLES = new Set(["reader"]);
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const USERNAME_REQUIRED_ROLES = new Set([]);
const INDIA_COUNTRY_NAME = "India";
const INDIA_ZIP_REGEX = /^\d{6}$/;
const INTERNATIONAL_POSTAL_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9\s-]{2,11}$/;
const REFERRAL_INPUT_MAX_LENGTH = 40;
const DEFAULT_CLIENT_ORIGIN = "https://ckript.com";

const normalizeInputValue = (value = "") => String(value).trim();
const normalizeCountryName = (value = "") => normalizeInputValue(value);
const isIndiaCountry = (value = "") => normalizeCountryName(value).toLowerCase() === "india";
const normalizeReferralInput = (value = "") => {
  const str = normalizeInputValue(value);
  if (str === "null" || str === "undefined") return "";
  return str.slice(0, REFERRAL_INPUT_MAX_LENGTH);
};
const normalizeReferralCode = (value = "") => normalizeReferralInput(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const normalizeReferralUsername = (value = "") =>
  normalizeReferralInput(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

const buildReferralLink = (referralCode = "") => {
  const base = String(process.env.CLIENT_URL || process.env.FRONTEND_URL || DEFAULT_CLIENT_ORIGIN)
    .trim()
    .replace(/\/$/, "");
  const safeCode = encodeURIComponent(String(referralCode || "").trim());
  return `${base}/${safeCode}`;
};

const findReferrerByInput = async (rawReferralInput = "") => {
  const normalizedRaw = normalizeReferralInput(rawReferralInput);
  if (!normalizedRaw) return null;

  const referralCodeCandidate = normalizeReferralCode(normalizedRaw);
  if (referralCodeCandidate.length >= 4) {
    const matchedByCode = await User.findOne({ referralCode: referralCodeCandidate }).select(
      "_id name email role referralCode writerProfile.username"
    );
    if (matchedByCode) {
      return matchedByCode;
    }
  }

  const usernameCandidate = normalizeReferralUsername(normalizedRaw);
  if (usernameCandidate.length >= 3) {
    const matchedByUsername = await User.findOne({ "writerProfile.username": usernameCandidate }).select(
      "_id name email role referralCode writerProfile.username"
    );
    if (matchedByUsername) {
      return matchedByUsername;
    }
  }

  return null;
};

const hasReferralBeenUsedByEmail = async (rawEmail = "", options = {}) => {
  const email = sanitizeEmail(rawEmail);
  if (!email) return false;

  const filter = {
    $and: [
      {
        $or: [
          { email },
          { "accountDeletion.originalEmail": email },
        ],
      },
      {
        $or: [
          { referredBy: { $exists: true, $ne: null } },
          { hasReceivedReferralBonus: true },
          { referralBonusAwardedAt: { $exists: true, $ne: null } },
        ],
      },
    ],
  };

  if (options.excludeUserId) {
    filter._id = { $ne: options.excludeUserId };
  }

  const existing = await User.exists(filter);
  return Boolean(existing);
};

/**
 * Marks a referral as QUALIFIED: the referred account exists, is verified, and was not self-referred.
 *
 * There is no longer a payout attached. This used to also mint credit currency for both sides, but
 * nothing in the product ever spent credits, so the currency was removed and only the marker remains.
 * `hasReceivedReferralBonus` is what everything downstream actually reads — it is the "qualified
 * referral" flag for the competition referral drive (see utils/competitionReferrals.js), which pays in
 * badges and subscription days.
 *
 * The name is kept because it is referenced from several signup/verification paths; only the payout
 * is gone.
 */
const awardReferralBonusForUser = async (userId) => {
  if (!userId) return { awarded: false };

  const referredUser = await User.findById(userId).select(
    "name referredBy hasReceivedReferralBonus referralBonusAwardedAt referralCode"
  );

  if (!referredUser || !referredUser.referredBy || referredUser.hasReceivedReferralBonus) {
    return { awarded: false };
  }

  if (String(referredUser.referredBy) === String(referredUser._id)) {
    await User.updateOne(
      { _id: referredUser._id, hasReceivedReferralBonus: false },
      {
        $set: {
          hasReceivedReferralBonus: true,
          referralBonusAwardedAt: new Date(),
        },
      }
    );
    return { awarded: false, reason: "self_referral_blocked" };
  }

  const referrer = await User.findById(referredUser.referredBy).select(
    "_id name email referralCode writerProfile.username"
  );

  if (!referrer) {
    return { awarded: false, reason: "referrer_not_found" };
  }

  if (String(referrer._id) === String(referredUser._id)) {
    return { awarded: false, reason: "self_referral_blocked" };
  }

  // Conditional on the flag still being false, so two concurrent verifications can't both qualify it.
  const qualified = await User.updateOne(
    {
      _id: referredUser._id,
      referredBy: referrer._id,
      hasReceivedReferralBonus: false,
    },
    {
      $set: {
        hasReceivedReferralBonus: true,
        referralBonusAwardedAt: new Date(),
      },
    }
  );

  if (!qualified.modifiedCount) {
    return { awarded: false, reason: "already_awarded" };
  }

  // Denormalized tally only. Every reader of "how many referrals?" counts documents live, so if this
  // bump fails the referral is still correctly qualified — it must not fail the caller's signup or
  // email-verification response.
  await User.updateOne(
    { _id: referrer._id },
    { $inc: { "referralStats.successfulReferrals": 1 } }
  ).catch((error) => {
    console.error("Referral stat increment failed:", error?.message || error);
  });

  // Check if the referrer hit a competition milestone and notify the admin
  import("../utils/competitionReferrals.js")
    .then(({ checkAndNotifyReferralMilestones }) => checkAndNotifyReferralMilestones(referrer._id))
    .catch((err) => console.error("Failed to load competition referrals check:", err));

  return {
    awarded: true,
    referrerName: referrer.name || "",
    referrerCode: referrer.referralCode || "",
  };
};

const buildFormattedAddress = ({ street = "", city = "", state = "", zipCode = "", country = "" } = {}) => {
  const normalizedCountry = normalizeCountryName(country);
  const parts = [street, city, state, zipCode];

  if (normalizedCountry && !isIndiaCountry(normalizedCountry)) {
    parts.push(normalizedCountry);
  }

  return parts.filter(Boolean).join(", ");
};

const normalizeAddressPayload = (addressPayload) => {
  if (!addressPayload || typeof addressPayload !== "object") return null;

  const street = normalizeInputValue(addressPayload.street);
  const city = normalizeInputValue(addressPayload.city);
  const state = normalizeInputValue(addressPayload.state);
  const zipCode = normalizeInputValue(addressPayload.zipCode);
  const countryInput = normalizeCountryName(addressPayload.country);
  const country = countryInput || INDIA_COUNTRY_NAME;
  const formattedInput = normalizeInputValue(addressPayload.formatted);

  return {
    street,
    city,
    state,
    zipCode,
    country,
    formatted: formattedInput || buildFormattedAddress({ street, city, state, zipCode, country }),
  };
};

const normalizeLocation = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();

const parseAddressForValidation = (address = "") => {
  if (!address || typeof address !== "string") return null;

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) return null;

  let zipIndex = parts.length - 1;
  let zipMatch = (parts[zipIndex] || "").match(/(\d{6})/);

  if (!zipMatch && parts.length >= 2) {
    zipIndex = parts.length - 2;
    zipMatch = (parts[zipIndex] || "").match(/(\d{6})/);
  }

  if (!zipMatch) return null;

  const zipCode = zipMatch[1];
  const state = parts[zipIndex - 1] || "";
  const city = parts[zipIndex - 2] || "";

  if (!state || !city) return null;

  return { city, state, zipCode };
};

// Every postal lookup resolves through the shared allowlist — see utils/outboundRequest.js for why
// the check belongs at the sink rather than in the callers.
const fetchJsonWithTimeout = async (url, timeoutMs = 8000) => {
  const target = resolveAllowedUrl(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Postal API request failed with status ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchPostalOfficesFromIndiaPost = async (zipCode) => {
  const segment = asPostalPathSegment(zipCode);
  if (!segment) return [];
  const data = await fetchJsonWithTimeout(`https://api.postalpincode.in/pincode/${segment}`);
  return Array.isArray(data) && data[0]?.PostOffice ? data[0].PostOffice : [];
};

const fetchPostalOfficesFromZippopotam = async (zipCode) => {
  const segment = asPostalPathSegment(zipCode);
  if (!segment) return [];
  const data = await fetchJsonWithTimeout(`https://api.zippopotam.us/IN/${segment}`);
  const places = Array.isArray(data?.places) ? data.places : [];

  return places.map((place) => ({
    Name: place["place name"] || "",
    District: place["place name"] || "",
    Block: place["place name"] || "",
    Division: "",
    State: place.state || "",
  }));
};

const fetchPostalOfficesByZip = async (zipCode) => {
  try {
    const offices = await fetchPostalOfficesFromIndiaPost(zipCode);
    if (offices.length) return offices;
  } catch (primaryError) {
    console.warn("Primary ZIP provider unavailable:", primaryError.message || primaryError);
  }

  try {
    return await fetchPostalOfficesFromZippopotam(zipCode);
  } catch (fallbackError) {
    throw new Error(fallbackError?.message || "All ZIP lookup providers failed");
  }
};

const extractCityStateFromOffices = (offices = []) => {
  if (!offices.length) return { city: "", state: "" };

  const firstOffice = offices[0] || {};
  const city = firstOffice.District || firstOffice.Name || firstOffice.Block || firstOffice.Division || "";
  const state = firstOffice.State || "";

  return { city, state };
};

const validateAddressWithPostalData = async ({ city, state, zipCode }) => {
  const strictAddressValidation =
    String(process.env.STRICT_ADDRESS_VALIDATION || "false").toLowerCase() === "true";

  let offices = [];
  try {
    offices = await fetchPostalOfficesByZip(zipCode);
  } catch (postalError) {
    console.warn("Postal API unavailable during signup address validation:", postalError.message || postalError);

    if (strictAddressValidation) {
      return {
        valid: false,
        statusCode: 503,
        message: "Address validation service is temporarily unavailable. Please try again.",
      };
    }

    return {
      valid: true,
      skipped: true,
      message: "Address format accepted. Live ZIP verification is temporarily unavailable.",
      normalized: {
        city,
        state,
        zipCode,
      },
    };
  }

  if (!offices.length) {
    return {
      valid: false,
      statusCode: 400,
      message: "Invalid ZIP code. No matching postal records found.",
    };
  }

  const normalizedInputState = normalizeLocation(state);
  const normalizedInputCity = normalizeLocation(city);

  const stateMatches = offices.some((office) => normalizeLocation(office.State) === normalizedInputState);

  const cityMatches = offices.some((office) => {
    const candidates = [office.District, office.Name, office.Block, office.Division]
      .filter(Boolean)
      .map((value) => normalizeLocation(value));

    return candidates.some((candidate) =>
      candidate === normalizedInputCity ||
      candidate.includes(normalizedInputCity) ||
      normalizedInputCity.includes(candidate)
    );
  });

  if (!stateMatches) {
    return {
      valid: false,
      statusCode: 400,
      message: "State does not match the entered ZIP code.",
    };
  }

  if (!cityMatches) {
    return {
      valid: false,
      statusCode: 400,
      message: "City does not match the entered ZIP code.",
    };
  }

  return {
    valid: true,
    normalized: {
      city,
      state,
      zipCode,
    },
  };
};

// Password validation (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char)
const isValidPassword = (password) => {
  if (password.length < 8) return { valid: false, message: "Password must be at least 8 characters" };
  if (!/[A-Z]/.test(password)) return { valid: false, message: "Password must contain at least one uppercase letter" };
  if (!/[a-z]/.test(password)) return { valid: false, message: "Password must contain at least one lowercase letter" };
  if (!/[0-9]/.test(password)) return { valid: false, message: "Password must contain at least one number" };
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return { valid: false, message: "Password must contain at least one special character" };
  return { valid: true };
};

export const join = async (req, res) => {
  console.log('Join request received:', req.body);
  let { name, email, password, role, phone, address, username, referralCode, dateOfBirth, subRole } = req.body;
  try {
    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Please provide name, email, and password" });
    }

    // Sanitize email
    email = sanitizeEmail(email);
    
    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address. Ensure it has a valid format (e.g., user@example.com)" });
    }

    // Validate password strength
    const passwordCheck = isValidPassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    // Clamp BEFORE anything reads it — the role drives username/contact requirements below
    // and the User.create call at the end of this handler.
    role = resolvePublicSignupRole(normalizeInputValue(role));
    const normalizedUsername = normalizeInputValue(username).toLowerCase();
    const normalizedReferralInput = normalizeReferralInput(referralCode);
    const requiresUsername = USERNAME_REQUIRED_ROLES.has(role);

    if (requiresUsername && !normalizedUsername) {
      return res.status(400).json({ message: "Username is required" });
    }

    if (normalizedUsername && !USERNAME_PATTERN.test(normalizedUsername)) {
      return res.status(400).json({
        message: "Username must be 3-30 characters and contain only lowercase letters, numbers, or underscores",
      });
    }

    let referrerUser = null;
    if (normalizedReferralInput) {
      const referralAlreadyUsedForEmail = await hasReferralBeenUsedByEmail(email);
      if (referralAlreadyUsedForEmail) {
        return res.status(400).json({
          message: "Referral already used for this email.",
        });
      }

      referrerUser = await findReferrerByInput(normalizedReferralInput);

      if (!referrerUser) {
        return res.status(400).json({
          message: "Invalid referral code or username",
        });
      }

      if (sanitizeEmail(referrerUser.email) === email) {
        return res.status(400).json({
          message: "You cannot use your own referral code",
        });
      }
    }

    // Check if email verification should be skipped (dev mode or missing config)
    let skipEmailVerification = process.env.SKIP_EMAIL_VERIFICATION === 'true';
    if (!skipEmailVerification && (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD)) {
      console.warn("Skipping email verification because EMAIL_USER or EMAIL_PASSWORD is not set.");
      skipEmailVerification = true;
    }

    const requiresContactDetails = CONTACT_REQUIRED_ROLES.has(role);
    const normalizedPhone = normalizeInputValue(phone);
    const normalizedAddress = normalizeAddressPayload(address);
    const shouldValidatePhone = requiresContactDetails || Boolean(normalizedPhone);
    const shouldValidateAddress = requiresContactDetails || Boolean(normalizedAddress);
    const normalizedDateOfBirth = normalizeOptionalDate(dateOfBirth);

    if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== "" && !normalizedDateOfBirth) {
      return res.status(400).json({ message: "Please provide a valid date of birth" });
    }

    if (shouldValidatePhone) {
      if (!normalizedPhone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!/^[+]?[\d\s\-().]{7,15}$/.test(normalizedPhone)) {
        return res.status(400).json({ message: "Please enter a valid phone number (e.g. +91 00000 00000)" });
      }
      phone = normalizedPhone;
    }

    if (shouldValidateAddress) {
      if (!normalizedAddress) {
        return res.status(400).json({ message: "Address details are required" });
      }

      const { street, city, state, zipCode, country, formatted } = normalizedAddress;

      if (!street || !city || !state || !zipCode || !country) {
        return res.status(400).json({ message: "Street, city, state, postal code, and country are required" });
      }

      if (isIndiaCountry(country)) {
        if (!INDIA_ZIP_REGEX.test(zipCode)) {
          return res.status(400).json({ message: "ZIP code must be exactly 6 digits" });
        }
      } else if (!INTERNATIONAL_POSTAL_REGEX.test(zipCode)) {
        return res.status(400).json({ message: "Enter a valid postal code (3-12 letters, numbers, spaces, or hyphen)" });
      }

      const cityStatePattern = /^[a-zA-Z][a-zA-Z\s.'-]{1,}$/;
      if (!cityStatePattern.test(city) || !cityStatePattern.test(state)) {
        return res.status(400).json({ message: "Enter a valid city and state name" });
      }

      if (isIndiaCountry(country)) {
        const validationResult = await validateAddressWithPostalData({ city, state, zipCode });
        if (!validationResult.valid) {
          return res.status(validationResult.statusCode || 400).json({ message: validationResult.message });
        }
      }

      address = {
        street,
        city,
        state,
        zipCode,
        country,
        formatted: formatted || buildFormattedAddress({ street, city, state, zipCode, country }),
      };
    }

    let industryProfile;
    if (role === "professional") {
      const normalizedSubRole = normalizeInputValue(subRole).toLowerCase();
      industryProfile = normalizedSubRole ? { subRole: normalizedSubRole } : undefined;
    }

    if (normalizedUsername) {
      const existingUsernameForAnotherEmail = await User.exists({
        email: { $ne: email },
        "writerProfile.username": normalizedUsername,
      });

      if (existingUsernameForAnotherEmail) {
        return res.status(409).json({ message: "Username is already taken" });
      }
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      if (referrerUser && String(referrerUser._id) === String(userExists._id)) {
        return res.status(400).json({ message: "You cannot use your own referral code" });
      }

      if (requiresUsername && !normalizeInputValue(normalizedUsername || userExists.writerProfile?.username)) {
        return res.status(400).json({ message: "Username is required" });
      }

      if (normalizedUsername) {
        const usernameConflict = await User.exists({
          _id: { $ne: userExists._id },
          "writerProfile.username": normalizedUsername,
        });

        if (usernameConflict) {
          return res.status(409).json({ message: "Username is already taken" });
        }
      }

      // If user exists but not verified, allow resending OTP
      if (!userExists.emailVerified) {
        const remainingCooldownSeconds = getRemainingResendCooldownSeconds(
          userExists.emailVerificationResendAvailableAt
        );

        if (remainingCooldownSeconds > 0) {
          return res.status(429).json({
            message: `Please wait ${remainingCooldownSeconds} seconds before requesting a new verification code.`,
            cooldownRemainingSeconds: remainingCooldownSeconds,
            ...buildVerificationResponse(userExists.email),
          });
        }

        const otp = generateOTP();
        if (requiresContactDetails) {
          userExists.phone = phone;
          userExists.address = address;
          userExists.markModified("address");
        } else {
          if (phone) userExists.phone = phone;
          if (address) {
            userExists.address = address;
            userExists.markModified("address");
          }
        }
        if (industryProfile?.subRole) {
          if (!userExists.industryProfile) userExists.industryProfile = {};
          userExists.industryProfile.subRole = industryProfile.subRole;
          userExists.markModified("industryProfile");
        }
        if (normalizedUsername) {
          if (!userExists.writerProfile) userExists.writerProfile = {};
          userExists.writerProfile.username = normalizedUsername;
          userExists.markModified("writerProfile");
        }
        if (referrerUser && !userExists.referredBy) {
          userExists.referredBy = referrerUser._id;
          userExists.referredAt = new Date();
        }
        
        if (skipEmailVerification) {
          userExists.emailVerified = true;
          userExists.emailVerificationToken = undefined;
          userExists.emailVerificationExpires = undefined;
          userExists.emailVerificationResendAvailableAt = undefined;
          await userExists.save();
          
          const referralBonusResult = await awardReferralBonusForUser(userExists._id);
          const token = jwt.sign({ id: userExists._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
          const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
          return res.status(200).json({
            _id: userExists._id,
            sid: userExists.sid,
            name: userExists.name,
            email: userExists.email,
            role: userExists.role,
            referralCode: userExists.referralCode,
            subscription: userExists.subscription,
            language: normalizeLanguagePreference(userExists.language),
            timezone: userExists.timezone || DEFAULT_TIMEZONE,
            referralBonusAwarded: referralBonusResult.awarded,
            token,
            expiresAt,
            message: "Account verified successfully (email verification skipped in dev mode)"
          });
        }

        userExists.emailVerificationToken = hashOTP(otp);
        userExists.emailVerificationExpires = generateOTPExpiry();
        userExists.emailVerificationResendAvailableAt = generateOTPResendAvailableAt();
        await userExists.save();
        
        const emailResult = await sendOTPEmail(email, userExists.name, otp);
        if (!emailResult.success) {
          console.error('Failed to resend OTP email:', emailResult.error);
          return res.status(500).json({ 
            message: emailResult.error?.includes('Invalid login') || emailResult.error?.includes('authentication') 
              ? "Email service configuration error. Please contact support." 
              : "Failed to send verification email. Please check your email address and try again."
          });
        }

        return res.status(200).json({ 
          message: "User already exists but not verified. New OTP sent to email.",
          ...buildVerificationResponse(email),
        });
      }
      return res.status(400).json({ message: "Email is already used. Please login." });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Create user with OTP
    const user = await User.create({ 
      name, 
      email, 
      password, 
      role,
      referredBy: referrerUser?._id,
      referredAt: referrerUser ? new Date() : undefined,
      phone: shouldValidatePhone ? phone : undefined,
      address: shouldValidateAddress ? address : undefined,
      dateOfBirth: normalizedDateOfBirth,
      writerProfile: normalizedUsername ? { username: normalizedUsername } : undefined,
      industryProfile,
      emailVerified: skipEmailVerification, // Auto-verify if skipping email
      emailVerificationToken: skipEmailVerification ? undefined : hashOTP(otp),
      emailVerificationExpires: skipEmailVerification ? undefined : generateOTPExpiry(),
      emailVerificationResendAvailableAt: skipEmailVerification ? undefined : generateOTPResendAvailableAt(),
    });
    
    // If skipping email verification, return token directly
    if (skipEmailVerification) {
      const referralBonusResult = await awardReferralBonusForUser(user._id);
      const sessionId = await addSessionToUser(req, user);
      const { token, expiresAt } = generateToken(user._id, sessionId);
      return res.status(201).json({
        _id: user._id,
        sid: user.sid,
        name: user.name,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
        subscription: user.subscription,
        language: normalizeLanguagePreference(user.language),
        timezone: user.timezone || DEFAULT_TIMEZONE,
        referralBonusAwarded: referralBonusResult.awarded,
        token,
        expiresAt,
        message: "Account created successfully (email verification skipped in dev mode)"
      });
    }
    
    // Send OTP email
    const emailResult = await sendOTPEmail(email, name, otp);
    if (!emailResult.success) {
      // Delete user if email fails
      await User.findByIdAndDelete(user._id);
      console.error('Failed to send OTP email:', emailResult.error);
      return res.status(500).json({ 
        message: emailResult.error?.includes('Invalid login') || emailResult.error?.includes('authentication') 
          ? "Email service configuration error. Please contact support." 
          : "Failed to send verification email. Please check your email address and try again."
      });
    }

    console.log('User created successfully, OTP sent:', user._id);
    res.status(201).json({
      message: "Account created successfully. Please check your email for verification code.",
      ...buildVerificationResponse(user.email),
    });
  } catch (error) {
    console.error('Join error:', error);
    if (error?.code === 11000 && error?.keyPattern?.["writerProfile.username"]) {
      return res.status(409).json({ message: "Username is already taken" });
    }
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  let { email, password, adminCode } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" });
    }

    email = sanitizeEmail(email);

    const user = await User.findOne({ email });
    if (user && (await user.matchPassword(password))) {
      if (user.isDeactivated) {
        return res.status(403).json({
          message: "This account has been deleted",
          accountDeleted: true,
        });
      }

      if (user.isFrozen) {
        return res.status(403).json({
          message: user.frozenReason || "This account has been frozen by admin",
          accountFrozen: true,
        });
      }

      if (user.role === "admin") {
        const branchAccess = getAdminBranchAccessStatus();
        if (!branchAccess.allowed) {
          return res.status(403).json({
            message: branchAccess.message,
            currentBranch: branchAccess.currentBranch,
            allowedBranches: branchAccess.allowedBranches,
          });
        }

        const requiredAdminCode = process.env.ADMIN_PANEL_CODE;
        if (!requiredAdminCode) {
          console.error("ADMIN_PANEL_CODE is not set in environment variables.");
          return res.status(500).json({ message: "Admin authentication is not configured properly." });
        }
        if (String(adminCode || "").trim() !== String(requiredAdminCode).trim()) {
          return res.status(403).json({ message: "Invalid admin access code" });
        }
      }

      if (!user.sid) {
        await user.save();
      }

      // Check if email is verified
      if (!user.emailVerified) {
        return res.status(403).json({ 
          message: "Please verify your email before logging in. Check your inbox for the verification code.",
          ...buildVerificationResponse(user.email),
        });
      }

      const sessionId = await addSessionToUser(req, user);
      const { token, expiresAt } = generateToken(user._id, sessionId);
      res.json({
        _id: user._id,
        sid: user.sid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        referralCode: user.referralCode,
        subscription: user.subscription,
        language: normalizeLanguagePreference(user.language),
        timezone: user.timezone || DEFAULT_TIMEZONE,
        approvalStatus: user.approvalStatus,
        approvalNote: user.approvalNote,
        profileImage: user.profileImage || user.profilePicture || "",
        profileCompletion: getProfileCompletion(user),
        googleCalendar: { connected: Boolean(user.googleCalendar?.connected), calendarEmail: user.googleCalendar?.calendarEmail || "" },
        preferredCurrency: user.preferredCurrency || "INR",
        token,
        expiresAt,
      });
    } else {
      // Provide clearer guidance when the entered email is pending verification.
      const pendingUser = await User.findOne({ pendingEmail: email }).select("email pendingEmail");
      if (pendingUser) {
        return res.status(403).json({
          message: `This email is pending verification. Please verify it first or login with your current email (${pendingUser.email}).`,
          pendingEmail: pendingUser.pendingEmail,
          currentEmail: pendingUser.email,
          ...buildVerificationResponse(pendingUser.pendingEmail),
        });
      }

      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Google OAuth (writers sign-in / sign-up) ──────────────────────────────
let cachedGoogleClient = null;
const getGoogleClient = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured on the server");
  }
  if (!cachedGoogleClient || cachedGoogleClient._configuredClientId !== clientId) {
    cachedGoogleClient = new OAuth2Client(clientId);
    cachedGoogleClient._configuredClientId = clientId;
  }
  return cachedGoogleClient;
};

const verifyGoogleIdToken = async (idToken) => {
  const client = getGoogleClient();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Google did not return a verifiable payload");
  return payload;
};

export const googleAuth = async (req, res) => {
  try {
    const { credential, idToken } = req.body || {};
    const token = String(credential || idToken || "").trim();
    if (!token) {
      return res.status(400).json({ message: "Google credential is required" });
    }

    let payload;
    try {
      payload = await verifyGoogleIdToken(token);
    } catch (verifyErr) {
      console.error("[googleAuth] verifyIdToken failed:", verifyErr?.message || verifyErr);
      return res.status(401).json({ message: "Invalid Google credential" });
    }

    if (!payload.email || !payload.email_verified) {
      return res.status(400).json({
        message: "Your Google account email is not verified. Please verify it with Google and try again.",
      });
    }

    const email = sanitizeEmail(payload.email);
    const googleId = String(payload.sub || "").trim();
    const name = String(payload.name || payload.given_name || email.split("@")[0]).trim();
    const profileImage = String(payload.picture || "").trim();

    const user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      // Google is sign-in only. New users must create an account through the regular
      // signup flow so they can pick a role (writer vs industry professional) and, for
      // investors, supply the contact + approval data Google can't provide.
      return res.status(404).json({
        message: "No account found for this Google email. Please create an account first.",
        accountNotFound: true,
        email,
      });
    }

    {
      // Link the Google account if not already linked, and refresh basic fields.
      let dirty = false;
      if (!user.googleId) {
        user.googleId = googleId;
        dirty = true;
      }
      if (!user.emailVerified) {
        user.emailVerified = true;
        dirty = true;
      }
      if (!user.profileImage && profileImage) {
        user.profileImage = profileImage;
        dirty = true;
      }
      if (!user.authProvider) {
        user.authProvider = user.password ? "password" : "google";
        dirty = true;
      }
      if (dirty) await user.save();
    }

    if (user.isDeactivated) {
      return res.status(403).json({ message: "This account has been deleted", accountDeleted: true });
    }
    if (user.isFrozen) {
      return res.status(403).json({
        message: user.frozenReason || "This account has been frozen by admin",
        accountFrozen: true,
      });
    }

    const sessionId = await addSessionToUser(req, user);
    const { token: jwtToken, expiresAt } = generateToken(user._id, sessionId);
    return res.json({
      _id: user._id,
      sid: user.sid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      referralCode: user.referralCode,
      language: normalizeLanguagePreference(user.language),
      timezone: user.timezone || DEFAULT_TIMEZONE,
      approvalStatus: user.approvalStatus,
      approvalNote: user.approvalNote,
      profileImage: user.profileImage || user.profilePicture || "",
      profileCompletion: getProfileCompletion(user),
      googleCalendar: { connected: Boolean(user.googleCalendar?.connected), calendarEmail: user.googleCalendar?.calendarEmail || "" },
      preferredCurrency: user.preferredCurrency || "INR",
      authProvider: "google",
      isNewUser: false,
      token: jwtToken,
      expiresAt,
    });
  } catch (error) {
    console.error("[googleAuth] failed:", error?.message || error);
    return res.status(500).json({ message: error.message || "Google sign-in failed" });
  }
};

// Verify OTP and complete registration
export const verifyOTP = async (req, res) => {
  let { email, otp } = req.body;
  try {
    if (!email || !otp) {
      return res.status(400).json({ message: "Please provide email and OTP" });
    }

    otp = normalizeOtpInput(otp);
    if (!isValidOtpInput(otp)) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Sanitize email
    email = sanitizeEmail(email);
    
    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email already verified. Please login." });
    }

    if (!user.emailVerificationToken) {
      return res.status(400).json({ message: "No verification code found. Please request a new one." });
    }

    if (!isHashedOTP(user.emailVerificationToken)) {
      user.emailVerificationToken = hashOTP(user.emailVerificationToken);
      await user.save();
    }

    if (user.isDeactivated) {
      return res.status(403).json({
        message: "This account has been deleted by admin",
        accountDeleted: true,
      });
    }

    if (user.isFrozen) {
      return res.status(403).json({
        message: user.frozenReason || "This account has been frozen by admin",
        accountFrozen: true,
      });
    }

    // Check if OTP is expired
    if (isOTPExpired(user.emailVerificationExpires)) {
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      user.emailVerificationResendAvailableAt = undefined;
      await user.save();
      return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
    }

    // Check if OTP matches
    if (!verifyHashedOTP(user.emailVerificationToken, otp)) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    user.emailVerificationResendAvailableAt = undefined;

    // Investors require admin approval — set pending status
    if (user.role === "investor") {
      user.approvalStatus = "pending";
    }

    if (isFilmIndustryProfessionalRole(user)) {
      if (!user.subscription) {
        user.subscription = {
          plan: "free",
          accessTier: "film_industry_professional",
          accessStatus: "active",
          accessActivatedAt: new Date(),
        };
      } else if (user.subscription.accessTier !== "film_industry_professional" || user.subscription.accessStatus !== "active") {
        user.subscription.plan = user.subscription.plan || "free";
        user.subscription.accessTier = "film_industry_professional";
        user.subscription.accessStatus = "active";
        user.subscription.accessActivatedAt = new Date();
      }
    }

    await user.save();

    // Send welcome email
    if (user.role === "investor") {
      await sendInvestorWelcomeEmail(user.email, user.name);
    } else {
      await sendWelcomeEmail(user.email, user.name);
    }

    const referralBonusResult = await awardReferralBonusForUser(user._id);

    // Investors cannot sign in from login until approved, but they should
    // still receive a session here to complete onboarding steps.
    if (user.role === "investor") {
      const sessionId = await addSessionToUser(req, user);
      const { token, expiresAt } = generateToken(user._id, sessionId);
      return res.json({
        message: "Email verified successfully! Complete your onboarding while your account is under admin review.",
        pendingApproval: true,
        email: user.email,
        role: user.role,
        _id: user._id,
        sid: user.sid,
        name: user.name,
        phone: user.phone,
        referralCode: user.referralCode,
        subscription: user.subscription,
        language: normalizeLanguagePreference(user.language),
        timezone: user.timezone || DEFAULT_TIMEZONE,
        approvalStatus: user.approvalStatus,
        approvalNote: user.approvalNote,
        profileCompletion: getProfileCompletion(user),
        referralBonusAwarded: referralBonusResult.awarded,
        token,
        expiresAt,
      });
    }

    // Generate token and log user in
    const sessionId = await addSessionToUser(req, user);
    const { token, expiresAt } = generateToken(user._id, sessionId);
    
    res.json({
      message: "Email verified successfully!",
      _id: user._id,
      sid: user.sid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      referralCode: user.referralCode,
      subscription: user.subscription,
      language: normalizeLanguagePreference(user.language),
      timezone: user.timezone || DEFAULT_TIMEZONE,
      profileCompletion: getProfileCompletion(user),
      referralBonusAwarded: referralBonusResult.awarded,
      token,
      expiresAt,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Resend OTP
export const resendOTP = async (req, res) => {
  let { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ message: "Please provide email" });
    }

    // Sanitize email
    email = sanitizeEmail(email);
    
    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email already verified. Please login." });
    }

    const remainingCooldownSeconds = getRemainingResendCooldownSeconds(
      user.emailVerificationResendAvailableAt
    );

    if (remainingCooldownSeconds > 0) {
      return res.status(429).json({
        message: `Please wait ${remainingCooldownSeconds} seconds before requesting a new verification code.`,
        cooldownRemainingSeconds: remainingCooldownSeconds,
        resendCooldownSeconds: getOTPResendCooldownSeconds(),
        otpExpirySeconds: getOTPExpirySeconds(),
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    user.emailVerificationToken = hashOTP(otp);
    user.emailVerificationExpires = generateOTPExpiry();
    user.emailVerificationResendAvailableAt = generateOTPResendAvailableAt();
    await user.save();

    // Send OTP email
    const emailResult = await sendOTPEmail(email, user.name, otp);
    if (!emailResult.success) {
      console.error('Failed to resend OTP email:', emailResult.error);
      return res.status(500).json({ 
        message: emailResult.error?.includes('Invalid login') || emailResult.error?.includes('authentication') 
          ? "Email service configuration error. Please contact support." 
          : "Failed to send verification email. Please check your email address and try again."
      });
    }

    res.json({
      message: "Verification code sent to your email",
      resendCooldownSeconds: getOTPResendCooldownSeconds(),
      otpExpirySeconds: getOTPExpirySeconds(),
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Validate referral code/username without applying it
export const validateReferral = async (req, res) => {
  try {
    const rawInput = String(req.params?.referralInput || req.query?.ref || "").trim();
    const normalized = normalizeReferralInput(rawInput);

    if (!normalized) {
      return res.status(400).json({ valid: false, message: "Referral code is required" });
    }

    const referrer = await findReferrerByInput(normalized);
    if (!referrer) {
      return res.status(404).json({ valid: false, message: "Referral code or username not found" });
    }

    return res.json({
      valid: true,
      referrer: {
        name: referrer.name,
        role: referrer.role,
        username: referrer?.writerProfile?.username || "",
        referralCode: referrer.referralCode,
      },
    });
  } catch (error) {
    return res.status(500).json({ valid: false, message: error.message || "Unable to validate referral" });
  }
};

// Apply referral code for a logged-in user (if not already applied)
export const applyReferralCode = async (req, res) => {
  try {
    const inputCode = normalizeReferralInput(req.body?.referralCode);
    if (!inputCode) {
      return res.status(400).json({ message: "Referral code is required" });
    }

    const currentUser = await User.findById(req.user._id).select(
      "_id email name referralCode referredBy emailVerified hasReceivedReferralBonus"
    );
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (currentUser.referredBy) {
      return res.status(400).json({ message: "Referral already applied to this account" });
    }

    const referralAlreadyUsedForEmail = await hasReferralBeenUsedByEmail(currentUser.email, {
      excludeUserId: currentUser._id,
    });
    if (referralAlreadyUsedForEmail) {
      return res.status(400).json({ message: "Referral already used for this email." });
    }

    const referrer = await findReferrerByInput(inputCode);
    if (!referrer) {
      return res.status(404).json({ message: "Referral code or username not found" });
    }

    if (String(referrer._id) === String(currentUser._id)) {
      return res.status(400).json({ message: "You cannot apply your own referral code" });
    }

    currentUser.referredBy = referrer._id;
    currentUser.referredAt = new Date();
    await currentUser.save();

    let referralBonusResult = { awarded: false };
    if (currentUser.emailVerified && !currentUser.hasReceivedReferralBonus) {
      referralBonusResult = await awardReferralBonusForUser(currentUser._id);
    }

    return res.json({
      message: "Referral applied successfully",
      referralApplied: true,
      referrer: {
        name: referrer.name,
        role: referrer.role,
        username: referrer?.writerProfile?.username || "",
        referralCode: referrer.referralCode,
      },
      referralBonusAwarded: referralBonusResult.awarded,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to apply referral" });
  }
};

// Logged-in user's referral summary for dashboard widgets
export const getReferralSummary = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "_id sid referralCode writerProfile.username"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.referralCode) {
      await user.save();
    }

    const [totalReferrals, successfulReferrals] = await Promise.all([
      User.countDocuments({ referredBy: user._id }),
      User.countDocuments({ referredBy: user._id, hasReceivedReferralBonus: true }),
    ]);

    const referralLink = buildReferralLink(user.referralCode);

    return res.json({
      referralCode: user.referralCode,
      referralLink,
      referralProfileLink: referralLink,
      totalReferrals,
      // Referrals that reached a verified account. This is what the competition referral tiers count.
      successfulReferrals,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch referral summary" });
  }
};

/**
 * Resolve a 6-digit Indian PIN code to its city and state.
 *
 * The parameter is called `pincode`, not `zipCode`, because that is what it is: a Postal Index
 * Number identifying a delivery area, which the `/^\d{6}$/` check below is the format for. The old
 * name read as "this user's postal address", which is a different and far more sensitive thing —
 * misleading to anyone reading the handler, and to static analysis, which flagged the endpoint for
 * carrying contact information in a GET URL. The value here is a public area code being looked up,
 * and it is the input to the lookup rather than anything about the person making it.
 *
 * The response still returns a `zipCode` field: nothing in the client reads it, but it costs
 * nothing to leave the wire format alone.
 */
export const lookupZipInfo = async (req, res) => {
  const pincode = String(req.params?.pincode || "").trim();

  try {
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        valid: false,
        message: "ZIP code must be exactly 6 digits.",
      });
    }

    const offices = await fetchPostalOfficesByZip(pincode);

    if (!offices.length) {
      return res.status(404).json({
        valid: false,
        message: "Invalid ZIP code. No matching postal records found.",
      });
    }

    const { city, state } = extractCityStateFromOffices(offices);

    return res.json({
      valid: true,
      zipCode: pincode,
      city,
      state,
    });
  } catch (error) {
    console.error("ZIP lookup error:", error);
    return res.status(200).json({
      valid: false,
      zipCode: pincode,
      city: "",
      state: "",
      message: "Unable to auto-fill city/state right now. Please enter them manually.",
    });
  }
};

export const validateSignupAddress = async (req, res) => {
  try {
    const { address, country = INDIA_COUNTRY_NAME } = req.body;

    if (!isIndiaCountry(country)) {
      return res.json({
        valid: true,
        skipped: true,
        message: "International address format accepted.",
      });
    }

    const parsed = parseAddressForValidation(address);

    if (!parsed) {
      return res.status(400).json({
        valid: false,
        message: "Enter address as: Street, City, State, ZIP (6-digit).",
      });
    }

    const validationResult = await validateAddressWithPostalData(parsed);

    if (!validationResult.valid) {
      return res.status(validationResult.statusCode || 400).json({
        valid: false,
        message: validationResult.message,
      });
    }

    return res.json({
      valid: true,
      skipped: Boolean(validationResult.skipped),
      message: validationResult.message || "Address validated successfully.",
      normalized: validationResult.normalized,
    });
  } catch (error) {
    console.error("Address validation error:", error);
    return res.status(500).json({
      valid: false,
      message: "Unable to validate address right now. Please try again.",
    });
  }
};

// Validate token & return current user data (used on page refresh)
export const getMe = async (req, res) => {
  try {
    let user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    // An auto-renewing plan whose paid window has ended should have been renewed by a webhook. If that
    // delivery never came, pull the state from Razorpay now rather than locking out a member whose card
    // was charged. Cheap when it doesn't apply: no Razorpay call unless a renewal is actually due.
    if (user.subscription?.recurring?.autoRenew) {
      const synced = await syncIfRenewalDue({ razorpay: await getRazorpayClient(), user });
      if (synced) user = (await User.findById(req.user._id).select("-password")) || user;
    }

    // Extract expiry from the current token
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.decode(token);

    res.json({
      _id: user._id,
      sid: user.sid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      referralCode: user.referralCode,
      subscription: user.subscription,
      language: normalizeLanguagePreference(user.language),
      timezone: user.timezone || DEFAULT_TIMEZONE,
      approvalStatus: user.approvalStatus,
      approvalNote: user.approvalNote,
      profileImage: user.profileImage || user.profilePicture || "",
      profilePicture: user.profilePicture,
      bio: user.bio,
      profileCompletion: getProfileCompletion(user),
      googleCalendar: { connected: Boolean(user.googleCalendar?.connected), calendarEmail: user.googleCalendar?.calendarEmail || "" },
      preferredCurrency: user.preferredCurrency || "INR",
      expiresAt: decoded.exp * 1000,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ───────────────────────────────────────────────────────────
// Forgot Password (Email OTP) flow
// ───────────────────────────────────────────────────────────

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const PASSWORD_RESET_EXPIRY_SECONDS = () =>
  parsePositiveInt(process.env.PASSWORD_RESET_TOKEN_EXPIRY_SECONDS, 300);
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = () =>
  parsePositiveInt(process.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS, 60);
const PASSWORD_RESET_MAX_ATTEMPTS = () =>
  parsePositiveInt(process.env.PASSWORD_RESET_MAX_ATTEMPTS, 5);

const GENERIC_FORGOT_PASSWORD_MESSAGE =
  "If an account with that email exists, we've sent a password reset code.";

const buildPasswordResetExpiry = () =>
  new Date(Date.now() + PASSWORD_RESET_EXPIRY_SECONDS() * 1000);

const buildPasswordResetResendAvailableAt = () =>
  new Date(Date.now() + PASSWORD_RESET_RESEND_COOLDOWN_SECONDS() * 1000);

// POST /auth/forgot-password — body: { email }
export const forgotPassword = async (req, res) => {
  try {
    let { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: "Please provide email" });
    }
    email = sanitizeEmail(email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    const user = await User.findOne({ email });

    // Always return generic success — no email enumeration
    const genericResponse = {
      success: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
      otpExpirySeconds: PASSWORD_RESET_EXPIRY_SECONDS(),
      resendCooldownSeconds: PASSWORD_RESET_RESEND_COOLDOWN_SECONDS(),
    };

    if (!user) {
      return res.json(genericResponse);
    }

    if (user.isDeactivated || user.isFrozen) {
      // Silently no-op — keep enumeration-safe
      return res.json(genericResponse);
    }

    const otp = generateOTP();
    user.passwordResetToken = hashOTP(otp);
    user.passwordResetExpires = buildPasswordResetExpiry();
    user.passwordResetResendAvailableAt = buildPasswordResetResendAvailableAt();
    user.passwordResetAttempts = 0;
    await user.save();

    const emailResult = await sendPasswordResetOTPEmail(
      user.email,
      user.name,
      otp,
      PASSWORD_RESET_EXPIRY_SECONDS()
    );

    if (!emailResult.success) {
      console.error("Failed to send password reset OTP email:", emailResult.error);
      // Do not leak failure details to the client
    }

    return res.json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: error.message });
  }
};

// POST /auth/reset-password — body: { email, otp, newPassword }
export const resetPassword = async (req, res) => {
  try {
    let { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP and new password are required" });
    }
    email = sanitizeEmail(email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }
    otp = normalizeOtpInput(otp);
    if (!isValidOtpInput(otp)) {
      return res.status(400).json({ message: "Invalid verification code" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    const user = await User.findOne({ email });
    if (!user || !user.passwordResetToken) {
      return res
        .status(400)
        .json({ message: "OTP expired or invalid. Please request a new code." });
    }

    if (isOTPExpired(user.passwordResetExpires)) {
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      user.passwordResetResendAvailableAt = null;
      user.passwordResetAttempts = 0;
      await user.save();
      return res
        .status(400)
        .json({ message: "OTP expired. Please request a new code." });
    }

    const maxAttempts = PASSWORD_RESET_MAX_ATTEMPTS();
    if ((user.passwordResetAttempts || 0) >= maxAttempts) {
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      user.passwordResetResendAvailableAt = null;
      user.passwordResetAttempts = 0;
      await user.save();
      return res
        .status(400)
        .json({ message: "Too many invalid attempts. Please request a new code." });
    }

    if (!verifyHashedOTP(user.passwordResetToken, otp)) {
      user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
      const remaining = Math.max(0, maxAttempts - user.passwordResetAttempts);
      await user.save();
      return res.status(400).json({
        message:
          remaining > 0
            ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            : "Too many invalid attempts. Please request a new code.",
        attemptsRemaining: remaining,
      });
    }

    // OTP valid — set new password (pre-save hook hashes it)
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.passwordResetResendAvailableAt = null;
    user.passwordResetAttempts = 0;
    await user.save();

    return res.json({
      success: true,
      message: "Password reset successfully. Please sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /auth/judge-invite/:token — is this link still good?
 *
 * Answers only enough for the page to render the right thing: whether the token works, and the name
 * to greet. Deliberately does NOT return the email address — a valid token proves possession of the
 * link, not of the mailbox, and echoing an address would turn a leaked link into a way to learn who
 * it belongs to.
 */
export const checkJudgeInvite = async (req, res) => {
  try {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ valid: false, message: "That invite link is not valid." });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ role: "judge", "judgeInvite.tokenHash": tokenHash })
      .select("name judgeInvite")
      .lean();

    if (!user) return res.status(404).json({ valid: false, message: "That invite link is not valid. Ask the organiser to send a new one." });
    if (user.judgeInvite?.acceptedAt) {
      return res.status(409).json({ valid: false, message: "This invite has already been used. Sign in with the password you chose." });
    }
    if (isInviteExpired(user.judgeInvite?.expiresAt)) {
      return res.status(410).json({ valid: false, message: "This invite has expired. Ask the organiser to send a new one." });
    }

    return res.json({ valid: true, name: user.name });
  } catch (error) {
    console.error("Judge invite check error:", error);
    return res.status(500).json({ valid: false, message: "Could not check that invite." });
  }
};

/**
 * POST /auth/judge-invite/accept — body: { token, password }
 *
 * The judge sets their own password, once, from a link the admin sent.
 *
 * This exists so the ADMIN never learns it. If the admin chose the password they could sign in as
 * that judge and score in their name, and "each score is attributable to a named judge" would be a
 * convention rather than something the system enforces — which is the entire reason judges get
 * individual accounts rather than a shared access code.
 *
 * Looked up by the token's HASH, never the token: the database stores only the hash, so a dump of it
 * gives nobody a usable link.
 *
 * Public, and behind the same authLimiter as every other route on /api/auth. Single-use: acceptedAt
 * is stamped and the hash is cleared, so a link that leaks after the fact opens nothing.
 */
export const acceptJudgeInvite = async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ message: "That invite link is not valid." });

    const passwordCheck = isValidPassword(password);
    if (!passwordCheck.valid) return res.status(400).json({ message: passwordCheck.message });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ role: "judge", "judgeInvite.tokenHash": tokenHash });

    if (!user) return res.status(404).json({ message: "That invite link is not valid. Ask the organiser to send a new one." });
    if (user.judgeInvite?.acceptedAt) {
      return res.status(409).json({ message: "This invite has already been used. Sign in with the password you chose." });
    }
    if (isInviteExpired(user.judgeInvite?.expiresAt)) {
      return res.status(410).json({ message: "This invite has expired. Ask the organiser to send a new one." });
    }
    if (user.isFrozen) return res.status(403).json({ message: "This account is not active. Contact the organiser." });

    // Plaintext assignment on purpose — the pre("save") hook hashes it, and only fires on a modified
    // `password` path.
    user.password = password;
    user.judgeInvite = {
      // Cleared, so the link is single-use rather than a standing password-reset for this account.
      tokenHash: "",
      expiresAt: null,
      acceptedAt: new Date(),
      invitedBy: user.judgeInvite?.invitedBy || null,
    };
    await user.save();

    // Signed straight in. Making someone who just proved possession of the invite AND chose the
    // password type that password again is friction with no security behind it.
    const sessionId = await addSessionToUser(req, user);
    const { token: authToken, expiresAt } = generateToken(user._id, sessionId);

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: authToken,
      expiresAt,
    });
  } catch (error) {
    console.error("Judge invite accept error:", error);
    return res.status(500).json({ message: "Could not set your password." });
  }
};

// POST /auth/resend-reset-otp — body: { email }
export const resendPasswordResetOTP = async (req, res) => {
  try {
    let { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: "Please provide email" });
    }
    email = sanitizeEmail(email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    const user = await User.findOne({ email });

    const genericResponse = {
      success: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
      otpExpirySeconds: PASSWORD_RESET_EXPIRY_SECONDS(),
      resendCooldownSeconds: PASSWORD_RESET_RESEND_COOLDOWN_SECONDS(),
    };

    if (!user || user.isDeactivated || user.isFrozen) {
      return res.json(genericResponse);
    }

    const remainingCooldownSeconds = getRemainingResendCooldownSeconds(
      user.passwordResetResendAvailableAt
    );
    if (remainingCooldownSeconds > 0) {
      return res.status(429).json({
        message: `Please wait ${remainingCooldownSeconds} seconds before requesting a new code.`,
        cooldownRemainingSeconds: remainingCooldownSeconds,
        resendCooldownSeconds: PASSWORD_RESET_RESEND_COOLDOWN_SECONDS(),
        otpExpirySeconds: PASSWORD_RESET_EXPIRY_SECONDS(),
      });
    }

    const otp = generateOTP();
    user.passwordResetToken = hashOTP(otp);
    user.passwordResetExpires = buildPasswordResetExpiry();
    user.passwordResetResendAvailableAt = buildPasswordResetResendAvailableAt();
    user.passwordResetAttempts = 0;
    await user.save();

    const emailResult = await sendPasswordResetOTPEmail(
      user.email,
      user.name,
      otp,
      PASSWORD_RESET_EXPIRY_SECONDS()
    );
    if (!emailResult.success) {
      console.error("Failed to resend password reset OTP email:", emailResult.error);
    }

    return res.json(genericResponse);
  } catch (error) {
    console.error("Resend password reset OTP error:", error);
    return res.status(500).json({ message: error.message });
  }
};

// ==========================================
// Session Management
// ==========================================

export const getSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const currentSessionId = req.sessionId;
    const sessions = (user.activeSessions || []).map(s => ({
      _id: s._id,
      sessionId: s.sessionId,
      device: s.device,
      browser: s.browser,
      os: s.os,
      location: s.location,
      ip: s.ip,
      loginTime: s.loginTime,
      lastSeen: s.lastSeen,
      isCurrent: s.sessionId === currentSessionId,
    }));
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch sessions" });
  }
};

export const removeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!canRevokeRemoteSession(sessionId, req.sessionId)) {
      return res.status(400).json({ message: "Use logout to end the current session" });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.activeSessions = user.activeSessions.filter(s => s.sessionId !== sessionId);
    await user.save();
    res.json({ message: "Session removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove session" });
  }
};

export const removeAllOtherSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const currentSessionId = req.sessionId;

    user.activeSessions = user.activeSessions.filter(s => s.sessionId === currentSessionId);
    await user.save();
    res.json({ message: "All other sessions removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove other sessions" });
  }
};

export const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user && req.sessionId) {
      user.activeSessions = user.activeSessions.filter(s => s.sessionId !== req.sessionId);
      await user.save();
    }
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to logout" });
  }
};
