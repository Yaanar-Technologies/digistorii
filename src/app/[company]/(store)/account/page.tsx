"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { City, State } from "country-state-city";
import {
  UserIcon,
  MapPinIcon,
  CheckCircleIcon,
  ShoppingBagIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { useCustomerAuthStore } from "@/store/customerAuthStore";

export default function MyProfilePage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";
  const { customer, checkSession } = useCustomerAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Shipping Address Fields
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");

  const stateOptions = State.getStatesOfCountry("IN");
  const selectedState = stateOptions.find(
    (s) => s.name.toLowerCase() === (state || "").trim().toLowerCase()
  );
  const cityOptions = selectedState
    ? City.getCitiesOfState("IN", selectedState.isoCode)
    : [];

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Sync form with customer data
  useEffect(() => {
    if (customer) {
      setName(customer.name || customer.cust_name || "");
      setEmail(customer.email || "");
      setPhone(customer.phone || "");

      const primaryAddr = customer.addresses?.find((a: any) => a.is_default) || customer.addresses?.[0];
      if (primaryAddr) {
        setAddressLine1(primaryAddr.address_line1 || "");
        setAddressLine2(primaryAddr.address_line2 || "");
        setCity(primaryAddr.city || "");
        setState(primaryAddr.state || "");
        setPincode(primaryAddr.pincode || "");
        setCountry(primaryAddr.country || "India");
      }
    }
  }, [customer]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/${company}/storefront/auth/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          country: country.trim() || "India",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update profile");
      }

      setFeedback({ type: "success", message: "Profile and shipping address updated successfully!" });
      await checkSession(company);
      router.refresh();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">My Profile & Shipping Address</h1>
          <p className="text-xs text-slate-500">
            Manage your personal identity, contact details and primary delivery address in one place
          </p>
        </div>

        <Link
          href={`/${company}/account/orders`}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors w-fit"
        >
          <ShoppingBagIcon className="h-4 w-4 text-slate-500" />
          <span>View My Orders</span>
          <ArrowRightIcon className="h-3 w-3 text-slate-400" />
        </Link>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${feedback.type === "success"
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-rose-50 text-rose-800 border-rose-200"
            }`}
        >
          {feedback.type === "success" && <CheckCircleIcon className="h-4 w-4 text-emerald-600 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Unified Profile & Address Form */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        {/* Section 1: Customer Personal Details */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <UserIcon className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Personal Information</h2>
              <p className="text-2xs text-slate-400">Used for order receipts and customer communications</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ravi Sharma"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ravi@example.com"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Default Shipping Address */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <MapPinIcon className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Primary Delivery Address</h2>
              <p className="text-2xs text-slate-400">Default destination for your online checkout orders</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Address Line 1 (Flat, House no., Building, Street) *</label>
              <input
                type="text"
                required
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Flat 402, Green Valley Apartments"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Address Line 2 (Area, Landmark)</label>
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Country</label>
              <input
                type="text"
                disabled
                value="India"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-500 font-medium cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">State *</label>
              <select
                required
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setCity("");
                }}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="">Select State</option>
                {state && !stateOptions.some((s) => s.name.toLowerCase() === state.toLowerCase()) && (
                  <option value={state}>{state}</option>
                )}
                {stateOptions.map((s) => (
                  <option key={s.isoCode} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">City / Town *</label>
              {cityOptions.length > 0 ? (
                <select
                  required
                  disabled={!state}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  <option value="">{state ? "Select City" : "Select State first"}</option>
                  {city && !cityOptions.some((c) => c.name.toLowerCase() === city.toLowerCase()) && (
                    <option value={city}>{city}</option>
                  )}
                  {cityOptions.map((c, idx) => (
                    <option key={`${c.name}-${idx}`} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  disabled={!state}
                  placeholder={state ? "Enter city" : "Select state first"}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">PIN Code (6 digits) *</label>
              <input
                type="text"
                required
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="600001"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving Profile..." : "Save Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
