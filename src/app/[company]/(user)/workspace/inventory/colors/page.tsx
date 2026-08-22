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
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";
import { useConfirm } from "@/hooks/useConfirm";
import { useNotify } from "@/hooks/useNotify";
import { usePagination } from "@/hooks/usePagination";

type Color = {
  id?: number;
  color_name: string;
  hex_code: string;
};

function initialForm(): Color {
  return { color_name: "", hex_code: "#000000" };
}

export default function ColorMasterPage() {
  const { company } = useTenant();
  const confirm = useConfirm();
  const notify = useNotify();
  const [items, setItems] = useState<Color[]>([]);
  const [form, setForm] = useState<Color>(initialForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const inputClass = (key: string) =>
    `w-full mt-2 border rounded-lg p-3 outline-none focus:ring-2 ${errors[key] ? "border-red-500 focus:ring-red-400" : "focus:ring-indigo-500"
    }`;

  async function loadData() {
    if (!company) return;
    try {
      setTableLoading(true);
      const res = await apiFetch("/api/colors", company);
      const data = await res.json();
      setItems(data.success ? data.data || [] : []);
    } finally {
      setTableLoading(false);
    }
  }

  useEffect(() => {
    loadData();
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
    if (!form.color_name.trim()) next.color_name = "Color name is required";
    else {
      const nameMessage = getRuleValidationError("no-symbols", form.color_name);
      if (nameMessage) next.color_name = nameMessage;
    }
    if (!form.hex_code.trim()) next.hex_code = "Hex code is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(mode: "close" | "add") {
    if (!company) return;
    if (!validate()) return;
    setFormLoading(true);
    try {
      const url = form.id ? `/api/colors/${form.id}` : "/api/colors";
      const method = form.id ? "PUT" : "POST";
      const res = await apiFetch(url, company, {
        method,
        body: JSON.stringify({
          color_name: form.color_name.trim(),
          hex_code: form.hex_code.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");

      await loadData();
      if (mode === "add" && !form.id) {
        setForm(initialForm());
        setErrors({});
        return;
      }
      setShowForm(false);
      setForm(initialForm());
      setErrors({});
    } catch (error: any) {
      notify("Failed to save color" + (error.message ? `: ${error.message}` : ""), { severity: "error" });
    } finally {
      setFormLoading(false);
    }
  }

  async function removeItem(id?: number) {
    if (!company || !id) return;
    const ok = await confirm("Delete this color?", { type: "warning", title: "Delete Confirmation" });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/colors/${id}`, company, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Delete failed");
      await loadData();
      notify("Color deleted successfully", { severity: "success" });
    } catch (error: any) {
      notify("Failed to delete color" + (error.message ? `: ${error.message}` : ""), { severity: "error" });
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((row) => row.color_name.toLowerCase().includes(q));
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
    paginatedData: paged,
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
              <p className="text-gray-700 font-semibold text-lg">Saving Color...</p>
            </div>
          </div>,
          document.body
        )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{showForm ? "Color Master" : "Color List"}</h1>
          <p className="text-sm text-gray-500">Manage color attributes and options for your inventory items.</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-3">
          <Link className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" href={`/${company}/workspace/administration/masters`}>
            <ArrowLeftIcon className="w-4 h-4 text-gray-500"/>
            Back to Masters
          </Link>
          <button
            onClick={() => {
              setForm(initialForm());
              setErrors({});
              setShowForm(true);
            }}
            className="bg-[var(--color-blue-500)] flex items-center gap-2 text-white px-4 py-2 rounded-lg"
          >
            <PlusIcon className="w-4 h-4" />
            Add Color
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
                    <th className="ui-table-th">Color Name</th>
                    <th className="ui-table-th">Color Swatch</th>
                    <th className="ui-table-th-center">Action</th>
                  </tr>
                </thead>
                <tbody >
                  {tableLoading ? (
                    <tr>
                      <td colSpan={3} className="ui-loading-row">
                        Loading data...
                      </td>
                    </tr>
                  ) : paged.length > 0 ? (
                    paged.map((row) => (
                      <tr key={row.id} className="ui-table-row">
                        <td className="ui-table-td" >{row.color_name}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full border border-gray-300" style={{ backgroundColor: row.hex_code }}></div>
                            <span className="text-sm text-gray-500">{row.hex_code}</span>
                          </div>
                        </td>
                        <td className="ui-table-td-center">
                          <div className="ui-table-actions">
                            <button
                              onClick={() => {
                                setForm({
                                  id: row.id,
                                  color_name: row.color_name || "",
                                  hex_code: row.hex_code || "#000000",
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
                      <td colSpan={3} className="ui-empty-row ui-table-td-center">
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
                  <label htmlFor="color-rows-per-page" className="text-sm text-gray-600">
                    Rows per page
                  </label>
                  <select
                    id="color-rows-per-page"
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
        </>
      )}

      {showForm && (
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            void submit("close");
          }}
          className="bg-white p-6 rounded-xl shadow space-y-6"
        >
          <h2 className="text-lg font-semibold">{form.id ? "Update Color" : "Create Color"}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-semibold mb-1 block">
                Color Name <span className="text-red-500">*</span>
              </label>
              <input
                data-rules="no-symbols"
                data-field="color_name"
                value={form.color_name}
                onChange={(e) => setForm({ ...form, color_name: e.target.value })}
                className={inputClass("color_name")}
              />
              {errors.color_name && <p className="text-red-500 text-sm mt-1">{errors.color_name}</p>}
            </div>
            <div>
              <label className="text-sm font-semibold mb-1 block">
                Color Hex <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-4 mt-2">
                <input
                  type="color"
                  value={form.hex_code}
                  onChange={(e) => setForm({ ...form, hex_code: e.target.value })}
                  className="w-14 h-14 p-1 rounded cursor-pointer border border-gray-300"
                />
                <input
                  data-field="hex_code"
                  type="text"
                  value={form.hex_code.toUpperCase()}
                  readOnly
                  className="border rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 flex-1"
                />
              </div>
              {errors.hex_code && <p className="text-red-500 text-sm mt-1">{errors.hex_code}</p>}
            </div>
          </div>

          <div className="ui-form-actions">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(initialForm());
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
      )}
    </div>
  );
}
