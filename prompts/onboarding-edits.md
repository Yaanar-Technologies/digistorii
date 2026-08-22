# Developer Task: Onboarding Simplification & Post-Login Setup Refactoring

## 1. Goal
Refactor the tenant onboarding workflow from an 8-step process to a streamlined 4-step wizard. Prevent backend errors caused by missing initial locations/warehouses, implement automatic default record generation, and establish a guided post-login wizard in the workspace alongside a Business Configuration Settings page.

---

## 2. Onboarding Workflow Changes

### Step 1: Phone Verification
- Retain existing SMS/OTP logic for verifying the owner's phone number.
- On success, set `next_step = 2`.

### Step 2: Plan Selection & Payment
- Render plan option only that one specific plan  and process Razorpay payment.
- Display previously completed steps in a read-only summary header (e.g., Phone Verified: +91 XXXXX XXXXX).
- On payment confirmation, set `next_step = 3`.

### Step 3: Business Setup
- Collect state, city, business address, currency, GSTIN, and PAN.
- if gst avaible is not true then dont save gstnumber , currently they are saved when two digists of gst are saved after state submission. it should not happen.
- **Backend Requirement:** Upon saving Step 3, automatically create:
  1. A default store location record named `"Main Branch"` using the business address.
  2. A default warehouse record named `"Default Warehouse"` associated with the default store location.
- Set `next_step = 4`.

### Step 4: Email Validation & Workspace Creation
- Trigger the workspace launch activation email.
- Render a wide, celebratory success screen indicating activation email dispatch and workspace creation.
- On email verification, mark tenant status as `PENDING_GUIDED_SETUP` and grant login access.

---

## 3. UI/UX Refactoring (`OnboardingWizard.tsx`)

1. **Layout Width:** Change root container wrapper to `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`.
2. **Stepper Component:**
   - Update `ONBOARDING_STEPS` array to only 4 steps:
     1. Phone Verification
     2. Subscription & Payment
     3. Business Details
     4. Email Activation
3. **Read-Only Context Cards:**
   - In Steps 3 and 4, display a subtle read-only badge/card summarizing the active plan and payment status (prevent re-payment).
4. **Email Activation Completion UI:**
   - Redesign step 4 into an engaging UX state with animated confirmation icons, clear instructions, and auto-polling until the activation link is clicked.

---

## 4. Backend Safeguards & Post-Login Guidance

1. **Fix Missing Location/Warehouse Crash:**
   - Update user authentication middleware (`/api/auth` / session token generation) to support `location_id` and `warehouse_id` as optional or defaulted for `ADMIN` roles `select * from user_responsibilities where responsibility_name='Admin';`
   - Inject the auto-created default location and warehouse IDs into user sessions if custom values are not set.

2. **Workspace Guided Setup Modal:**
   - Path: `/app/[company]/workspace/components/GuidedSetupModal.tsx`
   - Trigger condition: On `/workspace` load, check `tenant.has_completed_guided_setup === false`.
   - Display a step-by-step modal guide prompting the user to:
     - **Step A:** Confirm/Customize store location details.
     - **Step B:** Confirm/Customize default warehouse details.
     - **Step C:** Optionally invite additional staff members.
   - Upon completion, mark `has_completed_guided_setup = true`.

---

## 5. Workspace Business Configuration Settings Page

Create a new page at `/app/[company]/workspace/settings/business-configuration/page.tsx`:
- Render read-only detail views with edit options for:
  - **Company & Plan Info:** Tenant Name, Owner Contact, Subscription Tier, Usage Quotas (Users, Locations, Warehouses).
  - **Business Configuration:** GSTIN, PAN, Registered Address, Currency, Timezone.
  - **Locations Summary:** Table list of all configured locations.(ability to click & redirect page to that location form & edit )
  - **Warehouses Summary:** Table list of all configured warehouses.(ability to click & redirect page to that warehouse form & edit)

---

## 6. Execution Steps & File Impact List

- [ ] Update `lib/onboarding.ts` step definitions and constants to reflect 4 total steps.
- [ ] Refactor `/api/onboarding` endpoint to handle backend auto-provisioning of default location & warehouse upon `BUSINESS_SETUP` save.
- [ ] Refactor `components/OnboardingWizard.tsx` layout width, stepper items, step states, and read-only context banners.
- [ ] Implement `GuidedSetupModal.tsx` in the workspace dashboard layout.
- [ ] Build `/workspace/settings/business-configuration/page.tsx`.