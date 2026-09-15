// src/routes/works.js
const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

function serializeArtwork(row) {
  return {
    slug: row.slug,
    title: row.title,
    medium: row.medium,
    dimensions: row.dimensions,
    price: row.price,
    status: row.status,
    acquireType: row.acquire_type,
    note: row.note,
    image: row.image,
    featured: !!row.featured,
    dimensionUnconfirmed: !!row.dimension_unconfirmed,
    shipsFragile: !!row.ships_fragile,
    updatedAt: row.updated_at,
  };
}

// GET /api/works?status=available
router.get("/", (req, res) => {
  const { status } = req.query;
  let rows;
  if (status && ["available", "sold", "not-for-sale"].includes(status)) {
    rows = db.prepare("SELECT * FROM artworks WHERE status = ? ORDER BY id").all(status);
  } else {
    rows = db.prepare("SELECT * FROM artworks ORDER BY id").all();
  }
  res.json(rows.map(serializeArtwork));
});

// GET /api/works/:slug
router.get("/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM artworks WHERE slug = ?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Artwork not found." });
  res.json(serializeArtwork(row));
});

// ---- Admin-only below ----

const updateSchema = z.object({
  price: z.number().int().positive().nullable().optional(),
  status: z.enum(["available", "sold", "not-for-sale"]).optional(),
  acquireType: z.enum(["buy", "enquire", "sold", "nfs"]).optional(),
  note: z.string().max(2000).optional(),
});

// PATCH /api/works/:slug  (admin) — e.g. mark sold, change price
router.patch("/:slug", requireAdmin, (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid update.", details: parsed.error.flatten() });
  }
  const existing = db.prepare("SELECT * FROM artworks WHERE slug = ?").get(req.params.slug);
  if (!existing) return res.status(404).json({ error: "Artwork not found." });

  const next = { ...existing, ...toColumns(parsed.data) };
  db.prepare(`
    UPDATE artworks SET price = @price, status = @status, acquire_type = @acquire_type,
      note = @note, updated_at = datetime('now') WHERE slug = @slug
  `).run({
    price: next.price,
    status: next.status,
    acquire_type: next.acquire_type,
    note: next.note,
    slug: req.params.slug,
  });

  db.prepare(`
    INSERT INTO audit_logs (admin_email, action, entity, entity_slug, details)
    VALUES (?, 'update_artwork', 'artwork', ?, ?)
  `).run(req.admin.email, req.params.slug, JSON.stringify(parsed.data));

  const updated = db.prepare("SELECT * FROM artworks WHERE slug = ?").get(req.params.slug);
  res.json(serializeArtwork(updated));
});

function toColumns(data) {
  const out = {};
  if ("price" in data) out.price = data.price;
  if ("status" in data) out.status = data.status;
  if ("acquireType" in data) out.acquire_type = data.acquireType;
  if ("note" in data) out.note = data.note;
  return out;
}

const createSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "slug must be lowercase-with-dashes"),
  title: z.string().min(1).max(200),
  medium: z.string().min(1).max(200),
  dimensions: z.string().min(1).max(200),
  price: z.number().int().positive().nullable(),
  status: z.enum(["available", "sold", "not-for-sale"]).default("available"),
  acquireType: z.enum(["buy", "enquire", "sold", "nfs"]),
  note: z.string().max(2000).default(""),
  image: z.string().min(1).max(300),
  featured: z.boolean().default(false),
});

// POST /api/works (admin) — add a new artwork to the catalogue
router.post("/", requireAdmin, (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid artwork.", details: parsed.error.flatten() });
  }
  const d = parsed.data;
  const existing = db.prepare("SELECT 1 FROM artworks WHERE slug = ?").get(d.slug);
  if (existing) return res.status(409).json({ error: `An artwork with slug "${d.slug}" already exists.` });

  db.prepare(`
    INSERT INTO artworks (slug, title, medium, dimensions, price, status, acquire_type, note, image, featured)
    VALUES (@slug, @title, @medium, @dimensions, @price, @status, @acquireType, @note, @image, @featured)
  `).run({ ...d, featured: d.featured ? 1 : 0 });

  db.prepare(`
    INSERT INTO audit_logs (admin_email, action, entity, entity_slug, details)
    VALUES (?, 'create_artwork', 'artwork', ?, ?)
  `).run(req.admin.email, d.slug, JSON.stringify(d));

  const created = db.prepare("SELECT * FROM artworks WHERE slug = ?").get(d.slug);
  res.status(201).json(serializeArtwork(created));
});

module.exports = router;
