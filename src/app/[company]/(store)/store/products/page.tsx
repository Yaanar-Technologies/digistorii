"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  StorefrontHeader,
  ProductGrid,
  StorefrontFooter,
  CartDrawer,
  CustomerAuthModal,
  StorefrontProduct,
  CategoryType,
  FooterSettings,
  CartItemType,
  mockFooterSettings,
  useStorefrontTheme,
} from "@/components/storefront";
import { useCartStore, type CartItem } from "@/store/cartStore";

export default function StoreProductsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const company = (params.company as string) || "";

  const theme = useStorefrontTheme();
  const [footerSettings] = useState<FooterSettings>(mockFooterSettings);
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const cartItems = useCartStore((state) => state.items);
  const addItemToCart = useCartStore((state) => state.addItem);
  const removeItemFromCart = useCartStore((state) => state.removeItem);
  const updateItemQty = useCartStore((state) => state.updateQuantity);

  useEffect(() => {
    const categoryParam = searchParams.get("category");
    if (categoryParam) {
      setSelectedCategory(categoryParam);
    } else {
      setSelectedCategory("all");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!company) return;

    const loadData = async () => {
      try {
        const res = await fetch(`/api/tenant/${company}/products`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.products)) {
            const mappedProducts: StorefrontProduct[] = data.products.map((p: any) => ({
              variantId: Number(p.id),
              name: p.products.name,
              category: p.products.category || "General",
              images: p.product_images || ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"],
              effectivePrice: Number(p.product_pricing.price || 0),
              inStock: Number(p.available_qty ?? 0) > 0,
              sortOrder: 1,
            }));
            setProducts(mappedProducts);
          }
        }

        const catRes = await fetch(`/api/tenant/${company}/categories`);
        if (catRes.ok) {
          const catData = await catRes.json();
          if (catData.success && Array.isArray(catData.categories)) {
            setCategories(catData.categories);
          }
        }
      } catch (err) {
        console.error("Error loading products page:", err);
      }
    };

    loadData();
  }, [company]);

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    if (!cat || cat.toLowerCase() === "all") {
      router.push(`/${company}/store/products`);
    } else {
      router.push(`/${company}/store/products?category=${encodeURIComponent(cat)}`);
    }
  };

  const convertedCartItems: CartItemType[] = cartItems.map((ci: CartItem) => ({
    variantId: Number(ci.id),
    productName: ci.name,
    image: ci.image,
    price: ci.price,
    quantity: ci.quantity,
    inStock: true,
  }));

  const handleAddToCart = (product: StorefrontProduct) => {
    addItemToCart({
      id: String(product.variantId),
      name: product.name,
      price: product.effectivePrice,
      image: product.images[0],
      quantity: 1,
    });
    setIsCartOpen(true);
  };

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: theme.fontFamily }}>
      <StorefrontHeader
        theme={theme}
        categories={categories}
        cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
        wishlistCount={wishlistIds.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSelectCategory={handleSelectCategory}
        onSearch={(q) => router.push(`/${company}/store/products?search=${encodeURIComponent(q)}`)}
      />

      <main className="py-6">
        <ProductGrid
          theme={theme}
          products={products}
          categories={categories.map((c) => c.name)}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          initialSearch={searchParams.get("search") || ""}
          onProductClick={(p) => router.push(`/${company}/store/products/${p.variantId}`)}
          onAddToCart={handleAddToCart}
          onToggleWishlist={(p) =>
            setWishlistIds((prev) =>
              prev.includes(p.variantId) ? prev.filter((id) => id !== p.variantId) : [...prev, p.variantId]
            )
          }
          wishlistIds={wishlistIds}
        />
      </main>

      <StorefrontFooter theme={theme} settings={footerSettings} />

      <CartDrawer
        theme={theme}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={convertedCartItems}
        onUpdateQuantity={(variantId, newQty) => {
          if (newQty <= 0) removeItemFromCart(String(variantId));
          else updateItemQty(String(variantId), newQty);
        }}
        onRemoveItem={(variantId) => removeItemFromCart(String(variantId))}
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
