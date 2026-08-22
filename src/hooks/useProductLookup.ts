"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import type { ProductLookupItem } from "@/lib/product-lookup";
import { apiFetch } from "@/lib/apiFetch";

export type ProductLookupFilters = {
  search: string;
  type: string;
  category: string;
  source: string;
};

type UseProductLookupOptions = {
  enabled?: boolean;
  itemsPerPage?: number;
  module?: string;
  warehouseId?: string | number;
  lookupType?: string;
  supplierId?: string | number;
};

const DEFAULT_FILTERS: ProductLookupFilters = {
  search: "",
  type: "",
  category: "",
  source: "",
};

export function useProductLookup(options: UseProductLookupOptions = {}) {
  const { company } = useTenant();
  const enabled = options.enabled ?? true;
  const itemsPerPage = options.itemsPerPage ?? 10;

  const [items, setItems] = useState<ProductLookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<ProductLookupFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const moduleParam = options.module ? `&module=${encodeURIComponent(options.module)}` : "";
  const warehouseParam = options.warehouseId ? `&warehouse_id=${encodeURIComponent(options.warehouseId)}` : "";
  const typeParam = options.lookupType ? options.lookupType : "lookup";
  const supplierParam = options.supplierId ? `&supplier_id=${encodeURIComponent(options.supplierId)}` : "";

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const refresh = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(
        `/api/product-lookup?type=${typeParam}${moduleParam}${warehouseParam}${supplierParam}&_t=${Date.now()}`,
        company,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to load products");
      }
      setItems(Array.isArray(data) ? data : data?.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [company, moduleParam, warehouseParam, typeParam, supplierParam]);

  useEffect(() => {
    if (!enabled || !company) return;
    let active = true;
    refresh().finally(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [company, enabled, refresh]);

  const filteredItems = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return items.filter((item) => {
      const matchSearch = search
        ? `${item.sku} ${item.name}`.toLowerCase().includes(search)
        : true;
      const matchType = filters.type ? item.type === filters.type : true;
      const matchCategory = filters.category
        ? String(item.category_name || "") === filters.category
        : true;
      const matchSource = filters.source ? item.source === filters.source : true;
      return matchSearch && matchType && matchCategory && matchSource;
    });
  }, [filters, items]);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.type, filters.category, filters.source]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      const value = String(item.category_name || "").trim();
      if (value) map.set(value, value);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [items]);

  return {
    items,
    loading,
    error,
    filters,
    setFilters,
    page: currentPage,
    setPage,
    totalPages,
    itemsPerPage,
    paginatedItems,
    totalCount: filteredItems.length,
    categoryOptions,
    resetFilters,
    refresh,
  };
}
