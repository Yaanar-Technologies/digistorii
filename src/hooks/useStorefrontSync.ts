"use client";

import { useEffect, useRef } from "react";
import { useWishlistStore } from "@/store/wishlistStore";
import { useCartStore } from "@/store/cartStore";

export function useStorefrontSync(company: string) {
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!company) return;

    const syncStores = async () => {
      try {
        // Check storefront customer auth session
        const authRes = await fetch("/api/storefront/auth/me");
        const authData = await authRes.json();

        const isAuth = authData?.authenticated && authData?.customer;

        const localWishlist = useWishlistStore.getState().items;
        const localCart = useCartStore.getState().items;

        if (isAuth) {
          // Logged in: merge guest wishlist & cart to server DB if guest items exist
          if (localWishlist.length > 0) {
            const wlMergeRes = await fetch(`/api/tenant/${company}/wishlist/merge`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ guestItems: localWishlist }),
            });
            const wlMergeData = await wlMergeRes.json();
            if (wlMergeData.success && Array.isArray(wlMergeData.items)) {
              useWishlistStore.getState().setItems(wlMergeData.items);
            }
          } else {
            const wlRes = await fetch(`/api/tenant/${company}/wishlist`);
            const wlData = await wlRes.json();
            if (wlData.success && Array.isArray(wlData.items)) {
              useWishlistStore.getState().setItems(wlData.items);
            }
          }

          if (localCart.length > 0) {
            const cartMergeRes = await fetch(`/api/tenant/${company}/cart/merge`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ guestItems: localCart }),
            });
            const cartMergeData = await cartMergeRes.json();
            if (cartMergeData.success && Array.isArray(cartMergeData.items)) {
              useCartStore.getState().setItems(cartMergeData.items);
            }
          } else {
            const cartRes = await fetch(`/api/tenant/${company}/cart`);
            const cartData = await cartRes.json();
            if (cartData.success && Array.isArray(cartData.items)) {
              useCartStore.getState().setItems(cartData.items);
            }
          }
        } else {
          // Guest user: refresh wishlist price & stock status live on page load
          if (localWishlist.length > 0) {
            const verifyRes = await fetch(`/api/tenant/${company}/wishlist/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: localWishlist }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success && Array.isArray(verifyData.items)) {
              useWishlistStore.getState().setItems(verifyData.items);
            }
          }
        }
      } catch (err) {
        console.error("Storefront sync error:", err);
      }
    };

    if (!syncedRef.current) {
      syncedRef.current = true;
      syncStores();
    }
  }, [company]);
}
