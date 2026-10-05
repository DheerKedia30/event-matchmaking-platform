-- ============================================================
-- Event Matchmaking & Shared Group Ticket Pass - database schema
-- Safe to run many times: it drops everything and recreates it.
-- (Fine for development. We never do this on real user data.)
-- ============================================================

DROP TABLE IF EXISTS notifications, support_tickets, ratings, tickets, payments,
  booking_seats, bookings, messages, group_members, groups, seats, events,
  venues, users CASCADE;

-- ---------- USERS ----------
CREATE TABLE users (
  id                SERIAL PRIMARY KEY,
  firebase_uid      TEXT UNIQUE NOT NULL,      -- id given by Firebase Auth
  name              TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  phone             TEXT,
  phone_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  gender            TEXT CHECK (gender IN ('male','female','other')),
  age               INT,
  languages         TEXT[] NOT NULL DEFAULT '{}',
  interests         TEXT[] NOT NULL DEFAULT '{}',
  trust_score       INT NOT NULL DEFAULT 30 CHECK (trust_score >= 0),
  avg_peer_rating   NUMERIC(2,1),              -- 1.0 to 5.0, empty until rated
  blocked_until     TIMESTAMPTZ,               -- empty = not blocked
  consent_at        TIMESTAMPTZ,               -- when they accepted data consent
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- VENUES & EVENTS ----------
CREATE TABLE venues (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  city      TEXT NOT NULL,
  address   TEXT
);

CREATE TABLE events (
  id                  SERIAL PRIMARY KEY,
  venue_id            INT NOT NULL REFERENCES venues(id),
  name                TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL,           -- e.g. concert, comedy, theatre
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL,
  base_price          NUMERIC(10,2) NOT NULL,  -- price per ticket
  discount_min_size   INT NOT NULL DEFAULT 3,  -- group size needed for discount
  discount_percent    INT NOT NULL DEFAULT 10, -- % off when discount applies
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  CHECK (end_time > start_time)
);

-- ---------- SEATS (a grid per event) ----------
CREATE TABLE seats (
  id         SERIAL PRIMARY KEY,
  event_id   INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  row_label  TEXT NOT NULL,                    -- 'A', 'B', ...
  seat_no    INT NOT NULL,                     -- 1, 2, 3 ...
  status     TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','booked')),
  UNIQUE (event_id, row_label, seat_no)
);

-- ---------- GROUPS ----------
CREATE TABLE groups (
  id          SERIAL PRIMARY KEY,
  event_id    INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  creator_id  INT NOT NULL REFERENCES users(id),
  max_size    INT NOT NULL CHECK (max_size BETWEEN 2 AND 5),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','sealed','booked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id      INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       INT NOT NULL REFERENCES users(id),
  is_locked_in  BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)              -- a user can be in a group only once
);

-- ---------- CHAT ----------
CREATE TABLE messages (
  id          SERIAL PRIMARY KEY,
  group_id    INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- BOOKINGS, PAYMENTS, TICKETS ----------
CREATE TABLE bookings (
  id               SERIAL PRIMARY KEY,
  group_id         INT NOT NULL REFERENCES groups(id),
  status           TEXT NOT NULL DEFAULT 'held'
                   CHECK (status IN ('held','confirmed','expired','cancelled')),
  total            NUMERIC(10,2) NOT NULL,
  discount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  hold_expires_at  TIMESTAMPTZ NOT NULL,       -- pay before this or booking expires
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE booking_seats (
  booking_id  INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id     INT NOT NULL REFERENCES seats(id),
  user_id     INT REFERENCES users(id),        -- which member sits here
  PRIMARY KEY (booking_id, seat_id)
);

CREATE TABLE payments (
  id          SERIAL PRIMARY KEY,
  booking_id  INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id),
  amount      NUMERIC(10,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded')),
  paid_at     TIMESTAMPTZ,
  UNIQUE (booking_id, user_id)                 -- one share per member per booking
);

CREATE TABLE tickets (
  id          SERIAL PRIMARY KEY,
  booking_id  INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id),
  seat_id     INT NOT NULL REFERENCES seats(id),
  code        TEXT UNIQUE NOT NULL,            -- the ticket code shown to the user
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- RATINGS ----------
CREATE TABLE ratings (
  id         SERIAL PRIMARY KEY,
  event_id   INT NOT NULL REFERENCES events(id),
  rater_id   INT NOT NULL REFERENCES users(id),
  ratee_id   INT NOT NULL REFERENCES users(id),
  score      INT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, rater_id, ratee_id),       -- rate each person once per event
  CHECK (rater_id <> ratee_id)                 -- cannot rate yourself
);

-- ---------- SUPPORT & NOTIFICATIONS ----------
CREATE TABLE support_tickets (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  booking_id  INT REFERENCES bookings(id),
  subject     TEXT NOT NULL,
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
