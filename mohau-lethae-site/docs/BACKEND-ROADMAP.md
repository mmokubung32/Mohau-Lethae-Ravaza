# Backend Roadmap

Phased so the artist gets real value (a real catalogue he can update himself) long before full checkout exists. Each phase is shippable on its own.

---

### Phase 1 — Database
**What:** Stand up Postgres, run migrations for `artists`, `artworks`, `artwork_images`, `exhibitions` (the read-only content tables — commerce tables come in Phase 5).
**Why first:** Nothing else can be built or tested against real data until this exists.
**Files:** `/db/migrations/`, `/db/seed.ts` (seed with the 23 real works already in `data.py`).
**Env vars:** `DATABASE_URL`.
**Testing:** Migration up/down runs cleanly; seed script produces 23 artworks matching the current static site exactly (regression check against the prototype).
**Deployment:** Managed Postgres (Supabase or Railway) — staging instance first.

### Phase 2 — API (read-only)
**What:** `GET /artworks`, `GET /artworks/:slug`, `GET /exhibitions`, `GET /artist`.
**Why:** Lets the frontend swap from static-generated data to live data with zero visual change — proves the API before anything depends on it.
**Files:** `/api/src/routes/artworks.ts`, `/api/src/routes/exhibitions.ts`.
**DB changes:** none (Phase 1 covers it).
**Dependencies:** Fastify or Express, `pg`/Prisma.
**Testing:** Contract tests — API response shape matches `API.md` exactly; frontend integration test loads `works.html`-equivalent page from live API and diffs against the static version.

### Phase 3 — Authentication (admin only)
**What:** `admin_users` table, login endpoint, session/JWT middleware.
**Why:** Required before any write endpoint can safely exist. Deliberately built before the admin UI, not alongside it.
**Files:** `/api/src/auth/`.
**Env vars:** `JWT_SECRET`, `SESSION_COOKIE_SECRET`.
**Testing:** No route under `/admin/*` reachable without a valid session — automated test that asserts 401 on every admin route with no auth header.
**Security note:** No customer-facing accounts yet — see `SECURITY.md` on why admin and customer auth are never shared.

### Phase 4 — Admin (catalogue management)
**What:** Simple admin UI (separate route, e.g. `/studio-admin`) — list artworks, edit, change status (available/sold/reserved/NFS), upload images.
**Why now:** This is the single highest-value phase for the artist — he can update his own catalogue without needing a developer, which was one of the brief's explicit goals.
**Files:** `/admin-app/` (small React app or a Next.js route group), `/api/src/routes/admin/artworks.ts`.
**DB changes:** add `audit_logs` table here (first real write access is exactly when audit logging earns its cost).
**Dependencies:** image upload library, signed-URL upload to storage.
**Testing:** E2E test — log in, mark an artwork SOLD, confirm it disappears from `GET /artworks?status=available` and appears in the archive filter.
**Deployment:** Behind the same auth as Phase 3; not indexed by search engines (`noindex`).

### Phase 5 — Products & inventory (commerce data model)
**What:** `products`, `product_variants`, `inventory_units` tables live (see `DATABASE.md`); admin can create a wearable-art product with sizes, or convert an artwork to have real sellable inventory units instead of a static price field.
**Why this order:** Nothing in checkout can be built correctly until UNIQUE/LIMITED/VARIANT inventory actually exists as distinct rows — building cart/checkout against the old flat `price_cents` field would need a rewrite later.
**DB changes:** the three tables above, plus `artworks.status` gains the `reserved` value.
**Testing:** Unit tests for the three creation paths (one-of-one, numbered edition, sized variant) each producing the correct `inventory_unit` rows.

### Phase 6 — Cart
**What:** `POST /cart`, add/remove item, 15-minute reservation lock on `inventory_units`.
**Why before checkout:** Reservation logic (preventing two people buying the same one-of-one painting) is the hard part and needs to be correct and tested in isolation before payment is layered on top.
**Testing:** Concurrency test — two simultaneous adds for the same UNIQUE item, exactly one succeeds, the other gets a 409.

### Phase 7 — Checkout (no payment yet)
**What:** Collect customer + shipping details, create a `pending_payment` order, compute shipping cost by `shipping_method` (see below — art vs. garment shipping differ).
**Files:** `/api/src/routes/checkout.ts`.
**DB changes:** `orders`, `order_items`, `customers`.
**Testing:** Order total matches cart total exactly; abandoning checkout releases the inventory reservation after TTL.

### Phase 8 — Payments
**What:** Integrate a South African gateway (see recommendation below), webhook handler that's the *only* place an order flips to `paid` and inventory flips to `sold`.
**Env vars:** `PAYMENT_PROVIDER_SECRET_KEY`, `PAYMENT_PROVIDER_WEBHOOK_SECRET`.
**Testing:** Full sandbox purchase flow; webhook signature verification test with a deliberately-tampered payload (must be rejected).
**Provider recommendation:** Start with **PayFast** (~3.5% + R2, no monthly/setup fee, T+1–2 settlement to a South African bank account, and the widest local method coverage — cards, Instant EFT, SnapScan, Zapper — which matters when several works sit at R700–R3,000 and buyers may not have a credit card). Add **Yoco** (~2.95%, no monthly fee) as a second gateway once volume justifies it, particularly if Mohau ever sells in person at an exhibition and wants one dashboard for both online and card-machine sales. Paystack is not recommended here — it's built primarily around the Nigerian market and its USD settlement pilot explicitly excludes South Africa, so a South African studio gets none of its main advantage. Peach Payments is worth a second look only once international-card volume is real. *Confirm current published rates directly with each provider before committing — pricing pages change.*

### Phase 9 — Shipping
**What:** Distinct shipping logic per `shipping_method`: standard courier (wearable art, small prints), fragile-art courier (larger framed originals — different packaging cost and carrier), collection (Orange Farm/Vaal-area buyers), international (manual quote, not automated at MVP).
**Why distinct:** A 173cm × 104cm framed piece and a T-shirt cannot share a flat shipping rate without either overcharging garment buyers or undercharging on large artwork — flagged explicitly in the original brief and worth respecting in the data model (Phase 5) as well as here.
**Testing:** Rate calculation returns correct cost per method; international requests correctly route to "we'll quote you" rather than a live rate.

### Phase 10 — Email notifications
**What:** Order confirmation, enquiry received (customer + studio), commission status updates.
**Dependencies:** Resend or Postmark (both have generous free tiers, better deliverability than raw SMTP for a small studio's volume).
**Env vars:** `EMAIL_PROVIDER_API_KEY`, `STUDIO_NOTIFICATION_EMAIL`.
**Testing:** Snapshot test on email templates; confirm enquiry emails fire within the rate limit (see Security) without duplicate sends on retry.

### Phase 11 — Deployment & CI/CD
See `DEPLOYMENT.md` for hosting choice and full environment variable list. Set up staging → production promotion with the payment provider in sandbox mode on staging only.

### Phase 12 — Security hardening
Input validation on every write endpoint, rate limiting on public write endpoints (enquiries, commission requests, wearable notify), file upload validation on admin image uploads, secrets audit. See `SECURITY.md` — this phase is a checklist review, not new features, and should happen before Phase 8 goes fully live even though it's listed last here.

### Phase 13 — Testing & QA
Full regression pass: automated (unit + integration + the E2E flows named per phase above) plus a manual Playwright visual sweep across breakpoints on every new page, matching the process already used on the current prototype.

---

## Must-have vs. should-have vs. future

**Must-have (MVP):** Phases 1–4 (real, artist-editable catalogue) plus Phases 6–8 restricted to the *lower-value, buy-now* works only (see `DATABASE.md`'s `acquisition_mode`). High-value "Enquire" works never need a cart at all — the existing contact-form flow already serves them.

**Should-have (once MVP validates demand):** Full Phase 5 product/variant system for wearable art once the first garments are actually ready to sell; Phase 9's fragile-art shipping logic once framed originals are shipping in volume rather than mostly local collection.

**Future:** customer accounts/login, multi-currency, commission-specific milestone payments, a proper CMS for long-form Studio/Story content if it starts changing often enough to be painful in a database field.
