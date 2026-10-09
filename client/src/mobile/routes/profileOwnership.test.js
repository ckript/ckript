// @vitest-environment happy-dom
/*
 * Ownership of a profile must not depend on which URL you arrived by.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * A viewer opened their own profile, the screen canonicalized the URL to the
 * pretty username form, the route re-derived ownership from that new URL, and
 * the owner's workspace was replaced — mid-visit — by a stranger's view of
 * them. Edit, the visibility switches and the inbox all disappeared a second
 * after they appeared.
 *
 * The matcher was not missing a case. It was answering an identity question
 * from a lossy projection of an identity: `getProfileCanonicalPath` lowercases
 * a username, turns spaces into underscores and strips everything that is not
 * `[a-z0-9_]`, and may instead emit an id, a sid, a server-chosen
 * `canonicalPath`, or a segment lifted out of a share link. Reversing any of
 * that back to "is this me?" is a guess.
 *
 * So these are not case tests. The first is a PROPERTY over identity shapes:
 * for every viewer, every URL that names them resolves to the same owner, and
 * canonicalizing cannot change the answer. A new identity shape — a new
 * username rule, a new canonical form — is covered the day it is added to the
 * table, and nothing else has to be remembered.
 */
import { describe, expect, it } from "vitest";
import { isOwnProfileKey, resolveProfileOwnership } from "./mobileRoutePolicy";
import { getProfileCanonicalPath } from "../../utils/profilePath";

/*
 * Identity shapes the app actually produces. Each is one account, described the
 * way the session and the profile document describe it.
 */
const IDENTITIES = [
  ["plain username", { _id: "64ab1", username: "ada" }],
  ["username with a dot", { _id: "64ab2", username: "ada.lovelace" }],
  ["username with a space", { _id: "64ab3", username: "Ada Lovelace" }],
  ["username with a dash", { _id: "64ab4", username: "ada-lovelace" }],
  ["mixed case username", { _id: "64ab5", username: "AdaLovelace" }],
  ["writer profile username only", { _id: "64ab6", writerProfile: { username: "ada.w" } }],
  ["server-chosen canonical path", { _id: "64ab7", username: "ada", canonicalPath: "/ada-l" }],
  ["sid but no username", { _id: "64ab8", sid: "usr-a1b2c3d4" }],
  ["id only", { _id: "64ab9" }],
];

/* The identity segment of a profile URL, however that URL was formed. */
const segmentOf = (path) => String(path).replace(/^\/(profile\/)?/, "");

describe("profile ownership is a property of the person, not of the URL", () => {
  /*
   * THE INVARIANT, and the one that was broken: the app builds a URL for your
   * own profile, so the app must recognise that URL as your own profile. This
   * is the PRE-LOAD half — the hint alone, with no profile to check against —
   * because that is the half canonicalization used to break. Five of these
   * flipped before the hint normalised through the same function that builds
   * the segment.
   *
   * The server-chosen path is excluded because it is genuinely unknowable
   * without the document: the server may name a profile anything. That is not
   * a gap to close in the hint — it is the reason the loaded profile has to be
   * the authority, which the next case pins.
   */
  const derived = IDENTITIES.filter(([name]) => name !== "server-chosen canonical path");

  it.each(derived)("%s: the URL the app builds for me is recognised as mine", (_name, viewer) => {
    const canonicalPath = getProfileCanonicalPath(viewer, {
      viewerId: viewer._id,
      viewerRole: "writer",
    });

    expect(
      resolveProfileOwnership({ viewer, profile: null, urlKey: segmentOf(canonicalPath) }),
      `the hint does not recognise ${canonicalPath}, which is this viewer's own canonical path`,
    ).toBe(true);
  });

  /*
   * And the loaded profile settles it for every shape, including the one the
   * hint cannot answer. This is what makes the answer survive a URL rewrite.
   */
  it.each(IDENTITIES)("%s: the loaded profile settles it whatever the URL says", (_name, viewer) => {
    const canonicalPath = getProfileCanonicalPath(viewer, {
      viewerId: viewer._id,
      viewerRole: "writer",
    });

    expect(
      resolveProfileOwnership({ viewer, profile: viewer, urlKey: segmentOf(canonicalPath) }),
      `${canonicalPath} is this viewer's own canonical profile path`,
    ).toBe(true);
  });

  /*
   * Canonicalization is a URL rewrite, not a change of person. Every form the
   * app can navigate through must agree, or the view flips somewhere in the
   * middle of the redirect chain.
   */
  it.each(IDENTITIES)("%s: every URL form that names me agrees", (_name, viewer) => {
    const canonicalPath = getProfileCanonicalPath(viewer, {
      viewerId: viewer._id,
      viewerRole: "writer",
    });
    const forms = ["", viewer._id, segmentOf(canonicalPath)];

    const answers = forms.map((urlKey) => resolveProfileOwnership({
      viewer,
      profile: viewer,
      urlKey,
    }));

    expect(new Set(answers).size, `disagreement across ${JSON.stringify(forms)}`).toBe(1);
    expect(answers[0]).toBe(true);
  });

  /*
   * The loaded profile outranks the URL, and that ordering IS the fix. Even a
   * URL segment the hint cannot recognise — a server-chosen canonical path, a
   * share-link slug — must not be able to disown the viewer.
   */
  it("lets the loaded profile overrule a URL the hint cannot recognise", () => {
    const viewer = { _id: "64ac1", username: "ada" };

    expect(isOwnProfileKey("a-slug-the-server-chose", viewer)).toBe(false);
    expect(resolveProfileOwnership({
      viewer,
      profile: { _id: "64ac1" },
      urlKey: "a-slug-the-server-chose",
    })).toBe(true);
  });

  it("still says no when the profile really is somebody else's", () => {
    const viewer = { _id: "64ac1", username: "ada" };

    expect(resolveProfileOwnership({
      viewer,
      profile: { _id: "64ac2", username: "mira" },
      urlKey: "mira",
    })).toBe(false);

    // …including when the URL segment happens to look like the viewer's.
    expect(resolveProfileOwnership({
      viewer,
      profile: { _id: "64ac2" },
      urlKey: "ada",
    })).toBe(false);
  });

  /*
   * Before the profile arrives there is nothing but the URL, and the hint is
   * allowed to be a hint. What it may not do is be wrong about the two forms
   * that carry no ambiguity at all.
   */
  it("falls back to the URL only while the profile is unknown", () => {
    const viewer = { _id: "64ac1", username: "ada" };

    expect(resolveProfileOwnership({ viewer, profile: null, urlKey: "" })).toBe(true);
    expect(resolveProfileOwnership({ viewer, profile: null, urlKey: "64ac1" })).toBe(true);
    expect(resolveProfileOwnership({ viewer, profile: null, urlKey: "somebody-else" })).toBe(false);
  });

  it("never claims a profile for a signed-out viewer", () => {
    expect(resolveProfileOwnership({ viewer: null, profile: { _id: "64ac1" }, urlKey: "" })).toBe(false);
    expect(resolveProfileOwnership({ viewer: null, profile: null, urlKey: "" })).toBe(false);
  });
});
