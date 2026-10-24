import { SignJWT, jwtVerify } from "jose";

export type SessionType = "staff" | "customer" | "onboarding";

export interface BaseSessionPayload {
  type: SessionType;
  [key: string]: any;
}

export interface CustomerSessionPayload extends BaseSessionPayload {
  type: "customer";
  customerId: number;
  company: string;
  name?: string;
  email?: string;
  phone?: string;
  channel?: string;
}

export interface StaffSessionPayload extends BaseSessionPayload {
  type: "staff";
  id: number;
  user_id: number;
  username: string;
  email: string;
  phone?: string;
  name?: string;
  company_id: number;
  company_name: string;
  real_company_name?: string;
  permissions?: any;
  warehouse_id?: number | null;
}

export const STAFF_COOKIE_NAME = "user";
export const CUSTOMER_COOKIE_NAME = "customer_session";
export const ONBOARDING_COOKIE_NAME = "onboarding_session";

export interface OnboardingSessionPayload extends BaseSessionPayload {
  type: "onboarding";
  company_id: number;
  company: string;
}

export const ONBOARDING_SESSION_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

export const STAFF_SESSION_EXPIRY_SECONDS = 12 * 60 * 60; // 12 hours
export const CUSTOMER_SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error("JWT_SECRET environment variable is missing or empty.");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Signs a session payload into a JWT using jose.
 */
export async function signSession(
  payload: Record<string, any>,
  expiresIn: string | number,
  type: SessionType
): Promise<string> {
  const secretKey = getJwtSecretKey();
  const claims = { ...payload, type };

  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt();

  if (typeof expiresIn === "number") {
    jwt.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn);
  } else {
    jwt.setExpirationTime(expiresIn);
  }

  return await jwt.sign(secretKey);
}

/**
 * Verifies a JWT token using jose.
 * Returns payload if valid and expectedType matches, else returns null.
 */
export async function verifySession<T = any>(
  token: string | undefined | null,
  expectedType?: SessionType
): Promise<T | null> {
  if (!token) return null;
  try {
    const secretKey = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secretKey);

    if (expectedType && payload.type !== expectedType) {
      return null;
    }

    return payload as unknown as T;
  } catch {
    return null;
  }
}
