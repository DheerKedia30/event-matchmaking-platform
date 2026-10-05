import { useEffect, useState } from "react";

// Where the backend lives. Read from the .env file, with a safe default.
const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

// The three checks we want to run, and which backend URL answers each
const CHECKS = [
  { label: "Backend (Node)", path: "/health" },
  { label: "Database (PostgreSQL)", path: "/health/db" },
  { label: "Matchmaking (Python)", path: "/health/matchmaking" },
];

export default function App() {
  // results looks like: { "/health": "ok", "/health/db": "error", ... }
  const [results, setResults] = useState({});

  // useEffect with [] runs ONCE, when the page first loads
  useEffect(() => {
    CHECKS.forEach(async ({ path }) => {
      let status = "error";
      try {
        const res = await fetch(API + path);
        const data = await res.json();
        status = data.status === "ok" ? "ok" : "error";
      } catch {
        status = "error"; // backend not running / network problem
      }
      setResults((prev) => ({ ...prev, [path]: status }));
    });
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "60px auto" }}>
      <h1>Event Matchmaking Platform</h1>
      <p>Checkpoint 0: is everything connected?</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {CHECKS.map(({ label, path }) => {
          const s = results[path];
          const text = s === "ok" ? "OK" : s === "error" ? "NOT WORKING" : "checking...";
          const color = s === "ok" ? "green" : s === "error" ? "crimson" : "gray";
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
