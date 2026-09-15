# Architecture

## Guiding principle

Don't build a platform before the business needs one. This document describes a **headless, API-first architecture** that starts small (the current static prototype, plus a thin API for forms and inventory once needed) and can grow into full ecommerce without a rewrite.

## System overview

```
┌─────────────────────┐        ┌──────────────────────┐        ┌───────────────┐
│  Frontend (Next.js)  │  REST  │   API (Node/Express   │  SQL   │  PostgreSQL   │
│  — this repo, plus   │◄──────►│   or Fastify)         │◄──────►│  (managed,    │
│  server rendering    │  JSON  │   — auth, products,   │        │  e.g. Supabase │
│  for SEO             │        │   orders, enquiries    │        │  / Railway)    │
└─────────┬────────────┘        └───────┬──────────────┘        └───────────────┘
          │                              │
          │                              ├── Payment gateway (PayFast primary, Yoco secondary)
          │                              ├── Image storage/CDN (Cloudinary / S3 + CloudFront)
          │                              ├── Email (Resend / Postmark) — enquiry & order emails
          │                              └── Admin dashboard (same API, separate protected UI)
          │
          └── Static assets served via CDN (Vercel / Netlify edge network)
```

## Why this stack

**Frontend: Next.js (React), not the current static HTML long-term.**
The static prototype exists to prove the design direction fast and cheaply. For production, Next.js gives:
- Server-side rendering for artwork detail pages, which matters for SEO (each artwork should be individually indexable and shareable with correct Open Graph images)
- Built-in image optimisation (critical — this site is image-heavy)
- Incremental Static Regeneration: artwork pages can be statically cached and only rebuilt when the admin changes something, which is fast for visitors and cheap to host
- A clear, well-documented path to add the cart/checkout flow using React state without a framework migration later

An alternative worth naming: a simpler static-site generator (Astro/Eleventy) plus a separate small API would be *lighter* and is defensible if the client never wants server-side personalisation or a login-gated admin UI. Next.js is recommended because the admin dashboard, cart, and account areas (all planned) benefit from one integrated framework rather than stitching a generator and a separate app together.

**Backend: a small REST API, not a monolith CMS.**
A headless approach (custom Node API + Postgres) rather than bolting on Shopify/WooCommerce, because:
- The data model has to represent one-of-one inventory, numbered editions, and standard-variant products side by side — most off-the-shelf commerce platforms treat all products as infinitely restockable variants, which doesn't fit an art catalogue
- The artist needs a simple, purpose-built admin (mark SOLD, upload images, write a story) rather than a general-purpose commerce admin with hundreds of irrelevant settings
- Keeps hosting costs near-zero at low volume (Postgres + a small API server), rather than a monthly platform fee before the business has validated demand

**Database: PostgreSQL.** Relational integrity matters here — an order line item must reference an exact artwork, and a UNIQUE-inventory artwork must never be sold twice. A managed Postgres (Supabase, Railway, or Neon) gives backups, connection pooling, and a free/cheap tier appropriate for MVP volume.

## Environments

- **Production**: live site + live API + live Postgres
- **Staging**: mirrors production, used to test admin changes and payment integration in payment-provider sandbox mode before going live
- **Local**: Docker Compose running Postgres locally, API pointed at it, `.env.local` for the frontend

Environment variables are never committed; see `DEPLOYMENT.md` for the full list and `SECURITY.md` for how secrets are managed.
