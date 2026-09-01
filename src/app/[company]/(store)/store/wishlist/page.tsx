"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  WishlistComponent,
  StorefrontFooter,
  WishlistItemType,
  mockFooterSettings,
  useStorefrontTheme,
} from "@/components/storefront";
import { useCartStore } from "@/store/cartStore";
import { useWishlistStore } from "@/store/wishlistStore";
import { useStorefrontSync } from "@/hooks/useStorefrontSync";

export default function WishlistPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  // Dynamic storefront sync & live wishlist refetching
  useStorefrontSync(company);

  const theme = useStorefrontTheme();
  const [footerSettings] = useState(mockFooterSettings);

  const wishlistItems = useWishlistStore((state) => state.items);
  const removeFromWishlist = useWishlistStore((state) => state.removeItem);
  const addItemToCart = useCartStore((state) => state.addItem);

  const handleMoveToCart = (item: WishlistItemType) => {
    addItemToCart({
      id: String(item.variantId),
      name: item.productName,
      price: item.price,
      image: item.image || "",
      quantity: 1,
      compareAtPrice: item.compareAtPrice,
      inStock: item.inStock,
    });

    removeFromWishlist(item.variantId);

    if (company) {
      fetch(`/api/tenant/${company}/wishlist?variantId=${item.variantId}`, {
        method: "DELETE",
      }).catch(() => {});

      fetch(`/api/tenant/${company}/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.variantId, quantity: 1 }),
      }).catch(() => {});
    }
  };

  const handleRemoveItem = (variantId: number) => {
    removeFromWishlist(variantId);

    if (company) {
      fetch(`/api/tenant/${company}/wishlist?variantId=${variantId}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between" style={{ fontFamily: theme.fontFamily }}>
      <div>
        <StorefrontHeader
          theme={theme}
          wishlistCount={wishlistItems.length}
          onOpenCart={() => router.push(`/${company}/store/cart`)}
          onOpenWishlist={() => {}}
        />

        <main className="py-6">
          <WishlistComponent
            theme={theme}
            items={wishlistItems}
            onMoveToCart={handleMoveToCart}
            onAddToCart={handleMoveToCart}
            onRemoveItem={handleRemoveItem}
            onContinueShopping={() => router.push(`/${company}/store/products`)}
          />
        </main>
      </div>

      <StorefrontFooter theme={theme} settings={footerSettings} />
    </div>
  );
}
