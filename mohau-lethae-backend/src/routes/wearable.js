// src/routes/wearable.js
const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

function serialize(row) {
  return {
    slug: row.slug,
    title: row.title,
    size: row.size,
    fabric: row.fabric,
    edition: row.edition,
    price: row.price,
    note: row.note,
    image: row.image,
    status: row.status,
    isPlaceholderPhoto: !!row.is_placeholder_photo,
  };
}

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM wearable_products ORDER BY id").all();
  res.json(rows.map(serialize));
});

router.get("/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM wearable_products WHERE slug = ?").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "Listing not found." });
  res.json(serialize(row));
});

const updateSchema = z.object({
  price: z.number().int().positive().optional(),
  status: z.enum(["available", "sold"]).optional(),
  image: z.string().min(1).max(300).optional(),
  isPlaceholderPhoto: z.boolean().optional(),
});

// PATCH /api/wearable/:slug (admin) — e.g. swap in the real photo once it exists
router.patch("/:slug", requireAdmin, (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update.", details: parsed.error.flatten() });

  const existing = db.prepare("SELECT * FROM wearable_products WHERE slug = ?").get(req.params.slug);
  if (!existing) return res.status(404).json({ error: "Listing not found." });

  const d = parsed.data;
  db.prepare(`
    UPDATE wearable_products SET
      price = @price, status = @status, image = @image,
      is_placeholder_photo = @is_placeholder_photo, updated_at = datetime('now')
    WHERE slug = @slug
  `).run({
    price: d.price ?? existing.price,
    status: d.status ?? existing.status,
    image: d.image ?? existing.image,
    is_placeholder_photo: "isPlaceholderPhoto" in d ? (d.isPlaceholderPhoto ? 1 : 0) : existing.is_placeholder_photo,
    slug: req.params.slug,
  });

  db.prepare(`
    INSERT INTO audit_logs (admin_email, action, entity, entity_slug, details)
    VALUES (?, 'update_wearable', 'wearable_product', ?, ?)
  `).run(req.admin.email, req.params.slug, JSON.stringify(d));

  res.json(serialize(db.prepare("SELECT * FROM wearable_products WHERE slug = ?").get(req.params.slug)));
});

module.exports = router;
