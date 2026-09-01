//src/components/storefront/CartDrawer.tsx
"use client";

import React from "react";
import { StorefrontTheme, CartItemType } from "./types";
import { formatPrice } from "@/lib/currency";

export interface CartDrawerProps {
  theme: StorefrontTheme;
  isOpen: boolean;
  onClose: () => void;
  items: CartItemType[];
  onUpdateQuantity?: (variantId: number, quantity: number) => void;
  onRemoveItem?: (variantId: number) => void;
  onProceedToCheckout?: () => void;
  onCheckout?: () => void;
  freeShippingThreshold?: number;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  theme,
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
  onCheckout,
  freeShippingThreshold = 50,
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const shippingProgress = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ fontFamily: theme.fontFamily }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Your Shopping Cart ({items.reduce((acc, item) => acc + item.quantity, 0)})
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Free Shipping Progress Bar */}
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-100">
            <div className="text-xs font-medium text-gray-600 mb-1.5 flex justify-between">
              {remainingForFreeShipping > 0 ? (
                <span>Add <strong>{formatPrice(remainingForFreeShipping)}</strong> more for FREE Shipping!</span>
              ) : (
                <span className="text-emerald-600 font-semibold">🎉 You unlocked FREE Shipping!</span>
              )}
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${shippingProgress}%`,
                  backgroundColor: remainingForFreeShipping === 0 ? "#10b981" : theme.primaryColor,
                }}
              />
            </div>
          </div>

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-12">
                <svg className="h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <p className="text-base font-semibold text-gray-800">Your cart is currently empty</p>
                <p className="text-xs text-gray-500 mt-1">Explore our products to add items to your cart.</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.variantId}
                  className="flex gap-4 p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-all"
                >
                  <img
                    src={item.image || "https://via.placeholder.com/100"}
                    alt={item.productName}
                    className="h-20 w-20 rounded-lg object-cover bg-gray-50 border border-gray-100"
                  />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">
                          {item.productName}
                        </h3>
                        <button
                          onClick={() => onRemoveItem?.(item.variantId)}
                          className="text-gray-400 hover:text-red-500 text-xs ml-2"
                        >
                          Remove
                        </button>
                      </div>

                      {item.selectedOptions && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {Object.entries(item.selectedOptions)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" | ")}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-gray-200 rounded-md bg-gray-50">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity?.(item.variantId, item.quantity - 1)}
                          className="px-2 py-0.5 text-xs text-gray-600 hover:text-gray-900"
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-semibold text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity?.(item.variantId, item.quantity + 1)}
                          className="px-2 py-0.5 text-xs text-gray-600 hover:text-gray-900"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-sm font-bold text-gray-900">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Subtotal & Checkout Action */}
          {items.length > 0 && (
            <div className="border-t border-gray-100 p-6 space-y-4 bg-gray-50/50">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-gray-900">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>{remainingForFreeShipping === 0 ? "FREE" : "Calculated at checkout"}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span>Total Amount</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onProceedToCheckout || onCheckout}
                className="w-full rounded-xl py-3.5 px-4 text-center font-semibold text-white shadow-md transition-all hover:opacity-95 active:scale-98"
                style={{ backgroundColor: theme.primaryColor }}
              >
                Proceed to Checkout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartDrawer;
