// The seat map: one row of seats per letter.
// View mode:   your group's seats are gold, your own seat is solid gold, others' are dimmed.
// Choose mode: (selectable=true) the group creator clicks free seats to pick them.
export default function SeatGrid({ seatMap, mySeatId, selectable = false, selected = [], max = 0, onToggle }) {
  const rows = {};
  for (const s of seatMap) (rows[s.row_label] ||= []).push(s);
  const full = selected.length >= max;

  return (
    <div className="seat-grid" aria-label="Seat map">
      <div className="stage">STAGE</div>
      {Object.entries(rows).map(([row, seats]) => (
        <div key={row} className="seat-row">
          <span className="row-label">{row}</span>
          {seats.map((s) => {
            const label = `${row}${s.seat_no}`;
            const isPicked = selected.includes(s.id);
            const free = s.status === "available";

            if (selectable) {
              let cls = "seat seat-btn";
              if (isPicked) cls += " seat-me";
              else if (!free) cls += " seat-taken";
              return (
                <button
                  key={s.id}
                  type="button"
                  className={cls}
                  disabled={!free || (full && !isPicked)}
                  aria-pressed={isPicked}
                  title={free ? label : `${label} (taken)`}
                  onClick={() => onToggle(s.id)}
                >
                  {s.seat_no}
                </button>
              );
            }

            let cls = "seat";
            if (s.ours) cls += s.id === mySeatId ? " seat-me" : " seat-ours";
            else if (!free) cls += " seat-taken";
            return (
              <span key={s.id} className={cls} title={`${label}${s.ours ? " (your group)" : ""}`}>
                {s.seat_no}
              </span>
            );
          })}
        </div>
      ))}
      <div className="seat-legend small muted">
        {selectable ? (
          <>
            <span><i className="seat seat-me" /> Chosen</span>
            <span><i className="seat" /> Free</span>
            <span><i className="seat seat-taken" /> Taken</span>
          </>
        ) : (
          <>
            <span><i className="seat seat-me" /> You</span>
            <span><i className="seat seat-ours" /> Your group</span>
            <span><i className="seat" /> Free</span>
            <span><i className="seat seat-taken" /> Taken</span>
          </>
        )}
      </div>
    </div>
  );
}
