"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  XCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import {
  evaluateSubscriptionLifecycle,
  SubscriptionEvaluation,
} from "@/lib/subscription";

export interface SubscriptionAlertBannerProps {
  subscriptionEndDate?: string | Date | null;
  subscriptionStatus?: string | null;
  paymentStatus?: string | null;
  tenant?: string;
  renewUrl?: string;
  onRenewClick?: () => void;
}

export const SubscriptionAlertBanner: React.FC<SubscriptionAlertBannerProps> = ({
  subscriptionEndDate: propEndDate,
  subscriptionStatus: propStatus,
  paymentStatus: propPaymentStatus,
  tenant: propTenant,
  renewUrl,
  onRenewClick,
}) => {
  const params = useParams();
  const router = useRouter();

  const urlTenant = Array.isArray(params?.company)
    ? params.company[0]
    : (params?.company as string) || "";
  const tenant = propTenant || urlTenant;

  const [evaluation, setEvaluation] = useState<SubscriptionEvaluation | null>(() => {
    if (propEndDate !== undefined || propStatus !== undefined) {
      return evaluateSubscriptionLifecycle({
        subscriptionEndDate: propEndDate,
        subscriptionStatus: propStatus,
        paymentStatus: propPaymentStatus,
      });
    }
    return null;
  });

  const [dismissed, setDismissed] = useState(false);

  // If subscription data wasn't passed directly as props, fetch for current tenant
  useEffect(() => {
    if (propEndDate !== undefined || propStatus !== undefined || !tenant) return;

    let isMounted = true;
    const fetchSubscription = async () => {
      try {
        const res = await fetch(`/api/resolve-tenant?subdomain=${encodeURIComponent(tenant)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && isMounted) {
          const evalResult = evaluateSubscriptionLifecycle({
            subscriptionEndDate: data.subscription_end,
            subscriptionStatus: data.subscription_state,
          });
          setEvaluation(evalResult);
        }
      } catch (err) {
        console.error("Failed to load subscription evaluation for banner:", err);
      }
    };

    fetchSubscription();
    return () => {
      isMounted = false;
    };
  }, [tenant, propEndDate, propStatus]);

  if (!evaluation || !evaluation.showAdminWarning) {
    return null;
  }

  const handleRenew = () => {
    if (onRenewClick) {
      onRenewClick();
      return;
    }
    if (typeof window !== "undefined" && (window as any).triggerManualRenewalModal) {
      (window as any).triggerManualRenewalModal();
      return;
    }
    if (renewUrl) {
      router.push(renewUrl);
      return;
    }
    // Default fallback route to admin billing or settings
    if (tenant) {
      router.push(`/${tenant}/admin`);
    }
  };

  // 1. Grace Period (Day 0 to Day +3): Non-dismissible RED alert
  if (evaluation.state === "GRACE_PERIOD") {
    const daysPast = Math.abs(evaluation.daysRemaining);
    const daysLeftInGrace = Math.max(0, 3 - daysPast);

    return (
      <aside
        aria-label="Subscription Grace Period Warning"
        className="sticky top-0 z-50 w-full bg-linear-to-r from-red-600 to-rose-700 text-white shadow-md border-b border-red-800"
      >
        <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm font-medium">
          <div className="flex items-center gap-2.5">
            <ShieldExclamationIcon className="w-5 h-5 text-red-200 shrink-0 animate-pulse" />
            <span>
              <strong>Action Required:</strong> Your subscription has expired. You
              are in a 3-day grace period ({daysLeftInGrace} day
              {daysLeftInGrace === 1 ? "" : "s"} left). Storefront and checkout
              suspension is imminent!
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRenew}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-red-700 font-semibold rounded-lg hover:bg-red-50 transition-colors shadow-xs text-xs"
            >
              Renew Now
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // 2. Hard Cutoff / Suspension (After Grace Period or Explicit SUSPENDED): High-priority red banner
  if (evaluation.state === "SUSPENDED") {
    return (
      <aside
        aria-label="Subscription Suspended Alert"
        className="sticky top-0 z-50 w-full bg-rose-950 text-white shadow-lg border-b border-rose-900"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm font-medium">
          <div className="flex items-center gap-2.5">
            <XCircleIcon className="w-5 h-5 text-rose-400 shrink-0" />
            <span>
              <strong>Storefront Suspended:</strong> Your subscription grace period
              has elapsed. Public customer storefront access and checkout mutations
              are currently blocked.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRenew}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-500 transition-colors shadow-sm text-xs"
            >
              Reactivate Subscription
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // 3. Warning Window (7 days before expiry): Sticky subtle AMBER warning banner
  if (evaluation.state === "WARNING") {
    if (dismissed) return null;

    return (
      <aside
        aria-label="Subscription Expiration Warning"
        className="sticky top-0 z-40 w-full bg-amber-50 border-b border-amber-200 text-amber-900 shadow-xs"
      >
        <div className="max-w-7xl mx-auto px-4 py-2 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Your platform subscription expires in{" "}
              <strong>
                {evaluation.daysRemaining} day
                {evaluation.daysRemaining === 1 ? "" : "s"}
              </strong>
              . Renew now to prevent any future disruption to your storefront or checkout.
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleRenew}
              className="inline-flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md transition-colors text-xs shadow-2xs"
            >
              Renew Now
              <ArrowRightIcon className="w-3 h-3" />
            </button>

            <button
              onClick={() => setDismissed(true)}
              className="text-amber-700 hover:text-amber-900 text-xs px-1 py-0.5 rounded"
              title="Dismiss for this session"
            >
              ✕
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return null;
};

export default SubscriptionAlertBanner;
