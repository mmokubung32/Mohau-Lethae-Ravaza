// src/routes/enquiries.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { sendEmail, studioEnquiryEmail, studioCommissionEmail } = require("../lib/email");

const router = express.Router();

// Shared limiter for all public write endpoints in this file — see docs/SECURITY.md.
const publicWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});

const enquirySchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().max(200),
  reason: z.string().max(100).default("Something else"),
  message: z.string().min(1).max(3000),
  workSlug: z.string().max(100).optional().nullable(),
});

// POST /api/enquiries (public)
router.post("/enquiries", publicWriteLimiter, async (req, res) => {
  const parsed = enquirySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid enquiry.", details: parsed.error.flatten() });
  const d = parsed.data;
  const result = db.prepare(`
    INSERT INTO enquiries (name, email, reason, message, work_slug)
    VALUES (?, ?, ?, ?, ?)
  `).run(d.name, d.email, d.reason, d.message, d.workSlug || null);

  // Email send happens once, tied to this specific successful insert — a
  // client retry would create a new row (and thus a new, correctly
  // separate notification) rather than double-sending for the same one.
  const email = studioEnquiryEmail(d);
  await sendEmail({ ...email, relatedType: "enquiry", relatedId: String(result.lastInsertRowid) });

  res.status(201).json({ ok: true, message: "Enquiry received. The studio replies directly, usually within a few days." });
});

const commissionSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().max(200),
  subject: z.string().min(1).max(3000),
});

// POST /api/commissions (public)
router.post("/commissions", publicWriteLimiter, async (req, res) => {
  const parsed = commissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
  const d = parsed.data;
  const result = db.prepare(`INSERT INTO commission_requests (name, email, subject) VALUES (?, ?, ?)`).run(d.name, d.email, d.subject);

  const email = studioCommissionEmail(d);
  await sendEmail({ ...email, relatedType: "commission", relatedId: String(result.lastInsertRowid) });

  res.status(201).json({ ok: true, message: "Commission enquiry received." });
});

const notifySchema = z.object({ email: z.string().email().max(200) });

// POST /api/wearable-notify (public)
router.post("/wearable-notify", publicWriteLimiter, (req, res) => {
  const parsed = notifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please provide a valid email." });
  db.prepare(`INSERT INTO wearable_notify (email) VALUES (?)`).run(parsed.data.email);
  res.status(201).json({ ok: true, message: "You're on the list." });
});

// ---- Admin inbox ----

// GET /api/admin/enquiries (admin)
router.get("/admin/enquiries", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM enquiries ORDER BY created_at DESC").all());
});

// GET /api/admin/commissions (admin)
router.get("/admin/commissions", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM commission_requests ORDER BY created_at DESC").all());
});

// GET /api/admin/wearable-notify (admin)
router.get("/admin/wearable-notify", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM wearable_notify ORDER BY created_at DESC").all());
});

const statusSchema = z.object({ status: z.enum(["new", "replied", "closed"]) });

// PATCH /api/admin/enquiries/:id (admin) — mark replied/closed
router.patch("/admin/enquiries/:id", requireAdmin, (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status." });
  const result = db.prepare("UPDATE enquiries SET status = ? WHERE id = ?").run(parsed.data.status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Enquiry not found." });
  res.json({ ok: true });
});

module.exports = router;
