import { useContext, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { resolvePostAuthPath } from "../../../routing/audienceTransitions";
import { AUTH_SHELL_MODE, readReturnPath, withReturnPath } from "./authChrome";
import { AUTH_ROLES } from "./authModel";
import AuthSurface, { AuthHead, AuthNav } from "./ios/AuthSurface";
import { AuthCard, AuthNote, AuthNotice } from "./ios/AuthControls";
import { AUTH_STILL, onImageMissing } from "./ios/authArt";

/*
 * RoleChooserMobile — /join (Phase 8, D59; iOS redesign).
 *
 * The one auth screen that is a choice rather than a form, and therefore the
 * one that keeps the photograph: there is no keyboard competing for the space,
 * and the decision benefits from some atmosphere. Every other screen in the
 * family is type only.
 *
 * The role is a real decision with consequences the person cannot see — it sets
 * which workspace they land in, what they can upload, and (for producers) an
 * approval step — so each row states what the account is FOR in the second
 * person, rather than naming a job title and hoping.
 *
 * `?email=` arrives when Google refused a sign-in because no account exists
 * yet. Carrying it through means the flow does not ask for an email it was
 * just given.
 */

const TITLE_ID = "ckm-join-title";

const ROLE_ICON = {
  writer: "edit_note",
  producer: "movie",
  industry: "corporate_fare",
};

/* The second line each row carries. `detail` on the catalogue entry is written
   for a screen with more room; these are the phone's version of the same
   sentence, and they live beside the icon map for the same reason it does. */
const ROLE_LINE = {
  writer: "You write. You want it read.",
  producer: "You option, finance or direct.",
  industry: "Studio, agency or production house.",
};

export default function RoleChooserMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useContext(AuthContext);

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnPath = useMemo(() => readReturnPath(location.search), [location.search]);
  const prefillEmail = String(params.get("email") || "").trim();

  /* Signed in already — nothing here applies. Send them where they belong
     rather than to a chooser for an account they have. */
  useEffect(() => {
    if (!loading && user) {
      navigate(resolvePostAuthPath({ requestedPath: returnPath, user }), { replace: true });
    }
  }, [loading, user, returnPath, navigate]);

  const signUpPath = (roleKey) => {
    const query = new URLSearchParams({ as: roleKey });
    if (prefillEmail) query.set("email", prefillEmail);
    const referral = params.get("ref") || params.get("referral") || params.get("referralCode");
    if (referral) query.set("ref", referral);
    return withReturnPath(`/signup?${query.toString()}`, returnPath);
  };

  return (
    <AuthSurface
      screenId="role-chooser"
      mode={AUTH_SHELL_MODE}
      labelledBy={TITLE_ID}
      flush
      nav={(
        <AuthNav
          glass
          back={{ label: "Back", to: "/" }}
          title="Join Ckript"
          action={{ close: true, label: "Back to Ckript", to: "/" }}
        />
      )}
    >
      <AuthHead
        eyebrow="Join Ckript"
        title="How do you work?"
        lede="This sets your workspace. Pick the closest fit."
        titleId={TITLE_ID}
        tight
      />

      {prefillEmail && (
        <AuthNotice title="Almost there">
          {`There's no Ckript account for ${prefillEmail} yet. Pick how you work and we'll set one up.`}
        </AuthNotice>
      )}

      {/* A list, because it is one: three alternatives of equal weight. The
          count is worth announcing before someone commits to reading them. */}
      <AuthCard panel>
        <ul className="ckm-auth__roles">
          {AUTH_ROLES.filter(r => r.key !== 'industry').map((role) => (
            <li key={role.key}>
              <Link className="ckm-auth__role" to={signUpPath(role.key)}>
                <span className="ckm-auth__role-icon material-symbols-outlined" aria-hidden="true">
                  {ROLE_ICON[role.key]}
                </span>
                <span className="ckm-auth__row-text">
                  <span className="ckm-auth__row-title ckm-auth__row-title--strong">{role.title}</span>
                  <span className="ckm-auth__row-detail">{ROLE_LINE[role.key] || role.detail}</span>
                </span>
                <span className="ckm-auth__chevron material-symbols-outlined" aria-hidden="true">
                  chevron_right
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </AuthCard>

      <AuthNote>Your role can only be changed by our team later.</AuthNote>

      {/*
        * The prototype puts two counters over this still. They are not shipped:
        * the numbers in the mock are invented, and no endpoint on this screen
        * knows the real ones — a fabricated metric on the screen where someone
        * decides to join is the one place it would matter most. The still keeps
        * its place and says something true instead.
        */}
      <figure className="ckm-auth__still">
        <img src={AUTH_STILL.onSet} alt="" loading="lazy" draggable={false} onError={onImageMissing} />
        <figcaption className="ckm-auth__still-caption">
          <span className="ckm-auth__still-kicker">Ckript</span>
          <span className="ckm-auth__still-line">Where stories become films.</span>
        </figcaption>
      </figure>

      <p className="ckm-auth__alt">
        Already have an account?{" "}
        <Link className="ckm-auth__link" to={withReturnPath("/login", returnPath)}>Sign in</Link>
      </p>
    </AuthSurface>
  );
}
