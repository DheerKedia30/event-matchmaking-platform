// A row of clickable pills. multiple=true: pick many (value is an array).
// multiple=false: pick exactly one (value is a string).
export default function ChipSelect({ options, value, onChange, multiple = true }) {
  const isSelected = (opt) => (multiple ? value.includes(opt) : value === opt);

  function toggle(opt) {
    if (!multiple) return onChange(opt);
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }

  return (
    <div className="chip-select">
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          className={"chip-option" + (isSelected(opt) ? " active" : "")}
          onClick={() => toggle(opt)}
        >
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}
