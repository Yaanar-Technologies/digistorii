"use client";

import React, { useState, useEffect } from "react";
import { StorefrontTheme, CartItemType } from "./types";
import { formatPrice } from "@/lib/currency";
import { City, Country, State } from "country-state-city";

export type CheckoutPaymentMethod = "upi" | "card" | "netbanking" | "wallet" | "cod";

export interface CheckoutOrderDetails {
  shippingAddress: {
    fullName: string;
    email: string;
    phone: string;
    addressLine: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    addressType?: string;
    isDefault?: boolean;
  };
  shippingAddressId?: number;
  customerId?: number;
  paymentMethod: CheckoutPaymentMethod;
  items: CartItemType[];
  grandTotal: number;
  couponCode?: string;
}

export interface CheckoutShellProps {
  theme: StorefrontTheme;
  company?: string;
  items: CartItemType[];
  onPlaceOrder?: (orderDetails: CheckoutOrderDetails) => void;
  onBackToCart?: () => void;
  savedAddresses?: any[];
  isLoading?: boolean;
  shippingFreeThreshold?: number;
  shippingFee?: number;
  initialCouponCode?: string;
  serviceableCountries?: string[];
  serviceableStates?: string[];
  serviceablePincodes?: string[];
}

export const CheckoutShell: React.FC<CheckoutShellProps> = ({
  theme,
  company,
  items,
  onPlaceOrder,
  onBackToCart,
  savedAddresses: propSavedAddresses = [],
  isLoading = false,
  shippingFreeThreshold = 500,
  shippingFee: propShippingFee = 49,
  initialCouponCode = "",
  serviceableCountries,
  serviceableStates,
  serviceablePincodes,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [addresses, setAddresses] = useState<any[]>(propSavedAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new" | null>(null);
  const [addressError, setAddressError] = useState("");
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [savedCustomerId, setSavedCustomerId] = useState<number | null>(null);

  const [couponInput, setCouponInput] = useState(initialCouponCode || "");
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
    addressType: "Home",
    isDefault: false,
  });

  const countryOptions = Country.getAllCountries();
  const selectedCountry =
    countryOptions.find((c) => c.name.toLowerCase() === (shippingAddress.country || "India").toLowerCase()) ||
    countryOptions.find((c) => c.isoCode === "IN");
  const stateOptions = State.getStatesOfCountry(selectedCountry?.isoCode || "IN");
  const selectedState = stateOptions.find(
    (s) => s.name.toLowerCase() === (shippingAddress.state || "").trim().toLowerCase()
  );
  const cityOptions =
    selectedCountry && selectedState
      ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
      : [];

  // Payment Method Scaffolding - normalized values
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("cod");

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
      addressType: addr.address_type || addr.addressType || "Home",
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
      addressType: "Home",
      isDefault: false,
    }));
  };

  const handleApplyCoupon = async (codeToApply?: string) => {
    const code = (codeToApply ?? couponInput).trim();
    if (!code || !company) return;
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
        const couponData = data.data;
        const minOrderVal = Number(couponData.min_order_value || 0);

        // Check Minimum Order Value (MOV)
        let eligibleSub = subtotal;
        if (couponData.applies_to === "specific_variants") {
          const allowedVariants = (couponData.allowed_variants || []).map((id: any) => Number(id));
          const eligibleItems = items.filter((i) => allowedVariants.includes(Number(i.variantId)));
          eligibleSub = eligibleItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        }

        if (minOrderVal > 0 && eligibleSub < minOrderVal) {
          setAppliedCoupon(null);
          setCouponError(
            `Add items worth ₹${(minOrderVal - eligibleSub).toFixed(2)} more to use coupon code "${couponData.coupon_code}". (Minimum order: ₹${minOrderVal.toFixed(2)})`
          );
          return;
        }

        setAppliedCoupon({
          ...couponData,
          value: Number(couponData.value || 0),
          allowed_variants: Array.isArray(couponData.allowed_variants)
            ? couponData.allowed_variants.map((id: any) => Number(id))
            : [],
        });
        setCouponInput("");
        setCouponError("");
      } else {
        setAppliedCoupon(null);
        setCouponError(data?.error || "Invalid or expired promo code");
      }
    } catch (err: any) {
      setCouponError(err.message || "Failed to apply promo code");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError("");
  };

  useEffect(() => {
    if (initialCouponCode && company) {
      handleApplyCoupon(initialCouponCode);
    }
  }, [initialCouponCode, company]);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const couponDiscount = React.useMemo(() => {
    if (!appliedCoupon) return 0;
    const { applies_to, discount_type, value, allowed_variants } = appliedCoupon;

    if (applies_to === "entire_order") {
      if (discount_type === "percentage") {
        return Number(((subtotal * value) / 100).toFixed(2));
      } else {
        return Math.min(value, subtotal);
      }
    } else {
      const eligibleItems = items.filter((i) =>
        allowed_variants.includes(Number(i.variantId))
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
  }, [appliedCoupon, subtotal, items]);

  const effectiveFreeThreshold = Math.max(0, Number(shippingFreeThreshold) || 0);
  const effectiveBaseFee = Math.max(0, Number(propShippingFee) || 0);
  const shippingFee = subtotal >= effectiveFreeThreshold ? 0 : effectiveBaseFee;
  const grandTotal = Math.max(0, subtotal - couponDiscount + shippingFee);

  const validateIndianPhone = (ph: string) => {
    const clean = ph.replace(/\s+|-|\+/g, "");
    const ten = clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
    return /^[6-9]\d{9}$/.test(ten);
  };

  const validateIndianPincode = (pin: string) => {
    const cleanPin = String(pin || "").replace(/\D/g, "");
    return /^[1-9][0-9]{5}$/.test(cleanPin);
  };

  const serviceabilityStatus = React.useMemo(() => {
    const pin = (shippingAddress.postalCode || "").replace(/\D/g, "").trim();
    const rawState = (shippingAddress.state || "").trim();
    const cntry = (shippingAddress.country || "India").trim().toLowerCase();

    // Helper to normalize state names so "Tamil Nadu", "TN", "tamilnadu" are interchangeable
    const normalizeState = (s: string) => {
      const clean = (s || "").toLowerCase().replace(/[\s_-]+/g, "");
      if (clean === "tn" || clean === "tamilnadu") return "tamilnadu";
      return clean;
    };

    const st = normalizeState(rawState);

    if (serviceableCountries && serviceableCountries.length > 0 && cntry) {
      const allowed = serviceableCountries.map((c) => c.trim().toLowerCase());
      if (!allowed.includes(cntry)) {
        return {
          isServiceable: false,
          reason: `Delivery is currently unavailable to ${shippingAddress.country || "selected country"}.`,
        };
      }
    }

    // If serviceableStates is configured, check normalized state; if empty/undefined, all states are serviceable
    if (serviceableStates && serviceableStates.length > 0 && rawState) {
      const allowed = serviceableStates.map((s) => normalizeState(s.trim()));
      if (!allowed.includes(st)) {
        return {
          isServiceable: false,
          reason: `Delivery is currently unavailable to state "${shippingAddress.state}".`,
        };
      }
    }

    if (serviceablePincodes && serviceablePincodes.length > 0 && pin.length >= 6) {
      const allowed = serviceablePincodes.map((p) => p.replace(/\D/g, "").trim());
      const isMatch = allowed.some((allowedPin) => allowedPin === pin || pin.startsWith(allowedPin));
      if (!isMatch) {
        return {
          isServiceable: false,
          reason: `Delivery is unavailable for PIN code ${pin}.`,
        };
      }
    }

    return { isServiceable: true, reason: "" };
  }, [shippingAddress.postalCode, shippingAddress.state, shippingAddress.country, serviceableCountries, serviceableStates, serviceablePincodes]);

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

      if (!serviceabilityStatus.isServiceable) {
        setAddressError(serviceabilityStatus.reason);
        return;
      }

      // Avoid Unnecessary Saves:
      // Only call POST /api/ecom/customer/addresses if:
      // 1. selectedAddressId === "new", OR
      // 2. The customer has zero saved addresses (addresses.length === 0)
      const shouldSaveNewAddress = selectedAddressId === "new" || addresses.length === 0;

      if (shouldSaveNewAddress) {
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
              city: (shippingAddress.city.trim().toLowerCase() === "chennai" || shippingAddress.city.trim().toLowerCase() === "madras" || shippingAddress.postalCode.replace(/\D/g, "").startsWith("600"))
                ? "Chennai"
                : shippingAddress.city.trim(),
              state: (["tn", "tamilnadu"].includes(shippingAddress.state.toLowerCase().replace(/[\s_-]+/g, "")) || shippingAddress.city.trim().toLowerCase() === "chennai" || shippingAddress.postalCode.replace(/\D/g, "").startsWith("600"))
                ? "Tamil Nadu"
                : shippingAddress.state.trim(),
              pincode: shippingAddress.postalCode.replace(/\D/g, "").trim(),
              country: shippingAddress.country || "India",
              address_type: shippingAddress.addressType || "Home",
              is_default: shippingAddress.isDefault,
              email: shippingAddress.email.trim(),
            }),
          });
          const saveResult = await saveRes.json();
          if (saveResult.success && saveResult.address) {
            setAddresses((prev) => [
              saveResult.address,
              ...prev.filter((a) => a.id !== saveResult.address.id),
            ]);
            setSelectedAddressId(saveResult.address.id);
            if (saveResult.address.customer_id) {
              setSavedCustomerId(saveResult.address.customer_id);
            }
          }
        } catch (err) {
          console.error("Address auto-save notice:", err);
        } finally {
          setIsSavingAddress(false);
        }
      }

      setCurrentStep(2);
    } else if (currentStep < 3) {
      setCurrentStep((prev) => (prev + 1) as 1 | 2 | 3);
    }
  };

  const handleFinalPlaceOrder = () => {
    if (onPlaceOrder) {
      const activeAddressId = typeof selectedAddressId === "number" ? selectedAddressId : undefined;
      onPlaceOrder({
        shippingAddress,
        shippingAddressId: activeAddressId,
        customerId: savedCustomerId || undefined,
        paymentMethod,
        items,
        grandTotal,
        couponCode: appliedCoupon ? appliedCoupon.coupon_code : undefined,
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

                {!serviceabilityStatus.isServiceable && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 mb-4 flex items-center gap-2.5 text-xs text-red-800 font-medium">
                    <span className="text-red-600 font-bold text-base shrink-0">⚠️</span>
                    <span>{serviceabilityStatus.reason} Please select or enter a serviceable address.</span>
                  </div>
                )}

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
                        const label = addr.address_type || "Home";
                        const labelIcon = label === "Home" ? "🏠" : label === "Work" ? "💼" : "📍";

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
                              <div className="flex items-center gap-2">
                                <span>{addr.recipient_name || addr.fullName || "Recipient"}</span>
                                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md text-[10px] font-semibold">
                                  {labelIcon} {label}
                                </span>
                              </div>
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

                {/* Address Label Selector */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Address Label</label>
                  <div className="flex items-center gap-2">
                    {(["Home", "Work", "Other"] as const).map((type) => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => setShippingAddress({ ...shippingAddress, addressType: type })}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${(shippingAddress.addressType || "Home") === type
                          ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600 shadow-xs"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                          }`}
                      >
                        {type === "Home" ? "🏠 Home" : type === "Work" ? "💼 Work" : "📍 Other"}
                      </button>
                    ))}
                  </div>
                </div>

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
                    <label className="block text-xs font-medium text-gray-700 mb-1">State *</label>
                    <select
                      required
                      value={shippingAddress.state}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value, city: "" })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    >
                      <option value="">Select State</option>
                      {shippingAddress.state && !stateOptions.some((s) => s.name.toLowerCase() === shippingAddress.state.toLowerCase()) && (
                        <option value={shippingAddress.state}>{shippingAddress.state}</option>
                      )}
                      {stateOptions.map((s) => (
                        <option key={s.isoCode} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">City *</label>
                    <select
                      required
                      disabled={!shippingAddress.state}
                      value={shippingAddress.city}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    >
                      <option value="">{shippingAddress.state ? "Select City" : "Select State first"}</option>
                      {shippingAddress.city && !cityOptions.some((c) => c.name.toLowerCase() === shippingAddress.city.toLowerCase()) && (
                        <option value={shippingAddress.city}>{shippingAddress.city}</option>
                      )}
                      {cityOptions.map((c, idx) => (
                        <option key={`${c.name}-${idx}`} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
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
                    disabled={isSavingAddress || !serviceabilityStatus.isServiceable}
                    className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    {isSavingAddress ? "Saving..." : !serviceabilityStatus.isServiceable ? "Location Unavailable" : "Continue to Payment"}
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
                        <div className="text-sm font-bold text-gray-900">UPI / QR Code</div>
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
                    title="Remove promo code"
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
                    onClick={() => handleApplyCoupon()}
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

            <div className="space-y-2 text-sm border-t border-gray-100 pt-3">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({items.reduce((sum, i) => sum + i.quantity, 0)} items)</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Coupon Discount</span>
                  <span>-{formatPrice(couponDiscount)}</span>
                </div>
              )}
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
