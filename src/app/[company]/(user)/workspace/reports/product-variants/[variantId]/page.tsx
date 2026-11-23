"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { useTenant } from "@/context/TenantContext";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

// Helper to strictly format dates as DD-MM-YYYY
function formatDate(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return "-";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "-";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Format month key YYYY-MM to MM-YYYY
function formatMonthKey(key: string): string {
  if (!key) return "-";
  const parts = key.split("-");
  if (parts.length === 2) {
    return `${parts[1]}-${parts[0]}`;
  }
  return key;
}

export default function VariantDeepDiveReportPage({
  params,
}: {
  params: Promise<{ company: string; variantId: string }>;
}) {
  const router = useRouter();
  const { company } = useTenant();
  const resolvedParams = use(params);
  const variantId = resolvedParams.variantId;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [reportData, setReportData] = useState<any>(null);

  // Tab or section filter for quick navigation
  const [activeTab, setActiveTab] = useState<"overview" | "po_history" | "stock_ledger" | "ecom">(
    "overview"
  );

  useEffect(() => {
    if (!company || !variantId) return;

    async function loadVariantReport() {
      setLoading(true);
      setErrorMsg("");
      try {
        const res = await fetch(`/api/reports/product-variants/${variantId}`, {
          headers: {
            "x-tenant": company,
          },
        });
        const json = await res.json();
        if (json.success) {
          setReportData(json.data);
        } else {
          setErrorMsg(json.message || "Failed to load variant analytics report");
        }
      } catch (err: any) {
        console.error("Error loading variant report:", err);
        setErrorMsg("Network error loading variant report");
      } finally {
        setLoading(false);
      }
    }

    loadVariantReport();
  }, [company, variantId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/60 p-6 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-slate-600 font-medium">Loading variant analytics report...</p>
      </div>
    );
  }

  if (errorMsg || !reportData) {
    return (
      <div className="min-h-screen bg-slate-50/60 p-6">
        <div className="max-w-xl mx-auto bg-white p-6 rounded-xl border border-red-200 shadow-sm text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-slate-800 mb-1">Failed to Load Report</h2>
          <p className="text-xs text-red-600 mb-4">{errorMsg || "Variant not found"}</p>
          <Link
            href={`/${company}/workspace/reports/product-variants`}
            className="inline-flex items-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-lg transition"
          >
            ← Back to Product Variants List
          </Link>
        </div>
      </div>
    );
  }

  const { variant, pricing, po_history, pos_sales, ecom_sales, stock_ledger } = reportData;
  const posAccess = reportData?.access?.pos_access ?? true;
  const ecomAccess = reportData?.access?.ecom_access ?? false;

  const isLowStock = variant.current_stock <= (variant.low_stock_threshold || 5);
  const isOutOfStock = variant.current_stock <= 0;

  // Chart 1: POS Monthly Trend Chart Options & Series
  const posMonths = (pos_sales?.monthly_trend || []).map((m: any) => formatMonthKey(m.month_key));
  const posUnits = (pos_sales?.monthly_trend || []).map((m: any) => Number(m.units));
  const posRevenues = (pos_sales?.monthly_trend || []).map((m: any) => Number(m.revenue));

  const posChartOptions: ApexOptions = {
    chart: {
      type: "bar",
      height: 220,
      toolbar: { show: false },
      fontFamily: "inherit",
    },
    colors: ["#0284c7", "#0369a1"],
    plotOptions: {
      bar: {
        columnWidth: "45%",
        borderRadius: 3,
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: posMonths.length ? posMonths : ["No Data"],
      labels: { style: { fontSize: "10px", colors: "#64748b" } },
    },
    yaxis: {
      labels: {
        style: { fontSize: "10px", colors: "#64748b" },
        formatter: (val) => String(Math.round(val)),
      },
    },
    tooltip: {
      y: {
        formatter: (val) => `${val} units`,
      },
    },
  };

  const posChartSeries = [
    {
      name: "Units Sold",
      data: posUnits.length ? posUnits : [0],
    },
  ];

  // Chart 2: E-Com Monthly Trend Chart Options & Series
  const ecomMonths = (ecom_sales?.monthly_trend || []).map((m: any) => formatMonthKey(m.month_key));
  const ecomUnits = (ecom_sales?.monthly_trend || []).map((m: any) => Number(m.units));
  const ecomRevenues = (ecom_sales?.monthly_trend || []).map((m: any) => Number(m.revenue));

  const ecomChartOptions: ApexOptions = {
    chart: {
      type: "area",
      height: 220,
      toolbar: { show: false },
      fontFamily: "inherit",
    },
    colors: ["#8b5cf6"],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2 },
    xaxis: {
      categories: ecomMonths.length ? ecomMonths : ["No Data"],
      labels: { style: { fontSize: "10px", colors: "#64748b" } },
    },
    yaxis: {
      labels: {
        style: { fontSize: "10px", colors: "#64748b" },
        formatter: (val) => String(Math.round(val)),
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
      },
    },
    tooltip: {
      y: {
        formatter: (val) => `${val} units`,
      },
    },
  };

  const ecomChartSeries = [
    {
      name: "E-Com Units Sold",
      data: ecomUnits.length ? ecomUnits : [0],
    },
  ];

  // Side-by-Side Comparison (if both POS and E-Com are active)
  const comparisonCategories = ["Units Sold", "Revenue (₹)"];
  const sideBySideOptions: ApexOptions = {
    chart: {
      type: "bar",
      height: 220,
      toolbar: { show: false },
      fontFamily: "inherit",
    },
    colors: ["#0284c7", "#8b5cf6"],
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        dataLabels: { position: "top" },
      },
    },
    xaxis: {
      labels: { style: { fontSize: "10px", colors: "#64748b" } },
    },
    yaxis: {
      labels: { style: { fontSize: "11px", colors: "#334155" } },
    },
    legend: { position: "top", fontSize: "11px" },
  };

  const sideBySideSeries = [
    {
      name: "POS Channel",
      data: [pos_sales?.units_sold || 0, Math.round(pos_sales?.total_revenue || 0)],
    },
    {
      name: "E-Commerce",
      data: [ecom_sales?.units_sold || 0, Math.round(ecom_sales?.total_revenue || 0)],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 space-y-4">
      {/* BREADCRUMB & TOP HEADER */}
      <div className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link
              href={`/${company}/workspace/reports/product-variants`}
              className="text-sky-600 hover:text-sky-700 font-medium"
            >
              Reports / Product Variants
            </Link>
            <span>/</span>
            <span className="text-slate-700 font-mono font-medium">{variant.sku}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-bold text-slate-800">
              {variant.product_name}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                variant.status === "active"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {variant.status.toUpperCase()}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
            <span>
              SKU: <strong className="font-mono text-slate-700">{variant.sku}</strong>
            </span>
            <span>•</span>
            <span>
              Barcode: <strong className="font-mono text-slate-700">{variant.barcode || "-"}</strong>
            </span>
            {variant.color_name && (
              <>
                <span>•</span>
                <span>
                  Color: <strong className="text-slate-700">{variant.color_name}</strong>
                </span>
              </>
            )}
            {variant.size && (
              <>
                <span>•</span>
                <span>
                  Size: <strong className="text-slate-700">{variant.size}</strong>
                </span>
              </>
            )}
            {variant.hsn_code && (
              <>
                <span>•</span>
                <span>
                  HSN: <strong className="font-mono text-slate-700">{variant.hsn_code}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/${company}/workspace/reports/product-variants`}
            className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            ← Back to List
          </Link>
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Available Stock */}
        <div className="bg-white p-3.5 rounded-xl border border-sky-100 shadow-sm">
          <div className="text-[11px] text-slate-500 font-medium">Available Stock</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-slate-800">{variant.current_stock}</span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full ${
                isOutOfStock
                  ? "bg-red-100 text-red-700"
                  : isLowStock
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              Threshold: {variant.low_stock_threshold || 5}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {isOutOfStock ? "⚠️ Out of Stock" : isLowStock ? "⚠️ Low Stock Warning" : "✓ In Stock"}
          </div>
        </div>

        {/* Cost Price */}
        <div className="bg-white p-3.5 rounded-xl border border-sky-100 shadow-sm">
          <div className="text-[11px] text-slate-500 font-medium">Landed Cost</div>
          <div className="text-xl font-bold text-slate-800 mt-1">
            ₹{pricing.cost_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Base: ₹{pricing.base_cost.toFixed(2)} + Op: ₹{pricing.operational_cost.toFixed(2)}
          </div>
        </div>

        {/* Selling Price & Margin */}
        <div className="bg-white p-3.5 rounded-xl border border-sky-100 shadow-sm">
          <div className="text-[11px] text-slate-500 font-medium">POS Selling Price</div>
          <div className="text-xl font-bold text-sky-700 mt-1">
            ₹{pricing.pos_selling_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
            Margin: {pricing.profit_margin_percent}%
          </div>
        </div>

        {/* POS Sales (if pos_access) */}
        {posAccess && (
          <div className="bg-white p-3.5 rounded-xl border border-sky-100 shadow-sm">
            <div className="text-[11px] text-slate-500 font-medium">Total POS Sales</div>
            <div className="text-xl font-bold text-slate-800 mt-1">
              {pos_sales.units_sold} <span className="text-xs text-slate-500 font-normal">units</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Revenue: ₹{pos_sales.total_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}

        {/* E-Com Sales (if ecom_access) */}
        {ecomAccess && (
          <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-sm bg-purple-50/10">
            <div className="text-[11px] text-purple-700 font-medium">Total E-Com Sales</div>
            <div className="text-xl font-bold text-purple-900 mt-1">
              {ecom_sales.units_sold} <span className="text-xs text-purple-600 font-normal">units</span>
            </div>
            <div className="text-[10px] text-purple-600 mt-0.5">
              Revenue: ₹{ecom_sales.total_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}
      </div>

      {/* QUICK SECTION TAB NAVIGATION */}
      <div className="flex border-b border-slate-200 gap-1 bg-white px-3 pt-2 rounded-t-xl">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-3 py-2 text-xs font-semibold border-b-2 transition ${
            activeTab === "overview"
              ? "border-sky-600 text-sky-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Overview & Channel Sales
        </button>
        <button
          onClick={() => setActiveTab("po_history")}
          className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "po_history"
              ? "border-sky-600 text-sky-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <span>Purchase Order History</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full text-[10px]">
            {po_history.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("stock_ledger")}
          className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
            activeTab === "stock_ledger"
              ? "border-sky-600 text-sky-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <span>Stock Ledger History</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full text-[10px]">
            {stock_ledger.length}
          </span>
        </button>
        {ecomAccess && (
          <button
            onClick={() => setActiveTab("ecom")}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "ecom"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <span>E-Commerce Analytics</span>
          </button>
        )}
      </div>

      {/* TAB CONTENT 1: OVERVIEW & CHANNEL SALES */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* PRICING & MARGIN BREAKDOWN CARD */}
          <div className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Pricing & Margin Breakdown
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-500">Base Cost</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">
                  ₹{pricing.base_cost.toFixed(2)}
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-500">Landed Cost Price</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">
                  ₹{pricing.cost_price.toFixed(2)}
                </div>
              </div>
              <div className="p-2.5 bg-sky-50/60 rounded-lg border border-sky-100">
                <div className="text-[10px] text-sky-700">POS Selling Price</div>
                <div className="text-sm font-bold text-sky-900 mt-0.5">
                  ₹{pricing.pos_selling_price.toFixed(2)}
                </div>
              </div>
              {ecomAccess && (
                <div className="p-2.5 bg-purple-50/60 rounded-lg border border-purple-100">
                  <div className="text-[10px] text-purple-700">E-Com Selling Price</div>
                  <div className="text-sm font-bold text-purple-900 mt-0.5">
                    ₹{pricing.ecom_selling_price.toFixed(2)}
                  </div>
                </div>
              )}
              <div className="p-2.5 bg-emerald-50/60 rounded-lg border border-emerald-100">
                <div className="text-[10px] text-emerald-700">Net Profit Margin</div>
                <div className="text-sm font-bold text-emerald-800 mt-0.5">
                  {pricing.profit_margin_percent}%
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-500">Tax Percent</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">
                  {pricing.tax_percent}%
                </div>
              </div>
            </div>

            {/* Active discounts on this variant */}
            {pricing.active_discounts && pricing.active_discounts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-[11px] font-semibold text-slate-700 mb-1.5">
                  Active Applicable Discounts:
                </div>
                <div className="flex flex-wrap gap-2">
                  {pricing.active_discounts.map((d: any) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs"
                    >
                      <strong>{d.name}</strong>
                      <span>
                        ({d.discount_type === "percentage" ? `${d.value}%` : `₹${d.value}`} off)
                      </span>
                      <span className="text-[10px] text-amber-700 uppercase">
                        [{d.channel}]
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CHANNEL PERFORMANCE CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* POS Sales Trend Chart */}
            {posAccess && (
              <div className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      POS Sales Trend (12 Months)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Total Units: {pos_sales.units_sold} | Revenue: ₹
                      {pos_sales.total_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold">
                    Avg: ₹{pos_sales.avg_selling_price}
                  </span>
                </div>
                <div className="min-h-[220px]">
                  {posMonths.length > 0 ? (
                    <ReactApexChart
                      options={posChartOptions}
                      series={posChartSeries}
                      type="bar"
                      height={220}
                    />
                  ) : (
                    <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                      No POS sales data recorded for this variant
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* E-Com Sales Trend Chart */}
            {ecomAccess && (
              <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                      E-Commerce Sales Trend (12 Months)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Orders: {ecom_sales.order_count} | Units: {ecom_sales.units_sold} | Revenue: ₹
                      {ecom_sales.total_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
                    Buyers: {ecom_sales.unique_customers}
                  </span>
                </div>
                <div className="min-h-[220px]">
                  {ecomMonths.length > 0 ? (
                    <ReactApexChart
                      options={ecomChartOptions}
                      series={ecomChartSeries}
                      type="area"
                      height={220}
                    />
                  ) : (
                    <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                      No E-Commerce sales data recorded for this variant
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Side-by-Side Channel Comparison (if both active) */}
            {posAccess && ecomAccess && (
              <div className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm lg:col-span-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Channel Performance: POS vs. E-Commerce
                </h3>
                <div className="min-h-[220px]">
                  <ReactApexChart
                    options={sideBySideOptions}
                    series={sideBySideSeries}
                    type="bar"
                    height={220}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: PURCHASE ORDER HISTORY */}
      {activeTab === "po_history" && (
        <div className="bg-white rounded-xl border border-sky-100 shadow-sm overflow-hidden">
          <div className="p-3.5 border-b border-sky-100 bg-sky-50/40 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Purchase Order (PO) History
            </h3>
            <span className="text-xs text-slate-500">
              Total POs: <strong>{po_history.length}</strong>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-sky-50/70 border-b border-sky-100 text-slate-700 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-3">PO Number</th>
                  <th className="py-2.5 px-3">PO Date</th>
                  <th className="py-2.5 px-3">Supplier Name</th>
                  <th className="py-2.5 px-3 text-right">Ordered Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Cost</th>
                  <th className="py-2.5 px-3 text-right">Total Amount</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {po_history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No purchase orders recorded for this product variant
                    </td>
                  </tr>
                ) : (
                  po_history.map((po: any, idx: number) => (
                    <tr key={idx} className="hover:bg-sky-50/30 transition">
                      <td className="py-2 px-3 font-mono font-medium text-sky-700">
                        {po.purchase_no}
                      </td>
                      <td className="py-2 px-3 text-slate-600 font-medium">
                        {formatDate(po.purchase_date)}
                      </td>
                      <td className="py-2 px-3 text-slate-800">
                        {po.supplier_name}{" "}
                        {po.supplier_code && (
                          <span className="text-[10px] text-slate-400">({po.supplier_code})</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-slate-800">
                        {po.ordered_qty}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-700">
                        ₹{po.unit_cost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800">
                        ₹{po.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {po.approval_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: STOCK LEDGER HISTORY */}
      {activeTab === "stock_ledger" && (
        <div className="bg-white rounded-xl border border-sky-100 shadow-sm overflow-hidden">
          <div className="p-3.5 border-b border-sky-100 bg-sky-50/40 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Chronological Stock Ledger Movements
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Current Stock: <strong>{variant.current_stock}</strong> | Low Stock Threshold:{" "}
                <strong>{variant.low_stock_threshold || 5}</strong>
              </p>
            </div>
            <span className="text-xs text-slate-500">
              Total Transactions: <strong>{stock_ledger.length}</strong>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-sky-50/70 border-b border-sky-100 text-slate-700 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Transaction Type</th>
                  <th className="py-2.5 px-3">Document No</th>
                  <th className="py-2.5 px-3">Warehouse / Locator</th>
                  <th className="py-2.5 px-3 text-right">Inward (+)</th>
                  <th className="py-2.5 px-3 text-right">Outward (-)</th>
                  <th className="py-2.5 px-3 text-right">Net Change</th>
                  <th className="py-2.5 px-3 text-right font-bold">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stock_ledger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No stock ledger entries recorded for this variant
                    </td>
                  </tr>
                ) : (
                  stock_ledger.map((sl: any) => (
                    <tr key={sl.id} className="hover:bg-sky-50/30 transition">
                      <td className="py-2 px-3 text-slate-600 font-medium">
                        {formatDate(sl.txn_date)}
                      </td>
                      <td className="py-2 px-3 text-slate-800 font-medium">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium ${
                            sl.qty_in > 0
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {sl.txn_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600">{sl.document_no || "-"}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {sl.warehouse_name || "-"}{" "}
                        {sl.locator_name && (
                          <span className="text-[10px] text-slate-400">/ {sl.locator_name}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-700 font-medium">
                        {sl.qty_in > 0 ? `+${sl.qty_in}` : "-"}
                      </td>
                      <td className="py-2 px-3 text-right text-rose-700 font-medium">
                        {sl.qty_out > 0 ? `-${sl.qty_out}` : "-"}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold">
                        <span className={sl.net_change >= 0 ? "text-emerald-700" : "text-rose-700"}>
                          {sl.net_change > 0 ? `+${sl.net_change}` : sl.net_change}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-800">
                        {sl.closing_balance}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: E-COMMERCE PREFERENCES & BEHAVIOR */}
      {activeTab === "ecom" && ecomAccess && (
        <div className="space-y-4">
          {/* E-Com KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-sm">
              <div className="text-[11px] text-purple-700 font-medium">Repeat Purchase Rate</div>
              <div className="text-xl font-bold text-purple-900 mt-1">
                {ecom_sales.repeat_purchase_rate}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Repeat buyers of this variant
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-sm">
              <div className="text-[11px] text-purple-700 font-medium">Avg Order Quantity</div>
              <div className="text-xl font-bold text-purple-900 mt-1">
                {ecom_sales.avg_order_qty}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Units per unique customer
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-sm">
              <div className="text-[11px] text-purple-700 font-medium">Active Cart Count</div>
              <div className="text-xl font-bold text-purple-900 mt-1">
                {ecom_sales.cart_count}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Currently added in shopping carts
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-purple-100 shadow-sm">
              <div className="text-[11px] text-purple-700 font-medium">Wishlist Count</div>
              <div className="text-xl font-bold text-purple-900 mt-1">
                {ecom_sales.wishlist_count}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Saved in customer wishlists
              </div>
            </div>
          </div>

          {/* Frequently Bought Together */}
          <div className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden">
            <div className="p-3.5 border-b border-purple-100 bg-purple-50/30">
              <h3 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                Frequently Bought Together (Cross-Sell Companions)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Top products & variants most frequently ordered together in the same cart.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-purple-50/50 border-b border-purple-100 text-purple-900 font-semibold uppercase text-[11px]">
                    <th className="py-2.5 px-3">Companion Product</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Color / Size</th>
                    <th className="py-2.5 px-3 text-right">Orders Together</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-50">
                  {ecom_sales.frequently_bought_together.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No co-purchased companion items found yet
                      </td>
                    </tr>
                  ) : (
                    ecom_sales.frequently_bought_together.map((comp: any) => (
                      <tr key={comp.variant_id} className="hover:bg-purple-50/30 transition">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {comp.product_name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-purple-700">{comp.sku}</td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {comp.color_name && <span>Color: {comp.color_name} </span>}
                          {comp.size && <span>| Size: {comp.size}</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-purple-900">
                          {comp.times_bought_together} orders
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Link
                            href={`/${company}/workspace/reports/product-variants/${comp.variant_id}`}
                            className="text-xs text-sky-600 hover:text-sky-800 font-medium underline"
                          >
                            View Report
                          </Link>
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
    </div>
  );
}
