"use client";

import React from "react";
import {
  CheckCircleIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  ArchiveBoxIcon,
  HomeIcon,
  ArrowTopRightOnSquareIcon,
  MapPinIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftEllipsisIcon,
} from "@heroicons/react/24/outline";

export interface TrackingHistoryItem {
  id: number | string;
  status: string;
  statusType?: string;
  timestamp: string;
  description: string;
}

export interface CustomerTrackingData {
  orderId?: number | string;
  orderNo?: string;
  orderStatus?: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  carrierName?: string;
  awbNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDeliveryAt?: string | null;
  currentLocation?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  attemptCount?: number;
  failureReason?: string | null;
  createdAt?: string;
  trackingHistory?: TrackingHistoryItem[];
}

export interface CustomerOrderTimelineProps {
  // Option 1: Unified tracking payload
  tracking?: CustomerTrackingData;

  // Option 2: Individual props passed from store/account/page.tsx
  orderStatus?: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  history?: any[];
  delivery?: any;
  customerNotes?: any;
  primaryColor?: string;

  // Optional top-level metadata
  orderId?: number | string;
  orderNo?: string;
  createdAt?: string;
}

const STEPS = [
  { id: "placed", label: "Order Placed", icon: BuildingStorefrontIcon },
  { id: "confirmed", label: "Confirmed", icon: CheckCircleIcon },
  { id: "packed", label: "Packed", icon: ArchiveBoxIcon },
  { id: "shipped", label: "Shipped", icon: TruckIcon },
  { id: "out_for_delivery", label: "Out For Delivery", icon: TruckIcon },
  { id: "delivered", label: "Delivered", icon: HomeIcon },
];

export default function CustomerOrderTimeline(props: CustomerOrderTimelineProps) {
  const {
    tracking,
    orderStatus: propOrderStatus,
    deliveryStatus: propDeliveryStatus,
    paymentStatus: propPaymentStatus,
    history: propHistory,
    delivery: propDelivery,
    customerNotes: propCustomerNotes,
    primaryColor = "#4f46e5",
    orderId: propOrderId,
    orderNo: propOrderNo,
    createdAt: propCreatedAt,
  } = props;

  // Normalize core statuses
  const resolvedOrderStatus = (tracking?.orderStatus || propOrderStatus || "placed").toLowerCase();
  const resolvedDeliveryStatus = (
    tracking?.deliveryStatus ||
    propDeliveryStatus ||
    propDelivery?.status ||
    "not_shipped"
  ).toLowerCase();
  const resolvedPaymentStatus = (
    tracking?.paymentStatus ||
    propPaymentStatus ||
    ""
  ).toLowerCase();

  const resolvedOrderNo =
    tracking?.orderNo || propOrderNo || (propDelivery?.order_no ? String(propDelivery.order_no) : undefined);
  const resolvedCreatedAt = tracking?.createdAt || propCreatedAt;

  const awbNumber =
    tracking?.awbNumber ||
    propDelivery?.awb_number ||
    propDelivery?.awb_code ||
    propDelivery?.tracking_number ||
    null;
  const carrierName =
    tracking?.carrierName ||
    propDelivery?.courier_partner ||
    propDelivery?.delivery_partner ||
    "Courier";
  const trackingUrl =
    tracking?.trackingUrl ||
    propDelivery?.tracking_url ||
    (awbNumber ? `https://shiprocket.co/tracking/${awbNumber}` : null);
  const estimatedDeliveryAt =
    tracking?.estimatedDeliveryAt ||
    propDelivery?.estimated_delivery_date ||
    propDelivery?.estimated_delivery_at ||
    null;
  const currentLocation =
    tracking?.currentLocation ||
    propDelivery?.last_location ||
    propDelivery?.current_location ||
    null;
  const attemptCount = tracking?.attemptCount || propDelivery?.attempt_count || 0;
  const failureReason = tracking?.failureReason || propDelivery?.failure_reason || null;

  // Normalize chronological history updates
  const normalizedHistory: TrackingHistoryItem[] = React.useMemo(() => {
    if (tracking?.trackingHistory && tracking.trackingHistory.length > 0) {
      return tracking.trackingHistory;
    }
    if (Array.isArray(propHistory) && propHistory.length > 0) {
      return propHistory.map((h: any, idx: number) => ({
        id: h.id || idx,
        status: h.to_status || h.status_type || "Update",
        statusType: h.status_type,
        timestamp: h.created_at || "",
        description:
          h.note ||
          `Order status updated to ${(h.to_status || h.status_type || "").replace(/_/g, " ")}`,
      }));
    }
    return [];
  }, [tracking?.trackingHistory, propHistory]);

  // Determine current active milestone in stepper
  const getActiveStepIndex = () => {
    if (resolvedOrderStatus === "delivered" || resolvedDeliveryStatus === "delivered") return 5;
    if (resolvedDeliveryStatus === "out_for_delivery") return 4;
    if (
      resolvedOrderStatus === "shipped" ||
      resolvedDeliveryStatus === "in_transit" ||
      resolvedDeliveryStatus === "picked_up" ||
      resolvedDeliveryStatus === "dispatched"
    ) {
      return 3;
    }
    if (resolvedOrderStatus === "packed" || resolvedDeliveryStatus === "packed") return 2;
    if (resolvedOrderStatus === "confirmed") return 1;
    return 0; // placed
  };

  const activeIndex = getActiveStepIndex();

  const isRto = resolvedDeliveryStatus === "rto" || resolvedOrderStatus === "returned";
  const isFailed = resolvedDeliveryStatus === "failed_delivery";
  const isCancelled = resolvedOrderStatus === "cancelled";
  const isExceptional = isRto || isFailed || isCancelled;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(dateStr);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-6">
      {/* Header Info / Tracking Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
        <div>
          <span className="text-[11px] uppercase font-semibold text-gray-500 tracking-wider">
            Order Fulfillment & Tracking
          </span>
          {resolvedOrderNo ? (
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
              #{resolvedOrderNo}
            </h2>
          ) : (
            <h3 className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
              Status: <span className="capitalize">{resolvedOrderStatus.replace(/_/g, " ")}</span>
            </h3>
          )}
          {resolvedCreatedAt && (
            <p className="text-xs text-gray-500 mt-0.5">
              Placed on {formatDate(resolvedCreatedAt)}
            </p>
          )}
        </div>

        {awbNumber && (
          <div className="flex flex-col sm:items-end bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-500 font-medium">
              Carrier: <strong className="text-gray-900 dark:text-gray-100">{carrierName}</strong>
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                AWB: {awbNumber}
              </span>
              {trackingUrl && (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 underline"
                >
                  Track Carrier
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Exceptional State Alert (RTO / Failed / Cancelled) */}
      {isExceptional && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3">
          <ExclamationCircleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">
              {isRto
                ? "Package Returning to Origin (RTO)"
                : isFailed
                ? `Delivery Attempt Failed (${attemptCount || 1}/3)`
                : "Order Cancelled"}
            </p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              {failureReason ||
                (isRto
                  ? "Carrier was unable to complete delivery. Package is in reverse transit to warehouse."
                  : isFailed
                  ? "Courier was unable to reach the delivery location. A re-attempt will be scheduled."
                  : "This order has been cancelled.")}
            </p>
          </div>
        </div>
      )}

      {/* Visual Stepper */}
      <div className="py-2">
        <div className="relative flex items-center justify-between">
          {/* Background Connecting Bar */}
          <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 h-1 bg-gray-200 dark:bg-gray-700 z-0" />
          {/* Active Filled Connecting Bar */}
          <div
            className="absolute top-1/2 left-0 -translate-y-1/2 h-1 transition-all duration-500 z-0"
            style={{
              width: `${(activeIndex / (STEPS.length - 1)) * 100}%`,
              backgroundColor: primaryColor,
            }}
          />

          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = idx < activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition-all ${
                    isCompleted || isCurrent
                      ? "text-white"
                      : "bg-white dark:bg-gray-800 text-gray-400 border-2 border-gray-300 dark:border-gray-600"
                  }`}
                  style={isCompleted || isCurrent ? { backgroundColor: primaryColor } : undefined}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span
                  className={`mt-2 text-[10px] sm:text-xs font-semibold whitespace-nowrap text-center ${
                    isCurrent
                      ? "font-bold"
                      : isCompleted
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-400"
                  }`}
                  style={isCurrent ? { color: primaryColor } : undefined}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Location / ETA Info Card */}
      {(estimatedDeliveryAt || currentLocation) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700">
          {estimatedDeliveryAt && (
            <div className="flex items-center gap-3">
              <ClockIcon className="w-5 h-5 shrink-0" style={{ color: primaryColor }} />
              <div>
                <span className="text-[11px] text-gray-500 font-medium uppercase">
                  Estimated Delivery
                </span>
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatDate(estimatedDeliveryAt)}
                </p>
              </div>
            </div>
          )}

          {currentLocation && (
            <div className="flex items-center gap-3">
              <MapPinIcon className="w-5 h-5 shrink-0" style={{ color: primaryColor }} />
              <div>
                <span className="text-[11px] text-gray-500 font-medium uppercase">
                  Last Scanned Location
                </span>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{currentLocation}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Customer Visible Order Notes (if available) */}
      {Array.isArray(propCustomerNotes) && propCustomerNotes.length > 0 && (
        <div className="pt-2 space-y-2">
          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <ChatBubbleLeftEllipsisIcon className="w-4 h-4 text-gray-400" />
            Store Updates
          </h4>
          <div className="space-y-1.5">
            {propCustomerNotes.map((note: any, idx: number) => (
              <div
                key={note.id || idx}
                className="text-xs bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 rounded-xl p-3 text-amber-900 dark:text-amber-200"
              >
                <p>{typeof note === "string" ? note : note.content}</p>
                {note.created_at && (
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400 block mt-1">
                    {formatDate(note.created_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chronological Transit & Fulfillment History */}
      {normalizedHistory.length > 0 && (
        <div className="pt-2 space-y-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            Fulfillment & Transit Updates
          </h3>
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200 dark:before:bg-gray-700">
            {[...normalizedHistory].reverse().map((event, idx) => (
              <div key={event.id || idx} className="relative">
                <div
                  className={`absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                    idx === 0 ? "ring-2 ring-indigo-200" : "bg-gray-400"
                  }`}
                  style={idx === 0 ? { backgroundColor: primaryColor } : undefined}
                />
                <div className="bg-gray-50/70 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-100 dark:border-gray-700/60">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                      {event.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-gray-400">{formatDate(event.timestamp)}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    {event.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
