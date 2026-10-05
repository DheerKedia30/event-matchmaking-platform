// The Checkpoint 0 health check, kept at /status for debugging.
import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const CHECKS = [
  { label: "Backend (Node)", path: "/health" },
  { label: "Database (PostgreSQL)", path: "/health/db" },
  { label: "Matchmaking (Python)", path: "/health/matchmaking" },
];

export default function StatusPage() {
  const [results, setResults] = useState({});

  useEffect(() => {
    CHECKS.forEach(async ({ path }) => {
      let status = "error";
      try {
        const res = await fetch(API + path);
        const data = await res.json();
        status = data.status === "ok" ? "ok" : "error";
      } catch {
        status = "error";
      }
      setResults((prev) => ({ ...prev, [path]: status }));
    });
  }, []);

  return (
    <div>
      <h1>System status</h1>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {CHECKS.map(({ label, path }) => {
          const s = results[path];
          const text = s === "ok" ? "OK" : s === "error" ? "NOT WORKING" : "checking...";
          const color = s === "ok" ? "var(--green)" : s === "error" ? "var(--red)" : "var(--muted)";
          return (
            <li key={path} style={{ padding: "8px 0", fontSize: 18 }}>
              {label}: <b style={{ color }}>{text}</b>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
