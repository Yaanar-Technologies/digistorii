export type SubscriptionTierState =
  | "ACTIVE"
  | "WARNING"
  | "GRACE_PERIOD"
  | "SUSPENDED";

export interface SubscriptionEvaluation {
  state: SubscriptionTierState;
  daysRemaining: number;
  isStorefrontBlocked: boolean;
  isCheckoutBlocked: boolean;
  showAdminWarning: boolean;
  warningType: "warning" | "grace_period" | "suspended" | null;
  message?: string;
}

export interface SubscriptionInput {
  subscriptionEndDate?: string | Date | null;
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

  // Difference in milliseconds
  const diffMs = endDate.getTime() - now.getTime();
  // Calculate whole days remaining until expiry
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Tier 1: Future and outside warning window (> 7 days)
  if (daysRemaining > warningWindowDays) {
    return {
      state: "ACTIVE",
      daysRemaining,
      isStorefrontBlocked: false,
      isCheckoutBlocked: false,
      showAdminWarning: false,
      warningType: null,
    };
  }

  // Tier 2: Warning Window (1 to 7 days before expiry, and day of expiry up to day 0)
  if (daysRemaining > 0 && daysRemaining <= warningWindowDays) {
    return {
      state: "WARNING",
      daysRemaining,
      isStorefrontBlocked: false,
      isCheckoutBlocked: false,
      showAdminWarning: true,
      warningType: "warning",
      message: `Your subscription expires in ${daysRemaining} day${
        daysRemaining === 1 ? "" : "s"
      }. Renew now to avoid interruption.`,
    };
  }

  // Tier 3: Grace Period (Day 0 to Day +3)
  // daysRemaining is between 0 and -gracePeriodDays inclusive (e.g. 0, -1, -2, -3)
  const daysPastExpiry = Math.abs(daysRemaining);
  if (daysRemaining <= 0 && daysPastExpiry <= gracePeriodDays) {
    const daysLeftInGrace = gracePeriodDays - daysPastExpiry;
    return {
      state: "GRACE_PERIOD",
      daysRemaining,
      isStorefrontBlocked: false,
      isCheckoutBlocked: false,
      showAdminWarning: true,
      warningType: "grace_period",
      message: `Subscription expired! You are in a ${gracePeriodDays}-day grace period (${daysLeftInGrace} day${
        daysLeftInGrace === 1 ? "" : "s"
      } remaining). Suspension is imminent.`,
    };
  }

  // Tier 4: Hard Cutoff / Suspension (Past Day +3)
  return {
    state: "SUSPENDED",
    daysRemaining,
    isStorefrontBlocked: true,
    isCheckoutBlocked: true,
    showAdminWarning: true,
    warningType: "suspended",
    message:
      "Subscription grace period has ended. Storefront and checkout are suspended.",
  };
}
