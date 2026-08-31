"use client";

import React, { useState } from "react";
import { StorefrontTheme, CartItemType } from "./types";
import { formatPrice } from "@/lib/currency";

export interface CheckoutShellProps {
  theme: StorefrontTheme;
  items: CartItemType[];
  onPlaceOrder?: (orderDetails: any) => void;
  onBackToCart?: () => void;
  savedAddresses?: any[];
  isLoading?: boolean;
}

export const CheckoutShell: React.FC<CheckoutShellProps> = ({
  theme,
  items,
  onPlaceOrder,
  onBackToCart,
  savedAddresses = [],
  isLoading = false,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Address State Scaffolding
  const [shippingAddress, setShippingAddress] = useState({
    fullName: "",
    email: "",
    phone: "",
    addressLine: "",
    city: "",
    postalCode: "",
  });

  // Payment Method Scaffolding
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cod" | "upi">("cod");

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingFee = subtotal >= 50 ? 0 : 4.99;
  const grandTotal = subtotal + shippingFee;

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep < 3) {
      setCurrentStep((prev) => (prev + 1) as 1 | 2 | 3);
    }
  };

  const handleFinalPlaceOrder = () => {
    if (onPlaceOrder) {
      onPlaceOrder({
        shippingAddress,
        paymentMethod,
        items,
        grandTotal,
      });
    }
  };

  return (
    <div className="py-10 bg-gray-50/50 min-h-screen" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        
        {/* Header Navigation & Step Indicator */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Checkout</h1>
          <p className="text-sm text-gray-500 mt-1">Complete your order details below</p>

          {/* Stepper Progress */}
          <div className="mt-6 flex items-center justify-center gap-2 sm:gap-4 max-w-xl mx-auto">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  currentStep >= 1 ? "text-white" : "bg-gray-200 text-gray-600"
                }`}
                style={currentStep >= 1 ? { backgroundColor: theme.primaryColor } : undefined}
              >
                1
              </span>
              <span className={`text-xs sm:text-sm font-semibold ${currentStep >= 1 ? "text-gray-900" : "text-gray-400"}`}>
                Shipping
              </span>
            </div>
            <div className="h-0.5 w-8 sm:w-12 bg-gray-200" />

            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  currentStep >= 2 ? "text-white" : "bg-gray-200 text-gray-600"
                }`}
                style={currentStep >= 2 ? { backgroundColor: theme.primaryColor } : undefined}
              >
                2
              </span>
              <span className={`text-xs sm:text-sm font-semibold ${currentStep >= 2 ? "text-gray-900" : "text-gray-400"}`}>
                Payment
              </span>
            </div>
            <div className="h-0.5 w-8 sm:w-12 bg-gray-200" />

            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  currentStep >= 3 ? "text-white" : "bg-gray-200 text-gray-600"
                }`}
                style={currentStep >= 3 ? { backgroundColor: theme.primaryColor } : undefined}
              >
                3
              </span>
              <span className={`text-xs sm:text-sm font-semibold ${currentStep >= 3 ? "text-gray-900" : "text-gray-400"}`}>
                Review
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          
          {/* Main Scaffolding Step View */}
          <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm">
            
            {/* Step 1: Shipping Address */}
            {currentStep === 1 && (
              <form onSubmit={handleNextStep} className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
                  1. Shipping Information
                </h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.fullName}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                      placeholder="Jane Doe"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={shippingAddress.email}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, email: e.target.value })}
                      placeholder="jane@example.com"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={shippingAddress.phone}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.addressLine}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine: e.target.value })}
                    placeholder="123 Main St, Apt 4B"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.city}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                      placeholder="New York"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Postal / ZIP Code</label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.postalCode}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: e.target.value })}
                      placeholder="10001"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-between">
                  <button
                    type="button"
                    onClick={onBackToCart}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    ← Return to Cart
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    Continue to Payment
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Payment Method */}
            {currentStep === 2 && (
              <form onSubmit={handleNextStep} className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
                  2. Payment Option
                </h2>

                <div className="space-y-3">
                  <label
                    className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${
                      paymentMethod === "cod"
                        ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentMethod === "cod"}
                        onChange={() => setPaymentMethod("cod")}
                      />
                      <div>
                        <div className="text-sm font-bold text-gray-900">Cash on Delivery (COD)</div>
                        <div className="text-xs text-gray-500">Pay directly when your order arrives</div>
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${
                      paymentMethod === "card"
                        ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentMethod === "card"}
                        onChange={() => setPaymentMethod("card")}
                      />
                      <div>
                        <div className="text-sm font-bold text-gray-900">Credit / Debit Card</div>
                        <div className="text-xs text-gray-500">Secure online card payment</div>
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${
                      paymentMethod === "upi"
                        ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentMethod === "upi"}
                        onChange={() => setPaymentMethod("upi")}
                      />
                      <div>
                        <div className="text-sm font-bold text-gray-900">UPI / Digital Wallet</div>
                        <div className="text-xs text-gray-500">Google Pay, PhonePe, UPI ID</div>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="pt-4 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    ← Back to Shipping
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    Review Order
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Order Review */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
                  3. Order Review & Confirmation
                </h2>

                <div className="rounded-xl bg-gray-50 p-4 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Shipping Address:</span>
                    <span className="font-semibold text-gray-900">
                      {shippingAddress.fullName || "Jane Doe"}, {shippingAddress.addressLine || "123 Main St"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Payment Option:</span>
                    <span className="font-semibold text-gray-900 uppercase">{paymentMethod}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ordered Items</div>
                  {items.map((item) => (
                    <div key={item.variantId} className="flex justify-between items-center text-sm">
                      <div>
                        <div className="font-medium text-gray-900">{item.productName}</div>
                        <div className="text-xs text-gray-500">Qty: {item.quantity}</div>
                      </div>
                      <div className="font-bold text-gray-900">{formatPrice(item.price * item.quantity)}</div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 flex justify-between items-center border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    ← Edit Payment
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleFinalPlaceOrder}
                    className="rounded-xl px-8 py-3 text-base font-bold text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-50"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    {isLoading ? "Processing Order..." : `Place Order (${formatPrice(grandTotal)})`}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Summary Box */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-fit space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
              Order Summary
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({items.reduce((sum, i) => sum + i.quantity, 0)} items)</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Estimated Shipping</span>
                <span>{shippingFee === 0 ? "FREE" : formatPrice(shippingFee)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 pt-3 border-t border-gray-100">
                <span>Total</span>
                <span>{formatPrice(grandTotal)}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CheckoutShell;
