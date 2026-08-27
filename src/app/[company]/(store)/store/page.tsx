"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  StorefrontHero,
  CategoryGrid,
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

export default function StoreHomePage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  const theme = useStorefrontTheme();
  const [footerSettings] = useState<FooterSettings>(mockFooterSettings);
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  
  // Modals & Drawers state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);
  const [customerName, setCustomerName] = useState<string | null>(null);

  // Zustand Cart Store
  const cartItems = useCartStore((state) => state.items);
  const addItemToCart = useCartStore((state) => state.addItem);
  const removeItemFromCart = useCartStore((state) => state.removeItem);
  const updateItemQty = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    if (!company) return;

    const loadStorefront = async () => {
      try {
        // Fetch storefront products
        const res = await fetch(`/api/tenant/${company}/products`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.products)) {
            // Map to StorefrontProduct format
            const mappedProducts: StorefrontProduct[] = data.products.map((p: any) => ({
              variantId: Number(p.id),
              name: p.products.name,
              images: p.product_images || ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"],
              effectivePrice: Number(p.product_pricing.price || 0),
              inStock: Number(p.available_qty ?? 0) > 0,
              sortOrder: 1,
            }));
            setProducts(mappedProducts);
          }
        }

        // Fetch public storefront categories
        const catRes = await fetch(`/api/tenant/${company}/categories`);
        if (catRes.ok) {
          const catData = await catRes.json();
          if (catData.success && Array.isArray(catData.categories)) {
            setCategories(catData.categories);
          }
        }

        // Check customer auth session
        const authRes = await fetch("/api/storefront/auth/me");
        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData.authenticated && authData.customer) {
            setCustomerName(authData.customer.name || authData.customer.email || authData.customer.phone);
          }
        }
      } catch (err) {
        console.error("Failed to load storefront data:", err);
      }
    };

    loadStorefront();
  }, [company]);

  const convertedCartItems: CartItemType[] = cartItems.map((ci: CartItem) => ({
    variantId: Number(ci.id),
    productName: ci.name,
    image: ci.image,
    price: ci.price,
    quantity: ci.quantity,
    inStock: true,
  }));

  const handleToggleWishlist = (product: StorefrontProduct) => {
    setWishlistIds((prev) =>
      prev.includes(product.variantId)
        ? prev.filter((id) => id !== product.variantId)
        : [...prev, product.variantId]
    );
  };

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

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: theme.fontFamily }}>
      {/* 1. Header / Navigation Shell */}
      <StorefrontHeader
        theme={theme}
        categories={categories}
        cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
        wishlistCount={wishlistIds.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSelectCategory={(slug) => router.push(`/${company}/store/products?category=${slug}`)}
        onSearch={(q) => router.push(`/${company}/store/products?search=${encodeURIComponent(q)}`)}
      />

      {/* 2. Hero Welcome Banner */}
      <StorefrontHero
        theme={theme}
        ctaText="Explore Catalog"
        onCtaClick={() => router.push(`/${company}/store/products`)}
      />

      {/* 3. Category Grid */}
      {categories.length > 0 && (
        <CategoryGrid
          theme={theme}
          categories={categories}
          onSelectCategory={(catSlug) => router.push(`/${company}/store/products?category=${catSlug}`)}
        />
      )}

      {/* 4. Product Catalog Grid */}
      <ProductGrid
        theme={theme}
        products={products}
        categories={categories.map((c) => c.name)}
        onProductClick={(p) => router.push(`/${company}/store/products/${p.variantId}`)}
        onAddToCart={handleAddToCart}
        onToggleWishlist={handleToggleWishlist}
        wishlistIds={wishlistIds}
      />

      {/* 5. Footer Shell */}
      <StorefrontFooter theme={theme} settings={footerSettings} />

      {/* Cart Drawer */}
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

      {/* Customer Auth OTP Modal */}
      <CustomerAuthModal
        theme={theme}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccessAuth={(ident) => {
          setCustomerName(ident);
          setIsAuthOpen(false);
        }}
      />
    </div>
  );
}
