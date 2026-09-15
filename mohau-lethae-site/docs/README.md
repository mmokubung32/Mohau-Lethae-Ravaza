# Mohau "Ravaza" Lethae — Artist & Ecommerce Site

A gallery-and-studio website for South African artist Mohau Lethae, built to hold original artwork sales, a future hand-painted wearable-art line, and the artist's exhibition/community story — without looking or behaving like a generic ecommerce template.

## What's in this repository right now

This is **Phase 1: a static frontend prototype.** There is no live backend, database, or payment processing yet — see `BACKEND-ROADMAP.md` for how that gets added without a redesign.

```
/
├── index.html              Home
├── works.html               Full catalogue (filterable)
├── work-<slug>.html         23 individual artwork detail pages (generated)
├── wearable-art.html        Wearable art — "coming soon" page
├── studio.html               Biography, practice, Sasol/Thuthukani story
├── exhibitions.html          Chronological exhibition record
├── archive.html              Sold / not-for-sale works
├── commissions.html          Commission enquiry flow (prototype form)
├── contact.html              General enquiry (prototype form)
├── css/style.css             Single shared stylesheet (design tokens + components)
├── images/                   Real artwork photography, extracted from the artist's supplied catalogue
└── docs/                     This documentation set
```

## Running it locally

No build step. It's plain HTML/CSS/JS.

```bash
cd mohau-lethae-site
python3 -m http.server 8000
# open http://localhost:8000
```

## How the catalogue pages are generated

All 23 artwork detail pages and the catalogue grid are generated from a single structured data source (title, medium, dimensions, price, status, acquisition type) rather than hand-written per page. When this moves to a real backend, that data source becomes the `products`/`artwork` database table — see `DATABASE.md`. Until then, treat the generator script (not included in this deliverable, but described in `ARCHITECTURE.md`) as the seed for the future admin CMS.

## Known data gaps (do not silently fill these in)

- `Smangele`'s dimensions are unconfirmed (source catalogue listed an implausible 700cm × 600cm).
- `Black Panther Series` (R6,000) is priced as a series of 3; per-piece pricing isn't confirmed.
- Two works reference artist-statement Google Docs that aren't publicly accessible yet.
- The Facebook profile mentioned by the client isn't linked anywhere on the site — no URL was confirmed.

These are flagged in the UI itself (catalogue notices, detail-page notes), not just here.

## Documentation index

| File | Covers |
|---|---|
| `ARCHITECTURE.md` | System design, stack choice and reasoning, MVP vs. later |
| `DESIGN-SYSTEM.md` | Tokens, typography, components, motion principles |
| `DATABASE.md` | Schema, entities, relationships |
| `API.md` | Planned REST endpoints |
| `BACKEND-ROADMAP.md` | Phased implementation plan |
| `SECURITY.md` | Auth, data handling, payment security |
| `DEPLOYMENT.md` | Hosting, environments, CI/CD |
| `CONTENT-GUIDE.md` | What the artist/studio still needs to supply |
