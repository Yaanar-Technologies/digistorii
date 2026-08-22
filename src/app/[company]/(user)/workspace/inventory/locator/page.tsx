"use client";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon, InformationCircleIcon
} from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { useConfirm } from "@/hooks/useConfirm";
import { useNotify } from "@/hooks/useNotify";
import { usePagination } from "@/hooks/usePagination";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";
type WarehouseOption = { id: number; name: string };

type Locator = {
  id?: number;
  locator_name: string;
  row: string;
  rack: string;
  bin: string;
  effective_from: string;
  effective_to: string;
  warehouse_id: string;
  warehouse_name?: string;
  type: "receiving" | "main_storage" | "bulk_storage" | "despatch" | "return_area" | "scrap";
  max_qty: string;
  current_qty: string;
  suggested_qty: string;
  description: string;
};

const TYPE_OPTIONS: Locator["type"][] = [
  "receiving",
  "main_storage",
  "bulk_storage",
  "despatch",
  "return_area",
  "scrap",
];

function getInitialForm(): Locator {
  return {
    locator_name: "",
    row: "",
    rack: "",
    bin: "",
    effective_from: "",
    effective_to: "",
    warehouse_id: "",
    type: "receiving",
    max_qty: "",
    current_qty: "",
    suggested_qty: "",
    description: "",
  };
}

function buildLocatorName(row: string, rack: string, bin: string) {
  const r = row.trim();
  const k = rack.trim();
  const b = bin.trim();
  if (!r || !k || !b) return "";
  return `R${r}-RK${k}-B${b}`;
}

export default function LocatorMasterPage() {
  const { company } = useTenant();
  const confirm = useConfirm();
  const notify = useNotify();
  const [items, setItems] = useState<Locator[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [form, setForm] = useState<Locator>(getInitialForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  const inputClass = (key: string) =>
    `w-full mt-2 border rounded-lg p-3 outline-none focus:ring-2 ${errors[key] ? "border-red-500 focus:ring-red-400" : "focus:ring-indigo-500"}`;

  async function loadWarehouses() {
    if (!company) return;
    const res = await apiFetch("/api/warehouses", company);
    const data = await res.json();
    setWarehouses(data.success ? data.data || [] : []);
  }

  async function loadData() {
    if (!company) return;
    try {
      setTableLoading(true);
      const res = await apiFetch("/api/locators", company);
      const data = await res.json();
      setItems(data.success ? data.data || [] : []);
    } finally {
      setTableLoading(false);
    }
  }

  useEffect(() => {
    void loadWarehouses();
    void loadData();
  }, [company]);

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

    // Scan all fields with data-rules inside the form container (formRef.current),
    // so validation works regardless of tab visibility.
    const container = formRef.current;
    if (!container) return true;

    const fields = container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "[data-rules]"
    );

    fields.forEach((target) => {
      const fieldName = target.getAttribute("data-field") || target.getAttribute("id") || "";
      if (!fieldName) return;

      const rules = target.getAttribute("data-rules") || "";
      const value = target.value || "";
      const isOptional = target.getAttribute("data-optional") === "true";

      if (!value.trim()) {
        if (!isOptional) {
          next[fieldName] = `${fieldName.replace(/_/g, " ").toUpperCase()} is required`;
        }
      } else {
        const error = getRuleValidationError(rules, value);
        if (error) next[fieldName] = error;
      }
    });
    if (!form.type) next.type = "Type is required";
    if (!form.row) next.type = "Row is required";
    if (!form.rack) next.type = "Rack is required";
    if (!form.bin) next.type = "Bin is required";
    if (!form.warehouse_id) next.warehouse_id = "Warehouse is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(mode: "close" | "add") {
    if (!company) return;
    if (!validate()) return;
    setFormLoading(true);
    try {
      const url = form.id ? `/api/locators/${form.id}` : "/api/locators";
      const method = form.id ? "PUT" : "POST";
      const res = await apiFetch(url, company, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          row: form.row.trim(),
          rack: form.rack.trim(),
          bin: form.bin.trim(),
          locator_name: buildLocatorName(form.row, form.rack, form.bin),
          warehouse_id: form.warehouse_id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");

      await loadData();
      if (mode === "add" && !form.id) {
        setForm(getInitialForm());
        setErrors({});
        return;
      }
      setShowForm(false);
      setForm(getInitialForm());
      setErrors({});
    } catch (error: any) {
      notify("Failed to save locator" + (error.message ? `: ${error.message}` : ""), { severity: "error" });
    } finally {
      setFormLoading(false);
    }
  }

  async function removeItem(id?: number) {
    if (!company || !id) return;
    const ok = await confirm("Delete this locator?", { type: "warning", title: "Delete Confirmation" });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/locators/${id}`, company, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Delete failed");
      await loadData();
      notify("Locator deleted successfully");
    } catch (error: any) {
      notify("Failed to delete locator" + (error.message ? `: ${error.message}` : ""), { severity: "error" });
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((row) => `${row.locator_name} ${row.warehouse_name || ""} ${row.type}`.toLowerCase().includes(q));
  }, [items, search]);

  const sortedData = useMemo(() => filtered, [filtered]);

  const {
    currentPage,
    itemsPerPage: rowsPerPage,
    setItemsPerPage: setRowsPerPage,
    totalItems,
    totalPages,
    pageNumbers,
    showingFrom,
    showingTo,
    paginatedData,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  } = usePagination({
    data: sortedData,
    initialItemsPerPage: 10,
    resetDeps: [search],
  });

  const previewName = buildLocatorName(form.row, form.rack, form.bin) || "Auto-generated on save";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {formLoading &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Saving Locator...</p>
            </div>
          </div>,
          document.body
        )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{showForm ? "Locator Master" : "Locator List"}</h1>
          <p className="text-sm text-gray-500">Configure warehouse aisles, racks, and bin storage locations.</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-3">
          <Link className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" href={`/${company}/workspace/administration/masters`}>
            <ArrowLeftIcon className="w-4 h-4 text-gray-500"/>
            Back to Masters
          </Link>
          <button
            onClick={() => {
              setForm(getInitialForm());
              setErrors({});
              setShowForm(true);
            }}
            className="bg-[var(--color-blue-500)] flex items-center gap-2 text-white px-4 py-2 rounded-lg"
          >
            <PlusIcon className="w-4 h-4" />
            Add Locator
          </button>
        </div>
        )}
      </div>

      {!showForm && (
        <>
          <div className="ui-table-card">
            <div className="ui-search-section">
              <div className="ui-search-wrapper">
                <MagnifyingGlassIcon className="ui-search-icon" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="ui-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="ui-table-scroll">
              <table className="ui-table">
                <thead className="ui-table-head">
                  <tr className="ui-table-row">
                    <th className="ui-table-th">Locator</th>
                    <th className="ui-table-th">Warehouse</th>
                    <th className="ui-table-th">Type</th>
                    <th className="ui-table-th">Current Qty</th>
                    <th className="ui-table-th-center">Action</th>
                  </tr>
                </thead>
                <tbody >
                  {tableLoading ? (
                    <tr>
                      <td colSpan={5} className="ui-loading-row">
                        Loading data...
                      </td>
                    </tr>
                  ) : paginatedData.length > 0 ? (
                    paginatedData.map((row) => (
                      <tr key={row.id} className="ui-table-row">
                        <td className="ui-table-td">{row.locator_name}</td>
                        <td className="ui-table-td">{row.warehouse_name || "-"}</td>
                        <td className="ui-table-td">{row.type}</td>
                        <td className="ui-table-td">{row.current_qty || "0"}</td>
                        <td className="ui-table-td-center">
                          <div className="ui-table-actions">
                            <button
                              onClick={() => {
                                setForm({
                                  ...getInitialForm(),
                                  ...row,
                                  warehouse_id: row.warehouse_id ? String(row.warehouse_id) : "",
                                  max_qty: row.max_qty ? String(row.max_qty) : "",
                                  current_qty: row.current_qty ? String(row.current_qty) : "",
                                  suggested_qty: row.suggested_qty ? String(row.suggested_qty) : "",
                                });
                                setErrors({});
                                setShowForm(true);
                              }}
                              className="text-indigo-600"
                            >
                              <PencilSquareIcon className="w-5 h-5" />
                            </button>
                            <button onClick={() => removeItem(row.id)} className="text-red-600">
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="ui-empty-row ui-table-td-center">
                        No records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="ui-pagination-wrapper">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="ui-pagination-info">
                  Showing <span className="font-medium">{showingFrom}</span> to{" "}
                  <span className="font-medium">{showingTo}</span> of{" "}
                  <span className="font-medium">{totalItems}</span> results
                </p>
                <div className="ui-table-actions">
                  <label htmlFor="locator-rows-per-page" className="text-sm text-gray-600">
                    Rows per page
                  </label>
                  <select
                    id="locator-rows-per-page"
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
        </>
      )}

      {showForm && (
        <div ref={formRef}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit("close");
            }}
            className="bg-white p-6 rounded-xl shadow space-y-6"
          >
            <h2 className="text-lg font-semibold">{form.id ? "Update Locator" : "Create Locator"}</h2>

            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <label className="text-sm font-semibold mb-1 flex items-center gap-2">
                  Locator Name

                  <div className="relative group">
                    <InformationCircleIcon className="w-4 h-4 text-gray-400 cursor-pointer" />

                    <div className="absolute left-6 top-1/2 -translate-y-1/2 hidden group-hover:block z-20 w-64 rounded-md bg-gray-900 text-white text-xs p-3 shadow-lg">
                      Enter values for <strong>Row</strong>, <strong>Rack</strong>, and{" "}
                      <strong>Bin</strong>. The <strong>Locator Name</strong> will be
                      generated automatically in the format:
                      <br />
                      <span className="text-blue-300 font-medium">R-RK-B</span>
                    </div>
                  </div>
                </label>

                <input
                  value={previewName}
                  readOnly
                  className="w-full mt-2 border rounded-lg p-3 bg-gray-100 text-gray-600"
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Row <span className="text-red-500">*</span>
                </label>
                <input
                  data-rules="no-symbols"
                  data-field="row"
                  value={form.row}
                  onChange={(e) => setForm({ ...form, row: e.target.value })}
                  className={inputClass("row")}
                />
                {errors.row && <p className="text-red-500 text-sm mt-1">{errors.row}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Rack <span className="text-red-500">*</span>
                </label>
                <input
                  data-rules="no-symbols"
                  data-field="rack"
                  value={form.rack}
                  onChange={(e) => setForm({ ...form, rack: e.target.value })}
                  className={inputClass("rack")}
                />
                {errors.rack && <p className="text-red-500 text-sm mt-1">{errors.rack}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Bin <span className="text-red-500">*</span>
                </label>
                <input
                  data-rules="no-symbols"
                  data-field="bin"
                  value={form.bin}
                  onChange={(e) => setForm({ ...form, bin: e.target.value })}
                  className={inputClass("bin")}
                />
                {errors.bin && <p className="text-red-500 text-sm mt-1">{errors.bin}</p>}
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
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  data-rules="enum-locator-type"
                  data-field="type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as Locator["type"] })}
                  className={inputClass("type")}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
                {errors.type && <p className="text-red-500 text-sm mt-1">{errors.type}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Effective From</label>
                <input
                  type="date"
                  value={form.effective_from || ""}
                  onChange={(e) => setForm({ ...form, effective_from: e.target.value ?? "" })}
                  className={inputClass("effective_from")}
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Effective To</label>
                <input
                  type="date"
                  data-optional="true"
                  value={form.effective_to || ""}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setForm({ ...form, effective_to: e.target.value ?? "" })}
                  className={inputClass("effective_to")}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-700">Quantity</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className="text-sm font-semibold mb-1 block">Max Qty</label>
                  <input
                    data-rules="positive-integer"
                    data-field="max_qty"
                    data-optional="true"
                    type="number"
                    value={form.max_qty}
                    onChange={(e) => setForm({ ...form, max_qty: e.target.value })}
                    className={inputClass("max_qty")}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Current Qty</label>
                  <input
                    data-rules="positive-integer"
                    data-field="current_qty"
                    data-optional="true"
                    type="number"
                    value={form.current_qty}
                    onChange={(e) => setForm({ ...form, current_qty: e.target.value })}
                    className={inputClass("current_qty")}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Suggested Qty</label>
                  <input
                    data-rules="positive-integer"
                    data-field="suggested_qty"
                    data-optional="true"
                    type="number"
                    value={form.suggested_qty}
                    onChange={(e) => setForm({ ...form, suggested_qty: e.target.value })}
                    className={inputClass("suggested_qty")}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-700">Description</h3>
              <textarea
                data-optional="true"
                data-rules="no-symbols"
                data-field="description"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value ?? "" })}
                className={inputClass("description")}
                rows={3}
              />
            </div>

            <div className="ui-form-actions">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(getInitialForm());
                  setErrors({});
                }}
                className="ui-btn ui-btn-secondary ui-btn-responsive"
              >
                Cancel
              </button>

              <div className="ui-btn-group">
                {!form.id && (
                  <button
                    type="button"
                    onClick={() => void submit("add")}
                    className="ui-btn ui-btn-secondary ui-btn-responsive"
                  >
                    Create & Add Another
                  </button>
                )}

                <button className="ui-btn ui-btn-primary ui-btn-responsive">
                  {form.id ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}






