# Phase 1.2 — Storefront Theme Editor UI (Prompt)

Existing file to extend: `page.tsx` (theme customization page — has form
fields, Save Draft / Publish actions, version badge, `apiFetch`, `useUser`,
`Badge` component). Treat this as the base to refactor, not throwaway
reference — reuse its API contract, auth pattern, and button/status UX.
Component library from Phase 1.1A: `src/components/storefront/`.

Goal of this phase: turn the existing flat form + raw-JSON-preview page into
a real editor — same fields, same save/publish flow, but with a live
preview rendered from the actual storefront components instead of a JSON
dump, and the config normalized to the theme contract from 1.1A.

**Do not** touch: the OTP/checkout flow, product data wiring, or anything
under `1.3`. This phase is editor UI + preview only. The publish action
already exists server-side (`?action=publish`) — call it, don't reimplement
it.

## 1. Reconcile the field-naming mismatch first

The existing page stores/reads `snake_case` keys (`logo_url`, `hero_title`,
`hero_subtitle`, `primary_color`, `social_facebook`, …) via
`/api/company/ecom-theme`. The Phase 1.1A component contract expects
`camelCase` (`logoUrl`, `heroTitle`, `heroDescription`, `primaryColor`,
`socialLinks.facebook`, …) and a `bannerImages: string[]` instead of a
single `hero_banner_url`.

Decide and implement ONE of these — don't silently do both:
- **(a)** Add a thin mapping function (`toStorefrontTheme(config)` /
  `fromStorefrontTheme(theme)`) at the API boundary, so the backend keeps
  its existing snake_case shape and the editor + preview components only
  ever see the camelCase `StorefrontTheme` type.
- **(b)** Migrate the stored shape to camelCase directly.

Default to **(a)** unless you tell me the backend schema is easy to change
— it's lower risk and doesn't touch anything server-side. Flag it to me if
you'd rather do (b).

Also decide how `hero_banner_url` (single string) becomes `bannerImages`
(array) — e.g. wrap it as a single-item array for now, with the input UI
still single-image, since multi-banner carousel input isn't asked for here.

## 2. Editor layout

Keep the existing two-column structure (form left, preview right) — it's
already the right pattern, just replace the JSON `<pre>` block with a real
preview. Keep the same section grouping the current page uses (Logo &
Header, Hero, Palette & Typography, Social Links) and add:

- **Layout Variant** — a select control bound to `layoutVariant` (values:
  whatever variants exist in the 1.1A components; if only one layout
  exists so far, still wire the field, just with one option).
- **Hero Description** — the current page only has `heroTitle` /
  `heroSubtitle`; align this with the `heroDescription` field name from the
  contract (see §1).

Keep the UI plain and professional — no illustration/stock imagery, no
decorative icons beyond what the existing page already uses (the Badge
component, plain buttons). The only images that should appear are the
tenant's own logo/banner, rendered inside the live preview itself, not as
editor chrome.

## 3. Live preview panel

Replace the "Appearance Details JSON" panel with an actual rendered
preview:

- Render a representative slice of the storefront using the real
  components from `src/components/storefront/` — at minimum Header + Hero
  + a small fixture set of ProductGrid cards + Footer — passed the
  in-progress form state as `theme` (not yet saved — live as-you-type,
  same as the JSON preview currently is).
- Use the same fixture product/category data from 1.1A here; do not fetch
  real products in this phase.
- Scale/contain the preview (e.g. a bordered frame with a fixed aspect
  ratio or scrollable container) so it reads as "this is the storefront,"
  not just a stack of components on the page.
- If useful, add a simple desktop/mobile width toggle for the preview
  frame — only include this if it's a small addition; skip it if it adds
  real complexity, and tell me you skipped it.

State flow: typing in the form updates local editor state → preview
re-renders from that state on every change → "Save Draft" persists it via
the existing `/api/company/ecom-theme` POST → "Publish" calls the existing
publish endpoint, unchanged from current behavior.

## 4. Keep from the existing page, unchanged

- `apiFetch`, `useUser`, `Badge`, the save/publish button pair and their
  loading/disabled states, the success/error `message` banner, the
  Published-version history card, and the "Open Live Storefront" link.
- The publish gate on `isSetupComplete` (payment/shipping settings) and its
  existing error message.

## 5. Out of scope for this phase

- No new backend routes or schema changes (mapping layer in §1 is
  frontend-only).
- No product/category management UI.
- No undo/version-diff/rollback UI — only current draft vs. current
  published, as today.
- No image upload widget — logo/banner stay URL inputs, as in the current
  page.

## 6. When done, tell me

- Final field-mapping approach used (§1) and the exact shape of
  `toStorefrontTheme` / `fromStorefrontTheme` if you went with (a).
- Which storefront components the live preview actually renders, and which
  it fixture-stubs vs. leaves out.
- Any place you had to guess at a `layoutVariant` value or option list.
