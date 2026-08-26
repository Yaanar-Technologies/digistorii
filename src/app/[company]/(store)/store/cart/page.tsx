"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  StorefrontFooter,
  CartDrawer,
  StorefrontTheme,
  CartItemType,
  mockTheme,
  mockFooterSettings,
} from "@/components/storefront";
import { useCartStore, type CartItem } from "@/store/cartStore";

export default function CartPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  const [theme] = useState<StorefrontTheme>(mockTheme);
  const [footerSettings] = useState(mockFooterSettings);

  const cartItems = useCartStore((state) => state.items);
  const removeItemFromCart = useCartStore((state) => state.removeItem);
  const updateItemQty = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearCart);

  const convertedCartItems: CartItemType[] = cartItems.map((ci: CartItem) => ({
    variantId: Number(ci.id),
    productName: ci.name,
    image: ci.image,
    price: ci.price,
    quantity: ci.quantity,
    inStock: true,
  }));

  const subtotal = cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between" style={{ fontFamily: theme.fontFamily }}>
      <div>
        <StorefrontHeader
          theme={theme}
          cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
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
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700"
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
                        src={item.image || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"}
                        alt={item.productName}
                        className="h-20 w-20 rounded-xl object-cover"
                      />
                      <div>
                        <h3 className="font-semibold text-gray-900">{item.productName}</h3>
                        <p className="text-sm text-gray-500">${item.price.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="flex items-center rounded-lg border border-gray-200">
                        <button
                          onClick={() => updateItemQty(String(item.variantId), item.quantity - 1)}
                          className="px-3 py-1 text-gray-600 hover:bg-gray-100"
                        >
                          -
                        </button>
                        <span className="px-3 py-1 text-sm font-semibold text-gray-900">{item.quantity}</span>
                        <button
                          onClick={() => updateItemQty(String(item.variantId), item.quantity + 1)}
                          className="px-3 py-1 text-gray-600 hover:bg-gray-100"
                        >
                          +
                        </button>
                      </div>

                      <span className="font-bold text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>

                      <button
                        onClick={() => removeItemFromCart(String(item.variantId))}
                        className="text-gray-400 hover:text-red-500"
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
                  <div className="flex justify-between text-sm text-gray-600 border-b pb-3">
                    <span>Subtotal</span>
                    <span className="font-semibold text-gray-900">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 border-b pb-3">
                    <span>Shipping</span>
                    <span className="font-medium text-green-600">Free</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-900 pt-2">
                    <span>Total</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={() => router.push(`/${company}/store/checkout`)}
                    className="w-full rounded-xl bg-blue-600 py-3.5 px-4 text-center text-sm font-semibold text-white shadow-md hover:bg-blue-700"
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
