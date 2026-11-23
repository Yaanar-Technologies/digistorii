"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import * as XLSX from "xlsx";
import { useTenant } from "@/context/TenantContext";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type VariantCompareItem = {
  variant_id: number;
  sku: string;
  barcode: string;
  size: string;
  color_name: string;
  fitting_name: string;
  product_name: string;
  product_code: string;
  current_stock: number;
  low_stock_threshold: number;
  last_purchase_cost: number;
  top_supplier: string;
  pos_selling_price: number;
  ecom_selling_price: number;
  profit_margin_percent: number;
  pos_sold_qty: number;
  pos_revenue: number;
  ecom_sold_qty: number;
  ecom_revenue: number;
  total_sold_qty: number;
  total_revenue: number;
  ecom_repeat_buyer_rate: number;
};

function formatTodayDate(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function VariantComparisonContent() {
  const { company } = useTenant();
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") || "";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [variants, setVariants] = useState<VariantCompareItem[]>([]);
  const [posAccess, setPosAccess] = useState(true);
  const [ecomAccess, setEcomAccess] = useState(false);

  // Active chart metric toggle
  const [selectedMetric, setSelectedMetric] = useState<"units" | "revenue" | "stock" | "margin">(
    "units"
  );

  useEffect(() => {
    if (!company || !idsParam) {
      setLoading(false);
      return;
    }

    async function fetchComparisonData() {
      setLoading(true);
      setErrorMsg("");
      try {
        const res = await fetch(`/api/reports/product-variants/compare?ids=${encodeURIComponent(idsParam)}`, {
          headers: {
            "x-tenant": company,
          },
        });
        const json = await res.json();
        if (json.success) {
          setVariants(json.data || []);
          if (json.access) {
            setPosAccess(Boolean(json.access.pos_access));
            setEcomAccess(Boolean(json.access.ecom_access));
          }
        } else {
          setErrorMsg(json.message || "Failed to load variant comparison");
        }
      } catch (err: any) {
        console.error("Comparison load error:", err);
        setErrorMsg("Network error loading variant comparison");
      } finally {
        setLoading(false);
      }
    }

    fetchComparisonData();
  }, [company, idsParam]);

  // Export to Excel (.xlsx) with strict DD-MM-YYYY date stamp
  const handleExportExcel = () => {
    if (variants.length === 0) return;

    const dateStr = formatTodayDate();
    const rows: (string | number)[][] = [];

    // Header row
    rows.push(["Product Variant Multi-Comparison Report", `Generated Date: ${dateStr}`]);
    rows.push([]);

    // Variant column headers
    const headerRow: (string | number)[] = ["Metric", ...variants.map((v) => `${v.product_name} (${v.sku})`)];
    rows.push(headerRow);

    // Matrix rows
    rows.push(["SKU", ...variants.map((v) => v.sku)]);
    rows.push(["Barcode", ...variants.map((v) => v.barcode)]);
    rows.push(["Color", ...variants.map((v) => v.color_name)]);
    rows.push(["Size / Fitting", ...variants.map((v) => `${v.size} / ${v.fitting_name}`)]);
    rows.push(["Current Stock", ...variants.map((v) => v.current_stock)]);
    rows.push(["Low Stock Threshold", ...variants.map((v) => v.low_stock_threshold)]);
    rows.push(["Last Purchase Cost (₹)", ...variants.map((v) => v.last_purchase_cost)]);
    rows.push(["POS Selling Price (₹)", ...variants.map((v) => v.pos_selling_price)]);
    if (ecomAccess) {
      rows.push(["E-Com Selling Price (₹)", ...variants.map((v) => v.ecom_selling_price)]);
    }
    rows.push(["Net Profit Margin (%)", ...variants.map((v) => `${v.profit_margin_percent}%`)]);
    if (posAccess) {
      rows.push(["POS Sold Qty (Units)", ...variants.map((v) => v.pos_sold_qty)]);
      rows.push(["POS Revenue (₹)", ...variants.map((v) => v.pos_revenue)]);
    }
    if (ecomAccess) {
      rows.push(["E-Com Sold Qty (Units)", ...variants.map((v) => v.ecom_sold_qty)]);
      rows.push(["E-Com Revenue (₹)", ...variants.map((v) => v.ecom_revenue)]);
      rows.push(["E-Com Repeat Buyer Rate (%)", ...variants.map((v) => `${v.ecom_repeat_buyer_rate}%`)]);
    }
    rows.push(["Total Sold Qty (Units)", ...variants.map((v) => v.total_sold_qty)]);
    rows.push(["Total Revenue (₹)", ...variants.map((v) => v.total_revenue)]);
    rows.push(["Top Supplier", ...variants.map((v) => v.top_supplier)]);

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Variant Comparison");
    XLSX.writeFile(workbook, `Variant_Comparison_${dateStr}.xlsx`);
  };

  // Find best/highest value in numeric rows for visual highlighting
  const bestValues = useMemo(() => {
    if (variants.length === 0) return {} as Record<string, number>;
    return {
      current_stock: Math.max(...variants.map((v) => v.current_stock)),
      profit_margin: Math.max(...variants.map((v) => v.profit_margin_percent)),
      pos_sold_qty: Math.max(...variants.map((v) => v.pos_sold_qty)),
      pos_revenue: Math.max(...variants.map((v) => v.pos_revenue)),
      ecom_sold_qty: Math.max(...variants.map((v) => v.ecom_sold_qty)),
      ecom_revenue: Math.max(...variants.map((v) => v.ecom_revenue)),
      total_sold_qty: Math.max(...variants.map((v) => v.total_sold_qty)),
      total_revenue: Math.max(...variants.map((v) => v.total_revenue)),
      ecom_repeat_buyer_rate: Math.max(...variants.map((v) => v.ecom_repeat_buyer_rate)),
    };
  }, [variants]);

  // Unified Interactive Comparison Chart Setup
  const chartCategories = variants.map((v) => `${v.sku}`);

  const chartSeries = useMemo(() => {
    if (variants.length === 0) return [];
    if (selectedMetric === "units") {
      const series = [];
      if (posAccess) {
        series.push({
          name: "POS Units Sold",
          data: variants.map((v) => v.pos_sold_qty),
        });
      }
      if (ecomAccess) {
        series.push({
          name: "E-Com Units Sold",
          data: variants.map((v) => v.ecom_sold_qty),
        });
      }
      if (!posAccess && !ecomAccess) {
        series.push({
          name: "Total Units Sold",
          data: variants.map((v) => v.total_sold_qty),
        });
      }
      return series;
    }
    if (selectedMetric === "revenue") {
      const series = [];
      if (posAccess) {
        series.push({
          name: "POS Revenue (₹)",
          data: variants.map((v) => Math.round(v.pos_revenue)),
        });
      }
      if (ecomAccess) {
        series.push({
          name: "E-Com Revenue (₹)",
          data: variants.map((v) => Math.round(v.ecom_revenue)),
        });
      }
      return series;
    }
    if (selectedMetric === "stock") {
      return [
        {
          name: "Current Stock",
          data: variants.map((v) => v.current_stock),
        },
        {
          name: "Low Stock Threshold",
          data: variants.map((v) => v.low_stock_threshold),
        },
      ];
    }
    if (selectedMetric === "margin") {
      return [
        {
          name: "Profit Margin (%)",
          data: variants.map((v) => v.profit_margin_percent),
        },
      ];
    }
    return [];
  }, [variants, selectedMetric, posAccess, ecomAccess]);

  const chartOptions: ApexOptions = {
    chart: {
      type: "bar",
      height: 280,
      toolbar: { show: false },
      fontFamily: "inherit",
    },
    colors: ["#0284c7", "#8b5cf6", "#10b981", "#f59e0b"],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "48%",
        borderRadius: 4,
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ["transparent"] },
    xaxis: {
      categories: chartCategories,
      labels: {
        rotate: -30,
        style: { fontSize: "10px", colors: "#64748b" },
      },
    },
    yaxis: {
      labels: {
        style: { fontSize: "10px", colors: "#64748b" },
        formatter: (val) => String(Math.round(val)),
      },
    },
    legend: { position: "top", fontSize: "11px" },
    tooltip: {
      y: {
        formatter: (val) =>
          selectedMetric === "revenue"
            ? `₹${val.toLocaleString("en-IN")}`
            : selectedMetric === "margin"
            ? `${val}%`
            : `${val} units`,
      },
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/60 p-6 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-slate-600 font-medium">Loading variant comparison...</p>
      </div>
    );
  }

  if (errorMsg || variants.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50/60 p-6">
        <div className="max-w-xl mx-auto bg-white p-6 rounded-xl border border-red-200 shadow-sm text-center">
          <h2 className="text-base font-bold text-slate-800 mb-1">Comparison Unavailable</h2>
          <p className="text-xs text-red-600 mb-4">{errorMsg || "No variants selected for comparison."}</p>
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

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 space-y-4">
      {/* HEADER & ACTIONS */}
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
            <span className="text-slate-700 font-medium">Multi-Variant Comparison</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-800">
            Multi-Variant Analytics Comparison ({variants.length} Variants)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Side-by-side performance benchmarking across sales channels, pricing margins, stock levels, and suppliers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-xs transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export to Excel (.xlsx)</span>
          </button>
          <Link
            href={`/${company}/workspace/reports/product-variants`}
            className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            ← Back to List
          </Link>
        </div>
      </div>

      {/* INTERACTIVE COMPARISON CHART */}
      <div className="bg-white p-4 rounded-xl border border-sky-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Variant Performance Comparison Chart
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Visual benchmark across all {variants.length} selected variants.
            </p>
          </div>

          {/* Metric Selector Toggles */}
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs self-start sm:self-auto">
            <button
              onClick={() => setSelectedMetric("units")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                selectedMetric === "units"
                  ? "bg-white text-sky-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Units Sold
            </button>
            <button
              onClick={() => setSelectedMetric("revenue")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                selectedMetric === "revenue"
                  ? "bg-white text-sky-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Revenue (₹)
            </button>
            <button
              onClick={() => setSelectedMetric("stock")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                selectedMetric === "stock"
                  ? "bg-white text-sky-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Stock Level
            </button>
            <button
              onClick={() => setSelectedMetric("margin")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                selectedMetric === "margin"
                  ? "bg-white text-sky-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Profit Margin %
            </button>
          </div>
        </div>

        <div className="min-h-[280px]">
          <ReactApexChart
            options={chartOptions}
            series={chartSeries}
            type="bar"
            height={280}
          />
        </div>
      </div>

      {/* HORIZONTAL COMPARISON MATRIX TABLE */}
      <div className="bg-white rounded-xl border border-sky-100 shadow-sm overflow-hidden">
        <div className="p-3.5 border-b border-sky-100 bg-sky-50/40 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Horizontal Comparison Matrix
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Sticky metric labels on the left; scroll horizontally to compare all selected variants. Best performers highlighted in green.
            </p>
          </div>
          <span className="text-[11px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">
            ★ Top Performer
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-sky-50/80 border-b border-sky-100">
                <th className="sticky left-0 z-20 bg-sky-50 py-3 px-4 w-52 font-bold text-slate-700 uppercase tracking-wider text-[11px] border-r border-sky-200">
                  Metric Label
                </th>
                {variants.map((v, i) => (
                  <th
                    key={v.variant_id}
                    className="py-3 px-4 min-w-[180px] max-w-[220px] font-bold text-slate-800 border-r border-slate-100 last:border-r-0"
                  >
                    <div className="text-sky-700 font-mono text-[11px]">Variant #{i + 1}</div>
                    <div className="font-semibold text-xs text-slate-900 truncate" title={v.product_name}>
                      {v.product_name}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">{v.sku}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Product SKU */}
              <tr className="hover:bg-sky-50/20">
                <td className="sticky left-0 z-10 bg-white py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  SKU
                </td>
                {variants.map((v) => (
                  <td key={v.variant_id} className="py-2 px-4 font-mono text-sky-700 font-medium border-r border-slate-100">
                    {v.sku}
                  </td>
                ))}
              </tr>

              {/* Barcode */}
              <tr className="hover:bg-sky-50/20 bg-slate-50/30">
                <td className="sticky left-0 z-10 bg-slate-50 py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  Barcode
                </td>
                {variants.map((v) => (
                  <td key={v.variant_id} className="py-2 px-4 font-mono text-slate-600 border-r border-slate-100">
                    {v.barcode}
                  </td>
                ))}
              </tr>

              {/* Color */}
              <tr className="hover:bg-sky-50/20">
                <td className="sticky left-0 z-10 bg-white py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  Color
                </td>
                {variants.map((v) => (
                  <td key={v.variant_id} className="py-2 px-4 text-slate-700 border-r border-slate-100">
                    {v.color_name}
                  </td>
                ))}
              </tr>

              {/* Size / Fitting */}
              <tr className="hover:bg-sky-50/20 bg-slate-50/30">
                <td className="sticky left-0 z-10 bg-slate-50 py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  Size / Fitting
                </td>
                {variants.map((v) => (
                  <td key={v.variant_id} className="py-2 px-4 text-slate-700 border-r border-slate-100">
                    {v.size} {v.fitting_name && v.fitting_name !== "-" ? `(${v.fitting_name})` : ""}
                  </td>
                ))}
              </tr>

              {/* Current Stock */}
              <tr className="hover:bg-sky-50/20">
                <td className="sticky left-0 z-10 bg-white py-2.5 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  Current Stock
                </td>
                {variants.map((v) => {
                  const isBest = v.current_stock > 0 && v.current_stock === bestValues.current_stock;
                  return (
                    <td
                      key={v.variant_id}
                      className={`py-2.5 px-4 font-bold border-r border-slate-100 ${
                        isBest
                          ? "bg-emerald-50 text-emerald-800"
                          : v.current_stock <= v.low_stock_threshold
                          ? "text-amber-700"
                          : "text-slate-800"
                      }`}
                    >
                      {v.current_stock}
                      {isBest && <span className="ml-1 text-[10px] text-emerald-600">★</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Last Purchase Cost */}
              <tr className="hover:bg-sky-50/20 bg-slate-50/30">
                <td className="sticky left-0 z-10 bg-slate-50 py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  Last Purchase Cost
                </td>
                {variants.map((v) => (
                  <td key={v.variant_id} className="py-2 px-4 text-slate-800 border-r border-slate-100">
                    ₹{v.last_purchase_cost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                ))}
              </tr>

              {/* POS Selling Price */}
              <tr className="hover:bg-sky-50/20">
                <td className="sticky left-0 z-10 bg-white py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  POS Selling Price
                </td>
                {variants.map((v) => (
                  <td key={v.variant_id} className="py-2 px-4 font-medium text-sky-800 border-r border-slate-100">
                    ₹{v.pos_selling_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                ))}
              </tr>

              {/* E-Com Selling Price */}
              {ecomAccess && (
                <tr className="hover:bg-sky-50/20 bg-purple-50/20">
                  <td className="sticky left-0 z-10 bg-purple-50/50 py-2 px-4 font-semibold text-purple-900 border-r border-slate-200">
                    E-Com Selling Price
                  </td>
                  {variants.map((v) => (
                    <td key={v.variant_id} className="py-2 px-4 font-medium text-purple-800 border-r border-slate-100">
                      ₹{v.ecom_selling_price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
              )}

              {/* Net Profit Margin % */}
              <tr className="hover:bg-sky-50/20">
                <td className="sticky left-0 z-10 bg-white py-2.5 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  Net Profit Margin (%)
                </td>
                {variants.map((v) => {
                  const isBest = v.profit_margin_percent > 0 && v.profit_margin_percent === bestValues.profit_margin;
                  return (
                    <td
                      key={v.variant_id}
                      className={`py-2.5 px-4 font-bold border-r border-slate-100 ${
                        isBest ? "bg-emerald-50 text-emerald-800" : "text-emerald-700"
                      }`}
                    >
                      {v.profit_margin_percent}%
                      {isBest && <span className="ml-1 text-[10px] text-emerald-600">★</span>}
                    </td>
                  );
                })}
              </tr>

              {/* POS Sold Qty */}
              {posAccess && (
                <tr className="hover:bg-sky-50/20 bg-slate-50/30">
                  <td className="sticky left-0 z-10 bg-slate-50 py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                    POS Sold Qty
                  </td>
                  {variants.map((v) => {
                    const isBest = v.pos_sold_qty > 0 && v.pos_sold_qty === bestValues.pos_sold_qty;
                    return (
                      <td
                        key={v.variant_id}
                        className={`py-2 px-4 font-semibold border-r border-slate-100 ${
                          isBest ? "bg-emerald-50 text-emerald-800" : "text-slate-800"
                        }`}
                      >
                        {v.pos_sold_qty} units
                        {isBest && <span className="ml-1 text-[10px] text-emerald-600">★</span>}
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* POS Revenue */}
              {posAccess && (
                <tr className="hover:bg-sky-50/20">
                  <td className="sticky left-0 z-10 bg-white py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                    POS Revenue
                  </td>
                  {variants.map((v) => {
                    const isBest = v.pos_revenue > 0 && v.pos_revenue === bestValues.pos_revenue;
                    return (
                      <td
                        key={v.variant_id}
                        className={`py-2 px-4 font-semibold border-r border-slate-100 ${
                          isBest ? "bg-emerald-50 text-emerald-800" : "text-slate-800"
                        }`}
                      >
                        ₹{v.pos_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        {isBest && <span className="ml-1 text-[10px] text-emerald-600">★</span>}
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* E-Com Sold Qty */}
              {ecomAccess && (
                <tr className="hover:bg-sky-50/20 bg-purple-50/20">
                  <td className="sticky left-0 z-10 bg-purple-50/50 py-2 px-4 font-semibold text-purple-900 border-r border-slate-200">
                    E-Com Sold Qty
                  </td>
                  {variants.map((v) => {
                    const isBest = v.ecom_sold_qty > 0 && v.ecom_sold_qty === bestValues.ecom_sold_qty;
                    return (
                      <td
                        key={v.variant_id}
                        className={`py-2 px-4 font-semibold border-r border-slate-100 ${
                          isBest ? "bg-emerald-50 text-emerald-800" : "text-purple-900"
                        }`}
                      >
                        {v.ecom_sold_qty} units
                        {isBest && <span className="ml-1 text-[10px] text-emerald-600">★</span>}
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* E-Com Revenue */}
              {ecomAccess && (
                <tr className="hover:bg-sky-50/20">
                  <td className="sticky left-0 z-10 bg-white py-2 px-4 font-semibold text-purple-900 border-r border-slate-200">
                    E-Com Revenue
                  </td>
                  {variants.map((v) => {
                    const isBest = v.ecom_revenue > 0 && v.ecom_revenue === bestValues.ecom_revenue;
                    return (
                      <td
                        key={v.variant_id}
                        className={`py-2 px-4 font-semibold border-r border-slate-100 ${
                          isBest ? "bg-emerald-50 text-emerald-800" : "text-purple-900"
                        }`}
                      >
                        ₹{v.ecom_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        {isBest && <span className="ml-1 text-[10px] text-emerald-600">★</span>}
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* Total Revenue Combined */}
              <tr className="hover:bg-sky-50/20 bg-sky-50/40">
                <td className="sticky left-0 z-10 bg-sky-100/70 py-2.5 px-4 font-bold text-sky-950 border-r border-slate-200">
                  Total Combined Revenue
                </td>
                {variants.map((v) => {
                  const isBest = v.total_revenue > 0 && v.total_revenue === bestValues.total_revenue;
                  return (
                    <td
                      key={v.variant_id}
                      className={`py-2.5 px-4 font-bold border-r border-slate-100 ${
                        isBest ? "bg-emerald-100 text-emerald-900" : "text-sky-900"
                      }`}
                    >
                      ₹{v.total_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      {isBest && <span className="ml-1 text-[10px] text-emerald-700">★</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Top Supplier */}
              <tr className="hover:bg-sky-50/20">
                <td className="sticky left-0 z-10 bg-white py-2 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  Top Supplier
                </td>
                {variants.map((v) => (
                  <td key={v.variant_id} className="py-2 px-4 text-slate-800 border-r border-slate-100">
                    {v.top_supplier}
                  </td>
                ))}
              </tr>

              {/* E-Com Repeat Buyer Rate */}
              {ecomAccess && (
                <tr className="hover:bg-sky-50/20 bg-purple-50/20">
                  <td className="sticky left-0 z-10 bg-purple-50/50 py-2 px-4 font-semibold text-purple-900 border-r border-slate-200">
                    E-Com Repeat Buyer %
                  </td>
                  {variants.map((v) => {
                    const isBest = v.ecom_repeat_buyer_rate > 0 && v.ecom_repeat_buyer_rate === bestValues.ecom_repeat_buyer_rate;
                    return (
                      <td
                        key={v.variant_id}
                        className={`py-2 px-4 font-semibold border-r border-slate-100 ${
                          isBest ? "bg-emerald-50 text-emerald-800" : "text-purple-800"
                        }`}
                      >
                        {v.ecom_repeat_buyer_rate}%
                        {isBest && <span className="ml-1 text-[10px] text-emerald-600">★</span>}
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* Action: Deep Dive link */}
              <tr className="hover:bg-sky-50/20 bg-slate-50/40">
                <td className="sticky left-0 z-10 bg-slate-100 py-2.5 px-4 font-semibold text-slate-700 border-r border-slate-200">
                  Detailed Report
                </td>
                {variants.map((v) => (
                  <td key={v.variant_id} className="py-2.5 px-4 border-r border-slate-100">
                    <Link
                      href={`/${company}/workspace/reports/product-variants/${v.variant_id}`}
                      className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition"
                    >
                      View Deep Dive →
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function MultiVariantComparisonPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50/60 p-6 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-600 font-medium">Loading variant comparison...</p>
        </div>
      }
    >
      <VariantComparisonContent />
    </Suspense>
  );
}
