# Database

PostgreSQL. The schema below is the MVP set — enough to run the catalogue, enquiries, and a simple cart/checkout. Deliberately excludes things like `AuditLogs`, `Collections`, or multi-currency support until there's a real need (see "Deferred" at the end).

## Entity-relationship overview

```
Artist (1) ──< Artwork >── (1) ArtworkImage
                 │
                 ├──< InventoryUnit  (1 row per sellable unit — see below)
                 │
Product (T-shirt) ──< ProductVariant ──< InventoryUnit
                 │
Customer ──< Order ──< OrderItem >── InventoryUnit
     │
     ├──< Enquiry
     └──< CommissionRequest

Exhibition (standalone, referenced by Artwork optionally)
AdminUser (separate from Customer — no shared table)
```

## The core design decision: `InventoryUnit`

The brief requires three inventory behaviours to coexist: a one-of-one painting, a numbered print edition, and a T-shirt with sizes. Modelling these as three different product tables would fragment the cart/checkout logic. Instead, every sellable thing — regardless of type — resolves to one or more rows in a single `inventory_units` table:

- A **UNIQUE** original → exactly one `inventory_unit`, `edition_number = NULL`, `edition_size = 1`
- A **LIMITED** print edition of 20 → 20 `inventory_unit` rows, `edition_number = 1..20`, `edition_size = 20`
- A **VARIANT** T-shirt in S/M/L → one `inventory_unit` per size, linked to a `product_variant` (size) rather than an `artwork`

This means the cart, checkout, and "mark as sold" admin action all operate on the same table regardless of product type — the type-specific logic lives only in how units are *created*, not how they're *sold*.

## Tables

### `artists`
Single-row table for MVP (just Mohau), structured as a table rather than hardcoded so the platform isn't rebuilt if a second artist is ever added.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | "Mohau Lethae" |
| display_name | text | "Mohau \"Ravaza\" Lethae" |
| bio | text | Long-form, as on Studio page |
| verified_facts | jsonb | Structured list of claims + source (client-supplied vs. independently verified) — powers the "Source: ..." notices already in the UI |

### `artworks`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| artist_id | uuid FK → artists | |
| slug | text unique | URL slug, e.g. `speru-peru` |
| title | text | |
| medium | text | |
| dimensions_text | text | Free text (e.g. "81cm × 61cm") — see `dimension_confidence` below |
| dimension_confidence | enum(`confirmed`,`unconfirmed`) | Powers the Smangele-style data-quality flag in the UI |
| year_created | int, nullable | Unknown for most current pieces — nullable, not fabricated |
| story | text, nullable | Long-form note; null renders as "no artist statement available yet," never a placeholder blurb |
| acquisition_mode | enum(`buy`,`enquire`,`not_for_sale`) | Drives Buy vs. Enquire button logic |
| base_price_cents | int, nullable | Null when price is "enquire" or POA |
| status | enum(`available`,`sold`,`reserved`,`not_for_sale`) | `reserved` is new vs. the prototype — needed once real checkout exists, to lock a UNIQUE item mid-payment |
| featured | boolean | Homepage selection |
| created_at / updated_at | timestamptz | |

### `artwork_images`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| artwork_id | uuid FK | |
| url | text | CDN URL |
| alt_text | text | Required, not optional — enforced at API level |
| role | enum(`primary`,`detail`,`process`,`in_situ`) | Supports the "close-up detail photography" requirement without a rigid image count |
| sort_order | int | |

### `products` and `product_variants`
For non-artwork sellable things — wearable art initially.
| `products` | Type | Notes |
|---|---|---|
| id | uuid PK | |
| artist_id | uuid FK | |
| slug, title, description | | |
| category | enum(`wearable`,`print_edition`,`other`) | |

| `product_variants` | Type | Notes |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK | |
| size | text, nullable | "M", "L", etc. |
| edition_number / edition_size | int, nullable | For numbered runs |
| price_cents | int | |
| is_one_of_one | boolean | Drives "One of One" badge copy |

### `inventory_units`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| artwork_id | uuid FK, nullable | Set for original artworks |
| product_variant_id | uuid FK, nullable | Set for products (exactly one of the two FKs is non-null — enforced via CHECK constraint) |
| edition_number | int, nullable | |
| status | enum(`available`,`reserved`,`sold`) | Source of truth for "can this be bought right now" |
| reserved_until | timestamptz, nullable | TTL lock during checkout, released if payment isn't completed |

### `customers`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| name, phone | text | |
| shipping_address | jsonb | |
| created_at | timestamptz | |
No password required for MVP — guest checkout with email, order lookup via emailed link. Full accounts are a "should-have," not MVP.

### `orders` / `order_items`
| `orders` | Type | Notes |
|---|---|---|
| id | uuid PK | |
| customer_id | uuid FK | |
| status | enum(`pending_payment`,`paid`,`fulfilled`,`cancelled`,`refunded`) | |
| payment_provider_ref | text | Paystack/PayFast transaction ID |
| subtotal_cents, shipping_cents, total_cents | int | |
| shipping_method | enum(`courier_standard`,`courier_fragile`,`collection`,`international`) | See SECURITY/DEPLOYMENT for why fragile-artwork shipping is a distinct method, not a courier setting |
| created_at | timestamptz | |

| `order_items` | Type | Notes |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK | |
| inventory_unit_id | uuid FK | |
| price_cents | int | Snapshot at time of sale — never recalculated from the live artwork price |

### `enquiries`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| artwork_id | uuid FK, nullable | Set when enquiry originates from a work's "Enquire" button |
| name, email, message | text | |
| status | enum(`new`,`replied`,`closed`) | |
| created_at | timestamptz | |

### `commission_requests`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name, email, brief | text | |
| status | enum(`new`,`quoted`,`accepted`,`in_progress`,`delivered`,`declined`) | |
| quoted_price_cents | int, nullable | |
| created_at | timestamptz | |

### `exhibitions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title, description | text | |
| year | int | |
| verified | boolean | Distinguishes the Sasol-confirmed entry from artist-supplied ones, same transparency pattern as `artists.verified_facts` |
| related_artwork_id | uuid FK, nullable | |

### `admin_users`
Deliberately separate from `customers` — an admin account should never be reachable via the customer signup/login flow. See `SECURITY.md`.

## Deferred (not in MVP schema)

- `collections` (curated groupings beyond featured/category) — add when there's a real curatorial need
- `audit_logs` — add at the same time real admin write access ships (Phase 4), not before
- Multi-currency / multi-language columns — single currency (ZAR), single language (English) until there's demand
- `reviews` / `testimonials` — no review content exists yet; don't build the table until there's data to put in it
