//C:\Users\yanna\digistorii-ECom\src\app\[company]\(user)\workspace\ecom-config\products\page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import Badge from "@/components/ui/badge/Badge";
import { usePagination } from "@/hooks/usePagination";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";

type Variant = {
  variant_id: number;
  sku: string;
  size: string;
  product_name: string;
  product_code: string;
  category: string;
  category_name?: string;
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

type BulkOperationType =
  | "add_fixed"
  | "subtract_fixed"
  | "increase_percent"
  | "decrease_percent"
  | "set_exact";

export default function ProductSelectorPage() {
  const params = useParams();
  const company = (params.company as string) || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useCustomPricing, setUseCustomPricing] = useState(false);
  const [useCustomDiscounts, setUseCustomDiscounts] = useState(false);
  const [hasPosAccess, setHasPosAccess] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);

  // Draft change states
  const [draftSelections, setDraftSelections] = useState<Record<number, boolean>>({});
  const [draftOverrides, setDraftOverrides] = useState<Record<number, string>>({});
  const [draftDiscounts, setDraftDiscounts] = useState<Record<number, "pos" | "ecom" | "both">>({});

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Bulk pricing states
  const [bulkOperation, setBulkOperation] = useState<BulkOperationType>("add_fixed");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkTarget, setBulkTarget] = useState<"filtered_selected" | "all_selected">("filtered_selected");

  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!company) return;

    const loadData = async () => {
      try {
        setLoading(true);

        // Load Settings to see if custom pricing/discounts toggles are ON and check plan modules
        const settingsRes = await apiFetch("/api/company/ecom-settings", company);
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.success && settingsData.settings) {
            setUseCustomPricing(settingsData.settings.use_custom_pricing === true);
            setUseCustomDiscounts(settingsData.settings.use_custom_discounts === true);
          }
          if (settingsData.pos_access !== undefined) {
            setHasPosAccess(settingsData.pos_access === true);
          }
        }

        // Load Variants and Discounts Catalog
        const catalogRes = await apiFetch("/api/company/ecom-products", company);
        if (catalogRes.ok) {
          const catalogData = await catalogRes.json();
          if (catalogData.success) {
            setVariants(catalogData.variants || []);
            setDiscounts(catalogData.discounts || []);

            if (catalogData.pos_access !== undefined) {
              setHasPosAccess(catalogData.pos_access === true);
            }

            // Initialize draft states
            const selections: Record<number, boolean> = {};
            const overrides: Record<number, string> = {};
            catalogData.variants.forEach((v: Variant) => {
              selections[v.variant_id] = v.is_selected_draft;
              overrides[v.variant_id] =
                v.ecom_price_override !== null && v.ecom_price_override !== undefined
                  ? String(v.ecom_price_override)
                  : "";
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

  // Extract unique categories for filtering (human-readable names)
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    variants.forEach((v) => {
      const cat = (v.category_name || v.category || "").trim();
      if (cat) {
        set.add(cat);
      }
    });
    return Array.from(set).sort();
  }, [variants]);

  // Filtered variants
  // IMPORTANT: To prevent rows from vanishing while active editing/selecting,
  // the status filter is evaluated against the baseline saved server state (v.is_selected_draft, v.is_live).
  const filteredVariants = useMemo(() => {
    return variants.filter((v) => {
      // 1. Search filter
      const term = searchTerm.toLowerCase().trim();
      if (term) {
        const matchesName = (v.product_name || "").toLowerCase().includes(term);
        const matchesSku = (v.sku || "").toLowerCase().includes(term);
        const matchesCode = (v.product_code || "").toLowerCase().includes(term);
        const matchesColor = (v.color_name || "").toLowerCase().includes(term);
        if (!matchesName && !matchesSku && !matchesCode && !matchesColor) {
          return false;
        }
      }

      // 2. Category filter
      const catLabel = (v.category_name || v.category || "").trim();
      if (selectedCategory && catLabel !== selectedCategory) {
        return false;
      }

      // 3. Status filter evaluated against initial/saved server state
      const initialChecked = Boolean(v.is_selected_draft);
      if (statusFilter === "selected" && !initialChecked) return false;
      if (statusFilter === "unselected" && initialChecked) return false;
      if (statusFilter === "live" && !v.is_live) return false;
      if (statusFilter === "draft" && (!initialChecked || v.is_live)) return false;

      return true;
    });
  }, [variants, searchTerm, selectedCategory, statusFilter]);

  // Pagination hook
  const {
    currentPage,
    itemsPerPage: rowsPerPage,
    setItemsPerPage: setRowsPerPage,
    totalItems,
    totalPages,
    paginatedData,
    pageNumbers,
    showingFrom,
    showingTo,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  } = usePagination({
    data: filteredVariants,
    initialItemsPerPage: 20,
    resetDeps: [searchTerm, selectedCategory, statusFilter],
  });

  // Selection counts
  const totalSelectedCount = useMemo(() => {
    return Object.values(draftSelections).filter(Boolean).length;
  }, [draftSelections]);

  const filteredSelectedCount = useMemo(() => {
    return filteredVariants.filter((v) => draftSelections[v.variant_id]).length;
  }, [filteredVariants, draftSelections]);

  // Select all state for filtered variants
  const isAllFilteredSelected =
    filteredVariants.length > 0 &&
    filteredVariants.every((v) => draftSelections[v.variant_id]);
  const isSomeFilteredSelected =
    filteredVariants.some((v) => draftSelections[v.variant_id]) && !isAllFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isSomeFilteredSelected;
    }
  }, [isSomeFilteredSelected]);

  const handleToggleSelectAll = () => {
    const nextState = !isAllFilteredSelected;
    setDraftSelections((prev) => {
      const updated = { ...prev };
      filteredVariants.forEach((v) => {
        updated[v.variant_id] = nextState;
      });
      return updated;
    });
  };

  const handleSelectAllGlobal = (state: boolean) => {
    setDraftSelections((prev) => {
      const updated = { ...prev };
      variants.forEach((v) => {
        updated[v.variant_id] = state;
      });
      return updated;
    });
  };

  const handleSelectionToggle = (variantId: number) => {
    setDraftSelections((prev) => ({
      ...prev,
      [variantId]: !prev[variantId],
    }));
  };

  const handleOverrideChange = (variantId: number, value: string) => {
    setDraftOverrides((prev) => ({
      ...prev,
      [variantId]: value,
    }));
  };

  const handleDiscountChannelChange = (
    discountId: number,
    value: "pos" | "ecom" | "both"
  ) => {
    setDraftDiscounts((prev) => ({
      ...prev,
      [discountId]: value,
    }));
  };

  // Bulk Price Adjustment Execution
  const handleApplyBulkPricing = () => {
    const numVal = parseFloat(bulkValue);
    if (isNaN(numVal) || numVal < 0) {
      setMessage({
        type: "error",
        text: "Please enter a valid non-negative number for bulk price adjustment.",
      });
      return;
    }

    const targets =
      bulkTarget === "filtered_selected"
        ? filteredVariants.filter((v) => draftSelections[v.variant_id])
        : variants.filter((v) => draftSelections[v.variant_id]);

    if (targets.length === 0) {
      setMessage({
        type: "error",
        text: "No selected items in the chosen target scope to adjust.",
      });
      return;
    }

    setDraftOverrides((prev) => {
      const updated = { ...prev };
      targets.forEach((v) => {
        const basePrice = Number(v.pos_price || 0);
        let calculated = basePrice;

        switch (bulkOperation) {
          case "add_fixed":
            calculated = basePrice + numVal;
            break;
          case "subtract_fixed":
            calculated = Math.max(0, basePrice - numVal);
            break;
          case "increase_percent":
            calculated = basePrice * (1 + numVal / 100);
            break;
          case "decrease_percent":
            calculated = Math.max(0, basePrice * (1 - numVal / 100));
            break;
          case "set_exact":
            calculated = Math.max(0, numVal);
            break;
        }

        updated[v.variant_id] = (Math.round(calculated * 100) / 100).toFixed(2);
      });
      return updated;
    });

    setMessage({
      type: "success",
      text: `Bulk pricing adjusted for ${targets.length} variant${
        targets.length > 1 ? "s" : ""
      }. Review and click "Save Draft Changes" when ready.`,
    });
  };

  const handleResetBulkPricing = () => {
    const targets =
      bulkTarget === "filtered_selected"
        ? filteredVariants.filter((v) => draftSelections[v.variant_id])
        : variants.filter((v) => draftSelections[v.variant_id]);

    if (targets.length === 0) {
      setMessage({
        type: "error",
        text: "No selected items in the chosen target scope to reset.",
      });
      return;
    }

    setDraftOverrides((prev) => {
      const updated = { ...prev };
      targets.forEach((v) => {
        updated[v.variant_id] = "";
      });
      return updated;
    });

    setMessage({
      type: "success",
      text: `Reset custom price overrides to default for ${targets.length} variant${
        targets.length > 1 ? "s" : ""
      }.`,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    // Prepare selections payload
    const selectionsPayload = Object.keys(draftSelections).map((id) => ({
      variant_id: Number(id),
      is_selected_draft: draftSelections[Number(id)],
    }));

    // Prepare overrides payload
    const overridesPayload = Object.keys(draftOverrides).map((id) => {
      const val = (draftOverrides[Number(id)] ?? "").trim();
      return {
        variant_id: Number(id),
        ecom_price: val === "" ? null : Number(val),
      };
    });

    // Prepare discounts payload (if POS is disabled on plan, default channel to 'ecom')
    const discountsPayload = Object.keys(draftDiscounts).map((id) => ({
      discount_id: Number(id),
      channel: hasPosAccess ? draftDiscounts[Number(id)] : "ecom",
    }));

    try {
      const res = await apiFetch("/api/company/ecom-products", company, {
        method: "POST",
        body: JSON.stringify({
          selections: selectionsPayload,
          overrides: overridesPayload,
          discounts: discountsPayload,
        }),
      });

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Storefront catalog selections and pricing overrides saved as draft successfully!",
        });

        // Update baseline variants with saved state so unsaved indicators clear
        setVariants((prev) =>
          prev.map((v) => ({
            ...v,
            is_selected_draft: draftSelections[v.variant_id] ?? v.is_selected_draft,
            ecom_price_override:
              draftOverrides[v.variant_id] !== undefined &&
              draftOverrides[v.variant_id].trim() !== ""
                ? Number(draftOverrides[v.variant_id])
                : draftOverrides[v.variant_id] === ""
                ? null
                : v.ecom_price_override,
          }))
        );

        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const errorData = await res.json();
        setMessage({
          type: "error",
          text: errorData.message || "Failed to save storefront catalog details.",
        });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-gray-600">Loading storefront catalog...</p>
        </div>
      </div>
    );
  }

  const currentBulkTargetCount =
    bulkTarget === "filtered_selected" ? filteredSelectedCount : totalSelectedCount;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-xl font-bold text-gray-900">
              Product Selection & Price Overrides
            </h1>
            <Badge variant="light" color="primary">
              Storefront Catalog
            </Badge>
          </div>
          <p className="text-xs text-gray-500">
            {hasPosAccess
              ? "Select active variants to display on your storefront and override POS pricing or discounts."
              : "Select active variants to display on your storefront and customize product pricing or availability."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving Changes..." : "Save Draft Changes"}
          </button>
        </div>
      </div>

      {/* Status Alert Message */}
      {message && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border-green-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-xs font-semibold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Discount Channel Mapping Card (Only shown if POS is enabled on plan and discounts toggle is active) */}
      {hasPosAccess && useCustomDiscounts && discounts.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-900">Active Discounts Channel Mapping</h2>
            <span className="text-[11px] text-gray-500">POS & Online Storefront routing</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3.5 py-2 text-left font-medium">Discount Name</th>
                  <th className="px-3.5 py-2 text-left font-medium">Type</th>
                  <th className="px-3.5 py-2 text-left font-medium">Value</th>
                  <th className="px-3.5 py-2 text-left font-medium">Active Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {discounts.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50/50">
                    <td className="px-3.5 py-2 font-medium text-gray-900">{d.name}</td>
                    <td className="px-3.5 py-2 text-gray-600 capitalize">{d.discount_type}</td>
                    <td className="px-3.5 py-2 text-gray-900 font-medium">
                      {d.discount_type === "percentage" ? `${d.value}%` : `₹${d.value}`}
                    </td>
                    <td className="px-3.5 py-2">
                      <select
                        value={draftDiscounts[d.id] || "both"}
                        onChange={(e) =>
                          handleDiscountChannelChange(d.id, e.target.value as any)
                        }
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

      {/* Search and Filters Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs">
        <div className="grid gap-2.5 md:grid-cols-4">
          {/* Search Input */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, SKU, or code..."
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Categories ({categoryOptions.length})</option>
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Status Filter (Evaluated against saved server state) */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Listing Status</option>
            <option value="selected">Selected for Display</option>
            <option value="unselected">Not Listed</option>
            <option value="live">Live on Storefront</option>
            <option value="draft">Staged Draft</option>
          </select>

          {/* Quick Selection Helpers */}
          <div className="flex items-center justify-between gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1 border border-gray-200 text-xs">
            <span className="text-gray-600 font-medium truncate">
              Selected: <strong className="text-blue-600">{totalSelectedCount}</strong> / {variants.length}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSelectAllGlobal(true)}
                className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                title="Select all variants across entire catalog"
              >
                Select All (Entire Catalog)
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => handleSelectAllGlobal(false)}
                className="text-gray-600 hover:text-gray-800 font-medium hover:underline"
                title="Deselect all variants across entire catalog"
              >
                Deselect All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk E-Commerce Price Adjustment Bar (Visible when custom pricing is enabled and >=1 item selected) */}
      {useCustomPricing && totalSelectedCount > 0 && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 p-3 shadow-xs">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-blue-100 text-blue-700">
                <AdjustmentsHorizontalIcon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-900">
                  Bulk Price Adjustment
                </span>
                <span className="text-[11px] text-gray-500 ml-1.5">
                  (Based on {hasPosAccess ? "POS Price" : "Base Price"})
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Target Scope */}
              <select
                value={bulkTarget}
                onChange={(e) => setBulkTarget(e.target.value as any)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="filtered_selected">
                  Filtered & Selected ({filteredSelectedCount})
                </option>
                <option value="all_selected">
                  All Selected in Catalog ({totalSelectedCount})
                </option>
              </select>

              {/* Operation Type */}
              <select
                value={bulkOperation}
                onChange={(e) => setBulkOperation(e.target.value as any)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="add_fixed">Add Fixed Amount (+ ₹)</option>
                <option value="subtract_fixed">Subtract Fixed Amount (- ₹)</option>
                <option value="increase_percent">Increase by % (+ %)</option>
                <option value="decrease_percent">Decrease by % (- %)</option>
                <option value="set_exact">Set Exact Price (₹)</option>
              </select>

              {/* Amount / Value Input */}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={
                    bulkOperation.includes("percent")
                      ? "% value"
                      : "₹ amount"
                  }
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <button
                type="button"
                onClick={handleApplyBulkPricing}
                disabled={currentBulkTargetCount === 0 || !bulkValue.trim()}
                className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Apply to {currentBulkTargetCount}
              </button>

              <button
                type="button"
                onClick={handleResetBulkPricing}
                disabled={currentBulkTargetCount === 0}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                title="Clear custom overrides back to default base price"
              >
                <ArrowPathIcon className="w-3.5 h-3.5 text-gray-500" />
                Reset Overrides
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Table Card */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-center w-14 font-medium">
                  <div
                    className="flex items-center justify-center gap-1 cursor-pointer"
                    title={
                      isAllFilteredSelected
                        ? `Deselect all ${filteredVariants.length} filtered items`
                        : `Select all ${filteredVariants.length} filtered items`
                    }
                  >
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleToggleSelectAll}
                      title={
                        isAllFilteredSelected
                          ? `Deselect all ${filteredVariants.length} filtered items`
                          : `Select all ${filteredVariants.length} filtered items`
                      }
                      aria-label={`Select all ${filteredVariants.length} filtered items`}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span
                      className="text-[10px] text-gray-500 font-normal"
                      title={`Select all ${filteredVariants.length} filtered items`}
                    >
                      ({filteredVariants.length})
                    </span>
                  </div>
                </th>
                <th className="px-3 py-2 font-medium">Product Code</th>
                <th className="px-3 py-2 font-medium">Product Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Variant Details</th>
                <th className="px-3 py-2 font-medium">
                  {hasPosAccess ? "POS Price" : "Base Price"}
                </th>
                {useCustomPricing && (
                  <th className="px-3 py-2 font-medium">Ecom Price Override</th>
                )}
                <th className="px-3 py-2 font-medium">Storefront Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {totalItems === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-gray-500"
                    colSpan={useCustomPricing ? 8 : 7}
                  >
                    No variants found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedData.map((v) => {
                  const isChecked = Boolean(draftSelections[v.variant_id]);

                  // Determine if row has unsaved modifications compared to server baseline
                  const isSelectionModified = isChecked !== Boolean(v.is_selected_draft);
                  const savedOverrideStr =
                    v.ecom_price_override !== null && v.ecom_price_override !== undefined
                      ? String(v.ecom_price_override)
                      : "";
                  const currentOverrideStr = (draftOverrides[v.variant_id] ?? "").trim();
                  const isPriceModified = currentOverrideStr !== savedOverrideStr;
                  const isRowModified = isSelectionModified || isPriceModified;

                  return (
                    <tr
                      key={v.variant_id}
                      className={`hover:bg-gray-50/70 transition-colors ${
                        isChecked ? "bg-blue-50/25" : ""
                      }`}
                    >
                      {/* Checkbox column */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectionToggle(v.variant_id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Product Code */}
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600">
                        {v.product_code || "-"}
                      </td>

                      {/* Product Name */}
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {v.product_name}
                      </td>

                      {/* Category */}
                      <td className="px-3 py-2 text-gray-600">
                        {v.category_name || v.category || "-"}
                      </td>

                      {/* Variant Details */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px] text-gray-800 font-medium">
                            {v.sku}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {v.color_name ? `${v.color_name} • ` : ""}
                            Size: {v.size || "N/A"}
                            {v.fitting_name ? ` • ${v.fitting_name}` : ""}
                          </span>
                        </div>
                      </td>

                      {/* POS Price or Base Price */}
                      <td className="px-3 py-2 font-medium text-gray-900">
                        ₹{Number(v.pos_price || 0).toFixed(2)}
                      </td>

                      {/* Ecom Price Override (if custom pricing toggle is enabled) */}
                      {useCustomPricing && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400 text-xs font-medium">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              disabled={!isChecked}
                              placeholder={isChecked ? "Selling Price" : "Unselected"}
                              value={draftOverrides[v.variant_id] || ""}
                              onChange={(e) =>
                                handleOverrideChange(v.variant_id, e.target.value)
                              }
                              className="w-24 rounded border border-gray-300 px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </div>
                        </td>
                      )}

                      {/* Storefront Status Badge & Unsaved Indicator */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {v.is_live ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                              <CheckCircleIcon className="w-3 h-3" />
                              Live
                            </span>
                          ) : isChecked ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              Staged Draft
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              Not Listed
                            </span>
                          )}

                          {isRowModified && (
                            <span
                              className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-semibold text-amber-700 border border-amber-200"
                              title="Has unsaved changes in this draft"
                            >
                              Unsaved
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="border-t border-gray-200 px-3.5 py-2.5 sm:px-4 bg-gray-50/40">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-700">
              Showing <span className="font-medium">{showingFrom}</span> to{" "}
              <span className="font-medium">{showingTo}</span> of{" "}
              <span className="font-medium">{totalItems}</span> results
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="products-rows-per-page" className="text-xs text-gray-600">
                Rows per page
              </label>
              <select
                id="products-rows-per-page"
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                type="button"
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="relative ml-2 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>

            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-end">
              <nav
                aria-label="Pagination"
                className="isolate inline-flex -space-x-px rounded-md shadow-2xs"
              >
                <button
                  type="button"
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-1.5 text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>

                {pageNumbers.map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="relative inline-flex items-center px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${page}`}
                      type="button"
                      onClick={() => goToPage(page)}
                      aria-current={currentPage === page ? "page" : undefined}
                      className={`relative inline-flex items-center px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-gray-300 ${
                        currentPage === page
                          ? "z-10 bg-blue-600 text-white"
                          : "text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-1.5 text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
