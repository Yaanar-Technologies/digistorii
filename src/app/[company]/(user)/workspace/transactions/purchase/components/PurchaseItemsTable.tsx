"use client";

import { useEffect, useMemo, useRef, useState, RefObject } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";
import type { PurchaseDetail } from "./types";

type PurchaseItemsTableProps = {
  details: PurchaseDetail[];
  errors: any;
  isEditable: boolean;
  allTaxes: any[];
  updateRow: <K extends keyof PurchaseDetail>(index: number, field: K, value: PurchaseDetail[K]) => void;
  removeRow: (index: number) => void;
  totalQty: number;
  totalAmount: number;
  onAddItems: () => void;
  showAddItems: boolean;
  onAddNewProduct: () => void;
  barcodeValue: string;
  onBarcodeChange: (value: string) => void;
  onBarcodeSubmit: () => void;
  barcodeMessage: string;
  barcodeInputRef: RefObject<HTMLInputElement | null>;
  onTaxChange: (index: number, taxId: number | "") => void;
  onBulkApply: (payload: {
    variantIds: string[];
    rate?: number;
    qty?: number;
    taxId?: number | "";
  }) => void;
  productTypeLabel: Record<string, string>;
};

export default function PurchaseItemsTable({
  details,
  errors,
  isEditable,
  allTaxes,
  updateRow,
  removeRow,
  totalQty,
  totalAmount,
  onAddItems,
  showAddItems,
  onAddNewProduct,
  barcodeValue,
  onBarcodeChange,
  onBarcodeSubmit,
  barcodeMessage,
  barcodeInputRef,
  onTaxChange,
  onBulkApply,
  productTypeLabel,
}: PurchaseItemsTableProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [uomFilter, setUomFilter] = useState("");
  const [bulkRate, setBulkRate] = useState("");
  const [bulkQty, setBulkQty] = useState("");
  const [bulkTaxId, setBulkTaxId] = useState("");
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedItems((prev) =>
      prev.filter((id) => details.some((row) => String(row.product_id) === id))
    );
  }, [details]);

  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    details.forEach((row) => {
      const value = String((row as any).type || (row as any).product_type || "");
      if (value) types.add(value);
    });
    return Array.from(types);
  }, [details]);

  const uomOptions = useMemo(() => {
    const uoms = new Set<string>();
    details.forEach((row) => {
      const value = String(row.uom_code || row.uom_name || row.uom || "");
      if (value) uoms.add(value);
    });
    return Array.from(uoms);
  }, [details]);

  const filteredDetails = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return details
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        const name = row.product_name || "";
        const code = row.product_code || "";
        const rowType = String((row as any).type || (row as any).product_type || "");
        const rowUom = String(row.uom_code || row.uom_name || row.uom || "");
        const matchesSearch = searchValue
          ? `${name} ${code}`.toLowerCase().includes(searchValue)
          : true;
        const matchesType = typeFilter ? rowType === typeFilter : true;
        const matchesUom = uomFilter ? rowUom === uomFilter : true;
        return matchesSearch && matchesType && matchesUom;
      });
  }, [details, search, typeFilter, uomFilter]);

  const filteredIds = useMemo(
    () =>
      filteredDetails
        .map(({ row }) => (row.product_id ? String(row.product_id) : ""))
        .filter((id) => id),
    [filteredDetails]
  );

  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedItems.includes(id));
  const someFilteredSelected =
    filteredIds.length > 0 && filteredIds.some((id) => selectedItems.includes(id));
  const bulkBarVisible = selectedItems.length > 0;

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
  }, [someFilteredSelected, allFilteredSelected]);

  const toggleAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelectedItems((prev) => Array.from(new Set([...prev, ...filteredIds])));
    } else {
      setSelectedItems((prev) => prev.filter((id) => !filteredIds.includes(id)));
    }
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedItems((prev) => {
      if (checked) return Array.from(new Set([...prev, id]));
      return prev.filter((item) => item !== id);
    });
  };

  const handleApplyBulk = () => {
    if (!isEditable || !selectedItems.length) return;
    const rateValue = bulkRate.trim() === "" ? undefined : Number(bulkRate);
    const qtyValue = bulkQty.trim() === "" ? undefined : Number(bulkQty);
    const taxValue = bulkTaxId === "" ? undefined : Number(bulkTaxId);

    const payload = {
      variantIds: selectedItems,
      rate: Number.isFinite(rateValue) ? rateValue : undefined,
      qty: Number.isFinite(qtyValue) ? qtyValue : undefined,
      taxId: Number.isFinite(taxValue as number) ? (taxValue as number) : undefined,
    };

    if (payload.rate === undefined && payload.qty === undefined && payload.taxId === undefined) {
      return;
    }

    onBulkApply(payload);
  };

  return (
    <>
      <div className="flex flex-col gap-3 pt-4 px-4 py-3 bg-indigo-50/60 border border-indigo-100 rounded-xl shadow-sm sticky top-0 z-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <div className="flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by product name or code..."
                className="border p-2 rounded w-full"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border p-2 rounded min-w-[150px]"
              >
                <option value="">All Types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {productTypeLabel[type] ?? type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showAddItems && isEditable && (
            <div className="flex items-end gap-3">
              <div className="flex flex-col">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeValue}
                  onChange={(e) => onBarcodeChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onBarcodeSubmit();
                    }
                  }}
                  placeholder="Scan barcode"
                  className="border p-2 rounded w-56"
                />
                {barcodeMessage ? (
                  <span className="text-xs text-red-500 mt-1">{barcodeMessage}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isEditable) return;
                  onAddItems();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 h-[42px] rounded font-medium flex items-center justify-center gap-1 whitespace-nowrap"
              >
                Add Items
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isEditable) return;
                  onAddNewProduct();
                }}
                className="border border-blue-600 text-blue-600 px-4 h-[42px] rounded font-medium flex items-center justify-center gap-1 whitespace-nowrap hover:bg-blue-50"
              >
                Add New Product
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <div className="min-h-[420px] max-h-[420px] overflow-y-auto">
          {bulkBarVisible && (
            <div className="sticky top-0 z-20 bg-white border-b px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  value={bulkQty}
                  onChange={(e) => setBulkQty(e.target.value)}
                  placeholder="Quantity"
                  className="border p-2 rounded w-28"
                  disabled={!isEditable}
                />
                <input
                  type="number"
                  value={bulkRate}
                  onChange={(e) => setBulkRate(e.target.value)}
                  placeholder="Unit Price"
                  className="border p-2 rounded w-32"
                  disabled={!isEditable}
                />

                <select
                  value={bulkTaxId}
                  onChange={(e) => setBulkTaxId(e.target.value)}
                  className="border p-2 rounded min-w-[180px]"
                  disabled={!isEditable}
                >
                  <option value="">Tax Group</option>
                  {allTaxes.map((tax) => (
                    <option key={tax.id} value={tax.id}>
                      {tax.tax_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyBulk}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 h-[38px] rounded font-medium"
                  disabled={!isEditable}
                >
                  Apply to Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedItems([])}
                  className="border border-gray-300 text-gray-700 px-4 h-[38px] rounded font-medium hover:bg-gray-50"
                  disabled={!isEditable}
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}
          <table className="w-full text-sm">
            <thead
              className={`bg-indigo-50 text-gray-600 text-sm sticky ${bulkBarVisible ? "top-[56px]" : "top-0"
                } z-10 shadow-sm`}
            >
              <tr className="border-t hover:bg-blue-50 transition">
                <th className="p-3 text-sm text-center w-10">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => toggleAllFiltered(e.target.checked)}
                    disabled={!isEditable || filteredIds.length === 0}
                  />
                </th>
                <th className="p-3 text-sm text-left">Product Code</th>
                <th className="p-3 text-sm text-left">Product Name</th>
                <th className="p-3 text-sm text-left">Description</th>
                <th className="p-3 text-sm">HSN No</th>
                <th className="p-3 text-sm">Qty</th>
                <th className="p-3 text-sm">UOM</th>
                <th className="p-3 text-sm">Unit Price</th>
                <th className="p-3 text-sm">Amount</th>
                <th className="p-3 text-sm">Tax Group</th>
                <th className="p-3 text-sm">Tax Amt</th>
                <th className="p-3 text-sm">Total</th>
                <th className="p-3 w-[40px]"></th>
              </tr>
            </thead>

            <tbody>
              {filteredDetails.map(({ row, index }) => {
                const rowId = row.product_id ? String(row.product_id) : "";
                return (
                  <tr
                    key={rowId || `${row.product_code}-${index}`}
                    className="border-t hover:bg-blue-50 transition"
                  >
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(rowId)}
                        onChange={(e) => toggleRow(rowId, e.target.checked)}
                        disabled={!isEditable || !rowId}
                      />
                    </td>
                    <td className="p-2">
                      <div>{row.product_code}</div>
                      {errors[`product_code_${index}`] && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors[`product_code_${index}`]}
                        </p>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{row.product_name}</span>
                        {(row.is_new === true || Boolean(row.temp_id) || String(row.product_id).startsWith("temp-")) && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            NEW (unsaved)
                          </span>
                        )}
                      </div>
                      {errors[`product_name_${index}`] && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors[`product_name_${index}`]}
                        </p>
                      )}
                    </td>
                    <td className="p-2">
                      {row.description}
                      {/* <input
                        value={row.description || ""}
                        disabled={!isEditable}
                        onChange={(e) => updateRow(index, "description", e.target.value)}
                        className="border p-1 rounded w-full"
                      />
                      {errors[`description_${index}`] && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors[`description_${index}`]}
                        </p>
                      )} */}
                    </td>
                    <td className="p-2">
                      <div>{row.hsn_no}</div>
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        disabled={!isEditable}
                        value={row.qty === "" ? "" : row.qty}
                        onChange={(e) =>
                          updateRow(
                            index,
                            "qty",
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className={`border p-1 rounded w-20 ${errors[`qty_${index}`] ? "border-red-500" : ""
                          }`}
                      />
                      {errors[`qty_${index}`] && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors[`qty_${index}`]}
                        </p>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="text-gray-700">{row.uom_code || row.uom_name}</div>
                    </td>

                    <td className="text-right">
                      <input
                        type="number"
                        disabled={!isEditable}
                        value={row.rate === "" ? "" : row.rate}
                        onChange={(e) =>
                          updateRow(
                            index,
                            "rate",
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className={`border p-1 rounded w-20 ${errors[`rate_${index}`] ? "border-red-500" : ""
                          }`}
                      />
                      {errors[`rate_${index}`] && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors[`rate_${index}`]}
                        </p>
                      )}
                    </td>

                    <td className="text-right">{Number(row.amount || 0).toFixed(2)}</td>
                    <td className="text-center">
                      <select
                        value={row.tax_id ?? ""}
                        disabled={!isEditable}
                        onChange={(e) => {
                          const value = e.target.value === "" ? "" : Number(e.target.value);
                          onTaxChange(index, value);
                        }}
                        className="border p-1 rounded w-25"
                      >
                        <option value="">--Select--</option>
                        {allTaxes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.tax_name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right">{Number(row.tax_amount || 0).toFixed(2)}</td>
                    <td className="text-right">{Number(row.line_total || 0).toFixed(2)}</td>
                    <td className="p-2 text-center align-middle">
                      {isEditable && (
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="text-red-600 hover:text-red-800 inline-flex items-center justify-center"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <div className="flex gap-6 text-sm font-medium text-gray-700">
            <div>
              Total Items: <span className="font-bold">{details.length}</span>
            </div>
            <div>
              Total Qty: <span className="font-bold">{totalQty}</span>
            </div>
            <div>
              Total Amount: <span className="font-bold">{totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
