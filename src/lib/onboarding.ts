export const SETUP_STAGES = [
  "ACCOUNT_CREATED",
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
  }
} as const;

export type PlanCode = keyof typeof PLAN_CONFIG;
export const PAID_PLAN_CODES = ["BASIC", "STARTER"] as const;
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
  }
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
  { id: 1, key: "PLAN_SELECTED", label: "Subscription & Payment" },
  { id: 2, key: "BUSINESS_SETUP", label: "Business Details" },
  { id: 3, key: "LIVE", label: "Email Verification" },
] as const;

export function isValidSetupStage(value: string): value is SetupStage {
  return SETUP_STAGES.includes(value as SetupStage);
}

// Step shown next in the wizard: 1 pay, 2 business details, 3 email verification.
export function getNextStepNumber(stage: SetupStage): number {
  switch (stage) {
    case "ACCOUNT_CREATED":
      return 1;
    case "PLAN_SELECTED":
      return 2;
    case "BUSINESS_SETUP":
    case "LIVE":
      return 3;
    default:
      return 1;
  }
}
