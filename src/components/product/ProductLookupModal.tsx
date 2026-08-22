"use client";

import { createPortal } from "react-dom";
import ProductFilters from "@/app/[company]/(user)/workspace/inventory/products/components/ProductFilters";
import {
  PRODUCT_LOOKUP_COLUMNS,
  PRODUCT_LOOKUP_COLUMN_LABELS,
  ProductLookupItem,
} from "@/lib/product-lookup";
import type { ProductLookupFilters } from "@/hooks/useProductLookup";

type ProductLookupModalProps = {
  open: boolean;
  onClose: () => void;
  onAddSelected: () => void;
  onAddNew?: () => void;
  isEditable?: boolean;
  errorMessage?: string;
  items: ProductLookupItem[];
  loading: boolean;
  filters: ProductLookupFilters;
  onFiltersChange: (next: ProductLookupFilters) => void;
  categoryOptions: Array<{ value: string; label: string }>;
  page: number;
  totalPages: number;
  itemsPerPage: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  isSelected: (item: ProductLookupItem) => boolean;
  onToggle: (item: ProductLookupItem) => void;
  onToggleAll: (checked: boolean, pageItems: ProductLookupItem[]) => void;
  selectedCount?: number;
  showBarcodeInput?: boolean;
  barcodeValue?: string;
  barcodeMessage?: string;
  onBarcodeChange?: (value: string) => void;
  onBarcodeSubmit?: (value?: string) => void;
};

export default function ProductLookupModal({
  open,
  onClose,
  onAddSelected,
  onAddNew,
  isEditable = true,
  errorMessage,
  items,
  loading,
  filters,
  onFiltersChange,
  categoryOptions,
  page,
  totalPages,
  itemsPerPage,
  totalCount,
  onPageChange,
  isSelected,
  onToggle,
  onToggleAll,
  showBarcodeInput = false,
  barcodeValue = "",
  barcodeMessage,
  onBarcodeChange,
  onBarcodeSubmit,
  selectedCount,
}: ProductLookupModalProps) {
  if (!open) return null;

  const startIndex = totalCount === 0 ? 0 : (page - 1) * itemsPerPage + 1;
  const endIndex = Math.min(page * itemsPerPage, totalCount);

  const maxVisible = 5;
  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, page + 2);
  if (page <= 3) {
    start = 1;
    end = Math.min(totalPages, maxVisible);
  }
  if (page > totalPages - 3) {
    start = Math.max(1, totalPages - maxVisible + 1);
    end = totalPages;
  }
  const pages = [];
  for (let i = start; i <= end; i += 1) {
    pages.push(i);
  }

  const allSelected = items.length > 0 && items.every((item) => isSelected(item));
  const countToShow = selectedCount !== undefined ? selectedCount : items.filter(isSelected).length;

  const isPurchaseLookup = items.some(i => i.last_price_this_supplier !== undefined);

  return createPortal(
    <div className="fixed inset-0 z-[100002] bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[1200px] max-w-[95vw] h-[700px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-700">Select Products</h2>

          <div className="flex items-end gap-3">
            {errorMessage && <span className="text-red-500 text-sm">{errorMessage}</span>}
            {onAddNew ? (
              <button
                type="button"
                onClick={onAddNew}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                + Add New ItemPO
              </button>
            ) : null}
            <button onClick={onClose} className="text-gray-500 hover:text-black text-xl">
              x
            </button>
          </div>
        </div>

        <div className="p-4 border-b bg-white space-y-3">
          <ProductFilters
            values={filters}
            onChange={onFiltersChange}
            categoryOptions={categoryOptions}
            searchPlaceholder="Search by SKU or product name"
            barcodeValue={barcodeValue}
            barcodeMessage={barcodeMessage}
            onBarcodeChange={onBarcodeChange}
            onBarcodeSubmit={onBarcodeSubmit}
          />
        </div>

        <div className="bg-white shadow-lg flex-1 overflow-y-auto relative">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-gray-50 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
              <tr className="border-t hover:bg-blue-50 transition">
                <th className="p-3 w-12 text-center bg-gray-50">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onToggleAll(e.target.checked, items)}
                  />
                </th>
                {PRODUCT_LOOKUP_COLUMNS.map((col) => (
                  <th key={col} className="p-3 text-left text-gray-600 font-semibold bg-gray-50">
                    {PRODUCT_LOOKUP_COLUMN_LABELS[col]}
                  </th>
                ))}
                {isPurchaseLookup && (
                  <th className="p-3 text-left text-gray-600 font-semibold bg-gray-50">
                    Supplier Price
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr className="border-t">
                  <td colSpan={isPurchaseLookup ? 9 : 8} className="p-6 text-center text-gray-500">
                    Loading products...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={isPurchaseLookup ? 9 : 8} className="p-6 text-center text-gray-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const cells: Record<string, React.ReactNode> = {
                    code: item.code || item.product_code || "-",
                    sku: item.sku || "-",
                    color: item.color || "-",
                    name: item.name || "-",
                    description: item.description || "-",
                    category: item.category_name || item.category || "-",
                    current_stock: (() => {
                      const stockVal = item.current_stock != null ? +item.current_stock : 0;
                      if (stockVal <= 0) {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                            {stockVal}
                          </span>
                        );
                      }
                      if (stockVal < 10) {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                            {stockVal}
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          {stockVal}
                        </span>
                      );
                    })(),
                  };
                  const isRowSelected = isSelected(item);
                  return (
                    <tr
                      key={item.variant_id}
                      id={`product-row-${item.variant_id}`}
                      onClick={() => onToggle(item)}
                      className={`border-t cursor-pointer transition-colors hover:bg-blue-50/50 ${
                        isRowSelected ? "bg-blue-50 font-medium border-l-4 border-l-blue-600" : ""
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isRowSelected}
                          onChange={() => onToggle(item)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      {PRODUCT_LOOKUP_COLUMNS.map((col) => (
                        <td key={col} className={`p-3 ${isRowSelected ? "text-blue-900" : "text-gray-600"}`}>
                          {cells[col]}
                        </td>
                      ))}
                      {isPurchaseLookup && (
                        <td className={`p-3 ${isRowSelected ? "text-blue-900" : "text-gray-600"}`}>
                          <div className="flex items-center gap-2">
                            <span>{item.last_price_this_supplier != null ? item.last_price_this_supplier : "-"}</span>
                            {item.lowest_price_overall != null && item.last_price_this_supplier != null && item.lowest_price_overall < item.last_price_this_supplier && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-800"
                                title={`Cheaper elsewhere: ${item.lowest_price_overall} from ${item.lowest_price_supplier_name || "another supplier"} on ${item.lowest_price_date ? new Date(item.lowest_price_date).toLocaleDateString() : ""}`}
                              >
                                !
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center px-6 py-4 bg-gray-50 border-t">
          <p className="text-sm text-gray-500">
            Showing {startIndex}-{endIndex} of {totalCount} items
          </p>

          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50 hover:bg-gray-100"
            >
              Prev
            </button>

            {start > 1 && (
              <>
                <button
                  onClick={() => onPageChange(1)}
                  className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-100"
                >
                  1
                </button>
                {start > 2 && <span className="px-2 text-sm text-gray-500">...</span>}
              </>
            )}

            {pages.map((p) => (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`px-3 py-1 text-sm border rounded transition-colors ${page === p
                  ? "bg-[var(--color-blue-600)] text-white border-indigo-600"
                  : "bg-white text-gray-600 hover:bg-gray-100"
                  }`}
              >
                {p}
              </button>
            ))}

            {end < totalPages && (
              <>
                {end < totalPages - 1 && <span className="px-2 text-sm text-gray-500">...</span>}
                <button
                  onClick={() => onPageChange(totalPages)}
                  className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-100"
                >
                  {totalPages}
                </button>
              </>
            )}

            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-3 py-1 text-sm border rounded bg-white disabled:opacity-50 hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-3 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!isEditable) return;
              onAddSelected();
            }}
            className={`px-4 py-2 rounded-md text-white ${!isEditable ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              }`}
          >
            Add Selected {countToShow > 0 ? `(${countToShow})` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
