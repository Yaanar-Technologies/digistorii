'use client';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { useUser } from "@/context/CurrentUserContext";
import { COMPILER_NAMES } from 'next/dist/shared/lib/constants';
 
type Currency = {
    id: number;
    code: string;
    name: string;
    country: string;
    region: string;
    conversionRate: string;
    isEdited?: boolean;
};
 
export default function CurrencyRatePage() {
    const router = useRouter();
    const { company } = useTenant();
    const { user } = useUser();
    const [rows, setRows] = useState<Currency[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const itemsPerPage = 10;
 
    const hasLogged = useRef(false);
    useEffect(() => {
        if (!user?.name || hasLogged.current) return;
        hasLogged.current = true;
        console.log("User Name : ", user?.name);
    }, [user?.name]);
 
 
    const hasFetched = useRef(false);
    const loadData = async () => {
        if (!company) return;
 
        try {
            setLoading(true);
 
            const res = await fetch('/api/currency-rate', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tenant': company || ''
                }
            });
 
            const result = await res.json();
 
            if (result.success) {
                const formatted = result.data.map((r: any) => ({
                    ...r,
                    conversionRate: r.conversionRate?.toString() || ''
                }));
 
                setRows(formatted);
            } else {
                setRows([]);
            }
 
        } catch (err) {
            console.error("Fetch Error:", err);
            setRows([]);
        } finally {
            setLoading(false);
        }
    };
 
    useEffect(() => {
        if (!company || hasFetched.current) return;
 
        hasFetched.current = true;
        loadData();
 
    }, [company]);
 
    // Edit only rate
    const handleRateChange = (id: number, value: string) => {
        if (!/^\d*\.?\d*$/.test(value)) return;
 
        const updated = rows.map((row) =>
            row.id === id
                ? { ...row, conversionRate: value, isEdited: true }
                : row
        );
 
        setRows(updated);
    };
 
    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(''), 3000);
            return () => clearTimeout(timer);
        }
    }, [success]);
 
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(''), 3000);
            return () => clearTimeout(timer);
        }
    }, [error]);
 
    // Save (only valid rows)
    const handleSave = async () => {
        setError('');
        setSuccess('');
        const validRows = rows.filter(
            (r) =>
                r.isEdited &&
                r.conversionRate !== '' &&
                !isNaN(Number(r.conversionRate))
        );
 
 
        if (validRows.length === 0) {
            setError('Please enter at least one conversion rate');
            return;
        }
        try {
            setSaving(true);
            const payload = {
                user_name: user?.name || "",
                data: validRows.map(r => ({
                    code: r.code,
                    country: r.country,
                    region: r.region,
                    conversionRate: Number(r.conversionRate)
                }))
            };
 
            const res = await fetch('/api/currency-rate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tenant': company || ''
                },
                body: JSON.stringify(payload),
            });
 
            const result = await res.json();
            if (result.success) {
                setSuccess('Saved successfully');
                // router.push(`/${tenant}/masters/currency-rate`);
                // await loadData();
                // setRows(prev => prev.map(r => ({ ...r, isEdited: false })));
                await loadData();
                setSearch('');
                setCurrentPage(1);
            } else {
                setError(result.error || 'Save failed');
            }
        } catch (err) {
            setError('Something went wrong');
        } finally {
            setSaving(false);
        }
    };
 
    /* ================= SEARCH ================= */
    const filteredData = useMemo(() => {
        return rows.filter((r) =>
            `${r.code} ${r.name} ${r.country} ${r.region} ${r.conversionRate}`
                .toLowerCase()
                .includes(search.toLowerCase())
        );
    }, [rows, search]);
 
    /* ================= PAGINATION ================= */
    const paginatedData = filteredData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );
 
    const handleSort = (field: string) => {
        setSortOrder(sortField === field && sortOrder === 'asc' ? 'desc' : 'asc');
        setSortField(field);
    };
 
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {(loading || saving) &&
                createPortal(
                    <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
                        <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
 
                            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
 
                            {/* Dynamic message */}
                            <p className="text-gray-700 font-semibold text-lg">
                                {saving
                                    ? "Saving Currency conversion rate..."
                                    : "Loading Currency conversion rate..."}
                            </p>
 
                        </div>
                    </div>,
                    document.body
                )
            }
 
            <div className="flex justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Currency - Conversion Rate</h1>
                    <p className="text-sm text-gray-500">Maintain exchange rates and conversion factors for multi-currency transactions.</p>
                </div>
                {error && (
                    <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm font-medium">
                        {error}
                    </div>
                )}
 
                {success && (
                    <div className="bg-green-50 text-green-600 px-3 py-2 rounded-lg text-sm font-medium">
                        {success}
                    </div>
                )}
                <div className="flex items-center gap-3">
                  <Link className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" href={`/${company}/workspace/administration/masters`}>
                    <ArrowLeftIcon className="w-4 h-4 text-gray-500"/>
                    Back to Masters
                  </Link>
                  <button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-[var(--color-blue-600)] flex items-center gap-2  text-white px-4 py-2 rounded-lg"
                  >
                      {saving ? "Saving..." : "Save"}
                  </button>
                </div>
            </div>
 
 
            <div className="ui-table-card">
            <div className="ui-search-section">
              <div className="ui-search-wrapper">
                <MagnifyingGlassIcon className="ui-search-icon" />
 
                <input
                    type="text"
                    placeholder="Search Currency Conerstion Rate..."
                    className="ui-input"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setCurrentPage(1);
                    }}
                />
            </div>
            </div>
 
                <div className="ui-table-scroll">
        <table className="ui-table">
 
                    <thead className="ui-table-head">
                        <tr className="ui-table-row">
 
                            {/* SORTABLE HEADERS */}
                            <th className="ui-table-th" onClick={() => handleSort('code')}>
                                Currency Code
                            </th>
 
                            <th className="ui-table-th" onClick={() => handleSort('name')}>
                                Currency
                            </th>
 
                            <th className="ui-table-th" onClick={() => handleSort('country')}>
                                Country
                            </th>
 
                            <th className="ui-table-th" onClick={() => handleSort('region')}>
                                Region
                            </th>
 
                            <th className="ui-table-td" onClick={() => handleSort('conversionRate')}>Conversion Rate</th>
                        </tr>
                    </thead>
 
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="ui-loading-row">
                                    Loading Currency...
                                </td>
                            </tr>
                        ) : paginatedData.length > 0 ? (
                            paginatedData.map((row, index) => {
                                const actualIndex =
                                    (currentPage - 1) * itemsPerPage + index;
 
                                return (
                                    <tr key={row.code} className="ui-table-row">
 
                                        <td className="ui-table-th">{row.code}</td>
                                        <td className='text-left'>{row.name}</td>
                                        <td className='text-left'>{row.country}</td>
                                        <td className='text-left'>{row.region}</td>
 
                                        <td className='"p-3 text-center'>
 
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                pattern="^\d*\.?\d*$"
                                                className="border rounded px-2 py-1 w-24 text-center"
                                                value={row.conversionRate || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
 
                                                    if (/^\d*\.?\d*$/.test(val)) {
                                                        handleRateChange(row.id, val);
                                                    }
                                                }}
                                            />
 
                                        </td>
 
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={5} className="ui-empty-row ui-table-td-center">
                                    No Currency found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

        {/* PAGINATION */}
                <div className="ui-pagination-wrapper">
 
                    <p className="ui-pagination-info">
                        Showing {(currentPage - 1) * itemsPerPage + 1}
                        -
                        {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} items
                    </p>
 
                    <div className="flex items-center gap-1">
 
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(c => c - 1)}
                            className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50 hover:bg-gray-100"
                        >
                            Prev
                        </button>
 
                        {Array.from({ length: Math.ceil(filteredData.length / itemsPerPage) }, (_, i) => (
                            <button
                                key={i + 1}
                                onClick={() => setCurrentPage(i + 1)}
                                className={`px-3 py-1 text-sm border rounded ${currentPage === i + 1
                                    ? "bg-[var(--color-blue-600)] text-white"
                                    : "bg-white hover:bg-gray-100"
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
 
                        <button
                            disabled={currentPage >= Math.ceil(filteredData.length / itemsPerPage)}
                            onClick={() => setCurrentPage(c => c + 1)}
                            className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50 hover:bg-gray-100"
                        >
                            Next
                        </button>
 
                    </div>
                </div>
 
            </div>
 
 
        </div>
    );
}







