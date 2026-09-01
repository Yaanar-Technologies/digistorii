Implement a production-grade Cart & Wishlist system for the storefront, replacing 
the current mock/disconnected implementation.

CONTEXT:
- CartDrawer.tsx, WishlistComponent.tsx, and cart/page.tsx already exist as UI.
- useCartStore (Zustand) exists but wishlist has no store — the wishlist page 
  currently renders static/mock data, and the wishlist buttons in ProductGrid 
  and ProductDetail are non-functional (no onClick logic, no state).

REQUIREMENTS:

1. Create `useWishlistStore` (Zustand, mirroring useCartStore's shape) with:
   - items: WishlistItemType[]
   - addItem(item), removeItem(variantId), isInWishlist(variantId), clearWishlist()
   - Persist to localStorage via Zustand's `persist` middleware for guest users.

2. Wire up the wishlist heart button in ProductGrid.tsx and ProductDetail.tsx:
   - onClick toggles item in useWishlistStore (add if absent, remove if present)
   - Button visual state (filled/outline heart) reflects isInWishlist(variantId)
   - No page reload; instant optimistic UI update.

3. Auth-aware persistence layer:
   - Guest (no session): all reads/writes go to useWishlistStore's localStorage-persisted state.
   - On login success: call a merge function that:
       a. POSTs the local guest wishlist items to `/api/wishlist/merge`
       b. Backend upserts into `wishlist_items(user_id, variant_id, added_at)`, 
          deduping by variant_id
       c. Refetches the authoritative server wishlist
       d. Clears the guest localStorage wishlist after successful merge
   - Authenticated session: useWishlistStore syncs with backend on mount 
     (GET /api/wishlist) and every mutation calls the corresponding API 
     (POST /api/wishlist, DELETE /api/wishlist/:variantId) with optimistic 
     local updates + rollback on failure.

4. Apply the identical guest→auth merge pattern to useCartStore (same logic, 
   cart_items table instead of wishlist_items, quantity resolved as max(local, server) 
   or sum — confirm which business rule).

5. Update WishlistComponent and cart/page.tsx to consume the real stores instead 
   of any placeholder/mock arrays — remove all mock data.

6. Handle out-of-stock and price-changed states for saved-for-later wishlist 
   items (already partially handled in WishlistComponent's inStock flag — 
   ensure this reflects live product data, not stale snapshot data, by 
   refetching current price/stock for wishlist items on page load rather 
   than trusting cached values).

7. Edge cases to cover explicitly:
   - User adds to wishlist while logged out, logs in — item must appear, not vanish.
   - User has wishlist items on two devices while logged in — both must reconcile 
     to the same server state (no device-local staleness).
   - Duplicate add (double-click) does not create duplicate entries.
   - Removing last item shows the existing empty state (already built in 
     WishlistComponent — just needs real data driving it).

Do NOT use cookies for storing wishlist/cart item data itself (size limits, 
sent on every request). Cookies/localStorage are only for the guestId/session 
token used to identify which local state belongs to whom.