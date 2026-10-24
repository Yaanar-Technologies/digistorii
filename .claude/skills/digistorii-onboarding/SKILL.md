---
name: digistorii-onboarding
description: How tenant onboarding works in DigiStorii (signup, pay, business details, email verification, go live), which files own each step, the security rules, and how to re-add phone OTP later. Use when changing signup/onboarding, payments for plans, setup stages, or the launch email.
---

# DigiStorii onboarding

Phone OTP was removed from onboarding. Do not re-add it unless asked (see the last section).

## Flow

| # | Where | What happens | `setup_stage` after |
|---|-------|--------------|---------------------|
| 0 | `/get-service` (`GetService.tsx`) → `POST /api/setup` | Business name, slug, owner name/email/phone (contact only, **not verified**), password. Creates company, `tenant_<id>` schema, admin user. Sets signed `onboarding_session` cookie. | `ACCOUNT_CREATED` |
| 1 | `/setup` wizard step 1 "Subscription & Payment" | `POST /api/create-order` makes a Razorpay order and a `payments` row. After checkout, `POST /api/onboarding` `step=PLAN_SELECTED` **verifies the Razorpay HMAC signature and that the order belongs to this company/plan/cycle** before writing the subscription as `paid`. | `PLAN_SELECTED` |
| 2 | wizard step 2 "Business Details" | `step=BUSINESS_SETUP`: GST/PAN, address, currency, timezone, invoice prefix. Creates default location and warehouse. Requires a paid subscription. | `BUSINESS_SETUP` |
| 3 | wizard step 3 "Email Verification" | `POST /api/onboarding/send-launch-email` mails a one-time link. `GET /api/verify-company?token=` sets `LIVE` and clears the token. | `LIVE` |

The wizard polls `GET /api/onboarding` every 3 s and flips to "live" once the link is clicked.

## Rules that must keep holding

- Only `/api/verify-company` may set `LIVE`. `POST /api/onboarding` with `step=LIVE` must fail.
- Never trust `payment_status` from the browser. Payment is proven by the signature check with `RAZORPAY_KEY_SECRET`.
- Every onboarding API calls `canAccessOnboarding(req, slug)` (`src/lib/onboardingAuth.ts`): a valid `onboarding_session` for that slug, or a staff session for that company. Do not read the tenant from `x-tenant` alone.
- Launch email and activation need stage `BUSINESS_SETUP` and a paid subscription.
- Old rows with stage `PHONE_VERIFIED` are read as `ACCOUNT_CREATED` (`toSetupStage`).
- Stage list and step numbers live in `src/lib/onboarding.ts` (`SETUP_STAGES`, `ONBOARDING_STEPS`, `getNextStepNumber`). Wizard step numbers are 1 pay, 2 business, 3 email.

## Files

`src/components/GetService.tsx`, `src/app/api/setup/route.ts`, `src/components/onboarding/OnboardingWizard.tsx`, `src/app/api/onboarding/route.ts`, `src/app/api/create-order/route.ts`, `src/app/api/onboarding/send-launch-email/route.ts`, `src/app/api/verify-company/route.ts`, `src/lib/onboarding.ts`, `src/lib/onboardingAuth.ts`, `src/lib/session.ts`.

## Re-adding phone OTP later

1. Add `PHONE_VERIFIED` back to `SETUP_STAGES`, `ONBOARDING_STEPS` (as step 1) and `getNextStepNumber`; shift the wizard step numbers by one.
2. Recreate `send-otp` and `verify-otp` routes with a real SMS provider. The code must **never** be returned in the response. Hash with SHA-256, 5 min expiry, 5 attempts, resend cooldown, and rate limits per phone, IP and company.
3. Gate `BUSINESS_SETUP`/`PLAN_SELECTED` on `users.phone_verified`. The column still exists.
