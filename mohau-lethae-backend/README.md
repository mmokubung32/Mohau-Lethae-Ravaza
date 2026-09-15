# Mohau Lethae — Backend (Phases 1–10)

A real, runnable Node/Express API implementing **Database → API → Auth → Admin → Cart/Checkout → Payments → Email notifications**
from `docs/BACKEND-ROADMAP.md` in the main site project. The frontend's cart is now wired to this backend for
real order creation and PayFast payment redirect — checkout no longer simulates locally.

## Why SQLite instead of the documented Postgres+Prisma stack

`docs/ARCHITECTURE.md` recommends Postgres via Prisma for production, and that
recommendation still stands. This particular sandbox can't reach
`binaries.prisma.sh` to download Prisma's query engine, so this runnable demo
uses `better-sqlite3` with hand-written SQL instead — same schema shape,
zero external dependency at run time. `src/db.js` documents this trade-off
inline. Moving to Postgres later means swapping `src/db.js` for a Prisma
client against the schema in `docs/DATABASE.md`; the route files
(`src/routes/*.js`) don't need to change shape, just their data-access calls.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set JWT_SECRET (see the comment in .env.example for how to
# generate one) and ADMIN_PASSWORD
npm run seed     # creates data/mohau.db, loads the real 23 artworks +
                  # 4 wearable placeholder listings, creates the admin user
npm start         # http://localhost:4000
```

Re-running `npm run seed` wipes and reloads everything — safe to use whenever
you want to reset to a known state.

## What's here

```
src/
  db.js              SQLite schema (artworks, wearable_products, admin_users,
                      enquiries, commission_requests, wearable_notify, audit_logs)
  seed.js             Loads the real catalogue data + one admin user
  middleware/auth.js  JWT session verification (cookie or Bearer token)
  routes/
    auth.js           POST /api/auth/login, /logout, GET /api/auth/me
    works.js           GET /api/works, GET /api/works/:slug,
                        PATCH /api/works/:slug (admin), POST /api/works (admin)
    wearable.js         GET /api/wearable, GET /api/wearable/:slug,
                        PATCH /api/wearable/:slug (admin)
    enquiries.js        POST /api/enquiries, /api/commissions, /api/wearable-notify
                        (all public, rate-limited), plus GET /api/admin/enquiries etc.
    admin.js            GET /api/admin/dashboard, GET /api/admin/audit-log
  app.js               Express app: CORS, security headers, route mounting
  server.js             Entry point
admin/index.html        A deliberately simple admin panel — login, inline
                        price/status editing, inbox, audit log. Matches the
                        docs/ARCHITECTURE.md call to not over-build the admin
                        before the business is validated.
data/
  seed-source.json      The real catalogue data, exported once from the
                        Python site generator so both projects share one
                        source of truth instead of drifting.
```

## Trying it out

- Admin panel: `http://localhost:4000/admin` — log in with the email/password
  from your `.env`.
- API root: `http://localhost:4000/api/health`
- Public catalogue: `http://localhost:4000/api/works`

Example: mark a piece sold and watch it disappear from the public "available"
filter immediately —

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"studio@mohaulethae.art","password":"<your ADMIN_PASSWORD>"}' \
  -c cookies.txt

curl -X PATCH http://localhost:4000/api/works/rough-road \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"status":"sold","acquireType":"sold"}'

curl "http://localhost:4000/api/works?status=available"   # rough-road is gone
curl "http://localhost:4000/api/works?status=sold"          # rough-road is here
```

## Cart, orders, and PayFast payments (Phases 5–9)

- `POST /api/orders` — takes the frontend cart (slugs + product types only,
  never client-supplied prices), re-validates and re-prices every item
  server-side, rejects anything sold/unavailable/enquire-only, creates a
  `pending_payment` order, and returns signed PayFast redirect fields.
- The frontend (`checkout.html`) auto-submits those fields as a real form
  POST to PayFast's sandbox — see `src/lib/payfast.js` for the signature
  algorithm, implemented per PayFast's published spec.
- `POST /api/payments/payfast/notify` is the ITN (Instant Transaction
  Notification) webhook — the *only* place an order becomes `paid`. It
  verifies the signature, checks the amount matches, and on success marks
  the order paid and the purchased items sold, all in one transaction.
- `GET /api/orders/:ref` is what `order-confirmation.html` polls after the
  PayFast redirect back.

**What's genuinely verified vs. what isn't, in this sandboxed build:**
Order creation, re-pricing, availability rejection, signature generation,
signature verification (including tamper detection), and the full
paid → inventory-sold transaction were all tested end-to-end, including
through the real frontend UI in a browser. What could *not* be tested here
is the actual round trip to PayFast's real servers — this sandbox's network
egress doesn't reach `sandbox.payfast.co.za`, so the browser's redirect
there was confirmed to fire correctly (with a correct, verifiable signature)
but not confirmed against PayFast's actual response. A `POST
/api/payments/payfast/simulate-complete` endpoint (disabled when
`NODE_ENV=production`) exists specifically to exercise the rest of the
pipeline — it builds a genuinely-signed COMPLETE notification and posts it
to the real `/notify` handler, so everything past "did PayFast accept the
payment" is exercised for real. Before taking real payments: test the full
round trip against PayFast's sandbox from a publicly reachable staging
deployment (PayFast's servers need to reach your `notify_url` from the
internet — `localhost` won't work), and implement the server-to-server
confirmation call noted as a TODO in `src/routes/payments.js`.

## Email notifications (Phase 10)

Three triggers, each firing exactly once per real event:
- New enquiry → notifies the studio (`STUDIO_NOTIFICATION_EMAIL`)
- New commission request → notifies the studio
- Order paid → sends the customer a confirmation **and** notifies the
  studio, both from inside the same ITN handler that marks the order paid

**Transport defaults to `console`** — nothing is actually emailed until
`EMAIL_PROVIDER_API_KEY` is set in `.env`, at which point it switches to
sending via [Resend](https://resend.com)'s API. Every attempt, on either
transport, is recorded in the `email_log` table and visible in the admin
panel's Emails tab — so "did this actually send" is always answerable, not
just assumed.

**What's tested vs. not:** every trigger point, every template's content,
and the idempotency guard (PayFast can and does retry ITN calls — a retry
for an already-paid order must not re-send the confirmation email a second
time) were all verified directly. What's *not* tested is a real send via
Resend's live API — `api.resend.com` isn't reachable from this sandboxed
environment. The integration code follows Resend's documented API exactly
(a single authenticated POST); set a real API key and send yourself a test
enquiry to confirm before relying on it.

## What's deliberately not here yet

- The PayFast server-to-server confirmation call (see TODO above) — signature
  verification is real, but this last hardening step is untested here.
- Real email delivery — see the section above; the Resend integration is
  written but untested against Resend's live API from this environment.
- Image upload for the admin (still edits the `image` path as text — real
  file upload with validation per `docs/SECURITY.md` is a follow-up).
- Customer accounts — not part of the MVP per `docs/ARCHITECTURE.md`.

## Security notes specific to this implementation

- Passwords hashed with bcrypt (cost factor 12).
- Admin session is a short-lived (12h) JWT in an `httpOnly`, `sameSite=lax`
  cookie — not readable by frontend JS, not sent cross-site.
- Public write endpoints (`/api/enquiries`, `/api/commissions`,
  `/api/wearable-notify`) and `/api/auth/login` are all rate-limited.
- All admin mutations are recorded in `audit_logs` with who/what/when.
- Every input is validated server-side with `zod` — see `docs/SECURITY.md`
  for the full reasoning.
