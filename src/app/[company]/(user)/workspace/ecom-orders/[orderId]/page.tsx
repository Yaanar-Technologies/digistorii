"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import Badge from "@/components/ui/badge/Badge";
import {
  ArrowLeftIcon,
  ShoppingBagIcon,
  TruckIcon,
  CreditCardIcon,
  ClockIcon,
  MapPinIcon,
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";

interface OrderDetailResponse {
  order: {
    id: number;
    order_no: string;
    company_id: number;
    customer_id: number;
    order_status: string;
    payment_status: string;
    payment_method: string | null;
    delivery_status: string;
    delivery_partner: string | null;
    subtotal: number;
    tax_amount: number;
    shipping_fee: number;
    discount_amount: number;
    total_amount: number;
    currency: string;
    notes: string | null;
    created_at: string;
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    customer_code: string | null;
    shipping_name: string | null;
    shipping_address_line1: string | null;
    shipping_address_line2: string | null;
    shipping_city: string | null;
    shipping_state: string | null;
    shipping_pincode: string | null;
    shipping_country: string | null;
    shipping_phone: string | null;
    billing_name: string | null;
    billing_address_line1: string | null;
    billing_address_line2: string | null;
    billing_city: string | null;
    billing_state: string | null;
    billing_pincode: string | null;
    billing_country: string | null;
    billing_phone: string | null;
  };
  items: Array<{
    id: number;
    variant_id: number;
    product_name: string;
    uom: string | null;
    hsn_no: string | null;
    rate: number;
    qty: number;
    discount: number;
    tax_amount: number;
    line_total: number;
    fulfillment_status: string;
    sku: string | null;
    color: string | null;
    size: string | null;
    created_at: string;
  }>;
  payments: Array<{
    id: number;
    gateway: string;
    gateway_order_id: string | null;
    gateway_payment_id: string | null;
    amount: number;
    status: string;
    method: string | null;
    created_at: string;
  }>;
  delivery: {
    id: number;
    courier_partner: string | null;
    awb_number: string | null;
    tracking_url: string | null;
    pickup_scheduled_at: string | null;
    picked_up_at: string | null;
    out_for_delivery_at: string | null;
    delivered_at: string | null;
    estimated_delivery_at: string | null;
    last_location: string | null;
    updated_at: string | null;
  } | null;
  history: Array<{
    id: number;
    status_type: "order" | "payment" | "delivery";
    from_status: string | null;
    to_status: string;
    changed_by: string | null;
    note: string | null;
    created_at: string;
  }>;
  ecom_settings: {
    delivery_partner: string | null;
    pickup_location_code: string | null;
  };
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ company: string; orderId: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { company, orderId } = resolvedParams;

  const [orderData, setOrderData] = useState<OrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedAwb, setCopiedAwb] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Modals
  const [isShipModalOpen, setIsShipModalOpen] = useState(false);
  const [manualAwb, setManualAwb] = useState("");
  const [manualTrackingUrl, setManualTrackingUrl] = useState("");
  const [manualCourier, setManualCourier] = useState("");
  const [shipModalError, setShipModalError] = useState<string | null>(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const fetchOrderDetail = useCallback(async () => {
    if (!company || !orderId) return;
    setLoading(true);

    try {
      const res = await apiFetch(`/api/${company}/ecom/orders/${orderId}`, company);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setOrderData(data);
        } else {
          setFeedback({ type: "error", message: data.error || "Order not found." });
        }
      } else {
        const errData = await res.json();
        setFeedback({ type: "error", message: errData.error || "Failed to fetch order details." });
      }
    } catch (err: any) {
      console.error("Order detail fetch error:", err);
      setFeedback({ type: "error", message: err.message || "Failed to load order." });
    } finally {
      setLoading(false);
    }
  }, [company, orderId]);

  useEffect(() => {
    fetchOrderDetail();
  }, [fetchOrderDetail]);

  // Copy AWB Number Helper
  const handleCopyAwb = (awb: string) => {
    navigator.clipboard.writeText(awb);
    setCopiedAwb(true);
    setTimeout(() => setCopiedAwb(false), 2000);
  };

  // Staff Actions Execution
  const executeOrderAction = async (actionPath: string, bodyPayload?: any) => {
    setActionLoading(actionPath);
    setFeedback(null);
    setShipModalError(null);

    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/${actionPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant": company,
        },
        body: bodyPayload ? JSON.stringify(bodyPayload) : JSON.stringify({}),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({
          type: "success",
          message: data.message || `Action '${actionPath}' executed successfully.`,
        });
        setIsShipModalOpen(false);
        setIsCancelModalOpen(false);
        await fetchOrderDetail();
      } else {
        const errMsg = data.error || `Failed to execute ${actionPath}.`;
        if (actionPath === "ship" && isShipModalOpen) {
          setShipModalError(errMsg);
        } else {
          setFeedback({ type: "error", message: errMsg });
        }
      }
    } catch (err: any) {
      const errMsg = err.message || "Network error occurred.";
      if (actionPath === "ship" && isShipModalOpen) {
        setShipModalError(errMsg);
      } else {
        setFeedback({ type: "error", message: errMsg });
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Formatting helpers
  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
        <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
      </div>
    );
  }

  if (!orderData || !orderData.order) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center space-y-4">
        <ExclamationTriangleIcon className="w-16 h-16 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Order Not Found</h2>
        <p className="text-sm text-gray-500">The requested order could not be located in this store.</p>
        <Link
          href={`/${company}/workspace/ecom-orders`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Orders
        </Link>
      </div>
    );
  }

  const { order, items, payments, delivery, history, ecom_settings } = orderData;
  const isAllItemsAllocated = items.length > 0 && items.every((i) => i.fulfillment_status === "allocated");
  const isAutomatedCourier = ecom_settings.delivery_partner && ecom_settings.delivery_partner !== "self";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={`/${company}/workspace/ecom-orders`}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Orders List
        </Link>

        <button
          onClick={() => fetchOrderDetail()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin text-brand-500" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
              : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "success" ? (
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            ) : (
              <XCircleIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Order Header Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-gray-100 dark:border-gray-700/60 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {order.order_no}
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400 border border-brand-200/50">
                Online Storefront
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Placed on {formatDateTime(order.created_at)} &bull; Order #{order.id}
            </p>
          </div>

          {/* Action Buttons Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Confirm Order (placed -> confirmed) */}
            {order.order_status === "placed" && (
              <button
                onClick={() => executeOrderAction("confirm")}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {actionLoading === "confirm" ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircleIcon className="w-4 h-4" />
                )}
                Confirm Order
              </button>
            )}

            {/* 2. Allocate Items (confirmed -> items allocated) */}
            {order.order_status === "confirmed" && !isAllItemsAllocated && (
              <button
                onClick={() => executeOrderAction("allocate")}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {actionLoading === "allocate" ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CubeIcon className="w-4 h-4" />
                )}
                Mark Items Picked
              </button>
            )}

            {/* 3. Pack Order (confirmed + items allocated -> packed) */}
            {order.order_status === "confirmed" && isAllItemsAllocated && (
              <button
                onClick={() => executeOrderAction("pack")}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {actionLoading === "pack" ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <ShoppingBagIcon className="w-4 h-4" />
                )}
                Pack Order
              </button>
            )}

            {/* 4. Ship Order (packed -> shipped) */}
            {order.order_status === "packed" && (
              <button
                onClick={() => {
                  setShipModalError(null);
                  setIsShipModalOpen(true);
                }}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <TruckIcon className="w-4 h-4" />
                Ship Order
              </button>
            )}

            {/* 5. Mark Delivered (shipped/out_for_delivery -> delivered) */}
            {(order.order_status === "shipped" || order.order_status === "out_for_delivery") && (
              <button
                onClick={() => executeOrderAction("mark-delivered")}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {actionLoading === "mark-delivered" ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircleIcon className="w-4 h-4" />
                )}
                Mark Delivered
              </button>
            )}

            {/* 6. Cancel Order (non-terminal statuses) */}
            {!["delivered", "cancelled", "refunded"].includes(order.order_status) && (
              <button
                onClick={() => setIsCancelModalOpen(true)}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-300 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <XCircleIcon className="w-4 h-4" />
                Cancel Order
              </button>
            )}
          </div>
        </div>

        {/* 3 Status Dimension Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50/75 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-100 dark:border-gray-700/60">
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Order Status
            </div>
            <div className="capitalize font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  order.order_status === "delivered"
                    ? "bg-emerald-500"
                    : order.order_status === "cancelled"
                    ? "bg-red-500"
                    : "bg-brand-500"
                }`}
              />
              {order.order_status.replace(/_/g, " ")}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Payment Status
            </div>
            <div className="capitalize font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  order.payment_status === "paid"
                    ? "bg-emerald-500"
                    : order.payment_status === "failed"
                    ? "bg-red-500"
                    : "bg-amber-500"
                }`}
              />
              {order.payment_status} ({order.payment_method || "COD"})
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Delivery Status
            </div>
            <div className="capitalize font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  order.delivery_status === "delivered"
                    ? "bg-emerald-500"
                    : order.delivery_status === "not_shipped"
                    ? "bg-gray-400"
                    : "bg-purple-500"
                }`}
              />
              {order.delivery_status.replace(/_/g, " ")}
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Info Grid: Customer/Addresses & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer & Addresses (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingBagIcon className="w-5 h-5 text-brand-500" />
                Ordered Items ({items.length})
              </h2>
              {isAllItemsAllocated ? (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
                  All Items Picked / Allocated
                </span>
              ) : (
                <span className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full">
                  Pending Picking / Allocation
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/75 dark:bg-gray-900/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Item Details</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-4 text-right">Price</th>
                    <th className="py-3 px-4 text-right">Discount</th>
                    <th className="py-3 px-4 text-right">Tax</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-center">Fulfillment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50 text-sm">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {item.product_name}
                        </div>
                        <div className="text-xs text-gray-500 space-x-2 mt-0.5">
                          {item.sku && <span>SKU: {item.sku}</span>}
                          {item.color && <span>&bull; Color: {item.color}</span>}
                          {item.size && <span>&bull; Size: {item.size}</span>}
                          {item.hsn_no && <span>&bull; HSN: {item.hsn_no}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-medium text-gray-900 dark:text-white">
                        {item.qty} {item.uom || "PCS"}
                      </td>
                      <td className="py-3.5 px-4 text-right text-gray-700 dark:text-gray-300">
                        {formatCurrency(item.rate)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-gray-700 dark:text-gray-300">
                        {item.discount > 0 ? `-${formatCurrency(item.discount)}` : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right text-gray-700 dark:text-gray-300">
                        {formatCurrency(item.tax_amount)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(item.line_total)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
                            item.fulfillment_status === "allocated"
                              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                              : item.fulfillment_status === "fulfilled"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : item.fulfillment_status === "cancelled"
                              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {item.fulfillment_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="p-4 bg-gray-50/60 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/60 flex flex-col items-end text-sm space-y-1.5">
              <div className="flex justify-between w-64 text-gray-600 dark:text-gray-400">
                <span>Subtotal:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(order.subtotal)}
                </span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between w-64 text-emerald-600 dark:text-emerald-400">
                  <span>Discount:</span>
                  <span>-{formatCurrency(order.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between w-64 text-gray-600 dark:text-gray-400">
                <span>Tax:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(order.tax_amount)}
                </span>
              </div>
              <div className="flex justify-between w-64 text-gray-600 dark:text-gray-400">
                <span>Shipping Fee:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {order.shipping_fee > 0 ? formatCurrency(order.shipping_fee) : "Free"}
                </span>
              </div>
              <div className="flex justify-between w-64 pt-2 border-t border-gray-200 dark:border-gray-700 text-base font-bold text-gray-900 dark:text-white">
                <span>Grand Total:</span>
                <span className="text-brand-600 dark:text-brand-400">
                  {formatCurrency(order.total_amount)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer & Shipping/Billing Addresses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Shipping Address */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                <MapPinIcon className="w-4 h-4 text-brand-500" />
                Shipping Address
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {order.shipping_name || order.customer_name}
                </p>
                <p>{order.shipping_address_line1 || "No street address provided"}</p>
                {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
                <p>
                  {[order.shipping_city, order.shipping_state, order.shipping_pincode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p>{order.shipping_country || "India"}</p>
                <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                  <PhoneIcon className="w-3.5 h-3.5" />
                  {order.shipping_phone || order.customer_phone || "—"}
                </p>
              </div>
            </div>

            {/* Customer & Billing Info */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                <UserIcon className="w-4 h-4 text-brand-500" />
                Customer Account
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                <p className="font-semibold text-gray-900 dark:text-white">{order.customer_name}</p>
                {order.customer_email && (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <EnvelopeIcon className="w-3.5 h-3.5" />
                    {order.customer_email}
                  </p>
                )}
                {order.customer_phone && (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <PhoneIcon className="w-3.5 h-3.5" />
                    {order.customer_phone}
                  </p>
                )}
                {order.customer_code && (
                  <p className="text-xs text-gray-400">Customer Code: {order.customer_code}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Delivery, Payments Audit, Status Timeline */}
        <div className="space-y-6">
          {/* Delivery & Tracking Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <TruckIcon className="w-5 h-5 text-purple-600" />
              Delivery & Courier
            </h3>

            {delivery ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Partner:</span>
                  <span className="font-semibold text-gray-900 dark:text-white capitalize">
                    {delivery.courier_partner || "Self Delivery"}
                  </span>
                </div>

                {delivery.awb_number && (
                  <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg">
                    <div>
                      <div className="text-[11px] text-gray-400">AWB / Reference No:</div>
                      <div className="font-mono font-bold text-gray-900 dark:text-white">
                        {delivery.awb_number}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyAwb(delivery.awb_number!)}
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300"
                      title="Copy AWB"
                    >
                      {copiedAwb ? (
                        <ClipboardDocumentCheckIcon className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <ClipboardDocumentIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}

                {delivery.tracking_url && (
                  <a
                    href={delivery.tracking_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Track Shipment Online
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </a>
                )}

                {delivery.last_location && (
                  <div className="text-xs text-gray-500">
                    <span className="font-medium">Last Location:</span> {delivery.last_location}
                  </div>
                )}

                {delivery.estimated_delivery_at && (
                  <div className="text-xs text-gray-500">
                    <span className="font-medium">Est. Delivery:</span>{" "}
                    {formatDateTime(delivery.estimated_delivery_at)}
                  </div>
                )}

                {delivery.delivered_at && (
                  <div className="text-xs text-emerald-600 font-medium">
                    Delivered on {formatDateTime(delivery.delivered_at)}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-400 text-xs">
                <TruckIcon className="w-8 h-8 mx-auto mb-1.5 text-gray-300 dark:text-gray-600" />
                Order has not been shipped yet.
              </div>
            )}
          </div>

          {/* Payments Audit Trail Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <CreditCardIcon className="w-5 h-5 text-emerald-600" />
              Payment Records
            </h3>

            {payments.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-2">
                No payment gateway records (e.g. Cash on Delivery).
              </div>
            ) : (
              <div className="space-y-2.5">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-gray-50/80 dark:bg-gray-900/60 rounded-lg border border-gray-100 dark:border-gray-700/60 text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-900 dark:text-white capitalize">
                        {p.gateway} &bull; {p.method || "card"}
                      </span>
                      <span
                        className={`font-semibold capitalize px-2 py-0.5 rounded-full ${
                          p.status === "captured"
                            ? "bg-emerald-100 text-emerald-700"
                            : p.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Amount: {formatCurrency(p.amount)}</span>
                      <span>{formatDateTime(p.created_at)}</span>
                    </div>
                    {p.gateway_payment_id && (
                      <div className="text-[11px] font-mono text-gray-400 truncate">
                        ID: {p.gateway_payment_id}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Timeline (Oldest to Newest Story) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-brand-500" />
              Audit Timeline
            </h3>

            <div className="relative pl-6 space-y-4 border-l-2 border-gray-200 dark:border-gray-700 ml-2">
              {history.map((h) => (
                <div key={h.id} className="relative group">
                  {/* Dot */}
                  <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-brand-500 ring-4 ring-white dark:ring-gray-800" />

                  <div className="text-xs space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white capitalize">
                        {h.to_status.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-gray-400 px-1.5 py-0.2 bg-gray-100 dark:bg-gray-700 rounded">
                        {h.status_type}
                      </span>
                    </div>
                    {h.note && <p className="text-gray-600 dark:text-gray-300">{h.note}</p>}
                    <div className="text-[11px] text-gray-400">
                      By {h.changed_by || "system"} &bull; {formatDateTime(h.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Ship Order */}
      {isShipModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TruckIcon className="w-5 h-5 text-purple-600" />
                Ship Order #{order.order_no}
              </h3>
              <button
                onClick={() => setIsShipModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            {shipModalError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-lg">
                {shipModalError}
              </div>
            )}

            {isAutomatedCourier ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  This order will be automatically dispatched via{" "}
                  <strong className="capitalize text-brand-600">
                    {ecom_settings.delivery_partner}
                  </strong>
                  . A pickup will be scheduled and an AWB will be generated.
                </p>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsShipModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => executeOrderAction("ship")}
                    disabled={actionLoading === "ship"}
                    className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-2"
                  >
                    {actionLoading === "ship" && (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    )}
                    Create Shipment via {ecom_settings.delivery_partner}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  Your store is configured for manual / self delivery. Enter the tracking or delivery
                  reference number below.
                </p>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    AWB / Tracking Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AWB123456 or Delivery Staff Name"
                    value={manualAwb}
                    onChange={(e) => setManualAwb(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tracking URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://track.example.com/..."
                    value={manualTrackingUrl}
                    onChange={(e) => setManualTrackingUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Courier / Delivery Carrier (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. In-house Rider, Local Courier"
                    value={manualCourier}
                    onChange={(e) => setManualCourier(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsShipModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      executeOrderAction("ship", {
                        awbNumber: manualAwb,
                        trackingUrl: manualTrackingUrl,
                        courierPartner: manualCourier,
                      })
                    }
                    disabled={actionLoading === "ship"}
                    className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-2"
                  >
                    {actionLoading === "ship" && (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    )}
                    Mark as Shipped
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Cancel Order */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <XCircleIcon className="w-5 h-5 text-red-600" />
                Cancel Order #{order.order_no}
              </h3>
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Cancelling this order will release all held inventory reservations. If already paid, a
              refund intent will be initiated.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason for Cancellation
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Customer requested cancellation, out of stock, address unserviceable..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 rounded-lg"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={() => executeOrderAction("cancel", { reason: cancelReason })}
                disabled={actionLoading === "cancel"}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2"
              >
                {actionLoading === "cancel" && (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                )}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
