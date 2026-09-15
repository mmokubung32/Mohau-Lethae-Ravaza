// src/lib/payfast.js
//
// PayFast integration helpers, following PayFast's documented API exactly:
// https://developers.payfast.co.za/docs
//
// IMPORTANT — what is and isn't verified in this build:
// The signature generation/verification below implements PayFast's documented
// algorithm faithfully (field order, URL-encoding rules, MD5 hashing) and is
// unit-tested in this file's companion test (see scripts/test-payfast.js).
// What could NOT be verified in this sandboxed environment is a real
// end-to-end round trip against PayFast's actual servers — that needs a
// publicly reachable notify_url (PayFast calls it from the internet) and,
// even in sandbox mode, live network access this environment doesn't have.
// Before going live: test against PayFast's sandbox
// (https://sandbox.payfast.co.za) from a real, publicly-reachable staging
// deployment, using the sandbox credentials below or your own.

const crypto = require("crypto");

// PayFast's published sandbox test credentials — publicly documented for
// developer testing, not a secret. Real credentials come from .env in
// production and override these.
const SANDBOX_MERCHANT_ID = "10000100";
const SANDBOX_MERCHANT_KEY = "46f0cd694581a";
const SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process";
const LIVE_PROCESS_URL = "https://www.payfast.co.za/eng/process";

function getConfig() {
  const isSandbox = process.env.PAYFAST_MODE !== "live";
  return {
    isSandbox,
    merchantId: process.env.PAYFAST_MERCHANT_ID || SANDBOX_MERCHANT_ID,
    merchantKey: process.env.PAYFAST_MERCHANT_KEY || SANDBOX_MERCHANT_KEY,
    passphrase: process.env.PAYFAST_PASSPHRASE || "", // sandbox testing typically uses no passphrase
    processUrl: isSandbox ? SANDBOX_PROCESS_URL : LIVE_PROCESS_URL,
  };
}

// PayFast requires the signature to be built from fields in the exact order
// they're added to the form (not alphabetical), URL-encoded with spaces as
// '+', standard PHP-style urlencode — encodeURIComponent gets close but
// encodes spaces as %20, so we post-process.
function pfEncode(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

function buildSignatureString(fields, passphrase) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${pfEncode(v)}`);
  let str = parts.join("&");
  if (passphrase) {
    str += `&passphrase=${pfEncode(passphrase)}`;
  }
  return str;
}

function generateSignature(fields, passphrase) {
  const str = buildSignatureString(fields, passphrase);
  return crypto.createHash("md5").update(str).digest("hex");
}

// Builds the full set of form fields (including signature) for redirecting
// the buyer to PayFast. Field insertion order matters for the signature, so
// this object's key order is deliberate and must match what the frontend
// renders as hidden form fields in the same order.
function buildPaymentFields({ order, siteOrigin }) {
  const config = getConfig();

  const fields = {
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: `${siteOrigin}/order-confirmation.html?ref=${order.order_ref}`,
    cancel_url: `${siteOrigin}/checkout.html?cancelled=1`,
    notify_url: `${process.env.PUBLIC_API_ORIGIN || "http://localhost:4000"}/api/payments/payfast/notify`,
    name_first: order.name.split(" ")[0] || order.name,
    name_last: order.name.split(" ").slice(1).join(" ") || "",
    email_address: order.email,
    m_payment_id: order.order_ref,
    amount: (order.total).toFixed(2),
    item_name: `Mohau Lethae order ${order.order_ref}`,
  };

  const signature = generateSignature(fields, config.passphrase);
  return { ...fields, signature, processUrl: config.processUrl };
}

// Verifies an inbound ITN (Instant Transaction Notification) payload against
// its signature. Per PayFast docs, the ITN's own `signature` field is
// excluded, and the remaining posted fields are used *in the order PayFast
// sent them* — for a received POST body that's whatever order Express
// parsed them in, which for application/x-www-form-urlencoded preserves
// original order, so this is safe.
function verifyItnSignature(postedFields) {
  const { signature, ...rest } = postedFields;
  const config = getConfig();
  const expected = generateSignature(rest, config.passphrase);
  return expected === signature;
}

module.exports = {
  getConfig,
  generateSignature,
  buildPaymentFields,
  verifyItnSignature,
  SANDBOX_MERCHANT_ID,
  SANDBOX_MERCHANT_KEY,
};
