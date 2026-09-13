/*
 * authArt — the stills the account-entry screens use.
 *
 * The same source `RoleChooserMobile` already loaded before D59's redesign, so
 * this is a move rather than a new dependency. They are named and held here
 * because two screens now share them and a URL repeated in two files drifts.
 *
 * `onImageMissing` hides a still that fails rather than leaving a broken frame:
 * these are decorative, the screen reads correctly without them, and the
 * checkerboard beneath is the placeholder the design already draws.
 */

export const AUTH_STILL = Object.freeze({
  onSet: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=80",
  screeningRoom: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80",
});

export function onImageMissing(event) {
  event.target.style.display = "none";
}
