// A small line icon for each event category: music note, microphone, theatre mask.
// It uses "currentColor", so the colour comes from the CSS around it.
export default function CategoryIcon({ category, size = 28 }) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (category === "comedy") {
    // microphone
    return (
      <svg {...common}>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
      </svg>
    );
  }
  if (category === "theatre") {
    // theatre mask
    return (
      <svg {...common}>
        <path d="M4 5c5 2 11 2 16 0v6a8 8 0 0 1-16 0z" />
        <path d="M8.5 10h1.5M14 10h1.5M9 14.5c1.8 1.5 4.2 1.5 6 0" />
      </svg>
    );
  }
  // concert (and anything else): music note
  return (
    <svg {...common}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}
