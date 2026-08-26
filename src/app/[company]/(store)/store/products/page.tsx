"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  StorefrontHeader,
  ProductGrid,
  StorefrontFooter,
  CartDrawer,
  CustomerAuthModal,
  StorefrontTheme,
  StorefrontProduct,
  CategoryType,
  FooterSettings,
  CartItemType,
  mockTheme,
  mockFooterSettings,
} from "@/components/storefront";
import { useCartStore, type CartItem } from "@/store/cartStore";

export default function StoreProductsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const company = (params.company as string) || "";

  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<StorefrontTheme>(mockTheme);
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(mockFooterSettings);
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);

  const cartItems = useCartStore((state) => state.items);
  const addItemToCart = useCartStore((state) => state.addItem);
  const removeItemFromCart = useCartStore((state) => state.removeItem);
  const updateItemQty = useCartStore((state) => state.updateQuantity);

  useEffect(() => {
    if (!company) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/tenant/${company}/products`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.products)) {
            const mappedProducts: StorefrontProduct[] = data.products.map((p: any) => ({
              variantId: Number(p.id),
              name: p.products.name,
              images: p.product_images || ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"],
              effectivePrice: Number(p.product_pricing.price || 0),
              inStock: true,
              sortOrder: 1,
            }));
            setProducts(mappedProducts);
          }
        }

        const themeRes = await fetch(`/api/company/ecom-theme?company=${company}`);
        if (themeRes.ok) {
          const themeData = await themeRes.json();
          if (themeData.success && themeData.theme) {
            const pub = themeData.theme.published_theme || themeData.theme.draft_theme;
            if (pub) {
              setTheme({
                primaryColor: pub.primary_color || "#2563eb",
                secondaryColor: pub.secondary_color || "#1e40af",
                logoUrl: pub.logo_url || "",
                bannerImages: pub.hero_banner_url ? [pub.hero_banner_url] : mockTheme.bannerImages,
                fontFamily: pub.font_family || "Inter",
                socialLinks: {
                  facebook: pub.social_facebook,
                  instagram: pub.social_instagram,
                  whatsapp: pub.social_whatsapp,
                },
              });
            }
          }
        }
      } catch (err) {
        console.error("Error loading products page:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [company]);

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 bg-gray-50">
        Loading product catalog...
      </div>
    );
  }

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
      />

      <main className="py-6">
        <ProductGrid
          theme={theme}
          products={products}
          categories={categories.map((c) => c.name)}
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
