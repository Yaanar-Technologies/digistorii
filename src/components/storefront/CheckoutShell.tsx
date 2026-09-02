"use client";

import React, { useState, useEffect } from "react";
import { StorefrontTheme, CartItemType } from "./types";
import { formatPrice } from "@/lib/currency";

export interface CheckoutShellProps {
  theme: StorefrontTheme;
  company?: string;
  items: CartItemType[];
  onPlaceOrder?: (orderDetails: any) => void;
  onBackToCart?: () => void;
  savedAddresses?: any[];
  isLoading?: boolean;
}

export const CheckoutShell: React.FC<CheckoutShellProps> = ({
  theme,
  company,
  items,
  onPlaceOrder,
  onBackToCart,
  savedAddresses: propSavedAddresses = [],
  isLoading = false,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [addresses, setAddresses] = useState<any[]>(propSavedAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new" | null>(null);
  const [addressError, setAddressError] = useState("");
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  // Address State Scaffolding
  const [shippingAddress, setShippingAddress] = useState({
    fullName: "",
    email: "",
    phone: "",
    addressLine: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
    isDefault: false,
  });

  // Payment Method Scaffolding
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cod" | "upi">("cod");

  // Fetch saved customer addresses on mount
  useEffect(() => {
    const fetchAddressesAndProfile = async () => {
      try {
        const meRes = await fetch("/api/storefront/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.authenticated && meData.customer) {
            setShippingAddress((prev) => ({
              ...prev,
              fullName: prev.fullName || meData.customer.name || meData.customer.cust_name || "",
              email: prev.email || meData.customer.email || "",
              phone: prev.phone || meData.customer.phone || "",
            }));

            if (Array.isArray(meData.customer.addresses) && meData.customer.addresses.length > 0) {
              setAddresses(meData.customer.addresses);
              const defaultAddr = meData.customer.addresses.find((a: any) => a.is_default) || meData.customer.addresses[0];
              if (defaultAddr) {
                setSelectedAddressId(defaultAddr.id);
                populateAddressForm(defaultAddr);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load customer addresses:", err);
      }
    };

    fetchAddressesAndProfile();
  }, [company]);

  const populateAddressForm = (addr: any) => {
    setShippingAddress((prev) => ({
      ...prev,
      fullName: addr.recipient_name || addr.fullName || prev.fullName,
      phone: addr.recipient_phone || addr.phone || prev.phone,
      addressLine: addr.address_line1 || addr.addressLine || "",
      addressLine2: addr.address_line2 || addr.addressLine2 || "",
      city: addr.city || "",
      state: addr.state || "",
      postalCode: addr.pincode || addr.postalCode || "",
      country: addr.country || "India",
      isDefault: addr.is_default || false,
    }));
  };

  const handleSelectAddress = (addr: any) => {
    setSelectedAddressId(addr.id);
    populateAddressForm(addr);
  };

  const handleSelectNewAddress = () => {
    setSelectedAddressId("new");
    setShippingAddress((prev) => ({
      ...prev,
      addressLine: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      isDefault: false,
    }));
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingFee = subtotal >= 500 ? 0 : 49;
  const grandTotal = subtotal + shippingFee;

  const validateIndianPhone = (ph: string) => {
    const clean = ph.replace(/\s+|-|\+/g, "");
    const ten = clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
    return /^[6-9]\d{9}$/.test(ten);
  };

  const validateIndianPincode = (pin: string) => {
    return /^[1-9][0-9]{5}$/.test(pin.trim());
  };

  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError("");

    if (currentStep === 1) {
      if (!shippingAddress.fullName.trim()) {
        setAddressError("Recipient full name is required");
        return;
      }

      if (!validateIndianPhone(shippingAddress.phone)) {
        setAddressError("Please enter a valid 10-digit Indian mobile number (starts with 6-9)");
        return;
      }

      if (!shippingAddress.addressLine.trim()) {
        setAddressError("Street address (Line 1) is required");
        return;
      }

      if (!shippingAddress.city.trim()) {
        setAddressError("City is required");
        return;
      }

      if (!shippingAddress.state.trim()) {
        setAddressError("State is required");
        return;
      }

      if (!validateIndianPincode(shippingAddress.postalCode)) {
        setAddressError("Invalid PIN code. Please enter a valid 6-digit Indian numeric PIN code (e.g. 560001)");
        return;
      }

      // Save address to database asynchronously
      try {
        setIsSavingAddress(true);
        const saveRes = await fetch("/api/ecom/customer/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: company || "",
            recipient_name: shippingAddress.fullName.trim(),
            recipient_phone: shippingAddress.phone.trim(),
            address_line1: shippingAddress.addressLine.trim(),
            address_line2: shippingAddress.addressLine2.trim(),
            city: shippingAddress.city.trim(),
            state: shippingAddress.state.trim(),
            pincode: shippingAddress.postalCode.trim(),
            country: shippingAddress.country || "India",
            is_default: shippingAddress.isDefault,
            email: shippingAddress.email.trim(),
          }),
        });
        const saveResult = await saveRes.json();
        if (saveResult.success && saveResult.address) {
          setAddresses((prev) => [saveResult.address, ...prev.filter((a) => a.id !== saveResult.address.id)]);
          setSelectedAddressId(saveResult.address.id);
        }
      } catch (err) {
        console.error("Address auto-save notice:", err);
      } finally {
        setIsSavingAddress(false);
      }

      setCurrentStep(2);
    } else if (currentStep < 3) {
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
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${currentStep >= 1 ? "text-white" : "bg-gray-200 text-gray-600"
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
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${currentStep >= 2 ? "text-white" : "bg-gray-200 text-gray-600"
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
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${currentStep >= 3 ? "text-white" : "bg-gray-200 text-gray-600"
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
              <form onSubmit={handleNextStep} className="space-y-5">
                <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
                  1. Delivery & Shipping Address
                </h2>

                {addressError && (
                  <div className="rounded-xl bg-red-50 p-3.5 text-xs text-red-600 font-semibold border border-red-100">
                    {addressError}
                  </div>
                )}

                {/* Saved Address Cards Selection */}
                {addresses.length > 0 && (
                  <div className="space-y-3 mb-4">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Select Saved Delivery Address
                    </label>
                    <div className="grid grid-cols-1 gap-3">
                      {addresses.map((addr) => {
                        const isSelected = selectedAddressId === addr.id;
                        return (
                          <div
                            key={addr.id}
                            onClick={() => handleSelectAddress(addr)}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${isSelected
                                ? "border-black bg-gray-50 ring-1 ring-black shadow-xs"
                                : "border-gray-200 hover:border-gray-300"
                              }`}
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-gray-900">
                              <span>{addr.recipient_name || addr.fullName || "Recipient"}</span>
                              {addr.is_default && (
                                <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-[10px]">DEFAULT</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {addr.address_line1}, {addr.address_line2 ? `${addr.address_line2}, ` : ""}{addr.city}, {addr.state} - {addr.pincode}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">Phone: {addr.recipient_phone || addr.phone}</div>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={handleSelectNewAddress}
                        className={`p-3 rounded-xl border border-dashed text-xs font-semibold transition-colors text-center cursor-pointer ${selectedAddressId === "new" ? "border-black text-black bg-gray-50" : "border-gray-300 text-gray-600 hover:border-black"
                          }`}
                      >
                        + Add a New Address
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Recipient Full Name *</label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.fullName}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                      placeholder="Ravi Sharma"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={shippingAddress.email}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, email: e.target.value })}
                      placeholder="ravi@example.com"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mobile Number (10-digit Indian) *</label>
                  <input
                    type="tel"
                    required
                    value={shippingAddress.phone}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                    placeholder="9876543210"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Street Address (Line 1) *</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.addressLine}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine: e.target.value })}
                    placeholder="Flat / House No., Building, Street"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Landmark / Area (Line 2)</label>
                  <input
                    type="text"
                    value={shippingAddress.addressLine2}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, addressLine2: e.target.value })}
                    placeholder="Near City Park, Sector 4"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.city}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                      placeholder="Bengaluru"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">State *</label>
                    <input
                      type="text"
                      required
                      value={shippingAddress.state}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                      placeholder="Karnataka"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">PIN Code (6-digit) *</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={shippingAddress.postalCode}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: e.target.value })}
                      placeholder="560001"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isDefaultAddress"
                    checked={shippingAddress.isDefault}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, isDefault: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isDefaultAddress" className="text-xs text-gray-700 cursor-pointer">
                    Set as my default shipping address
                  </label>
                </div>

                <div className="pt-4 flex justify-between items-center border-t border-gray-100">
                  <button
                    type="button"
                    onClick={onBackToCart}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
                  >
                    ← Return to Cart
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAddress}
                    className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    {isSavingAddress ? "Saving..." : "Continue to Payment"}
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
                    className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${paymentMethod === "cod"
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
                    className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${paymentMethod === "card"
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
                        <div className="text-xs text-gray-500">Secure online card payment via Razorpay</div>
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${paymentMethod === "upi"
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
                        <div className="text-xs text-gray-500">Google Pay, PhonePe, Paytm, BHIM UPI</div>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="pt-4 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
                  >
                    ← Back to Shipping
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm cursor-pointer"
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
                    <span className="text-gray-500">Recipient Name:</span>
                    <span className="font-semibold text-gray-900">{shippingAddress.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Delivery Address:</span>
                    <span className="font-semibold text-gray-900 text-right">
                      {shippingAddress.addressLine}, {shippingAddress.city}, {shippingAddress.state} - {shippingAddress.postalCode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phone:</span>
                    <span className="font-semibold text-gray-900">{shippingAddress.phone}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200/60 pt-2 mt-2">
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
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 cursor-pointer"
                  >
                    ← Edit Payment
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleFinalPlaceOrder}
                    className="rounded-xl px-8 py-3 text-base font-bold text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-50 cursor-pointer"
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
