// One event in the home page grid. The whole card is a link to its details page.
import { Link } from "react-router-dom";
import { categoryInfo } from "../../constants";
import { formatDateTime, formatPrice } from "../../utils/format";

export default function EventCard({ event }) {
  const cat = categoryInfo(event.category);

  return (
    <Link to={`/events/${event.id}`} className="event-card">
      <div className={`event-card-head cat-${event.category}`}>
        <span className="event-icon" aria-hidden="true">{cat.icon}</span>
        <span className="chip">{cat.label}</span>
      </div>

      <div className="event-card-body">
        <div className="event-date">{formatDateTime(event.start_time)}</div>
        <h3 className="event-title">{event.name}</h3>
        <div className="muted small">{event.venue_name}, {event.venue_city}</div>

        <div className="event-price-row">
          <span className="event-price">{formatPrice(event.base_price)}</span>
          <span className="chip gold">
            {event.discount_percent}% off for {event.discount_min_size}+
          </span>
        </div>

        <div className="event-groups small">
          {event.has_ended
            ? "This event has ended"
            : event.open_groups > 0
              ? `${event.open_groups} group${event.open_groups === 1 ? "" : "s"} open`
              : "Be the first to start a group"}
        </div>
      </div>
    </Link>
  );
}
