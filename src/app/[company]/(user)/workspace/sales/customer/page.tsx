//C:\Users\yanna\digistorii-ECom\src\app\[company]\(user)\workspace\sales\customer\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, PencilSquareIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Country, State, City } from "country-state-city";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { usePagination } from "@/hooks/usePagination";
import { useNotify } from "@/hooks/useNotify";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";

type Address = {
  id?: number;
  customer_id?: number;
  address_line1: string;
  address_line2: string;
  address_line3: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
};

type Cust = {
  id?: number;
  cust_code: string;
  name: string;
  phone: string;
  email: string;
  address: Address;
  created_at?: string;
};

function getInitialCust(): Cust {
  return {
    cust_code: "",
    name: "",
    phone: "",
    email: "",
    address: {
      address_line1: "",
      address_line2: "",
      address_line3: "",
      city: "",
      state: "",
      pincode: "",
      country: "India",
      is_default: true,
    },
  };
}

function normalizeCust(row: any): Cust {
  return {
    id: Number(row?.id) || undefined,
    cust_code: String(row?.cust_code || ""),
    name: String(row?.name || ""),
    phone: String(row?.phone || ""),
    email: String(row?.email || ""),
    created_at: row?.created_at,
    address: {
      id: row?.address_id !== undefined ? Number(row.address_id) : undefined,
      customer_id: Number(row?.id) || undefined,
      address_line1: String(row?.address_line1 || ""),
      address_line2: String(row?.address_line2 || ""),
      address_line3: String(row?.address_line3 || ""),
      city: String(row?.city || ""),
      state: String(row?.state || ""),
      pincode: String(row?.pincode || ""),
      country: String(row?.country || ""),
      is_default: row?.is_default === true,
    },
  };
}

export default function CustPage() {
  const { company } = useTenant();
  const notify = useNotify();
  const [custs, setCusts] = useState<Cust[]>([]);
  const [cust, setCust] = useState<Cust>(getInitialCust());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formLoading, setFormLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!company) return;
    let active = true;
    const loadData = async () => {
      try {
        setTableLoading(true);
        const custRes = await apiFetch("/api/customers", company);
        const custData = await custRes.json();

        if (!active) return;
        setCusts(custData.success ? (custData.data || []).map(normalizeCust) : []);
      } catch {
        if (!active) return;
        setCusts([]);
      } finally {
        if (active) setTableLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [company]);

  const loadCusts = async () => {
    if (!company) return;
    const res = await apiFetch("/api/customers", company);
    const data = await res.json();
    setCusts(data.success ? (data.data || []).map(normalizeCust) : []);
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

  const saveCustomer = async (keepOpen = false) => {
    if (!validate()) return;
    setFormLoading(true);
    try {
      const payload = {
        cust_code: cust.cust_code,
        name: cust.name,
        phone: cust.phone,
        email: cust.email || null,
        address_line1: cust.address.address_line1,
        address_line2: cust.address.address_line2,
        address_line3: cust.address.address_line3,
        city: cust.address.city,
        state: cust.address.state,
        pincode: cust.address.pincode,
        country: cust.address.country,
        is_default: true,
      };

      const url = cust.id ? `/api/customers/${cust.id}` : "/api/customers";
      const method = cust.id ? "PUT" : "POST";
      const res = await apiFetch(url, company, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");

      await loadCusts();
      if (keepOpen) {
        setCust(getInitialCust());
        setErrors({});
      } else {
        setCust(getInitialCust());
        setShowForm(false);
      }
    } catch (err: any) {
      notify(err.message, { severity: "error" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveCustomer(false);
  };

  const handleSaveAndAddNext = async () => {
    await saveCustomer(true);
  };

  const inputClass = (field: string) =>
    `w-full mt-2 border rounded-lg p-3 outline-none focus:ring-2 ${errors[field] ? "border-red-500 focus:ring-red-400" : "focus:ring-indigo-500"}`;

  const filteredCusts = useMemo(
    () =>
      custs.filter((s) =>
        `${s.name} ${s.phone} ${s.email}`.toLowerCase().includes(search.toLowerCase())
      ),
    [custs, search]
  );

  const sortedCusts = useMemo(() => {
    if (!sortField) return filteredCusts;
    return [...filteredCusts].sort((a: any, b: any) => {
      const va = String(a[sortField] ?? "").toLowerCase();
      const vb = String(b[sortField] ?? "").toLowerCase();
      if (va < vb) return sortOrder === "asc" ? -1 : 1;
      if (va > vb) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredCusts, sortField, sortOrder]);

  const {
    currentPage,
    itemsPerPage,
    setItemsPerPage,
    totalItems,
    totalPages,
    pageNumbers,
    showingFrom,
    showingTo,
    paginatedData: paginatedCusts,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  } = usePagination({
    data: sortedCusts,
    initialItemsPerPage: 10,
    resetDeps: [search],
  });

  const countryOptions = useMemo(() => Country.getAllCountries(), []);
  const selectedCountry = countryOptions.find((c) => c.name === cust.address.country);
  const stateOptions = selectedCountry ? State.getStatesOfCountry(selectedCountry.isoCode) : [];
  const selectedState = stateOptions.find((s) => s.name === cust.address.state);
  const cityOptions =
    selectedCountry && selectedState
      ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
      : [];
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {formLoading && createPortal(<div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center"><div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div><p className="text-gray-700 font-semibold text-lg">{cust.id ? "Updating Customer..." : "Saving Customer..."}</p></div></div>, document.body)}
      {tableLoading && createPortal(<div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center"><div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div><p className="text-gray-700 font-semibold text-lg">Loading customers...</p></div></div>, document.body)}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{showForm ? "Customer Master" : "Customer List"}</h1>
          <p className="text-sm text-gray-500">Manage customer records, contact information, and billing profiles.</p>
        </div>
        {!showForm && <button onClick={() => { setCust(getInitialCust()); setErrors({}); setShowForm(true); }} className="bg-[var(--color-blue-500)] flex items-center gap-2 text-white px-4 py-2 rounded-lg"><PlusIcon className="w-4 h-4" />Add Customer</button>}
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
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="ui-table-scroll">
              <table className="ui-table">
                <thead className="ui-table-head">
                  <tr className="ui-table-row">
                    <th className="ui-table-th" onClick={() => setSortField("name")}>Name</th>
                    <th className="ui-table-th" onClick={() => setSortField("phone")}>Phone</th>
                    <th className="ui-table-th" onClick={() => setSortField("email")}>Email</th>
                    <th className="ui-table-th" onClick={() => setSortField("address")}>Address</th>
                    <th className="ui-table-th-center">Action</th>
                  </tr>
                </thead>
                <tbody >
                  {tableLoading ?
                    <tr>
                      <td colSpan={5} className="ui-loading-row">Loading data...</td>
                    </tr>
                    : paginatedCusts.length > 0 ? paginatedCusts.map((cus) =>
                      <tr key={cus.id} className="ui-table-row">
                        <td className="ui-table-td font-medium text-gray-700">{cus.name || "-"}</td>
                        <td className="ui-table-td">{cus.phone || "-"}</td>
                        <td className="ui-table-td">{cus.email || "-"}</td>
                        <td className="ui-table-td">
                          {cus.address.address_line1
                            ? `${cus.address.address_line1}${cus.address.city ? `, ${cus.address.city}` : ""}${cus.address.state ? `, ${cus.address.state}` : ""}`
                            : "-"}
                        </td>
                        <td className="ui-table-td-center">
                          <div className="ui-table-actions">
                            <button type="button" onClick={() => { setCust(cus); setShowForm(true); }} className="text-indigo-600"><PencilSquareIcon className="w-5 h-5" /></button>
                          </div>
                        </td>
                      </tr>
                    ) :
                      <tr>
                        <td colSpan={5} className="ui-empty-row ui-table-td-center">No records found.</td>
                      </tr>
                  }
                </tbody>
              </table>
            </div>
            <div className="ui-pagination-wrapper">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="ui-pagination-info">
                  Showing <span className="font-medium">{showingFrom}</span> to <span className="font-medium">{showingTo}</span> of <span className="font-medium">{totalItems}</span> results
                </p>
                <div className="ui-table-actions">
                  <label htmlFor="cust-items-per-page" className="text-sm text-gray-600">Rows per page</label>
                  <select
                    id="cust-items-per-page"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
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
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow space-y-6">
          <h2 className="text-lg font-semibold">{cust.id ? "Update Customer" : "Create Customer"}</h2>

          <div className="grid md:grid-cols-3 gap-6 mt-6">
            {/*<div>
              <label className="text-sm font-semibold mb-1 block">Customer Code <span className="text-red-500">*</span></label>
              <input
                data-field="cust_code"
                data-rules="code"
                value={cust.cust_code}
                onChange={(e) => setCust({ ...cust, cust_code: e.target.value })}
                className={inputClass("cust_code")}
              />
              {errors.cust_code && <p className="text-red-500 text-sm mt-1">{errors.cust_code}</p>}
            </div>*/}

            <div>
              <label className="text-sm font-semibold mb-1 block">Name <span className="text-red-500">*</span></label>
              <input
                data-field="name"
                data-rules="alpha-name"
                value={cust.name}
                onChange={(e) => setCust({ ...cust, name: e.target.value })}
                className={inputClass("name")}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Phone <span className="text-red-500">*</span></label>
              <input
                data-field="phone"
                data-rules="phone"
                value={cust.phone}
                onChange={(e) => setCust({ ...cust, phone: e.target.value })}
                className={inputClass("phone")}
              />
              {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Email</label>
              <input
                data-field="email"
                data-rules="email"
                data-optional="true"
                value={cust.email}
                onChange={(e) => setCust({ ...cust, email: e.target.value })}
                className={inputClass("email")}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Address Line 1</label>
              <input
                data-field="address_line1"
                data-rules="alphanumeric-spaces-hyphens"
                data-optional="true"
                value={cust.address.address_line1}
                onChange={(e) =>
                  setCust({
                    ...cust,
                    address: { ...cust.address, address_line1: e.target.value },
                  })
                }
                className={inputClass("address_line1")}
              />
              {errors.address_line1 && <p className="text-red-500 text-sm mt-1">{errors.address_line1}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Address Line 2</label>
              <input
                data-field="address_line2"
                data-rules="alphanumeric-spaces-hyphens"
                data-optional="true"
                value={cust.address.address_line2}
                onChange={(e) =>
                  setCust({
                    ...cust,
                    address: { ...cust.address, address_line2: e.target.value },
                  })
                }
                className={inputClass("address_line2")}
              />
              {errors.address_line2 && <p className="text-red-500 text-sm mt-1">{errors.address_line2}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Address Line 3</label>
              <input
                data-field="address_line3"
                data-rules="alphanumeric-spaces-hyphens"
                data-optional="true"
                value={cust.address.address_line3}
                onChange={(e) =>
                  setCust({
                    ...cust,
                    address: { ...cust.address, address_line3: e.target.value },
                  })
                }
                className={inputClass("address_line3")}
              />
              {errors.address_line3 && <p className="text-red-500 text-sm mt-1">{errors.address_line3}</p>}</div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Country</label>
              <select
                data-field="country"
                data-rules="india-only"
                data-optional="true"
                disabled
                value={cust.address.country}
                onChange={(e) =>
                  setCust({
                    ...cust,
                    address: { ...cust.address, country: e.target.value, state: "", city: "" },
                  })
                }
                className={inputClass("country")}
              >
                <option value="">Select Country</option>
                {countryOptions.map((country) => (
                  <option key={country.isoCode} value={country.name}>
                    {country.name}
                  </option>
                ))}
              </select>
              {errors.country && <p className="text-red-500 text-sm mt-1">{errors.country}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">State</label>
              <select
                data-field="state"
                data-rules="alpha-spaces-hyphens"
                data-optional="true"
                value={cust.address.state}
                onChange={(e) =>
                  setCust({
                    ...cust,
                    address: { ...cust.address, state: e.target.value, city: "" },
                  })
                }
                className={inputClass("state")}
              >
                <option value="">Select State</option>
                {stateOptions.map((state) => (
                  <option key={state.isoCode} value={state.name}>
                    {state.name}
                  </option>
                ))}
              </select>
              {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">City</label>
              <select
                data-field="city"
                data-rules="alpha-spaces-hyphens"
                data-optional="true"
                value={cust.address.city}
                onChange={(e) =>
                  setCust({
                    ...cust,
                    address: { ...cust.address, city: e.target.value },
                  })
                }
                className={inputClass("city")}
              >
                <option value="">Select City</option>
                {cityOptions.map((city) => (
                  <option
                    key={`${city.name}-${city.latitude}-${city.longitude}`}
                    value={city.name}
                  >
                    {city.name}
                  </option>
                ))}
              </select>
              {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Pincode</label>
              <input
                data-field="pincode"
                data-rules="pincode-6"
                data-optional="true"
                value={cust.address.pincode}
                onChange={(e) =>
                  setCust({
                    ...cust,
                    address: { ...cust.address, pincode: e.target.value },
                  })
                }
                className={inputClass("pincode")}
              />
              {errors.pincode && <p className="text-red-500 text-sm mt-1">{errors.pincode}</p>}
            </div>
          </div>

          <div className="ui-form-actions">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="ui-btn ui-btn-secondary ui-btn-responsive">
              Cancel</button>
            <div className="ui-btn-group">
              {!cust.id && (
                <button
                  type="button"
                  onClick={handleSaveAndAddNext}
                  className="ui-btn ui-btn-secondary ui-btn-responsive">
                  Create & add Another
                </button>
              )}
              <button
                className="bg-[var(--color-blue-500)] text-white px-6 py-2 rounded-lg">
                {cust.id ? "Update Customer" : "Create Customer"}
              </button></div>
          </div>
        </form>
      )}
    </div>
  );
}






