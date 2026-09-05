"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  PlusIcon,
  LockClosedIcon,
  LockOpenIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import ProductLookupModal from "@/components/product/ProductLookupModal";
import { useProductLookup } from "@/hooks/useProductLookup";
import { usePagination } from "@/hooks/usePagination";
import { useConfirm } from "@/hooks/useConfirm";
import { useNotify } from "@/hooks/useNotify";
import type { ProductLookupItem } from "@/lib/product-lookup";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";

type Discount = {
  id?: string;
  name: string;
  description?: string;
  discount_type: "percentage" | "fixed";
  value: number;
  coupon_code?: string | null;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
  status?: "active" | "inactive" | string;
  created_at?: string;
  variant_count?: number;
  variants?: DiscountVariantRow[];
};

type DiscountVariantRow = {
  variant_id: number;
  product_name?: string | null;
  product_code?: string | null;
  sku?: string | null;
  barcode?: string | null;
};

const initialForm: Discount = {
  name: "",
  description: "",
  discount_type: "percentage",
  value: 0,
  coupon_code: "",
  priority: 1,
  starts_at: "",
  ends_at: "",
  is_active: true,
};

export default function DiscountSchemesPage() {
  const { company } = useTenant();
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
  const confirm = useConfirm();
  const notify = useNotify();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [form, setForm] = useState<Discount>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [duplicatedFromId, setDuplicatedFromId] = useState<string | null>(null);
  const [preloadedVariantInfo, setPreloadedVariantInfo] = useState<
    Record<
      string,
      {
        product_name?: string | null;
        product_code?: string | null;
        sku?: string | null;
        barcode?: string | null;
      }
    >
  >({});

  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [selectedVariantMap, setSelectedVariantMap] = useState<Record<string, boolean>>({});
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("");

  useEffect(() => {
    if (!company) return;
    fetchDiscounts();
  }, [company]);

  const fetchDiscounts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/discounts", {
        headers: { "x-tenant": company || "" },
      });
      const data = await res.json();
      if (data?.success) {
        setDiscounts(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load discounts", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredDiscounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return discounts;
    return discounts.filter((d) =>
      `${d.name} ${d.discount_type} ${d.value} ${d.coupon_code || ""} ${d.priority} ${d.status || ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [discounts, search]);

  const sortedDiscounts = useMemo(() => filteredDiscounts, [filteredDiscounts]);

  const {
    currentPage,
    itemsPerPage: rowsPerPage,
    setItemsPerPage: setRowsPerPage,
    totalItems,
    totalPages,
    pageNumbers,
    showingFrom,
    showingTo,
    paginatedData: paginatedDiscounts,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  } = usePagination({
    data: sortedDiscounts,
    initialItemsPerPage: 10,
    resetDeps: [search],
  });

  const allFilteredSelected =
    lookupPaginatedItems.length > 0 &&
    lookupPaginatedItems.every((row) => selectedVariantMap[String(row.variant_id)]);

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

  const lookupItemByVariantId = useMemo(() => {
    const map = new Map<string, ProductLookupItem>();
    lookupItems.forEach((item) => {
      map.set(String(item.variant_id), item);
    });
    return map;
  }, [lookupItems]);

  const selectedVariantRows = useMemo(() => {
    return selectedVariantIds.map((variantId) => {
      const key = String(variantId);
      const fromLookup = lookupItemByVariantId.get(key);
      const fromPreload = preloadedVariantInfo[key];
      return {
        variantId,
        product: fromLookup?.name || fromPreload?.product_name || "-",
        variant: fromLookup?.color || "-",
        sku: fromLookup?.sku || fromPreload?.sku || "-",
        barcode: fromLookup?.barcode || fromPreload?.barcode || "-",
      };
    });
  }, [selectedVariantIds, lookupItemByVariantId, preloadedVariantInfo]);

  const handleBarcodeSubmit = (value?: string) => {
    const barcode = String(value ?? barcodeValue).trim();
    if (!barcode) return;
    const match = lookupItems.find((item) => String(item.barcode || "") === barcode);
    if (!match) {
      setBarcodeMessage(`Barcode "${barcode}" not found.`);
      return;
    }
    setBarcodeMessage("");
    setSelectedVariantMap((prev) => ({ ...prev, [String(match.variant_id)]: true }));
    setBarcodeValue("");
  };

  const resetForm = () => {
    setForm(initialForm);
    setSelectedVariantMap({});
    setErrors({});
    setDuplicatedFromId(null);
    setPreloadedVariantInfo({});
    resetLookupFilters();
  };

  const openCreate = () => {
    setShowForm(true);
    resetForm();
  };

  const openEdit = async (discount: Discount) => {
    if (!discount.id) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/discounts/${discount.id}`, {
        headers: { "x-tenant": company || "" },
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Failed to load discount");
      }
      const row = data.data;
      setForm({
        id: row.id,
        name: row.name || "",
        description: row.description || "",
        discount_type: row.discount_type,
        value: Number(row.value || 0),
        coupon_code: row.coupon_code || "",
        priority: Number(row.priority || 1),
        starts_at: row.starts_at ? String(row.starts_at).slice(0, 10) : "",
        ends_at: row.ends_at ? String(row.ends_at).slice(0, 10) : "",
        is_active: Boolean(row.is_active),
      });
      setDuplicatedFromId(null);
      const map: Record<string, boolean> = {};
      (row.variant_ids || []).forEach((id: number) => {
        map[String(id)] = true;
      });
      setSelectedVariantMap(map);
      const preload: Record<
        string,
        {
          product_name?: string | null;
          product_code?: string | null;
          sku?: string | null;
          barcode?: string | null;
        }
      > = {};
      (row.variants || []).forEach((variant: DiscountVariantRow) => {
        preload[String(variant.variant_id)] = {
          product_name: variant.product_name || null,
          product_code: variant.product_code || null,
          sku: variant.sku || null,
          barcode: variant.barcode || null,
        };
      });
      setPreloadedVariantInfo(preload);
      setErrors({});
      setShowForm(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!showForm || !formRef.current) return;
    const cleanup = attachRuleValidationListeners(formRef.current, (fieldName, message) => {
      setErrors((prev) => {
        if (message) {
          return { ...prev, [fieldName]: message };
        }
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    });
    return cleanup;
  }, [showForm]);
  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Discount name is required";
    else {
      const codeMessage = getRuleValidationError("tax-value", form.name);
      if (codeMessage) next.name = codeMessage;
    }
    if (form.description) {
      const codeMessage = getRuleValidationError("tax-value", form.description);
      if (codeMessage) next.description = codeMessage;
    }
    if (!form.discount_type) next.discount_type = "Discount type is required";
    if (Number(form.value || 0) < 0) next.value = "Discount value must be >= 0";

    if (form.starts_at && form.ends_at && form.starts_at > form.ends_at) {
      next.ends_at = "End date must be after start date";
    }
    if (selectedVariantIds.length === 0) {
      next.variants = "Select at least one variant";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveDiscount = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload = {
        name: form.name,
        description: form.description,
        discount_type: form.discount_type,
        value: form.value,
        coupon_code: form.coupon_code || null,
        priority: form.priority,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        is_active: duplicatedFromId ? true : form.is_active,
        variant_ids: selectedVariantIds,
      };
      const isEdit = Boolean(form.id);
      if (isEdit) {
        const res = await fetch(`/api/discounts/${form.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-tenant": company || "",
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data?.success) throw new Error(data?.error || "Failed to save discount");
        notify("Discount updated successfully", { severity: "success" });
      } else if (duplicatedFromId) {
        const deactivateRes = await fetch(`/api/discounts/${duplicatedFromId}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-tenant": company || "",
          },
          body: JSON.stringify({ is_active: false }),
        });
        const deactivateData = await deactivateRes.json();
        if (!deactivateData?.success) {
          throw new Error(deactivateData?.error || "Failed to deactivate original discount");
        }

        const createRes = await fetch("/api/discounts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant": company || "",
          },
          body: JSON.stringify({ ...payload, is_active: true }),
        });
        const createData = await createRes.json();
        if (!createData?.success) {
          await fetch(`/api/discounts/${duplicatedFromId}/status`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-tenant": company || "",
            },
            body: JSON.stringify({ is_active: true }),
          });
          throw new Error(createData?.error || "Failed to create discount");
        }
        notify("Discount duplicated and replaced successfully", { severity: "success" });

      } else {
        const res = await fetch("/api/discounts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant": company || "",
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data?.success) throw new Error(data?.error || "Failed to save discount");
        notify("Discount created successfully", { severity: "success" });
      }
      await fetchDiscounts();
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      console.error(err);
      notify(err.message || "Failed to save discount", { severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (discount: Discount) => {
    if (!discount.id) return;
    try {
      const res = await fetch(`/api/discounts/${discount.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant": company || "",
        },
        body: JSON.stringify({ is_active: !discount.is_active }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Failed to update status");
      await fetchDiscounts();
    } catch (err) {
      console.error(err);
    }
  };

  const duplicateDiscount = async (discount: Discount) => {
    if (!discount.id) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/discounts/${discount.id}`, {
        headers: { "x-tenant": company || "" },
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Failed to load discount");

      const row = data.data;
      setForm({
        name: row.name || "",
        description: row.description || "",
        discount_type: row.discount_type,
        value: Number(row.value || 0),
        coupon_code: "",
        priority: Number(row.priority || 1),
        starts_at: row.starts_at ? String(row.starts_at).slice(0, 10) : "",
        ends_at: row.ends_at ? String(row.ends_at).slice(0, 10) : "",
        is_active: true,
      });
      const map: Record<string, boolean> = {};
      (row.variant_ids || []).forEach((id: number) => {
        map[String(id)] = true;
      });
      setSelectedVariantMap(map);
      const preload: Record<
        string,
        {
          product_name?: string | null;
          product_code?: string | null;
          sku?: string | null;
          barcode?: string | null;
        }
      > = {};
      (row.variants || []).forEach((variant: DiscountVariantRow) => {
        preload[String(variant.variant_id)] = {
          product_name: variant.product_name || null,
          product_code: variant.product_code || null,
          sku: variant.sku || null,
          barcode: variant.barcode || null,
        };
      });
      setPreloadedVariantInfo(preload);
      setDuplicatedFromId(String(discount.id));
      setErrors({});
      setShowForm(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const removeSelectedVariant = (variantId: number) => {
    setSelectedVariantMap((prev) => {
      const next = { ...prev };
      delete next[String(variantId)];
      return next;
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {saving &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Processing...</p>
            </div>
          </div>,
          document.body
        )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{showForm ? "Discount Scheme" : "Discount Schemes"}</h1>
          <p className="text-sm text-gray-500">Configure promotional discount rules and pricing schemes for your store.</p>
        </div>
        {!showForm && (
          <button
            onClick={openCreate}
            className="bg-[var(--color-blue-500)] flex items-center gap-2 text-white px-4 py-2 rounded-lg"
          >
            <PlusIcon className="w-4 h-4" />
            Add Discount
          </button>
        )}
      </div>

      {!showForm && (
        <>
          <div className="ui-table-card">
            <div className="ui-search-section">
              <div className="ui-search-wrapper">
                <input
                  type="text"
                  placeholder="Search discount..."
                  className="w-full pl-4 pr-4 py-2 border rounded-lg"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="ui-table-scroll">
              <table className="ui-table">
                <thead className="ui-table-head">
                  <tr className="ui-table-row">
                    <th className="ui-table-th">Name</th>
                    <th>Type</th>
                    <th>Value</th>
                    <th>Coupon</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr className="ui-table-row">
                      <td colSpan={9} className="ui-loading-row">
                        Loading...
                      </td>
                    </tr>
                  ) : paginatedDiscounts.length > 0 ? (
                    paginatedDiscounts.map((d) => (
                      <tr key={d.id} className="ui-table-row">
                        <td className="ui-table-th">{d.name}</td>
                        <td className="text-center capitalize">{d.discount_type}</td>
                        <td className="ui-table-td-center">{Number(d.value || 0).toFixed(2)}</td>
                        <td className="ui-table-td-center">{d.coupon_code || "-"}</td>
                        <td className="ui-table-td-center">{d.starts_at ? String(d.starts_at).slice(0, 10) : "-"}</td>
                        <td className="ui-table-td-center">{d.ends_at ? String(d.ends_at).slice(0, 10) : "-"}</td>
                        <td className="ui-table-td-center">{d.priority}</td>
                        <td className="ui-table-td-center">
                          <span
                            className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                              (d.status ?? (d.is_active ? "active" : "inactive")) === "active"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {((d.status ?? (d.is_active ? "active" : "inactive")) === "active"
                              ? "ACTIVE"
                              : "INACTIVE")}
                          </span>
                        </td>
                        <td className="ui-table-td-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEdit(d)} className="text-indigo-600" title="Edit">
                              <PencilSquareIcon className="w-5 h-5" />
                            </button>
                            <button onClick={() => toggleStatus(d)} className="text-indigo-600" title="Toggle Status" >
                              {d.is_active ? <LockOpenIcon className="w-5 h-5" /> : <LockClosedIcon className="w-5 h-5" />}
                            </button>
                            <button onClick={() => duplicateDiscount(d)} className="text-indigo-600" title="Duplicate">
                              <DocumentDuplicateIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="ui-loading-row">
                        No records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="ui-pagination-wrapper">
              <div className="flex flex-col gap-3 w-full">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="ui-pagination-info">
                    Showing <span className="font-medium">{showingFrom}</span> to{" "}
                    <span className="font-medium">{showingTo}</span> of{" "}
                    <span className="font-medium">{totalItems}</span> results
                  </p>
                  <div className="ui-table-actions">
                    <label htmlFor="discount-rows-per-page" className="text-sm text-gray-600">
                      Rows per page
                    </label>
                    <select
                      id="discount-rows-per-page"
                      value={rowsPerPage}
                      onChange={(e) => setRowsPerPage(Number(e.target.value))}
                      className="ui-pagination-select"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
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
                            onClick={() => goToPage(page)}
                            aria-current={currentPage === page ? "page" : undefined}
                            className={`ui-pagination-btn ${currentPage === page
                              ? "ui-pagination-btn-active" : "ui-pagination-btn-inactive"
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
          </div>
        </>
      )}

      {showForm && (
        <div className="bg-white p-8 rounded-2xl shadow border space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {form.id ? "Edit Discount" : "Create Discount"}
              </h2>
              {duplicatedFromId ? (
                <p className="text-xs text-gray-500 mt-1">
                  Revision mode: original discount will be deactivated only after final create.
                </p>
              ) : null}
            </div>
            {duplicatedFromId ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Duplicated Draft
              </span>
            ) : null}
          </div>

          <section className="rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Discount Details</h3>
            <div className="grid md:grid-cols-4 gap-5">
              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  data-rules="tax-value"
                  data-field="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border p-3 rounded"
                />
                {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}
              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">Description</label>
                <input
                  data-rules="tax-value"
                  data-field="description"
                  data-optional="true"
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border p-3 rounded"
                />
                {errors.description && <p className="text-red-500 text-sm">{errors.description}</p>}

              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Discount Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.discount_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      discount_type: e.target.value === "fixed" ? "fixed" : "percentage",
                    })
                  }
                  className="w-full border p-3 rounded"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
                {errors.discount_type && <p className="text-red-500 text-sm">{errors.discount_type}</p>}
              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={form.value === 0 ? "" : form.value}
                  onChange={(e) =>
                    setForm({ ...form, value: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                  className="w-full border p-3 rounded"
                  min="0"
                  step="0.01"
                />
                {errors.value && <p className="text-red-500 text-sm">{errors.value}</p>}
              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">Priority</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: Math.max(1, Number(e.target.value || 1)) })
                  }
                  className="w-full border p-3 rounded"
                  min="1"
                />
              </div>

              <div>
                <label className="text-sm font-semibold mb-1 block">Coupon Code</label>
                <input
                  value={form.coupon_code || ""}
                  onChange={(e) => setForm({ ...form, coupon_code: e.target.value })}
                  className="w-full border p-3 rounded"
                />
              </div>

              <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  Active
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Validity</h3>
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <label className="text-sm font-semibold mb-1 block">Start Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={form.starts_at || ""}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  className="w-full border p-3 rounded"
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">End Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={form.ends_at || ""}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  className="w-full border p-3 rounded"
                />
                {errors.ends_at && <p className="text-red-500 text-sm">{errors.ends_at}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                  Selected Variants
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedVariantIds.length} variant{selectedVariantIds.length === 1 ? "" : "s"} selected
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectModalOpen(true);
                  resetLookupFilters();
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                Select Variants
              </button>
            </div>

            <div className="bg-white rounded-xl shadow overflow-x-auto">
              <div className="max-h-[280px] overflow-y-auto">
                <table className="ui-table">
                  <thead className="bg-indigo-50 text-gray-600 text-sm sticky top-0 z-10">
                    <tr className="ui-table-row">
                      <th className="ui-table-th">Product</th>
                      <th className="ui-table-th">Variant</th>
                      <th className="ui-table-th">SKU</th>
                      <th className="ui-table-th">Barcode</th>
                      <th className="p-3 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVariantRows.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={5} className="p-6 text-center text-gray-500">
                          No variants selected.
                        </td>
                      </tr>
                    ) : (
                      selectedVariantRows.map((row) => (
                        <tr key={row.variantId} className="ui-table-row">
                          <td className="ui-table-td">{row.product}</td>
                          <td className="ui-table-td">{row.variant}</td>
                          <td className="ui-table-td">{row.sku}</td>
                          <td className="ui-table-td">{row.barcode}</td>
                          <td className="ui-table-td-center">
                            <button
                              type="button"
                              onClick={() => removeSelectedVariant(row.variantId)}
                              className="text-red-600 hover:text-red-800 inline-flex items-center justify-center"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {errors.variants && <p className="text-red-500 text-sm">{errors.variants}</p>}
          </section>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveDiscount}
              disabled={saving}
              className="bg-[var(--color-blue-500)] text-white px-6 py-2 rounded-lg disabled:opacity-50"
            >
              {form.id ? "Update Discount" : "Create Discount"}
            </button>
          </div>
        </div>
      )}

      {selectModalOpen ? (
        <ProductLookupModal
          open={selectModalOpen}
          onClose={() => setSelectModalOpen(false)}
          onAddSelected={() => setSelectModalOpen(false)}
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
          showBarcodeInput
          barcodeValue={barcodeValue}
          barcodeMessage={barcodeMessage}
          onBarcodeChange={(value) => {
            setBarcodeValue(value);
            setBarcodeMessage("");
          }}
          onBarcodeSubmit={handleBarcodeSubmit}
        />
      ) : null}
    </div>
  );
}







