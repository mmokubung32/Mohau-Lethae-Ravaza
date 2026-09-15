// src/lib/email.js
//
// Provider-agnostic email sending, per docs/BACKEND-ROADMAP.md Phase 10.
//
// WHAT'S REAL VS. WHAT ISN'T: the Resend integration below is written
// against Resend's actual documented API (a single POST to
// https://api.resend.com/emails with a Bearer API key) and will work as-is
// once a real RESEND_API_KEY is set. It could not be tested against
// Resend's live servers in this sandboxed environment — api.resend.com
// isn't reachable here. What IS tested: every trigger point (enquiry
// received, commission received, order paid) fires with correct content,
// verified via the "console" transport, which is also the safe default so
// nothing tries to send real email until EMAIL_PROVIDER_API_KEY is set.
//
// All sent (or logged) emails are recorded in the email_log table
// regardless of transport, so "did this enquiry's email actually go out"
// is always answerable from the admin panel — not just trusted silently.

const db = require("../db");

function getTransport() {
  return process.env.EMAIL_PROVIDER_API_KEY ? "resend" : "console";
}

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.STUDIO_FROM_EMAIL || "Mohau Lethae Studio <studio@mohaulethae.art>";

  // Per https://resend.com/docs/api-reference/emails/send-email
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
  return res.json();
}

async function sendEmail({ to, subject, html, text, relatedType, relatedId }) {
  const transport = getTransport();
  let status = "sent";
  let errorMessage = null;

  if (transport === "console") {
    // Safe default: nothing leaves the server. Printed clearly so it's
    // obvious in logs/dev that this is a stand-in, not a real send.
    console.log(`\n─── [email:console] would send to ${to} ───`);
    console.log(`Subject: ${subject}`);
    console.log(text || html.replace(/<[^>]+>/g, ""));
    console.log("──────────────────────────────────────────\n");
  } else {
    try {
      await sendViaResend({ to, subject, html, text });
    } catch (err) {
      status = "failed";
      errorMessage = err.message;
      console.error("Email send failed:", err.message);
    }
  }

  db.prepare(`
    INSERT INTO email_log (transport, to_email, subject, related_type, related_id, status, error_message)
    VALUES (@transport, @to_email, @subject, @related_type, @related_id, @status, @error_message)
  `).run({
    transport,
    to_email: to,
    subject,
    related_type: relatedType || null,
    related_id: relatedId || null,
    status,
    error_message: errorMessage,
  });

  return { ok: status === "sent", transport };
}

// ---- Templates ----
// Kept deliberately plain (no heavy HTML/CSS) — these are transactional
// notifications, not marketing sends, and plain text renders reliably
// everywhere including the studio's own inbox on a phone.

function studioEnquiryEmail({ name, email, reason, message, workSlug }) {
  const studioEmail = process.env.STUDIO_NOTIFICATION_EMAIL || "studio@mohaulethae.art";
  const subject = `New enquiry: ${reason}${workSlug ? ` (${workSlug})` : ""}`;
  const text = `New enquiry from the website.

From: ${name} <${email}>
Reason: ${reason}${workSlug ? `\nArtwork: ${workSlug}` : ""}

Message:
${message}
`;
  return { to: studioEmail, subject, text, html: `<pre>${escapeHtml(text)}</pre>` };
}

function studioCommissionEmail({ name, email, subject: commissionSubject }) {
  const studioEmail = process.env.STUDIO_NOTIFICATION_EMAIL || "studio@mohaulethae.art";
  const subject = `New commission request from ${name}`;
  const text = `New commission request from the website.

From: ${name} <${email}>

Details:
${commissionSubject}
`;
  return { to: studioEmail, subject, text, html: `<pre>${escapeHtml(text)}</pre>` };
}

function customerOrderConfirmationEmail({ order, items }) {
  const lines = items.map((i) => `  - ${i.title} — R${i.price.toLocaleString()}`).join("\n");
  const subject = `Your order ${order.order_ref} is confirmed`;
  const shippingLine =
    order.shipping_method === "collect"
      ? "Collection from the studio, Orange Farm"
      : order.shipping_method === "freight_quote"
      ? "Freight quote pending — the studio will contact you with a shipping cost for this piece before dispatch"
      : "Standard courier";
  const text = `Hi ${order.name},

Thank you — your payment for order ${order.order_ref} has been received.

${lines}

Shipping: ${shippingLine}
Total paid: R${order.total.toLocaleString()}
${order.shipping_status === "quote_pending" ? "\nNote: this total does not yet include shipping for this piece — the studio will follow up separately to arrange and confirm that cost.\n" : ""}
The studio will be in touch about ${order.shipping_method === "collect" ? "collection" : "dispatch"} shortly.

— Mohau Lethae Studio
`;
  return { to: order.email, subject, text, html: `<pre>${escapeHtml(text)}</pre>` };
}

function studioOrderNotificationEmail({ order, items }) {
  const studioEmail = process.env.STUDIO_NOTIFICATION_EMAIL || "studio@mohaulethae.art";
  const lines = items.map((i) => `  - ${i.title} — R${i.price.toLocaleString()}`).join("\n");
  const subject = `Paid order: ${order.order_ref} (R${order.total.toLocaleString()})${order.shipping_status === "quote_pending" ? " — SHIPPING QUOTE NEEDED" : ""}`;
  const text = `A new order has been paid.

Order: ${order.order_ref}
Customer: ${order.name} <${order.email}>
Shipping method: ${order.shipping_method}${order.shipping_status === "quote_pending" ? " — ACTION NEEDED: contact the customer with a shipping quote for this fragile/large item before dispatch" : ""}
Address: ${order.address}, ${order.city}, ${order.postal_code}

Items:
${lines}

Total paid: R${order.total.toLocaleString()}
`;
  return { to: studioEmail, subject, text, html: `<pre>${escapeHtml(text)}</pre>` };
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

module.exports = {
  sendEmail,
  studioEnquiryEmail,
  studioCommissionEmail,
  customerOrderConfirmationEmail,
  studioOrderNotificationEmail,
  getTransport,
};
