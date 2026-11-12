"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { findProductByBarcodeOrCode, useProductLookup } from "@/hooks/useProductLookup";
import { usePagination } from "@/hooks/usePagination";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";
import type { ProductLookupItem } from "@/lib/product-lookup";
import { useConfirm } from "@/hooks/useConfirm";
import { useNotify } from "@/hooks/useNotify";

type WarehouseOption = { id: number; name: string };
type LocatorOption = { id: number; locator_name: string; warehouse_id: number };

type StockAdjustmentRow = {
  adjustment_id: number;
  txn_date: string;
  reason: string | null;
  warehouse_name: string | null;
  locator_name: string | null;
  total_items: string | number;
  total_variance: string | number;
};

type StockAdjustmentLineItem = {
  variant_id: number;
  product_id?: number;
  sku: string;
  name: string;
  color?: string | null;
  barcode?: string | null;
  system_qty: number | null;
  physical_qty: string;
  reason?: string;
  loading_stock?: boolean;
};

type StockAdjustmentForm = {
  txn_date: string;
  warehouse_id: string;
  locator_id: string;
  reason: string;
  items: StockAdjustmentLineItem[];
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function initialForm(): StockAdjustmentForm {
  return {
    txn_date: todayISO(),
    warehouse_id: "",
    locator_id: "",
    reason: "",
    items: [],
  };
}

const ProductLookupModal = dynamic(
  () => import("@/components/product/ProductLookupModal"),
  { ssr: false }
);

export default function StockAdjustmentPage() {
  const { company } = useTenant();
  const confirm = useConfirm();
  const notify = useNotify();

  const [form, setForm] = useState<StockAdjustmentForm>(initialForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineItemErrors, setLineItemErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [listItems, setListItems] = useState<StockAdjustmentRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [locators, setLocators] = useState<LocatorOption[]>([]);

  // Fast inline product lookup search state
  const [productSearch, setProductSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Product lookup modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productModalError, setProductModalError] = useState("");
  const [selectedVariantMap, setSelectedVariantMap] = useState<Record<string, boolean>>({});
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("");

  const formRef = useRef<HTMLFormElement | null>(null);

  const {
    items: lookupItems,
    loading: lookupLoading,
    filters: lookupFilters,
    setFilters: setLookupFilters,
    page: lookupPage,
    setPage: setLookupPage,
    itemsPerPage: lookupItemsPerPage,
    categoryOptions: lookupCategoryOptions,
  } = useProductLookup({
    enabled: Boolean(company),
  });

  const loadList = useCallback(async () => {
    if (!company) return;
    try {
      setTableLoading(true);
      const res = await apiFetch("/api/stock-adjustments", company);
      const data = await res.json();
      setListItems(data.success ? data.data || [] : []);
    } finally {
      setTableLoading(false);
    }
  }, [company]);

  async function loadWarehouses() {
    if (!company) return;
    const res = await apiFetch("/api/warehouses", company);
    const data = await res.json();
    setWarehouses(data.success ? data.data || [] : []);
  }

  async function loadLocators() {
    if (!company) return;
    const res = await apiFetch("/api/locators", company);
    const data = await res.json();
    setLocators(data.success ? data.data || [] : []);
  }

  useEffect(() => {
    void loadList();
    void loadWarehouses();
    void loadLocators();
  }, [company, loadList]);

  // Filter locators based on selected warehouse
  const availableLocators = useMemo(() => {
    if (!form.warehouse_id) return [];
    return locators.filter((loc) => String(loc.warehouse_id) === form.warehouse_id);
  }, [locators, form.warehouse_id]);

  // Reset locator if it doesn't belong to the newly selected warehouse
  useEffect(() => {
    if (!form.locator_id) return;
    const stillValid = availableLocators.some((loc) => String(loc.id) === form.locator_id);
    if (!stillValid) {
      setForm((prev) => ({ ...prev, locator_id: "" }));
    }
  }, [availableLocators, form.locator_id]);

  // Modal dataset calculation
  const selectedVariantIdSet = useMemo(
    () => new Set(form.items.map((item) => item.variant_id)),
    [form.items]
  );

  const filteredLookupItems = useMemo(() => {
    const search = lookupFilters.search.trim().toLowerCase();
    const withoutSelected = lookupItems.filter((item) => !selectedVariantIdSet.has(item.variant_id));
    return withoutSelected.filter((item) => {
      const matchSearch = search
        ? `${item.sku} ${item.name}`.toLowerCase().includes(search)
        : true;
      const matchType = lookupFilters.type ? item.type === lookupFilters.type : true;
      const matchCategory = lookupFilters.category
        ? String(item.category_name || "") === lookupFilters.category
        : true;
      const matchSource = lookupFilters.source ? item.source === lookupFilters.source : true;
      return matchSearch && matchType && matchCategory && matchSource;
    });
  }, [lookupFilters, lookupItems, selectedVariantIdSet]);

  const sortedLookupItems = useMemo(() => {
    return [...filteredLookupItems].sort((a, b) => {
      if (b.product_id !== a.product_id) return b.product_id - a.product_id;
      return b.variant_id - a.variant_id;
    });
  }, [filteredLookupItems]);

  const lookupTotalCount = sortedLookupItems.length;
  const lookupTotalPages = Math.max(1, Math.ceil(lookupTotalCount / lookupItemsPerPage));
  const lookupCurrentPage = Math.min(lookupPage, lookupTotalPages);
  const lookupPaginatedItems = sortedLookupItems.slice(
    (lookupCurrentPage - 1) * lookupItemsPerPage,
    lookupCurrentPage * lookupItemsPerPage
  );

  useEffect(() => {
    if (lookupPage > lookupTotalPages) {
      setLookupPage(lookupTotalPages);
    }
  }, [lookupPage, lookupTotalPages, setLookupPage]);

  const toggleSelectAll = (checked: boolean, rows: ProductLookupItem[]) => {
    if (!checked) {
      setSelectedVariantMap((prev) => {
        const next = { ...prev };
        rows.forEach((row) => {
          delete next[String(row.variant_id)];
        });
        return next;
      });
      return;
    }
    setSelectedVariantMap((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        next[String(row.variant_id)] = true;
      });
      return next;
    });
  };

  const toggleVariantSelection = (item: ProductLookupItem) => {
    const key = String(item.variant_id);
    setSelectedVariantMap((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
  };

  const selectedVariantIds = useMemo(
    () => Object.keys(selectedVariantMap).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
    [selectedVariantMap]
  );

  const lookupItemMap = useMemo(() => {
    return new Map<number, ProductLookupItem>(lookupItems.map((item) => [item.variant_id, item]));
  }, [lookupItems]);

  // Fetch system stock dynamically for a variant
  const fetchSystemStockForVariant = useCallback(
    async (variantId: number, warehouseId: string, locatorId: string) => {
      if (!company || !warehouseId || !locatorId) return;

      setForm((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.variant_id === variantId ? { ...item, loading_stock: true } : item
        ),
      }));

      try {
        const res = await apiFetch(
          `/api/stock-adjustments/current-stock?warehouse_id=${warehouseId}&locator_id=${locatorId}&product_id=${variantId}`,
          company
        );
        const data = await res.json();
        const stock = data.success ? Number(data.current_stock ?? 0) : 0;

        setForm((prev) => ({
          ...prev,
          items: prev.items.map((item) =>
            item.variant_id === variantId
              ? { ...item, system_qty: stock, loading_stock: false }
              : item
          ),
        }));
      } catch (err) {
        console.error("Error fetching system stock for variant:", variantId, err);
        setForm((prev) => ({
          ...prev,
          items: prev.items.map((item) =>
            item.variant_id === variantId
              ? { ...item, system_qty: 0, loading_stock: false }
              : item
          ),
        }));
      }
    },
    [company]
  );

  // Refetch stock for all items when warehouse or locator changes
  useEffect(() => {
    if (!company || !form.warehouse_id || !form.locator_id || form.items.length === 0) {
      return;
    }
    form.items.forEach((item) => {
      void fetchSystemStockForVariant(item.variant_id, form.warehouse_id, form.locator_id);
    });
  }, [company, form.warehouse_id, form.locator_id, fetchSystemStockForVariant]);

  // Helper to add a product variant to line items
  const addProductToItems = useCallback(
    (product: ProductLookupItem) => {
      if (!form.warehouse_id || !form.locator_id) {
        notify("Please select a Warehouse and Locator first.", { severity: "error" });
        return false;
      }

      const exists = form.items.some((item) => item.variant_id === product.variant_id);
      if (exists) {
        notify(`Product "${product.name}" (${product.sku}) is already in the list.`, { severity: "warning" });
        return false;
      }

      const newItem: StockAdjustmentLineItem = {
        variant_id: product.variant_id,
        product_id: product.product_id,
        sku: product.sku,
        name: product.name,
        color: product.color,
        barcode: product.barcode,
        system_qty: null,
        physical_qty: "",
        reason: "",
        loading_stock: false,
      };

      setForm((prev) => ({
        ...prev,
        items: [...prev.items, newItem],
      }));

      setErrors((prev) => {
        const next = { ...prev };
        delete next.items;
        return next;
      });

      void fetchSystemStockForVariant(product.variant_id, form.warehouse_id, form.locator_id);
      return true;
    },
    [form.warehouse_id, form.locator_id, form.items, notify, fetchSystemStockForVariant]
  );

  // Modal functions
  function openProductModal() {
    if (!form.warehouse_id || !form.locator_id) {
      notify("Please select a Warehouse and Locator first.", { severity: "error" });
      return;
    }
    setProductModalOpen(true);
    setProductModalError("");
    setSelectedVariantMap({});
    setBarcodeValue("");
    setBarcodeMessage("");
  }

  function closeProductModal() {
    setProductModalOpen(false);
    setProductModalError("");
    setSelectedVariantMap({});
    setBarcodeValue("");
    setBarcodeMessage("");
  }

  function addSelectedProductsFromModal() {
    if (selectedVariantIds.length === 0) {
      setProductModalError("Select at least one product.");
      return;
    }

    let addedCount = 0;
    selectedVariantIds.forEach((variantId) => {
      const item = lookupItemMap.get(variantId);
      if (!item) return;
      const exists = form.items.some((line) => line.variant_id === item.variant_id);
      if (exists) return;

      if (addProductToItems(item)) {
        addedCount++;
      }
    });

    if (addedCount === 0) {
      setProductModalError("All selected products are already in the table.");
      return;
    }

    setProductModalError("");
    closeProductModal();
  }

  const handleModalBarcodeSubmit = (value?: string) => {
    const barcode = String(value ?? barcodeValue).trim();
    setBarcodeValue("");
    if (!barcode) return;
    const match = findProductByBarcodeOrCode(lookupItems, barcode);
    if (!match) {
      setBarcodeMessage("");
      notify(`Product with barcode ${barcode} not found.`, { severity: "warning" });
      return;
    }

    const exists = form.items.some((line) => line.variant_id === match.variant_id);
    if (exists) {
      setBarcodeMessage(`Barcode "${barcode}" is already in the list.`);
      return;
    }

    addProductToItems(match);
    const key = String(match.variant_id);
    setSelectedVariantMap((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    setBarcodeMessage("");
  };

  // Fast inline search suggestions
  const suggestedProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return [];
    return lookupItems
      .filter((item) => {
        return (
          item.sku.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query) ||
          (item.barcode && item.barcode.includes(query))
        );
      })
      .slice(0, 10);
  }, [productSearch, lookupItems]);

  const handleSelectSuggestedProduct = (product: ProductLookupItem) => {
    if (addProductToItems(product)) {
      setProductSearch("");
      setSearchFocused(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const query = productSearch.trim();
      if (!query) return;

      const exactMatch = lookupItems.find(
        (item) => String(item.barcode || "") === query || item.sku.toLowerCase() === query.toLowerCase()
      );

      if (exactMatch) {
        if (addProductToItems(exactMatch)) {
          setProductSearch("");
          setSearchFocused(false);
        }
      } else if (suggestedProducts.length > 0) {
        if (addProductToItems(suggestedProducts[0])) {
          setProductSearch("");
          setSearchFocused(false);
        }
      } else {
        notify("No matching product found.", { severity: "error" });
      }
    }
  };

  // Line item field updates
  function updateLinePhysicalQty(variantId: number, qtyStr: string) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.variant_id === variantId ? { ...item, physical_qty: qtyStr } : item
      ),
    }));

    setLineItemErrors((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next.items;
      return next;
    });
  }

  function updateLineReason(variantId: number, reasonStr: string) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.variant_id === variantId ? { ...item, reason: reasonStr } : item
      ),
    }));
  }

  function removeLineItem(variantId: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.variant_id !== variantId),
    }));
    setLineItemErrors((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }

  const {
    currentPage,
    itemsPerPage: rowsPerPage,
    setItemsPerPage: setRowsPerPage,
    totalItems,
    totalPages,
    pageNumbers,
    showingFrom,
    showingTo,
    paginatedData: paginatedListItems,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  } = usePagination({
    data: listItems,
    initialItemsPerPage: 10,
  });

  const inputClass = (key: string) =>
    `w-full mt-2 border rounded-lg p-3 outline-none focus:ring-2 ${
      errors[key] ? "border-red-500 focus:ring-red-400" : "focus:ring-indigo-500 border-gray-300"
    }`;

  function openForm() {
    setShowForm(true);
    setForm(initialForm());
    setProductSearch("");
    setProductModalOpen(false);
    setErrors({});
    setLineItemErrors({});
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const itemErrorsNext: Record<number, string> = {};

    if (!form.txn_date) next.txn_date = "Date is required";
    if (!form.warehouse_id) next.warehouse_id = "Warehouse is required";
    if (!form.locator_id) next.locator_id = "Store locator is required";

    if (form.reason && form.reason.trim()) {
      const reasonMessage = getRuleValidationError("alphanumeric-spaces-hyphens", form.reason);
      if (reasonMessage) next.reason = reasonMessage;
    }

    if (form.items.length === 0) {
      next.items = "At least one product variant must be added to the adjustment table.";
    } else {
      let hasNonZeroVariance = false;
      form.items.forEach((item) => {
        if (item.physical_qty === "" || item.physical_qty === null || item.physical_qty === undefined) {
          itemErrorsNext[item.variant_id] = "Physical qty required";
        } else {
          const physical = Number(item.physical_qty);
          if (isNaN(physical) || physical < 0) {
            itemErrorsNext[item.variant_id] = "Must be >= 0";
          } else if (item.system_qty !== null) {
            const diff = physical - item.system_qty;
            if (diff !== 0) {
              hasNonZeroVariance = true;
            }
          }
        }
      });

      if (Object.keys(itemErrorsNext).length === 0 && !hasNonZeroVariance) {
        next.items = "All line items have 0 variance (physical qty matches system qty). Stock adjustment requires at least one item with inventory variance.";
      }
    }

    setErrors(next);
    setLineItemErrors(itemErrorsNext);
    return Object.keys(next).length === 0 && Object.keys(itemErrorsNext).length === 0;
  }

  async function submit() {
    if (!company) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        txn_date: form.txn_date,
        warehouse_id: Number(form.warehouse_id),
        locator_id: Number(form.locator_id),
        reason: form.reason.trim() || null,
        items: form.items.map((item) => ({
          product_id: item.variant_id,
          physical_qty: Number(item.physical_qty),
          reason: item.reason?.trim() || form.reason.trim() || null,
        })),
      };

      const res = await apiFetch("/api/stock-adjustments", company, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");

      notify("Stock adjustment successfully saved!");
      setShowForm(false);
      void loadList();
    } catch (error: any) {
      notify(error.message || "Failed to save stock adjustment", { severity: "error" });
    } finally {
      setSaving(false);
    }
  }

  // Attach dynamic input constraints validation
  useEffect(() => {
    if (!showForm || !formRef.current) return;
    const cleanup = attachRuleValidationListeners(formRef.current, (fieldName, message) => {
      setErrors((prev) => {
        if (message) return { ...prev, [fieldName]: message };
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    });
    return cleanup;
  }, [showForm]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {saving &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Saving Stock Adjustment...</p>
            </div>
          </div>,
          document.body
        )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{showForm ? "New Stock Adjustment" : "Stock Adjustment History"}</h1>
          <p className="text-sm text-gray-500">Reconcile physical inventory counts against system records.</p>
        </div>
        {!showForm && (
          <button
            onClick={openForm}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition"
          >
            Add Stock Adjustment
          </button>
        )}
      </div>

      {!showForm ? (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 text-gray-600 uppercase text-xs">
                <tr className="border-t hover:bg-blue-50 transition">
                  <th className="p-4 text-left">Date</th>
                  <th className="p-4 text-left">Location</th>
                  <th className="p-4 text-left">Reason</th>
                  <th className="p-4 text-center">Items</th>
                  <th className="p-4 text-center">Total Variance</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400 animate-pulse">
                      Loading stock adjustments...
                    </td>
                  </tr>
                ) : paginatedListItems.length > 0 ? (
                  paginatedListItems.map((row) => (
                    <tr key={row.adjustment_id} className="border-t hover:bg-blue-50 transition">
                      <td className="p-4">{new Date(row.txn_date).toLocaleDateString()}</td>
                      <td className="p-4">
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 font-semibold text-gray-600 block sm:inline mr-1">
                          {row.warehouse_name || "-"}
                        </span>
                        <span className="text-xs px-2 py-1 rounded bg-indigo-50 font-semibold text-indigo-600">
                          {row.locator_name || "-"}
                        </span>
                      </td>
                      <td className="p-4">{row.reason || "-"}</td>
                      <td className="p-4 text-center font-medium">{row.total_items}</td>
                      <td className={`p-4 text-center font-bold ${Number(row.total_variance) > 0 ? "text-green-600" : Number(row.total_variance) < 0 ? "text-red-600" : "text-gray-500"}`}>
                        {Number(row.total_variance) > 0 ? `+${row.total_variance}` : row.total_variance}
                      </td>
                      <td className="p-4 text-center">
                        <Link
                          href={`/${company}/workspace/inventory/stock-adjustment/${row.adjustment_id}`}
                          className="inline-flex items-center justify-center text-indigo-600 hover:text-indigo-900 transition-colors p-2 hover:bg-indigo-50 rounded-full"
                          title="View Details"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                      No stock adjustments found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="ui-pagination-wrapper border-t border-gray-200 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="ui-pagination-info">
                Showing <span className="font-medium">{showingFrom}</span> to{" "}
                <span className="font-medium">{showingTo}</span> of{" "}
                <span className="font-medium">{totalItems}</span> results
              </p>
              <div className="ui-table-actions">
                <label htmlFor="adjust-rows-per-page" className="text-sm text-gray-600">
                  Rows per page
                </label>
                <select
                  id="adjust-rows-per-page"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="ui-pagination-select"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  type="button"
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="ui-pagination-icon-btn rounded-md"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="ui-pagination-icon-btn rounded-md ml-3"
                >
                  Next
                </button>
              </div>

              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-end">
                <nav aria-label="Pagination" className="ui-pagination-nav">
                  <button
                    type="button"
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    className="ui-pagination-icon-btn rounded-l-md"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>

                  {pageNumbers.map((page, idx) =>
                    page === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="ui-pagination-btn ui-pagination-btn-inactive"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={`page-${page}`}
                        type="button"
                        onClick={() => goToPage(page as number)}
                        aria-current={currentPage === page ? "page" : undefined}
                        className={`ui-pagination-btn ${currentPage === page ? "ui-pagination-btn-active" : "ui-pagination-btn-inactive"
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
                    className="ui-pagination-icon-btn rounded-r-md"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="bg-white p-6 rounded-xl shadow space-y-6"
        >
          <div className="border-b pb-4">
            <h2 className="text-lg font-semibold text-gray-800">Adjustment Document Details</h2>
            <p className="text-xs text-gray-500">Provide header information and transaction reasons.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <label className="text-sm font-semibold mb-1 block">
                Transaction Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.txn_date}
                onChange={(e) => setForm({ ...form, txn_date: e.target.value })}
                className={inputClass("txn_date")}
              />
              {errors.txn_date && <p className="text-red-500 text-sm mt-1">{errors.txn_date}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">
                Warehouse <span className="text-red-500">*</span>
              </label>
              <select
                value={form.warehouse_id}
                onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                className={inputClass("warehouse_id")}
              >
                <option value="">Select Warehouse</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={String(wh.id)}>
                    {wh.name}
                  </option>
                ))}
              </select>
              {errors.warehouse_id && <p className="text-red-500 text-sm mt-1">{errors.warehouse_id}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">
                Locator <span className="text-red-500">*</span>
              </label>
              <select
                value={form.locator_id}
                disabled={!form.warehouse_id}
                onChange={(e) => setForm({ ...form, locator_id: e.target.value })}
                className={inputClass("locator_id")}
              >
                <option value="">Select Locator</option>
                {availableLocators.map((loc) => (
                  <option key={loc.id} value={String(loc.id)}>
                    {loc.locator_name}
                  </option>
                ))}
              </select>
              {errors.locator_id && <p className="text-red-500 text-sm mt-1">{errors.locator_id}</p>}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 border-t pt-6">
            <div>
              <label className="text-sm font-semibold mb-1 block">Header Reason / Remarks</label>
              <textarea
                data-rules="alphanumeric-spaces-hyphens"
                data-field="reason"
                data-optional="true"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={1}
                className={inputClass("reason") + " resize-none"}
                placeholder="Damaged item, Audit variance, Shrinkage, etc."
              />
              {errors.reason && <p className="text-red-500 text-sm mt-1">{errors.reason}</p>}
            </div>
          </div>

          {/* Inline Product Lookup & Browse Modal Trigger */}
          <div className="border-t pt-6 space-y-2">
            <label className="text-sm font-semibold block">
              Add Product Variants <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={productSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className={inputClass("items")}
                  placeholder="Scan barcode or type Name / SKU..."
                />

                {searchFocused && suggestedProducts.length > 0 && (
                  <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto border bg-white rounded-lg shadow-xl divide-y">
                    {suggestedProducts.map((item) => (
                      <div
                        key={item.variant_id}
                        onMouseDown={() => handleSelectSuggestedProduct(item)}
                        className="p-3 hover:bg-indigo-50 cursor-pointer flex justify-between items-center text-sm"
                      >
                        <div>
                          <span className="font-semibold block text-gray-800">{item.name}</span>
                          <span className="text-xs text-gray-500 font-mono">
                            SKU: {item.sku} | Color: {item.color || "NA"}
                          </span>
                        </div>
                        {item.barcode && (
                          <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-mono">
                            {item.barcode}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={openProductModal}
                className="mt-2 sm:mt-0 flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 rounded-lg font-medium transition"
              >
                <MagnifyingGlassIcon className="h-5 w-5" />
                Browse Products
              </button>
            </div>
            {errors.items && <p className="text-red-500 text-sm mt-1">{errors.items}</p>}
          </div>

          {/* Line Items Table */}
          <div className="bg-gray-50 rounded-xl border p-4 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-bold text-gray-800">
                Adjustment Line Items ({form.items.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200">
                <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                  <tr>
                    <th className="p-3 text-left">#</th>
                    <th className="p-3 text-left">SKU / Barcode</th>
                    <th className="p-3 text-left">Product Name & Variant</th>
                    <th className="p-3 text-right w-36">System Qty</th>
                    <th className="p-3 text-right w-44">Physical Count Qty *</th>
                    <th className="p-3 text-center w-44">Calculated Variance</th>
                    <th className="p-3 text-left w-56">Item Reason (Optional)</th>
                    <th className="p-3 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {form.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500 text-sm">
                        No products added yet. Use the search input or "Browse Products" button above to add item variants to adjust.
                      </td>
                    </tr>
                  ) : (
                    form.items.map((item, idx) => {
                      const physical = Number(item.physical_qty);
                      const isValidPhysical = item.physical_qty !== "" && !isNaN(physical) && physical >= 0;
                      const diff = isValidPhysical && item.system_qty !== null ? physical - item.system_qty : null;

                      return (
                        <tr key={item.variant_id} className="hover:bg-blue-50/50 transition">
                          <td className="p-3 text-gray-500 font-mono text-xs">{idx + 1}</td>
                          <td className="p-3">
                            <div className="font-mono font-medium text-gray-900">{item.sku}</div>
                            {item.barcode && <div className="text-xs text-gray-400 font-mono">{item.barcode}</div>}
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-gray-900">{item.name}</div>
                            {item.color && (
                              <div className="text-xs text-gray-500">Color: {item.color}</div>
                            )}
                          </td>
                          <td className="p-3 text-right font-semibold text-gray-700">
                            {item.loading_stock ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin text-indigo-500 inline-block" />
                            ) : item.system_qty !== null ? (
                              item.system_qty
                            ) : (
                              <span className="text-gray-400 text-xs">--</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={item.physical_qty}
                              onChange={(e) => updateLinePhysicalQty(item.variant_id, e.target.value)}
                              className={`w-full text-right p-2 border rounded-md font-bold outline-none focus:ring-2 ${
                                lineItemErrors[item.variant_id]
                                  ? "border-red-500 focus:ring-red-400"
                                  : "focus:ring-indigo-500 border-gray-300"
                              }`}
                              placeholder="Enter qty"
                            />
                            {lineItemErrors[item.variant_id] && (
                              <p className="text-red-500 text-xs mt-1 text-right">{lineItemErrors[item.variant_id]}</p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {diff !== null ? (
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                  diff > 0
                                    ? "bg-green-100 text-green-700"
                                    : diff < 0
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {diff > 0 ? `+${diff} (Stock Gain)` : diff < 0 ? `${diff} (Stock Loss)` : "0 (No Change)"}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">Enter Qty</span>
                            )}
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.reason || ""}
                              onChange={(e) => updateLineReason(item.variant_id, e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded-md text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder={form.reason ? `Default: "${form.reason}"` : "Line item reason..."}
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeLineItem(item.variant_id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Remove item"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-4 justify-end border-t pt-4">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-5 py-3 rounded-lg border hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Save Stock Adjustment
            </button>
          </div>
        </form>
      )}

      {/* Product Lookup Modal */}
      <ProductLookupModal
        open={productModalOpen}
        onClose={closeProductModal}
        onAddSelected={addSelectedProductsFromModal}
        errorMessage={productModalError}
        items={lookupPaginatedItems}
        loading={lookupLoading}
        filters={lookupFilters}
        onFiltersChange={(next) => {
          setLookupFilters(next);
          setLookupPage(1);
        }}
        categoryOptions={lookupCategoryOptions}
        page={lookupCurrentPage}
        totalPages={lookupTotalPages}
        itemsPerPage={lookupItemsPerPage}
        totalCount={lookupTotalCount}
        onPageChange={setLookupPage}
        isSelected={(item) => Boolean(selectedVariantMap[String(item.variant_id)])}
        onToggle={toggleVariantSelection}
        onToggleAll={toggleSelectAll}
        showBarcodeInput
        barcodeValue={barcodeValue}
        barcodeMessage={barcodeMessage}
        onBarcodeChange={(value) => {
          setBarcodeValue(value);
          setBarcodeMessage("");
        }}
        onBarcodeSubmit={handleModalBarcodeSubmit}
      />
    </div>
  );
}

