"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BillingInterval, normalizeBillingInterval } from "@/lib/onboarding";

export type PlanOption = {
  plan_id: number;
  plan_name: string;
  amount: number;
  price: number;
  billing_cycle: BillingInterval;
  billing_period: string;
  available_billing_period?: string;
  features: string[];
  price_monthly?: number;
  price_yearly?: number;
};

type PricingProps = {
  mode?: "marketing" | "onboarding";
  selectedPlanId?: number | null;
  selectedBillingInterval?: BillingInterval;
  onlySelectedPlan?: boolean;
  onSelectPlan?: (plan: PlanOption) => void;
  onSelectBillingInterval?: (interval: BillingInterval) => void;
  onContinue?: (plan: PlanOption) => void;
  loading?: boolean;
};

const selectedPlanStorageKey = "digistorii:selected-plan";

export function persistSelectedPlan(plan: PlanOption) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(selectedPlanStorageKey, JSON.stringify(plan));
}

export function readPersistedSelectedPlan(): PlanOption | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(selectedPlanStorageKey) || "null");
    if (!parsed?.plan_id || !parsed?.plan_name) return null;
    return {
      plan_id: Number(parsed.plan_id),
      plan_name: String(parsed.plan_name),
      amount: Number(parsed.amount || parsed.price || 0),
      price: Number(parsed.price || parsed.amount || 0),
      billing_cycle: normalizeBillingInterval(parsed.billing_cycle),
      billing_period: String(parsed.billing_period || "Monthly"),
      available_billing_period: String(parsed.available_billing_period || ""),
      features: Array.isArray(parsed.features) ? parsed.features.map(String) : [],
      price_monthly: parsed.price_monthly ? Number(parsed.price_monthly) : undefined,
      price_yearly: parsed.price_yearly ? Number(parsed.price_yearly) : undefined,
    };
  } catch {
    return null;
  }
}

export function PlanCards({
  selectedPlanId,
  selectedBillingInterval = "monthly",
  onlySelectedPlan = false,
  onSelectPlan,
  onSelectBillingInterval,
  onContinue,
  loading = false,
}: Omit<PricingProps, "mode">) {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoadingPlans(true);
    setError("");

    fetch(`/api/plans?billing_cycle=${encodeURIComponent(selectedBillingInterval)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.success || !Array.isArray(data.plans)) {
          throw new Error(data?.message || "Unable to load plans");
        }
        if (alive) setPlans(data.plans);
      })
      .catch((err) => {
        if (alive) setError(err?.message || "Unable to load plans");
      })
      .finally(() => {
        if (alive) setLoadingPlans(false);
      });

    return () => {
      alive = false;
    };
  }, [selectedBillingInterval]);

  const visiblePlans = useMemo(() => {
    if (!onlySelectedPlan) return plans;
    return plans.filter((plan) => Number(plan.plan_id) === Number(selectedPlanId));
  }, [onlySelectedPlan, plans, selectedPlanId]);

  const handleMarketingChoose = (plan: PlanOption) => {
    persistSelectedPlan(plan);
    router.push(
      `/get-service?plan_id=${encodeURIComponent(plan.plan_id)}&plan_name=${encodeURIComponent(
        plan.plan_name
      )}&amount=${encodeURIComponent(plan.amount)}&billing_cycle=${encodeURIComponent(
        plan.billing_cycle
      )}`
    );
  };

  return (
    <div className="space-y-6">
      {onSelectBillingInterval && (
        <div className="flex items-center justify-center">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => onSelectBillingInterval("monthly")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${selectedBillingInterval === "monthly"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
                }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => onSelectBillingInterval("yearly")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${selectedBillingInterval === "yearly"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
                }`}
            >
              Yearly
            </button>
          </div>
        </div>
      )}

      {loadingPlans ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          Loading plans...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          {error}
        </div>
      ) : visiblePlans.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
          Selected plan is not available. Please choose a plan from pricing.
        </div>
      ) : (
        // AFTER:
        <div
          className={
            onlySelectedPlan || visiblePlans.length === 1
              ? "flex justify-center items-stretch"
              : "flex flex-nowrap overflow-x-auto gap-6 items-stretch pb-4 scrollbar-thin"
          }
        >
          {visiblePlans.map((plan, index) => {
            const isSelected = Number(selectedPlanId) === Number(plan.plan_id);
            const isPopular = plan.plan_name.toUpperCase() === "GROWTH";
            const isEnterprise = plan.plan_name.toUpperCase() === "ENTERPRISE";

            const monthlyPrice = plan.price_monthly || 0;
            const yearlyPrice = plan.price_yearly || 0;
            const isYearly = plan.billing_cycle === "yearly";
            const savings = (monthlyPrice * 12) - yearlyPrice;
            const monthsFree = monthlyPrice > 0 ? Math.round((savings / monthlyPrice) * 10) / 10 : 0;

            const cardSpan =
              visiblePlans.length === 1
                ? "w-full max-w-md"
                : "w-[250px] min-w-[280px] flex-shrink-0";

            return (
              <div
                key={`${plan.plan_id}-${plan.billing_cycle}`}
                className={`relative flex flex-col justify-between rounded-3xl border p-8 transition-all duration-300 transform hover:-translate-y-1.5 ${onlySelectedPlan ? "" : cardSpan} ${isSelected
                  ? "border-blue-600 bg-gradient-to-b from-blue-50/50 to-white shadow-xl ring-2 ring-blue-500/20"
                  : isPopular
                    ? "border-indigo-300 bg-white shadow-lg hover:border-indigo-400 hover:shadow-2xl ring-1 ring-indigo-100"
                    : "border-gray-200 bg-white shadow-sm hover:border-blue-300 hover:shadow-xl"
                  }`}
              >
                <div
                  className={`absolute top-0 left-0 h-1.5 w-full rounded-t-3xl ${isSelected
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600"
                    : isPopular
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600"
                      : "bg-transparent"
                    }`}
                />

                {isPopular && (
                  <span className="absolute -top-3.5 right-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md ">
                    Best Value
                  </span>
                )}
                {/* {isEnterprise && (
                  <span className="absolute -top-3.5 right-6 rounded-full bg-gray-800 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md">
                    Enterprise
                  </span>
                )} */}

                <div>
                  {/* Plan Name */}
                  <h3 className="text-xl font-bold text-gray-800 tracking-tight">
                    {plan.plan_name}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {plan.billing_period} Plan
                  </p>

                  {/* Pricing Display */}
                  <div className="mt-6 flex flex-col">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-gray-800 tracking-tight">
                        Rs.{Number(plan.amount || 0).toLocaleString("en-IN")}
                      </span>
                      <span className="text-sm font-medium text-gray-400">
                        / {plan.billing_cycle === "yearly" ? "year" : "month"}
                      </span>
                    </div>

                    {/* Dynamic Savings Highlight */}
                    {isYearly && savings > 0 && (
                      <div className="mt-3 flex flex-col items-start gap-1">
                        <span className="inline-flex items-center rounded-lg bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-bold text-green-700 shadow-sm">
                          Save Rs.{savings.toLocaleString("en-IN")}
                        </span>
                        <span className="text-[11px] text-green-600 font-bold tracking-wide">
                          ({monthsFree} {monthsFree === 1 ? "month" : "months"} free!)
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-8 flex gap-3">
                    {/* {onSelectPlan && (
                      <button
                        type="button"
                        onClick={() => onSelectPlan(plan)}
                        className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all duration-300 shadow-sm ${isSelected
                          ? "bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-500/20"
                          : "bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-600 border border-gray-100"
                          }`}
                      >
                        {isSelected ? "Selected" : "Select Plan"}
                      </button>
                    )} */}

                    {onContinue ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => onContinue(plan)}
                        className="flex-1 rounded-xl bg-blue-700 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-70 transition-all duration-300"
                      >
                        {loading ? "Saving..." : "Proceed to Payment"}
                      </button>
                    ) : (
                      !onSelectPlan && (
                        <button
                          type="button"
                          onClick={() => handleMarketingChoose(plan)}
                          className={`w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-300 shadow-md ${isPopular
                            ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg transform active:scale-95"
                            : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg transform active:scale-95"
                            }`}
                        >
                          Choose {plan.plan_name}
                        </button>
                      )
                    )}
                  </div>

                  {/* Divider */}
                  <div className="my-6 border-b border-gray-100" />

                  {/* Features List */}
                  <div className="space-y-4">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span className="text-sm font-medium text-gray-600 leading-relaxed">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call To Actions */}

              </div>
            );
          })}
        </div>
      )}
    </div>

  );
}

export default function Pricing({
  mode = "marketing",
  selectedPlanId = null,
  selectedBillingInterval = "monthly",
  onlySelectedPlan = false,
  onSelectPlan,
  onSelectBillingInterval,
  onContinue,
  loading = false,
}: PricingProps) {
  const [marketingBillingInterval, setMarketingBillingInterval] =
    useState<BillingInterval>(selectedBillingInterval);

  if (mode === "onboarding") {
    return (
      <section>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Step 2: Payment</h2>
          <p className="mt-1 text-gray-600">Review the selected plan and continue to payment.</p>
        </div>
        <PlanCards
          selectedPlanId={selectedPlanId}
          selectedBillingInterval={selectedBillingInterval}
          onlySelectedPlan={onlySelectedPlan}
          onSelectPlan={onSelectPlan}
          onSelectBillingInterval={onSelectBillingInterval}
          onContinue={onContinue}
          loading={loading}
        />
      </section>
    );
  }

  return (
    <section id="pricing" className="py-20 relative bg-gradient-to-b from-white to-gray-50 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-blue-600 opacity-[0.05] blur-[100px]"></div>
      <div className="absolute left-1/4 right-0 bottom-0 -z-10 m-auto h-[250px] w-[250px] rounded-full bg-purple-600 opacity-[0.05] blur-[100px]"></div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-3">Simple Plans</h2>
          <p className="text-lg text-gray-600">Pick the website plan that fits your business stage.</p>
        </div>

        <PlanCards
          selectedPlanId={selectedPlanId}
          selectedBillingInterval={marketingBillingInterval}
          onSelectBillingInterval={onSelectBillingInterval || setMarketingBillingInterval}
        />
      </div>
    </section>
  );
}
