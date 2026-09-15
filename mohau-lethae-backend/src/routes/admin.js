// src/routes/admin.js
const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/admin/audit-log (admin) — accountability trail per docs/SECURITY.md
router.get("/audit-log", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200").all();
  res.json(rows);
});

// GET /api/admin/dashboard (admin) — small summary for the admin home screen
router.get("/dashboard", requireAdmin, (req, res) => {
  const counts = {
    artworksAvailable: db.prepare("SELECT COUNT(*) c FROM artworks WHERE status = 'available'").get().c,
    artworksSold: db.prepare("SELECT COUNT(*) c FROM artworks WHERE status = 'sold'").get().c,
    newEnquiries: db.prepare("SELECT COUNT(*) c FROM enquiries WHERE status = 'new'").get().c,
    newCommissions: db.prepare("SELECT COUNT(*) c FROM commission_requests WHERE status = 'new'").get().c,
    wearableNotifySignups: db.prepare("SELECT COUNT(*) c FROM wearable_notify").get().c,
    ordersPaid: db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'paid'").get().c,
    ordersPending: db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'pending_payment'").get().c,
    shippingQuotesNeeded: db.prepare("SELECT COUNT(*) c FROM orders WHERE shipping_status = 'quote_pending'").get().c,
  };
  res.json(counts);
});

// GET /api/admin/orders (admin)
router.get("/orders", requireAdmin, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100").all();
  const itemStmt = db.prepare("SELECT title, price, product_type FROM order_items WHERE order_id = ?");
  res.json(orders.map((o) => ({ ...o, items: itemStmt.all(o.id) })));
});

// GET /api/admin/emails (admin) — audit trail of every notification sent/attempted
router.get("/emails", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM email_log ORDER BY created_at DESC LIMIT 200").all());
});

module.exports = router;
