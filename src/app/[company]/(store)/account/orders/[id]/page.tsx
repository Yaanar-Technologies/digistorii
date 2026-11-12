"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  XCircleIcon,
  ArrowUturnLeftIcon,
  MapPinIcon,
  BuildingLibraryIcon,
} from "@heroicons/react/24/outline";
import { formatPrice } from "@/lib/currency";

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";
  const orderId = params.id as string;

  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancellation Modal state
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  // Return Modal state
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState("original_payment");
  const [bankDetails, setBankDetails] = useState({ accountNumber: "", ifsc: "", accountName: "" });
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnMessage, setReturnMessage] = useState<string | null>(null);

  const fetchOrderDetail = () => {
    setLoading(true);
    fetch(`/api/${company}/ecom/orders/${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.order) {
          setOrder({
            ...data.order,
            items: data.items || [],
            delivery: data.delivery || null,
            payments: data.payments || [],
          });
        } else {
          setError(data.error || "Order not found");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (company && orderId) {
      fetchOrderDetail();
    }
  }, [company, orderId]);

  const canCancel = order && ["placed", "confirmed"].includes(order.order_status);
  const canReturn = order && order.order_status === "delivered";

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    setCancelMessage(null);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/customer-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to cancel order");
      setCancelMessage("Your order has been cancelled successfully.");
      setIsCancelOpen(false);
      fetchOrderDetail();
    } catch (err: any) {
      setCancelMessage(err.message || "Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  };

  const handleRequestReturn = async () => {
    if (!returnReason.trim()) return;
    setSubmittingReturn(true);
    setReturnMessage(null);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: Number(orderId),
          returnReason,
          customerNotes: returnNotes,
          refundMethod,
          bankDetails: refundMethod === "bank_transfer" ? bankDetails : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to submit return request");
      setReturnMessage("Your return request has been submitted. Our team will review and schedule reverse pickup.");
      setIsReturnOpen(false);
      fetchOrderDetail();
    } catch (err: any) {
      setReturnMessage(err.message || "Failed to submit return request");
    } finally {
      setSubmittingReturn(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-xs text-slate-400">
        Loading order details...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-4">
        <XCircleIcon className="h-10 w-10 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">{error || "Order not found"}</h2>
        <Link
          href={`/${company}/account/orders`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:underline"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          <span>Back to My Orders</span>
        </Link>
      </div>
    );
  }

  const steps = [
    { key: "placed", label: "Placed" },
    { key: "confirmed", label: "Confirmed" },
    { key: "packed", label: "Packed" },
    { key: "shipped", label: "Shipped" },
    { key: "out_for_delivery", label: "Out for Delivery" },
    { key: "delivered", label: "Delivered" },
  ];

  const currentStepIdx = steps.findIndex((s) => s.key === order.order_status);

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={`/${company}/account/orders`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          <span>Back to Orders</span>
        </Link>

        <a
          href={`/api/${company}/ecom/orders/${order.id}/invoice`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <DocumentArrowDownIcon className="h-4 w-4 text-slate-500" />
          <span>Tax Invoice</span>
        </a>
      </div>

      {cancelMessage && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
          {cancelMessage}
        </div>
      )}

      {returnMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
          {returnMessage}
        </div>
      )}

      {/* Main Order Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 font-mono">
                Order #{order.order_no}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                {order.order_status}
              </span>
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">
              Placed on {new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canCancel && (
              <button
                onClick={() => setIsCancelOpen(true)}
                className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel Order
              </button>
            )}

            {canReturn && (
              <button
                onClick={() => setIsReturnOpen(true)}
                className="px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Request Return / Exchange
              </button>
            )}
          </div>
        </div>

        {/* Multi-Track Visual Stepper */}
        {order.order_status !== "cancelled" ? (
          <div className="py-4">
            <div className="text-xs font-bold text-slate-700 mb-3">Order Status Progression</div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {steps.map((step, idx) => {
                const isPassed = currentStepIdx >= idx;
                const isCurrent = currentStepIdx === idx;
                return (
                  <div
                    key={step.key}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      isCurrent
                        ? "bg-indigo-50 border-indigo-300 font-bold text-indigo-900 shadow-2xs"
                        : isPassed
                        ? "bg-slate-50 border-slate-200 text-slate-700 font-semibold"
                        : "bg-white border-slate-100 text-slate-400"
                    }`}
                  >
                    <div className="h-6 w-6 rounded-full mx-auto flex items-center justify-center text-2xs font-bold mb-1.5">
                      {isPassed ? (
                        <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-slate-300 flex items-center justify-center text-slate-400">
                          {idx + 1}
                        </span>
                      )}
                    </div>
                    <div className="text-2xs uppercase tracking-wider">{step.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold flex items-center gap-2">
            <XCircleIcon className="h-5 w-5 text-rose-600" />
            <span>This order was cancelled. Restocked to store inventory.</span>
          </div>
        )}

        {/* Courier / AWB Tracking Reference */}
        {order.delivery?.awb_number && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <TruckIcon className="h-6 w-6 text-indigo-600" />
              <div>
                <div className="text-xs font-bold text-slate-900">
                  Shipped via {order.delivery.courier_partner || "Courier Partner"}
                </div>
                <div className="text-2xs text-slate-500 font-mono">
                  AWB: <strong>{order.delivery.awb_number}</strong>
                </div>
              </div>
            </div>

            <Link
              href={`/${company}/track/${order.order_no}`}
              className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-2xs"
            >
              Track Live Location
            </Link>
          </div>
        )}
      </div>

      {/* Items & Price Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Items Table */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Ordered Items</h2>
          <div className="divide-y divide-slate-100">
            {order.items.map((item: any, idx: number) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900">{item.product_name}</div>
                  <div className="text-2xs text-slate-400">
                    SKU: {item.sku || "N/A"} | Qty: {item.qty} {item.size ? `| Size: ${item.size}` : ""}
                  </div>
                </div>
                <div className="text-right font-bold text-slate-900 font-mono">
                  {formatPrice(Number(item.line_total || item.rate * item.qty))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Payment Breakdown</h2>
          <div className="text-xs space-y-2 text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">{formatPrice(Number(order.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span>GST Tax</span>
              <span className="font-mono">{formatPrice(Number(order.tax_amount))}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping Fee</span>
              <span className="font-mono">{formatPrice(Number(order.shipping_fee))}</span>
            </div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Discount</span>
                <span className="font-mono">-{formatPrice(Number(order.discount_amount))}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
              <span>Grand Total</span>
              <span className="font-mono">{formatPrice(Number(order.total_amount))}</span>
            </div>
            <div className="text-2xs text-slate-400 pt-1">
              Payment Method: <strong className="uppercase text-slate-700">{order.payment_method || "Online"}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Cancellation Modal */}
      {isCancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Cancel Order #{order.order_no}</h3>
            <p className="text-xs text-slate-500">
              Please choose a reason for cancelling this order. If prepaid, a full refund will be automatically scheduled.
            </p>

            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select cancellation reason...</option>
              <option value="Ordered by mistake">Ordered by mistake</option>
              <option value="Incorrect shipping address">Incorrect shipping address</option>
              <option value="Found better price elsewhere">Found better price elsewhere</option>
              <option value="Delivery delay expected">Delivery delay expected</option>
              <option value="Other">Other reason</option>
            </select>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsCancelOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Keep Order
              </button>
              <button
                disabled={!cancelReason || cancelling}
                onClick={handleCancelOrder}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                {cancelling ? "Processing..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Request Modal */}
      {isReturnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Request Return for #{order.order_no}</h3>
            <p className="text-xs text-slate-500">
              Returns are accepted within the 7-day policy window for unworn items with original tags.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-2xs font-bold text-slate-700 uppercase">Reason for Return</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs"
                >
                  <option value="">Select reason...</option>
                  <option value="Size or fit issue">Size or fit issue</option>
                  <option value="Defective or damaged fabric">Defective or damaged fabric</option>
                  <option value="Color mismatch from website">Color mismatch from website</option>
                  <option value="Received wrong saree item">Received wrong saree item</option>
                </select>
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-700 uppercase">Customer Notes</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Additional feedback for our quality control team..."
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs h-20"
                />
              </div>

              <div>
                <label className="text-2xs font-bold text-slate-700 uppercase">Refund Method</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-xs"
                >
                  <option value="original_payment">Refund to Original Payment Mode</option>
                  <option value="store_credit">Instant Store Credit</option>
                  <option value="bank_transfer">Direct Bank Transfer (NEFT/IMPS)</option>
                </select>
              </div>

              {refundMethod === "bank_transfer" && (
                <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <input
                    type="text"
                    placeholder="Account Holder Name"
                    value={bankDetails.accountName}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Bank Account Number"
                    value={bankDetails.accountNumber}
                    onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="IFSC Code"
                    value={bankDetails.ifsc}
                    onChange={(e) => setBankDetails({ ...bankDetails, ifsc: e.target.value.toUpperCase() })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsReturnOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={!returnReason || submittingReturn}
                onClick={handleRequestReturn}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {submittingReturn ? "Submitting..." : "Submit Return Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

