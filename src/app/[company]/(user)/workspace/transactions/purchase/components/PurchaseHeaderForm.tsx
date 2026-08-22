"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { getRuleValidationError } from "@/lib/formValidationRules";
import Select from "react-select";
import type {
  Currency,
  DespatchTerm,
  PaymentTerm,
  PurchaseHeader,
  Supplier,
  Warehouse,
  LocationOption,
} from "./types";

type PurchaseHeaderFormProps = {
  header: PurchaseHeader;
  setHeader: Dispatch<SetStateAction<PurchaseHeader>>;
  errors: any;
  setErrors: Dispatch<SetStateAction<any>>;
  isEditable: boolean;
  activeTab: "items" | "additional";
  setActiveTab: Dispatch<SetStateAction<"items" | "additional">>;
  allSuppliers: Supplier[];
  allDespatchTerms: DespatchTerm[];
  allPaymentTerms: PaymentTerm[];
  currencyCode: string;
  allWarehouses: Warehouse[];
  allLocations: LocationOption[];
  selectedWarehouseId: string;
  setSelectedWarehouseId: Dispatch<SetStateAction<string>>;
  setAttachmentFile: Dispatch<SetStateAction<File | null>>;
};

export default function PurchaseHeaderForm({
  header,
  setHeader,
  errors,
  setErrors,
  isEditable,
  activeTab,
  setActiveTab,
  allSuppliers,
  allDespatchTerms,
  allPaymentTerms,
  currencyCode,
  allWarehouses,
  allLocations,
  selectedWarehouseId,
  setSelectedWarehouseId,
  setAttachmentFile,
}: PurchaseHeaderFormProps) {

  // Auto-sync Bill To and Ship To addresses whenever selectedWarehouseId or data lists change
  useEffect(() => {
    if (!selectedWarehouseId || allWarehouses.length === 0) return;

    const warehouse = allWarehouses.find((w) => String(w.id) === String(selectedWarehouseId));
    if (!warehouse) return;

    const location = allLocations.find((l) => String(l.id) === String(warehouse.location_id));

    const shipToText = [
      warehouse.address_line_1,
      warehouse.address_line_2,
      warehouse.city,
      warehouse.state,
      warehouse.country,
      warehouse.pincode,
    ].filter(Boolean).join(", ");

    const billToText = location
      ? [
        location.bill_address_line_1,
        location.bill_address_line_2,
        location.bill_city,
        location.bill_state,
        location.bill_country,
        location.bill_pincode,
      ].filter(Boolean).join(", ")
      : "";

    setHeader((prev) => {
      // Prevent unnecessary state updates if addresses are already identical
      if (prev.bill_to === billToText && prev.ship_to === shipToText) {
        return prev;
      }
      return {
        ...prev,
        bill_to: billToText,
        ship_to: shipToText,
      };
    });
  }, [selectedWarehouseId, allWarehouses, allLocations, setHeader]);

  return (
    <>
      <div className="flex gap-2 border-b pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("items")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === "items"
              ? "bg-[var(--color-blue-600)] text-white"
              : "bg-gray-100 text-gray-700"
            }`}
        >
          Items
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("additional")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === "additional"
              ? "bg-[var(--color-blue-600)] text-white"
              : "bg-gray-100 text-gray-700"
            }`}
        >
          Additional Details
        </button>
      </div>

      {activeTab === "items" && (
        <div className="bg-white p-6 rounded-xl shadow grid md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-semibold mb-1 block">PO Type</label>
            <select
              value={header.po_type}
              disabled={!isEditable}
              onChange={(e) => {
                const value = e.target.value as "standard" | "manual";
                setHeader((prev) => ({
                  ...prev,
                  po_type: value,
                  purchase_no: value === "standard" ? "" : prev.purchase_no,
                }));
                setErrors((prev: any) => {
                  const next = { ...prev };
                  delete next.purchase_no;
                  return next;
                });
              }}
              className="border p-2 rounded w-full"
            >
              <option value="standard">Standard</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">
              {header.po_type === "manual" ? "Customer PO No" : "PO No"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              value={header.purchase_no}
              onChange={(e) => {
                const value = e.target.value;
                setHeader({ ...header, purchase_no: value });
                if (value) {
                  setErrors((prev: any) => ({
                    ...prev,
                    purchase_no: "",
                  }));
                }
              }}
              className={`border p-2 rounded w-full ${header.po_type === "standard"
                  ? "bg-gray-100 text-indigo-600 font-semibold"
                  : ""
                }`}
              readOnly={!isEditable || header.po_type === "standard"}
            />
            {errors.purchase_no && (
              <p className="text-red-500 text-sm mt-1">{errors.purchase_no}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">
              PO Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              disabled={!isEditable}
              value={header.purchase_date}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => {
                const value = e.target.value;
                setHeader({ ...header, purchase_date: value });
                if (value) {
                  setErrors((prev: any) => ({
                    ...prev,
                    purchase_date: "",
                  }));
                }
              }}
              className={`border p-2 rounded w-full ${errors.purchase_date ? "border-red-500" : ""
                }`}
            />
            {errors.purchase_date && (
              <p className="text-red-500 text-sm mt-1">{errors.purchase_date}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">
              Req Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              disabled={!isEditable}
              value={header.req_date}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => {
                const value = e.target.value;
                setHeader({ ...header, req_date: value });
                if (value) {
                  setErrors((prev: any) => ({
                    ...prev,
                    req_date: "",
                  }));
                }
              }}
              className={`border p-2 rounded w-full ${errors.req_date ? "border-red-500" : ""
                }`}
            />
            {errors.req_date && (
              <p className="text-red-500 text-sm mt-1">{errors.req_date}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">Reference No</label>
            <input
              value={header.ref_no || ""}
              onChange={(e) => {
                const val = e.target.value;
                setHeader({ ...header, ref_no: val });
                const error = getRuleValidationError("alphanumeric-spaces-hyphens", val);
                setErrors((prev: any) => ({
                  ...prev,
                  ref_no: error || "",
                }));
              }}
              className={`border p-2 rounded w-full ${errors.ref_no ? "border-red-500" : ""
                }`}
            />
            {errors.ref_no && (
              <p className="text-red-500 text-sm mt-1">{errors.ref_no}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">
              Supplier <span className="text-red-500">*</span>
            </label>
            <Select
              isDisabled={!isEditable}
              placeholder="Select Supplier"
              value={
                allSuppliers
                  .map((s) => ({
                    value: s.id,
                    label: `${s.supplier_code}-${s.name}`,
                    supplier: s,
                  }))
                  .find((opt) => String(opt.value) === String(header.supplier_id)) || null
              }
              options={allSuppliers.map((s) => ({
                value: s.id,
                label: s.purchase_hold
                  ? `${s.supplier_code}-${s.name} (On Hold)`
                  : `${s.supplier_code}-${s.name}`,
                supplier: s,
                isDisabled: s.purchase_hold,
              }))}
              isSearchable
              menuPortalTarget={document.body}
              menuPosition="fixed"
              styles={{
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              }}
              onChange={(option: any) => {
                const supplierId = option?.value;
                const selectedSupplier = option?.supplier;

                const despatchId =
                  allDespatchTerms.find((t) => t.code === selectedSupplier?.dispatch_terms)?.id || "";

                const paymentId =
                  allPaymentTerms.find((t) => t.name === selectedSupplier?.payment_terms)?.id || "";

                setHeader({
                  ...header,
                  supplier_id: supplierId,
                  currency: selectedSupplier?.currency || "",
                  despatch_terms: despatchId ? String(despatchId) : "",
                  payment_terms: paymentId ? String(paymentId) : "",
                });

                setErrors((prev: any) => {
                  const newErrors = { ...prev };
                  delete newErrors.supplier_id;
                  delete newErrors.currency;
                  return newErrors;
                });
              }}
            />
            {errors.supplier_id && (
              <p className="text-red-500 text-sm mt-1">{errors.supplier_id}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">
              Currency <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={currencyCode || ""}
              readOnly
              className="border p-2 rounded w-full bg-gray-100"
            />
            {errors.currency && <p className="text-red-500 text-sm mt-1">{errors.currency}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">Conversion Rate</label>
            <input
              type="number"
              value={header.conversion_rate ?? ""}
              className="border p-2 rounded w-full"
              onChange={(e) => {
                const val = e.target.value;
                setHeader({
                  ...header,
                  conversion_rate: val === "" ? "" : Math.max(0, Number(val)),
                });
              }}
            />
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">Subtotal</label>
            <input
              type="text"
              value={Number(header.subtotal || 0).toFixed(2)}
              readOnly
              className="border p-2 rounded w-full bg-gray-100 text-right"
            />
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block">Product Tax (GST)</label>
            <input
              type="text"
              value={Number(header.tax_amount || 0).toFixed(2)}
              readOnly
              className="border p-2 rounded w-full bg-gray-100 text-right"
            />
          </div>

          <div>
            <label className="text-sm font-semibold mb-1 block font-semibold">Grand Total</label>
            <input
              type="text"
              value={Number(header.total_amount || 0).toFixed(2)}
              readOnly
              className="border p-2 rounded w-full bg-gray-100 text-right"
            />
          </div>
        </div>
      )}

      {activeTab === "additional" && (
        <div className="bg-white p-6 rounded-xl shadow space-y-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="md:col-span-4">
              <label className="text-sm font-semibold mb-1 block">Warehouse</label>
              <select
                value={selectedWarehouseId}
                disabled={!isEditable}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="border p-2 rounded w-full md:w-1/4"
              >
                <option value="">Select Warehouse</option>
                {allWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Bill To</label>
              <textarea
                value={header.bill_to || ""}
                readOnly
                rows={3}
                className="mt-2 border p-2 rounded w-full bg-gray-50"
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Ship To</label>
              <textarea
                value={header.ship_to || ""}
                readOnly
                rows={3}
                className="mt-2 border p-2 rounded w-full bg-gray-50"
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Despatch Terms</label>
              <select
                value={header.despatch_terms?.toString() || ""}
                disabled={!isEditable}
                onChange={(e) => setHeader({ ...header, despatch_terms: e.target.value })}
                className="border p-2 rounded w-full"
              >
                <option value="">Select Despatch Term</option>
                {allDespatchTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.despatch_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Payment Terms</label>
              <select
                value={header.payment_terms?.toString() || ""}
                disabled={!isEditable}
                onChange={(e) => setHeader({ ...header, payment_terms: e.target.value })}
                className="border p-2 rounded w-full"
              >
                <option value="">Select Payment Term</option>
                {allPaymentTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-semibold mb-1 block">Freight Charges</label>
              <input
                type="number"
                disabled={!isEditable}
                value={header.freight_charges === "" ? "" : header.freight_charges}
                onChange={(e) => {
                  const val = e.target.value;
                  setHeader({
                    ...header,
                    freight_charges: val === "" ? "" : Math.max(0, Number(val)),
                  });
                }}
                className="border p-2 rounded w-full"
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Freight Tax %</label>
              <input
                type="number"
                disabled={!isEditable}
                value={header.freight_tax === "" ? "" : header.freight_tax}
                onChange={(e) => {
                  const val = e.target.value;
                  setHeader({
                    ...header,
                    freight_tax: val === "" ? "" : Math.min(100, Math.max(0, Number(val))),
                  });
                }}
                className="border p-2 rounded w-full"
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Freight Tax Amount</label>
              <input
                type="number"
                readOnly
                value={header.freight_tax_amount === "" ? "" : header.freight_tax_amount}
                className="border p-2 rounded w-full bg-gray-100"
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Packaging Amount</label>
              <input
                type="number"
                disabled={!isEditable}
                value={header.packaging_amount === "" ? "" : header.packaging_amount}
                onChange={(e) => {
                  const val = e.target.value;
                  setHeader({
                    ...header,
                    packaging_amount: val === "" ? "" : Math.max(0, Number(val)),
                  });
                }}
                className="border p-2 rounded w-full"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-semibold mb-1 block">Notes</label>
              <textarea
                value={header.notes || ""}
                disabled={!isEditable}
                onChange={(e) => {
                  const val = e.target.value ?? "";
                  setHeader({ ...header, notes: val });
                  const error = getRuleValidationError("alphanumeric-spaces-hyphens", val);
                  setErrors((prev: any) => ({
                    ...prev,
                    notes: error || "",
                  }));
                }}
                className={`border p-2 rounded w-full ${errors.notes ? "border-red-500" : ""}`}
                rows={3}
              />
              {errors.notes && (
                <p className="text-red-500 text-sm mt-1">{errors.notes}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Attachment</label>
              <input
                type="file"
                disabled={!isEditable}
                accept="image/*,.pdf,.xls,.xlsx,.csv"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                className="border p-2 rounded w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}