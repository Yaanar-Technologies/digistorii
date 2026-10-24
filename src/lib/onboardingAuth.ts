import { NextRequest } from "next/server";
import {
  ONBOARDING_COOKIE_NAME,
  ONBOARDING_SESSION_EXPIRY_SECONDS,
  OnboardingSessionPayload,
  STAFF_COOKIE_NAME,
  StaffSessionPayload,
  getCookieOptions,
  signSession,
  verifySession,
} from "@/lib/session";

export async function createOnboardingCookie(companyId: number, company: string) {
  const token = await signSession(
    { company_id: companyId, company },
    ONBOARDING_SESSION_EXPIRY_SECONDS,
    "onboarding"
  );
  return {
    name: ONBOARDING_COOKIE_NAME,
    value: token,
    options: getCookieOptions(ONBOARDING_SESSION_EXPIRY_SECONDS),
  };
}

/**
 * True only when the request carries a signed onboarding session (issued at signup)
 * or a staff session (a returning owner who signed in) for exactly this company.
 */
export async function canAccessOnboarding(req: NextRequest, company: string): Promise<boolean> {
  const slug = company.trim().toLowerCase();
  if (!slug) return false;

  const onboarding = await verifySession<OnboardingSessionPayload>(
    req.cookies.get(ONBOARDING_COOKIE_NAME)?.value,
    "onboarding"
  );
  if (onboarding && onboarding.company === slug) return true;

  const staff = await verifySession<StaffSessionPayload>(
    req.cookies.get(STAFF_COOKIE_NAME)?.value,
    "staff"
  );
  return Boolean(staff && staff.company_name === slug);
}
