"use client";
import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import flatpickr from "flatpickr";
import { useTenant } from "@/context/TenantContext";
import { useCompanySettings } from "@/context/CompanySettingsContext";


const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function StatisticsChart() {
  const datePickerRef = useRef<HTMLInputElement>(null);
  const { company } = useTenant();
  const { settings } = useCompanySettings();
  const loaded = useRef(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatistics = async () => {
      if (!company || !settings) return;
      const { yearType, financialYearStart, financialYearEnd } = settings;
      try {
        setLoading(true);
        const url = `/api/dashboard/statistics?yearType=${yearType || 'fiscal'}&fromDate=${financialYearStart}&toDate=${financialYearEnd}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-tenant": company
          }
        });
        const result = await res.json();
        if (result.success) {
          console.log("Statistics Data:", result.data);
          setSeries([
            {
              name: "Sales",
              data: result.data.sales
            },
            {
              name: "Revenue",
              data: result.data.revenue
            }
          ]);
        }
      } catch (error) {
        console.error("Statistics Fetch Error", error);
      } finally {
        setLoading(false);
      }
    };
    loadStatistics();
  }, [company, settings]);

  const categories = settings?.yearType === 'calendar' 
    ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    : ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

  useEffect(() => {
    if (!datePickerRef.current) return;

    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);

    const fp = flatpickr(datePickerRef.current, {
      mode: "range",
      static: true,
      monthSelectorType: "static",
      dateFormat: "M d",
      defaultDate: [sevenDaysAgo, today],
      clickOpens: true,
      onChange: (selectedDates) => {
        if (selectedDates.length === 2) {
          // console.log("Start Date:", selectedDates[0]);
          // console.log("End Date:", selectedDates[1]);
        }
      },
      prevArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 15L7.5 10L12.5 5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      nextArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 15L12.5 10L7.5 5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });

    return () => {
      if (!Array.isArray(fp)) {
        fp.destroy();
      }
    };
  }, []);

  const options: ApexOptions = {
    legend: {
      show: false, // Hide legend
      position: "top",
      horizontalAlign: "left",
    },
    colors: ["#465fff", "#9cb9ff"], // Define line colors
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 310,
      type: "line", // Set the chart type to 'line'
      toolbar: {
        show: false, // Hide chart toolbar
      },
    },
    stroke: {
      curve: "smooth", // Define the line style (straight, smooth, or step)
      width: [2, 2], // Line width for each dataset
    },

    fill: {
      type: "gradient",
      gradient: {
        opacityFrom: 0.55,
        opacityTo: 0,
      },
    },
    markers: {
      size: 0, // Size of the marker points
      strokeColors: "#fff", // Marker border color
      strokeWidth: 2,
      hover: {
        size: 6, // Marker size on hover
      },
    },
    grid: {
      xaxis: {
        lines: {
          show: false, // Hide grid lines on x-axis
        },
      },
      yaxis: {
        lines: {
          show: true, // Show grid lines on y-axis
        },
      },
    },
    dataLabels: {
      enabled: false, // Disable data labels
    },
    tooltip: {
      enabled: true, // Enable tooltip
      x: {
        format: "dd MMM yyyy", // Format for x-axis tooltip
      },
    },
    xaxis: {
      type: "category", // Category-based x-axis
      categories: categories,
      axisBorder: {
        show: false, // Hide x-axis border
      },
      axisTicks: {
        show: false, // Hide x-axis ticks
      },
      tooltip: {
        enabled: false, // Disable tooltip for x-axis points
      },
    },
    yaxis: {
      labels: {
        style: {
          fontSize: "12px", // Adjust font size for y-axis labels
          colors: ["#6B7280"], // Color of the labels
        },
      },
      title: {
        text: "", // Remove y-axis title
        style: {
          fontSize: "0px",
        },
      },
    },
  };

  const [series, setSeries] = useState([
    { name: "Sales", data: new Array(12).fill(0) },
    { name: "Revenue", data: new Array(12).fill(0) }
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
        <span className="ml-2 text-sm text-gray-500">
          Loading statistics...
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Statistics
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            Target you've set for each month
          </p>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[1000px] xl:min-w-full">
          <Chart options={options} series={series} type="area" height={310} />
        </div>
      </div>
    </div>
  );
}