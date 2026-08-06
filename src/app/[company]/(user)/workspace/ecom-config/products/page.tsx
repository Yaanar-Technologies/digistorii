"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import Badge from "@/components/ui/badge/Badge";

type Variant = {
  variant_id: number;
  sku: string;
  size: string;
  product_name: string;
  product_code: string;
  category: string;
  color_name: string;
  color_hex: string;
  fitting_name: string;
  pos_price: number;
  is_selected_draft: boolean;
  is_live: boolean;
  ecom_price_override: number | null;
  ecom_price_override_active: boolean;
};

type Discount = {
  id: number;
  name: string;
  discount_type: string;
  value: number;
  channel: "pos" | "ecom" | "both";
};

export default function ProductSelectorPage() {
  const params = useParams();
  const company = params.company as string || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useCustomPricing, setUseCustomPricing] = useState(false);
  const [useCustomDiscounts, setUseCustomDiscounts] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);

  // Draft change states
  const [draftSelections, setDraftSelections] = useState<Record<number, boolean>>({});
  const [draftOverrides, setDraftOverrides] = useState<Record<number, string>>({});
  const [draftDiscounts, setDraftDiscounts] = useState<Record<number, "pos" | "ecom" | "both">>({});

  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!company) return;

    const loadData = async () => {
      try {
        // Load Settings to see if custom pricing/discounts toggles are ON
        const settingsRes = await apiFetch("/api/company/ecom-settings", company);
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.success && settingsData.settings) {
            setUseCustomPricing(settingsData.settings.use_custom_pricing === true);
            setUseCustomDiscounts(settingsData.settings.use_custom_discounts === true);
          }
        }

        // Load Variants and Discounts Catalog
        const catalogRes = await apiFetch("/api/company/ecom-products", company);
        if (catalogRes.ok) {
          const catalogData = await catalogRes.json();
          if (catalogData.success) {
            setVariants(catalogData.variants || []);
            setDiscounts(catalogData.discounts || []);

            // Initialize draft states
            const selections: Record<number, boolean> = {};
            const overrides: Record<number, string> = {};
            catalogData.variants.forEach((v: Variant) => {
              selections[v.variant_id] = v.is_selected_draft;
              overrides[v.variant_id] = v.ecom_price_override !== null ? String(v.ecom_price_override) : "";
            });

            const discountChannels: Record<number, "pos" | "ecom" | "both"> = {};
            catalogData.discounts.forEach((d: Discount) => {
              discountChannels[d.id] = d.channel || "both";
            });

            setDraftSelections(selections);
            setDraftOverrides(overrides);
            setDraftDiscounts(discountChannels);
          }
        }
      } catch (err) {
        console.error("Failed to load catalog details", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [company]);

  const handleSelectionToggle = (variantId: number) => {
    setDraftSelections(prev => ({
      ...prev,
      [variantId]: !prev[variantId]
    }));
  };

  const handleOverrideChange = (variantId: number, value: string) => {
    setDraftOverrides(prev => ({
      ...prev,
      [variantId]: value
    }));
  };

  const handleDiscountChannelChange = (discountId: number, value: "pos" | "ecom" | "both") => {
    setDraftDiscounts(prev => ({
      ...prev,
      [discountId]: value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    // Prepare selections payload
    const selectionsPayload = Object.keys(draftSelections).map(id => ({
      variant_id: Number(id),
      is_selected_draft: draftSelections[Number(id)]
    }));

    // Prepare overrides payload
    const overridesPayload = Object.keys(draftOverrides).map(id => {
      const val = draftOverrides[Number(id)];
      return {
        variant_id: Number(id),
        ecom_price: val.trim() === "" ? null : Number(val)
      };
    });

    // Prepare discounts payload
    const discountsPayload = Object.keys(draftDiscounts).map(id => ({
      discount_id: Number(id),
      channel: draftDiscounts[Number(id)]
    }));

    try {
      const res = await apiFetch("/api/company/ecom-products", company, {
        method: "POST",
        body: JSON.stringify({
          selections: selectionsPayload,
          overrides: overridesPayload,
          discounts: discountsPayload
        })
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Storefront catalog selections and pricing overrides saved as draft successfully!" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const errorData = await res.json();
        setMessage({ type: "error", text: errorData.message || "Failed to save storefront catalog details." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setSaving(false);
    }
  };

  const filteredVariants = variants.filter(v => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      v.product_name.toLowerCase().includes(term) ||
      v.sku.toLowerCase().includes(term) ||
      v.product_code.toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Loading product catalog...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="space-y-1">
          <Badge variant="light" color="primary">
            Storefront Catalog
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Product Selection & Price Overrides</h1>
          <p className="text-sm text-gray-600">Select active variants to display on your storefront and override POS pricing/discounts.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-600 focus:outline-none disabled:opacity-50"
          >
            {saving ? "Saving Changes..." : "Save Draft Changes"}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      {/* Discount Tagging Section */}
      {useCustomDiscounts && discounts.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Active Discounts Channel Mapping</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Discount Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Type</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Value</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Active Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {discounts.map(d => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{d.discount_type}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {d.discount_type === "percentage" ? `${d.value}%` : `₹${d.value}`}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={draftDiscounts[d.id] || "both"}
                        onChange={e => handleDiscountChannelChange(d.id, e.target.value as any)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="both">Both (POS & Storefront)</option>
                        <option value="pos">POS Only (In-store)</option>
                        <option value="ecom">Storefront Only (Online)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Selection Catalog */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-gray-900">Storefront Product Variants</h2>
          <input
            type="text"
            placeholder="Search variant name or SKU..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        {filteredVariants.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No variants found matching the search. Ensure variants are in "active" status.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Display</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Product Info</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Variant Details</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">POS Price</th>
                  {useCustomPricing && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Ecom Price Override</th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Live Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredVariants.map(v => {
                  const isChecked = draftSelections[v.variant_id] || false;
                  return (
                    <tr key={v.variant_id} className={isChecked ? "bg-brand-50/10" : ""}>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectionToggle(v.variant_id)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-gray-900">{v.product_name}</span>
                        <span className="block text-xs text-gray-500">{v.product_code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-mono text-xs">{v.sku}</span>
                        <span className="block text-xs text-gray-600">
                          {v.color_name ? `${v.color_name} | ` : ""}Size {v.size || "N/A"}
                          {v.fitting_name ? ` | ${v.fitting_name}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">₹{Number(v.pos_price).toFixed(2)}</td>
                      {useCustomPricing && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400 text-xs">₹</span>
                            <input
                              type="number"
                              disabled={!isChecked}
                              placeholder={isChecked ? "POS Selling Price" : "Unselected"}
                              value={draftOverrides[v.variant_id] || ""}
                              onChange={e => handleOverrideChange(v.variant_id, e.target.value)}
                              className="w-28 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {v.is_live ? (
                          <Badge variant="light" color="success">Live</Badge>
                        ) : isChecked ? (
                          <Badge variant="light" color="warning">Staged Draft</Badge>
                        ) : (
                          <Badge variant="light" color="dark">Not Listed</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
