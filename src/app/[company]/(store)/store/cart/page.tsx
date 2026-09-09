"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  StorefrontFooter,
  CartItemType,
  mockFooterSettings,
  useStorefrontTheme,
} from "@/components/storefront";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { useWishlistStore } from "@/store/wishlistStore";
import { useStorefrontSync } from "@/hooks/useStorefrontSync";
import { formatPrice } from "@/lib/currency";

export default function CartPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  useStorefrontSync(company);

  const theme = useStorefrontTheme();
  const [footerSettings] = useState(mockFooterSettings);
  const [shippingSettings, setShippingSettings] = useState<{ freeThreshold: number; fee: number }>({
    freeThreshold: 500,
    fee: 49,
  });

  const cartItems = useCartStore((state) => state.items);
  const removeItemFromCart = useCartStore((state) => state.removeItem);
  const updateItemQty = useCartStore((state) => state.updateQuantity);
  const wishlistCount = useWishlistStore((state) => state.items.length);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    id: number | string;
    name: string;
    discount_type: "percentage" | "fixed";
    value: number;
    coupon_code: string;
    applies_to: "entire_order" | "specific_variants";
    allowed_variants: number[];
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res = await fetch(
        `/api/discounts/validate?code=${encodeURIComponent(code)}&company=${encodeURIComponent(company)}`,
        {
          headers: { "x-tenant": company },
        }
      );
      const data = await res.json();
      if (res.ok && data?.success && data?.data) {
        setAppliedCoupon({
          ...data.data,
          value: Number(data.data.value || 0),
          allowed_variants: Array.isArray(data.data.allowed_variants)
            ? data.data.allowed_variants.map((id: any) => Number(id))
            : [],
        });
        setCouponInput("");
        setCouponError("");
      } else {
        setCouponError(data?.error || "Invalid or expired coupon code");
      }
    } catch (err: any) {
      setCouponError(err.message || "Failed to apply coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError("");
  };

  useEffect(() => {
    if (!company) return;
    const loadSettings = async () => {
      try {
        const res = await fetch(`/api/tenant/${company}/settings`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.settings) {
            setShippingSettings({
              freeThreshold: data.settings.shipping_free_threshold != null ? Number(data.settings.shipping_free_threshold) : 500,
              fee: data.settings.shipping_fee != null ? Number(data.settings.shipping_fee) : 49,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load storefront shipping settings:", err);
      }
    };
    loadSettings();
  }, [company]);

  const handleUpdateQty = (id: string, qty: number) => {
    updateItemQty(id, qty);
    if (company) {
      fetch(`/api/tenant/${company}/cart`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, quantity: qty }),
      }).catch(() => {});
    }
  };

  const handleRemoveItem = (id: string) => {
    removeItemFromCart(id);
    if (company) {
      fetch(`/api/tenant/${company}/cart?id=${id}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  };

  const convertedCartItems: CartItemType[] = cartItems.map((ci: CartItem) => ({
    variantId: Number(ci.id),
    productName: ci.name,
    image: ci.image,
    price: ci.price,
    quantity: ci.quantity,
    inStock: ci.inStock ?? true,
  }));

  const subtotal = cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

  const couponDiscountAmount = React.useMemo(() => {
    if (!appliedCoupon) return 0;
    const { applies_to, discount_type, value, allowed_variants } = appliedCoupon;

    if (applies_to === "entire_order") {
      if (discount_type === "percentage") {
        return Number(((subtotal * value) / 100).toFixed(2));
      } else {
        return Math.min(value, subtotal);
      }
    } else {
      const eligibleItems = cartItems.filter((i) =>
        allowed_variants.includes(Number(i.id))
      );
      const eligibleSubtotal = eligibleItems.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0
      );
      if (eligibleSubtotal <= 0) return 0;

      if (discount_type === "percentage") {
        return Number(((eligibleSubtotal * value) / 100).toFixed(2));
      } else {
        return Math.min(value, eligibleSubtotal);
      }
    }
  }, [appliedCoupon, subtotal, cartItems]);

  const isFreeShipping = subtotal >= shippingSettings.freeThreshold;
  const currentShippingFee = isFreeShipping ? 0 : shippingSettings.fee;
  const estimatedTotal = Math.max(0, subtotal - couponDiscountAmount + currentShippingFee);

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between" style={{ fontFamily: theme.fontFamily }}>
      <div>
        <StorefrontHeader
          theme={theme}
          cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
          wishlistCount={wishlistCount}
          onOpenCart={() => {}}
          onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
        />

        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-6">Shopping Cart</h1>

          {cartItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
              <svg className="h-16 w-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-lg font-semibold text-gray-800">Your cart is currently empty</p>
              <p className="text-sm text-gray-500 mt-1">Explore our product collection and add items to your cart.</p>
              <button
                onClick={() => router.push(`/${company}/store/products`)}
                className="mt-6 inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md cursor-pointer"
                style={{ backgroundColor: theme.primaryColor }}
              >
                Start Shopping
              </button>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-8 space-y-4">
                {convertedCartItems.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <img
                        src={item.image || "https://via.placeholder.com/100"}
                        alt={item.productName}
                        className="h-20 w-20 rounded-xl object-cover"
                      />
                      <div>
                        <h3 className="font-semibold text-gray-900">{item.productName}</h3>
                        <p className="text-sm text-gray-500">{formatPrice(item.price)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="flex items-center rounded-lg border border-gray-200">
                        <button
                          onClick={() => handleUpdateQty(String(item.variantId), item.quantity - 1)}
                          className="px-3 py-1 text-gray-600 hover:bg-gray-100 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="px-3 py-1 text-sm font-semibold text-gray-900">{item.quantity}</span>
                        <button
                          onClick={() => handleUpdateQty(String(item.variantId), item.quantity + 1)}
                          className="px-3 py-1 text-gray-600 hover:bg-gray-100 cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <span className="font-bold text-gray-900">{formatPrice(item.price * item.quantity)}</span>

                      <button
                        onClick={() => handleRemoveItem(String(item.variantId))}
                        className="text-gray-400 hover:text-red-500 cursor-pointer"
                        aria-label="Remove"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
                  <h2 className="text-lg font-bold text-gray-900">Order Summary</h2>

                  {/* Promo Code Input Box */}
                  <div className="pt-1">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Promo Code
                    </label>
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                        <span className="font-bold">
                          {appliedCoupon.coupon_code} ({appliedCoupon.discount_type === "percentage" ? `${appliedCoupon.value}% OFF` : `₹${appliedCoupon.value} OFF`})
                        </span>
                        <button
                          type="button"
                          onClick={handleRemoveCoupon}
                          className="font-bold text-red-500 hover:text-red-700 ml-2"
                          title="Remove coupon"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          placeholder="Enter coupon code"
                          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold uppercase outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={couponLoading || !couponInput.trim()}
                          className="rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 cursor-pointer"
                          style={{ backgroundColor: theme.primaryColor }}
                        >
                          {couponLoading ? "..." : "Apply"}
                        </button>
                      </div>
                    )}
                    {couponError && (
                      <p className="mt-1 text-xs text-red-500 font-medium">{couponError}</p>
                    )}
                  </div>

                  <div className="flex justify-between text-sm text-gray-600 border-t pt-3">
                    <span>Subtotal</span>
                    <span className="font-semibold text-gray-900">{formatPrice(subtotal)}</span>
                  </div>

                  {couponDiscountAmount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600 font-semibold">
                      <span>Coupon Discount</span>
                      <span>-{formatPrice(couponDiscountAmount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm text-gray-600 border-b pb-3">
                    <span>Shipping</span>
                    <span className={isFreeShipping ? "font-medium text-emerald-600" : "font-semibold text-gray-900"}>
                      {isFreeShipping ? "Free" : formatPrice(currentShippingFee)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-900 pt-2">
                    <span>Total</span>
                    <span>{formatPrice(estimatedTotal)}</span>
                  </div>

                  <button
                    onClick={() => {
                      const query = appliedCoupon ? `?coupon=${encodeURIComponent(appliedCoupon.coupon_code)}` : "";
                      router.push(`/${company}/store/checkout${query}`);
                    }}
                    className="w-full rounded-xl py-3.5 px-4 text-center text-sm font-semibold text-white shadow-md hover:opacity-95 cursor-pointer"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <StorefrontFooter theme={theme} settings={footerSettings} />
    </div>
  );
}
