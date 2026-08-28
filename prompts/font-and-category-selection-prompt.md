# Font Typography Fix + Header Category Selection

Two independent fixes/features, bundled because both touch the theme
editor form + live preview in the same file:
`src/app/[company]/(user)/workspace/ecom-config/theme/page.tsx`.

Don't break: color theming (confirmed working), the theme provider/context
work from the previous pass, save/publish flow, or any existing component
prop signatures.

## Part A — Font typography not actually rendering

### A1. Diagnose first

Confirm this hypothesis before fixing: colors work because they're set as
inline styles (`backgroundColor: theme.primaryColor` etc.), which the
browser always honors. Font is likely different — `fontFamily:
theme.fontFamily` (e.g. `"Outfit"`)` only works if that font's actual files
are loaded in the browser. If "Outfit"/"Roboto"/"Georgia" aren't loaded
via `next/font` or a Google Fonts `<link>`, setting the CSS property does
nothing — the browser silently falls back to whatever's already
available, which looks like "the setting didn't work" but is really "the
font was never loaded." Check the current `<head>`/layout for any font
loading at all before assuming this diagnosis, but this is the most
likely cause.

### A2. Fix — dynamic Google Fonts loading (not `next/font`)

Deliberately **not** using `next/font/google`, even though the dropdown
only has 4 options today — the goal is for tenants to eventually pick
from any Google Font without a code change or redeploy. `next/font`
requires each font to be known and imported at build time, so it doesn't
fit that direction. Build the loading mechanism to be font-name-agnostic
from the start:

- In the root layout (or wherever `<head>` is controlled), always add
  `<link rel="preconnect" href="https://fonts.googleapis.com">` and
  `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous">`
  unconditionally — this doesn't depend on which font is selected and
  speeds up whatever font loads next.
- Given a font family name string (`theme.fontFamily`, e.g. `"Outfit"`),
  construct the Google Fonts CSS2 API URL directly:
  `https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700&display=swap`
  (`display=swap` matters — it shows fallback text immediately and swaps
  once the real font loads, instead of invisible text while waiting).
  Write this as a small utility, e.g. `getGoogleFontUrl(fontFamily:
  string): string`, so it works for any font name, not just the 4
  currently in the dropdown.
- **Inject this link server-side, not client-side**, wherever the theme
  is fetched (the layout-level fetch from the theme-provider pass). Since
  that fetch already happens server-side per the previous phase, add the
  `<link>` tag into that same server-rendered `<head>` so the font starts
  loading as part of the initial HTML response — this avoids the worst
  version of the flash-of-unstyled-text problem, where the font request
  doesn't even start until after JS hydrates.
- `"Georgia"`/`"serif"` stays a system font, skip the Google Fonts link
  for that case — check for it explicitly and fall back to plain
  `font-family: Georgia, serif`.
- Apply the resolved font family (the literal Google font name string,
  since there's no CSS variable indirection here) via the same
  `fontFamily` style application already used for colors — inline style
  at the theme wrapper level.

This means: growing the editor's dropdown from 4 fonts to 40 later is
purely a data/UI change (more `<option>`s, or eventually a searchable
Google Fonts picker) — the loading mechanism itself needs no changes.

### A2b. Editor preview is client-side — handle separately

The theme editor's live preview updates on every keystroke, client-side —
it can't use the server-injected `<link>` approach from A2 (that's for
the public, server-rendered pages). For the editor preview specifically,
dynamically insert/replace a `<link>` element in `document.head` when
`fontFamily` changes (e.g. in a `useEffect` keyed on `theme.fontFamily`),
using the same `getGoogleFontUrl` utility so there's one source of truth
for building the URL. A brief flash while switching fonts in the editor
is fine and expected — it doesn't need the same flash-avoidance rigor as
the live public site.

### A3. Audit for overrides

Check `StorefrontHeader`, `Hero`, `ProductGrid`, `Footer`, and other
storefront components for hardcoded Tailwind font classes (`font-sans`,
`font-serif`, etc.) — these set `font-family` explicitly via CSS and will
silently win over an inherited value from a parent wrapper. Remove any
that would block the theme's font from cascading down; only actual
weight/style classes (`font-bold`, `italic`) should remain.

### A4. Confirm on both editor preview and live pages

The editor's live preview wrapper currently has no `fontFamily` applied
to it at all (only color is threaded through `liveStorefrontTheme`) —
add it there too, in the same
way as the theme-provider work applied it to public pages, so switching
the dropdown visibly changes the preview font, not just the published
site.

## Part B — Header category selection (curated subset, not full tree)

Right now the header shows either nothing or would show the entire flat
category tree if wired naively — not usable given real data has 3+ levels
(e.g. Silk → Kanjivaram Silk → Butta Kanjivarams). Tenant should
explicitly choose which categories (from any level) appear in the header
nav — e.g. just "Silk" and "Cotton", not their sub-branches.

### B1. Data shape

Add `featuredCategoryIds: number[]` to `StorefrontTheme` (and
`featured_category_ids` to the snake_case `ThemeConfig`/backend shape,
wired through `toStorefrontTheme`/`fromStorefrontTheme` the same way
existing fields are). Stored inside `draft_theme`/`published_theme` like
everything else — no new table needed.

### B2. Editor UI — category picker

Add a new section to the theme editor form (same card style as existing
sections) that:
- Fetches the tenant's full category tree (locate the existing endpoint
  that serves categories in the workspace/admin side — likely already
  used by Product Catalog/Inventory; reuse it, don't build a second one).
- Renders it as a flat checklist using `path_string` for readability (e.g.
  "Silk", "Silk > Kanjivaram Silk", "Silk > Kanjivaram Silk > Butta
  Kanjivarams") so the tenant can tick any node at any level.
- Selected IDs go into `featuredCategoryIds`, included in the save/publish
  payload like every other field.
- No hard cap enforced in code, but consider a light UI nudge (e.g. "X
  selected") since a header nav with 15 items would be unusable — flag
  this to me rather than silently capping it.

### B3. Public header — filter to selection

Wherever the public storefront fetches categories for header nav (the
categories endpoint/wiring from the theme-provider pass), filter the full
tree down to just the categories whose `id` is in
`theme.featuredCategoryIds` for header display. The **full tree** should
still be available and used for the actual category/filter browsing pages
— this filtering is header-nav-only, not a restriction on what's
shop-able.

### B4. Backward compatibility

If `featuredCategoryIds` is empty/undefined (existing tenants who haven't
set this yet), fall back to showing top-level (`level = 1`) categories in
the header, so nothing breaks for tenants who published before this
feature existed.

## When done, tell me

- Confirmed root cause of the font bug (A1) and which fix path you took.
- Which existing category endpoint you reused for B2, or whether none
  existed and you had to add one.
- Whether the empty-selection fallback (B4) is in place.