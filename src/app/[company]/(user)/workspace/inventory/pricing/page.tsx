"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import ProductLookupModal from "@/components/product/ProductLookupModal";
import { usePagination } from "@/hooks/usePagination";
import { useNotify } from "@/hooks/useNotify";
import { useProductLookup } from "@/hooks/useProductLookup";
import type { ProductLookupItem } from "@/lib/product-lookup";
import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

type ActivePricingRow = {
  id: string | number;
  variant_id: number | string;
  product_name?: string | null;
  product_code?: string | null;
  sku: string;
  color?: string | null;
  description?: string | null;
  category_name?: string | null;
  source_type?: "vendor" | "own";
  base_cost?: number | string;
  operational_cost?: number | string;
  landed_price?: number | string;
  margin_type?: "percentage" | "amount" | string;
  margin_value?: number | string;
  margin_amount?: number | string;
  tax_percent?: number | string;
  tax_id?: number | string | null;
  tax_name?: string | null;
  tax_amount?: number | string;
  unit_price?: number | string;
  final_selling_price?: number | string;
  active_from: string;
  expires_at?: string | null;
  is_active: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

type EntryRow = {
  variant_id: number;
  product_id: number;
  product_code?: string | null;
  product_name: string;
  sku: string;
  product_type?: string | null;
  color?: string | null;
  base_cost: string;
  operational_cost: string;
  margin_value: string;
  tax_id?: string | number | null;
  tax_percent?: string | number;
};

type ApiErrorPayload = {
  message?: string;
  errorCount?: number;
  errorReport?: string;
  errorReportFileName?: string;
};

type UploadPreviewRow = {
  variant_id: string;
  sku?: string;
  base_cost: number | string;
  operational_cost: number | string;
  landed_price: number | string;
  margin_amount: number | string;
  tax_amount: number | string;
  unit_price: number | string;
  selling_price: number | string;
};

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function asDate(value: unknown): string {
  return asText(value).slice(0, 10);
}

function fmtMoney(value: number | string | null | undefined): string {
  if (value == null) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return asText(value);
  return n.toFixed(2);
}

function todayYyyyMmDd(): string {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrNull(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function calculatePreviewRow(options: {
  baseCostText: string;
  operationalCostText: string;
  marginType: "percentage" | "amount";
  marginValueText: string;
  taxPercentText?: string;
}) {
  const base = toNumberOrNull(options.baseCostText);
  const operational = toNumberOrNull(options.operationalCostText || "0");
  const marginValue = toNumberOrNull(options.marginValueText || "0");
  const taxPercent = toNumberOrNull(options.taxPercentText || "0");
  if (base == null || operational == null || marginValue == null || taxPercent == null) {
    return {
      landed: null,
      marginAmount: null,
      unitPrice: null,
      taxAmount: null,
      selling: null,
    };
  }
  const landed = base + operational;
  if (landed <= 0) {
    return {
      landed: null,
      marginAmount: null,
      unitPrice: null,
      taxAmount: null,
      selling: null,
    };
  }
  const marginAmount =
    options.marginType === "percentage" ? landed * (marginValue / 100) : marginValue;
  const unitPrice = landed + marginAmount;
  const taxAmount = unitPrice * (taxPercent / 100);
  const selling = unitPrice + taxAmount;
  return {
    landed: Math.round(landed * 100) / 100,
    marginAmount: Math.round(marginAmount * 100) / 100,
    unitPrice: Math.round(unitPrice * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    selling: Math.round(selling * 100) / 100,
  };
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function decodeBase64ToBlob(base64Text: string, mimeType: string): Blob {
  const binary = atob(base64Text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export default function PricingPage() {
  const { company } = useTenant();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    items: lookupItems,
    loading: lookupLoading,
    filters: lookupFilters,
    setFilters: setLookupFilters,
    page: lookupPage,
    setPage: setLookupPage,
    totalPages: lookupTotalPages,
    itemsPerPage: lookupItemsPerPage,
    paginatedItems: lookupPaginatedItems,
    totalCount: lookupTotalCount,
    categoryOptions: lookupCategoryOptions,
    resetFilters: resetLookupFilters,
  } = useProductLookup({ enabled: Boolean(company) });

  const [rows, setRows] = useState<ActivePricingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const notify = useNotify();
  const [pricingSearch, setPricingSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pricingFilter, setPricingFilter] = useState<"priced" | "unpriced" | "both">("unpriced");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [uploadPreviewOpen, setUploadPreviewOpen] = useState(false);
  const [uploadPreviewRows, setUploadPreviewRows] = useState<UploadPreviewRow[]>([]);
  const [selectProductsModalOpen, setSelectProductsModalOpen] = useState(false);
  const [selectedVariantMap, setSelectedVariantMap] = useState<Record<string, boolean>>({});

  const [effectiveDate, setEffectiveDate] = useState(todayYyyyMmDd());
  const [entryRows, setEntryRows] = useState<EntryRow[]>([]);
  const [marginType, setMarginType] = useState<"percentage" | "amount">("percentage");
  const [editingRow, setEditingRow] = useState<ActivePricingRow | null>(null);
  const [editBaseCost, setEditBaseCost] = useState("");
  const [editOperationalCost, setEditOperationalCost] = useState("");
  const [editMarginType, setEditMarginType] = useState<"percentage" | "amount">("percentage");
  const [editMarginValue, setEditMarginValue] = useState("");
  const [editTaxId, setEditTaxId] = useState("");
  const [editTaxPercent, setEditTaxPercent] = useState("0");
  const [editEffectiveDate, setEditEffectiveDate] = useState(todayYyyyMmDd());
  const [taxOptions, setTaxOptions] = useState<
    Array<{ id: number; tax_name: string; total_percentage: number }>
  >([]);
  const [entrySearch, setEntrySearch] = useState("");
  const [entryTypeFilter, setEntryTypeFilter] = useState("");
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [bulkBaseCost, setBulkBaseCost] = useState("");
  const [bulkOperationalCost, setBulkOperationalCost] = useState("");
  const [bulkMarginValue, setBulkMarginValue] = useState("");
  const [bulkTaxPercent, setBulkTaxPercent] = useState("");
  const [bulkTaxId, setBulkTaxId] = useState("");
  const entryHeaderCheckboxRef = useRef<HTMLInputElement>(null);
  const [useLastPurchasePrice, setUseLastPurchasePrice] = useState(false);

  async function loadPricing() {
    setLoading(true);
    try {
      const response = await apiFetch("/api/pricing", company);
      const payload = await response.json();
      if (!response.ok) notify(payload.message || "Failed to fetch pricing", { severity: "error" });
      setRows(payload.pricing || []);
    } catch (error: any) {
      notify(error.message || "Failed to fetch pricing", { severity: "error" });
    } finally {
      setLoading(false);
    }
  }


  async function loadTaxes() {
    try {
      const response = await apiFetch("/api/product-lookup?type=taxes", company);
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        notify(payload.message || "Failed to fetch taxes", { severity: "error" });
      }
      setTaxOptions(payload.data || []);
    } catch (error: any) {
      notify(error.message || "Failed to fetch taxes", { severity: "error" });
    }
  }

  async function handleTemplateDownload() {
    setDownloading(true);
    setStatusMessage("");
    try {
      const query = new URLSearchParams({
      pricingFilter,
      useLastPurchasePrice: String(useLastPurchasePrice),
    });
      const response = await apiFetch(`/api/pricing/template?${query.toString()}`, company);
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || "Failed to download template");
      }
      const blob = await response.blob();
      triggerBrowserDownload(blob, "pricing-update-template.xlsx");
    } catch (error: any) {
      notify(error.message || "Failed to download template", { severity: "error" });
    } finally {
      setDownloading(false);
    }
  }

  async function handleUploadPricing() {
    if (!selectedFile) {
      notify("Select an .xlsx file first.", { severity: "warning" });
      return;
    }

    setPreviewing(true);
    setStatusMessage("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const query = new URLSearchParams({
        preview: "true",
        useLastPurchasePrice: String(useLastPurchasePrice),
      });
      const response = await apiFetch(`/api/pricing/upload?${query.toString()}`, company, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ApiErrorPayload & {
        updatedRows?: number;
        previewRows?: UploadPreviewRow[];
      };

      if (!response.ok) {
        if (payload.errorReport) {
          const blob = decodeBase64ToBlob(
            payload.errorReport,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          triggerBrowserDownload(blob, payload.errorReportFileName || "pricing-upload-errors.xlsx");
        }
        notify(payload.message || "Pricing upload failed", { severity: "error" });
      }

      setUploadPreviewRows(payload.previewRows || []);
      setUploadPreviewOpen(true);
    } catch (error: any) {
      notify(error.message || "Pricing upload failed", { severity: "error" });
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmUploadPricing() {
    if (!selectedFile) {
      notify("Select an .xlsx file first.", { severity: "warning" });
      return;
    }

    setUploading(true);
    setStatusMessage("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const query = new URLSearchParams({
        useLastPurchasePrice: String(useLastPurchasePrice),
      });
      const response = await apiFetch(`/api/pricing/upload?${query.toString()}`, company, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ApiErrorPayload & { updatedRows?: number };

      if (!response.ok) {
        if (payload.errorReport) {
          const blob = decodeBase64ToBlob(
            payload.errorReport,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          triggerBrowserDownload(blob, payload.errorReportFileName || "pricing-upload-errors.xlsx");
        }
        throw new Error(payload.message || "Pricing upload failed");
      }

      notify(`Uploaded ${payload.updatedRows || 0} pricing rows successfully.`, { severity: "success" });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadPreviewRows([]);
      setUploadPreviewOpen(false);
      setBulkModalOpen(false);
      await loadPricing();
    } catch (error: any) {
      notify(error.message || "Pricing upload failed", { severity: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function fetchLatestPurchasePricesForEntries(ids: number[]) {
    if (ids.length === 0) return {};
    try {
      const response = await apiFetch("/api/pricing/latest-purchase-price", company, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantIds: ids }),
      });
      const payload = await response.json();
      if (response.ok && payload.success) {
        return payload.prices as Record<string, number>;
      }
    } catch (err) {
      console.error("Failed to fetch latest purchase prices", err);
    }
    return {};
  }

  useEffect(() => {
    if (useLastPurchasePrice && entryRows.length > 0) {
      const idsToFetch = entryRows.map((r) => Number(r.variant_id));
      fetchLatestPurchasePricesForEntries(idsToFetch).then((prices) => {
        if (!prices) return;
        setEntryRows((prev) =>
          prev.map((row) => {
            const key = String(row.variant_id);
            if (prices[key] !== undefined) {
              return { ...row, base_cost: String(prices[key]) };
            }
            return row;
          })
        );
      });
    }
  }, [useLastPurchasePrice]);

  useEffect(() => {
    if (!company) return;
    loadPricing();
    loadTaxes();
  }, [company]);

  const filteredPricingRows = useMemo(() => {
    const query = pricingSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.product_name || ""} ${row.product_code || ""} ${row.sku || ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [rows, pricingSearch]);

  const sortedPricingRows = useMemo(() => {
    return [...filteredPricingRows].sort((a, b) => {
      const activeDiff = Number(Boolean(b.is_active)) - Number(Boolean(a.is_active));
      if (activeDiff !== 0) return activeDiff;
      const dateA = asDate(a.active_from);
      const dateB = asDate(b.active_from);
      return dateB.localeCompare(dateA);
    });
  }, [filteredPricingRows]);

  const {
    currentPage: currentPricingPage,
    itemsPerPage: pricingItemsPerPage,
    setItemsPerPage: setPricingItemsPerPage,
    totalItems: totalPricingItems,
    totalPages: totalPricingPages,
    pageNumbers: pricingPageNumbers,
    showingFrom: pricingShowingFrom,
    showingTo: pricingShowingTo,
    paginatedData: paginatedPricingRows,
    goToPage: goToPricingPage,
    goToPreviousPage: goToPreviousPricingPage,
    goToNextPage: goToNextPricingPage,
  } = usePagination({
    data: sortedPricingRows,
    initialItemsPerPage: 10,
    resetDeps: [rows.length, pricingSearch],
  });

  useEffect(() => {
    setSelectedEntryIds((prev) =>
      prev.filter((id) => entryRows.some((row) => String(row.variant_id) === id))
    );
  }, [entryRows]);

  const entryTypeOptions = useMemo(() => {
    const values = new Set<string>();
    entryRows.forEach((row) => {
      const value = String(row.product_type || "");
      if (value) values.add(value);
    });
    return Array.from(values);
  }, [entryRows]);

  const filteredEntryRows = useMemo(() => {
    const searchValue = entrySearch.trim().toLowerCase();
    return entryRows.filter((row) => {
      const name = row.product_name || "";
      const code = row.product_code || "";
      const sku = row.sku || "";
      const rowType = String(row.product_type || "");
      const matchesSearch = searchValue
        ? `${name} ${code} ${sku}`.toLowerCase().includes(searchValue)
        : true;
      const matchesType = entryTypeFilter ? rowType === entryTypeFilter : true;
      return matchesSearch && matchesType;
    });
  }, [entryRows, entrySearch, entryTypeFilter]);

  const filteredEntryIds = useMemo(
    () => filteredEntryRows.map((row) => String(row.variant_id)),
    [filteredEntryRows]
  );

  const allFilteredEntrySelected =
    filteredEntryIds.length > 0 && filteredEntryIds.every((id) => selectedEntryIds.includes(id));
  const someFilteredEntrySelected =
    filteredEntryIds.length > 0 && filteredEntryIds.some((id) => selectedEntryIds.includes(id));

  useEffect(() => {
    if (!entryHeaderCheckboxRef.current) return;
    entryHeaderCheckboxRef.current.indeterminate =
      someFilteredEntrySelected && !allFilteredEntrySelected;
  }, [someFilteredEntrySelected, allFilteredEntrySelected]);

  const toggleAllFilteredEntries = (checked: boolean) => {
    if (checked) {
      setSelectedEntryIds((prev) => Array.from(new Set([...prev, ...filteredEntryIds])));
    } else {
      setSelectedEntryIds((prev) => prev.filter((id) => !filteredEntryIds.includes(id)));
    }
  };

  const toggleEntryRow = (id: string, checked: boolean) => {
    setSelectedEntryIds((prev) => {
      if (checked) return Array.from(new Set([...prev, id]));
      return prev.filter((item) => item !== id);
    });
  };

  const applyBulkPricing = () => {
    if (!selectedEntryIds.length) return;
    const hasBase = asText(bulkBaseCost) !== "";
    const hasOperational = asText(bulkOperationalCost) !== "";
    const hasMargin = asText(bulkMarginValue) !== "";
    const hasTax = bulkTaxId !== "";

    if (!hasBase && !hasOperational && !hasMargin && !hasTax) return;

    setEntryRows((prev) =>
      prev.map((row) => {
        if (!selectedEntryIds.includes(String(row.variant_id))) return row;
        const next: EntryRow = { ...row };
        if (hasBase) next.base_cost = bulkBaseCost;
        if (hasOperational) next.operational_cost = bulkOperationalCost;
        if (hasMargin) next.margin_value = bulkMarginValue;
        if (hasTax) {
          const selectedTax = taxOptions.find((t) => String(t.id) === bulkTaxId);
          if (selectedTax) {
            next.tax_id = selectedTax.id;
            next.tax_percent = selectedTax.total_percentage;
          }
        }
        return next;
      })
    );
  };

  const bulkPricingVisible = selectedEntryIds.length > 0;

  const allFilteredSelected =
    lookupPaginatedItems.length > 0 &&
    lookupPaginatedItems.every((row) => selectedVariantMap[String(row.variant_id)]);

  function toggleSelectAll(checked: boolean, rowsToToggle: ProductLookupItem[]) {
    if (!checked) {
      setSelectedVariantMap({});
      return;
    }
    const map: Record<string, boolean> = {};
    rowsToToggle.forEach((row) => {
      map[String(row.variant_id)] = true;
    });
    setSelectedVariantMap(map);
  }

  function toggleVariantSelection(item: ProductLookupItem) {
    setSelectedVariantMap((prev) => {
      const key = String(item.variant_id);
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
  }

  function openCreateModal() {
    setCreateModalOpen(true);
    setEffectiveDate(todayYyyyMmDd());
    setEntryRows([]);
    setSelectedVariantMap({});
    resetLookupFilters();
    setMarginType("percentage");
    setEntrySearch("");
    setEntryTypeFilter("");
    setSelectedEntryIds([]);
    setBulkBaseCost("");
    setBulkOperationalCost("");
    setBulkMarginValue("");
    setBulkTaxPercent("");
  }

  function applySelectedProducts() {
    const selected = lookupItems.filter((row) => selectedVariantMap[String(row.variant_id)]);
    const existing = new Set(entryRows.map((r) => String(r.variant_id)));
    const newSelected = selected.filter((row) => !existing.has(String(row.variant_id)));

    if (newSelected.length === 0) {
      setSelectProductsModalOpen(false);
      return;
    }

    const newEntries = newSelected.map((row) => ({
      variant_id: Number(row.variant_id),
      product_id: Number(row.product_id),
      product_code: row.product_code || row.code,
      product_name: row.name,
      sku: row.sku,
      product_type: row.type || null,
      color: row.color,
      base_cost: "",
      operational_cost: "0",
      margin_value: "",
      tax_id: "",
      tax_percent: "0",
    }));

    if (useLastPurchasePrice) {
      const idsToFetch = newEntries.map((e) => e.variant_id);
      fetchLatestPurchasePricesForEntries(idsToFetch).then((prices) => {
        const entriesWithPrices = newEntries.map((row) => {
          const key = String(row.variant_id);
          if (prices && prices[key] !== undefined) {
            return { ...row, base_cost: String(prices[key]) };
          }
          return row;
        });
        setEntryRows((prev) => [...prev, ...entriesWithPrices]);
      });
    } else {
      setEntryRows((prev) => [...prev, ...newEntries]);
    }
    setSelectProductsModalOpen(false);
  }
  function removeRow(variantId: number) {
    setEntryRows((prev) => prev.filter((row) => row.variant_id !== variantId));
    setSelectedVariantMap((prev) => {
      const next = { ...prev };
      delete next[String(variantId)];
      return next;
    });
  }

  function updateRow(variantId: number, patch: Partial<EntryRow>) {
    setEntryRows((prev) =>
      prev.map((row) =>
        row.variant_id === variantId ? { ...row, ...patch } : row
      )
    );
  }

  async function savePricingRows(addAnother: boolean) {
    if (!effectiveDate) {
      notify("Effective Date is required.", { severity: "warning" });
      return;
    }
    if (effectiveDate < todayYyyyMmDd()) {
      notify("Effective Date cannot be in the past.", { severity: "warning" });
      return;
    }
    if (entryRows.length === 0) {
      notify("Select at least one product.", { severity: "warning" });
      return;
    }
    const invalidBase = entryRows.find((r) => asText(r.base_cost) === "");
    if (invalidBase) {
      notify(`Base Cost is required for Variant ${invalidBase.product_code}`, { severity: "warning" });
      return;
    }
    if (marginType === "percentage") {
      const invalidMargin = entryRows.find((r) => {
        const valueText = asText(r.margin_value);
        if (valueText === "") return false;
        const n = Number(valueText);
        return Number.isFinite(n) && n >= 100;
      });
      if (invalidMargin) {
        notify(
          `Margin Value must be less than 100 for Variant ${invalidMargin.product_code}`,
          { severity: "warning" }
        );
        return;
      }
    }

    setSaving(true);
    setStatusMessage("");
    try {
      const response = await apiFetch("/api/pricing", company, {
        method: "POST",
        body: JSON.stringify({
          rows: entryRows.map((row) => ({
            variant_id: row.variant_id,
            base_cost: row.base_cost,
            operational_cost: asText(row.operational_cost) || "0",
            margin_type: marginType,
            margin_value: asText(row.margin_value) || "0",
            tax_id: row.tax_id || null,
            tax_percent: asText(row.tax_percent) || "0",
            effective_date: effectiveDate,
            expires_at: null,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        notify(payload.message || "Failed to create pricing", { severity: "error" });
        return;
      }
      notify("Pricing created successfully.", { severity: "success" });
      await loadPricing();

      if (addAnother) {
        setEntryRows([]);
        setSelectedVariantMap({});
      } else {
        setCreateModalOpen(false);
      }
    } catch (error: any) {
      notify(error.message || "Failed to create pricing", { severity: "error" });
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(row: ActivePricingRow) {
    setEditingRow(row);
    setEditBaseCost(asText(row.base_cost));
    setEditOperationalCost(asText(row.operational_cost));
    setEditMarginType(
      String(row.margin_type || "").toLowerCase() === "amount" ? "amount" : "percentage"
    );
    setEditMarginValue(asText(row.margin_value));
    setEditTaxId(row.tax_id != null ? String(row.tax_id) : "");
    setEditTaxPercent(asText(row.tax_percent || "0"));
    setEditEffectiveDate(asDate(row.active_from) || todayYyyyMmDd());
    setEditModalOpen(true);

    if (useLastPurchasePrice) {
      fetchLatestPurchasePricesForEntries([Number(row.variant_id)]).then((prices) => {
        const key = String(row.variant_id);
        if (prices && prices[key] !== undefined) {
          setEditBaseCost(String(prices[key]));
        }
      });
    }
  }

  async function saveEditedPricing() {
    if (!editingRow) return;
    if (!editEffectiveDate) {
      notify("Effective Date is required.", { severity: "warning" });
      return;
    }
    if (editEffectiveDate < todayYyyyMmDd()) {
      notify("Effective Date cannot be in the past. edited", { severity: "warning" });
      return;
    }
    if (!asText(editBaseCost)) {
      notify("Base Cost is required.", { severity: "warning" });
      return;
    }

    setSaving(true);
    setStatusMessage("");
    try {
      const response = await apiFetch(`/api/pricing/${editingRow.id}`, company, {
        method: "PUT",
        body: JSON.stringify({
          base_cost: editBaseCost,
          operational_cost: asText(editOperationalCost) || "0",
          margin_type: editMarginType,
          margin_value: asText(editMarginValue) || "0",
          tax_id: editTaxId || null,
          tax_percent: asText(editTaxPercent) || "0",
          effective_date: editEffectiveDate,
          expires_at: null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        notify(payload.message || "Failed to update pricing", { severity: "error" });
        return;
      }

      notify("Pricing updated successfully.", { severity: "success" });
      setEditModalOpen(false);
      setEditingRow(null);
      await loadPricing();
    } catch (error: any) {
      notify(error.message || "Failed to update pricing", { severity: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Product Pricing</h1>
          <p className="text-sm text-gray-500">Multi-product pricing in one form.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              + Add Pricing Form
            </button>
            <button
              onClick={() => setBulkModalOpen(true)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800"
            >
              Bulk Import Excel
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="use-last-purchase-price"
              type="checkbox"
              checked={useLastPurchasePrice}
              onChange={(e) => setUseLastPurchasePrice(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="use-last-purchase-price" className="text-sm text-gray-600 select-none cursor-pointer">
              Use Last Purchase Price
            </label>
          </div>
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          {statusMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <div className="relative max-w-md">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              value={pricingSearch}
              onChange={(e) => setPricingSearch(e.target.value)}
              placeholder="Search product, code, or SKU..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-[62vh] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-20 bg-indigo-50 text-gray-600" >
              <tr>
                <th className="bg-indigo-50 px-4 py-3 text-gray-600 border-b border-gray-200">Product Code</th>
                <th className="bg-indigo-50 px-4 py-3 text-gray-600 border-b border-gray-200">Product Name</th>
                <th className="bg-indigo-50 px-4 py-3 text-gray-600 border-b border-gray-200">SKU</th>
                <th className="bg-indigo-50 px-4 py-3 text-gray-600 border-b border-gray-200">Selling Price</th>
                <th className="bg-indigo-50 px-4 py-3 text-gray-600 border-b border-gray-200">Effective Date</th>
                <th className="bg-indigo-50 px-4 py-3 text-gray-600 border-b border-gray-200">Expires At</th>
                <th className="bg-indigo-50 px-4 py-3 text-gray-600 border-b border-gray-200">Status</th>
                <th className="sticky right-0  px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-400 animate-pulse">
                    Loading data...
                  </td>
                </tr>
              ) : paginatedPricingRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={8}>
                    No pricing rows found.
                  </td>
                </tr>
              ) : (
                paginatedPricingRows.map((row, index) => (
                  <tr key={`${row.id}-${index}`} className="border-t border-gray-100">
                    <td className="px-4 py-3">{row.product_code || "-"}</td>
                    <td className="px-4 py-3">{row.product_name || "-"}</td>
                    <td className="px-4 py-3">{row.sku}</td>
                    <td className="px-4 py-3">{fmtMoney(row.final_selling_price)}</td>
                    <td className="px-4 py-3">{asDate(row.active_from)}</td>
                    <td className="px-4 py-3">{asDate(row.expires_at) || "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${row.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}
                      >
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="sticky right-0 bg-white px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/${company}/workspace/inventory/pricing/${row.id}`}
                          className="text-indigo-600"
                          aria-label="View pricing"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="text-indigo-600"
                          aria-label="Edit pricing"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-600">
              Showing <span className="font-medium">{pricingShowingFrom}</span> to{" "}
              <span className="font-medium">{pricingShowingTo}</span> of{" "}
              <span className="font-medium">{totalPricingItems}</span> results
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="pricing-items-per-page" className="text-xs text-gray-600">
                Rows per page
              </label>
              <select
                id="pricing-items-per-page"
                value={pricingItemsPerPage}
                onChange={(e) => setPricingItemsPerPage(Number(e.target.value))}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                type="button"
                onClick={goToPreviousPricingPage}
                disabled={currentPricingPage === 1}
                className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={goToNextPricingPage}
                disabled={currentPricingPage === totalPricingPages}
                className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-50"
              >
                Next
              </button>
            </div>

            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-end">
              <nav aria-label="Pricing pagination" className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                <button
                  type="button"
                  onClick={goToPreviousPricingPage}
                  disabled={currentPricingPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>

                {pricingPageNumbers.map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`pricing-ellipsis-${idx}`}
                      className="relative inline-flex items-center px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`pricing-page-${page}`}
                      type="button"
                      onClick={() => goToPricingPage(page)}
                      aria-current={currentPricingPage === page ? "page" : undefined}
                      className={`relative inline-flex items-center px-3 py-2 text-xs font-medium ring-1 ring-inset ring-gray-300 ${currentPricingPage === page
                        ? "z-10 bg-blue-600 text-white"
                        : "text-gray-700 hover:bg-gray-50"
                        }`}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={goToNextPricingPage}
                  disabled={currentPricingPage === totalPricingPages}
                  className="relative inline-flex items-center rounded-r-md px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {editModalOpen && editingRow ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">Edit Pricing</h3>
                <p className="text-xs text-gray-500">
                  {editingRow.product_code || "-"} | {editingRow.product_name || "-"} | {editingRow.sku}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingRow(null);
                }}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Effective Date
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={editEffectiveDate}
                  onChange={(e) => setEditEffectiveDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Margin Type
                </label>
                <select
                  value={editMarginType}
                  onChange={(e) => setEditMarginType(e.target.value === "amount" ? "amount" : "percentage")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="percentage">Percentage</option>
                  <option value="amount">Amount</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Base Cost
                </label>
                <input
                  type="number"
                  value={editBaseCost}
                  onChange={(e) => setEditBaseCost(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Operational Cost
                </label>
                <input
                  type="number"
                  value={editOperationalCost}
                  onChange={(e) => setEditOperationalCost(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Margin Value
                </label>
                <input
                  type="number"
                  value={editMarginValue}
                  onChange={(e) => setEditMarginValue(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Tax
                </label>
                <select
                  value={editTaxId}
                  onChange={(e) => {
                    const selected = taxOptions.find((tax) => String(tax.id) === e.target.value);
                    setEditTaxId(e.target.value);
                    setEditTaxPercent(selected ? String(selected.total_percentage || 0) : "0");
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">No Tax</option>
                  {taxOptions.map((tax) => (
                    <option key={tax.id} value={String(tax.id)}>
                      {tax.tax_name} ({tax.total_percentage}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingRow(null);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedPricing}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Updating..." : "Update Pricing"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkModalOpen ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-xl rounded-xl bg-white p-5 shadow-lg">
            <button
              onClick={() => setBulkModalOpen(false)}
              className="absolute right-3 top-3 text-lg text-gray-500 hover:text-gray-700"
              aria-label="Close"
            >
              x
            </button>
            <h2 className="text-sm font-semibold text-gray-900">Bulk Import via Excel</h2>

            <div className="mt-3 space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Product Filter
              </label>
              <select
                value={pricingFilter}
                onChange={(e) => setPricingFilter(e.target.value as "priced" | "unpriced" | "both")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="priced">Priced</option>
                <option value="unpriced">Unpriced</option>
                <option value="both">Both</option>
              </select>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={handleTemplateDownload}
                disabled={downloading}
                className="inline-flex text-xs text-gray-600 underline hover:text-gray-800 disabled:opacity-60"
              >
                {downloading ? "Preparing..." : "Download Excel Template"}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                className="block w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />

              <button
                onClick={handleUploadPricing}
                disabled={uploading || previewing}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {previewing ? "Preparing Preview..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {uploadPreviewOpen ? (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">Upload Preview</h3>
                <p className="text-xs text-gray-500">
                  Review calculated values before saving.
                </p>
              </div>
              <button
                onClick={() => setUploadPreviewOpen(false)}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Variant ID</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Base Cost</th>
                    <th className="px-3 py-2 font-medium">Operational Cost</th>
                    <th className="px-3 py-2 font-medium">Landed Price</th>
                    <th className="px-3 py-2 font-medium">Margin Amount</th>
                    <th className="px-3 py-2 font-medium">Tax Amount</th>
                    <th className="px-3 py-2 font-medium">Unit Price</th>
                    <th className="px-3 py-2 font-medium">Selling Price</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadPreviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                        No preview rows.
                      </td>
                    </tr>
                  ) : (
                    uploadPreviewRows.map((row) => (
                      <tr key={row.variant_id} className="border-t border-gray-100">
                        <td className="px-3 py-2">{row.variant_id}</td>
                        <td className="px-3 py-2">{row.sku || "-"}</td>
                        <td className="px-3 py-2">{fmtMoney(row.base_cost)}</td>
                        <td className="px-3 py-2">{fmtMoney(row.operational_cost)}</td>
                        <td className="px-3 py-2">{fmtMoney(row.landed_price)}</td>
                        <td className="px-3 py-2">{fmtMoney(row.margin_amount)}</td>
                        <td className="px-3 py-2">{fmtMoney(row.tax_amount)}</td>
                        <td className="px-3 py-2">{fmtMoney(row.unit_price)}</td>
                        <td className="px-3 py-2">{fmtMoney(row.selling_price)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setUploadPreviewOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmUploadPricing}
                disabled={uploading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {uploading ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-[1600px] max-w-[95vw] h-[800px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-end justify-between gap-3 px-6 py-4 border-b bg-gray-50">
              <div>
                <h2 className="text-lg font-semibold">Add Pricing</h2>
                <p className="text-xs text-gray-500">Select multiple products and update row-wise pricing.</p>
              </div>
              <button
                onClick={() => {
                  setSelectProductsModalOpen(true);
                  resetLookupFilters();
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                Select Products
              </button>
            </div>

            <div className="px-6 py-4 border-b">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Margin Type
                  </label>
                  <select
                    value={marginType}
                    onChange={(e) => {
                      const nextType = e.target.value === "amount" ? "amount" : "percentage";
                      setMarginType(nextType);
                      setEntryRows((prev) => prev.map((row) => ({ ...row, margin_value: "" })));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="amount">Amount</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-b bg-white">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <div className="flex-1">
                    <input
                      value={entrySearch}
                      onChange={(e) => setEntrySearch(e.target.value)}
                      placeholder="Search by product name, code, or SKU..."
                      className="border p-2 rounded w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={entryTypeFilter}
                      onChange={(e) => setEntryTypeFilter(e.target.value)}
                      className="border p-2 rounded min-w-[150px]"
                    >
                      <option value="">All Types</option>
                      {entryTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <div className="h-full overflow-auto">
                {bulkPricingVisible && (
                  <div className="sticky top-0 z-20 bg-white border-b px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        value={bulkBaseCost}
                        onChange={(e) => setBulkBaseCost(e.target.value)}
                        placeholder="Base Cost"
                        className="border p-2 rounded w-28"
                      />
                      <input
                        type="number"
                        value={bulkOperationalCost}
                        onChange={(e) => setBulkOperationalCost(e.target.value)}
                        placeholder="Operational Cost"
                        className="border p-2 rounded w-36"
                      />
                      <input
                        type="number"
                        value={bulkMarginValue}
                        onChange={(e) => setBulkMarginValue(e.target.value)}
                        placeholder="Margin Value"
                        className="border p-2 rounded w-28"
                      />
                      <select
                        value={bulkTaxId}
                        onChange={(e) => setBulkTaxId(e.target.value)}
                        className="border p-2 rounded w-32"
                      >
                        <option value="">No Tax</option>
                        {taxOptions.map((tax) => (
                          <option key={tax.id} value={String(tax.id)}>
                            {tax.tax_name} ({tax.total_percentage}%)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={applyBulkPricing}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 h-[38px] rounded font-medium"
                      >
                        Apply to Selected
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedEntryIds([])}
                        className="border border-gray-300 text-gray-700 px-4 h-[38px] rounded font-medium hover:bg-gray-50"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                )}
                <table className="min-w-full text-left text-sm">
                  <thead
                    className={`bg-gray-50 text-gray-600 sticky ${bulkPricingVisible ? "top-[56px]" : "top-0"
                      } z-10`}
                  >
                    <tr>
                      <th className="px-3 py-2 text-center w-10">
                        <input
                          ref={entryHeaderCheckboxRef}
                          type="checkbox"
                          checked={allFilteredEntrySelected}
                          onChange={(e) => toggleAllFilteredEntries(e.target.checked)}
                          disabled={filteredEntryIds.length === 0}
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Product Code</th>
                      <th className="px-3 py-2 font-medium">Product Name</th>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium">Base Cost</th>
                      <th className="px-3 py-2 font-medium">Operational Cost</th>
                      <th className="px-3 py-2 font-medium">Margin Value</th>
                      <th className="px-3 py-2 font-medium">Tax %</th>
                      <th className="px-3 py-2 font-medium">Margin Amount</th>
                      <th className="px-3 py-2 font-medium">Tax Amount</th>
                      <th className="px-3 py-2 font-medium">Unit Price</th>
                      <th className="px-3 py-2 font-medium">Landed Price</th>
                      <th className="px-3 py-2 font-medium">Selling Price</th>
                      <th className="px-3 py-2 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entryRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-3 py-6 text-center text-gray-500">
                          No products selected.
                        </td>
                      </tr>
                    ) : filteredEntryRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-3 py-6 text-center text-gray-500">
                          No products match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredEntryRows.map((row) => {
                        const calc = calculatePreviewRow({
                          baseCostText: row.base_cost,
                          operationalCostText: row.operational_cost,
                          marginType,
                          marginValueText: row.margin_value,
                          taxPercentText: String(row.tax_percent || "0"),
                        });
                        return (
                          <tr key={row.variant_id} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={selectedEntryIds.includes(String(row.variant_id))}
                                onChange={(e) =>
                                  toggleEntryRow(String(row.variant_id), e.target.checked)
                                }
                              />
                            </td>
                            <td className="px-3 py-2">{row.product_code}</td>
                            <td className="px-3 py-2">{row.product_name}</td>
                            <td className="px-3 py-2">{row.sku}</td>
                            <td className="px-3 py-2">
                              <input
                                value={row.base_cost}
                                onChange={(e) =>
                                  updateRow(row.variant_id, { base_cost: e.target.value })
                                }
                                className="w-28 rounded border border-gray-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.operational_cost}
                                onChange={(e) =>
                                  updateRow(row.variant_id, {
                                    operational_cost: e.target.value,
                                  })
                                }
                                className="w-28 rounded border border-gray-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.margin_value}
                                onChange={(e) =>
                                  updateRow(row.variant_id, { margin_value: e.target.value })
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.tax_id || ""}
                                onChange={(e) => {
                                  const selected = taxOptions.find(
                                    (tax) => String(tax.id) === e.target.value
                                  );
                                  updateRow(row.variant_id, {
                                    tax_id: e.target.value,
                                    tax_percent: selected
                                      ? String(selected.total_percentage || 0)
                                      : "0",
                                  });
                                }}
                                className="w-36 rounded border border-gray-300 px-2 py-1"
                              >
                                <option value="">No Tax</option>
                                {taxOptions.map((tax) => (
                                  <option key={tax.id} value={String(tax.id)}>
                                    {tax.tax_name} ({tax.total_percentage}%)
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 bg-gray-50">{fmtMoney(calc.marginAmount)}</td>
                            <td className="px-3 py-2 bg-gray-50">{fmtMoney(calc.taxAmount)}</td>
                            <td className="px-3 py-2 bg-gray-50">{fmtMoney(calc.unitPrice)}</td>
                            <td className="px-3 py-2 bg-gray-50">{fmtMoney(calc.landed)}</td>
                            <td className="px-3 py-2 bg-gray-50">{fmtMoney(calc.selling)}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeRow(row.variant_id)}
                                className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"
                                aria-label="Remove item"
                              >
                                {/* A simple semantic cross icon or standard Text */}
                                <span className="text-base font-bold">&times;</span>
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

            <div className="px-6 py-3 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => savePricingRows(true)}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-60"
              >
                Create & Add New
              </button>
              <button
                onClick={() => savePricingRows(false)}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectProductsModalOpen ? (
        <ProductLookupModal
          open={selectProductsModalOpen}
          onClose={() => setSelectProductsModalOpen(false)}
          onAddSelected={applySelectedProducts}
          errorMessage={statusMessage}
          items={lookupPaginatedItems}
          loading={lookupLoading}
          filters={lookupFilters}
          onFiltersChange={(next) => {
            setLookupFilters(next);
            setLookupPage(1);
          }}
          categoryOptions={lookupCategoryOptions}
          page={lookupPage}
          totalPages={lookupTotalPages}
          itemsPerPage={lookupItemsPerPage}
          totalCount={lookupTotalCount}
          onPageChange={setLookupPage}
          isSelected={(item) => Boolean(selectedVariantMap[String(item.variant_id)])}
          onToggle={toggleVariantSelection}
          onToggleAll={(checked, pageItems) => toggleSelectAll(checked, pageItems)}
        />
      ) : null}
    </div>
  );
}

