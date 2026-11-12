"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import {
  CreditCardIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

interface PaymentRetryPageProps {
  params: Promise<{
    company: string;
    orderId: string;
  }>;
}

export default function PaymentRetryPage({ params }: PaymentRetryPageProps) {
  const { company, orderId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(30 * 60); // 30 minutes in seconds

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/${company}/ecom/orders/${orderId}/invoice?format=json`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.invoice) {
            setOrder(data.invoice);
            setItems(Array.isArray(data.invoice.items) ? data.invoice.items : []);
          }
        }
      } catch (err: any) {
        console.error("Failed to load order for payment retry:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [company, orderId]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleRetryPayment = async () => {
    if (typeof window === "undefined" || !(window as any).Razorpay) {
      setErrorMsg("Payment gateway library is loading. Please try again in a moment.");
      return;
    }

    setRetrying(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/retry-payment`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to initialize payment retry.");
      }

      const options = {
        key: data.razorpay_key_id,
        amount: data.amount,
        currency: data.currency || "INR",
        name: company.toUpperCase(),
        description: `Payment for Order #${data.order_no}`,
        order_id: data.razorpay_order_id,
        handler: async function (response: any) {
          try {
            // Verify signature
            const verifyRes = await fetch(`/api/${company}/ecom/payment/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: data.order_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              router.push(`/${company}/track/${data.order_no}`);
            } else {
              setErrorMsg(verifyData.error || "Payment verification in progress...");
            }
          } catch (verErr: any) {
            router.push(`/${company}/track/${data.order_no}`);
          }
        },
        theme: {
          color: "#4f46e5",
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (failResp: any) {
        setErrorMsg(failResp.error?.description || "Payment failed at gateway. You can try again.");
      });
      rzp.open();
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while retrying payment.");
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <ArrowPathIcon className="w-5 h-5 animate-spin text-indigo-600" />
          Loading order details...
        </div>
      </div>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-12 px-4 sm:px-6">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <ExclamationCircleIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold">Complete Your Payment</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your order is on hold. Complete payment to secure your reserved items.
            </p>
          </div>

          {/* Timer Card */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-xs font-semibold">
              <ClockIcon className="w-5 h-5 text-amber-600" />
              <span>Stock Reservation Remaining:</span>
            </div>
            <span className="font-mono font-bold text-base text-amber-900 dark:text-amber-100">
              {formatTimer(timeLeft)}
            </span>
          </div>

          {errorMsg && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Order Summary */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Order Reference</span>
              <span className="font-mono font-bold text-sm">#{order?.invoice_no || orderId}</span>
            </div>

            {items.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
                {items.map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span className="truncate max-w-[240px]">
                      {it.productName} × {it.qty}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{Number(it.lineTotal || it.taxableValue || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-sm font-bold">
              <span>Total Payable</span>
              <span className="text-base text-indigo-600 dark:text-indigo-400">
                ₹{Number(order?.total_amount || 0).toLocaleString("en-IN")}
              </span>
            </div>

            <button
              type="button"
              disabled={retrying}
              onClick={handleRetryPayment}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-sm"
            >
              <CreditCardIcon className="w-5 h-5" />
              {retrying ? "Opening Gateway..." : "Retry Payment with Razorpay"}
            </button>
          </div>

          <div className="text-center">
            <Link
              href={`/${company}/store`}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              Cancel and return to store
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
