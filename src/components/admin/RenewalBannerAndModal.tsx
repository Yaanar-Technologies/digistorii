"use client";

import React, { useEffect, useState } from "react";
import { ExclamationTriangleIcon, BellIcon } from "@heroicons/react/24/outline";

interface SubscriptionInfo {
  plan_id?: number;
  plan_name?: string;
  plan_code?: string;
  subscription_end?: string | null;
  status?: string;
  billing_interval?: string;
  amount?: number;
}

interface RenewalBannerAndModalProps {
  subscription: SubscriptionInfo | null;
  tenant: string;
  onRenewSuccess: () => void;
}

const loadRazorpayScript = () => {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).Razorpay) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;

    const timeout = setTimeout(() => resolve(false), 6000);
    script.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    script.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

// Helper for formatting date strings safely
const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return isNaN(d.getTime())
    ? "N/A"
    : d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
};

export const RenewalBannerAndModal: React.FC<RenewalBannerAndModalProps> = ({
  subscription,
  tenant,
  onRenewSuccess,
}) => {
  const [fallbackSub, setFallbackSub] = useState<SubscriptionInfo | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [priceMonthly, setPriceMonthly] = useState<number>(0);
  const [priceYearly, setPriceYearly] = useState<number>(0);
  const [loadingPrices, setLoadingPrices] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).triggerManualRenewalModal = () => {
        setShowManualModal(true);
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).triggerManualRenewalModal;
      }
    };
  }, []);

  // Fallback tenant resolution when subscription prop is null
  useEffect(() => {
    if (subscription || !tenant) return;
    let active = true;
    fetch(`/api/resolve-tenant?subdomain=${encodeURIComponent(tenant)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.success) {
          setFallbackSub({
            subscription_end: data.subscription_end || null,
            status: data.subscription_state || "",
          });
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, [subscription, tenant]);

  const effectiveSub = subscription || fallbackSub;

  useEffect(() => {
    if (effectiveSub) {
      const end = effectiveSub.subscription_end ? new Date(effectiveSub.subscription_end) : null;
      const now = new Date();

      if (end && !isNaN(end.getTime())) {
        const diffTime = end.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const expired =
          diffDays <= 0 ||
          effectiveSub.status?.toLowerCase() === "expired" ||
          effectiveSub.status?.toLowerCase() === "suspended";
        const expiringSoon = !expired && diffDays <= 7;

        setIsExpired(expired);
        setIsExpiringSoon(expiringSoon);
        setDaysRemaining(diffDays);

        // Check session storage for warning modal
        if (expiringSoon) {
          const hasSeen = sessionStorage.getItem("hasSeenRenewalModal");
          if (!hasSeen) {
            setShowWarningModal(true);
          }
        }
      } else if (
        effectiveSub.status?.toLowerCase() === "expired" ||
        effectiveSub.status?.toLowerCase() === "suspended"
      ) {
        setIsExpired(true);
      }

      if (effectiveSub.billing_interval) {
        setBillingInterval(
          effectiveSub.billing_interval.toLowerCase() === "yearly" ? "yearly" : "monthly"
        );
      }
    }

    // Fetch plan pricing dynamically using plan_id when available, else load all active plans and match
    const planQuery = effectiveSub?.plan_id ? `?plan_id=${effectiveSub.plan_id}` : "";
    setLoadingPrices(true);
    fetch(`/api/plans${planQuery}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.plans) && data.plans.length > 0) {
          const targetCode = (effectiveSub?.plan_code || effectiveSub?.plan_name || "")
            .trim()
            .toUpperCase();
          const plan =
            data.plans.find((p: any) =>
              effectiveSub?.plan_id
                ? Number(p.plan_id) === Number(effectiveSub.plan_id)
                : targetCode
                  ? String(p.plan_name || "").trim().toUpperCase() === targetCode
                  : false
            ) || data.plans[0];

          const monthly = Number(plan.price_monthly || plan.price || effectiveSub?.amount || 0);
          const yearly = Number(plan.price_yearly || (monthly ? monthly * 11 : 0));
          setPriceMonthly(monthly);
          setPriceYearly(yearly);
        } else if (effectiveSub?.amount) {
          const amt = Number(effectiveSub.amount);
          if (effectiveSub.billing_interval?.toLowerCase() === "yearly") {
            setPriceYearly(amt);
            setPriceMonthly(Math.round(amt / 11));
          } else {
            setPriceMonthly(amt);
            setPriceYearly(amt * 11);
          }
        }
      })
      .catch((err) => console.error("Failed to fetch plan pricing:", err))
      .finally(() => setLoadingPrices(false));
  }, [effectiveSub, tenant]);

  const handleRenew = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const orderRes = await fetch("/api/admin/billing/renew-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant": tenant,
        },
        body: JSON.stringify({ interval: billingInterval }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success || !orderData.order) {
        setErrorMsg(orderData.message || "Failed to create renewal order.");
        setLoading(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !(window as any).Razorpay) {
        setErrorMsg("Unable to load Razorpay payment gateway.");
        setLoading(false);
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_Sp9Rqg7Reyo9Jw",
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "Renew Subscription Plan",
        description: `Plan renewal subscription extension (${billingInterval})`,
        order_id: orderData.order.id,
        handler: async (response: any) => {
          setLoading(true);
          try {
            const verifyRes = await fetch("/api/admin/billing/verify-renewal", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-tenant": tenant,
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                interval: billingInterval,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setShowWarningModal(false);
              setShowManualModal(false);
              setIsExpired(false);
              setIsExpiringSoon(false);
              onRenewSuccess();
            } else {
              setErrorMsg(verifyData.message || "Renewal verification failed.");
            }
          } catch (err) {
            console.error("Renewal verification failed", err);
            setErrorMsg("An error occurred during payment verification.");
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
        theme: { color: "#2563EB" },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Renewal flow failed", err);
      setErrorMsg("Failed to process payment. Please try again.");
      setLoading(false);
    }
  };

  const activePrice =
    billingInterval === "yearly"
      ? priceYearly
      : priceMonthly || Number(effectiveSub?.amount || 0);

  if (isExpired || showWarningModal || showManualModal) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-8 shadow-2xl border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200 animate-fade-in">
          <div className="text-center space-y-3">
            {isExpired ? (
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner ring-8 ring-red-50 dark:ring-red-950/30">
                <ExclamationTriangleIcon className="w-8 h-8 animate-bounce" />
              </div>
            ) : (
              <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-amber-50 dark:ring-amber-950/30">
                <BellIcon className="w-8 h-8" />
              </div>
            )}

            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {isExpired ? "Subscription Expired" : "Renew Subscription"}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {isExpired
                  ? `Your access was suspended on ${formatDate(effectiveSub?.subscription_end)}. Please renew to restore full system access.`
                  : `Current plan expires on ${formatDate(effectiveSub?.subscription_end)}. Renew early to avoid service interruption.`}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-4 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Select Billing Interval
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setBillingInterval("monthly")}
                  className={`flex-1 py-2 px-4 rounded-xl border text-sm font-medium transition cursor-pointer ${billingInterval === "monthly"
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50"
                    }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingInterval("yearly")}
                  className={`flex-1 py-2 px-4 rounded-xl border text-sm font-medium transition cursor-pointer ${billingInterval === "yearly"
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50"
                    }`}
                >
                  Yearly
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Payable Amount</span>
              <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                {loadingPrices && activePrice === 0
                  ? "Loading..."
                  : `₹${activePrice.toLocaleString("en-IN")}`}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-4 bg-red-50 text-red-600 text-xs px-3 py-2 rounded-xl text-center">
              {errorMsg}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            {!isExpired && (
              <button
                onClick={() => {
                  setShowWarningModal(false);
                  setShowManualModal(false);
                  sessionStorage.setItem("hasSeenRenewalModal", "true");
                }}
                className="flex-1 py-3 px-4 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition cursor-pointer text-center"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleRenew}
              disabled={loading}
              className={`flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer ${isExpired ? "w-full shadow-lg shadow-blue-500/20" : "shadow-lg shadow-blue-500/10"
                }`}
            >
              {loading ? "Processing..." : "Renew Plan"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

interface PlanStatusCardProps {
  subscription: {
    plan_name?: string;
    plan_code?: string;
    subscription_end?: string | null;
  } | null;
}

export const PlanStatusCard: React.FC<PlanStatusCardProps> = ({ subscription }) => {
  const triggerManualRenewalModal = () => {
    if (typeof window !== "undefined" && (window as any).triggerManualRenewalModal) {
      (window as any).triggerManualRenewalModal();
    }
  };

  const formatCardDate = (dateStr?: string | null) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "N/A";

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    return `${day}-${month}-${year}`;
  };

  return (
    <div className="bg-white rounded-xl shadow p-4 hover:shadow-lg transition flex justify-between items-center">
      <div>
        <p className="text-gray-500 text-sm">Active Plan</p>
        <p className="text-lg font-bold text-gray-800">
          {subscription?.plan_name || subscription?.plan_code || "INSTORE"}
        </p>
        <p className="text-xs text-gray-400">
          Expires: {formatCardDate(subscription?.subscription_end)}
        </p>
      </div>
      <button
        onClick={triggerManualRenewalModal}
        className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
      >
        Renew
      </button>
    </div>
  );
};
