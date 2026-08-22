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
import { useConfirm } from "@/hooks/useConfirm";
import { useNotify } from "@/hooks/useNotify";
import { usePagination } from "@/hooks/usePagination";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";

type Uom = {
  id?: number;
  uom_code: string;
  uom_name: string;
};

function getInitialForm(): Uom {
  return { uom_code: "", uom_name: "" };
}

export default function UomMasterPage() {
  const { company } = useTenant();
  const confirm = useConfirm();
  const notify = useNotify();
  const [items, setItems] = useState<Uom[]>([]);
  const [form, setForm] = useState<Uom>(getInitialForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const inputClass = (key: string) =>
    `w-full mt-2 border rounded-lg p-3 outline-none focus:ring-2 ${errors[key] ? "border-red-500 focus:ring-red-400" : "focus:ring-indigo-500"}`;

  async function loadData() {
    if (!company) return;
    try {
      setTableLoading(true);
      const res = await apiFetch("/api/uom", company);
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
  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.uom_code.trim()) next.uom_code = "UOM Code is required";
    else {
      const codeMessage = getRuleValidationError("code", form.uom_code);
      if (codeMessage) next.uom_code = codeMessage;
    }
    if (!form.uom_name.trim()) next.uom_name = "UOM Name is required";
    else {
      const nameMessage = getRuleValidationError("no-symbols", form.uom_name);
      if (nameMessage) next.uom_name = nameMessage;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(mode: "close" | "add") {
    if (!company) return;
    if (!validate()) return;
    setFormLoading(true);
    try {
      const url = form.id ? `/api/uom/${form.id}` : "/api/uom";
      const method = form.id ? "PUT" : "POST";
      const res = await apiFetch(url, company, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uom_code: form.uom_code.trim(),
          uom_name: form.uom_name.trim(),
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
      notify(error.message || "Save failed", { severity: "error" });
    } finally {
      setFormLoading(false);
    }
  }

  async function removeItem(id?: number) {
    if (!company || !id) return;
    const ok = await confirm("Delete this UOM?", { type: "warning", title: "Delete Confirmation" });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/uom/${id}`, company, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Delete failed");
      await loadData();
      notify("UOM deleted successfully");
    } catch (error: any) {
      notify(error.message || "Delete failed", { severity: "error" });
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((row) => `${row.uom_code} ${row.uom_name}`.toLowerCase().includes(q));
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
              <p className="text-gray-700 font-semibold text-lg">Saving UOM...</p>
            </div>
          </div>,
          document.body
        )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{showForm ? "UOM Master" : "UOM List"}</h1>
          <p className="text-sm text-gray-500">Manage units of measurement for product inventory and billing.</p>
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
            Add UOM
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
                  //className="w-full pl-10 pr-4 py-2 border rounded-lg"
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
                    <th className="ui-table-th">UOM Code</th>
                    <th className="ui-table-th">UOM Name</th>
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
                  ) : paginatedData.length > 0 ? (
                    paginatedData.map((row) => (
                      <tr key={row.id} className="ui-table-row">
                        <td className="ui-table-td">{row.uom_code}</td>
                        <td>{row.uom_name}</td>
                        <td className="ui-table-td-center">
                          <div className="ui-table-actions">
                            <button
                              onClick={() => {
                                setForm({ id: row.id, uom_code: row.uom_code, uom_name: row.uom_name });
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
                  <label htmlFor="uom-rows-per-page" className="text-sm text-gray-600">
                    Rows per page
                  </label>
                  <select
                    id="uom-rows-per-page"
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
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            void submit("close");
          }}
          className="bg-white p-6 rounded-xl shadow space-y-6"
        >
          <h2 className="text-lg font-semibold">{form.id ? "Update UOM" : "Create UOM"}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-semibold mb-1 block">
                UOM Code <span className="text-red-500">*</span>
              </label>
              <input
                data-rules="code"
                data-field="uom_code"
                value={form.uom_code}
                onChange={(e) => setForm({ ...form, uom_code: e.target.value })}
                className={inputClass("uom_code")}
              />
              {errors.uom_code && <p className="text-red-500 text-sm mt-1">{errors.uom_code}</p>}
            </div>
            <div>
              <label className="text-sm font-semibold mb-1 block">
                UOM Name <span className="text-red-500">*</span>
              </label>
              <input
                data-rules="no-symbols"
                data-field="uom_name"
                value={form.uom_name}
                onChange={(e) => setForm({ ...form, uom_name: e.target.value })}
                className={inputClass("uom_name")}
              />
              {errors.uom_name && <p className="text-red-500 text-sm mt-1">{errors.uom_name}</p>}
            </div>
          </div>
          <div className="ui-form-actions">

            {/* Left side */}
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

            {/* Right side */}
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






