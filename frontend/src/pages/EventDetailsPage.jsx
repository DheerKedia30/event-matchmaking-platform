// One event: date and venue, price, group discount terms and the "Find a group" button.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getEvent } from "../api/eventsApi";
import { categoryInfo } from "../constants";
import { formatDateTime, formatTime, formatPrice, discountedPrice } from "../utils/format";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

export default function EventDetailsPage() {
  const { id } = useParams(); // the number in the URL /events/:id
  const [event, setEvent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setEvent(null);
    setError("");
    getEvent(id)
      .then((data) => !cancelled && setEvent(data.event))
      .catch((err) => !cancelled && setError(err.message || "Could not load this event."));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div>
        <Link to="/" className="back-link">← All events</Link>
        <Notice type="error">{error}</Notice>
      </div>
    );
  }
  if (!event) return <Loader />;

  const cat = categoryInfo(event.category);
  const groupPrice = discountedPrice(event.base_price, event.discount_percent);

  return (
    <div>
      <Link to="/" className="back-link">← All events</Link>

      <div className="details-layout">
        <section className="card details-main">
          <div className={`details-banner cat-${event.category}`}>
            <span className="event-icon big-icon" aria-hidden="true">{cat.icon}</span>
            <span className="chip">{cat.label}</span>
          </div>

          <div className="event-date">{formatDateTime(event.start_time)}</div>
          <h1>{event.name}</h1>
          <p className="muted">{event.description}</p>

          <dl className="details-list">
            <div>
              <dt>When</dt>
              <dd>
                {formatDateTime(event.start_time)} to {formatTime(event.end_time)}
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                {event.venue_name}, {event.venue_address}, {event.venue_city}
              </dd>
            </div>
            <div>
              <dt>Seats left</dt>
              <dd>{event.seats_left}</dd>
            </div>
          </dl>
        </section>

        <aside className="card details-side">
          <div className="muted small">Ticket price</div>
          <div className="big">{formatPrice(event.base_price)}</div>

          <div className="discount-box">
            <div className="gold-text">Group discount: {event.discount_percent}% off</div>
            <div className="small muted">
              Book in a group of {event.discount_min_size} or more and pay{" "}
              <strong className="gold-text">{formatPrice(groupPrice)}</strong> each.
            </div>
          </div>

          <div className="small muted">
            {event.open_groups > 0
              ? `${event.open_groups} group${event.open_groups === 1 ? "" : "s"} open for this event`
              : "No groups yet. Start the first one!"}
          </div>

          {event.has_ended ? (
            <Notice type="info">This event has ended.</Notice>
          ) : (
            <Link to={`/events/${event.id}/groups`} className="btn btn-block">
              Find a group
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
