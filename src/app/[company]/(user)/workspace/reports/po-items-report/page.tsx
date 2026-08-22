"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useTenant } from "@/context/TenantContext";
import { useCompanySettings } from "@/context/CompanySettingsContext";

type ReportRow = {
    purchase_no: string;
    purchase_date: string;
    supplier_code: string;
    supplier_name: string;
    product_code: string;
    product_name: string;
    uom: string;
    qty: number;
    uom_code: string;
    price: number;
    po_status: string;
    price_rank: number;
};
type Supplier = {
    id: number;
    supplier_code: string;
    name: string;
};
export default function POItemsSupplierReport() {

    const { company } = useTenant();
    const { settings } = useCompanySettings();

    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
    const [supplier, setSupplier] = useState("");
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [product, setProduct] = useState("");
    const [productSearch, setProductSearch] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);

    const [data, setData] = useState<ReportRow[]>([]);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const itemsPerPage = 10;

    const formatDate = (date: string) => {
        if (!date) return "";
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const hasSettingsFetched = useRef(false);
    useEffect(() => {
        if (!company || hasSettingsFetched.current) return;
        hasSettingsFetched.current = true;
        if (settings?.financialYearStart && settings?.financialYearEnd) {
            console.log("financialYearStart : ", settings?.financialYearStart);
            console.log("financialYearEnd : ", settings?.financialYearEnd);
            setFromDate(settings.financialYearStart);
            setToDate(settings.financialYearEnd);
        }
    }, [settings]);

    const hasFetchedSuppliers = useRef(false);
    useEffect(() => {
        const fetchSuppliers = async () => {
            if (!company || hasFetchedSuppliers.current) return;

            hasFetchedSuppliers.current = true;
            try {
                const res = await fetch("/api/suppliers", {
                    headers: {
                        "x-tenant": company
                    }
                });
                const data = await res.json();
                if (data.success) {
                    console.log("Fetched Suppliers:", data.data);
                    setAllSuppliers(data.data);
                }
            } catch (err) {
                console.error("Supplier fetch error", err);
            }
        };
        fetchSuppliers();
    }, [company]);

    const hasFetchedProducts = useRef(false);
    useEffect(() => {
        const fetchProducts = async () => {
            if (!company || hasFetchedProducts.current) return;

            hasFetchedProducts.current = true;
            try {
                const res = await fetch("/api/product-lookup?type=lookup", {
                    headers: {
                        "x-tenant": company
                    }
                });
                const data = await res.json();
                if (data.success) {
                    setAllProducts(data.data);
                }
            } catch (err) {
                console.error("Product fetch error", err);
            }
        };
        fetchProducts();
    }, [company]);

    const isFetchingReport = useRef(false);
    const loadReport = async () => {
        if (!company || isFetchingReport.current) return;
        setMessage("");
        setData([]);
        setCurrentPage(1);

        if (!fromDate || !toDate) {
            setMessage("From Date and To Date required");
            return;
        }
        if (new Date(fromDate) > new Date(toDate)) {
            setMessage("From Date cannot be greater than To Date");
            return;
        }
        try {
            isFetchingReport.current = true;
            setLoading(true);
            const res = await fetch(
                `/api/purchase/po-items-report?from=${fromDate}&to=${toDate}&supplier=${supplier || ""}&product=${product || ""}`,
                {
                    headers: { "x-tenant": company }
                }
            );
            const result = await res.json();
            if (!result.success) {
                setMessage(result.message || "Failed to load report");
                return;
            }
            if (result.data.length === 0) {
                setMessage("No data available");
                return;
            }
            setData(result.data);
        } catch {
            setMessage("Server error while loading report");
        } finally {
            setLoading(false);
            isFetchingReport.current = false;
        }
    };

    const totalPages = Math.ceil(data.length / itemsPerPage);

    const getPageNumbers = () => {
        const pages = [];

        const maxVisible = 5;

        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, currentPage + 2);

        if (currentPage <= 3) {
            start = 1;
            end = Math.min(totalPages, maxVisible);
        }

        if (currentPage > totalPages - 3) {
            start = Math.max(1, totalPages - maxVisible + 1);
            end = totalPages;
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        return { pages, start, end };
    };

    const { pages, start, end } = getPageNumbers();

    /* ================= SORT ================= */
    const handleSort = (field: string) => {
        setSortOrder(sortField === field && sortOrder === "asc" ? "desc" : "asc");
        setSortField(field);
        setCurrentPage(1);
    };

    const sortedData = useMemo(() => {
        if (!sortField) return data;
        return [...data].sort((a: any, b: any) => {
            let valA = a[sortField];
            let valB = b[sortField];
            // Handle supplier sort
            if (sortField === "supplier") {
                valA = `${a.supplier_code} ${a.supplier_name}`.toLowerCase();
                valB = `${b.supplier_code} ${b.supplier_name}`.toLowerCase();
            }
            if (valA < valB) return sortOrder === "asc" ? -1 : 1;
            if (valA > valB) return sortOrder === "asc" ? 1 : -1;
            return 0;
        });
    }, [data, sortField, sortOrder]);

    /* ================= PAGINATION ================= */
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        const end = currentPage * itemsPerPage;
        return sortedData.slice(start, end);
    }, [sortedData, currentPage]);

    const totalQty = data.reduce((sum, row) => sum + Number(row.qty), 0);
    const pageTotalQty = paginatedData.reduce((sum, row) => sum + Number(row.qty), 0);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* LOADING OVERLAY */}
            {loading &&
                createPortal(
                    <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-700 font-semibold text-lg">
                                Loading report...
                            </p>
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* HEADER */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">
                        Purchase Order Item Details (Supplier Wise)
                    </h1>
                    <p className="text-sm text-gray-500">Analyze line-item details and quantities for supplier purchase orders.</p>
                </div>

                {message && (
                    <div className="text-red-500 font-medium">
                        {message}
                    </div>
                )}
            </div>

            {/* FILTER */}

            <div className="bg-white p-6 rounded-xl shadow grid md:grid-cols-6 gap-4">
                <div>
                    <label className="text-sm font-medium block mb-1">From Date</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="border p-2 rounded w-full"
                    />
                </div>

                <div>
                    <label className="text-sm font-medium block mb-1">To Date</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="border p-2 rounded w-full"
                    />
                </div>

                <div>
                    <label className="text-sm font-medium block mb-1">Supplier ID</label>
                    <select
                        value={supplier}
                        onChange={(e) => {
                            setSupplier(e.target.value);
                        }}
                        className="border p-2 rounded w-full"
                    >
                        <option value="">Select Supplier</option>

                        {allSuppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.supplier_code}-{s.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="relative">
                    <label className="text-sm font-medium block mb-1">Product</label>
                    <input
                        type="text"
                        value={productSearch}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                        onChange={(e) => {
                            setProductSearch(e.target.value);
                            if (e.target.value === "") setProduct("");
                        }}
                        className="border p-2 rounded w-full"
                        placeholder="Type Name / SKU..."
                    />

                    {searchFocused && productSearch && allProducts.filter((p) =>
                        p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
                        p.product_code?.toLowerCase().includes(productSearch.toLowerCase()) ||
                        p.barcode?.toLowerCase().includes(productSearch.toLowerCase())
                    ).length > 0 && (
                            <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto border bg-white rounded-lg shadow-xl divide-y">
                                {allProducts.filter((p) =>
                                    p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
                                    p.product_code?.toLowerCase().includes(productSearch.toLowerCase()) ||
                                    p.barcode?.toLowerCase().includes(productSearch.toLowerCase())
                                ).map((item) => (
                                    <div
                                        key={item.id}
                                        onMouseDown={() => {
                                            setProduct(item.product_id);
                                            setProductSearch(item.name || item.product_code);
                                            setSearchFocused(false);
                                        }}
                                        className="p-3 hover:bg-indigo-50 cursor-pointer flex justify-between items-center text-sm"
                                    >
                                        <div>
                                            <span className="font-semibold block text-gray-800">{item.name}</span>
                                            <span className="text-xs text-gray-500 font-mono">
                                                SKU: {item.product_code}
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

                <div className="flex items-end gap-2 col-span-2">
                    <button
                        onClick={loadReport}
                        disabled={loading}
                        className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700"
                    >
                        {loading ? "Loading..." : "Search"}
                    </button>
                    {/* <button
                        onClick={() => {
                            setSortField("price");
                            setSortOrder("asc");
                        }}
                        className="bg-gray-100 text-gray-700 border px-5 py-2 rounded-lg hover:bg-gray-200"
                    >
                         Sort: Lowest Price First
                    </button> */}
                </div>
            </div>

            {/* TABLE */}
            {data.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-indigo-50 text-gray-600 text-sm">
                            <tr className="border-t hover:bg-blue-50 transition">
                                <th className="p-3 text-left cursor-pointer hover:bg-indigo-100" onClick={() => handleSort("purchase_no")}>PO No</th>
                                <th className="p-3 text-left cursor-pointer hover:bg-indigo-100" onClick={() => handleSort("purchase_date")}>PO Date</th>
                                <th className="p-3 text-left cursor-pointer hover:bg-indigo-100" onClick={() => handleSort("supplier")}>Supplier</th>
                                <th className="p-3 text-left cursor-pointer hover:bg-indigo-100" onClick={() => handleSort("product")}>Product</th>
                                <th className="p-3 text-left cursor-pointer hover:bg-indigo-100" onClick={() => handleSort("uom")}>UOM</th>
                                <th className="p-3 text-right cursor-pointer hover:bg-indigo-100" onClick={() => handleSort("qty")}>Qty</th>
                                <th className="p-3 text-right cursor-pointer hover:bg-indigo-100" onClick={() => handleSort("price")}>Price</th>
                                <th className="p-3 text-left cursor-pointer hover:bg-indigo-100" onClick={() => handleSort("po_status")}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((row, index) => (
                                <tr
                                    key={index}
                                    className="border-t hover:bg-blue-50 transition"
                                >
                                    <td className="p-3">{row.purchase_no}</td>
                                    <td>{formatDate(row.purchase_date)}</td>
                                    <td className="p-3">
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {row.supplier_name}
                                            </span>
                                            <span className="text-gray-500 text-sm">
                                                {row.supplier_code}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {row.product_name}
                                            </span>
                                            <span className="text-gray-500 text-sm">
                                                {row.product_code}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-3">{row.uom_code}</td>
                                    <td className="p-3 text-right">
                                        {Number(row.qty)}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <span>{row.price}</span>
                                            {/* {Number(row.price_rank) === 1 && row.price != null && (
                                                <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap">
                                                    Lowest
                                                </span>
                                            )} */}
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        {row.po_status}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* TOTAL & PAGINATION */}
                    <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                        <p className="text-sm text-gray-500">
                            Showing {(currentPage - 1) * itemsPerPage + 1}
                            -
                            {Math.min(currentPage * itemsPerPage, data.length)} of {data.length} items
                        </p>
                        <div className="flex gap-6 text-sm font-medium text-gray-700">
                            <div>
                                Page Qty: <span className="font-bold">{pageTotalQty}</span>
                            </div>

                            <div>
                                Total Qty: <span className="font-bold">{totalQty}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(c => c - 1)}
                                className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50 hover:bg-gray-100"
                            >
                                Prev
                            </button>

                            {/* First Page */}
                            {start > 1 && (
                                <>
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        className="px-3 py-1 border rounded"
                                    >
                                        1
                                    </button>
                                    {start > 2 && <span className="px-2">...</span>}
                                </>
                            )}

                            {/* Middle Pages */}
                            {pages.map((page) => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`px-3 py-1 border rounded ${currentPage === page
                                        ? "bg-[var(--color-blue-600)] text-white"
                                        : "bg-white text-gray-600 hover:bg-gray-100"
                                        }`}
                                >
                                    {page}
                                </button>
                            ))}

                            {/* Last Page */}
                            {end < totalPages && (
                                <>
                                    {end < totalPages - 1 && <span className="px-2">...</span>}
                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        className="px-3 py-1 border rounded"
                                    >
                                        {totalPages}
                                    </button>
                                </>
                            )}

                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(c => c + 1)}
                                className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50 hover:bg-gray-100"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );


}