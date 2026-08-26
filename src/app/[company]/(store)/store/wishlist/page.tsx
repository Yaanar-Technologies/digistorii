"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  WishlistComponent,
  StorefrontFooter,
  StorefrontTheme,
  WishlistItemType,
  mockTheme,
  mockFooterSettings,
} from "@/components/storefront";
import { useCartStore } from "@/store/cartStore";

export default function WishlistPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  const [theme] = useState<StorefrontTheme>(mockTheme);
  const [footerSettings] = useState(mockFooterSettings);
  const [items, setItems] = useState<WishlistItemType[]>([
    {
      variantId: 101,
      productName: "Classic Organic Cotton T-Shirt",
      image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80",
      price: 29.99,
      inStock: true,
    },
    {
      variantId: 102,
      productName: "Minimalist Leather Watch",
      image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
      price: 129.0,
      inStock: true,
    },
  ]);

  const addItemToCart = useCartStore((state) => state.addItem);

  const handleAddToCart = (item: WishlistItemType) => {
    addItemToCart({
      id: String(item.variantId),
      name: item.productName,
      price: item.price,
      image: item.image || "",
      quantity: 1,
    });
    router.push(`/${company}/store/cart`);
  };

  const handleRemoveItem = (variantId: number) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between" style={{ fontFamily: theme.fontFamily }}>
      <div>
        <StorefrontHeader
          theme={theme}
          wishlistCount={items.length}
          onOpenCart={() => router.push(`/${company}/store/cart`)}
          onOpenWishlist={() => {}}
        />

        <main className="py-6">
          <WishlistComponent
            theme={theme}
            items={items}
            onAddToCart={handleAddToCart}
            onRemoveItem={handleRemoveItem}
          />
        </main>
      </div>

      <StorefrontFooter theme={theme} settings={footerSettings} />
    </div>
  );
}
