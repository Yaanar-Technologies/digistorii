Refactor the customer authentication flow and storefront header to establish a clean, production-grade session lifecycle. Fix the modal UX so it behaves as a unified login/register experience, and update the header to display real authenticated customer state instead of a static "Sign In" button.

CURRENT DEFECTS TO ELIMINATE:
1. Modal Tab Confusion: The modal currently presents "Sign In", "Register", and "OTP Code" as separate disconnected top tabs. Instead, users should have two core journeys: "Sign In" and "Create Account".
2. Missing Auth State in Header: The `StorefrontHeader` always renders a static "Sign In" button even after `onSuccessAuth` fires or an active session exists.
3. No Session Persistence: No centralized state (context or Zustand store) keeps track of the authenticated customer, preventing the UI from showing their name, an account menu, or a logout action.

WORKFLOW TO IMPLEMENT:

1. Unified Customer Auth Store (`store/customerAuthStore.ts`):
   - Create a lightweight client store (using Zustand or React Context) holding:
     * `customer`: `{ id: number, name: string, email: string, phone: string } | null`
     * `isAuthenticated`: boolean
     * `setCustomer(customerData)` / `clearCustomer()` (logout)
   - Hydrate on initial mount by calling a lightweight session verification endpoint (e.g. `GET /api/ecom/auth/me`) that inspects the current session cookie/token.

2. Modal Architecture Refactor (`CustomerAuthModal.tsx`):
   - Eliminate the 3-tab layout at the top. The modal should only toggle between two primary views:
     * Mode: 'signin'
     * Mode: 'register'
   - In 'Sign In' View:
     * Provide sub-methods toggled within the card: "Password" or "One-Time Password (OTP)" (e.g., small link/switch: "Sign in with OTP instead" / "Sign in with Password").
     * At the bottom of the sign-in form, add a prominent action footer:
       "Don't have an account? Create an account" -> switches state to 'register'.
   - In 'Create Account' View:
     * Display standard registration fields: Full Name, Indian Phone Number (10 digits), Email, Password.
     * At the bottom of the registration form, add:
       "Already have an account? Sign in" -> switches state to 'signin'.
   - OTP Verification Flow:
     * Treat OTP verification as a secondary step attached to the flow rather than a separate top tab. Keep track of previous step so the user can easily click "Back" or "Edit phone/email".
   - On Successful Login/Registration:
     * Update `customerAuthStore` with the returned customer payload.
     * Trigger `onSuccessAuth` and close the modal.

3. Storefront Header Dynamic State (`StorefrontHeader.tsx`):
   - Subscribe to the authenticated customer state from `customerAuthStore`.
   - Update the desktop and mobile auth buttons:
     * If unauthenticated (`!isAuthenticated`):
       - Display the existing "Sign In" button triggering `onOpenAuth`.
     * If authenticated (`isAuthenticated`):
       - Replace "Sign In" with an Account Dropdown / Avatar containing:
         - Display label: First Name or "Hi, {cust_name}" with a user icon.
         - Dropdown options: "My Orders", "Saved Addresses", and "Logout".
       - The "Logout" button must call `POST /api/ecom/auth/logout`, clear `customerAuthStore`, and reset header UI back to "Sign In".

VERIFICATION & ACCEPTANCE CRITERIA:
- Opening the modal defaults to "Sign In" with an intuitive link to "Create an account" instead of confusing tab headers.
- Registering a new account or signing in via password/OTP successfully closes the modal and immediately changes the header button from "Sign In" to the user's name.
- Refreshing the storefront keeps the user logged in via the session check.
- Clicking "Logout" cleanly drops session state and restores the "Sign In" trigger across both desktop and mobile headers.