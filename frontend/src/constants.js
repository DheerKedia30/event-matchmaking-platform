// Choices shown in the profile form. Lowercase on purpose: matching compares them.
export const INTERESTS = [
  "rock", "indie", "metal", "pop", "hip-hop", "edm", "jazz", "classical", "comedy", "theatre",
];
export const LANGUAGES = ["english", "hindi", "marathi", "gujarati", "tamil", "bengali"];
export const GENDERS = ["male", "female", "other"];
export const MIN_AGE = 18;
export const MAX_AGE = 100;

// Event categories: the value the backend uses, the label we show, and an icon.
export const CATEGORIES = [
  { value: "concert", label: "Concert", icon: "🎸" },
  { value: "comedy", label: "Comedy", icon: "🎤" },
  { value: "theatre", label: "Theatre", icon: "🎭" },
];
export const categoryInfo = (value) =>
  CATEGORIES.find((c) => c.value === value) || { value, label: value, icon: "🎟️" };
