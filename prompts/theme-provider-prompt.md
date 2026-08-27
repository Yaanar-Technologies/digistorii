# Storefront Theme Provider — Apply Published Theme Across All Pages

Goal: right now only `src/app/[company]/(store)/store/page.tsx` (home)
fetches and applies theme. Every other storefront route — products
listing, product detail, cart, wishlist, checkout, sign-in — has no theme
of its own, so it renders with component defaults instead of the tenant's
saved colors/font/logo. Fix this **once, centrally**, not page-by-page.

Do not change: the theme data shape, the public theme endpoint built in
the last bugfix pass, the editor, or any component's existing `theme`
prop signature (`StorefrontHeader`, `ProductGrid`, `CartDrawer`, etc.
already accept `theme` correctly — confirmed working on home). This phase
is purely about **getting that same theme object to every page**, not
changing how components use it.

## 1. Fetch theme once, at the layout level

Add (or edit, if a shell layout already exists) `src/app/[company]/(store)/layout.tsx`. This wraps every route under `(store)`.

- Fetch the public theme (the endpoint added in the previous bugfix —
  `published_theme` only) **once here**, server-side if the layout can be
  a server component, otherwise client-side with a loading state that
  covers all child routes (not per-page spinners).
- Provide the fetched theme down via a small React context, e.g.
  `StorefrontThemeContext` / `useStorefrontTheme()`, defined alongside the
  other storefront types/exports (`src/components/storefront/` or a new
  `theme-context.tsx` there).
- While loading, show one shared loading state at the layout level — don't
  duplicate a "Loading storefront..." per page.
- If the fetch fails, fall back to `mockTheme` (existing behavior) rather
  than breaking the page — same graceful-degradation as today, just
  centralized.

## 2. Migrate the home page to consume context instead of fetching its own

In `store/page.tsx`, remove its local `themeRes` fetch and `theme` state;
replace with `const theme = useStorefrontTheme();`. Everything else on
that page (products fetch, cart, wishlist, auth) stays exactly as-is —
only the theme source changes.

## 3. Wire theme into every other storefront page

For each of: products listing, product detail, cart, wishlist, checkout,
sign-in — wherever these pages currently render with no theme or a
hardcoded default, pull `theme` from `useStorefrontTheme()` and pass it
into the same components already built to accept it (`StorefrontHeader`,
`StorefrontFooter`, `CartDrawer`, etc.), plus apply
`style={{ fontFamily: theme.fontFamily }}` at each page's root wrapper,
same as home does today. If any of these pages don't exist yet as real
routes (only scaffolded), wire theme into the scaffold as part of this
pass — don't leave any page still defaulting.

## 4. Sanity check before calling this done

- Open products, PDP, cart, wishlist, and checkout pages after a theme
  save+publish with a distinctive color and font, and confirm all of them
  visually match home — not just spot-check one.
- Confirm nothing about product data fetching, cart state, or auth was
  touched — this pass should be theme-only.

## 5. When done, tell me

- Whether the layout ended up server or client component, and why.
- Which pages didn't exist yet and got theme wired into their scaffold as
  part of this (vs. pages that already existed and just needed the
  context swap).
- Confirm the fallback-to-`mockTheme` behavior still works if the theme
  fetch fails.
