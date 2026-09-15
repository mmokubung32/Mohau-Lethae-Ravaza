# Security

Baseline requirements for the backend build, not an audit of the current static prototype (which has no server-side attack surface yet beyond standard static-hosting hygiene).

## Authentication & authorization

- **Admin and customer auth are never shared.** `admin_users` is a separate table from `customers`, with no shared login endpoint, no shared session cookie name, and no code path where a customer session can be escalated to admin. This is deliberate: the biggest realistic risk to a one-artist business is someone finding a way into the catalogue editor, not a customer-account breach (there are no customer accounts at MVP).
- Admin passwords hashed with **bcrypt or argon2**, never stored or logged in plaintext.
- Admin sessions expire (short-lived JWT or server session with a sane TTL, e.g. 12 hours), not "log in once, stay in forever."
- Every `/admin/*` route requires a valid session — enforced centrally (middleware), not per-route, so a new route can't accidentally ship unauthenticated.
- Guest checkout only at MVP: a customer's "account" is just their email tied to their order, with order lookup via a signed, expiring link emailed to them — no password to leak.

## Input validation

- Every write endpoint validates its body against a schema (e.g. Zod) server-side — client-side validation is UX only, never trusted as the security boundary.
- Enquiry/commission/contact forms: length limits on free text, email format validation, and HTML stripped from any field that gets rendered back in an admin UI (stored XSS prevention).
- File uploads (admin artwork images): validated by actual file content/magic bytes, not just the extension or declared MIME type; re-encoded on the server rather than served as-uploaded, to strip any embedded scripts/metadata; size-capped; only image formats accepted.

## Rate limiting

- Public write endpoints (`/enquiries`, `/commission-requests`, `/wearable-notify`, `/checkout`) are rate-limited per IP (e.g. 5 requests/minute), to stop the contact forms being used for spam or abuse without needing a CAPTCHA that would hurt a genuine collector's experience.
- Admin login is rate-limited and temporarily locks after repeated failures, to blunt credential-stuffing attempts against a single known admin account.

## Payment security

- **No card data ever touches this application's servers.** Checkout redirects to the payment provider's hosted page (PayFast/Yoco), or uses their client-side tokenisation widget — the app only ever sees a payment reference and a webhook confirmation, keeping it out of PCI-DSS scope entirely.
- Webhook endpoints verify the provider's signature on every request before trusting the payload; a request with an invalid or missing signature is rejected and logged, never processed.
- Inventory only flips to `sold` from the verified webhook handler — never from the client-side "payment successful" redirect, which can be spoofed or interrupted.
- Idempotency keys on checkout creation prevent duplicate orders from a double-click or a retried request.

## Secrets management

- All credentials (database URL, payment provider keys, email provider key, session secret) live in environment variables, injected by the hosting platform (Vercel/Railway/Supabase secrets manager) — **never committed to the repository**, never hardcoded, never present in frontend bundle code.
- `.env.example` is committed with variable *names* only, no values, so a new developer knows what to set without any real secret being exposed.
- Separate credentials for staging and production; a staging leak should never expose live payment or database access.

## Database security

- Application connects with a role that has only the privileges it needs (no superuser access from the app).
- Automated daily backups, with a documented, tested restore process — an untested backup is not a backup.
- Least privilege extends to the admin UI too: the MVP has one admin role (Mohau/studio), but the schema doesn't prevent adding scoped roles later (e.g. a future assistant who can update inventory but not view order/customer PII).

## Logging & monitoring

- Errors and auth failures logged with enough context to investigate, but **never log full request bodies for payment or auth endpoints** (avoids accidentally logging a password or payment token).
- `audit_logs` (added in Backend Roadmap Phase 4) records who changed what on the catalogue and when — useful both for accountability and for recovering from an accidental "mark sold" on the wrong piece.

## Standard web hardening

- HTTPS everywhere (enforced by the hosting platform, e.g. Vercel's automatic TLS).
- Standard secure headers (CSP, X-Content-Type-Options, Referrer-Policy, HSTS) set at the framework/hosting level.
- CSRF protection on any state-changing form submission that relies on cookies for auth (the admin UI); not needed for the public JSON API if it uses bearer-token auth instead of cookies for admin sessions — confirm the chosen approach when Phase 3 is implemented and document the decision here.

## What this document deliberately does not cover yet

Formal penetration testing and a compliance review (e.g. POPIA data-handling specifics for South African customer data) are appropriate once real customer data is being collected at volume — flagged as a "should-have" once checkout goes live, not a blocker for the current content-only MVP phases.
