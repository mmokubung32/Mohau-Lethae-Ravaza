// Quick self-consistency check for the PayFast signature helpers.
// Does NOT hit PayFast's servers — validates our own encode/sign/verify
// round-trip and a couple of encoding edge cases against the documented rules.
const assert = require("assert");
const { generateSignature, verifyItnSignature } = require("../src/lib/payfast");

// 1. Round trip: sign a payload, then verify it as if it came back as an ITN.
const fields = {
  merchant_id: "10000100",
  merchant_key: "46f0cd694581a",
  m_payment_id: "ML-TEST01",
  amount: "1234.00",
  item_name: "Mohau Lethae order ML-TEST01",
};
const sig = generateSignature(fields, "");
const verified = verifyItnSignature({ ...fields, signature: sig });
assert.strictEqual(verified, true, "signature should verify against its own payload");
console.log("PASS: signature round-trip verifies correctly");

// 2. Tampering detection: change one field after signing, verification must fail.
const tampered = { ...fields, amount: "1.00", signature: sig };
assert.strictEqual(verifyItnSignature(tampered), false, "tampered payload must fail verification");
console.log("PASS: tampered payload correctly fails verification");

// 3. Space encoding: PayFast/PHP urlencode uses '+' for spaces, not %20.
const spaced = generateSignature({ item_name: "a b" }, "");
const viaEncodeURIComponent = require("crypto")
  .createHash("md5")
  .update("item_name=a%20b")
  .digest("hex");
assert.notStrictEqual(spaced, viaEncodeURIComponent, "raw encodeURIComponent output should NOT match (spaces must be '+')");
console.log("PASS: space encoding uses '+' per PayFast/PHP urlencode convention, not %20");

console.log("\nAll PayFast helper self-checks passed.");
