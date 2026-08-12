"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { useConfirm } from "@/hooks/useConfirm";
import { useNotify } from "@/hooks/useNotify";
import { usePagination } from "@/hooks/usePagination";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";
type LocationOption = { id: number; name: string };

type Warehouse = {
  id?: number;
  code: string;
  name: string;
  location_id: string;
  location_name?: string;
  type: "global" | "local";
  effective_from: string;
  effective_to: string;
  description: string;
  landline: string;
  mobile_no: string;
  fax: string;
  email: string;
  contact_person_name: string;
  contact_person_mobile: string;
  contact_person_email: string;
  pan: string;
  gstin: string;
};

function getInitialForm(): Warehouse {
  return {
    code: "",
    name: "",
    location_id: "",
    type: "global",
    effective_from: "",
    effective_to: "",
    description: "",
    landline: "",
    mobile_no: "",
    fax: "",
    email: "",
    contact_person_name: "",
    contact_person_mobile: "",
    contact_person_email: "",
    pan: "",
    gstin: "",
  };
}

export default function WarehouseMasterPage() {
  const { company } = useTenant();
  const confirm = useConfirm();
  const notify = useNotify();
  const [items, setItems] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [form, setForm] = useState<Warehouse>(getInitialForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  const inputClass = (key: string) =>
    `w-full mt-2 border rounded-lg p-3 outline-none focus:ring-2 ${errors[key] ? "border-red-500 focus:ring-red-400" : "focus:ring-indigo-500"}`;

  async function loadLocations() {
    if (!company) return;
    const res = await apiFetch("/api/locations", company);
    const data = await res.json();
    setLocations(data.success ? data.data || [] : []);
  }

  async function loadData() {
    if (!company) return;
    try {
      setTableLoading(true);
      const res = await apiFetch("/api/warehouses", company);
      const data = await res.json();
      setItems(data.success ? data.data || [] : []);
    } finally {
      setTableLoading(false);
    }
  }

  useEffect(() => {
    void loadLocations();
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

    // location_id uses a plain <select> without data-rules — validate it separately.
    if (!form.location_id) next.location_id = "Location is required";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(mode: "close" | "add") {
    if (!company) return;
    if (!validate()) return;
    setFormLoading(true);
    try {
      const url = form.id ? `/api/warehouses/${form.id}` : "/api/warehouses";
      const method = form.id ? "PUT" : "POST";
      const res = await apiFetch(url, company, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          code: form.code.trim(),
          name: form.name.trim(),
          location_id: form.location_id,
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
      notify(error?.message || "Save failed", { severity: "warning" });
    } finally {
      setFormLoading(false);
    }
  }

  async function removeItem(id?: number) {
    if (!company || !id) return;
    const ok = await confirm("Delete this warehouse?", { type: "warning", title: "Delete Confirmation" });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/warehouses/${id}`, company, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Delete failed");
      await loadData();
      notify("Warehouse deleted");
    } catch (error: any) {
      notify(error.message || "Delete failed", { severity: "error" });
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((row) => `${row.code} ${row.name} ${row.location_name || ""}`.toLowerCase().includes(q));
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {formLoading &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Saving Warehouse...</p>
            </div>
          </div>,
          document.body
        )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{showForm ? "Warehouse Master" : "Warehouse List"}</h1>
          <p className="text-sm text-gray-500">Manage warehouses and stock storage facilities for your business.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setForm(getInitialForm());
              setErrors({});
              setShowForm(true);
            }}
            className="bg-[var(--color-blue-500)] flex items-center gap-2 text-white px-4 py-2 rounded-lg"
          >
            <PlusIcon className="w-4 h-4" />
            Add Warehouse
          </button>
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
                    <th className="ui-table-th">Code</th>
                    <th className="ui-table-th">Name</th>
                    <th className="ui-table-th">Location</th>
                    <th className="ui-table-th">Type</th>
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
                        <td className="ui-table-td">{row.code}</td>
                        <td>{row.name}</td>
                        <td>{row.location_name || "-"}</td>
                        <td>{row.type}</td>
                        <td className="ui-table-td-center">
                          <div className="ui-table-actions">
                            <button
                              onClick={() => {
                                setForm({
                                  ...getInitialForm(),
                                  ...row,
                                  location_id: row.location_id ? String(row.location_id) : "",
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
                  <label htmlFor="warehouse-rows-per-page" className="text-sm text-gray-600">
                    Rows per page
                  </label>
                  <select
                    id="warehouse-rows-per-page"
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
            <h2 className="text-lg font-semibold">{form.id ? "Update Warehouse" : "Create Warehouse"}</h2>

            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  data-rules="code"
                  data-field="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className={inputClass("code")}
                />
                {errors.code && <p className="text-red-500 text-sm mt-1">{errors.code}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  data-rules="alphanumeric-spaces-hyphens"
                  data-field="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass("name")}
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Location <span className="text-red-500">*</span>
                </label>
                <select
                  data-field="location_id"
                  value={form.location_id}
                  onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                  className={inputClass("location_id")}
                >
                  <option value="">Select Location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={String(loc.id)}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                {errors.location_id && <p className="text-red-500 text-sm mt-1">{errors.location_id}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  data-rules="enum-global-local"
                  data-field="type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as Warehouse["type"] })}
                  className={inputClass("type")}
                >
                  <option value="global">Global</option>
                  <option value="local">Local</option>
                </select>
                {errors.type && <p className="text-red-500 text-sm mt-1">{errors.type}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Effective From</label>
                <input
                  type="date"
                  data-field="effective_from"
                  data-rules="date"
                  data-optional="true"
                  value={form.effective_from || ''}
                  onChange={(e) => setForm({ ...form, effective_from: e.target.value ?? "" })}
                  className={inputClass("effective_from")}
                />
                {errors.effective_from && <p className="text-red-500 text-sm mt-1">{errors.effective_from}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Effective To</label>
                <input
                  type="date"
                  data-field="effective_to"
                  data-rules="date"
                  data-optional="true"
                  value={form.effective_to || ''}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setForm({ ...form, effective_to: e.target.value ?? "" })}
                  className={inputClass("effective_to")}
                />
                {errors.effective_to && <p className="text-red-500 text-sm mt-1">{errors.effective_to}</p>}
              </div>
              <div className="md:col-span-3">
                <label className="text-sm font-semibold mb-1 block">Description</label>
                <textarea
                  data-field="description"
                  data-rules="no-symbols"
                  data-optional="true"
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value ?? "" })}
                  className={inputClass("description")}
                  rows={3}
                />
                {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-700">Contact Info</h3>
              <div className="grid md:grid-cols-4 gap-6">
                <div>
                  <label className="text-sm font-semibold mb-1 block">Landline</label>
                  <input
                    data-field="landline"
                    data-rules="phone"
                    data-optional="true"
                    value={form.landline || ""}
                    onChange={(e) => setForm({ ...form, landline: e.target.value ?? "" })}
                    className={inputClass("landline")}
                  />
                  {errors.landline && <p className="text-red-500 text-sm mt-1">{errors.landline}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Mobile</label>
                  <input
                    data-field="mobile_no"
                    data-rules="phone"
                    data-optional="true"
                    value={form.mobile_no || ""}
                    onChange={(e) => setForm({ ...form, mobile_no: e.target.value ?? "" })}
                    className={inputClass("mobile_no")}
                  />
                  {errors.mobile_no && <p className="text-red-500 text-sm mt-1">{errors.mobile_no}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Fax</label>
                  <input
                    data-field="fax"
                    data-rules="fax-phone"
                    data-optional="true"
                    value={form.fax || ""}
                    onChange={(e) => setForm({ ...form, fax: e.target.value ?? "" })}
                    className={inputClass("fax")}
                  />
                  {errors.fax && <p className="text-red-500 text-sm mt-1">{errors.fax}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Email</label>
                  <input
                    data-rules="email"
                    data-field="email"
                    data-optional="true"
                    value={form.email || ""}
                    onChange={(e) => setForm({ ...form, email: e.target.value ?? "" })}
                    className={inputClass("email")}
                  />
                  {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-700">Contact Person</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className="text-sm font-semibold mb-1 block">Name</label>
                  <input
                    data-field="contact_person_name"
                    data-rules="alpha-name"
                    data-optional="true"
                    value={form.contact_person_name || ""}
                    onChange={(e) => setForm({ ...form, contact_person_name: e.target.value ?? "" })}
                    className={inputClass("contact_person_name")}
                  />
                  {errors.contact_person_name && <p className="text-red-500 text-sm mt-1">{errors.contact_person_name}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Mobile</label>
                  <input
                    data-field="contact_person_mobile"
                    data-rules="phone"
                    data-optional="true"
                    value={form.contact_person_mobile || ""}
                    onChange={(e) => setForm({ ...form, contact_person_mobile: e.target.value ?? "" })}
                    className={inputClass("contact_person_mobile")}
                  />
                  {errors.contact_person_mobile && <p className="text-red-500 text-sm mt-1">{errors.contact_person_mobile}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Email</label>
                  <input
                    data-rules="email"
                    data-field="contact_person_email"
                    data-optional="true"
                    value={form.contact_person_email || ""}
                    onChange={(e) => setForm({ ...form, contact_person_email: e.target.value ?? "" })}
                    className={inputClass("contact_person_email")}
                  />
                  {errors.contact_person_email && (
                    <p className="text-red-500 text-sm mt-1">{errors.contact_person_email}</p>
                  )}
                </div>
              </div>
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






