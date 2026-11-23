export type SubscriptionTierState =
  | "ACTIVE"
  | "WARNING"
  | "GRACE_PERIOD"
  | "SUSPENDED";

export interface SubscriptionEvaluation {
  state: SubscriptionTierState;
  daysRemaining: number;
  daysLeftInGrace?: number;
  gracePeriodEndDate?: string | null;
  isStorefrontBlocked: boolean;
  isCheckoutBlocked: boolean;
  showAdminWarning: boolean;
  warningType: "warning" | "grace_period" | "suspended" | null;
  message?: string;
}

export interface SubscriptionInput {
  subscriptionEndDate?: string | Date | null;
  gracePeriodEndDate?: string | Date | null;
  subscriptionStatus?: string | null;
  paymentStatus?: string | null;
  now?: Date;
  warningWindowDays?: number; // default: 7
  gracePeriodDays?: number; // default: 3
}

/**
 * Pure, testable utility evaluating subscription expiration lifecycle:
 *
 * 1. Warning Window (7 days before expiry):
 *    - Storefront & Checkout: Operational
 *    - Admin: Sticky amber warning banner
 *
 * 2. Grace Period (Day 0 to Day +3):
 *    - Storefront & Checkout: Operational
 *    - Admin: Red alert banner (suspension imminent)
 *    - NO access restrictions or lockouts while NOW() <= subscription_end + 3 days
 *
 * 3. Hard Cutoff / Suspension (After Day +3 grace period or explicit SUSPENDED status):
 *    - Storefront & Checkout: Intercepted and blocked
 *    - Mutations on checkout & order creation: Rejected 403 (STORE_INACTIVE)
 */
export function evaluateSubscriptionLifecycle(
  input: SubscriptionInput
): SubscriptionEvaluation {
  const {
    subscriptionEndDate,
    gracePeriodEndDate,
    subscriptionStatus,
    paymentStatus,
    now = new Date(),
    warningWindowDays = 7,
    gracePeriodDays = 3,
  } = input;

  const rawStatus = (subscriptionStatus || "").trim().toUpperCase();
  const rawPaymentStatus = (paymentStatus || "").trim().toUpperCase();

  // Explicit suspension or cancellation takes immediate effect
  if (
    rawStatus === "SUSPENDED" ||
    rawStatus === "CANCELLED" ||
    rawPaymentStatus === "SUSPENDED"
  ) {
    return {
      state: "SUSPENDED",
      daysRemaining: 0,
      daysLeftInGrace: 0,
      gracePeriodEndDate: gracePeriodEndDate ? new Date(gracePeriodEndDate).toISOString() : null,
      isStorefrontBlocked: true,
      isCheckoutBlocked: true,
      showAdminWarning: true,
      warningType: "suspended",
      message: "Subscription is suspended. Storefront and checkout are inactive.",
    };
  }

  // If there is no end date specified, treat as active if status is active/trialing
  if (!subscriptionEndDate) {
    return {
      state: "ACTIVE",
      daysRemaining: Infinity,
      isStorefrontBlocked: false,
      isCheckoutBlocked: false,
      showAdminWarning: false,
      warningType: null,
    };
  }

  const endDate =
    subscriptionEndDate instanceof Date
      ? subscriptionEndDate
      : new Date(subscriptionEndDate);

  if (isNaN(endDate.getTime())) {
    return {
      state: "ACTIVE",
      daysRemaining: Infinity,
      isStorefrontBlocked: false,
      isCheckoutBlocked: false,
      showAdminWarning: false,
      warningType: null,
    };
  }

  const parsedGraceEnd = gracePeriodEndDate
    ? (gracePeriodEndDate instanceof Date ? gracePeriodEndDate : new Date(gracePeriodEndDate))
    : null;
  const effectiveGraceEnd =
    parsedGraceEnd && !isNaN(parsedGraceEnd.getTime())
      ? parsedGraceEnd
      : new Date(endDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

  // Difference in milliseconds from subscription end
  const diffMs = endDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Tier 1: Future and outside warning window (> 7 days)
  if (now <= endDate && daysRemaining > warningWindowDays) {
    return {
      state: "ACTIVE",
      daysRemaining,
      gracePeriodEndDate: effectiveGraceEnd.toISOString(),
      isStorefrontBlocked: false,
      isCheckoutBlocked: false,
      showAdminWarning: false,
      warningType: null,
    };
  }

  // Tier 2: Warning Window (1 to 7 days before expiry, and day of expiry up to day 0)
  if (now <= endDate && daysRemaining > 0 && daysRemaining <= warningWindowDays) {
    return {
      state: "WARNING",
      daysRemaining,
      gracePeriodEndDate: effectiveGraceEnd.toISOString(),
      isStorefrontBlocked: false,
      isCheckoutBlocked: false,
      showAdminWarning: true,
      warningType: "warning",
      message: `Your subscription expires in ${daysRemaining} day${
        daysRemaining === 1 ? "" : "s"
      }. Renew now to avoid interruption.`,
    };
  }

  // Tier 3: Real 3-Day Grace Period (NOW() <= subscription_end + 3 days)
  if (now > endDate && now <= effectiveGraceEnd) {
    const msLeftInGrace = effectiveGraceEnd.getTime() - now.getTime();
    const daysLeftInGrace = Math.max(0, Math.ceil(msLeftInGrace / (1000 * 60 * 60 * 24)));
    return {
      state: "GRACE_PERIOD",
      daysRemaining,
      daysLeftInGrace,
      gracePeriodEndDate: effectiveGraceEnd.toISOString(),
      isStorefrontBlocked: false,
      isCheckoutBlocked: false,
      showAdminWarning: true,
      warningType: "grace_period",
      message: `Subscription expired! You are in a 3-day grace period (${daysLeftInGrace} day${
        daysLeftInGrace === 1 ? "" : "s"
      } remaining until ${effectiveGraceEnd.toLocaleDateString()}). Suspension is imminent.`,
    };
  }

  // Tier 4: Hard Cutoff / Suspension (Past grace period: NOW() > subscription_end + 3 days)
  return {
    state: "SUSPENDED",
    daysRemaining,
    daysLeftInGrace: 0,
    gracePeriodEndDate: effectiveGraceEnd.toISOString(),
    isStorefrontBlocked: true,
    isCheckoutBlocked: true,
    showAdminWarning: true,
    warningType: "suspended",
    message:
      "Subscription grace period has ended. Storefront and checkout are suspended.",
  };
}
