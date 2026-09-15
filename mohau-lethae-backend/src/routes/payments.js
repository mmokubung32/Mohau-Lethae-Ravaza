// src/routes/payments.js
//
// PayFast calls this endpoint server-to-server after a payment attempt
// (the "ITN" — Instant Transaction Notification). This is the ONLY place
// an order is allowed to transition to "paid" — never trust the browser
// redirect back to return_url for that, since a user can hit that URL
// without ever having paid. See docs/SECURITY.md.
//
// What this implementation does, per PayFast's documented ITN handling steps:
//   1. Respond 200 immediately-ish (PayFast retries on non-200/timeout)
//   2. Verify the signature on the posted data
//   3. Verify the order exists and the amount matches what we expect
//   4. (Documented but NOT performed here — see note below) Post the data
//      back to PayFast to confirm it actually came from them
//   5. Update order status and, for a paid order, mark each purchased item
//      as sold so it can't be bought twice
//
// NOTE ON WHAT'S UNVERIFIED: step 4 (the server-to-server confirmation call
// back to PayFast) requires live network access to PayFast's servers, which
// this sandboxed environment doesn't have and can't test. The code path is
// written and documented below but left as a clearly-marked TODO with the
// exact request PayFast's docs specify — wire it up and test it against
// PayFast's sandbox from a real deployment before this handles real money.

const express = require("express");
const db = require("../db");
const { verifyItnSignature } = require("../lib/payfast");
const { sendEmail, customerOrderConfirmationEmail, studioOrderNotificationEmail } = require("../lib/email");

const router = express.Router();

router.post("/payfast/notify", express.urlencoded({ extended: false }), async (req, res) => {
  const posted = req.body;

  // Always log the raw event first — even a malformed or fraudulent-looking
  // ITN is useful forensic data, and PayFast expects a fast response.
  const orderRefForLog = posted.m_payment_id || null;
  const existingOrder = orderRefForLog
    ? db.prepare("SELECT * FROM orders WHERE order_ref = ?").get(orderRefForLog)
    : null;

  db.prepare(`
    INSERT INTO payment_events (order_id, provider, event_type, raw_payload)
    VALUES (?, 'payfast', 'itn_received', ?)
  `).run(existingOrder ? existingOrder.id : null, JSON.stringify(posted));

  // PayFast wants a fast 200 OK acknowledgement regardless of outcome, or
  // it will retry — so we always respond 200 here and do validation after.
  res.status(200).send("OK");

  if (!existingOrder) {
    logEvent(null, "itn_unknown_order", posted);
    return;
  }

  if (!verifyItnSignature(posted)) {
    logEvent(existingOrder.id, "itn_signature_invalid", posted);
    return;
  }

  // Amount check — protects against a tampered or replayed notification
  // claiming a different (lower) amount than what the order actually costs.
  const postedAmount = Math.round(parseFloat(posted.amount_gross || posted.amount || "0") * 100) / 100;
  if (postedAmount !== existingOrder.total) {
    logEvent(existingOrder.id, "itn_amount_mismatch", posted);
    return;
  }

  // TODO before going live: server-to-server confirmation per PayFast docs —
  //   POST the exact posted body back to
  //   https://sandbox.payfast.co.za/eng/query/validate (or the live
  //   equivalent) and only proceed if PayFast responds "VALID". This closes
  //   the last gap where a request that merely *looks* like a correctly
  //   signed ITN (e.g. from a leaked passphrase) is trusted without
  //   PayFast's own confirmation. Skipped here because this environment
  //   cannot make that outbound call to test it.

  // Idempotency: PayFast may send the same ITN more than once (their docs
  // explicitly warn of this and recommend handling retries safely). Without
  // this check, a retried notification would re-send the confirmation
  // email and studio notification a second time for the same order.
  if (existingOrder.status === "paid") {
    logEvent(existingOrder.id, "itn_duplicate_ignored", posted);
    return;
  }

  const paymentStatus = posted.payment_status; // "COMPLETE", "FAILED", "CANCELLED", etc.

  if (paymentStatus === "COMPLETE") {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(existingOrder.id);
    markOrderPaid(existingOrder, posted.pf_payment_id);
    logEvent(existingOrder.id, "itn_verified_complete", posted);

    const paidOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(existingOrder.id);
    const customerEmail = customerOrderConfirmationEmail({ order: paidOrder, items });
    const studioEmail = studioOrderNotificationEmail({ order: paidOrder, items });
    await sendEmail({ ...customerEmail, relatedType: "order", relatedId: paidOrder.order_ref });
    await sendEmail({ ...studioEmail, relatedType: "order", relatedId: paidOrder.order_ref });
  } else {
    db.prepare(`UPDATE orders SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(existingOrder.id);
    logEvent(existingOrder.id, "itn_verified_not_complete", posted);
  }
});

function markOrderPaid(order, pfPaymentId) {
  db.exec("BEGIN");
  try {
    db.prepare(`
      UPDATE orders SET status = 'paid', payment_reference = ?, updated_at = datetime('now') WHERE id = ?
    `).run(pfPaymentId || null, order.id);

    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
    for (const item of items) {
      if (item.product_type === "artwork") {
        db.prepare(`UPDATE artworks SET status = 'sold', acquire_type = 'sold', updated_at = datetime('now') WHERE slug = ?`).run(item.slug);
      } else {
        db.prepare(`UPDATE wearable_products SET status = 'sold', updated_at = datetime('now') WHERE slug = ?`).run(item.slug);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function logEvent(orderId, eventType, payload) {
  db.prepare(`
    INSERT INTO payment_events (order_id, provider, event_type, raw_payload)
    VALUES (?, 'payfast', ?, ?)
  `).run(orderId, eventType, JSON.stringify(payload));
}

// DEV-ONLY: simulates a real PayFast COMPLETE notification for a given order,
// so the paid → inventory-sold flow can be exercised without live network
// access to PayFast's servers. Builds a correctly signed payload using the
// exact same signature helper the real ITN handler verifies against, so
// this exercises the real verification code path, not a bypass of it.
// Refuses to run when NODE_ENV=production.
if (process.env.NODE_ENV !== "production") {
  const { generateSignature, getConfig } = require("../lib/payfast");

  router.post("/payfast/simulate-complete", express.json(), (req, res) => {
    const { orderRef } = req.body || {};
    const order = db.prepare("SELECT * FROM orders WHERE order_ref = ?").get(orderRef);
    if (!order) return res.status(404).json({ error: "Order not found." });

    const config = getConfig();
    const fields = {
      m_payment_id: order.order_ref,
      pf_payment_id: "SIMULATED-" + Date.now(),
      payment_status: "COMPLETE",
      amount_gross: order.total.toFixed(2),
      merchant_id: config.merchantId,
    };
    const signature = generateSignature(fields, config.passphrase);
    const posted = { ...fields, signature };

    // Post to our own real ITN endpoint, exactly like PayFast would.
    fetch(`http://localhost:${process.env.PORT || 4000}/api/payments/payfast/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(posted).toString(),
    })
      .then(() => res.json({ ok: true, message: `Simulated PayFast COMPLETE notification sent for ${orderRef}.` }))
      .catch((err) => res.status(500).json({ error: err.message }));
  });
}

module.exports = router;
