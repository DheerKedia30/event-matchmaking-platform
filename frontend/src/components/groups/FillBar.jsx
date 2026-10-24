// The gradient progress bar showing how full a group is (e.g. 3 of 5).
export default function FillBar({ count, max }) {
  const pct = Math.min(100, Math.round((count / max) * 100));
  return (
    <div className="fill-bar" role="progressbar" aria-valuenow={count} aria-valuemax={max}>
      <div className="fill-bar-inner" style={{ width: `${pct}%` }} />
    </div>
  );
}
