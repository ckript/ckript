import { buildPublicProfileView, safePublicUrl } from "../public-profile/publicProfileModel";

const text = (value) => (["string", "number"].includes(typeof value) ? String(value).trim() : "");
const count = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export function buildOwnerProfileView({
  profile = {},
  scripts = [],
  purchasedScripts = [],
  bookmarkedScripts = [],
  collectionCounts = {},
} = {}) {
  const followers = Array.isArray(profile.followers) ? profile.followers : [];
  const following = Array.isArray(profile.following) ? profile.following : [];
  const base = buildPublicProfileView({
    ...profile,
    followerCount: followers.length,
    followingCount: following.length,
  }, scripts);
  const completion = profile.profileCompletion || {};
  const links = base.writer
    ? base.links
    : [
      ["IMDb", profile.industryProfile?.imdbUrl],
      ["LinkedIn", profile.industryProfile?.linkedInUrl],
      ["Website", profile.industryProfile?.otherUrl],
    ].map(([label, value]) => ({ label, url: safePublicUrl(value) })).filter(({ url }) => url);

  return {
    ...base,
    username: text(profile.writerProfile?.username || profile.username),
    email: text(profile.email),
    phone: text(profile.phone),
    location: [profile.address?.city, profile.address?.state, profile.address?.country]
      .map(text).filter(Boolean).join(", "),
    completion: {
      percentage: Math.max(0, Math.min(100, count(completion.percentage))),
      completedFields: count(completion.completedFields),
      totalFields: count(completion.totalFields),
      isComplete: Boolean(completion.isComplete),
    },
    pendingFollowRequests: count(profile.pendingFollowRequestCount),
    links,
    stats: [
      { key: "projects", label: "Published", value: base.projects.length },
      { key: "saved", label: "Saved", value: collectionCounts.bookmarks == null
        ? Math.max(count(profile.favoriteScripts?.length), bookmarkedScripts.length)
        : count(collectionCounts.bookmarks) },
      { key: "purchases", label: "Purchased", value: purchasedScripts.length },
      ...(Number.isFinite(Number(profile.profileViews))
        ? [{ key: "views", label: "Profile views", value: count(profile.profileViews) }]
        : []),
    ],
    badges: (Array.isArray(profile.badges) ? profile.badges : []).map((badge) => ({
      id: text(badge?.id || badge?._id || badge?.label),
      label: text(badge?.label),
      // The competition's own artwork, stamped on when the badge was awarded; empty means a text chip.
      imageUrl: text(badge?.imageUrl),
    })).filter(({ id, label }) => id && label),
  };
}
