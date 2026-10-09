import { useEffect, useRef, useState } from "react";
import GoogleSignInButton from "../../../../components/GoogleSignInButton";
import "./AuthControls.css";

/*
 * AuthGoogleSlot — the row Google's own button sits in.
 *
 * WHY THIS IS NOT JUST A <div> WITH A BORDER, WHICH IS WHAT IT WAS.
 *
 * Google renders its button itself, inside its own iframe-backed markup, and
 * none of its chrome can be reached from our stylesheet: 40px tall, 4px corner,
 * its own 1px #dadce0 border, its own Google Sans. The first version of this
 * screen tried to make it belong by drawing a 50px, 13px-corner, 1px #e4e4e6
 * frame around it — which produced exactly what it sounds like. A white
 * rounded box inside a white rounded box, two borders, two radii, and fifteen
 * pixels of dead air on each side where the 320px button failed to reach the
 * edge of the 335px column.
 *
 * A slot cannot make a third-party button belong. It can only stop competing
 * with it. So the frame is gone and this element is now nothing but a
 * measurement: Google accepts a `width` in pixels, and handing it the real
 * column width is the only lever that exists for making its button line up with
 * the actions above it.
 *
 * WHAT THIS STILL CANNOT FIX, STATED PLAINLY: the button remains 40px tall with
 * a 4px corner beside our 50px, 13px-corner actions, and it is set in Google
 * Sans. That is the cost of the ID-token flow — `GoogleLogin` is the only
 * control Google will mint a `credential` from, and the server's
 * `POST /auth/google` takes a credential. A button that actually matched this
 * family would mean moving to the auth-code flow and exchanging the code
 * server-side, which is a backend change, not a CSS one.
 */

/* Google caps the rendered width at 400px and ignores anything larger. */
const GOOGLE_MAX_WIDTH = 400;
const GOOGLE_MIN_WIDTH = 200;

export default function AuthGoogleSlot({ onSuccess, onError, text = "continue_with" }) {
  const slotRef = useRef(null);
  const [width, setWidth] = useState(0);

  /* The column is fluid — 280px at 320, 390px at 430 — so the width is measured
     rather than assumed, and re-measured when the frame changes (rotation, a
     tablet split view, the browser's own chrome collapsing). */
  useEffect(() => {
    const node = slotRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth(Math.min(Math.max(next, GOOGLE_MIN_WIDTH), GOOGLE_MAX_WIDTH));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ckm-auth__google" ref={slotRef}>
      {/* Rendered only once the width is known. Google reads it at mount and
          does not re-read it, so mounting at a guessed width and correcting
          afterwards would leave the button permanently the wrong size. */}
      {width > 0 && (
        <GoogleSignInButton
          text={text}
          width={width}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
    </div>
  );
}
