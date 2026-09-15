# Design System

## Principle

The artwork is the hero. Every token and component exists to present it without competing with it — restraint over decoration, structure that carries real information rather than ornament.

## Color

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#E8E2D2` | Base background — warm paper, not pure white or the generic AI-cliché cream (`#F4F1EA`) |
| `--paper-deep` | `#DCD3BE` | Alternate section background, form fields |
| `--ink` | `#1A1712` | Primary text, buttons — warm near-black, not pure `#000` |
| `--ink-soft` | `#52493D` | Secondary text, captions, metadata |
| `--rule` | `#B7AB8E` | Hairlines, borders, dividers |
| `--teal` | `#24504B` | Primary accent — links, focus states, "available" status, primary interactive color |
| `--teal-deep` | `#16332F` | Hover state for solid buttons |
| `--rust` | `#7C3224` | Rare accent, reserved for "sold" tags only — never used decoratively |

**Why teal, not terracotta.** Warm cream + terracotta is the most common "AI-generated" visual tell right now. Teal was chosen instead because it recurs naturally across Mohau's own work (the cyan-toned panther series, Tarex, A Quiet Storm) — the accent comes from the art, not a template default.

## Typography

- **Display: Fraunces** (variable, optical size axis) — a serif with real ink-trap character, used for headlines, artwork titles, and pull quotes. Chosen over a generic geometric serif for its printmaking-adjacent personality.
- **Body/UI: IBM Plex Sans** — clean and technical without being anonymous (explicitly not Inter or Roboto).
- Line length capped near 60–64 characters for body copy; serif display type is set at negative letter-spacing (-0.01em) at large sizes to keep it tight rather than airy.

## Layout

- Left-aligned, editorial grid — never centered-hero-with-gradient.
- Asymmetric hero: copy and image share the fold unevenly (55/45), not a stacked centered headline.
- Catalogue grid uses a deliberate hero-card (2×2 span) for the first item, not a uniform card wall.
- One structural device that's genuinely sequential — the exhibitions timeline — is the only place numbering/chronology markers appear, per the rule against decorative numbering.

## Components

| Component | Where used | Notes |
|---|---|---|
| `.card` | Catalogue grid, related works, archive strip | Image + title + medium/dims + price/status; hover = subtle 3.5% image scale, nothing more |
| `.tag` | Card overlay | "Sold" (rust) / "Not for sale" (muted ink) — only appears when status isn't "available" |
| `.status-pill` | Detail page | Same three states, text-based rather than color-only (accessibility: never rely on color alone) |
| `.price-block` | Detail page | Price + one-line acquisition guidance, changes copy based on Buy vs. Enquire logic |
| `.filter-bar` | Catalogue | `aria-pressed` state, keyboard operable, real empty-state message |
| `.timeline` (`.t-row`) | Exhibitions | The one legitimate use of sequential/chronological structure |
| `.split` | Wearable Art teaser, Studio quote | 50/50 image-or-texture panel + copy panel |
| `.form-shell` / `.field` | Commissions, Contact, Wearable notify | Labeled fields, visible focus states, client-side success state, honest "prototype" disclosure |

## Motion

One orchestrated moment: the hero image fades/scales in on load (1.1s, disabled under `prefers-reduced-motion`). Everything else is response-to-action only — card hover, nav open/close, filter button state, form submit → success state. No scroll-triggered fade-ins, no decorative parallax.

## Accessibility floor

- Visible focus ring (`:focus-visible`, teal, 2.5px, offset) on every interactive element
- Status conveyed by text + shape, not color alone
- Mobile nav is a real `<nav>` with `aria-expanded`/`aria-controls`, closes on link selection
- `prefers-reduced-motion` respected globally
- Alt text on every artwork image describes the actual work, not just the filename
- Form fields have associated `<label>` elements, not placeholder-only labeling

## Known CSS gotcha (documented so it isn't reintroduced)

`.works-grid.catalogue` initially outranked the generic `.works-grid` mobile breakpoint rules by specificity, so the catalogue grid didn't collapse to one column on small screens. Fixed by giving `.works-grid.catalogue` its own explicit rule at each breakpoint rather than relying on the base class's rules cascading in. If a new grid variant is added, replicate this pattern rather than assuming the base breakpoints will apply.
