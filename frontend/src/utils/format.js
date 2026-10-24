// Small helpers to show dates and money the same way everywhere.

// "Sat, 27 Oct · 7:00 pm"
export function formatDateTime(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

// "7:00 pm"
export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

// 1500 -> "₹1,500"   (prices come from the database as text, e.g. "1500.00")
export function formatPrice(value) {
  const n = Number(value);
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// Price per person once the group discount applies
export function discountedPrice(base, percent) {
  return Math.round(Number(base) * (100 - percent)) / 100;
}

// { male_count: 2, female_count: 1, other_count: 0 } -> "2M 1F"
export function genderSummary(group) {
  const parts = [];
  if (group.male_count) parts.push(`${group.male_count}M`);
  if (group.female_count) parts.push(`${group.female_count}F`);
  if (group.other_count) parts.push(`${group.other_count} other`);
  return parts.join(" ") || "-";
}

// "Dheer Kedia" -> "DK"
export function initials(name = "") {
  return name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
