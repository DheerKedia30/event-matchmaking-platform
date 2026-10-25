// Before a booking exists: the group creator picks one seat per member, then
// holds them. Everyone else sees who still has to lock in / that the creator is choosing.
import { useState } from "react";
import { Link } from "react-router-dom";
import { startBooking } from "../../api/bookingsApi";
import { formatPrice } from "../../utils/format";
import SeatGrid from "./SeatGrid";
import Notice from "../shared/Notice";

export default function ChooseSeats({ data, groupId, onStarted }) {
  const { members, price, event, group } = data;
  const n = members.length;
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const notLocked = members.filter((m) => !m.is_locked_in);
  const canChoose = data.is_creator && data.all_locked_in && n >= data.min_group_to_book;

  function toggle(seatId) {
    setError("");
    setSelected((s) => (s.includes(seatId) ? s.filter((x) => x !== seatId) : [...s, seatId]));
  }

  async function hold() {
    setBusy(true);
    setError("");
    try {
      await startBooking(groupId, selected);
      await onStarted();
    } catch (err) {
      setError(err.message);
      setSelected([]);
      await onStarted(); // reload: the seat map now shows what was just taken
    } finally {
      setBusy(false);
    }
  }

  // Seat label for the summary, e.g. "A1, C5"
  const labels = data.seat_map
    .filter((s) => selected.includes(s.id))
    .map((s) => `${s.row_label}${s.seat_no}`);

  return (
    <div className="booking-layout">
      <section className="card">
        <h3>{canChoose ? `Choose ${n} seats` : "Seats"}</h3>
        <p className="small muted">
          {canChoose
            ? `Tap ${n} free seats, one for each member. They don't have to be next to each other.`
            : "Free seats for this show right now."}
        </p>
        <SeatGrid
          seatMap={data.seat_map}
          selectable={canChoose}
          selected={selected}
          max={n}
          onToggle={toggle}
        />
      </section>

      <section className="card booking-side">
        <h3>Before booking</h3>
        <ul className="pay-list">
          {members.map((m) => (
            <li key={m.id}>
              <span>
                {m.name}
                {m.id === group.creator_id && <span className="muted small"> (creator)</span>}
              </span>
              <span className={`chip tiny ${m.is_locked_in ? "chip-green" : "gold"}`}>
                {m.is_locked_in ? "Locked in" : "Not locked in"}
              </span>
            </li>
          ))}
        </ul>

        {n < data.min_group_to_book && (
          <Notice type="info">You need at least {data.min_group_to_book} members to book.</Notice>
        )}
        {notLocked.length > 0 && n >= data.min_group_to_book && (
          <Notice type="info">
            Everyone must lock in before seats can be chosen. Waiting for{" "}
            <strong>{notLocked.map((m) => m.name).join(", ")}</strong>.{" "}
            <Link to={`/groups/${groupId}`}>Go to group</Link>
          </Notice>
        )}
        {!data.is_creator && data.all_locked_in && n >= data.min_group_to_book && (
          <Notice type="success">
            Everyone's locked in! Waiting for <strong>{group.creator_name}</strong> to choose the seats.
            This page updates by itself.
          </Notice>
        )}

        <dl className="price-list">
          <div><dt>Ticket price</dt><dd>{formatPrice(price.base_price)} × {n}</dd></div>
          {price.discount_applied ? (
            <div className="green-text"><dt>Group discount ({price.discount_percent}%)</dt><dd>applied</dd></div>
          ) : (
            <div className="muted"><dt>Group discount</dt><dd>needs {event.discount_min_size}+ people</dd></div>
          )}
          <div className="price-each"><dt>Each person pays</dt><dd className="gold-text">{formatPrice(price.per_person)}</dd></div>
        </dl>

        {canChoose && (
          <div className="pay-box">
            <div className="small">
              Chosen: <strong>{selected.length} of {n}</strong>
              {labels.length > 0 && <span className="gold-text"> · {labels.join(", ")}</span>}
            </div>
            {error && <Notice type="error">{error}</Notice>}
            <button className="btn btn-block" disabled={busy || selected.length !== n} onClick={hold}>
              {busy ? "Holding seats..." : `Hold these ${n} seats`}
            </button>
            <p className="small muted">
              Seats are held for {data.payment_window_min} minutes while everyone pays. The group is then
              locked: nobody can join or leave.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
