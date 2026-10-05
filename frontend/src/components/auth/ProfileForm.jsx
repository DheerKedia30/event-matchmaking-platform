// Used twice: at signup (step 2) and on the Profile page (editing).
import { useState } from "react";
import ChipSelect from "../shared/ChipSelect";
import Notice from "../shared/Notice";
import { INTERESTS, LANGUAGES, GENDERS, MIN_AGE, MAX_AGE } from "../../constants";

export default function ProfileForm({
  initial,
  onSubmit,
  submitLabel,
  requireConsent = false,
  busy = false,
  error = "",
}) {
  // One useState per field. "initial" lets the Profile page pre-fill the form.
  const [name, setName] = useState(initial?.name || "");
  const [age, setAge] = useState(initial?.age ?? "");
  const [gender, setGender] = useState(initial?.gender || "");
  const [languages, setLanguages] = useState(initial?.languages || ["english"]);
  const [interests, setInterests] = useState(initial?.interests || []);
  const [consent, setConsent] = useState(!requireConsent);
  const [localError, setLocalError] = useState("");

  function handleSubmit(e) {
    e.preventDefault(); // stop the browser from reloading the page
    setLocalError("");

    const ageNum = Number(age);
    if (name.trim().length < 2) return setLocalError("Enter your name.");
    if (!Number.isInteger(ageNum) || ageNum < MIN_AGE || ageNum > MAX_AGE)
      return setLocalError(`Age must be between ${MIN_AGE} and ${MAX_AGE}.`);
    if (!gender) return setLocalError("Choose a gender option.");
    if (languages.length === 0) return setLocalError("Pick at least one language.");
    if (interests.length === 0) return setLocalError("Pick at least one interest.");
    if (!consent) return setLocalError("Please tick the consent box to continue.");

    onSubmit({ name: name.trim(), age: ageNum, gender, languages, interests, consent: true });
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>

      <label className="field">
        <span>Age</span>
        <input type="number" value={age} onChange={(e) => setAge(e.target.value)} />
      </label>

      <div className="field">
        <span>Gender</span>
        <ChipSelect options={GENDERS} value={gender} onChange={setGender} multiple={false} />
      </div>

      <div className="field">
        <span>Languages you speak</span>
        <ChipSelect options={LANGUAGES} value={languages} onChange={setLanguages} />
      </div>

      <div className="field">
        <span>Your interests</span>
        <ChipSelect options={INTERESTS} value={interests} onChange={setInterests} />
      </div>

      {requireConsent && (
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree to share my age, gender, languages and interests so I can be matched with
            other people attending the same events.
          </span>
        </label>
      )}

      {(localError || error) && <Notice type="error">{localError || error}</Notice>}

      <button className="btn" disabled={busy}>
        {busy ? "Please wait..." : submitLabel}
      </button>
    </form>
  );
}
