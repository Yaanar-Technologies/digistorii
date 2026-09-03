// src/app/[company]/(store)/store/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  HomeSectionRenderer,
  StorefrontFooter,
  CartDrawer,
  CustomerAuthModal,
  StorefrontProduct,
  CategoryType,
  TenantColor,
  TenantMaterial,
  TenantOffer,
  HomeSection,
  FooterSettings,
  CartItemType,
  mockFooterSettings,
  useStorefrontTheme,
} from "@/components/storefront";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { useStorefrontSync } from "@/hooks/useStorefrontSync";

export default function StoreHomePage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  useStorefrontSync(company);

  const theme = useStorefrontTheme();
  const [footerSettings] = useState<FooterSettings>(mockFooterSettings);
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [colors, setColors] = useState<TenantColor[]>([]);
  const [materials, setMaterials] = useState<TenantMaterial[]>([]);
  const [offers, setOffers] = useState<TenantOffer[]>([]);
  const [imagesById, setImagesById] = useState<Record<number, string>>({});

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

  useEffect(() => {
    if (!company) return;

    const loadStorefront = async () => {
      try {
        // 1. Fetch storefront products
        const res = await fetch(`/api/tenant/${company}/products`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.products)) {
            const mappedProducts: StorefrontProduct[] = data.products.map((p: any) => ({
              variantId: Number(p.id),
              name: p.products.name,
              category: p.products.category || "General",
              images: p.product_images || ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"],
              originalPrice: p.original_price != null ? Number(p.original_price) : undefined,
              effectivePrice: Number(p.effective_price ?? p.product_pricing?.price ?? 0),
              compareAtPrice: p.is_on_sale ? Number(p.original_price || 0) : undefined,
              isOnSale: p.is_on_sale === true,
              discountValue: p.discount_value != null ? Number(p.discount_value) : undefined,
              discountType: p.discount_type || undefined,
              discountBadgeText: p.discount_badge_text || undefined,
              savingsAmount: p.savings_amount != null ? Number(p.savings_amount) : undefined,
              inStock: Number(p.available_qty ?? 0) > 0,
              sortOrder: 1,
            }));
            setProducts(mappedProducts);
          }
        }

        // 2. Fetch public storefront categories
        const catRes = await fetch(`/api/tenant/${company}/categories`);
        if (catRes.ok) {
          const catData = await catRes.json();
          if (catData.success && Array.isArray(catData.categories)) {
            setCategories(catData.categories);
          }
        }

        // 3. Fetch colors
        const colorRes = await fetch(`/api/tenant/${company}/colors`);
        if (colorRes.ok) {
          const colorData = await colorRes.json();
          if (colorData.success && Array.isArray(colorData.colors)) {
            setColors(colorData.colors);
          }
        }

        // 4. Fetch materials
        const matRes = await fetch(`/api/tenant/${company}/materials`);
        if (matRes.ok) {
          const matData = await matRes.json();
          if (matData.success && Array.isArray(matData.materials)) {
            setMaterials(matData.materials);
          }
        }

        // 5. Fetch offers
        const offersRes = await fetch(`/api/tenant/${company}/offers`);
        if (offersRes.ok) {
          const offersData = await offersRes.json();
          if (offersData.success && Array.isArray(offersData.offers)) {
            setOffers(offersData.offers);
          }
        }

        // 6. Check customer auth session
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

  // Batch resolve all imageId references in theme
  useEffect(() => {
    if (!company) return;

    const ids = new Set<number>();
    if (theme.logoImageId) ids.add(theme.logoImageId);
    if (theme.bannerImageId) ids.add(theme.bannerImageId);

    (theme.navItems || []).forEach((item) => {
      (item.collections || []).forEach((col) => {
        if (col.imageId) ids.add(col.imageId);
      });
    });

    (theme.homeSections || []).forEach((sec) => {
      if (sec.type === "hero_carousel") {
        sec.slides.forEach((s) => s.imageId && ids.add(s.imageId));
      } else if (sec.type === "shop_by_category" && sec.overrides) {
        Object.values(sec.overrides).forEach((ov) => ov?.imageId && ids.add(ov.imageId));
      } else if (sec.type === "shop_by_color") {
        sec.items.forEach((i) => i.imageId && ids.add(i.imageId));
      } else if (sec.type === "shop_by_material") {
        sec.items.forEach((i) => i.imageId && ids.add(i.imageId));
      } else if (sec.type === "offers" && sec.bannerImageId) {
        ids.add(sec.bannerImageId);
      } else if (sec.type === "about") {
        sec.blocks.forEach((b) => b.imageId && ids.add(b.imageId));
      }
    });

    const idList = Array.from(ids);
    if (idList.length === 0) return;

    fetch(`/api/tenant/${company}/images?ids=${idList.join(",")}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.images)) {
          const map: Record<number, string> = {};
          data.images.forEach((img: any) => {
            map[img.id] = img.url || img.filePath;
          });
          setImagesById((prev) => ({ ...prev, ...map }));
        }
      })
      .catch((err) => console.error("Batch image resolve error on store page:", err));
  }, [company, theme]);

  const convertedCartItems: CartItemType[] = cartItems.map((ci: CartItem) => ({
    variantId: Number(ci.id),
    productName: ci.name,
    image: ci.image,
    price: ci.price,
    quantity: ci.quantity,
    inStock: true,
  }));

  const handleAddToCart = (product: StorefrontProduct, quantity: number = 1) => {
    addItemToCart({
      id: String(product.variantId),
      name: product.name,
      price: product.effectivePrice,
      image: product.images[0],
      quantity: quantity || 1,
    });
    setIsCartOpen(true);
  };

  // Fallback default sections if homeSections is empty or not configured yet
  const defaultFallbackSections: HomeSection[] = useMemo(() => {
    return [
      {
        id: "default-hero",
        type: "hero_carousel",
        enabled: true,
        order: 1,
        slides: [
          {
            id: "default-slide-1",
            title: theme.heroTitle || "Welcome to Our Store",
            subtitle: theme.heroDescription || "Discover our curated collection of premium quality products.",
            imageUrl: theme.bannerImages?.[0] || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80",
            buttonText: "Shop Catalog",
            buttonLink: `/${company}/store/products`,
          },
        ],
      },
      {
        id: "default-categories",
        type: "shop_by_category",
        enabled: true,
        order: 2,
        title: "Shop by Category",
        subtitle: "Explore our popular collections",
        categoryIds: categories.slice(0, 4).map((c) => Number(c.id)),
      },
      {
        id: "default-products",
        type: "product_carousel",
        enabled: true,
        order: 3,
        title: "New Arrivals",
        subtitle: "Fresh items just added to our catalog",
        limit: 8,
      },
    ];
  }, [theme, categories, company]);

  const activeSections = theme.homeSections && theme.homeSections.length > 0
    ? theme.homeSections
    : defaultFallbackSections;

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: theme.fontFamily }}>
      {/* 1. Header Navigation Shell */}
      <StorefrontHeader
        theme={theme}
        company={company}
        categories={categories}
        cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
        wishlistCount={wishlistIds.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSelectCategory={(slug) => router.push(`/${company}/store/products?category=${encodeURIComponent(slug)}`)}
        onSearch={(q) => router.push(`/${company}/store/products?search=${encodeURIComponent(q)}`)}
      />

      {/* 2. Dynamic Homepage Sections */}
      <main>
        {activeSections
          .filter((s) => s.enabled)
          .sort((a, b) => a.order - b.order)
          .map((section) => (
            <HomeSectionRenderer
              key={section.id}
              section={section}
              theme={theme}
              categories={categories}
              colors={colors}
              materials={materials}
              products={products}
              offers={offers}
              imagesById={imagesById}
              onSelectCategory={(slug) => router.push(`/${company}/store/products?category=${encodeURIComponent(slug)}`)}
              onSelectColor={(colorId) => router.push(`/${company}/store/products?attribute=color&value_id=${colorId}`)}
              onSelectMaterial={(matId) => router.push(`/${company}/store/products?attribute=material&value_id=${matId}`)}
              onProductClick={(p) => router.push(`/${company}/store/products/${p.variantId}`)}
              onAddToCart={handleAddToCart}
              onCtaClick={(link) => {
                if (link) {
                  if (link.startsWith("http")) window.open(link, "_blank");
                  else router.push(link.startsWith("/") ? `/${company}${link.replace(/^\/[^/]+/, "")}` : `/${company}/${link}`);
                } else {
                  router.push(`/${company}/store/products`);
                }
              }}
              isPreview={false}
            />
          ))}
      </main>

      {/* 3. Storefront Footer */}
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
