import Link from "next/link";
import GetService from "@/components/GetService";
import { normalizeBillingInterval } from "@/lib/onboarding";
import type { PlanOption } from "@/components/landing/Pricing";

export const dynamic = "force-dynamic";

type GetServicePageProps = {
  searchParams: Promise<{
    plan_id?: string;
    plan_name?: string;
    amount?: string;
    billing_cycle?: string;
  }>;
};

export default async function GetServicePage({ searchParams }: GetServicePageProps) {
  const params = await searchParams;

  let selectedPlan: PlanOption | null = null;
  if (params.plan_id) {
    const billingCycle = normalizeBillingInterval(params.billing_cycle);
    selectedPlan = {
      plan_id: Number(params.plan_id),
      plan_name: String(params.plan_name || ""),
      amount: Number(params.amount || 0),
      price: Number(params.amount || 0),
      billing_cycle: billingCycle,
      billing_period: billingCycle === "yearly" ? "Yearly" : "Monthly",
      features: [],
    };
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header/Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">

          {/* Logo Section */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">D</span>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                DigiStorii
              </h1>
              <p className="text-sm text-gray-500 -mt-1">
                Smart E-Commerce  SaaS
              </p>
            </div>
          </div>

          {/* Navigation Buttons
          <div className="flex gap-3 bg-gray-50 p-1 rounded-xl shadow-inner">
            <Link
              href="/"
              className="px-6 py-2 rounded-lg font-semibold transition-all duration-300 text-gray-700 hover:text-blue-600 hover:bg-gray-100"
            >
              E-Commerce  Hub
            </Link>
            <Link
              href="/get-service"
              className="px-6 py-2 rounded-lg font-semibold transition-all duration-300 bg-gradient-to-tr from-blue-500 to-indigo-500 text-white shadow-lg"
            >
              Get Your Website 
            </Link>
          </div> */}
        </div>
      </nav>

      {/* Tab Content */}
      <main>
        <GetService selectedPlan={selectedPlan} />
      </main>
    </div>
  );
}
