"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

type FilterValues = {
  search: string;
  type: string;
  category: string;
  source: string;
  status?: string;
};

type Option = { value: string; label: string };

type ProductFiltersProps = {
  values: FilterValues;
  onChange: (next: FilterValues) => void;
  categoryOptions: Option[];
  showStatus?: boolean;
  searchPlaceholder?: string;
  barcodeValue?: string;
  barcodeMessage?: string;
  onBarcodeChange?: (value: string) => void;
  onBarcodeSubmit?: (value?: string) => void;
};

export default function ProductFilters({
  values,
  onChange,
  categoryOptions,
  showStatus = false,
  searchPlaceholder,
  barcodeValue = "",
  barcodeMessage = "",
  onBarcodeChange,
  onBarcodeSubmit,
}: ProductFiltersProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className={`grid gap-3 ${showStatus ? "md:grid-cols-6" : "md:grid-cols-5"}`}>
        <div className="relative">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
          <input
            value={values.search}
            onChange={(e) => onChange({ ...values, search: e.target.value })}
            placeholder={searchPlaceholder || "Search by name or product code"}
            className="w-full rounded-lg border border-gray-300 px-10 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={values.type}
          onChange={(e) => onChange({ ...values, type: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Product Types</option>
          <option value="finished_good">Finished Good</option>
          <option value="raw_material">Raw Material</option>
          <option value="other">Other</option>
        </select>
        <select
          value={values.category}
          onChange={(e) => onChange({ ...values, category: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Categories</option>
          {categoryOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          value={values.source}
          onChange={(e) => onChange({ ...values, source: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Sources</option>
          <option value="own">Own</option>
          <option value="vendor">Vendor</option>
        </select>
        {showStatus ? (
          <select
            value={values.status || ""}
            onChange={(e) => onChange({ ...values, status: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        ) : null}
        <div>
          <input
            value={barcodeValue}
            onChange={(e) => onBarcodeChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onBarcodeSubmit?.(barcodeValue);
              }
            }}
            placeholder="Scan barcode"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          {barcodeMessage ? <p className="mt-1 text-xs text-red-500">{barcodeMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}
