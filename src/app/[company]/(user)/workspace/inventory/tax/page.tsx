"use client";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { useEffect, useMemo, useState } from "react";
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    MagnifyingGlassIcon,
    PencilSquareIcon,
    PlusIcon,
    TrashIcon,
} from "@heroicons/react/24/outline";
import { createPortal } from "react-dom";
import { useTenant } from "@/context/TenantContext";
import { usePagination } from "@/hooks/usePagination";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";


type TaxComponent = {
    id?: number;
    component_name: string;
    component_percentage: number;
};

type TaxMaster = {
    id?: number;
    tax_name: string;
    total_percentage: number;
    effective_from: string;
    effective_to?: string;
    is_active: boolean;
    components: TaxComponent[];
};

export default function TaxMasterPage() {
    // const tenant =
    //     typeof window !== "undefined"
    //         ? localStorage.getItem("company") || ""
    //         : "";
    const { company } = useTenant();
    console.log("Company:", company);

    const initialState: TaxMaster = {
        tax_name: "",
        total_percentage: 0,
        effective_from: "",
        effective_to: "",
        is_active: true,
        components: [],
    };

    const [mounted, setMounted] = useState(false);
    const [taxList, setTaxList] = useState<TaxMaster[]>([]);
    const [form, setForm] = useState<TaxMaster>(initialState);
    const [savedTax, setSavedTax] = useState<TaxMaster | null>(null);
    const [step, setStep] = useState<"basic" | "components">("basic");
    const [showForm, setShowForm] = useState(false);
    const [search, setSearch] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [serverError, setServerError] = useState("");
    const [tableLoading, setTableLoading] = useState(false);
    const [savingLoading, setSavingLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (company) fetchTaxes();
    }, [company]);

    /* ================= FETCH ================= */
    const fetchTaxes = async () => {
        try {
            setTableLoading(true);
            const res = await fetch("/api/tax", {
                headers: { "x-tenant": company },
            });
            console.log("comapny name in taxes", company);
            const data = await res.json();
            if (data.success) setTaxList(data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setTableLoading(false);
        }
    };

    /* ================= EDIT ================= */
    const handleEdit = async (tax: TaxMaster) => {
        try {
            setSavingLoading(true);
            setServerError("");

            const res = await fetch(`/api/tax/${tax.id}`, {
                headers: { "x-tenant": company },
            });

            const data = await res.json();

            if (!data.success) {
                setServerError(data.error || "Failed to load tax");
                return;
            }

            const fullTax = {
                ...data.data,
                components: data.data.components || [],
            };

            setForm(fullTax);
            setSavedTax(fullTax);
            setShowForm(true);
            // setTimeout(() => setStep("components"), 0);
            setStep("basic");
        } catch {
            setServerError("Something went wrong");
        } finally {
            setSavingLoading(false);
        }
    };

    useEffect(() => {
        if (!showForm) return;
        const form = document.querySelector("form");
        if (form) {
            return attachRuleValidationListeners(form, (fieldName, message) => {
                setErrors((prev) => ({
                    ...prev,
                    [fieldName]: message || "",
                }));
            });
        }
    }, [showForm]);


    const validate = () => {
        const next: Record<string, string> = {};

        // 1. Target your form layout dynamically
        const formElement = document.querySelector("form");
        if (!formElement) return true;

        // 2. Query all element fields holding active rule attributes
        const fields = formElement.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            "[data-rules]"
        );

        fields.forEach((target) => {
            const fieldName = target.getAttribute("data-field") || target.getAttribute("id") || "";
            if (!fieldName) return;

            // Support space-separated rules chains (e.g., data-rules="phone min-10-chars")
            const rules = target.getAttribute("data-rules") || "";
            const value = target.value || "";
            const isOptional = target.getAttribute("data-optional") === "true";

            // Validate Empty State Requirements
            if (!value.trim()) {
                if (!isOptional) {
                    next[fieldName] = `${fieldName.replace("_", " ").toUpperCase()} is required`;
                }
            } else {
                // Validate Custom Definitions
                const error = getRuleValidationError(rules, value);
                if (error) {
                    next[fieldName] = error;
                }
            }
        });

        setErrors(next);
        return Object.keys(next).length === 0;
    };

    /* ================= BASIC VALIDATION ================= */
    // const validateBasic = () => {
    //     const newErrors: any = {};

    //     if (!form.tax_name.trim())
    //         newErrors.tax_name = "Tax Name is required";

    //     if (!form.total_percentage || form.total_percentage <= 0)
    //         newErrors.total_percentage = "Enter valid Total %";

    //     if (!form.effective_from)
    //         newErrors.effective_from = "Effective From is required";

    //     setErrors(newErrors);
    //     return Object.keys(newErrors).length === 0;
    // };

    // const formatDate = (date: string | Date | null) => {
    //     if (!date) return "";
    //     const d = new Date(date);
    //     const year = d.getFullYear();
    //     const month = (d.getMonth() + 1).toString().padStart(2, "0");
    //     const day = d.getDate().toString().padStart(2, "0");
    //     return `${year}-${month}-${day}`;
    // };
    const formatDate = (date: string) => {
        if (!date) return "";
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();

        return `${day}-${month}-${year}`;
    };
    /* ================= SAVE BASIC ================= */
    const handleSaveBasic = async (e: any) => {
        e.preventDefault();
        if (!validate()) return;

        try {
            setSavingLoading(true);
            setServerError("");

            console.log("form : ", form);

            const method = form.id ? "PUT" : "POST";
            const url = form.id ? `/api/tax/${form.id}` : "/api/tax";

            const res = await fetch(url, {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    "x-tenant": company,
                },
                body: JSON.stringify(form),
            });

            const data = await res.json();

            if (!data.success) {
                setServerError(data.error || "Failed to save");
                return;
            }

            // setSavedTax({
            //     ...data.data,
            //     components: [],
            // });
            const updatedTax = {
                ...data.data,
                effective_from: formatDate(data.data.effective_from),
                effective_to: formatDate(data.data.effective_to),
                components: savedTax?.components || form.components || [],
            };

            setSavedTax(updatedTax);

            setTaxList((prev) => {
                const exists = prev.find((t) => t.id === updatedTax.id);
                if (exists) {
                    return prev.map((t) => (t.id === updatedTax.id ? updatedTax : t));
                } else {
                    return [updatedTax, ...prev];
                }
            });

            setStep("components");
        } catch {
            setServerError("Something went wrong");
        } finally {
            setSavingLoading(false);
        }
    };

    /* ================= COMPONENT VALIDATION ================= */
    const validateComponents = () => {
        if (!savedTax) return false;

        const newErrors: any = {};

        if (savedTax.components.length === 0)
            newErrors.components = "Add at least one component";

        savedTax.components.forEach((c, index) => {
            if (!c.component_name.trim())
                newErrors[`name_${index}`] = "Required";

            if (!c.component_percentage || c.component_percentage <= 0)
                newErrors[`percent_${index}`] = "Invalid %";
        });
        const componentTotal = savedTax.components.reduce(
            (sum, c) => sum + Number(c.component_percentage || 0),
            0
        );

        if (componentTotal.toFixed(2) !== Number(savedTax.total_percentage).toFixed(2)) {

            newErrors.components = `Component total (${componentTotal.toFixed(2)}) must equal master total (${Number(savedTax.total_percentage).toFixed(2)})`;
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    /* ================= SAVE COMPONENTS ================= */
    const handleSaveComponents = async () => {
        if (!validateComponents()) return;

        try {
            setSavingLoading(true);
            setServerError("");

            const res = await fetch(
                `/api/tax/${savedTax?.id}/components`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-tenant": company,
                    },
                    body: JSON.stringify(savedTax?.components),
                }
            );

            const data = await res.json();

            if (!data.success) {
                setServerError(data.error || "Failed to save components");
                return;
            }

            await fetchTaxes();
            setShowForm(false);
            setStep("basic");
            setForm(initialState);
            setSavedTax(null);
        } catch {
            setServerError("Something went wrong");
        } finally {
            setSavingLoading(false);
        }
    };

    const addComponent = () => {
        if (!savedTax) return;
        setSavedTax({
            ...savedTax,
            components: [
                ...savedTax.components,
                { component_name: "", component_percentage: 0 },
            ],
        });
    };

    const removeComponent = (index: number) => {
        if (!savedTax) return;
        const updated = [...savedTax.components];
        updated.splice(index, 1);
        setSavedTax({ ...savedTax, components: updated });
    };

    const filteredTaxes = useMemo(() => {
        return taxList.filter((t) =>
            `${t.tax_name} ${t.total_percentage} ${t.effective_from} ${t.is_active ? "active" : "inactive"}`
                .toLowerCase()
                .includes(search.toLowerCase())
        );
    }, [taxList, search]);

    const sortedTaxes = useMemo(() => filteredTaxes, [filteredTaxes]);

    const {
        currentPage,
        itemsPerPage: rowsPerPage,
        setItemsPerPage: setRowsPerPage,
        totalItems,
        totalPages,
        pageNumbers,
        showingFrom,
        showingTo,
        paginatedData: paginatedTaxes,
        goToPage,
        goToPreviousPage,
        goToNextPage,
    } = usePagination({
        data: sortedTaxes,
        initialItemsPerPage: 10,
        resetDeps: [search],
    });

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">

            {/* LOADING OVERLAY */}
            {mounted && savingLoading &&
                createPortal(
                    <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-700 font-semibold text-lg">
                                Processing...
                            </p>
                        </div>
                    </div>,
                    document.body
                )}

            {tableLoading &&
                createPortal(
                    <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-700 font-semibold text-lg">Loading taxes...</p>
                        </div>
                    </div>,
                    document.body
                )
            }

            {serverError && (
                <div className="text-red-600 font-medium">
                    {serverError}
                </div>
            )}

            {/* HEADER */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">
                        {showForm ? "Tax Master" : "Tax Master List"}
                    </h1>
                    <p className="text-sm text-gray-500">Configure tax rates, HSN codes, and tax categories for your products.</p>
                </div>

                {!showForm && (
                    <div className="flex items-center gap-3">
          <Link className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" href={`/${company}/workspace/administration/masters`}>
            <ArrowLeftIcon className="w-4 h-4 text-gray-500"/>
            Back to Masters
          </Link>
          <button
                        onClick={() => {
                            setShowForm(true);
                            setForm(initialState);
                            setStep("basic");
                            setErrors({});
                            setServerError("");
                        }}
                        className="bg-[var(--color-blue-500)] flex items-center gap-2 text-white px-4 py-2 rounded-lg"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add Tax
                    </button>
                </div>
        )}
            </div>

            {/* LIST */}
            {!showForm && (
                <>
                    <div className="ui-table-card">
                        <div className="ui-search-section">
                            <div className="ui-search-wrapper">
                                <MagnifyingGlassIcon className="ui-search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search Tax..."
                                    className="ui-input"
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="ui-table-scroll">
                            <table className="ui-table">
                                <thead className="ui-table-head">
                                    <tr className="ui-table-row">
                                        <th className="ui-table-th">Tax Name</th>
                                        <th className="ui-table-th">Total %</th>
                                        <th className="ui-table-th">Effective From</th>
                                        <th className="ui-table-th">Status</th>
                                        <th className="ui-table-th-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableLoading ? (
                                        <tr className="ui-table-row">
                                            <td colSpan={5} className="ui-loading-row">
                                                Loading...
                                            </td>
                                        </tr>
                                    ) : paginatedTaxes.length > 0 ? (
                                        paginatedTaxes.map((tax) => (
                                            <tr key={tax.id} className="ui-table-row">
                                                <td className="ui-table-td">{tax.tax_name}</td>
                                                <td className="ui-table-td">{tax.total_percentage}%</td>
                                                <td className="ui-table-td">{formatDate(tax.effective_from)}</td>
                                                <td className="ui-table-td">
                                                    {/* {tax.is_active ? "Active" : "Inactive"} */}
                                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${tax.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {tax.is_active ? "ACTIVE" : "INACTIVE"}
                                                    </span>
                                                </td>
                                                <td className="ui-table-td-center">
                                                    <div className="ui-table-actions">
                                                        <button
                                                            onClick={() => { handleEdit(tax); setErrors({}); setShowForm(true); }}
                                                            className="text-indigo-600"
                                                        >
                                                            <PencilSquareIcon className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="ui-loading-row">
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
                                    <label htmlFor="tax-rows-per-page" className="text-sm text-gray-600">
                                        Rows per page
                                    </label>
                                    <select
                                        id="tax-rows-per-page"
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

            {/* BASIC FORM */}
            {showForm && step === "basic" && (
                <form
                    onSubmit={handleSaveBasic}
                    className="bg-white p-8 rounded-2xl shadow border space-y-6"
                >
                    <div className="grid md:grid-cols-2 gap-6">

                        <div>
                            <label className="text-sm font-semibold mb-1 block">
                                Tax Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                data-field="tax_name"
                                data-rules="tax-value"
                                value={form.tax_name}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setForm({ ...form, tax_name: value });
                                    if (value) {
                                        setErrors((prev: any) => ({
                                            ...prev,
                                            tax_name: "",
                                        }));
                                    }
                                }}
                                className="w-full border p-3 rounded"
                            />
                            {errors.tax_name && (
                                <p className="text-red-500 text-sm">{errors.tax_name}</p>
                            )}
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-1 block">
                                Total % <span className="text-red-500">*</span>
                            </label>
                            <input
                                data-field="total_percentage"
                                data-rules="decimal-number"
                                type="number"
                                value={form.total_percentage === 0 ? "" : form.total_percentage}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setForm({
                                        ...form,
                                        total_percentage: value === "" ? 0 : parseFloat(value),
                                    });
                                    if (value) {
                                        setErrors((prev: any) => ({
                                            ...prev,
                                            total_percentage: "",
                                        }));
                                    }
                                }}

                                className="w-full border p-3 rounded"
                                min="0"
                                step="0.01"
                            />
                            {errors.total_percentage && (
                                <p className="text-red-500 text-sm">{errors.total_percentage}</p>
                            )}
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-1 block">
                                Effective From <span className="text-red-500">*</span>
                            </label>
                            <input
                                data-field="effective_from"
                                data-rules="date"
                                type="date"
                                value={form.effective_from}
                                min={new Date().toISOString().split("T")[0]}   // prevent past date
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setForm({ ...form, effective_from: value })
                                    setErrors((prev: any) => ({
                                        ...prev,
                                        effective_from: "",
                                    }));
                                }}
                                className="w-full border p-3 rounded"
                            />
                            {errors.effective_from && (
                                <p className="text-red-500 text-sm">{errors.effective_from}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(e) =>
                                    setForm({ ...form, is_active: e.target.checked })
                                }
                                className="w-4 h-4"
                            />
                            <label className="text-sm font-medium">Active</label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-4 border-t">
                        <button
                            type="button"
                            onClick={() => { setShowForm(false); setErrors({}); setForm(initialState); }}
                            className="ui-btn ui-btn-secondary ui-btn-responsive"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={savingLoading}
                            className="bg-[var(--color-blue-500)] text-white px-6 py-2 rounded-lg disabled:opacity-50"
                        >
                            {form.id ? "Update Tax" : "Save Tax"}
                        </button>
                    </div>
                </form>
            )}

            {/* COMPONENT FORM */}
            {showForm && step === "components" && savedTax && (
                <div className="bg-white p-8 rounded-2xl shadow border space-y-6">
                    <h2 className="text-xl font-semibold">
                        Components for {savedTax.tax_name}
                    </h2>

                    <table className="w-full border rounded-lg">
                        <tbody>
                            {savedTax.components.map((comp, index) => (
                                <tr key={index} className="border-t">
                                    <td className="ui-table-td">
                                        <input
                                            data-field="component_name"
                                            data-rules="tax-value"
                                            value={comp.component_name}
                                            onChange={(e) => {
                                                const updated = [...savedTax.components];
                                                updated[index].component_name = e.target.value;
                                                setSavedTax({ ...savedTax, components: updated });
                                            }}
                                            className="w-full border p-2 rounded"
                                        />
                                        {errors[`name_${index}`] && (
                                            <p className="text-red-500 text-sm">
                                                {errors[`name_${index}`]}
                                            </p>
                                        )}
                                    </td>

                                    <td className="ui-table-td">
                                        <input
                                            data-field="component_percentage"
                                            data-rules="decimal-number"
                                            type="number"
                                            value={comp.component_percentage === 0 ? "" : comp.component_percentage}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                const updated = [...savedTax.components];

                                                // updated[index].component_percentage =
                                                //     value === "" ? 0 : parseFloat(value);
                                                updated[index].component_percentage =
                                                    value === "" ? 0 : parseFloat(value);
                                                const componentTotal = updated.reduce(
                                                    (sum, c) => sum + Number(c.component_percentage || 0),
                                                    0
                                                );
                                                setSavedTax({ ...savedTax, components: updated });
                                                if (componentTotal.toFixed(2) === Number(savedTax.total_percentage).toFixed(2)) {
                                                    setErrors((prev: any) => ({
                                                        ...prev,
                                                        components: "",
                                                    }));
                                                } else {
                                                    setErrors((prev: any) => ({
                                                        ...prev,
                                                        components: `Component total (${componentTotal}) must equal master total (${savedTax.total_percentage})`,
                                                    }));
                                                }
                                            }}
                                            className="w-24 border p-2 rounded"
                                            min="0"
                                            step="0.01"
                                        />
                                        {errors[`percent_${index}`] && (
                                            <p className="text-red-500 text-sm">
                                                {errors[`percent_${index}`]}
                                            </p>
                                        )}
                                    </td>

                                    {/* <td className="ui-table-td-center">
                    <button
                      onClick={() => removeComponent(index)}
                      className="text-red-600"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </td> */}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {errors.components && (
                        <p className="text-red-500 text-sm">{errors.components}</p>
                    )}

                    <div className="flex justify-between items-center mt-6">
                        {/* LEFT SIDE */}
                        <button
                            onClick={addComponent}
                            className="text-indigo-600 font-medium"
                        >
                            + Add Component
                        </button>

                        {/* RIGHT SIDE */}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    setStep("basic");
                                    setSavedTax(null);
                                    setErrors({});
                                    setServerError("");
                                    setForm(initialState);
                                }}
                                className="px-4 py-2 border rounded-lg text-gray-600"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleSaveComponents}
                                disabled={savingLoading}
                                className="bg-[var(--color-blue-500)] text-white px-6 py-2 rounded-lg disabled:opacity-50"
                            >
                                Save Components
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}






