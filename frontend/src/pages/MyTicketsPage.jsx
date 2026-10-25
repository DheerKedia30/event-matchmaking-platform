// All the user's confirmed tickets: event, seat, ticket code and who they're sitting with.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { myTickets } from "../api/bookingsApi";
import { formatDateTime, formatPrice } from "../utils/format";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    myTickets()
      .then((d) => setTickets(d.tickets))
      .catch((err) => setError(err.message || "Could not load your tickets."));
  }, []);

  if (error) return <Notice type="error">{error}</Notice>;
  if (!tickets) return <Loader />;

  return (
    <div>
      <h1>My tickets</h1>
      {tickets.length === 0 ? (
        <div className="card empty-state">
          <p className="big">No tickets yet</p>
          <p className="muted">Join a group, book together and your tickets will appear here.</p>
          <Link to="/" className="btn">Browse events</Link>
        </div>
      ) : (
        <div className="ticket-list">
          {tickets.map((t) => (
            <article key={t.code} className="card ticket">
              <div className="ticket-main">
                <div className="event-date">{formatDateTime(t.start_time)}</div>
                <h3>{t.event_name}</h3>
                <div className="small muted">{t.venue_name}, {t.venue_city}</div>
                {t.with_names && <div className="small">Sitting with {t.with_names}</div>}
                <Link to={`/groups/${t.group_id}`} className="small">Open group</Link>
              </div>
              <div className="ticket-stub">
                <div className="small muted">Seat</div>
                <div className="big">{t.row_label}{t.seat_no}</div>
                <div className="ticket-code">{t.code}</div>
                <div className="small muted">Paid {formatPrice(t.paid)}</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
