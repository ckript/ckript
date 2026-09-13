import { useState } from "react";
import { isWriterProfileRole } from "../../../../features/profile-pc/profilePolicy";
import { isFilmIndustryProfessionalRole } from "../../../../utils/industryAccess";
import { resolveMediaUrl } from "../../../../utils/mediaUrl";
import {
  checkProfileUsername,
  createOwnProfileDraft,
  INDUSTRY_GENRE_OPTIONS,
  INDUSTRY_ROLE_OPTIONS,
  PROFILE_FORMAT_OPTIONS,
  PROFILE_GENRE_OPTIONS,
  PROFILE_TAG_OPTIONS,
  PROFILE_USERNAME_PATTERN,
} from "../../../../pages/profile/profileEditor";
import Button from "../../../components/buttons/Button";
import InlineMessage from "../../../components/feedback/InlineMessage";
import ChipSelect from "../../../components/forms/ChipSelect";
import FilePicker from "../../../components/forms/FilePicker";
import SelectField from "../../../components/forms/SelectField";
import TextArea from "../../../components/forms/TextArea";
import TextField from "../../../components/forms/TextField";
import Dialog from "../../../components/overlays/Dialog";
import "./ProfileDesk.css";

const representationOptions = [
  { value: "unrepresented", label: "Unrepresented" },
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "manager_and_agent", label: "Manager and agent" },
];

const genderOptions = [
  { value: "", label: "Prefer not to say" },
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non_binary", label: "Non-binary" },
  { value: "self_described", label: "Self-described" },
];

export default function ProfileEditorDialog({
  open,
  profile,
  pending = false,
  uploadPending = false,
  error = "",
  onClose,
  onSave,
  onUpload,
}) {
  const [draft, setDraft] = useState(() => createOwnProfileDraft(profile));
  const [files, setFiles] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [usernameState, setUsernameState] = useState({ state: "current", message: "" });
  const writer = isWriterProfileRole(profile?.role);
  const industry = isFilmIndustryProfessionalRole(profile);
  const currentUsername = String(profile?.writerProfile?.username || "").trim().toLowerCase();

  const set = (key) => (eventOrValue) => {
    const value = eventOrValue?.target ? eventOrValue.target.value : eventOrValue;
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const verifyUsername = async () => {
    const username = String(draft.username || "").trim().toLowerCase();
    if (username === currentUsername) {
      setUsernameState({ state: "current", message: "This is your current username." });
      return true;
    }
    if (!PROFILE_USERNAME_PATTERN.test(username)) {
      setFieldErrors((current) => ({ ...current, username: "Use 3-30 lowercase letters, numbers, or underscores." }));
      return false;
    }
    setUsernameState({ state: "checking", message: "Checking availability…" });
    const result = await checkProfileUsername(username);
    if (!result.ok) {
      setUsernameState({ state: "error", message: result.message });
      return false;
    }
    if (!result.data.available) {
      setUsernameState({ state: "unavailable", message: "That username is already taken." });
      setFieldErrors((current) => ({ ...current, username: "Choose another username." }));
      return false;
    }
    setUsernameState({ state: "available", message: "Username is available." });
    return true;
  };

  const selectImage = async (selected) => {
    const file = selected[0];
    if (!file) return;
    setFiles([file]);
    const result = await onUpload(file);
    if (!result.ok) {
      setFiles([]);
      setFieldErrors((current) => ({ ...current, profileImage: result.message }));
      return;
    }
    setDraft((current) => ({ ...current, profileImage: result.data.profileImage }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if ((writer || industry) && !await verifyUsername()) return;
    const result = await onSave(draft);
    if (!result.ok) {
      setFieldErrors(result.fieldErrors || {});
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={pending || uploadPending ? null : onClose}
      title="Edit your profile"
      description="Identity and professional details shown across Ckript."
      className="ckm-desk__editor"
      footer={(
        <Button type="submit" form="ckm-desk-editor-form" fullWidth pending={pending} disabled={uploadPending}>
          Save profile
        </Button>
      )}
    >
      <form id="ckm-desk-editor-form" className="ckm-desk__editor-form" onSubmit={submit}>
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

        <section>
          <h3>Identity</h3>
          <div className="ckm-desk__editor-photo-row">
            <div className="ckm-desk__editor-photo">
              {draft.profileImage ? <img src={resolveMediaUrl(draft.profileImage)} alt="Profile preview" /> : <span aria-hidden="true">{String(draft.name || "C").charAt(0)}</span>}
            </div>
            <div>
              <FilePicker
                label="Profile photo"
                accept="image/jpeg,image/png,image/webp,image/gif"
                files={files}
                buttonLabel={uploadPending ? "Uploading…" : "Choose photo"}
                disabled={pending || uploadPending}
                error={fieldErrors.profileImage}
                hint="JPEG, PNG, WebP, or GIF · up to 5 MB"
                onSelect={selectImage}
                onRemove={() => setFiles([])}
              />
              {draft.profileImage ? <Button type="button" variant="tertiary" onClick={() => set("profileImage")("")}>Remove current photo</Button> : null}
            </div>
          </div>
          <TextField label="Name" purpose="name" value={draft.name} required error={fieldErrors.name} onChange={set("name")} />
          {(writer || industry) ? (
            <TextField
              label="Username"
              value={draft.username}
              required
              autoCapitalize="none"
              autoCorrect="off"
              error={fieldErrors.username}
              hint={usernameState.message || "3-30 lowercase letters, numbers, or underscores"}
              onBlur={verifyUsername}
              onChange={set("username")}
            />
          ) : null}
          <TextField label="Phone" purpose="tel" value={draft.phone} optional onChange={set("phone")} />
          <TextField label="Date of birth" type="date" value={draft.dateOfBirth} optional onChange={set("dateOfBirth")} />
        </section>

        <section>
          <h3>Location</h3>
          <TextField label="Street" value={draft.addressStreet} optional autoComplete="street-address" onChange={set("addressStreet")} />
          <div className="ckm-desk__editor-grid">
            <TextField label="City" value={draft.addressCity} optional autoComplete="address-level2" onChange={set("addressCity")} />
            <TextField label="State" value={draft.addressState} optional autoComplete="address-level1" onChange={set("addressState")} />
            <TextField label="Postal code" value={draft.addressZipCode} optional autoComplete="postal-code" onChange={set("addressZipCode")} />
            <TextField label="Country" value={draft.addressCountry} optional autoComplete="country-name" onChange={set("addressCountry")} />
          </div>
        </section>

        <section>
          <h3>About</h3>
          <TextArea label="Bio" value={draft.bio} rows={6} required={industry} error={fieldErrors.bio} maxLength={1200} onChange={set("bio")} />
          <TextField label="Skills" value={draft.skills} optional hint="Separate skills with commas" onChange={set("skills")} />
        </section>

        {writer ? (
          <section>
            <h3>Writer profile</h3>
            <SelectField label="Representation" value={draft.representationStatus} options={representationOptions} onChange={set("representationStatus")} />
            {draft.representationStatus !== "unrepresented" ? <TextField label="Agency or representative" value={draft.agencyName} optional onChange={set("agencyName")} /> : null}
            <ChipSelect label="Genres" options={PROFILE_GENRE_OPTIONS} value={draft.genres} multiple onChange={set("genres")} />
            <ChipSelect label="Specialized tags" options={PROFILE_TAG_OPTIONS} value={draft.specializedTags} multiple max={5} error={fieldErrors.specializedTags} onChange={set("specializedTags")} />
            <SelectField label="Gender" value={draft.diversityGender} options={genderOptions} onChange={set("diversityGender")} />
            <TextField label="Ethnicity or nationality" value={draft.diversityEthnicity} optional onChange={set("diversityEthnicity")} />
          </section>
        ) : null}

        {industry ? (
          <section>
            <h3>Professional profile</h3>
            <SelectField label="Role focus" value={draft.subRole} options={INDUSTRY_ROLE_OPTIONS} onChange={set("subRole")} />
            {draft.subRole === "other" ? <TextField label="Other role focus" value={draft.subRoleOther} required error={fieldErrors.subRoleOther} onChange={set("subRoleOther")} /> : null}
            <TextField label="Company" value={draft.company} optional onChange={set("company")} />
            <TextField label="Job title" value={draft.jobTitle} optional onChange={set("jobTitle")} />
            <TextField label="IMDb URL" purpose="url" value={draft.imdbUrl} optional onChange={set("imdbUrl")} />
            <TextField label="LinkedIn URL" purpose="url" value={draft.linkedInUrl} optional onChange={set("linkedInUrl")} />
            <TextField label="Portfolio or company URL" purpose="url" value={draft.otherUrl} optional onChange={set("otherUrl")} />
            <TextArea label="Previous credits" value={draft.previousCredits} rows={5} optional onChange={set("previousCredits")} />
            <TextField label="Investment range" value={draft.investmentRange} optional onChange={set("investmentRange")} />
            <ChipSelect label="Preferred genres" options={INDUSTRY_GENRE_OPTIONS} value={draft.preferredGenres} multiple onChange={set("preferredGenres")} />
            <ChipSelect label="Formats" options={PROFILE_FORMAT_OPTIONS} value={draft.preferredFormats} multiple onChange={set("preferredFormats")} />
          </section>
        ) : null}

        <InlineMessage tone="info" title="Managed separately">
          Guild proof, banking, email, password, sessions, and account deletion remain in Account &amp; security.
        </InlineMessage>
      </form>
    </Dialog>
  );
}
