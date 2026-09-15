// src/db.js
//
// This backend uses Node's built-in node:sqlite module (stable-enough as of
// Node 22, still flagged "experimental" by Node itself) for the runnable
// local/demo database, rather than Postgres+Prisma or a native npm SQLite
// binding. Two reasons: this environment can't reach binaries.prisma.sh for
// Prisma's query engine, and native modules like better-sqlite3 need to
// either fetch a prebuilt binary or compile from source against downloaded
// Node headers — both of which can fail under restricted network egress.
// node:sqlite ships inside Node itself, so there is nothing to fetch or
// compile: `npm install` + `npm run seed` works anywhere Node 22+ runs.
//
// The schema below maps 1:1 onto the Postgres schema documented in
// ../../mohau-lethae-site/docs/DATABASE.md — moving to Postgres in
// production means swapping this file for a Prisma client, not a redesign.
// See docs/DEPLOYMENT.md for the production path.

const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "mohau.db");
const database = new DatabaseSync(DB_PATH);
database.exec("PRAGMA journal_mode = WAL");
database.exec("PRAGMA foreign_keys = ON");

database.exec(`
CREATE TABLE IF NOT EXISTS artworks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  medium        TEXT NOT NULL,
  dimensions    TEXT NOT NULL,
  price         INTEGER,                 -- whole Rand, NULL = "enquire for price" (e.g. Smangele)
  status        TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','sold','not-for-sale')),
  acquire_type  TEXT NOT NULL
                  CHECK (acquire_type IN ('buy','enquire','sold','nfs')),
  note          TEXT,
  image         TEXT NOT NULL,
  featured      INTEGER NOT NULL DEFAULT 0,
  dimension_unconfirmed INTEGER NOT NULL DEFAULT 0,
  ships_fragile INTEGER NOT NULL DEFAULT 0,   -- large/framed originals needing freight-quote shipping, not flat-rate courier
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wearable_products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  size          TEXT NOT NULL,
  fabric        TEXT NOT NULL,
  edition       TEXT NOT NULL,           -- e.g. "One of one" / "Edition 1 of 3"
  price         INTEGER NOT NULL,
  note          TEXT,
  image         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','sold')),
  is_placeholder_photo INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enquiries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  reason        TEXT NOT NULL DEFAULT 'Something else',
  message       TEXT NOT NULL,
  work_slug     TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','replied','closed')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commission_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  subject       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_discussion','confirmed','declined')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wearable_notify (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_ref         TEXT UNIQUE NOT NULL,     -- public-facing reference, e.g. ML-7DCK6W
  email             TEXT NOT NULL,
  name              TEXT NOT NULL,
  address           TEXT NOT NULL,
  city              TEXT NOT NULL,
  postal_code       TEXT NOT NULL,
  shipping_method   TEXT NOT NULL CHECK (shipping_method IN ('courier','collect','freight_quote')),
  shipping_status   TEXT NOT NULL DEFAULT 'standard'
                      CHECK (shipping_status IN ('standard','quote_pending','quoted','resolved')),
  subtotal          INTEGER NOT NULL,          -- whole Rand
  shipping_cost     INTEGER NOT NULL,
  total             INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending_payment'
                      CHECK (status IN ('pending_payment','paid','failed','cancelled')),
  payment_provider  TEXT DEFAULT 'payfast',
  payment_reference TEXT,                      -- PayFast's pf_payment_id, once known
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id),
  product_type  TEXT NOT NULL CHECK (product_type IN ('artwork','wearable')),
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  price         INTEGER NOT NULL,
  image         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER REFERENCES orders(id),
  provider      TEXT NOT NULL DEFAULT 'payfast',
  event_type    TEXT NOT NULL,      -- e.g. "itn_received", "itn_verified", "itn_signature_invalid"
  raw_payload   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  transport     TEXT NOT NULL,              -- 'console' or 'resend'
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  related_type  TEXT,                       -- 'enquiry' | 'commission' | 'order'
  related_id    TEXT,
  status        TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error_message TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email   TEXT NOT NULL,
  action        TEXT NOT NULL,           -- e.g. "update_status", "update_price", "create_artwork"
  entity        TEXT NOT NULL,           -- e.g. "artwork"
  entity_slug   TEXT NOT NULL,
  details       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = database;
