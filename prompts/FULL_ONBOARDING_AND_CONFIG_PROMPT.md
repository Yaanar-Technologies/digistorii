# Implementation Prompt: Full-Width Vertical Onboarding UI & Business Configuration Module

## 1. Goal
1. Refactor `OnboardingWizard.tsx` to utilize full screen space using a split layout (Vertical Stepper Sidebar on the left + Active Step Form / Summary Card on the right).
2. Allow clicking completed steps in the vertical sidebar to view read-only summaries of entered data (Owner Info, Payment/Plan details, Business Address, GSTIN).
3. Replace the placeholder content in `/workspace/settings/business-configuration` with a fully functional Business Configuration hub that fetches and updates Company details, GST/PAN, Address, Active Subscription, Locations, and Warehouses.

---

## 2. Refactoring `OnboardingWizard.tsx` (UI Layout & Read-Only Summary)

### A. Split Screen Container Setup
Replace the root wrapper with a full-viewport split layout:
```tsx
<div className="min-h-screen w-full bg-slate-50 flex flex-col md:flex-row">
  {/* Left Sidebar Stepper (25% - Slate / Indigo Tinted Background) */}
  <aside className="w-full md:w-80 lg:w-96 bg-gradient-to-b from-slate-900 to-indigo-950 text-white p-6 md:p-8 flex flex-col justify-between shrink-0">
    {/* Header & Vertical Stepper */}
  </aside>

  {/* Right Canvas (75% - Wide Workspace) */}
  <main className="flex-1 p-6 md:p-12 overflow-y-auto">
    {/* Header & Active Step / Summary Card */}
  </main>
</div>

```

### B. Vertical Stepper Component (Matching Reference UI)

Implement a vertical progress tree in the left sidebar:

* Step circles with state indicators:
* **Completed:** Green filled circle with checkmark icon (`bg-emerald-500`).
* **Active:** Blue ring with custom icon (`bg-blue-600 ring-4 ring-blue-500/30`).
* **Upcoming:** Slate outline with subtle gray text.


* Connecting lines between steps (`w-0.5 bg-slate-700` or `bg-emerald-500` if prior step is finished).
* **Click Handler:** Allow clicking any `step.id < currentStep` to set `viewingStepSummary = step.id`.
* **Bottom Support Box:** Add a card at the bottom:
```tsx
<div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center gap-3">
  <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold">?</div>
  <div>
    <p className="text-xs text-slate-400">Having troubles?</p>
    <a href="mailto:workpro@yaanartech.com" className="text-sm font-semibold text-white hover:underline">Contact Us</a>
  </div>
</div>

```



### C. Read-Only Summary Card (When Clicking Previous Steps)

When `viewingStepSummary` is active (or when looking back at Step 1/Step 2/Step 3):

* Render a read-only detail card instead of the active form.
* Display badges for status (e.g., `Phone Verified`, `Payment Success`, `Business Saved`).
* **Data displayed:**
* **Step 1:** Owner Phone, Verification Status.
* **Step 2:** Selected Plan, Billing Cycle, Amount Paid.
* **Step 3:** Company Address, State, City, GSTIN, PAN, Currency.


* Provide a button: `← Back to Current Step (Step X)`.

---

## 3. Building `/workspace/settings/business-configuration` Page

Replace the page at `app/[company]/workspace/settings/business-configuration/page.tsx` with a multi-section dashboard:

### Section 1: Subscription & Plan Status Card

* **Fields:** Active Plan Name, Billing Cycle (Monthly/Yearly), Expiry / Renewal Date.
* **Resource Usage Quotas:** Progress bars or stats for:{smaller text}
* System Users (Used / Max Limit)
* Store Locations (Used / Max Limit)
* Warehouses (Used / Max Limit)



### Section 2: Business & Tax Configuration Form

* **API Endpoint:** `GET /api/business-settings` & `PUT /api/business-settings`
* **Fields:**
* GSTIN (Editable with standard 15-char regex validation)
* PAN Number
* Business Address, State, City, Country, Currency


* **Actions:** "Save Changes" button to update company business details.

### Section 3: Locations Management

* **API Endpoint:** `GET /api/locations`
* Render a clean grid/table listing all configured store locations.
* **Actions:**
* "Edit Location"-> redirectes to that location data  in form `C:\Users\yanna\digistorii\src\app\[company]\(user)\workspace\inventory\location\page.tsx` like to update Name, Address, Contact details example simple to edit fetch of edit in location
* "Default" badge for the primary store location.

### Section 4: Warehouses Management

* **API Endpoint:** `GET /api/warehouses`
* Render a grid/table listing all configured warehouses and their associated locations.
* **Actions:**
* "Edit Warehouse"redirectes to that warehouse data  in form `C:\Users\yanna\digistorii\src\app\[company]\(user)\workspace\inventory\warehouse\page.tsx` to update Warehouse Code, Name, Landline, Contact Person.


---

## 4. Execution Checklist

* [ ] Update `components/OnboardingWizard.tsx` layout to Split View (`w-full md:w-80` sidebar + `flex-1` main area).
* [ ] Build vertical stepper UI matching the reference design with completed, active, and upcoming states.
* [ ] Implement `viewingStepSummary` state in `OnboardingWizard.tsx` to view read-only summaries of previous steps.
* [ ] Create API handler or reuse existing `/api/onboarding` status payload to supply filled step data for summary views.
* [ ] Refactor `app/[company]/workspace/settings/business-configuration/page.tsx` with full business profile, tax settings, plan quotas, location, and warehouse management forms.

```

