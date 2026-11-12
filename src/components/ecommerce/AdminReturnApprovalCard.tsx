"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TruckIcon,
  ArchiveBoxArrowDownIcon,
  CurrencyRupeeIcon,
  DocumentCheckIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

export interface ReturnRecord {
  id: number;
  order_id: number;
  status:
    | "requested"
    | "approved"
    | "pickup_scheduled"
    | "picked_up"
    | "in_transit"
    | "received"
    | "qc_passed"
    | "qc_failed"
    | "refunded"
    | "cancelled"
    | string;
  return_reason: string;
  customer_notes?: string | null;
  admin_notes?: string | null;
  qc_notes?: string | null;
  return_awb?: string | null;
  pickup_scheduled_at?: string | null;
  refund_amount: number;
  refund_id?: string | null;
  refund_status?: string | null;
  items?: any;
  created_at: string;
}

interface AdminReturnApprovalCardProps {
  orderId: number;
  orderNo: string;
  company: string;
  orderStatus: string;
  totalAmount: number;
  onActionSuccess?: () => void;
}

export function AdminReturnApprovalCard({
  orderId,
  orderNo,
  company,
  orderStatus,
  totalAmount,
  onActionSuccess,
}: AdminReturnApprovalCardProps) {
  const [activeReturn, setActiveReturn] = useState<ReturnRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Return creation modal/form
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [initiateReason, setInitiateReason] = useState("Customer Requested Return");
  const [initiateNotes, setInitiateNotes] = useState("");

  // Pickup scheduling form
  const [pickupDate, setPickupDate] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");

  // QC & Refund form
  const [qcPassed, setQcPassed] = useState(true);
  const [qcNotes, setQcNotes] = useState("Items received in original condition. Passed QC.");
  const [refundAmount, setRefundAmount] = useState(totalAmount || 0);
  const [refundMethod, setRefundMethod] = useState<"gateway" | "store_credit" | "manual_bank_transfer">("gateway");

  const fetchReturns = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/return`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.returns && data.returns.length > 0) {
          setActiveReturn(data.returns[0]);
          if (data.returns[0].refund_amount) {
            setRefundAmount(Number(data.returns[0].refund_amount));
          }
        } else {
          setActiveReturn(null);
        }
      }
    } catch (err: any) {
      console.error("Failed to load returns for order:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, [orderId, company]);

  const handleInitiateReturn = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnReason: initiateReason,
          customerNotes: initiateNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create return request.");
      }
      setShowInitiateModal(false);
      setSuccessMsg("Return request initiated successfully.");
      await fetchReturns();
      onActionSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to initiate return.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSchedulePickup = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/return-pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnId: activeReturn?.id,
          pickupDate: pickupDate || undefined,
          adminNotes: pickupNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to schedule return pickup.");
      }
      setSuccessMsg(`Return pickup scheduled! AWB: ${data.return_awb}`);
      await fetchReturns();
      onActionSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to schedule reverse pickup.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessRefund = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/process-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnId: activeReturn?.id,
          qcPassed,
          qcNotes,
          refundAmount: Number(refundAmount),
          refundMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process QC & refund.");
      }
      setSuccessMsg(data.message || "QC and refund completed successfully.");
      await fetchReturns();
      onActionSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process refund.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ArrowPathIcon className="w-4 h-4 animate-spin text-indigo-500" />
          Loading return & reverse logistics data...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ArchiveBoxArrowDownIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Reverse Logistics & Returns
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage return pickups, inspect warehouse QC, and issue restock refunds
          </p>
        </div>

        {activeReturn ? (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
            {activeReturn.status.replace(/_/g, " ")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowInitiateModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition"
          >
            Initiate Return Request
          </button>
        )}
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-lg flex items-center gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg flex items-center gap-2">
          <CheckCircleIcon className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* When no return exists */}
      {!activeReturn && !showInitiateModal && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
          No return or reverse logistics workflow is currently active for Order #{orderNo}.
        </p>
      )}

      {/* Modal / Form to initiate return */}
      {showInitiateModal && (
        <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Initiate Return for #{orderNo}
          </h4>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Return Reason
            </label>
            <select
              value={initiateReason}
              onChange={(e) => setInitiateReason(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"
            >
              <option value="Customer Requested Return">Customer Requested Return</option>
              <option value="Defective or Damaged Item">Defective or Damaged Item</option>
              <option value="Incorrect Item or Size Received">Incorrect Item or Size Received</option>
              <option value="Item Not as Described">Item Not as Described</option>
              <option value="RTO / Package Undelivered">RTO / Package Undelivered</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Customer / Staff Notes (Optional)
            </label>
            <input
              type="text"
              value={initiateNotes}
              onChange={(e) => setInitiateNotes(e.target.value)}
              placeholder="e.g. Fabric defect on border, customer requested pickup"
              className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleInitiateReturn}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Confirm Return Request"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowInitiateModal(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Return Details */}
      {activeReturn && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <span className="text-slate-400 block">Return ID</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                #{activeReturn.id}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Reason</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {activeReturn.return_reason}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Estimated Refund</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                ₹{Number(activeReturn.refund_amount).toLocaleString("en-IN")}
              </span>
            </div>

            {activeReturn.return_awb && (
              <div>
                <span className="text-slate-400 block">Reverse AWB</span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {activeReturn.return_awb}
                </span>
              </div>
            )}

            {activeReturn.pickup_scheduled_at && (
              <div>
                <span className="text-slate-400 block">Pickup Scheduled</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {new Date(activeReturn.pickup_scheduled_at).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}

            {activeReturn.refund_id && (
              <div>
                <span className="text-slate-400 block">Refund Reference ID</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                  {activeReturn.refund_id}
                </span>
              </div>
            )}
          </div>

          {/* Action Step 1: Approve & Schedule Reverse Pickup */}
          {["requested", "approved"].includes(activeReturn.status) && (
            <div className="border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">
                <TruckIcon className="w-4 h-4 text-indigo-600" />
                Step 1: Approve & Schedule Reverse Courier Pickup
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Pickup Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Staff Instructions / Dispatch Notes
                  </label>
                  <input
                    type="text"
                    value={pickupNotes}
                    onChange={(e) => setPickupNotes(e.target.value)}
                    placeholder="e.g. Schedule reverse pickup via Shiprocket"
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleSchedulePickup}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                <TruckIcon className="w-4 h-4" />
                {submitting ? "Generating Reverse AWB..." : "Approve & Schedule Reverse Pickup"}
              </button>
            </div>
          )}

          {/* Action Step 2: Warehouse QC Restock & Refund Processing */}
          {["pickup_scheduled", "picked_up", "in_transit", "received"].includes(activeReturn.status) && (
            <div className="border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                <DocumentCheckIcon className="w-4 h-4 text-emerald-600" />
                Step 2: Warehouse QC Restock & Issue Refund
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    QC Inspection Status
                  </label>
                  <select
                    value={qcPassed ? "pass" : "fail"}
                    onChange={(e) => setQcPassed(e.target.value === "pass")}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-semibold"
                  >
                    <option value="pass">QC Passed (Restock & Refund)</option>
                    <option value="fail">QC Failed (Reject Return)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Refund Method
                  </label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value as any)}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"
                  >
                    <option value="gateway">Payment Gateway (Razorpay Auto)</option>
                    <option value="store_credit">Store Credit / Wallet Note</option>
                    <option value="manual_bank_transfer">Manual Bank Transfer / Cash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Refund Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  QC & Inspection Notes
                </label>
                <input
                  type="text"
                  value={qcNotes}
                  onChange={(e) => setQcNotes(e.target.value)}
                  placeholder="e.g. Items verified intact with tags, credit to warehouse inventory"
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"
                />
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleProcessRefund}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                <CurrencyRupeeIcon className="w-4 h-4" />
                {submitting ? "Processing Restock & Refund..." : "Complete QC, Restock Inventory & Issue Refund"}
              </button>
            </div>
          )}

          {/* Refund Finished State */}
          {activeReturn.status === "refunded" && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                <div>
                  <span className="font-bold block">Return & Refund Fully Completed</span>
                  <span className="text-emerald-700 dark:text-emerald-300">
                    Items credited back to stock ledger. Ref: {activeReturn.refund_id}
                  </span>
                </div>
              </div>
              <span className="font-bold text-sm">
                ₹{Number(activeReturn.refund_amount).toLocaleString("en-IN")}
              </span>
            </div>
          )}

          {/* QC Failed State */}
          {activeReturn.status === "qc_failed" && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-4 flex items-center gap-2 text-xs text-rose-800 dark:text-rose-200">
              <XCircleIcon className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <span className="font-bold block">Return QC Failed</span>
                <span>{activeReturn.qc_notes || "Package rejected during inspection."}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

