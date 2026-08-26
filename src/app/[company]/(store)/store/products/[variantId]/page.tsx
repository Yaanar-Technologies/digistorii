"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  ProductDetail,
  StorefrontFooter,
  CartDrawer,
  CustomerAuthModal,
  StorefrontTheme,
  StorefrontProduct,
  CartItemType,
  mockTheme,
  mockFooterSettings,
} from "@/components/storefront";
import { useCartStore, type CartItem } from "@/store/cartStore";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";
  const variantId = Number(params.variantId || 0);

  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<StorefrontTheme>(mockTheme);
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);

  const cartItems = useCartStore((state) => state.items);
  const addItemToCart = useCartStore((state) => state.addItem);
  const removeItemFromCart = useCartStore((state) => state.removeItem);
  const updateItemQty = useCartStore((state) => state.updateQuantity);

  useEffect(() => {
    if (!company || !variantId) return;

    const loadProduct = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/tenant/${company}/products`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.products)) {
            const found = data.products.find((p: any) => Number(p.id) === variantId);
            if (found) {
              setProduct({
                variantId: Number(found.id),
                name: found.products.name,
                images: found.product_images || ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"],
                effectivePrice: Number(found.product_pricing.price || 0),
                inStock: true,
                sortOrder: 1,
                description: "Premium crafted merchandise designed for ultimate comfort and durability.",
                options: [
                  { name: "Size", values: ["Standard"] },
                ],
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to load product detail:", err);
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [company, variantId]);

  const convertedCartItems: CartItemType[] = cartItems.map((ci: CartItem) => ({
    variantId: Number(ci.id),
    productName: ci.name,
    image: ci.image,
    price: ci.price,
    quantity: ci.quantity,
    inStock: true,
  }));

  const handleAddToCart = (
    itemProduct: StorefrontProduct,
    selectedOptions: Record<string, string>,
    quantity: number
  ) => {
    addItemToCart({
      id: String(itemProduct.variantId),
      name: itemProduct.name,
      price: itemProduct.effectivePrice,
      image: itemProduct.images[0],
      quantity: quantity || 1,
    });
    setIsCartOpen(true);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 bg-gray-50">
        Loading product details...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-gray-500 bg-gray-50">
        <p className="text-lg font-semibold">Product not found</p>
        <button
          onClick={() => router.push(`/${company}/store/products`)}
          className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white"
        >
          Back to Catalog
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: theme.fontFamily }}>
      <StorefrontHeader
        theme={theme}
        cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      <main className="py-8">
        <ProductDetail
          theme={theme}
          product={product}
          onAddToCart={handleAddToCart}
          onToggleWishlist={() => setIsWishlisted(!isWishlisted)}
          isWishlisted={isWishlisted}
        />
      </main>

      <StorefrontFooter theme={theme} settings={mockFooterSettings} />

      <CartDrawer
        theme={theme}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={convertedCartItems}
        onUpdateQuantity={(vId, newQty) => {
          if (newQty <= 0) removeItemFromCart(String(vId));
          else updateItemQty(String(vId), newQty);
        }}
        onRemoveItem={(vId) => removeItemFromCart(String(vId))}
        onCheckout={() => {
          setIsCartOpen(false);
          router.push(`/${company}/store/checkout`);
        }}
      />

      <CustomerAuthModal
        theme={theme}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </div>
  );
}
