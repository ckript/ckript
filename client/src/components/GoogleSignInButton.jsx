import { useContext, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { AuthContext } from "../context/AuthContext";

/**
 * Sign-in / sign-up button that hands a Google ID token to our backend
 * (`POST /auth/google`). New users are created as writers/creators.
 *
 * Props:
 *   onSuccess(userData)  – called after the backend exchange succeeds
 *   onError(message)     – called for any failure (Google popup or backend)
 *   referralCode         – optional referral code to attach when creating a new user
 *   text                 – "signin_with" | "signup_with" | "continue_with" (default)
 *   disabled             – disables click handling
 *   width                – rendered button width in px (Google caps this at 400).
 *                          Defaults to the 320 the desktop surfaces have always
 *                          used. Google renders its own button and nothing about
 *                          its chrome can be styled from outside, so a caller
 *                          whose column is not 320px wide has no way to stop it
 *                          floating in the middle of one — passing the real
 *                          width is the only way to make it fill its place.
 */
export default function GoogleSignInButton({
  onSuccess,
  onError,
  referralCode = "",
  role = "",
  text = "continue_with",
  disabled = false,
  width = 320,
}) {
  const { googleSignIn } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);

  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || "";
  if (!googleClientId) {
    // Render a clear fallback in dev so misconfiguration is obvious.
    return (
      <div className="w-full px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs">
        Google sign-in isn’t configured. Set <code>VITE_GOOGLE_OAUTH_CLIENT_ID</code>.
      </div>
    );
  }

  const handleCredential = async (response) => {
    const credential = response?.credential;
    if (!credential) {
      onError?.("Google did not return a credential. Please try again.");
      return;
    }
    setBusy(true);
    try {
      const data = await googleSignIn(credential, { referralCode, role });
      onSuccess?.(data);
    } catch (err) {
      const data = err?.response?.data;
      const msg = data?.message || err?.message || "Google sign-in failed.";
      onError?.(msg, data || {}, credential);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`w-full flex justify-center ${disabled || busy ? "opacity-60 pointer-events-none" : ""}`}>
      <GoogleLogin
        onSuccess={handleCredential}
        onError={() => onError?.("Google sign-in was cancelled or failed.")}
        text={text}
        size="large"
        shape="rectangular"
        width={String(width)}
      />
    </div>
  );
}
