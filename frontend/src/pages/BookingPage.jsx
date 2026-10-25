// Booking & payment for one group.
//  - before booking: the creator chooses seats (once everyone has locked in)
//  - while held: countdown, seat map, price split, who has paid, Pay button
//  - confirmed: ticket codes
// It updates live when members lock in or pay (Socket.IO), and has a floating
// group chat so members can talk while choosing seats and paying.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getBooking, payShare } from "../api/bookingsApi";
import { useGroupLive } from "../hooks";
import { formatDateTime, formatPrice } from "../utils/format";
import SeatGrid from "../components/booking/SeatGrid";
import ChooseSeats from "../components/booking/ChooseSeats";
import FloatingChat from "../components/chat/FloatingChat";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

// 125 -> "2:05"
const mmss = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

// The chat is mounted ONCE here (not inside each view), so it stays open when
// the page switches from "choose seats" to "pay" to "confirmed".
export default function BookingPage() {
  const { id } = useParams(); // group id
  const { dbUser } = useAuth();
  return (
    <>
      <BookingContent id={id} />
      <FloatingChat groupId={Number(id)} meId={dbUser.id} />
    </>
  );
}

function BookingContent({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [payError, setPayError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [left, setLeft] = useState(0); // seconds left to pay

  const load = useCallback(async () => {
    try {
      const d = await getBooking(id);
      setData(d);
      if (d.booking) setLeft(d.booking.seconds_left);
    } catch (err) {
      setError(err.message || "Could not load the booking.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: someone paid / the booking was confirmed or expired
  useGroupLive(id, load);

  // Countdown, ticking every second. When it reaches 0, ask the server again
  // (the server expires the booking, frees seats and refunds).
  const held = data?.booking?.status === "held";
  useEffect(() => {
    if (!held) return;
    const t = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setTimeout(load, 1500);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [held, load]);

  async function pay(simulate) {
    setBusy(true);
    setPayError("");
    try {
      await payShare(data.booking.id, simulate);
      await load();
    } catch (err) {
      setPayError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div>
        <Link to={`/groups/${id}`} className="back-link">← Back to group</Link>
        <Notice type="error">{error}</Notice>
      </div>
    );
  }
  if (!data) return <Loader />;

  const { booking, event, price, payments, my_payment: myPay, my_seat: mySeat, tickets } = data;
  const paidCount = payments.filter((p) => p.status === "paid").length;

  // Event cancelled by the organiser: nothing more to do
  if (booking?.status === "cancelled" || event.status === "cancelled") {
    return (
      <div>
        <Link to={`/groups/${id}`} className="back-link">← Back to group</Link>
        <div className="card booking-empty">
          <h1>Event cancelled</h1>
          <Notice type="error">The organiser cancelled this event. Everyone who paid has been refunded.</Notice>
          <Link to="/" className="btn">Browse other events</Link>
        </div>
      </div>
    );
  }

  // No booking yet (or the last one expired): choose seats
  if (!booking || booking.status === "expired") {
    return (
      <div>
        <Link to={`/groups/${id}`} className="back-link">← Back to group</Link>
        <header className="card room-header">
          <div>
            <div className="event-date">{formatDateTime(event.start_time)} · {event.venue_name}</div>
            <h1>{data.is_creator ? "Choose your group's seats" : "Booking"}</h1>
            <div className="small muted">{event.name} · {data.members.length} people</div>
          </div>
        </header>
        {booking?.status === "expired" && (
          <Notice type="error">
            The last booking ran out of time, so its seats were released and anyone who paid was refunded
            in full. You can book again below.
          </Notice>
        )}
        <ChooseSeats data={data} groupId={id} onStarted={load} />
      </div>
    );
  }

  const confirmed = booking.status === "confirmed";
  const urgent = left <= 60;

  return (
    <div>
      <Link to={`/groups/${id}`} className="back-link">← Back to group</Link>

      <header className="card room-header">
        <div className="room-header-top">
          <div>
            <div className="event-date">{formatDateTime(event.start_time)} · {event.venue_name}</div>
            <h1>{confirmed ? "You're all booked!" : "Book your seats"}</h1>
            <div className="small muted">{event.name} · {payments.length} people</div>
          </div>
          {confirmed ? (
            <span className="chip status-chip status-booked">Confirmed</span>
          ) : (
            <div className={`countdown ${urgent ? "urgent" : ""}`} aria-live="polite">
              <span className="small">Seats held for</span>
              <strong>{mmss(left)}</strong>
            </div>
          )}
        </div>
      </header>

      <div className="booking-layout">
        <section className="card">
          <h3>Your seats</h3>
          <p className="small muted">
            Seats {data.seats.map((s) => `${s.row_label}${s.seat_no}`).join(", ")}
            {mySeat && (
              <>
                {" "}· your seat is <strong className="gold-text">{mySeat.row_label}{mySeat.seat_no}</strong>
              </>
            )}
          </p>
          <SeatGrid seatMap={data.seat_map} mySeatId={mySeat?.id} />
        </section>

        <section className="card booking-side">
          <h3>Price</h3>
          <dl className="price-list">
            <div><dt>Ticket price</dt><dd>{formatPrice(price.base_price)} × {payments.length}</dd></div>
            {price.discount_applied ? (
              <div className="green-text"><dt>Group discount ({price.discount_percent}%)</dt><dd>− {formatPrice(booking.discount)}</dd></div>
            ) : (
              <div className="muted"><dt>Group discount</dt><dd>needs {event.discount_min_size}+ people</dd></div>
            )}
            <div className="price-total"><dt>Total</dt><dd>{formatPrice(booking.total)}</dd></div>
            <div className="price-each"><dt>Each person pays</dt><dd className="gold-text">{formatPrice(price.per_person)}</dd></div>
          </dl>

          <h3>Payments <span className="muted small">({paidCount} of {payments.length} paid)</span></h3>
          <ul className="pay-list">
            {payments.map((p) => (
              <li key={p.user_id}>
                <span>{p.name}{p.user_id === myPay?.user_id && <span className="muted small"> (you)</span>}</span>
                <span className={`chip tiny ${p.status === "paid" ? "chip-green" : p.status === "refunded" ? "" : "gold"}`}>
                  {p.status === "paid" ? "Paid" : p.status === "refunded" ? "Refunded" : "Waiting"}
                </span>
              </li>
            ))}
          </ul>

          {confirmed && (
            <div className="ticket-box">
              <div className="small muted">Your ticket code</div>
              <div className="ticket-code">
                {tickets.find((t) => t.user_id === myPay?.user_id)?.code}
              </div>
              <Link to="/tickets" className="btn btn-block">Open My tickets</Link>
            </div>
          )}

          {!confirmed && myPay?.status === "paid" && (
            <Notice type="success">
              You've paid. Waiting for the others: tickets are issued as soon as everyone has paid.
            </Notice>
          )}

          {!confirmed && myPay?.status === "pending" && (
            <div className="pay-box">
              <label className="consent">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>
                  I understand my payment is <strong>non-refundable</strong>. I only get it back
                  automatically if the group doesn't finish paying in time or the event is cancelled.
                </span>
              </label>
              {payError && <Notice type="error">{payError}</Notice>}
              <button className="btn btn-block" disabled={busy || !agreed || left === 0} onClick={() => pay("success")}>
                {busy ? "Processing..." : `Pay ${formatPrice(myPay.amount)}`}
              </button>
              <button className="link-btn" disabled={busy || !agreed || left === 0} onClick={() => pay("fail")}>
                Simulate a declined card
              </button>
              <p className="small muted">Payments use a simulated gateway: no real money is charged.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
