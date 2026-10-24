// The real home page: hero with search, category chips and the events grid.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listEvents } from "../api/eventsApi";
import { CATEGORIES } from "../constants";
import EventCard from "../components/events/EventCard";
import Loader from "../components/shared/Loader";
import Notice from "../components/shared/Notice";

export default function HomePage() {
  const { dbUser } = useAuth();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(""); // "" = All
  const [events, setEvents] = useState(null);   // null = still loading
  const [error, setError] = useState("");

  // Reload the list whenever the search text or category changes.
  // We wait 300 ms after the last key press so we don't call the server on every letter.
  useEffect(() => {
    let cancelled = false; // ignore an old reply if a newer search started
    const timer = setTimeout(async () => {
      try {
        setError("");
        const data = await listEvents({ q: q.trim(), category });
        if (!cancelled) setEvents(data.events);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load events.");
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, category]);

  return (
    <div>
      <section className="hero">
        <p className="hero-kicker">Hi {dbUser.name.split(" ")[0]}, going somewhere?</p>
        <h1 className="hero-title">Never go to a show alone again.</h1>
        <p className="hero-sub">
          Find people heading to the same event, book together and save with group discounts.
        </p>
        <input
          className="hero-search"
          type="search"
          placeholder="Search events, e.g. rock, comedy, Grand Arena"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search events"
        />
      </section>

      {!dbUser.phone_verified && (
        <Notice type="info">
          Your phone isn't verified yet, so you can browse but not join groups.{" "}
          <Link to="/signup">Verify now</Link>
        </Notice>
      )}

      <div className="chip-select category-chips">
        <button
          className={`chip-option ${category === "" ? "active" : ""}`}
          onClick={() => setCategory("")}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`chip-option ${category === c.value ? "active" : ""}`}
            onClick={() => setCategory(c.value)}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {error && <Notice type="error">{error}</Notice>}

      {!error && events === null && <Loader />}

      {events && events.length === 0 && (
        <div className="empty-state">
          <p className="big">No events found</p>
          <p className="muted">Try a different word or pick another category.</p>
        </div>
      )}

      {events && events.length > 0 && (
        <div className="event-grid">
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
