"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTenant } from "@/context/TenantContext";

type VariantRow = {
  variant_id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  sku: string;
  barcode: string | null;
  size: string | null;
  gender: string | null;
  color_name: string;
  fitting_name: string;
  low_stock_threshold: number;
  status: string;
  current_stock: number;
  cost_price: number;
  pos_price: number;
  ecom_price: number;
};

type PaginationInfo = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export default function ProductVariantsReportPage() {
  const router = useRouter();
  const { company } = useTenant();

  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  // Filter states
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");

  // Multi-select for comparison
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Fetch variants from API
  const fetchVariants = useCallback(
    async (pageToFetch = 1, currentSearch = search, currentBarcode = barcode) => {
      if (!company) return;
      setLoading(true);
      setErrorMsg("");

      try {
        const queryParams = new URLSearchParams({
          page: String(pageToFetch),
          limit: "20",
          search: currentSearch.trim(),
          barcode: currentBarcode.trim(),
        });

        const res = await fetch(`/api/reports/product-variants?${queryParams.toString()}`, {
          headers: {
            "x-tenant": company,
          },
        });

        const json = await res.json();
        if (json.success) {
          setVariants(json.data || []);
          setPagination(
            json.pagination || {
              page: pageToFetch,
              limit: 20,
              total: 0,
              totalPages: 1,
            }
          );
        } else {
          setErrorMsg(json.message || "Failed to load variants");
        }
      } catch (err: any) {
        console.error("Error loading product variants:", err);
        setErrorMsg("Network error loading product variants");
      } finally {
        setLoading(false);
      }
    },
    [company, search, barcode]
  );

  // Debounced live search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVariants(1, search, barcode);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, barcode, fetchVariants]);

  // Checkbox handlers
  const handleToggleSelect = (variantId: number) => {
    setSelectedIds((prev) =>
      prev.includes(variantId) ? prev.filter((id) => id !== variantId) : [...prev, variantId]
    );
  };

  const handleSelectAllOnPage = () => {
    const pageIds = variants.map((v) => v.variant_id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleCompare = () => {
    if (selectedIds.length < 2) return;
    router.push(`/${company}/workspace/reports/product-variants/compare?ids=${selectedIds.join(",")}`);
  };

  const pageIds = variants.map((v) => v.variant_id);
  const isAllPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 space-y-4">
      {/* FLOATING BULK COMPARISON BAR */}
      {selectedIds.length > 0 && (
        <div className="sticky top-2 z-40 bg-gradient-to-r from-sky-900 via-sky-800 to-blue-900 text-white px-4 py-2.5 rounded-xl shadow-lg border border-sky-700/50 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sky-500 font-semibold text-xs text-white">
              {selectedIds.length}
            </span>
            <span className="text-xs sm:text-sm font-medium">
              {selectedIds.length} variant{selectedIds.length > 1 ? "s" : ""} selected for comparison
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearSelection}
              className="px-3 py-1 text-xs rounded-lg bg-sky-950/60 hover:bg-sky-950 text-sky-200 hover:text-white transition"
            >
              Clear
            </button>
            <button
              onClick={handleCompare}
              disabled={selectedIds.length < 2}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5 ${selectedIds.length >= 2
                ? "bg-sky-400 hover:bg-sky-300 text-sky-950 cursor-pointer"
                : "bg-sky-700/50 text-sky-300 cursor-not-allowed opacity-70"
                }`}
            >
              <span>Compare Selected</span>
              {selectedIds.length < 2 && (
                <span className="text-[10px] text-sky-200 font-normal">(select at least 2)</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-sky-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-6 bg-sky-600 rounded-full" />
            <h1 className="text-lg sm:text-xl font-bold text-slate-800">
              Product Variant Analytics Report
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 pl-4.5">
            Deep-dive into variant sales performance, stock ledger, pricing margins, and multi-channel metrics.
          </p>
        </div>
        {selectedIds.length >= 2 && (
          <button
            onClick={handleCompare}
            className="self-start sm:self-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-medium shadow-sm transition flex items-center gap-1.5"
          >
            <span>Compare ({selectedIds.length})</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        )}
      </div>

      {/* LIVE SEARCH & FILTER BAR */}
      <div className="bg-white p-3.5 rounded-xl border border-sky-100 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Main search bar */}
          <div className="md:col-span-7 relative">
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Search Variant (Name, SKU, Color, Size)
            </label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type product name, SKU, or color attribute..."
                className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                />
              </svg>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Barcode specific field */}
          <div className="md:col-span-4 relative">
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Barcode Filter
            </label>
            <div className="relative">
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type Barcode..."
                className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition font-mono"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
              {barcode && (
                <button
                  onClick={() => setBarcode("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Quick reset button */}
          <div className="md:col-span-1 flex items-end">
            {(search || barcode) && (
              <button
                onClick={() => {
                  setSearch("");
                  setBarcode("");
                }}
                className="w-full py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* VARIANTS DATA TABLE */}
      <div className="bg-white rounded-xl border border-sky-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-sky-50/70 border-b border-sky-100 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllPageSelected}
                    onChange={handleSelectAllOnPage}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 w-50">Product Name</th>
                <th className="py-2.5 px-3 w-24">Color</th>
                <th className="py-2.5 px-3 w-28">Size</th>
                <th className="py-2.5 px-3 w-36">Barcode</th>
                <th className="py-2.5 px-3 w-36">SKU</th>
                <th className="py-2.5 px-3 w-28 text-right">Current Stock</th>
                <th className="py-2.5 px-3 w-24 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="inline-block w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-xs text-slate-500">Loading product variants...</p>
                  </td>
                </tr>
              ) : variants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-medium text-slate-600">No product variants found</p>
                    <p className="text-xs text-slate-400 mt-1">Try modifying your search query or barcode filter.</p>
                  </td>
                </tr>
              ) : (
                variants.map((v) => {
                  const isSelected = selectedIds.includes(v.variant_id);
                  const isLowStock = v.current_stock <= (v.low_stock_threshold || 5);
                  const isOutOfStock = v.current_stock <= 0;

                  return (
                    <tr
                      key={v.variant_id}
                      className={`hover:bg-sky-50/40 transition duration-100 ${isSelected ? "bg-sky-50/80" : ""
                        }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(v.variant_id)}
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800 text-xs">
                          {v.product_name}
                        </div>
                        {/* <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          {v.color_name && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-medium">
                              Color: {v.color_name}
                            </span>
                          )}
                          {v.size && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-medium">
                              Size: {v.size}
                            </span>
                          )}
                          {v.fitting_name && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              {v.fitting_name}
                            </span>
                          )}
                        </div> */}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {v.color_name || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {v.size || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {v.barcode || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-sky-700 font-medium">
                        {v.sku}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${isOutOfStock
                            ? "bg-red-100 text-red-700"
                            : isLowStock
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                            }`}
                        >
                          {v.current_stock}
                          {isOutOfStock ? " (Out)" : isLowStock ? " (Low)" : ""}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/${company}/workspace/reports/product-variants/${v.variant_id}`}
                          className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        {!loading && variants.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-sky-100 text-xs text-slate-600">
            <div>
              Showing{" "}
              <span className="font-semibold text-slate-800">
                {(pagination.page - 1) * pagination.limit + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-slate-800">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{" "}
              of <span className="font-semibold text-slate-800">{pagination.total}</span> variants
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fetchVariants(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-2.5 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-2 py-1 text-xs font-semibold text-sky-700 bg-sky-50 rounded border border-sky-200">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchVariants(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-2.5 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
