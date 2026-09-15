# API

REST, JSON, versioned under `/api/v1`. Public read endpoints are unauthenticated; write endpoints require either a customer session (checkout) or an admin session (catalogue management).

## Public — catalogue

```
GET  /api/v1/artworks
     ?status=available|sold|not_for_sale   filter by status
     ?featured=true                         homepage selection
     → [{ id, slug, title, medium, dimensions_text, dimension_confidence,
          price_cents, acquisition_mode, status, primary_image_url }]

GET  /api/v1/artworks/:slug
     → full artwork record + images[] + related (same as detail page today)

GET  /api/v1/products                      wearable art / editions
GET  /api/v1/products/:slug

GET  /api/v1/exhibitions
GET  /api/v1/artist                         bio, verified_facts
```

## Public — enquiries & commissions (write, no auth required)

```
POST /api/v1/enquiries
     body: { artwork_id?, name, email, message }
     → 201 { id, status: "new" }
     Rate-limited (see SECURITY.md). Triggers an email to the studio inbox
     and a confirmation email to the sender.

POST /api/v1/commission-requests
     body: { name, email, brief }
     → 201 { id, status: "new" }

POST /api/v1/wearable-notify
     body: { email }
     → 201  (simple list signup, no confirmation email needed for MVP)
```

## Cart & checkout (Phase 2 — not in MVP)

```
POST /api/v1/cart                          create a cart, returns cart_id (stored client-side)
POST /api/v1/cart/:id/items                 { inventory_unit_id, qty }
     → reserves the inventory_unit (status → reserved, reserved_until = now()+15min)
     → 409 if already reserved/sold — surfaced in the UI as "just sold, sorry"

DELETE /api/v1/cart/:id/items/:item_id      releases the reservation

POST /api/v1/checkout/:cart_id
     body: { customer: {email,name,shipping_address}, shipping_method }
     → creates a pending_payment order, returns a payment_provider redirect URL

POST /api/v1/webhooks/payment                provider webhook (Paystack/PayFast)
     → verifies signature, marks order paid, marks inventory_units sold,
       sends confirmation email. This is the ONLY place inventory status
       flips to "sold" — never done client-side.
```

## Admin (auth required — see SECURITY.md)

```
POST   /api/v1/admin/login
POST   /api/v1/admin/artworks
PATCH  /api/v1/admin/artworks/:id            incl. status changes (mark SOLD / NFS)
POST   /api/v1/admin/artworks/:id/images     multipart upload → stored via image
                                              pipeline (see DEPLOYMENT.md), returns URL
DELETE /api/v1/admin/artworks/:id/images/:imageId

POST   /api/v1/admin/products
PATCH  /api/v1/admin/products/:id
POST   /api/v1/admin/products/:id/variants

GET    /api/v1/admin/orders
PATCH  /api/v1/admin/orders/:id              fulfilment status, tracking number

GET    /api/v1/admin/enquiries
PATCH  /api/v1/admin/enquiries/:id           mark replied/closed

GET    /api/v1/admin/commission-requests
PATCH  /api/v1/admin/commission-requests/:id  quote, accept, decline
```

## Conventions

- All money as integer cents (`price_cents`), formatted client-side — never floats.
- All timestamps ISO 8601 UTC.
- Errors: `{ error: { code, message } }`, standard HTTP status codes (400 validation, 401/403 auth, 404, 409 conflict — used specifically for "inventory just sold," 429 rate-limited, 500).
- Every list endpoint paginated (`?page=&per_page=`, default 24) once the catalogue grows past MVP size — not needed at 23 works, but the shape should be there from the start so the frontend doesn't need rework later.
- Idempotency key required on `POST /checkout` to prevent duplicate orders on retry/double-click.
