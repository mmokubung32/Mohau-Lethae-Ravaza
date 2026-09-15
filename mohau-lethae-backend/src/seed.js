// src/seed.js
//
// Seeds the database with the real 23 artworks (from the artist's supplied
// catalogue) and 4 wearable-art placeholder listings, plus one admin user.
// Safe to re-run: it wipes and re-inserts rather than appending duplicates.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const seedSource = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "seed-source.json"), "utf8")
);

function isFragileByDimensions(dims) {
  // Heuristic per docs/BACKEND-ROADMAP.md Phase 9: large framed originals
  // need freight-quote shipping, not flat-rate courier. Parses "NNcm"
  // measurements out of the dimension string and flags anything with a
  // side ≥60cm. Deliberately conservative — formats like "Framed original"
  // or "Series of 3 panels" that don't parse just fall back to "not
  // fragile" rather than guessing; those happen to all be enquire-tier
  // pieces anyway, so they never reach the flat-rate courier decision.
  const matches = [...dims.matchAll(/(\d+(?:\.\d+)?)\s*cm/gi)].map((m) => parseFloat(m[1]));
  if (matches.length === 0) return false;
  return Math.max(...matches) >= 60;
}

function run() {
  const insertArtwork = db.prepare(`
    INSERT INTO artworks
      (slug, title, medium, dimensions, price, status, acquire_type, note, image, featured, dimension_unconfirmed, ships_fragile)
    VALUES (@slug, @title, @medium, @dimensions, @price, @status, @acquire_type, @note, @image, @featured, @dimension_unconfirmed, @ships_fragile)
  `);

  const insertWearable = db.prepare(`
    INSERT INTO wearable_products
      (slug, title, size, fabric, edition, price, note, image, status, is_placeholder_photo)
    VALUES (@slug, @title, @size, @fabric, @edition, @price, @note, @image, 'available', 1)
  `);

  const wipeAndSeed = () => {
    db.exec("BEGIN");
    try {
      db.exec(`
      DELETE FROM artworks;
      DELETE FROM wearable_products;
      DELETE FROM enquiries;
      DELETE FROM commission_requests;
      DELETE FROM wearable_notify;
      DELETE FROM audit_logs;
    `);

    for (const w of seedSource.works) {
      insertArtwork.run({
        slug: w.slug,
        title: w.title,
        medium: w.medium,
        dimensions: w.dims,
        price: w.price === null ? null : w.price,
        status: w.status,
        acquire_type: w.acquire,
        note: w.note,
        image: `images/${w.slug}.jpg`,
        featured: w.featured ? 1 : 0,
        dimension_unconfirmed: w.slug === "smangele" ? 1 : 0,
        ships_fragile: isFragileByDimensions(w.dims) ? 1 : 0,
      });
    }

    for (const wp of seedSource.wearable) {
      insertWearable.run({
        slug: wp.slug,
        title: wp.title,
        size: wp.size,
        fabric: wp.fabric,
        edition: wp.edition,
        price: wp.price,
        note: wp.note,
        image: "images/placeholder.png",
      });
    }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  wipeAndSeed();
  console.log(`Seeded ${seedSource.works.length} artworks and ${seedSource.wearable.length} wearable listings.`);

  // Admin user — email/password from env, falling back to a clearly-labelled
  // local-dev default so `npm run seed` works out of the box. Change this
  // before deploying anywhere real; see .env.example.
  const adminEmail = process.env.ADMIN_EMAIL || "studio@mohaulethae.art";
  const adminPassword = process.env.ADMIN_PASSWORD || "change-me-before-deploy";

  db.prepare(`DELETE FROM admin_users WHERE email = ?`).run(adminEmail);
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare(`INSERT INTO admin_users (email, password_hash) VALUES (?, ?)`).run(adminEmail, hash);
  console.log(`Admin user ready: ${adminEmail}${process.env.ADMIN_PASSWORD ? "" : " (using default dev password — set ADMIN_PASSWORD in .env)"}`);
}

run();
