import { z } from "zod";

/**
 * Exhaustive list of reserved company slugs and system keywords
 * that cannot be used for tenant subdomains or URLs.
 */
export const RESERVED_SLUGS = [
  "api",
  "admin",
  "app",
  "auth",
  "dashboard",
  "settings",
  "store",
  "setup",
  "billing",
  "login",
  "register",
  "checkout",
  "cart",
  "webhook",
  "webhooks",
  "public",
  "static",
  "assets",
  "terms",
  "privacy",
  "policies",
  "store-suspended",
  "digistorii",
  "account",
  "orders",
  "support",
  "help",
  "faq",
  "ws",
  "internal",
  "health",
  "cdn",
  "mail",
  "email",
  "root",
  "system",
  "null",
  "undefined",
] as const;

export const RESERVED_SLUG_SET = new Set<string>(
  RESERVED_SLUGS.map((slug) => slug.toLowerCase())
);

/**
 * Checks whether a given slug is reserved.
 */
export function isReservedSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const normalized = slug.trim().toLowerCase();
  return RESERVED_SLUG_SET.has(normalized);
}

/**
 * Reusable Zod schema for company slug / subdomain validation.
 */
export const companySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Company slug must be at least 3 characters")
  .max(40, "Company slug cannot exceed 40 characters")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Slug may only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen"
  )
  .refine((slug) => !isReservedSlug(slug), {
    message: "This company URL is reserved for system use. Please choose another.",
  });
