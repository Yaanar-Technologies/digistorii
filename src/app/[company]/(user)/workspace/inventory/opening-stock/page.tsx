"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { useProductLookup } from "@/hooks/useProductLookup";
import { usePagination } from "@/hooks/usePagination";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";
import type { ProductLookupItem } from "@/lib/product-lookup";
import { useConfirm } from "@/hooks/useConfirm";
import { useNotify } from "@/hooks/useNotify";


type WarehouseOption = { id: number; name: string };
type LocatorOption = { id: number; locator_name: string; warehouse_id: number };

type SelectedItem = {
  product_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  qty: string;
};

type OpeningStockRow = {
  id: number;
  doc_no: string;
  date: string;
  description?: string | null;
  warehouse_id: number;
  locator_id: number;
  status?: string | null;
  warehouse_name?: string | null;
  locator_name?: string | null;
};

type OpeningStockForm = {
  doc_no: string;
  date: string;
  warehouse_id: string;
  locator_id: string;
  description: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function initialForm(): OpeningStockForm {
  return {
    doc_no: "",
    date: todayISO(),
    warehouse_id: "",
    locator_id: "",
    description: "",
  };
}

const ProductLookupModal = dynamic(
  () => import("@/components/product/ProductLookupModal"),
  { ssr: false }
);

export default function OpeningStockPage() {
  const { company } = useTenant();
  const confirm = useConfirm();
  const notify = useNotify();
  const [form, setForm] = useState<OpeningStockForm>(initialForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [listItems, setListItems] = useState<OpeningStockRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [locators, setLocators] = useState<LocatorOption[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productModalError, setProductModalError] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [selectedVariantMap, setSelectedVariantMap] = useState<Record<string, boolean>>({});
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("");
  const [openingStockSearch, setOpeningStockSearch] = useState("");
  const [openingStockCategory, setOpeningStockCategory] = useState("");
  const [selectedOpeningSkuMap, setSelectedOpeningSkuMap] = useState<Record<string, boolean>>({});
  const [bulkOpeningQty, setBulkOpeningQty] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const openingHeaderCheckboxRef = useRef<HTMLInputElement>(null);

  const inputClass = (key: string) =>
    `w-full mt-2 border rounded-lg p-3 outline-none focus:ring-2 ${errors[key] ? "border-red-500 focus:ring-red-400" : "focus:ring-indigo-500"
    }`;

  async function loadDocNo() {
    if (!company) return;
    try {
      setDocLoading(true);
      const res = await apiFetch("/api/opening-stock/next-doc", company);
      const data = await res.json();
      if (data.success) {
        setForm((prev) => ({ ...prev, doc_no: data.data?.doc_no || "" }));
      }
    } finally {
      setDocLoading(false);
    }
  }

  async function loadList() {
    if (!company) return;
    try {
      setTableLoading(true);
      const res = await apiFetch("/api/opening-stock", company);
      const data = await res.json();
      setListItems(data.success ? data.data || [] : []);
    } finally {
      setTableLoading(false);
    }
  }

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
  }, [company]);

  const availableLocators = useMemo(() => {
    if (!form.warehouse_id) return locators;
    return locators.filter((loc) => String(loc.warehouse_id) === form.warehouse_id);
  }, [locators, form.warehouse_id]);

  const filteredListItems = useMemo(() => listItems, [listItems]);
  const sortedListItems = useMemo(() => filteredListItems, [filteredListItems]);

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
    data: sortedListItems,
    initialItemsPerPage: 10,
  });

  useEffect(() => {
    if (!form.locator_id) return;
    const stillValid = availableLocators.some((loc) => String(loc.id) === form.locator_id);
    if (!stillValid) {
      setForm((prev) => ({ ...prev, locator_id: "" }));
    }
  }, [availableLocators, form.locator_id]);


  function removeSelected(sku: string) {
    setSelectedItems((prev) => prev.filter((item) => item.sku !== sku));
    setSelectedOpeningSkuMap((prev) => {
      if (!prev[sku]) return prev;
      const next = { ...prev };
      delete next[sku];
      return next;
    });
    setItemErrors((prev) => {
      if (!prev[sku]) return prev;
      const next = { ...prev };
      delete next[sku];
      return next;
    });
  }

  function updateQty(sku: string, value: string) {
    setSelectedItems((prev) =>
      prev.map((item) => (item.sku === sku ? { ...item, qty: value } : item))
    );
    if (Number(value) > 0 && selectedOpeningSkuMap[sku]) {
      setErrors((prev) => {
        if (!prev.selected_qty) return prev;
        const next = { ...prev };
        delete next.selected_qty;
        return next;
      });
    }
    setItemErrors((prev) => {
      if (!prev[sku]) return prev;
      const next = { ...prev };
      delete next[sku];
      return next;
    });
  }

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
    module: "ops",
    warehouseId: form.warehouse_id,
  });

  function openForm() {
    setShowForm(true);
    setForm(initialForm());
    setSelectedItems([]);
    setSelectedOpeningSkuMap({});
    setBulkOpeningQty("");
    setOpeningStockSearch("");
    setOpeningStockCategory("");
    setErrors({});
    setItemErrors({});
    void loadDocNo();
  }

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

  function validate(): boolean {
    const next: Record<string, string> = {};
    const itemNext: Record<string, string> = {};
    const selectedForSubmit = selectedItems.filter((item) => Boolean(selectedOpeningSkuMap[item.sku]));
    if (selectedItems.length === 0) next.items = "Select at least one product";
    if (selectedItems.length > 0 && selectedForSubmit.length === 0) {
      next.items = "Select at least one item";
    }
    if (!form.date) next.date = "Date is required";
    if (!form.warehouse_id) next.warehouse_id = "Warehouse is required";
    if (!form.locator_id) next.locator_id = "Store locator is required";
    if (form.description && form.description.trim()) {
      const descriptionMessage = getRuleValidationError("no-symbols", form.description);
      if (descriptionMessage) next.description = descriptionMessage;
    }


    let hasPositive = false;
    let hasInvalidSelectedQty = false;
    selectedForSubmit.forEach((item) => {
      const qty = Number(item.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        itemNext[item.sku] = "Fill quantity";
        hasInvalidSelectedQty = true;
      }
      if (Number.isFinite(qty) && qty > 0) {
        hasPositive = true;
      }
    });

    if (selectedForSubmit.length > 0 && (hasInvalidSelectedQty || !hasPositive)) {
      next.selected_qty = "Fill quantity for selected items";
    }

    setErrors(next);
    setItemErrors(itemNext);
    return Object.keys(next).length === 0 && Object.keys(itemNext).length === 0;
  }

  async function submit(mode: "save" | "add") {
    if (!company) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        warehouse_id: Number(form.warehouse_id),
        locator_id: Number(form.locator_id),
        description: form.description.trim() || null,
        items: selectedItems
          .filter((item) => Boolean(selectedOpeningSkuMap[item.sku]))
          .filter((item) => Number(item.qty) > 0)
          .map((item) => ({
            product_id: item.product_id,
            sku: item.sku,
            qty: Number(item.qty),
          })),
      };

      const res = await apiFetch("/api/opening-stock", company, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");

      if (mode === "add") {
        setForm(initialForm());
        setSelectedItems([]);
        setSelectedOpeningSkuMap({});
        setBulkOpeningQty("");
        setOpeningStockSearch("");
        setOpeningStockCategory("");
        setItemErrors({});
        setErrors({});
        await loadDocNo();
        await loadList();
        return;
      }

      setForm(initialForm());
      setShowForm(false);
      setSelectedItems([]);
      setSelectedOpeningSkuMap({});
      setBulkOpeningQty("");
      setOpeningStockSearch("");
      setOpeningStockCategory("");
      setItemErrors({});
      setErrors({});
      await loadDocNo();
      await loadList();
    } catch (error: any) {
      notify(error.message || "Save failed", { severity: "error" });
    } finally {
      setSaving(false);
    }
  }

  const selectedSkuSet = useMemo(
    () => new Set(selectedItems.map((item) => item.sku)),
    [selectedItems]
  );

  useEffect(() => {
    setSelectedOpeningSkuMap((prev) => {
      const valid = new Set(selectedItems.map((item) => item.sku));
      let changed = false;
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach((sku) => {
        if (valid.has(sku)) {
          next[sku] = true;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [selectedItems]);

  const filteredLookupItems = useMemo(() => {
    const search = lookupFilters.search.trim().toLowerCase();
    const withoutSelected = lookupItems.filter((item) => !selectedSkuSet.has(item.sku));
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
  }, [lookupFilters, lookupItems, selectedSkuSet]);

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

  const categoryBySku = useMemo(() => {
    const map = new Map<string, string>();
    lookupItems.forEach((item) => {
      const category = String(item.category_name || item.category || "").trim();
      if (category) {
        map.set(item.sku, category);
      }
    });
    return map;
  }, [lookupItems]);

  const filteredSelectedItems = useMemo(() => {
    const search = openingStockSearch.trim().toLowerCase();
    return selectedItems.filter((item) => {
      const matchesSearch = search
        ? `${item.product_name} ${item.product_code} ${item.sku}`.toLowerCase().includes(search)
        : true;
      const category = categoryBySku.get(item.sku) || "";
      const matchesCategory = openingStockCategory ? category === openingStockCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [selectedItems, openingStockSearch, openingStockCategory, categoryBySku]);

  const filteredSelectedSkus = useMemo(
    () => filteredSelectedItems.map((item) => item.sku),
    [filteredSelectedItems]
  );

  const allFilteredRowsSelected =
    filteredSelectedSkus.length > 0 && filteredSelectedSkus.every((sku) => selectedOpeningSkuMap[sku]);
  const someFilteredRowsSelected =
    filteredSelectedSkus.length > 0 && filteredSelectedSkus.some((sku) => selectedOpeningSkuMap[sku]);

  useEffect(() => {
    if (!openingHeaderCheckboxRef.current) return;
    openingHeaderCheckboxRef.current.indeterminate = someFilteredRowsSelected && !allFilteredRowsSelected;
  }, [someFilteredRowsSelected, allFilteredRowsSelected]);

  const toggleAllFilteredOpeningRows = (checked: boolean) => {
    setSelectedOpeningSkuMap((prev) => {
      const next = { ...prev };
      filteredSelectedSkus.forEach((sku) => {
        if (checked) {
          next[sku] = true;
        } else {
          delete next[sku];
        }
      });
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next.items;
      if (checked) {
        delete next.selected_qty;
      }
      return next;
    });
  };

  const toggleOpeningRowSelection = (sku: string, checked: boolean) => {
    setSelectedOpeningSkuMap((prev) => {
      if (checked) return { ...prev, [sku]: true };
      if (!prev[sku]) return prev;
      const next = { ...prev };
      delete next[sku];
      return next;
    });
    if (checked) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.items;
        delete next.selected_qty;
        return next;
      });
    }
  };

  const applyQtyToSelected = () => {
    const qty = Number(bulkOpeningQty);
    const selectedSkus = selectedItems
      .filter((item) => Boolean(selectedOpeningSkuMap[item.sku]))
      .map((item) => item.sku);

    if (selectedSkus.length === 0) {
      setErrors((prev) => ({ ...prev, items: "Select at least one item" }));
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      setErrors((prev) => ({ ...prev, selected_qty: "Fill quantity for selected items" }));
      return;
    }

    setSelectedItems((prev) =>
      prev.map((item) =>
        selectedOpeningSkuMap[item.sku] ? { ...item, qty: String(qty) } : item
      )
    );
    setErrors((prev) => {
      const next = { ...prev };
      delete next.items;
      delete next.selected_qty;
      return next;
    });
    setItemErrors((prev) => {
      const next = { ...prev };
      selectedSkus.forEach((sku) => {
        if (next[sku]) delete next[sku];
      });
      return next;
    });
  };

  function openProductModal() {
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

  function addSelectedProducts() {
    if (selectedVariantIds.length === 0) {
      setProductModalError("Select at least one product.");
      return;
    }

    const additions: SelectedItem[] = [];
    selectedVariantIds.forEach((variantId) => {
      const item = lookupItemMap.get(variantId);
      if (!item || selectedSkuSet.has(item.sku)) return;
      additions.push({
        product_id: item.product_id,
        product_code: item.code || item.product_code,
        product_name: item.name,
        sku: item.sku,
        qty: "0",
      });
    });

    if (additions.length === 0) {
      setProductModalError("Selected products are already in the list.");
      return;
    }

    setSelectedItems((prev) => [...prev, ...additions]);
    setSelectedOpeningSkuMap((prev) => {
      const next = { ...prev };
      additions.forEach((item) => {
        next[item.sku] = true;
      });
      return next;
    });
    setErrors((prev) => {
      if (!prev.items) return prev;
      const next = { ...prev };
      delete next.items;
      return next;
    });
    setProductModalError("");
    closeProductModal();
  }

  const handleBarcodeSubmit = (value?: string) => {
    const barcode = String(value ?? barcodeValue).trim();
    if (!barcode) return;
    const match = lookupItems.find((item) => String(item.barcode || "") === barcode);
    if (!match) {
      setBarcodeMessage(`Barcode "${barcode}" not found.`);
      return;
    }

    if (selectedSkuSet.has(match.sku)) {
      setBarcodeMessage(`Barcode "${barcode}" is already added.`);
      return;
    }

    // Select the product in the modal
    setSelectedVariantMap((prev) => ({ ...prev, [String(match.variant_id)]: true }));
    setBarcodeValue("");
    setBarcodeMessage("");
    setProductModalError("");

    // Clear filters if the item is not in the currently filtered list
    const isInFiltered = sortedLookupItems.some((item) => item.variant_id === match.variant_id);
    if (!isInFiltered) {
      setLookupFilters({
        search: "",
        type: "",
        category: "",
        source: "",
      });
      setLookupPage(1);
    } else {
      const index = sortedLookupItems.findIndex((item) => item.variant_id === match.variant_id);
      if (index !== -1) {
        const pageNum = Math.floor(index / lookupItemsPerPage) + 1;
        setLookupPage(pageNum);
      }
    }

    // Scroll the element into view
    setTimeout(() => {
      const el = document.getElementById(`product-row-${match.variant_id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {saving &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Saving Opening Stock...</p>
            </div>
          </div>,
          document.body
        )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{showForm ? "Opening Stock Update" : "Opening Stock List"}</h1>
          <p className="text-sm text-gray-500">Record initial product stock levels and quantities for your store.</p>
        </div>
        {!showForm && (
          <button
            onClick={openForm}
            className="bg-[var(--color-blue-500)] flex items-center gap-2 text-white px-4 py-2 rounded-lg"
          >
            Add Opening Stock
          </button>
        )}
      </div>

      {!showForm && (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 text-gray-600 uppercase text-xs">
                <tr className="border-t hover:bg-blue-50 transition">
                  <th className="p-4 text-left">Doc No</th>
                  <th className="p-4 text-left">Date</th>
                  <th className="p-4 text-left">Warehouse</th>
                  <th className="p-4 text-left">Locator</th>
                  <th className="p-4 text-left">Description</th>
                  <th className="p-4 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400 animate-pulse">
                      Loading data...
                    </td>
                  </tr>
                ) : paginatedListItems.length > 0 ? (
                  paginatedListItems.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-blue-50 transition">
                      <td className="p-4">{row.doc_no}</td>
                      <td>{row.date}</td>
                      <td>{row.warehouse_name || "-"}</td>
                      <td>{row.locator_name || "-"}</td>
                      <td>{row.description || "-"}</td>
                      <td>{row.status || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                      No records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{showingFrom}</span> to{" "}
                <span className="font-medium">{showingTo}</span> of{" "}
                <span className="font-medium">{totalItems}</span> results
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="opening-stock-rows-per-page" className="text-sm text-gray-600">
                  Rows per page
                </label>
                <select
                  id="opening-stock-rows-per-page"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
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
                  className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-end">
                <nav aria-label="Pagination" className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                  <button
                    type="button"
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>

                  {pageNumbers.map((page, idx) =>
                    page === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={`page-${page}`}
                        type="button"
                        onClick={() => goToPage(page)}
                        aria-current={currentPage === page ? "page" : undefined}
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${currentPage === page
                          ? "z-10 bg-indigo-600 text-white"
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
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit("save");
          }}
          className="bg-white p-6 rounded-xl shadow space-y-6"
        >
          <h2 className="text-lg font-semibold">Header Information</h2>
          <div className="grid md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-semibold mb-1 block">Doc No</label>
              <input
                value={docLoading ? "Loading..." : form.doc_no}
                readOnly
                className="w-full mt-2 border rounded-lg p-3 bg-gray-100 text-gray-600"
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-1 block">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputClass("date")}
              />
              {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date}</p>}
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
            <div>
              <label className="text-sm font-semibold mb-1 block">Description</label>
              <textarea
                data-rules="no-symbols"
                data-field="description"
                data-optional="true"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={1}
                className={inputClass("description") + " resize-none"}
                placeholder="Optional notes"
              />              {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}

            </div>


            <div className="md:col-start-5 flex items-end">
              <button
                type="button"
                onClick={openProductModal}
                className="ml-auto bg-[var(--color-blue-500)] text-white px-6 py-2 rounded-lg "
              >
                Select Products
              </button>
              {errors.items && <p className="text-red-500 text-sm">{errors.items}</p>}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Opening Stock Items</h4>
              <div className="grid gap-3 md:grid-cols-2 mb-3">
                <input
                  type="text"
                  value={openingStockSearch}
                  onChange={(e) => setOpeningStockSearch(e.target.value)}
                  placeholder="Search by product name, product code, SKU"
                  className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={openingStockCategory}
                  onChange={(e) => setOpeningStockCategory(e.target.value)}
                  className="w-full border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Categories</option>
                  {lookupCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={bulkOpeningQty}
                  onChange={(e) => {
                    setBulkOpeningQty(e.target.value);
                    if (Number(e.target.value) > 0) {
                      setErrors((prev) => {
                        if (!prev.selected_qty) return prev;
                        const next = { ...prev };
                        delete next.selected_qty;
                        return next;
                      });
                    }
                  }}
                  placeholder="Qty"
                  className="w-full md:w-40 border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={applyQtyToSelected}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg whitespace-nowrap"
                >
                  Apply Qty to Selected
                </button>
              </div>
              {errors.selected_qty && <p className="text-red-500 text-sm mt-2">{errors.selected_qty}</p>}
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-indigo-50 text-gray-600 uppercase text-xs">
                    <tr className="border-t hover:bg-blue-50 transition">
                      <th className="p-4 text-center w-12">
                        <input
                          ref={openingHeaderCheckboxRef}
                          type="checkbox"
                          checked={allFilteredRowsSelected}
                          onChange={(e) => toggleAllFilteredOpeningRows(e.target.checked)}
                          disabled={filteredSelectedSkus.length === 0}
                        />
                      </th>
                      <th className="p-4 text-left">Product Code</th>
                      <th className="p-4 text-left">Product Name</th>
                      <th className="p-4 text-left">SKU</th>
                      <th className="p-4 text-left">Opening Qty</th>
                      <th className="p-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                          No products selected.
                        </td>
                      </tr>
                    ) : filteredSelectedItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                          No items match your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredSelectedItems.map((item) => (
                        <tr key={item.sku} className="border-t hover:bg-blue-50 transition">
                          <td className="p-4 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedOpeningSkuMap[item.sku])}
                              onChange={(e) => toggleOpeningRowSelection(item.sku, e.target.checked)}
                            />
                          </td>
                          <td className="p-4">{item.product_code}</td>
                          <td>{item.product_name}</td>
                          <td>{item.sku}</td>
                          <td>
                            <div className="max-w-[160px]">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.qty}
                                onChange={(e) => updateQty(item.sku, e.target.value)}
                                className={`w-full border rounded-lg p-2 ${itemErrors[item.sku] ? "border-red-500" : "border-gray-200"
                                  }`}
                              />
                              {itemErrors[item.sku] && (
                                <p className="text-red-500 text-xs mt-1">{itemErrors[item.sku]}</p>
                              )}
                            </div>
                          </td>
                          <td className="text-center">
                            <button type="button" onClick={() => removeSelected(item.sku)} className="text-red-600">
                              <XMarkIcon className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ui-form-actions">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(initialForm());
                setSelectedItems([]);
                setSelectedOpeningSkuMap({});
                setBulkOpeningQty("");
                setOpeningStockSearch("");
                setOpeningStockCategory("");
                setErrors({});
                setItemErrors({});
              }}
              className="ui-btn ui-btn-secondary ui-btn-responsive"
            >
              Cancel
            </button>

            <div className="ui-btn-group">
              <button
                type="button"
                onClick={() => void submit("add")}
                className="ui-btn ui-btn-secondary ui-btn-responsive"
                disabled={selectedItems.length === 0}
              >
                Save & Add Next
              </button>
              <button
                className="bg-[var(--color-blue-500)] text-white px-6 py-2 rounded-lg"
                disabled={selectedItems.length === 0}
              >
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      <ProductLookupModal
        open={productModalOpen}
        onClose={closeProductModal}
        onAddSelected={addSelectedProducts}
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
        barcodeValue={barcodeValue}
        barcodeMessage={barcodeMessage}
        onBarcodeChange={(value: string) => {
          setBarcodeValue(value);
          setBarcodeMessage("");
        }}
        onBarcodeSubmit={handleBarcodeSubmit}
        selectedCount={selectedVariantIds.length}
      />
    </div>
  );
}
