import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const createSid = (prefix) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 8; i += 1) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${token}`;
};

// Exported because the pre-validate hook below only fires on save: accounts created before the hook
// existed have no code at all, so anything that needs to SHOW a referral link has to be able to mint
// one on demand. Alphabet omits I/O/0/1 — these get read aloud and typed by hand.
export const createReferralCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 8; i += 1) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
};

const userSchema = new mongoose.Schema({
  sid: { type: String, unique: true, sparse: true, index: true },
  referralCode: { type: String, unique: true, sparse: true, index: true, uppercase: true, trim: true },
  // Indexed: the admin top-referrers aggregation groups on this across the whole user collection.
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  // WHEN the referral link was recorded. Without this the only time signal is
  // `referralBonusAwardedAt`, which is stamped at email verification — potentially days after the
  // click — so any window-scoped count (a competition referral drive, say) would be badly skewed.
  // Set alongside referredBy at every site that writes it.
  referredAt: { type: Date },
  hasReceivedReferralBonus: { type: Boolean, default: false },
  referralBonusAwardedAt: { type: Date },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  dateOfBirth: { type: Date },
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zipCode: { type: String },
    country: { type: String },
    formatted: { type: String },
  },
  pendingEmail: { type: String },
  password: { type: String, required: function () { return !this.googleId; } },
  // Google OAuth linkage (writers / creators sign-in with Google).
  googleId: { type: String, index: true, sparse: true },
  authProvider: { type: String, enum: ["password", "google"], default: "password" },
  // "judge", like "admin" and "finance", is GRANTED, never chosen: authController's
  // PUBLIC_SIGNUP_ROLES allow-list is what keeps a stranger from posting role:"judge" to /auth/join
  // and reading unpublished competition entries. Adding a privileged role here without adding it
  // there makes it self-registerable.
  role: { type: String, enum: ["creator", "investor", "producer", "director", "actor", "reader", "writer", "industry", "professional", "admin", "finance", "judge"], required: true },
  // The role a finance grant replaced, so revoking restores it exactly — roles are load-bearing.
  financeRoleGrantedFrom: { type: String },

  /**
   * Judge onboarding: the admin creates the ACCOUNT, the judge chooses the SECRET.
   *
   * If the admin picked the password, the admin could sign in as that judge and score in their name,
   * and "every score is attributable to a named judge" would be a convention rather than a fact —
   * which is the whole reason judges get individual accounts instead of a shared code.
   *
   * The HASH is stored, never the token. The raw token exists only in the link handed to the admin
   * once; a leaked database gives nobody the ability to claim a judge account.
   *
   * The existing passwordResetToken fields could NOT be reused: those hold hashOTP(otp) and are
   * consumed by verifyHashedOTP — a six-digit code flow, not a link flow. Guessing a six-digit code
   * is a different proposition from guessing 32 random bytes, and this token sets a password on an
   * account that reads unpublished screenplays.
   */
  judgeInvite: {
    tokenHash: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  bio: { type: String },
  skills: [String],
  profileImage: { type: String },
  coverImage: { type: String },

  // Account settings
  isPrivate: { type: Boolean, default: false },
  allowIndustryContact: { type: Boolean, default: true },
  language: { type: String, default: "en" },
  timezone: { type: String, default: "Asia/Kolkata" },
  // Preferred display/checkout currency (auto-detected from IP, overridable via a toggle).
  preferredCurrency: { type: String, enum: ["INR", "USD"], default: "INR" },

  // Email verification
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  emailVerificationResendAvailableAt: { type: Date },

  // Password reset (forgot password)
  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null },
  passwordResetResendAvailableAt: { type: Date, default: null },
  passwordResetAttempts: { type: Number, default: 0 },

  // Legal acceptance tracking
  privacyPolicyAccepted: { type: Boolean, default: false },
  privacyPolicyAcceptedAt: { type: Date },
  privacyPolicyVersion: { type: String },

  // Writer-specific profile fields
  writerProfile: {
    username: { type: String, trim: true, lowercase: true },
    legalName: { type: String },
    representationStatus: {
      type: String,
      enum: ["unrepresented", "manager", "agent", "manager_and_agent"],
      default: "unrepresented"
    },
    agencyName: { type: String },
    wgaMember: { type: Boolean, default: false },
    sgaMember: { type: Boolean, default: false },
    membershipVerification: {
      wga: {
        requested: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ["not_submitted", "pending", "approved", "rejected"],
          default: "not_submitted",
        },
        proofUrl: { type: String },
        proofPublicId: { type: String },
        proofFileName: { type: String },
        proofMimeType: { type: String },
        submittedAt: { type: Date },
        reviewedAt: { type: Date },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        adminNote: { type: String },
      },
      swa: {
        requested: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ["not_submitted", "pending", "approved", "rejected"],
          default: "not_submitted",
        },
        proofUrl: { type: String },
        proofPublicId: { type: String },
        proofFileName: { type: String },
        proofMimeType: { type: String },
        submittedAt: { type: Date },
        reviewedAt: { type: Date },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        adminNote: { type: String },
      },
    },
    // Writer's primary genres
    genres: [String],
    // Specialized tags (themes, tones, settings)
    specializedTags: [String],
    // Plan selection
    plan: { type: String, enum: ["free", "paid", "silver", "gold", "diamond"], default: "free" },
    // Diversity data (optional)
    diversity: {
      gender: { type: String },
      nationality: { type: String },
      ethnicity: { type: String },
      lgbtqStatus: { type: String },
      disabilityStatus: { type: String },
    },
    links: {
      portfolio: { type: String },
      instagram: { type: String },
      twitter: { type: String },
      linkedin: { type: String },
      imdb: { type: String },
      facebook: { type: String },
    },
    accomplishments: [{ type: String }],
    representation: {
      filmTv: {
        agency: { type: String },
        agent: { type: String },
        managementCompany: { type: String },
        manager: { type: String },
        lawFirm: { type: String },
        lawyer: { type: String },
      },
      theater: {
        agency: { type: String },
        agent: { type: String },
        managementCompany: { type: String },
        manager: { type: String },
        lawFirm: { type: String },
        lawyer: { type: String },
      },
      literary: {
        agency: { type: String },
        agent: { type: String },
        managementCompany: { type: String },
        manager: { type: String },
        lawFirm: { type: String },
        lawyer: { type: String },
      },
    },
    demographicPrivacy: {
      type: String,
      enum: ["searchable", "private"],
      default: "searchable",
    },
    // Onboarding completion tracking
    onboardingComplete: { type: Boolean, default: false },
    onboardingStep: { type: Number, default: 0 }, // Track which step they're on
    writerOnboardingTermsAccepted: { type: Boolean, default: false },
    writerOnboardingTermsAcceptedAt: { type: Date },
    writerOnboardingTermsVersion: { type: String },
  },

  // Industry Professional Profile
  industryProfile: {
    subRole: {
      type: String,
      enum: [
        "producer",
        "director",
        "executive_producer",
        "line_producer",
        "showrunner",
        "development_executive",
        "studio_executive",
        "agent",
        "actor",
        "other",
      ],
    },
    subRoleOther: { type: String },
    company: { type: String },
    jobTitle: { type: String },
    imdbUrl: { type: String },
    linkedInUrl: { type: String },
    socialLinks: {
      instagram: { type: String },
      twitter: { type: String },
      website: { type: String },
      youtube: { type: String },
      facebook: { type: String },
    },
    demographics: {
      gender: { type: String },
      nationality: { type: String },
    },
    otherUrl: { type: String },
    previousCredits: { type: String },
    notableCreditAttachments: [{
      _id: false,
      url: { type: String },
      publicId: { type: String },
      fileName: { type: String },
      mimeType: { type: String },
      resourceType: { type: String },
      cloudinaryResourceType: { type: String },
      uploadedAt: { type: Date, default: Date.now },
    }],
    investmentRange: { type: String },
    isVerified: { type: Boolean, default: false },
    // Mandates (what they're looking for)
    mandates: {
      formats: [String], // Feature Film, TV Pilot, etc.
      genres: [String], // Genres they want
      excludeGenres: [String], // Genres they don't want
      specificHooks: [String] // Diverse Voices, Female-Led, etc.
    },
    savedScripts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Script' }],
    onboardingComplete: { type: Boolean, default: false },
    onboardingStep: { type: Number, default: 0 },
  },

  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // Pending follow requests sent to this user (used when this user is a private writer)
  followRequests: [{
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  }],
  // Pending follow requests this user has sent that haven't been accepted yet
  sentFollowRequests: [{
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  }],
  profileViews: { type: Number, default: 0 },
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // Smart Match preferences
  preferences: {
    genres: [String],
    budgetRange: { min: { type: Number, default: 0 }, max: { type: Number, default: 1000000 } },
    contentTypes: [{ type: String, enum: ["movie", "tv_series", "anime", "documentary", "short_film", "web_series", "book", "startup", "songs", "standup_comedy", "dialogues", "poet", "micro_drama"] }],
  },
  viewHistory: [{
    script: { type: mongoose.Schema.Types.ObjectId, ref: "Script" },
    viewedAt: { type: Date, default: Date.now },
  }],
  // The `credits` currency ledger (balance / totalPurchased / totalSpent / transactions) used to live
  // here. It was removed because nothing in the product ever spent it: no page was routed to it, and
  // the AI features gate on the subscription plan, not a balance. Only a referral signup bonus and an
  // admin grant button ever wrote to it, so it was a promise the product could not keep.
  //
  // Deliberately NOT $unset from existing documents: dropping the schema path is enough for Mongoose
  // to ignore whatever is stored, which keeps the removal reversible if the currency ever comes back.
  // Note `subscription.scriptScoreCredits` below is a SEPARATE counter and is unrelated.

  // Subscription
  subscription: {
    plan: { type: String, enum: ["free", "pro", "enterprise", "silver", "gold", "diamond"], default: "free" },
    expiresAt: { type: Date },
    scriptScoreCredits: { type: Number, default: 0 },
    aiImagesGeneratedTotal: { type: Number, default: 0 },
    accessTier: {
      type: String,
      enum: ["none", "film_industry_professional", "writer_silver", "writer_gold", "standard"],
      default: "none",
    },
    accessStatus: {
      type: String,
      enum: ["inactive", "trial", "active", "expired", "cancelled"],
      default: "inactive",
    },
    accessActivatedAt: { type: Date },
    accessExpiresAt: { type: Date },
    checkoutMode: {
      type: String,
      enum: ["test", "live"],
      default: "test",
    },
    checkoutProvider: {
      type: String,
      enum: ["none", "razorpay", "razorpay_test", "manual", "mock"],
      default: "none",
    },
    // The Razorpay ORDER id for writer plans, the PAYMENT id for the FIP plan — the two verifiers
    // disagree about what belongs here. `paymentId` below is the unambiguous one.
    checkoutReference: { type: String },
    // The Razorpay payment id. verifyWriterRazorpayPayment has always tried to $set this, but it was
    // not a schema path and the schema is strict, so Mongoose discarded it silently on every writer
    // subscription ever sold — leaving no way to look a plan payment up in the Razorpay dashboard.
    paymentId: { type: String },
    sourcePath: { type: String },
    contactsLimit: { type: Number, default: 10 },
    messageWritersLimit: { type: Number, default: 10 },
    meetingsLimit: { type: Number, default: 10 },
    revealedContacts: [
      {
        writerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        revealedAt: { type: Date, default: Date.now },
      },
    ],
    messagedWriters: [
      {
        writerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        messagedAt: { type: Date, default: Date.now },
      },
    ],
    scheduledMeetings: [
      {
        writerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        meetingId: { type: mongoose.Schema.Types.ObjectId, ref: "Meeting" },
        scheduledAt: { type: Date, default: Date.now },
      },
    ],
  },
  // Actor-specific fields for Talent Attachment
  actorProfile: {
    headshot: { type: String },
    reelUrl: { type: String },
    age: { type: Number },
    gender: { type: String },
    ethnicity: { type: String },
    actingStyles: [String],
    typeCast: { type: String }, // e.g. "Rough, older, like Liam Neeson"
    availableForAuditions: { type: Boolean, default: true },
  },
  // Reader system
  scriptsRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "Script" }],
  favoriteScripts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Script" }],
  // Domain Packages purchased
  domainPackages: [{
    category: { type: String },
    purchasedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
  }],
  // Notifications preferences
  notificationPrefs: {
    smartMatchAlerts: { type: Boolean, default: true },
    auditionAlerts: { type: Boolean, default: true },
    holdAlerts: { type: Boolean, default: true },
    viewAlerts: { type: Boolean, default: true },
    emailPreferences: {
      marketing: { type: Boolean, default: true },
      system: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
    },
  },
  // Legacy per-title thumbnail counter. No live route reads or writes it; retained so old documents
  // remain reversible. The enforced quota is subscription.aiImagesGeneratedTotal (15 per period).
  aiThumbnailUsage: [{
    scriptTitle: { type: String },
    count: { type: Number, default: 0 }
  }],
  recommendationProfile: {
    detectedGenres: [String],
    preferredFormats: [String],
    preferredBudgets: [String],
    behavior: {
      genreWeights: { type: Map, of: Number, default: {} },
      tagWeights: { type: Map, of: Number, default: {} },
      formatWeights: { type: Map, of: Number, default: {} },
      budgetWeights: { type: Map, of: Number, default: {} },
      avgTimeSpentMs: { type: Number, default: 0 },
    },
    updatedAt: { type: Date },
  },
  // Financial information
  bankDetails: {
    accountHolderName: { type: String },
    bankName: { type: String },
    accountNumber: { type: String },
    routingNumber: { type: String },
    accountType: {
      type: String,
      enum: ["checking", "savings", "business"],
      default: "checking"
    },
    swiftCode: { type: String }, // For international transfers
    iban: { type: String }, // For international transfers
    country: { type: String, default: "IN" },
    currency: { type: String, default: "INR" },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    addedAt: { type: Date }
  },
  bankDetailsReview: {
    status: {
      type: String,
      enum: ["not_submitted", "pending", "approved", "rejected"],
      default: "not_submitted",
    },
    requestedDetails: {
      accountHolderName: { type: String },
      bankName: { type: String },
      accountNumber: { type: String },
      routingNumber: { type: String },
      accountType: {
        type: String,
        enum: ["checking", "savings", "business"],
        default: "checking",
      },
      swiftCode: { type: String },
      iban: { type: String },
      country: { type: String, default: "IN" },
      currency: { type: String, default: "INR" },
    },
    submittedAt: { type: Date },
    dueAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    adminNote: { type: String },
  },
  bankDetailsSecurity: {
    invalidAttempts: { type: Number, default: 0 },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date },
    lastInvalidAttemptAt: { type: Date },
    lastInvalidReason: { type: String },
    unlockedAt: { type: Date },
    unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  wallet: {
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    pendingBalance: { type: Number, default: 0 }, // Funds being processed
    totalEarnings: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 }
  },

  referralStats: {
    successfulReferrals: { type: Number, default: 0 },
  },

  // Earned achievement badges (competitions). Server-persisted and public — unlike the localStorage
  // reader badges in client AchievementSystem.jsx, which are a separate, unrelated feature.
  badges: [{
    id: { type: String },        // challenge_winner | challenge_runner_up | challenge_second_runner_up | challenge_special | challenge_participant
    label: { type: String },
    // The competition's own artwork for this badge, stamped on at award time so the profile keeps
    // showing it even if the competition's images change later. Empty means a text chip.
    imageUrl: { type: String, default: "" },
    competitionId: { type: mongoose.Schema.Types.ObjectId, ref: "Competition" },
    awardedAt: { type: Date, default: Date.now },
  }],
  // Stripe Connected Account (for payouts)
  stripeAccountId: { type: String },
  stripeCustomerId: { type: String },
  // Google Calendar connection (producers schedule meetings that create a Meet event on their calendar).
  // Account-level integration; the refresh token is encrypted at rest and never selected by default.
  googleCalendar: {
    connected: { type: Boolean, default: false },
    connectedAt: { type: Date },
    calendarEmail: { type: String },
    refreshTokenEnc: { type: String, select: false },
    accessToken: { type: String, select: false },
    accessTokenExpiry: { type: Date, select: false },
    scopes: { type: [String], default: [] },
  },
  // Admin approval for investors
  approvalStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "approved",
  },
  approvalNote: { type: String },
  isFrozen: { type: Boolean, default: false },
  frozenAt: { type: Date },
  frozenReason: { type: String },
  frozenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isDeactivated: { type: Boolean, default: false },
  deactivatedAt: { type: Date },
  deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  accountDeletion: {
    reason: { type: String, default: "" },
    requestedAt: { type: Date },
    source: { type: String, enum: ["user", "admin"], default: "user" },
    originalName: { type: String, default: "" },
    originalEmail: { type: String, default: "" },
    archivedAt: { type: Date },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    archivedProfile: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  activeSessions: [
    {
      sessionId: { type: String, required: true },
      device: { type: String, default: "Unknown Device" }, // Raw UA fallback
      browser: { type: String, default: "Unknown" },
      os: { type: String, default: "Unknown" },
      location: { type: String, default: "Unknown Location" },
      ip: { type: String, default: "Unknown IP" },
      loginTime: { type: Date, default: Date.now },
      lastSeen: { type: Date, default: Date.now }
    }
  ],
}, { timestamps: true });

userSchema.index(
  { "writerProfile.username": 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      "writerProfile.username": { $exists: true, $type: "string", $ne: "" },
    },
  }
);

userSchema.pre("validate", async function () {
  if (!this.sid) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = createSid("USR");
      const exists = await this.constructor.exists({ sid: candidate });
      if (!exists) {
        this.sid = candidate;
        break;
      }
    }

    if (!this.sid) {
      throw new Error("Unable to generate unique user SID");
    }
  }

  if (!this.referralCode) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = createReferralCode();
      const exists = await this.constructor.exists({ referralCode: candidate });
      if (!exists) {
        this.referralCode = candidate;
        break;
      }
    }

    if (!this.referralCode) {
      throw new Error("Unable to generate unique referral code");
    }
  }
});

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  if (!this.password) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("User", userSchema);
