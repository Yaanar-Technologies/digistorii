"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTenant } from "@/context/TenantContext";
import { useUser } from "@/context/CurrentUserContext";
import {
  BanknotesIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  BuildingStorefrontIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

// Date format helpers
function toDDMMYYYY(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
}

function toYYYYMMDD(dmyDate: string): string {
  if (!dmyDate) return "";
  const parts = dmyDate.split("-");
  if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dmyDate;
}

function formatCurrency(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency === "INR" ? "INR" : currency,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Salaries",
  "Packaging",
  "Marketing",
  "Logistics & Courier",
  "Maintenance",
  "Office Supplies",
  "Other Overhead",
];

const PAYMENT_MODES = ["Bank Transfer", "UPI", "Cash", "Cheque", "Credit Card"];

export default function FinancePage() {
  const { company } = useTenant();
  const { user } = useUser();

  const [activeTab, setActiveTab] = useState<"overview" | "revenue" | "expenses">("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Date filters in DD-MM-YYYY format for inputs
  const [fromDateInput, setFromDateInput] = useState("");
  const [toDateInput, setToDateInput] = useState("");
  const [activeRange, setActiveRange] = useState<{ from: string; to: string }>({ from: "", to: "" });

  // Overview Data
  const [overview, setOverview] = useState<any>(null);

  // Revenue List Data
  const [revenueItems, setRevenueItems] = useState<any[]>([]);
  const [revenueChannelFilter, setRevenueChannelFilter] = useState<"all" | "pos" | "ecom">("all");
  const [revenueLoading, setRevenueLoading] = useState(false);

  // Expenses List Data
  const [expenseItems, setExpenseItems] = useState<any[]>([]);
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<"all" | "cogs" | "manual">("all");
  const [expensesLoading, setExpensesLoading] = useState(false);

  // Add Expense inline form
  const [addForm, setAddForm] = useState({
    category: "Rent",
    title: "",
    amount: "",
    date: toDDMMYYYY(new Date().toISOString().split("T")[0]),
    payment_mode: "Bank Transfer",
    reference_no: "",
  });
  const [addingExpense, setAddingExpense] = useState(false);
  const [addSuccessMsg, setAddSuccessMsg] = useState("");

  // Settlements recording modal / inline form
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    channel: "razorpay",
    settlement_ref: "",
    amount: "",
    fees: "0",
    bank_reference: "",
    settled_at: toDDMMYYYY(new Date().toISOString().split("T")[0]),
    notes: "",
  });
  const [savingSettlement, setSavingSettlement] = useState(false);

  // 1. Fetch Overview & P&L
  const fetchOverview = useCallback(
    async (start?: string, end?: string) => {
      if (!company) return;
      setErrorMsg("");
      try {
        const params = new URLSearchParams();
        if (start) params.set("startDate", start);
        if (end) params.set("endDate", end);

        const res = await fetch(`/api/${encodeURIComponent(company)}/finance?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load finance data");
        }

        setOverview(json.data);
        setActiveRange(json.data.dateRange);
        setFromDateInput(json.data.dateRange.from);
        setToDateInput(json.data.dateRange.to);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to fetch finance overview");
      }
    },
    [company]
  );

  // 2. Fetch Revenue List
  const fetchRevenue = useCallback(
    async (channel = revenueChannelFilter, start = activeRange.from, end = activeRange.to) => {
      if (!company || !start || !end) return;
      setRevenueLoading(true);
      try {
        const params = new URLSearchParams({
          startDate: start,
          endDate: end,
          channel,
        });
        const res = await fetch(`/api/${encodeURIComponent(company)}/finance/revenue?${params.toString()}`);
        const json = await res.json();
        if (json.success) {
          setRevenueItems(json.data.items || []);
        }
      } catch (err) {
        console.error("Failed to load revenue list:", err);
      } finally {
        setRevenueLoading(false);
      }
    },
    [company, revenueChannelFilter, activeRange]
  );

  // 3. Fetch Expenses List
  const fetchExpenses = useCallback(
    async (type = expenseTypeFilter, start = activeRange.from, end = activeRange.to) => {
      if (!company || !start || !end) return;
      setExpensesLoading(true);
      try {
        const params = new URLSearchParams({
          startDate: start,
          endDate: end,
          type,
        });
        const res = await fetch(`/api/${encodeURIComponent(company)}/finance/expenses?${params.toString()}`);
        const json = await res.json();
        if (json.success) {
          setExpenseItems(json.data.items || []);
        }
      } catch (err) {
        console.error("Failed to load expenses list:", err);
      } finally {
        setExpensesLoading(false);
      }
    },
    [company, expenseTypeFilter, activeRange]
  );

  // Initial Load
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      await fetchOverview();
      if (mounted) setLoading(false);
    };
    init();
    return () => {
      mounted = false;
    };
  }, [fetchOverview]);

  // Tab switch loading
  useEffect(() => {
    if (!activeRange.from || !activeRange.to) return;
    if (activeTab === "revenue") {
      fetchRevenue(revenueChannelFilter, activeRange.from, activeRange.to);
    } else if (activeTab === "expenses") {
      fetchExpenses(expenseTypeFilter, activeRange.from, activeRange.to);
    }
  }, [activeTab, revenueChannelFilter, expenseTypeFilter, activeRange, fetchRevenue, fetchExpenses]);

  // Presets dates
  const { todayStr, firstDayOfMonth, lastDayOfMonth } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const startMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const lastD = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const endMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastD)}`;
    return { todayStr: today, firstDayOfMonth: startMonth, lastDayOfMonth: endMonth };
  }, []);

  // Apply custom date range
  const applyDateRange = async (isoStart: string, isoEnd: string) => {
    if (!isoStart || !isoEnd) return;
    setFromDateInput(isoStart);
    setToDateInput(isoEnd);

    setRefreshing(true);
    await fetchOverview(isoStart, isoEnd);
    if (activeTab === "revenue") {
      await fetchRevenue(revenueChannelFilter, isoStart, isoEnd);
    } else if (activeTab === "expenses") {
      await fetchExpenses(expenseTypeFilter, isoStart, isoEnd);
    }
    setRefreshing(false);
  };

  const handlePreset = (preset: "today" | "this_month") => {
    if (preset === "today") {
      applyDateRange(todayStr, todayStr);
    } else if (preset === "this_month") {
      applyDateRange(firstDayOfMonth, lastDayOfMonth);
    }
  };

  const handleApplyDateRange = async (e: React.FormEvent) => {
    e.preventDefault();
    const isoStart = toYYYYMMDD(fromDateInput);
    const isoEnd = toYYYYMMDD(toDateInput);
    await applyDateRange(isoStart, isoEnd);
  };

  // Add Manual Expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    const amountNum = parseFloat(addForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Please enter a valid amount greater than 0");
      return;
    }
    if (!addForm.title.trim()) {
      alert("Please enter an expense title/description");
      return;
    }

    setAddingExpense(true);
    setAddSuccessMsg("");
    try {
      const res = await fetch(`/api/${encodeURIComponent(company)}/finance/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: addForm.category,
          title: addForm.title.trim(),
          amount: amountNum,
          expense_date: toYYYYMMDD(addForm.date),
          payment_mode: addForm.payment_mode,
          reference_no: addForm.reference_no.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to add expense");
      }

      setAddForm({
        category: "Rent",
        title: "",
        amount: "",
        date: toDDMMYYYY(new Date().toISOString().split("T")[0]),
        payment_mode: "Bank Transfer",
        reference_no: "",
      });
      setAddSuccessMsg("Expense recorded successfully.");
      setTimeout(() => setAddSuccessMsg(""), 3000);

      // Refresh overview & expenses
      fetchExpenses(expenseTypeFilter, activeRange.from, activeRange.to);
      fetchOverview(activeRange.from, activeRange.to);
    } catch (err: any) {
      alert(err.message || "Failed to save expense");
    } finally {
      setAddingExpense(false);
    }
  };

  // Delete Manual Expense
  const handleDeleteExpense = async (id: number) => {
    if (!confirm("Are you sure you want to delete this expense record?")) return;
    try {
      const res = await fetch(`/api/${encodeURIComponent(company)}/finance/expenses?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        fetchExpenses(expenseTypeFilter, activeRange.from, activeRange.to);
        fetchOverview(activeRange.from, activeRange.to);
      } else {
        alert(json.error || "Failed to delete expense");
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete expense");
    }
  };

  // Record Settlement Payout
  const handleSaveSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    const amountNum = parseFloat(settlementForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Please enter a valid settlement amount");
      return;
    }

    setSavingSettlement(true);
    try {
      const res = await fetch(`/api/${encodeURIComponent(company)}/finance/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: settlementForm.channel,
          settlement_ref: settlementForm.settlement_ref.trim(),
          amount: amountNum,
          fees: parseFloat(settlementForm.fees) || 0,
          bank_reference: settlementForm.bank_reference.trim(),
          settled_at: toYYYYMMDD(settlementForm.settled_at),
          notes: settlementForm.notes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to record settlement");
      }

      setShowSettlementModal(false);
      setSettlementForm({
        channel: "razorpay",
        settlement_ref: "",
        amount: "",
        fees: "0",
        bank_reference: "",
        settled_at: toDDMMYYYY(new Date().toISOString().split("T")[0]),
        notes: "",
      });
      fetchOverview(activeRange.from, activeRange.to);
    } catch (err: any) {
      alert(err.message || "Failed to record settlement");
    } finally {
      setSavingSettlement(false);
    }
  };

  const isPos = Boolean(overview?.plan?.pos_access);
  const isEcom = Boolean(overview?.plan?.ecommerce_access);
  const currency = overview?.currency || "INR";
  const kpis = overview?.kpis || {};

  return (
    <div className="p-4 space-y-3.5 max-w-7xl mx-auto text-gray-800 dark:text-gray-100">
      {/* 1. Header & Navigation Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <BanknotesIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Finance</h1>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
              {isPos && isEcom
                ? "Unified (POS + E-Com)"
                : isPos
                  ? "In-Store POS"
                  : isEcom
                    ? "E-Commerce Only"
                    : "Active Plan"}
            </span>
            {overview?.yearType && (
              <span className="text-[11px] text-gray-500 uppercase tracking-wider font-mono">
                {overview.yearType === "calendar" ? "Calendar Year" : "Fiscal Year"}
              </span>
            )}
          </div>
        </div>

        {/* Dense Date Range Filter Form with Presets & Datepickers */}
        <form onSubmit={handleApplyDateRange} className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* Presets: Today, This Month */}
          <div className="flex items-center gap-1 mr-1">
            <button
              type="button"
              onClick={() => handlePreset("today")}
              disabled={refreshing}
              className={`px-2 py-1 text-[11px] font-medium rounded border transition ${
                toYYYYMMDD(fromDateInput) === todayStr && toYYYYMMDD(toDateInput) === todayStr
                  ? "bg-blue-50 dark:bg-blue-950/60 border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold"
                  : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handlePreset("this_month")}
              disabled={refreshing}
              className={`px-2 py-1 text-[11px] font-medium rounded border transition ${
                toYYYYMMDD(fromDateInput) === firstDayOfMonth && toYYYYMMDD(toDateInput) === lastDayOfMonth
                  ? "bg-blue-50 dark:bg-blue-950/60 border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold"
                  : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              This Month
            </button>
          </div>

          <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 px-2 py-1">
            <span className="text-gray-400 mr-1.5 text-[11px] font-medium">From:</span>
            <input
              type="date"
              value={toYYYYMMDD(fromDateInput)}
              onChange={(e) => setFromDateInput(e.target.value)}
              className="bg-transparent outline-none text-gray-800 dark:text-gray-200 text-xs cursor-pointer dark:[color-scheme:dark]"
            />
          </div>

          <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 px-2 py-1">
            <span className="text-gray-400 mr-1.5 text-[11px] font-medium">To:</span>
            <input
              type="date"
              value={toYYYYMMDD(toDateInput)}
              onChange={(e) => setToDateInput(e.target.value)}
              className="bg-transparent outline-none text-gray-800 dark:text-gray-200 text-xs cursor-pointer dark:[color-scheme:dark]"
            />
          </div>

          <button
            type="submit"
            disabled={refreshing}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium flex items-center gap-1 transition"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Apply
          </button>
        </form>
      </div>

      {/* Error notification if any */}
      {errorMsg && (
        <div className="p-2 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded">
          {errorMsg}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 text-xs font-medium">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-3 py-1.5 border-b-2 -mb-px transition ${activeTab === "overview"
            ? "border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
        >
          Overview & P&L
        </button>
        <button
          onClick={() => setActiveTab("revenue")}
          className={`px-3 py-1.5 border-b-2 -mb-px transition ${activeTab === "revenue"
            ? "border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
        >
          Revenue & Settlements
        </button>
        <button
          onClick={() => setActiveTab("expenses")}
          className={`px-3 py-1.5 border-b-2 -mb-px transition ${activeTab === "expenses"
            ? "border-blue-600 text-blue-600 dark:text-blue-400 font-semibold"
            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
        >
          Expenses (Purchases & Overheads)
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center items-center text-xs text-gray-500">
          <ArrowPathIcon className="w-5 h-5 animate-spin mr-2 text-blue-600" />
          Loading finance metrics...
        </div>
      ) : (
        <>
          {/* =========================================================
              TAB 1: OVERVIEW & PROFIT AND LOSS
              ========================================================= */}
          {activeTab === "overview" && (
            <div className="space-y-3.5">
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Total Realized Revenue */}
                <div className="p-2.5 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                  <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Total Sales Collected</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                    {formatCurrency(kpis.totalRevenue, currency)}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 flex items-center justify-between">
                    {isPos && isEcom ? (
                      <>
                        <span>POS: {formatCurrency(overview?.revenue?.pos?.net, currency)}</span>
                        <span>E-Com: {formatCurrency(overview?.revenue?.ecom?.realized, currency)}</span>
                      </>
                    ) : isPos ? (
                      <span>In-Store Realized</span>
                    ) : (
                      <span>Online Paid Realized</span>
                    )}
                  </div>
                </div>

                {/* Purchase Expenses (COGS) */}
                <div className="p-2.5 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                  <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    Stock Purchase Cost
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                    {formatCurrency(kpis.netPurchaseExpenses, currency)}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Completed GRN: {overview?.expenses?.cogs?.completedPoCount || 0} POs
                  </div>
                </div>

                {/* Operating Overheads */}
                <div className="p-2.5 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                  <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">	Other Business Expenses</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                    {formatCurrency(kpis.totalOverheads, currency)}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Store Expenses: {overview?.expenses?.overheads?.count || 0} entries
                  </div>
                </div>

                {/* Net Profit / Loss */}
                <div
                  className={`p-2.5 rounded border ${kpis.netProfit >= 0
                    ? "border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20"
                    : "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20"
                    }`}
                >
                  <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Net Profit / Loss</div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${kpis.netProfit >= 0 ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"
                      }`}
                  >
                    {formatCurrency(kpis.netProfit, currency)}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Net Margin: <span className="font-semibold">{kpis.netMarginPct}%</span>
                  </div>
                </div>
              </div>

              {/* Conditional Pending COD Receivables Alert / Card (Visible only when E-Com is active) */}
              {isEcom && kpis.pendingCodReceivables > 0 && (
                <div className="flex items-center justify-between p-2 rounded border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs">
                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="font-medium text-amber-900 dark:text-amber-200">
                      Pending COD Receivables:
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {kpis.pendingCodCount} orders awaiting delivery & payment confirmation. Not counted in realized revenue.
                    </span>
                  </div>
                  <span className="font-bold text-amber-800 dark:text-amber-300">
                    {formatCurrency(kpis.pendingCodReceivables, currency)}
                  </span>
                </div>
              )}

              {/* P&L Statement Breakdown Table */}
              <div className="rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                    Profit & Loss Statement
                  </h2>
                  <span className="text-[11px] text-gray-500 font-mono">
                    {toDDMMYYYY(activeRange.from)} to {toDDMMYYYY(activeRange.to)}
                  </span>
                </div>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 text-[11px] font-medium text-gray-500 bg-gray-50/50 dark:bg-gray-800/20">
                        <th className="py-1.5 px-3">Financial Line Item</th>
                        <th className="py-1.5 px-3">Notes / Channel</th>
                        <th className="py-1.5 px-3 text-right">Amount ({currency})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 font-mono">
                      {/* Revenue Section */}
                      <tr className="bg-gray-50/30 dark:bg-gray-800/10 font-sans">
                        <td colSpan={3} className="py-1.5 px-3 font-semibold text-gray-900 dark:text-white">
                          1. Sales & Collections
                        </td>
                      </tr>

                      {isPos && (
                        <>
                          <tr>
                            <td className="py-1.5 px-3 pl-6 font-sans text-gray-700 dark:text-gray-300">
                              POS Sales Collected
                            </td>
                            <td className="py-1.5 px-3 text-gray-500 font-sans">In-Store Walk-in Sales</td>
                            <td className="py-1.5 px-3 text-right font-medium">
                              {formatCurrency(overview?.revenue?.pos?.gross, currency)}
                            </td>
                          </tr>
                          {overview?.revenue?.pos?.returns > 0 && (
                            <tr>
                              <td className="py-1.5 px-3 pl-6 font-sans text-amber-700 dark:text-amber-400">
                                Less: POS Returns & Refunds
                              </td>
                              <td className="py-1.5 px-3 text-gray-500 font-sans">In-Store Returns</td>
                              <td className="py-1.5 px-3 text-right font-medium text-amber-700 dark:text-amber-400">
                                -{formatCurrency(overview?.revenue?.pos?.returns, currency)}
                              </td>
                            </tr>
                          )}
                        </>
                      )}

                      {isEcom && (
                        <tr>
                          <td className="py-1.5 px-3 pl-6 font-sans text-gray-700 dark:text-gray-300">
                            Online Sales Collected
                          </td>
                          <td className="py-1.5 px-3 text-gray-500 font-sans">Online Paid & Realized COD</td>
                          <td className="py-1.5 px-3 text-right font-medium">
                            {formatCurrency(overview?.revenue?.ecom?.realized, currency)}
                          </td>
                        </tr>
                      )}

                      <tr className="bg-blue-50/30 dark:bg-blue-950/20 font-semibold text-gray-900 dark:text-white border-t border-b border-gray-200 dark:border-gray-700">
                        <td className="py-2 px-3 pl-6 font-sans">Total Sales Collected (A)</td>
                        <td className="py-2 px-3 text-gray-500 font-sans">Realized Cash Inflow</td>
                        <td className="py-2 px-3 text-right text-blue-700 dark:text-blue-400">
                          {formatCurrency(kpis.totalRevenue, currency)}
                        </td>
                      </tr>

                      {/* COGS Section */}
                      <tr className="bg-gray-50/30 dark:bg-gray-800/10 font-sans">
                        <td colSpan={3} className="py-1.5 px-3 font-semibold text-gray-900 dark:text-white">
                          2. Stock Purchase Cost
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3 pl-6 font-sans text-gray-700 dark:text-gray-300">
                          Stock Received (Purchase Orders)
                        </td>
                        <td className="py-1.5 px-3 text-gray-500 font-sans">
                          {overview?.expenses?.cogs?.completedPoCount} POs (fully received)
                        </td>
                        <td className="py-1.5 px-3 text-right font-medium">
                          {formatCurrency(overview?.expenses?.cogs?.gross, currency)}
                        </td>
                      </tr>
                      {overview?.expenses?.cogs?.returns > 0 && (
                        <tr>
                          <td className="py-1.5 px-3 pl-6 font-sans text-blue-600 dark:text-blue-400">
                            Less: Purchase Returns & Supplier Credits
                          </td>
                          <td className="py-1.5 px-3 text-gray-500 font-sans">Returned to Supplier</td>
                          <td className="py-1.5 px-3 text-right font-medium text-blue-600 dark:text-blue-400">
                            -{formatCurrency(overview?.expenses?.cogs?.returns, currency)}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-gray-50/50 dark:bg-gray-800/30 font-semibold text-gray-800 dark:text-gray-200 border-t border-b border-gray-200 dark:border-gray-700">
                        <td className="py-1.5 px-3 pl-6 font-sans">Total Stock Purchase Cost (B)</td>
                        <td className="py-1.5 px-3 text-gray-500 font-sans">Inventory Acquisition</td>
                        <td className="py-1.5 px-3 text-right">
                          {formatCurrency(kpis.netPurchaseExpenses, currency)}
                        </td>
                      </tr>

                      {/* Gross Profit */}
                      <tr className="bg-gray-100/50 dark:bg-gray-800/60 font-semibold text-gray-900 dark:text-white border-b border-gray-300 dark:border-gray-700">
                        <td className="py-2 px-3 font-sans">Gross Profit</td>
                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400 font-sans">
                          Gross Margin: {kpis.grossMarginPct}%
                        </td>
                        <td className="py-2 px-3 text-right text-gray-900 dark:text-white">
                          {formatCurrency(kpis.grossProfit, currency)}
                        </td>
                      </tr>

                      {/* Operating Overheads Section */}
                      <tr className="bg-gray-50/30 dark:bg-gray-800/10 font-sans">
                        <td colSpan={3} className="py-1.5 px-3 font-semibold text-gray-900 dark:text-white">
                          3. Other Business Expenses
                        </td>
                      </tr>
                      {overview?.expenses?.overheads?.byCategory?.length > 0 ? (
                        overview.expenses.overheads.byCategory.map((cat: any) => (
                          <tr key={cat.category}>
                            <td className="py-1.5 px-3 pl-6 font-sans text-gray-700 dark:text-gray-300">
                              {cat.category}
                            </td>
                            <td className="py-1.5 px-3 text-gray-500 font-sans">{cat.count} recorded</td>
                            <td className="py-1.5 px-3 text-right font-medium">
                              {formatCurrency(cat.amount, currency)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-1.5 px-3 pl-6 text-gray-400 italic font-sans" colSpan={3}>
                            No manual store overheads recorded in this date range.
                          </td>
                        </tr>
                      )}
                      <tr className="bg-gray-50/50 dark:bg-gray-800/30 font-semibold text-gray-800 dark:text-gray-200 border-t border-b border-gray-200 dark:border-gray-700">
                        <td className="py-1.5 px-3 pl-6 font-sans">Total Other Expenses (C)</td>
                        <td className="py-1.5 px-3 text-gray-500 font-sans">Indirect Costs</td>
                        <td className="py-1.5 px-3 text-right">
                          {formatCurrency(kpis.totalOverheads, currency)}
                        </td>
                      </tr>

                      {/* Net Profit */}
                      <tr
                        className={`font-bold text-sm ${kpis.netProfit >= 0
                          ? "bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200"
                          : "bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                          }`}
                      >
                        <td className="py-2.5 px-3 font-sans">Net Profit / Loss</td>
                        <td className="py-2.5 px-3 text-xs font-sans">Net Margin: {kpis.netMarginPct}%</td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {formatCurrency(kpis.netProfit, currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Channel-Specific Cash Drawer / Settlements Breakdown Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* 1. POS Drawer & Modes (Visible only when POS enabled) */}
                {isPos && (
                  <div className="rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2 mb-2">
                      <BuildingStorefrontIcon className="w-4 h-4 text-blue-600" />
                      POS Payment Summary
                    </div>
                    {overview?.revenue?.pos?.modes?.length > 0 ? (
                      <div className="space-y-1.5 text-xs">
                        {overview.revenue.pos.modes.map((mode: any) => (
                          <div key={mode.mode_id} className="flex justify-between items-center py-0.5">
                            <span className="text-gray-600 dark:text-gray-400">{mode.mode_name}</span>
                            <span className="font-mono font-medium">{formatCurrency(mode.amount, currency)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic py-2">No POS payments recorded.</div>
                    )}
                  </div>
                )}

                {/* 2. E-Commerce Razorpay & COD Clearing (Visible only when E-Com enabled) */}
                {isEcom && (
                  <div className="rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-white">
                        <GlobeAltIcon className="w-4 h-4 text-blue-600" />
                        Online Payment & COD Settlements
                      </div>
                      <button
                        onClick={() => setShowSettlementModal(true)}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                      >
                        <PlusIcon className="w-3 h-3" />
                        Record Bank Settlement
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-gray-600 dark:text-gray-400">Online Payments Received</span>
                        <span className="font-mono font-medium">
                          {formatCurrency(overview?.settlements?.razorpay?.collected, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 text-blue-600 dark:text-blue-400">
                        <span>Amount Received in Bank</span>
                        <span className="font-mono font-medium">
                          {formatCurrency(overview?.settlements?.razorpay?.settled, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 text-gray-500">
                        <span>Payment Gateway Charges</span>
                        <span className="font-mono">
                          {formatCurrency(overview?.settlements?.razorpay?.fees, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-t border-gray-100 dark:border-gray-800 font-medium">
                        <span className="text-gray-700 dark:text-gray-300">Payments Awaiting Settlement</span>
                        <span className="font-mono text-gray-900 dark:text-white">
                          {formatCurrency(overview?.settlements?.razorpay?.pending, currency)}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">COD Amount Received in Bank</span>
                        <span className="font-mono font-medium">
                          {formatCurrency(overview?.settlements?.cod?.settled, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 2: REVENUE & SETTLEMENTS LIST
              ========================================================= */}
          {activeTab === "revenue" && (
            <div className="space-y-3">
              {/* Channel filter chips & Payout trigger */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500 text-[11px] font-medium mr-1">Filter Channel:</span>
                  <button
                    onClick={() => setRevenueChannelFilter("all")}
                    className={`px-2 py-0.5 rounded border text-[11px] font-medium transition ${revenueChannelFilter === "all"
                      ? "bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300"
                      : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                      }`}
                  >
                    All Channels
                  </button>
                  {isPos && (
                    <button
                      onClick={() => setRevenueChannelFilter("pos")}
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium transition ${revenueChannelFilter === "pos"
                        ? "bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300"
                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                        }`}
                    >
                      In-Store POS
                    </button>
                  )}
                  {isEcom && (
                    <button
                      onClick={() => setRevenueChannelFilter("ecom")}
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium transition ${revenueChannelFilter === "ecom"
                        ? "bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300"
                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                        }`}
                    >
                      E-Commerce
                    </button>
                  )}
                </div>

                {/* {isEcom && (
                  <button
                    onClick={() => setShowSettlementModal(true)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center gap-1 transition"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    Record Settlement Payout
                  </button>
                )} */}
              </div>

              {/* Transactions List */}
              <div className="rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 text-[11px] font-medium text-gray-500 bg-gray-50 dark:bg-gray-800/40">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Ref / Order No</th>
                        <th className="py-2 px-3">Channel</th>
                        <th className="py-2 px-3">Customer</th>
                        <th className="py-2 px-3">Payment Method</th>
                        <th className="py-2 px-3">Payment Status</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-mono">
                      {revenueLoading ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-gray-400 font-sans">
                            Loading revenue records...
                          </td>
                        </tr>
                      ) : revenueItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-gray-400 font-sans italic">
                            No revenue records found for this date range.
                          </td>
                        </tr>
                      ) : (
                        revenueItems.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                            <td className="py-1.5 px-3 text-gray-600 dark:text-gray-400">
                              {toDDMMYYYY(item.txn_date)}
                            </td>
                            <td className="py-1.5 px-3 font-semibold text-gray-900 dark:text-white">
                              {item.ref_no}
                            </td>
                            <td className="py-1.5 px-3 font-sans">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${item.channel === "POS"
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                  }`}
                              >
                                {item.channel}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 font-sans text-gray-700 dark:text-gray-300">
                              {item.customer_name}
                            </td>
                            <td className="py-1.5 px-3 font-sans text-gray-600 dark:text-gray-400 uppercase text-[10px]">
                              {item.payment_method || "-"}
                            </td>
                            <td className="py-1.5 px-3 font-sans">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${item.payment_status === "paid"
                                  ? "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950"
                                  : "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950"
                                  }`}
                              >
                                {item.payment_status}
                              </span>
                            </td>
                            <td
                              className={`py-1.5 px-3 text-right font-medium ${item.is_realized ? "text-gray-900 dark:text-white" : "text-gray-400"
                                }`}
                            >
                              {formatCurrency(item.total_amount, currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 3: EXPENSES & ADD EXPENSE ROW FORM
              ========================================================= */}
          {activeTab === "expenses" && (
            <div className="space-y-3">
              {/* Compact "Add Expense" Form in ONE Row Line above list */}
              <div className="rounded border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-2.5">
                <div className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 mb-1.5 flex items-center justify-between">
                  <span>Record Manual Store Overhead (Rent, Electricity, Salaries, Packaging...)</span>
                  {addSuccessMsg && (
                    <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                      <CheckCircleIcon className="w-3.5 h-3.5" />
                      {addSuccessMsg}
                    </span>
                  )}
                </div>

                <form onSubmit={handleAddExpense} className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Category */}
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                    className="border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 outline-none text-xs"
                    required
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>

                  {/* Title / Description */}
                  <input
                    type="text"
                    placeholder="Expense Description (e.g. November Store Rent)"
                    value={addForm.title}
                    onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                    className="flex-1 min-w-[180px] border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 outline-none text-xs"
                    required
                  />

                  {/* Amount */}
                  <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 px-2 py-1">
                    <span className="text-gray-400 mr-1 text-xs">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Amount"
                      value={addForm.amount}
                      onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                      className="w-20 bg-transparent outline-none font-mono text-xs"
                      required
                    />
                  </div>

                  {/* Date DD-MM-YYYY */}
                  <input
                    type="text"
                    pattern="\d{2}-\d{2}-\d{4}"
                    placeholder="DD-MM-YYYY"
                    value={addForm.date}
                    onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                    className="w-24 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 font-mono text-xs outline-none"
                    title="Date formatted in DD-MM-YYYY"
                    required
                  />

                  {/* Payment Mode */}
                  <select
                    value={addForm.payment_mode}
                    onChange={(e) => setAddForm({ ...addForm, payment_mode: e.target.value })}
                    className="border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 outline-none text-xs"
                  >
                    {PAYMENT_MODES.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>

                  {/* Reference No */}
                  <input
                    type="text"
                    placeholder="Ref / Invoice #"
                    value={addForm.reference_no}
                    onChange={(e) => setAddForm({ ...addForm, reference_no: e.target.value })}
                    className="w-24 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 outline-none text-xs"
                  />

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={addingExpense}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-xs flex items-center gap-1 transition"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    {addingExpense ? "Saving..." : "Add Expense"}
                  </button>
                </form>
              </div>

              {/* Filter Row */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-500 text-[11px] font-medium mr-1">Filter List:</span>
                <button
                  onClick={() => setExpenseTypeFilter("all")}
                  className={`px-2 py-0.5 rounded border text-[11px] font-medium transition ${expenseTypeFilter === "all"
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                    }`}
                >
                  All Expenses
                </button>
                <button
                  onClick={() => setExpenseTypeFilter("cogs")}
                  className={`px-2 py-0.5 rounded border text-[11px] font-medium transition ${expenseTypeFilter === "cogs"
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                    }`}
                >
                  Completed-GRN Purchases (COGS)
                </button>
                <button
                  onClick={() => setExpenseTypeFilter("manual")}
                  className={`px-2 py-0.5 rounded border text-[11px] font-medium transition ${expenseTypeFilter === "manual"
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                    }`}
                >
                  Manual Store Overheads
                </button>
              </div>

              {/* Expenses Table */}
              <div className="rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-800 text-[11px] font-medium text-gray-500 bg-gray-50 dark:bg-gray-800/40">
                        <th className="py-2 px-3">Date (DD-MM-YYYY)</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Description / Title</th>
                        <th className="py-2 px-3">Ref / Invoice #</th>
                        <th className="py-2 px-3">Payment Mode</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                        <th className="py-2 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-mono">
                      {expensesLoading ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-gray-400 font-sans">
                            Loading expense records...
                          </td>
                        </tr>
                      ) : expenseItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-gray-400 font-sans italic">
                            No expenses found for this date range.
                          </td>
                        </tr>
                      ) : (
                        expenseItems.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                            <td className="py-1.5 px-3 text-gray-600 dark:text-gray-400 font-mono">
                              {toDDMMYYYY(item.date)}
                            </td>
                            <td className="py-1.5 px-3 font-sans">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${item.type === "cogs"
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                  }`}
                              >
                                {item.category}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 font-sans text-gray-900 dark:text-white font-medium">
                              {item.title}
                            </td>
                            <td className="py-1.5 px-3 text-gray-500 font-mono text-[11px]">{item.ref_no}</td>
                            <td className="py-1.5 px-3 font-sans text-gray-600 dark:text-gray-400 text-[11px]">
                              {item.payment_mode}
                            </td>
                            <td className="py-1.5 px-3 text-right font-medium text-gray-900 dark:text-white">
                              {formatCurrency(item.amount, currency)}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              {item.type === "manual" ? (
                                <button
                                  onClick={() => handleDeleteExpense(item.id)}
                                  className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 transition"
                                  title="Delete expense"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-[10px] text-gray-400 font-sans">Auto (PO)</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Record Settlement Payout Modal */}
      {showSettlementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 w-full max-w-md p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Record Settlement Payout to Bank</h3>
              <button
                onClick={() => setShowSettlementModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettlement} className="space-y-2.5 text-xs">
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">Settlement Channel</label>
                <select
                  value={settlementForm.channel}
                  onChange={(e) => setSettlementForm({ ...settlementForm, channel: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 bg-white dark:bg-gray-800 outline-none"
                  required
                >
                  <option value="razorpay">Razorpay Online Settlement</option>
                  <option value="cod">Shiprocket / Courier COD Remittance</option>
                  <option value="pos">POS Card/UPI Batch Settlement</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-600 dark:text-gray-400 mb-1">Gross Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={settlementForm.amount}
                    onChange={(e) => setSettlementForm({ ...settlementForm, amount: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 bg-white dark:bg-gray-800 font-mono outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-400 mb-1">Gateway Fees & Tax (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={settlementForm.fees}
                    onChange={(e) => setSettlementForm({ ...settlementForm, fees: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 bg-white dark:bg-gray-800 font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">Settlement Date (DD-MM-YYYY)</label>
                <input
                  type="text"
                  pattern="\d{2}-\d{2}-\d{4}"
                  placeholder="DD-MM-YYYY"
                  value={settlementForm.settled_at}
                  onChange={(e) => setSettlementForm({ ...settlementForm, settled_at: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 bg-white dark:bg-gray-800 font-mono outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">Bank UTR / Transaction Reference</label>
                <input
                  type="text"
                  placeholder="e.g. UTR1234567890"
                  value={settlementForm.bank_reference}
                  onChange={(e) => setSettlementForm({ ...settlementForm, bank_reference: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 bg-white dark:bg-gray-800 font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">Notes / Description</label>
                <input
                  type="text"
                  placeholder="e.g. Weekly settlement payout"
                  value={settlementForm.notes}
                  onChange={(e) => setSettlementForm({ ...settlementForm, notes: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 bg-white dark:bg-gray-800 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(false)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettlement}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                >
                  {savingSettlement ? "Saving..." : "Record Settlement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
