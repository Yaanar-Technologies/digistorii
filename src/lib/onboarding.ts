export const SETUP_STAGES = [
  "ACCOUNT_CREATED",
  "PHONE_VERIFIED",
  "PLAN_SELECTED",
  "BUSINESS_SETUP",
  "LIVE",
] as const;

export type SetupStage = (typeof SETUP_STAGES)[number];

export const PLAN_CONFIG = {

  BASIC: {
    code: "BASIC",
    title: "BASIC",
    ecommerce_access: false,
    max_users: 5,
    max_locations: 1,
    max_warehouses: 1,
  },
  STARTER: {
    code: "STARTER",
    title: "STARTER",
    ecommerce_access: true,
    max_users: 10,
    max_locations: 2,
    max_warehouses: 2,
  },
  GROWTH: {
    code: "GROWTH",
    title: "GROWTH",
    ecommerce_access: true,
    max_users: 20,
    max_locations: 10,
    max_warehouses: 10,
  },
} as const;

export type PlanCode = keyof typeof PLAN_CONFIG;
export const PAID_PLAN_CODES = ["BASIC", "STARTER", "GROWTH"] as const;
export type PaidPlanCode = (typeof PAID_PLAN_CODES)[number];

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

const yearlyFromMonthly = (monthlyAmount: number) => Math.round(monthlyAmount * 12 * 0.8);

export const PLAN_PRICING: Record<
  PaidPlanCode,
  { monthly: number; yearly: number; yearly_savings_label: string }
> = {
  BASIC: {
    monthly: 99,
    yearly: yearlyFromMonthly(99),
    yearly_savings_label: "Save 20%",
  },
  STARTER: {
    monthly: 999,
    yearly: yearlyFromMonthly(999),
    yearly_savings_label: "Save 20%",
  },
  GROWTH: {
    monthly: 1999,
    yearly: yearlyFromMonthly(1999),
    yearly_savings_label: "Save 20%",
  },
};

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === "string" && BILLING_INTERVALS.includes(value.toLowerCase() as BillingInterval);
}

export function normalizeBillingInterval(value: unknown): BillingInterval {
  if (isBillingInterval(value)) {
    return value.toLowerCase() as BillingInterval;
  }
  return "monthly";
}

export function isPaidPlanCode(value: unknown): value is PaidPlanCode {
  return typeof value === "string" && PAID_PLAN_CODES.includes(value.toUpperCase() as PaidPlanCode);
}

export function normalizePaidPlanCode(value: unknown): PaidPlanCode | null {
  if (!isPaidPlanCode(value)) return null;
  return value.toUpperCase() as PaidPlanCode;
}

export function getPlanAmountInINR(planCode: PaidPlanCode, billingInterval: BillingInterval): number {
  return PLAN_PRICING[planCode][billingInterval];
}

export function getPlanAmountInPaise(planCode: PaidPlanCode, billingInterval: BillingInterval): number {
  return getPlanAmountInINR(planCode, billingInterval) * 100;
}

export const ONBOARDING_STEPS = [
  { id: 1, key: "PHONE_VERIFIED", label: "Phone Verification" },
  { id: 2, key: "PLAN_SELECTED", label: "Subscription & Payment" },
  { id: 3, key: "BUSINESS_SETUP", label: "Business Details" },
  { id: 4, key: "LIVE", label: "Email Activation" },
] as const;

export function isValidSetupStage(value: string): value is SetupStage {
  return SETUP_STAGES.includes(value as SetupStage);
}

export function getNextStepNumber(stage: SetupStage): number {
  switch (stage) {
    case "ACCOUNT_CREATED":
      return 1;
    case "PHONE_VERIFIED":
      return 2;
    case "PLAN_SELECTED":
      return 3;
    case "BUSINESS_SETUP":
      return 4;
    case "LIVE":
      return 4;
    default:
      return 1;
  }
}
