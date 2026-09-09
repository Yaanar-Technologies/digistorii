"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  ProductDetail,
  StorefrontFooter,
  CartDrawer,
  CustomerAuthModal,
  StorefrontProduct,
  CartItemType,
  CategoryType,
  FooterSettings,
  mockFooterSettings,
  useStorefrontTheme,
} from "@/components/storefront";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { useStorefrontSync } from "@/hooks/useStorefrontSync";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";
  const variantId = Number(params.variantId || 0);

  useStorefrontSync(company);

  const theme = useStorefrontTheme();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(mockFooterSettings);
  const [shippingSettings, setShippingSettings] = useState<{ freeThreshold: number; fee: number }>({
    freeThreshold: 500,
    fee: 49,
  });
  
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);

  const cartItems = useCartStore((state) => state.items);
  const addItemToCart = useCartStore((state) => state.addItem);
  const removeItemFromCart = useCartStore((state) => state.removeItem);
  const updateItemQty = useCartStore((state) => state.updateQuantity);

  useEffect(() => {
    if (!company || !variantId) return;

    const loadProductDetail = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/tenant/${company}/products/${variantId}/detail`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.product && Array.isArray(data.variants)) {
            const targetVariant =
              data.variants.find((v: any) => v.variantId === variantId) ||
              data.variants[0];

            if (targetVariant) {
              setProduct({
                variantId: targetVariant.variantId,
                productCode: data.product.productCode,
                name: data.product.name,
                description: data.product.description,
                category: data.product.category,
                material: data.product.material,
                weight: data.product.weight,
                length: data.product.length,
                width: data.product.width,
                height: data.product.height,
                specifications: data.product.specifications || [],
                originalPrice: targetVariant.originalPrice || targetVariant.compareAtPrice,
                effectivePrice: targetVariant.effectivePrice,
                compareAtPrice: targetVariant.compareAtPrice,
                isOnSale: targetVariant.isOnSale,
                discountValue: targetVariant.discountValue,
                discountType: targetVariant.discountType,
                discountBadgeText: targetVariant.discountBadgeText,
                savingsAmount: targetVariant.savingsAmount,
                inStock: targetVariant.inStock,
                availableQty: targetVariant.availableQty,
                lowStockThreshold: targetVariant.lowStockThreshold,
                variants: data.variants,
                images: targetVariant.images,
                footerSettings: data.footerSettings,
              });

              if (data.footerSettings) {
                setFooterSettings(data.footerSettings);
              }
              return;
            }
          }
        }

        // Fallback fetch if detailed route fails
        const fallbackRes = await fetch(`/api/tenant/${company}/products`);
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          if (data.success && Array.isArray(data.products)) {
            const found = data.products.find((p: any) => Number(p.id) === variantId);
            if (found) {
              setProduct({
                variantId: Number(found.id),
                name: found.products.name,
                images: found.product_images || ["https://placehold.co/600x400?text=No+Image"],
                effectivePrice: Number(found.product_pricing.price || 0),
                inStock: Number(found.available_qty || 0) > 0,
                availableQty: Number(found.available_qty || 0),
                lowStockThreshold: 5,
                description: "Premium merchandise crafted for style and elegance.",
                category: "Apparel",
              });
            }
          }
        }
        // Fetch categories for header navigation
        const catRes = await fetch(`/api/tenant/${company}/categories`);
        if (catRes.ok) {
          const catData = await catRes.json();
          if (catData.success && Array.isArray(catData.categories)) {
            setCategories(catData.categories);
          }
        }

        // Fetch tenant shipping settings
        const settingsRes = await fetch(`/api/tenant/${company}/settings`);
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.success && settingsData.settings) {
            setShippingSettings({
              freeThreshold: settingsData.settings.shipping_free_threshold != null ? Number(settingsData.settings.shipping_free_threshold) : 500,
              fee: settingsData.settings.shipping_fee != null ? Number(settingsData.settings.shipping_fee) : 49,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load product detail:", err);
      } finally {
        setLoading(false);
      }
    };

    loadProductDetail();
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
    quantity: number,
    resolvedVariantId?: number
  ) => {
    const finalVariantId = resolvedVariantId || itemProduct.variantId;
    
    // Find active variant details if resolvedVariantId differs
    const activeVar = itemProduct.variants?.find((v) => v.variantId === finalVariantId);

    addItemToCart({
      id: String(finalVariantId),
      name: itemProduct.name,
      price: activeVar ? activeVar.effectivePrice : itemProduct.effectivePrice,
      image: activeVar?.images?.[0] || itemProduct.images[0],
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
          className="mt-4 rounded-xl bg-black px-4 py-2 text-sm text-white"
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
        categories={categories}
        cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSelectCategory={(slug) => {
          if (slug === "all") router.push(`/${company}/store/products`);
          else router.push(`/${company}/store/products?category=${encodeURIComponent(slug)}`);
        }}
        onSearch={(q) => router.push(`/${company}/store/products?search=${encodeURIComponent(q)}`)}
      />

      <main>
        <ProductDetail
          theme={theme}
          product={product}
          footerSettings={footerSettings}
          onAddToCart={handleAddToCart}
          onToggleWishlist={() => setIsWishlisted(!isWishlisted)}
          isWishlisted={isWishlisted}
          onSelectCategory={(cat) => {
            if (cat === "all") router.push(`/${company}/store/products`);
            else router.push(`/${company}/store/products?category=${encodeURIComponent(cat)}`);
          }}
        />
      </main>

      <StorefrontFooter theme={theme} settings={footerSettings} />

      <CartDrawer
        theme={theme}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={convertedCartItems}
        freeShippingThreshold={shippingSettings.freeThreshold}
        shippingFee={shippingSettings.fee}
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
