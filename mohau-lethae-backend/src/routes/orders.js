// src/routes/orders.js
const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const db = require("../db");
const { buildPaymentFields } = require("../lib/payfast");

const router = express.Router();

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});

const SHIPPING_COST = { courier: 150, collect: 0, freight_quote: 0 };

const cartItemSchema = z.object({
  slug: z.string().min(1).max(120),
  productType: z.enum(["artwork", "wearable"]),
});

const createOrderSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(150),
  address: z.string().min(1).max(300),
  city: z.string().min(1).max(150),
  postalCode: z.string().min(1).max(20),
  shippingMethod: z.enum(["courier", "collect", "freight_quote"]),
  items: z.array(cartItemSchema).min(1).max(20),
});

function generateOrderRef() {
  return "ML-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Re-prices and re-validates every item server-side from the database —
// never trusts a price the client sends. This is also where the "someone
// else bought the one-of-one painting while it sat in your cart" case is
// caught, per docs/DATABASE.md's UNIQUE inventory model.
function resolveItems(items) {
  const resolved = [];
  const problems = [];

  for (const item of items) {
    if (item.productType === "artwork") {
      const row = db.prepare("SELECT * FROM artworks WHERE slug = ?").get(item.slug);
      if (!row) { problems.push(`${item.slug}: no longer exists`); continue; }
      if (row.status !== "available" || row.acquire_type !== "buy") {
        problems.push(`"${row.title}" is no longer available for direct purchase — it may have just sold, or needs an enquiry instead.`);
        continue;
      }
      resolved.push({ productType: "artwork", slug: row.slug, title: row.title, price: row.price, image: row.image, shipsFragile: !!row.ships_fragile });
    } else {
      const row = db.prepare("SELECT * FROM wearable_products WHERE slug = ?").get(item.slug);
      if (!row) { problems.push(`${item.slug}: no longer exists`); continue; }
      if (row.status !== "available") {
        problems.push(`"${row.title}" is no longer available.`);
        continue;
      }
      resolved.push({ productType: "wearable", slug: row.slug, title: row.title, price: row.price, image: row.image, shipsFragile: false });
    }
  }

  return { resolved, problems };
}

// POST /api/orders — create a pending order from the cart, return PayFast redirect fields.
router.post("/", orderLimiter, (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid order.", details: parsed.error.flatten() });
  }
  const d = parsed.data;
  const { resolved, problems } = resolveItems(d.items);

  if (problems.length > 0) {
    return res.status(409).json({
      error: "Some items in your cart changed before checkout completed.",
      problems,
    });
  }

  // Fragile/large-format originals (per docs/BACKEND-ROADMAP.md Phase 9) can't
  // travel on the flat-rate standard courier — a 65×70cm framed board and a
  // T-shirt cannot share a shipping rate without overcharging one or
  // undercharging the other. Re-checked server-side, never trusting the
  // shipping method the client happened to have selected.
  const hasFragileItem = resolved.some((i) => i.shipsFragile);
  if (hasFragileItem && d.shippingMethod === "courier") {
    return res.status(409).json({
      error: "Your order contains a large or fragile original that can't ship on the standard flat-rate courier.",
      problems: ["Choose studio collection, or request a freight quote — the shipping cost for large framed work depends on size and destination."],
    });
  }

  const subtotal = resolved.reduce((sum, i) => sum + i.price, 0);
  const shippingCost = SHIPPING_COST[d.shippingMethod];
  const total = subtotal + shippingCost;
  const shippingStatus = d.shippingMethod === "freight_quote" ? "quote_pending" : "standard";
  const orderRef = generateOrderRef();

  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT INTO orders (order_ref, email, name, address, city, postal_code, shipping_method, shipping_status, subtotal, shipping_cost, total)
      VALUES (@order_ref, @email, @name, @address, @city, @postal_code, @shipping_method, @shipping_status, @subtotal, @shipping_cost, @total)
    `).run({
      order_ref: orderRef,
      email: d.email,
      name: d.name,
      address: d.address,
      city: d.city,
      postal_code: d.postalCode,
      shipping_method: d.shippingMethod,
      shipping_status: shippingStatus,
      subtotal,
      shipping_cost: shippingCost,
      total,
    });

    const orderId = db.prepare("SELECT id FROM orders WHERE order_ref = ?").get(orderRef).id;

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_type, slug, title, price, image)
      VALUES (@order_id, @product_type, @slug, @title, @price, @image)
    `);
    for (const item of resolved) {
      insertItem.run({ order_id: orderId, product_type: item.productType, slug: item.slug, title: item.title, price: item.price, image: item.image });
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const order = { order_ref: orderRef, name: d.name, email: d.email, total };
  const siteOrigin = process.env.PUBLIC_SITE_ORIGIN || "http://localhost:8000";
  const payment = buildPaymentFields({ order, siteOrigin });

  res.status(201).json({
    orderRef,
    subtotal,
    shippingCost,
    total,
    payment, // { merchant_id, merchant_key, ..., signature, processUrl } — frontend auto-submits this as a form POST to PayFast
  });
});

// GET /api/orders/:ref — order status lookup, for the confirmation page.
// Deliberately returns only non-sensitive summary fields — no address, no
// full item list beyond titles — since this endpoint is unauthenticated
// and order refs could in principle be guessed/shared.
router.get("/:ref", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE order_ref = ?").get(req.params.ref);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const items = db.prepare("SELECT title, price FROM order_items WHERE order_id = ?").all(order.id);
  res.json({
    orderRef: order.order_ref,
    status: order.status,
    shippingStatus: order.shipping_status,
    total: order.total,
    items,
  });
});

module.exports = router;
