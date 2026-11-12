"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  MapPinIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCustomerAuthStore } from "@/store/customerAuthStore";

export default function AddressBookPage() {
  const params = useParams();
  const company = (params.company as string) || "";
  const { customer, checkSession } = useCustomerAuthStore();

  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [formData, setFormData] = useState({
    recipient_name: "",
    recipient_phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
    address_type: "Home",
    is_default: false,
  });

  const loadAddresses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${company}/ecom/customer/addresses`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.addresses)) {
          setAddresses(data.addresses);
        }
      }
    } catch (err: any) {
      setError("Failed to load address book.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (company) {
      loadAddresses();
    }
  }, [company]);

  const openAddModal = () => {
    setEditingAddress(null);
    setFormData({
      recipient_name: customer?.name || "",
      recipient_phone: customer?.phone || "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "Tamil Nadu",
      pincode: "",
      country: "India",
      address_type: "Home",
      is_default: addresses.length === 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (addr: any) => {
    setEditingAddress(addr);
    setFormData({
      recipient_name: addr.recipient_name || "",
      recipient_phone: addr.recipient_phone || "",
      address_line1: addr.address_line1 || "",
      address_line2: addr.address_line2 || "",
      city: addr.city || "",
      state: addr.state || "Tamil Nadu",
      pincode: addr.pincode || "",
      country: addr.country || "India",
      address_type: addr.address_type || "Home",
      is_default: Boolean(addr.is_default),
    });
    setIsModalOpen(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const method = editingAddress ? "PUT" : "POST";
      const bodyPayload = editingAddress ? { ...formData, id: editingAddress.id } : formData;

      const res = await fetch(`/api/${company}/ecom/customer/addresses`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save address");
      }

      setSuccess(editingAddress ? "Address updated successfully." : "Address added successfully.");
      setIsModalOpen(false);
      await loadAddresses();
      await checkSession(company);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to save address.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = async (id: number) => {
    if (!window.confirm("Are you sure you want to remove this delivery address?")) return;
    try {
      const res = await fetch(`/api/${company}/ecom/customer/addresses?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete address");
      setSuccess("Address removed.");
      await loadAddresses();
      await checkSession(company);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to delete address.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Saved Addresses</h1>
          <p className="text-xs text-slate-500">
            Manage your delivery and billing addresses for quick and effortless checkout
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Add New Address</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
          {success}
        </div>
      )}

      {/* Address Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-xs text-slate-400">
          Loading saved addresses...
        </div>
      ) : addresses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-3">
          <div className="h-12 w-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <MapPinIcon className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-bold text-slate-800">No addresses saved yet</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Save your home or office address to enable instant 1-click checkout on your next order.
          </p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors pt-2 cursor-pointer"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add Address Now</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`bg-white rounded-2xl border p-5 shadow-xs space-y-3 relative transition-all ${
                addr.is_default ? "border-indigo-300 ring-1 ring-indigo-200/60" : "border-slate-200/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-2xs font-bold uppercase bg-slate-100 text-slate-700">
                    {addr.address_type || "Home"}
                  </span>
                  {addr.is_default && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircleIcon className="h-3 w-3" />
                      Default
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(addr)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                    title="Edit Address"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Delete Address"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-1 leading-relaxed">
                <div className="font-bold text-slate-900">{addr.recipient_name}</div>
                <div>{addr.address_line1}</div>
                {addr.address_line2 && <div>{addr.address_line2}</div>}
                <div>
                  {addr.city}, {addr.state} - <strong className="font-mono text-slate-900">{addr.pincode}</strong>
                </div>
                <div className="text-2xs text-slate-400 font-mono pt-1">
                  Phone: {addr.recipient_phone}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Address Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {editingAddress ? "Edit Delivery Address" : "Add New Delivery Address"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase">Recipient Name</label>
                  <input
                    type="text"
                    required
                    value={formData.recipient_name}
                    onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase">10-Digit Mobile Phone</label>
                  <input
                    type="tel"
                    required
                    value={formData.recipient_phone}
                    onChange={(e) => setFormData({ ...formData, recipient_phone: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-700 uppercase">Address Line 1 (House/Street)</label>
                <input
                  type="text"
                  required
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-700 uppercase">Address Line 2 (Area/Landmark)</label>
                <input
                  type="text"
                  value={formData.address_line2}
                  onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase">PIN Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase">City</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-2xs font-bold text-slate-700 uppercase">State</label>
                  <input
                    type="text"
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Set as Default Delivery Address</span>
                </label>

                <select
                  value={formData.address_type}
                  onChange={(e) => setFormData({ ...formData, address_type: e.target.value })}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-2xs font-semibold"
                >
                  <option value="Home">Home</option>
                  <option value="Office">Office</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Address"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

