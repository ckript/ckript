/*
 * authOptions — the taxonomies the sign-up stepper offers (Phase 8, D59).
 *
 * These are the same vocabularies the rest of the product indexes against:
 * discovery facets, search, feeds and mandates all read them. They live in
 * their own file rather than in `authModel` because the model is rules and
 * these are content — a genre added next quarter should not mean editing the
 * file that mirrors the server's password policy.
 *
 * They are transcribed from the desktop onboarding modals rather than imported
 * from them. That is a cost, and it is the cost the "mobile-local" decision
 * bought: two lists that must be kept in step by hand. It is recorded here so
 * the next person editing either one knows the other exists.
 *   client/src/components/WriterOnboardingModal.jsx   — GENRE_OPTIONS, TAG_OPTIONS
 *   client/src/components/ProducerOnboardingModal.jsx — FORMAT_OPTIONS
 */

export const GENRE_OPTIONS = Object.freeze([
  "Action", "Adventure", "Animation", "Anime", "Art/Foreign", "Biographical",
  "Children/Family", "Comedy", "Coming of Age", "Crime", "Dark Comedy", "Documentary",
  "Drama", "Erotic", "Espionage", "Faith/Spirituality", "Family", "Fantasy",
  "Film Noir", "Historical", "Horror", "Indie", "Legal", "Martial Arts",
  "Medical", "Mockumentary", "Musical", "Mystery", "Noir", "Political",
  "Psychological", "Romance", "Romantic Comedy", "Satire", "Sci-Fi", "Short Film",
  "Slice of Life", "Sports", "Steampunk", "Superhero", "Supernatural", "Suspense",
  "Teen", "Thriller", "True Crime", "War", "Western", "Zombie",
]);

/*
 * Story tags. The desktop list runs to 100+; this is the same vocabulary
 * trimmed to the themes and settings that actually get picked, because a
 * hundred chips on a 320px screen is not a choice, it is a wall. The cap of
 * five (authModel.MAX_STORY_TAGS) is the server's, and unchanged.
 */
export const TAG_OPTIONS = Object.freeze([
  "Coming of Age", "Revenge", "Redemption", "Family Drama", "Forbidden Love",
  "Survival", "Identity Crisis", "Power Struggle", "Social Justice", "Loss & Grief",
  "Good vs Evil", "Man vs Nature", "Isolation", "Second Chance", "Underdog Story",
  "Fish Out of Water", "Quest", "Transformation", "Sacrifice", "Justice",
  "Freedom", "Mental Illness", "Addiction", "Betrayal", "Ambition",
  "Class Struggle", "Corruption", "Chosen One", "Love Triangle", "War & Peace",
  "Dystopian", "Post-Apocalyptic", "Small Town", "Big City", "Period Piece",
  "Space", "Supernatural", "Heist", "Courtroom", "Road Trip",
]);

export const FORMAT_OPTIONS = Object.freeze([
  { value: "feature", label: "Feature film" },
  { value: "tv_1hour", label: "TV pilot (1 hour)" },
  { value: "tv_halfhour", label: "TV pilot (half hour)" },
  { value: "limited_series", label: "Limited series" },
  { value: "tv_serial", label: "TV serial" },
  { value: "web_series", label: "Web series" },
  { value: "short", label: "Short film" },
  { value: "documentary", label: "Documentary" },
  { value: "anime", label: "Anime" },
  { value: "other", label: "Other" },
]);

/* Where a writer stands with an agent or manager. The value strings are the
   ones `/onboarding/writer-profile` already stores. */
export const REPRESENTATION_OPTIONS = Object.freeze([
  { value: "unrepresented", label: "Not represented" },
  { value: "seeking", label: "Looking for representation" },
  { value: "represented", label: "Represented" },
]);

/* The two guilds the writer profile records. `key` is the field on the profile,
   `review` the key inside `membershipVerification` on the server. */
export const GUILDS = Object.freeze([
  Object.freeze({ key: "wgaMember", review: "wga", title: "WGA", detail: "Writers Guild of America" }),
  Object.freeze({ key: "sgaMember", review: "swa", title: "SWA", detail: "Screenwriters Association, India" }),
]);

/* The link fields, and the label each one needs. `name` matches the key inside
   `profile.links`, which is what the save points read. `placeholder` is the
   shape of the answer rather than a repeat of the label: these rows carry their
   label in the left column, so the field itself has room to show what a valid
   value looks like instead. */
export const LINK_FIELDS = Object.freeze([
  Object.freeze({ name: "portfolio", label: "Portfolio", purpose: "url", placeholder: "yoursite.com" }),
  Object.freeze({ name: "imdb", label: "IMDb", purpose: "url", placeholder: "imdb.com/name/…" }),
  Object.freeze({ name: "linkedin", label: "LinkedIn", purpose: "url", placeholder: "linkedin.com/in/…" }),
  Object.freeze({ name: "instagram", label: "Instagram", purpose: "url", placeholder: "@handle" }),
  Object.freeze({ name: "twitter", label: "X / Twitter", purpose: "url", placeholder: "@handle" }),
]);

/*
 * Gender and nationality.
 *
 * These are here reluctantly and deliberately. `PUT /onboarding/writer-profile`
 * REFUSES with 400 "Gender and Nationality are required" unless both are
 * present, so a writer sign-up that does not ask for them cannot complete — the
 * flow would collect eight steps and fail on the ninth.
 *
 * They are special-category data (GDPR Art. 9), which is why `authDraft`
 * strips `profile.diversity` and never writes it to browser storage: it is
 * collected, sent once, and held only in memory in between. Both lists carry a
 * "Prefer not to say" that satisfies the server without requiring a disclosure.
 */
export const GENDER_OPTIONS = Object.freeze([
  "Male", "Female", "Trans", "Non-binary", "Prefer not to say", "Other",
]);

export const NATIONALITY_OPTIONS = Object.freeze([
  "Indian", "American", "British", "Canadian", "Australian", "New Zealander", "Irish",
  "French", "German", "Italian", "Spanish", "Portuguese", "Dutch", "Swedish", "Norwegian",
  "Danish", "Swiss", "Austrian", "Belgian", "Polish", "Russian", "Ukrainian", "Turkish",
  "Brazilian", "Mexican", "Argentinian", "South African", "Nigerian", "Egyptian", "Kenyan",
  "Saudi Arabian", "Emirati", "Pakistani", "Bangladeshi", "Nepalese", "Sri Lankan",
  "Singaporean", "Malaysian", "Indonesian", "Filipino", "Thai", "Vietnamese", "Chinese",
  "Japanese", "South Korean", "Prefer not to say", "Other",
]);
