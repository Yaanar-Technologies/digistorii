"use client";

import React, { useState } from "react";
import {
  CheckIcon,
  ArchiveBoxIcon,
  TruckIcon,
  CheckBadgeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface AdminOrderActionToolbarProps {
  orderId: number;
  company: string;
  orderStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  onActionSuccess?: () => void;
}

export function AdminOrderActionToolbar({
  orderId,
  company,
  orderStatus,
  paymentStatus,
  deliveryStatus,
  onActionSuccess,
}: AdminOrderActionToolbarProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const canConfirm = orderStatus === "placed";
  const canAllocate = orderStatus === "confirmed";
  const canPack =
    ["placed", "confirmed"].includes(orderStatus) && deliveryStatus === "not_shipped";
  const canShip = orderStatus === "packed";
  const canDeliver = [
    "shipped",
    "picked_up",
    "in_transit",
    "out_for_delivery",
  ].includes(deliveryStatus);
  const canCancel =
    !["cancelled", "delivered", "returned", "refunded"].includes(orderStatus) &&
    !["shipped", "picked_up", "in_transit", "out_for_delivery", "delivered"].includes(
      deliveryStatus
    );

  const executeAction = async (endpoint: string, actionName: string, body?: any) => {
    setLoadingAction(actionName);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to ${actionName.toLowerCase()} order.`);
      }
      onActionSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || `An error occurred while performing ${actionName}.`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async () => {
    setLoadingAction("Cancel");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() || "Admin manual cancellation" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to cancel order.");
      }
      setShowCancelModal(false);
      setCancelReason("");
      onActionSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to cancel order.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-3">
      {errorMsg && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-500 hover:text-red-800 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Confirm Action */}
        <button
          type="button"
          disabled={!canConfirm || loadingAction !== null}
          onClick={() => executeAction("confirm", "Confirm")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${canConfirm
              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {loadingAction === "Confirm" ? "Confirming..." : "Confirm"}
        </button>

        {/* Allocate Action */}
        <button
          type="button"
          disabled={!canAllocate || loadingAction !== null}
          onClick={() => executeAction("allocate", "Allocate")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${canAllocate
              ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
        >
          <ArchiveBoxIcon className="h-3.5 w-3.5" />
          {loadingAction === "Allocate" ? "Allocating..." : "Allocate"}
        </button>

        {/* Pack Action */}
        <button
          type="button"
          disabled={!canPack || loadingAction !== null}
          onClick={() => executeAction("pack", "Pack")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${canPack
              ? "bg-amber-600 text-white hover:bg-amber-700 shadow-xs"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
        >
          <ArchiveBoxIcon className="h-3.5 w-3.5" />
          {loadingAction === "Pack" ? "Packing..." : "Pack"}
        </button>

        {/* Ship Action */}
        <button
          type="button"
          disabled={!canShip || loadingAction !== null}
          onClick={() => executeAction("ship", "Ship")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${canShip
              ? "bg-purple-600 text-white hover:bg-purple-700 shadow-xs"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
        >
          <TruckIcon className="h-3.5 w-3.5" />
          {loadingAction === "Ship" ? "Shipping..." : "Ship"}
        </button>

        {/* Mark Delivered Action */}
        <button
          type="button"
          disabled={!canDeliver || loadingAction !== null}
          onClick={() => executeAction("mark-delivered", "Deliver")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${canDeliver
              ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
        >
          <CheckBadgeIcon className="h-3.5 w-3.5" />
          {loadingAction === "Deliver" ? "Marking Delivered..." : "Mark Delivered"}
        </button>

        {/* Cancel Action */}
        {canCancel && (
          <button
            type="button"
            disabled={loadingAction !== null}
            onClick={() => setShowCancelModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all cursor-pointer"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-3">
            <h4 className="text-sm font-bold text-gray-900">Cancel Order #{orderId}</h4>
            <p className="text-xs text-gray-500">
              Cancelling this order will automatically release all held and converted inventory
              reservations back to available stock.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation..."
              rows={2}
              className="w-full rounded-xl border border-gray-200 p-2.5 text-xs focus:border-black focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={loadingAction === "Cancel"}
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {loadingAction === "Cancel" ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
