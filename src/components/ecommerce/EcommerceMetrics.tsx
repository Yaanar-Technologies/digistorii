"use client";

import React, { useEffect, useState, useRef } from "react";
import Badge from "../ui/badge/Badge";
import { ArrowDownIcon, ArrowUpIcon, BoxIconLine } from "@/icons";
import { CurrencyRupeeIcon } from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";

interface MetricsData {
  todaySalesCount: number;
  salesCountGrowth: number;
  todayAov: number;
  aovGrowth: number;
}

const formatINR = (amount: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

export const EcommerceMetrics = () => {
  const { company } = useTenant();
  const loaded = useRef(false);
  const [loading, setLoading] = useState(true);

  const [metrics, setMetrics] = useState<MetricsData>({
    todaySalesCount: 0,
    salesCountGrowth: 0,
    todayAov: 0,
    aovGrowth: 0,
  });

  useEffect(() => {
    const loadMetrics = async () => {
      if (!company) return;
      if (loaded.current) return;
      loaded.current = true;
      try {
        setLoading(true);
        const res = await fetch("/api/dashboard/metrics", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-tenant": company,
          },
        });
        const result = await res.json();
        if (result.success && result.data) {
          setMetrics({
            todaySalesCount: Number(result.data.todaySalesCount ?? result.data.orders ?? 0),
            salesCountGrowth: Number(result.data.salesCountGrowth ?? result.data.orderGrowth ?? 0),
            todayAov: Number(result.data.todayAov ?? 0),
            aovGrowth: Number(result.data.aovGrowth ?? 0),
          });
        }
      } catch (error) {
        console.error("Metrics load error", error);
      } finally {
        setLoading(false);
      }
    };
    loadMetrics();
  }, [company]);

  // SHOW LOADER INSTEAD OF EMPTY VALUES
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
        <span className="ml-2 text-sm text-gray-500">Loading sales metrics...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      {/* <!-- Card 1: Today's Sales (Count) --> */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl dark:bg-gray-800">
          <BoxIconLine className="w-6 h-6 text-white" />
        </div>

        <div className="flex items-end justify-between mt-5">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Today's Sales
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {metrics.todaySalesCount.toLocaleString("en-IN")}
            </h4>
          </div>
          <Badge color={metrics.salesCountGrowth >= 0 ? "success" : "error"}>
            {metrics.salesCountGrowth >= 0 ? <ArrowUpIcon /> : <ArrowDownIcon />}
            {Math.abs(metrics.salesCountGrowth)}%
          </Badge>
        </div>
      </div>

      {/* <!-- Card 2: Avg. Order Value --> */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl dark:bg-gray-800">
          <CurrencyRupeeIcon className="w-6 h-6 text-white" />
        </div>

        <div className="flex items-end justify-between mt-5">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Avg. Order Value
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {formatINR(metrics.todayAov)}
            </h4>
          </div>

          <Badge color={metrics.aovGrowth >= 0 ? "success" : "error"}>
            {metrics.aovGrowth >= 0 ? <ArrowUpIcon /> : <ArrowDownIcon />}
            {Math.abs(metrics.aovGrowth)}%
          </Badge>
        </div>
      </div>
    </div>
  );
};
