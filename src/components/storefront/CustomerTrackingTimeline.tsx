"use client";

import React, { useState } from "react";
import {
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  DocumentCheckIcon,
  MapPinIcon,
  ClipboardDocumentCheckIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

export interface DeliveryDetails {
  courier_partner?: string | null;
  awb_number?: string | null;
  tracking_url?: string | null;
  shipping_label_url?: string | null;
  pickup_scheduled_at?: string | Date | null;
  dispatched_at?: string | Date | null;
  picked_up_at?: string | Date | null;
  out_for_delivery_at?: string | Date | null;
  delivered_at?: string | Date | null;
  estimated_delivery_at?: string | Date | null;
  attempt_count?: number;
  failure_reason?: string | null;
  next_retry_date?: string | Date | null;
  rto_initiated_at?: string | Date | null;
  pod_type?: "SIGNATURE" | "PHOTO" | "OTP" | string | null;
  pod_resource_url?: string | null;
  delivered_to_person_name?: string | null;
  delivery_coordinates?: { latitude: number; longitude: number } | null;
  last_location?: string | null;
}

export interface TrackingCheckpoint {
  id: number;
  status_type: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string | Date;
}

export interface CustomerTrackingTimelineProps {
  orderNo: string;
  orderDate?: string | Date;
  orderStatus: string;
  deliveryStatus: string;
  delivery?: DeliveryDetails | null;
  checkpoints?: TrackingCheckpoint[];
  shippingAddress?: {
    name?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  items?: Array<{
    name: string;
    qty: number;
    selling_price: number;
  }>;
  totalAmount?: number;
  currency?: string;
}

const STEP_DEFINITIONS = [
  { key: "placed", label: "Order Placed" },
  { key: "packed", label: "Packed" },
  { key: "dispatched", label: "Dispatched" },
  { key: "in_transit", label: "In Transit" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

export function CustomerTrackingTimeline({
  orderNo,
  orderDate,
  orderStatus,
  deliveryStatus,
  delivery,
  checkpoints = [],
  shippingAddress,
  items = [],
  totalAmount,
  currency = "INR",
}: CustomerTrackingTimelineProps) {
  const [copiedAwb, setCopiedAwb] = useState(false);

  const isRto = deliveryStatus === "rto" || orderStatus === "returned";
  const isFailedAttempt = deliveryStatus === "failed_delivery";
  const isDelivered = deliveryStatus === "delivered" || orderStatus === "delivered";

  // Calculate current active milestone step index
  const getActiveStepIndex = () => {
    if (isDelivered) return 5;
    if (deliveryStatus === "out_for_delivery" || orderStatus === "out_for_delivery") return 4;
    if (deliveryStatus === "in_transit") return 3;
    if (deliveryStatus === "picked_up" || orderStatus === "shipped") return 2;
    if (orderStatus === "packed") return 1;
    return 0; // placed / confirmed
  };

  const activeIndex = getActiveStepIndex();

  const handleCopyAwb = (awb: string) => {
    navigator.clipboard.writeText(awb);
    setCopiedAwb(true);
    setTimeout(() => setCopiedAwb(false), 2000);
  };

  const formatDate = (dateVal?: string | Date | null) => {
    if (!dateVal) return null;
    return new Date(dateVal).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tracking Order
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {deliveryStatus.replace(/_/g, " ")}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              #{orderNo}
            </h1>
            {orderDate && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Placed on {formatDate(orderDate)}
              </p>
            )}
          </div>

          {delivery?.estimated_delivery_at && !isDelivered && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl px-4 py-3 text-right">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                Estimated Delivery
              </span>
              <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">
                {new Date(delivery.estimated_delivery_at).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          )}
        </div>

        {/* Courier Details Strip */}
        {delivery?.awb_number && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-sm">
            <div>
              <span className="text-xs text-slate-400 block">Courier Partner</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mt-0.5">
                <TruckIcon className="w-4 h-4 text-indigo-500" />
                {delivery.courier_partner || "Standard Logistics"}
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">AWB / Tracking Number</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono font-medium text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                  {delivery.awb_number}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyAwb(delivery.awb_number!)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <ClipboardDocumentCheckIcon className="w-4 h-4" />
                  {copiedAwb ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="sm:text-right">
              {delivery.tracking_url ? (
                <a
                  href={delivery.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 transition-colors"
                >
                  Live Courier Tracking
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                </a>
              ) : delivery.last_location ? (
                <div>
                  <span className="text-xs text-slate-400 block">Last Known Location</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center justify-end gap-1 mt-0.5 text-xs">
                    <MapPinIcon className="w-3.5 h-3.5 text-rose-500" />
                    {delivery.last_location}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Exception Banners */}
      {isRto && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 flex items-start gap-3 text-rose-800 dark:text-rose-200">
          <ExclamationTriangleIcon className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Package Return to Origin (RTO) Initiated</h3>
            <p className="text-xs mt-1 text-rose-700 dark:text-rose-300 leading-relaxed">
              Delivery could not be completed after maximum attempts or due to permanent refusal.
              The shipment is returning to the origin fulfillment center.
              {delivery?.failure_reason && (
                <span className="block mt-1 font-medium">Reason: {delivery.failure_reason}</span>
              )}
            </p>
          </div>
        </div>
      )}

      {isFailedAttempt && !isRto && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 flex items-start gap-3 text-amber-800 dark:text-amber-200">
          <ArrowPathIcon className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-spin" />
          <div>
            <h3 className="font-bold text-sm">
              Delivery Attempt #{delivery?.attempt_count || 1} Unsuccessful
            </h3>
            <p className="text-xs mt-1 text-amber-700 dark:text-amber-300 leading-relaxed">
              {delivery?.failure_reason || "Customer was unavailable or address unreachable."}
              {delivery?.next_retry_date && (
                <span className="block mt-1 font-semibold">
                  Next re-attempt scheduled for: {formatDate(delivery.next_retry_date)}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Proof of Delivery (POD) Card */}
      {isDelivered && (
        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-base">
            <DocumentCheckIcon className="w-5 h-5 text-emerald-600" />
            Proof of Delivery Confirmed
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Delivered At</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                {formatDate(delivery?.delivered_at) || "Recently delivered"}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Received By</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                {delivery?.delivered_to_person_name || shippingAddress?.name || "Customer / Signee"}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Verification Mode</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 mt-0.5">
                {delivery?.pod_type || "OTP / Signee Verified"}
              </span>
            </div>
          </div>

          {delivery?.pod_resource_url && (
            <div className="mt-4 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                Digital Signature / Receipt Artifact Captured
              </span>
              <a
                href={delivery.pod_resource_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 underline hover:no-underline inline-flex items-center gap-1"
              >
                View POD Artifact
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Stepper Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-6">
          Shipment Progress
        </h2>

        {/* Desktop Stepper */}
        <div className="hidden sm:flex items-center justify-between relative">
          <div className="absolute left-6 right-6 top-4 h-0.5 bg-slate-200 dark:bg-slate-800 -z-0" />
          <div
            className="absolute left-6 top-4 h-0.5 bg-indigo-600 transition-all duration-500 -z-0"
            style={{ width: `${(activeIndex / (STEP_DEFINITIONS.length - 1)) * 90}%` }}
          />

          {STEP_DEFINITIONS.map((step, idx) => {
            const isCompleted = idx <= activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <div key={step.key} className="flex flex-col items-center relative z-10 w-24 text-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-sm ${
                    isCompleted
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 text-slate-400"
                  } ${isCurrent ? "ring-4 ring-indigo-100 dark:ring-indigo-950/60" : ""}`}
                >
                  {isCompleted ? <CheckCircleIcon className="w-5 h-5" /> : idx + 1}
                </div>
                <span
                  className={`mt-2 text-xs font-semibold leading-tight ${
                    isCompleted
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Mobile Stepper */}
        <div className="sm:hidden space-y-4">
          {STEP_DEFINITIONS.map((step, idx) => {
            const isCompleted = idx <= activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <div key={step.key} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isCompleted
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  } ${isCurrent ? "ring-2 ring-indigo-200" : ""}`}
                >
                  {isCompleted ? <CheckCircleIcon className="w-4 h-4" /> : idx + 1}
                </div>
                <div>
                  <span
                    className={`text-sm font-semibold ${
                      isCompleted ? "text-slate-900 dark:text-white" : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                  {isCurrent && (
                    <span className="block text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      Current Milestone
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Checkpoint Activity Log */}
      {checkpoints.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-slate-400" />
            Activity Log & Checkpoints
          </h2>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {checkpoints.map((cp) => (
              <div key={cp.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 capitalize">
                    {cp.to_status.replace(/_/g, " ")}
                  </span>
                  {cp.note && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {cp.note}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate-400 font-mono shrink-0">
                  {formatDate(cp.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destination & Package Items Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {shippingAddress && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-2 flex items-center gap-1.5">
              <MapPinIcon className="w-4 h-4 text-slate-400" />
              Delivery Destination
            </h3>
            <p className="font-semibold text-slate-800 dark:text-slate-200">{shippingAddress.name}</p>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
              {shippingAddress.city ? `${shippingAddress.city}, ` : ""}
              {shippingAddress.state ? `${shippingAddress.state} ` : ""}
              {shippingAddress.pincode}
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-2">
              Shipment Contents ({items.length} {items.length === 1 ? "item" : "items"})
            </h3>
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div key={idx} className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                  <span className="truncate max-w-[200px]">{it.name} × {it.qty}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    ₹{(it.selling_price * it.qty).toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
            </div>
            {totalAmount != null && (
              <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2 flex justify-between font-bold text-slate-900 dark:text-white">
                <span>Order Total</span>
                <span>₹{Number(totalAmount).toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

