# Deployment

## Current state (this deliverable)

The static prototype in this repository can be deployed as-is to any static host — Vercel, Netlify, Cloudflare Pages, or even a basic shared host — since it's plain HTML/CSS/JS with no build step. This is a reasonable way to get the design in front of real visitors and start collecting genuine interest before any backend work begins.

## Target production setup (once the backend is built)

| Piece | Recommendation | Why |
|---|---|---|
| Frontend + API (Next.js) | **Vercel** | Zero-config deploys from Git, automatic preview URLs per pull request (useful for a solo/small dev team reviewing changes before they go live), built-in image optimisation and edge CDN — matches the Next.js recommendation in `ARCHITECTURE.md`. |
| Database | **Supabase** (managed Postgres) or **Neon** | Managed backups, connection pooling, generous free tier appropriate for pre-revenue-validation traffic, straightforward migration path from local Postgres in development. |
| Image/file storage | **Cloudflare R2** or **Supabase Storage** | S3-compatible, cheap at this scale, integrates with a CDN for fast artwork image delivery without hosting large files inside the app itself. |
| Email | **Resend** or **Postmark** | Reliable deliverability for enquiry/order notification emails without running a mail server. |
| Domain/DNS | Whichever registrar the client already owns the domain through, pointed at Vercel via standard DNS records | No reason to introduce a new registrar relationship for this project alone. |

## Environments

- **Production** — live domain, live database, live payment credentials (never in sandbox mode).
- **Staging** — a separate Vercel deployment (or preview deployment) pointed at a separate staging database, payment provider in **sandbox/test mode only**. Used to verify admin changes and test the payment flow safely before anything touches real money.
- **Local development** — Postgres via Docker Compose, `.env.local` for the frontend/API, seeded from `db/seed.ts` with the 23 real artworks already documented in this repo so local development always has realistic data to work against.

## Environment variables (planned — none exist yet in the static prototype)

```
DATABASE_URL=
JWT_SECRET=
SESSION_COOKIE_SECRET=
PAYMENT_PROVIDER_SECRET_KEY=       # PayFast merchant credentials
PAYMENT_PROVIDER_WEBHOOK_SECRET=
EMAIL_PROVIDER_API_KEY=
STUDIO_NOTIFICATION_EMAIL=
IMAGE_STORAGE_BUCKET=
IMAGE_STORAGE_ACCESS_KEY=
IMAGE_STORAGE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=              # public, safe to expose — used for canonical/OG tags
```

A `.env.example` file with these names (no values) should be committed alongside the real backend code so a new developer can set up locally without guessing what's required — see `SECURITY.md` for why real values are never committed.

## CI/CD

- Every pull request gets an automatic Vercel preview deployment — the actual mechanism for the "design critique loop" described in the original brief going forward: review the real rendered site on a real URL before merging, not just the diff.
- On merge to `main`: run the test suite (contract tests against `API.md`, the concurrency test for inventory reservation, and a Playwright visual/accessibility sweep matching the process already used to QA this prototype) before deploying to production automatically.
- Database migrations run as a required, explicit step in the deploy pipeline — never applied ad hoc against production.

## Rollback

- Vercel deployments are immutable and instantly revertible to any previous deployment — no special rollback tooling needed for the frontend/API layer.
- Database migrations should be written to be reversible where practical (Prisma migration down scripts), and a tested backup-restore process (see `SECURITY.md`) is the fallback for anything a migration rollback can't cleanly undo.

## Performance notes specific to this site

Given how much of the brief is about respecting large, high-quality artwork photography without becoming slow:
- Serve images through Next.js's `<Image>` component (or an equivalent CDN-backed pipeline) so responsive sizes and modern formats (WebP/AVIF) are generated automatically rather than shipping one oversized JPEG to every device.
- Lazy-load below-the-fold artwork images (already the pattern used in this static prototype's `loading="lazy"` attributes — carry it forward).
- Cache artwork detail pages aggressively (ISR with on-demand revalidation triggered by the admin's "save" action), since artwork content changes rarely but is read often.
