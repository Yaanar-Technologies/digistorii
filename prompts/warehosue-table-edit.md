# Task: Update Warehouse Address Schema, API & Onboarding Form with "Same as Ship-to Address" Support

Please update the backend database, API logic, and backend onboarding (`src/app/api/onboarding/route.ts`) to support structured addresses for warehouses, including a toggle for inheriting the primary location's ship-to address.

---

## 1. Database Schema (`warehouses` table)

Execute the following SQL migration script to add structured address fields and an inheritance flag to the `warehouses` table:
edit @C:\Users\yanna\digistorii\lib\schema.ts and add warehouse address schema columns.

```sql
-- Add boolean flag to check if warehouse uses the linked location's ship-to address
ALTER TABLE warehouses 
  ADD COLUMN IF NOT EXISTS same_as_ship_to BOOLEAN DEFAULT TRUE;

-- Add structured address columns
ALTER TABLE warehouses 
  ADD COLUMN IF NOT EXISTS address_line_1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);

```

---

## 2. Frontend State & Types (`OnboardingWizard.tsx`)

### A. Update `WarehouseSetupForm` Interface

Update `WarehouseSetupForm` to replace the single generic `address` string with structured address attributes:

```typescript
type WarehouseSetupForm = {
  code: string;
  name: string;
  location_id: string;
  type: "global" | "local";
  same_as_ship_to: boolean;
  address_line_1: string;
  address_line_2: string;
  country: string;
  state: string;
  city: string;
  pincode: string;
  effective_from: string;
  effective_to: string;
  description: string;
  landline: string;
  mobile_no: string;
  fax: string;
  email: string;
  contact_person_name: string;
  contact_person_mobile: string;
  contact_person_email: string;
  pan: string;
  gstin: string;
  is_default: boolean;
};

```

### B. Update `defaultWarehouse` State

Set `same_as_ship_to` to `true` by default and pre-select `country` as `"India"`:

```typescript
const defaultWarehouse: WarehouseSetupForm = {
  code: "",
  name: "",
  location_id: "",
  type: "global",
  same_as_ship_to: true,
  address_line_1: "",
  address_line_2: "",
  country: "India",
  state: "",
  city: "",
  pincode: "",
  effective_from: "",
  effective_to: "",
  description: "",
  landline: "",
  mobile_no: "",
  fax: "",
  email: "",
  contact_person_name: "",
  contact_person_mobile: "",
  contact_person_email: "",
  pan: "",
  gstin: "",
  is_default: true,
};

```

---

## 3. UI Form Implementation Requirements
Change warehouse form in `/workspace/inventory/warehouse/page.tsx` to inclued : 
1. **"Same as Location Ship-to Address" Checkbox:**
* Add a checkbox labeled **"Same as Location's Ship-To Address"** bound to `warehouse.same_as_ship_to`.


2. **Dynamic UI Rendering:**
* **If `same_as_ship_to === true`:** Hide manual address inputs (`address_line_1`, `address_line_2`, `city`, `state`, `pincode`). Show an informational text banner indicating: *"Warehouse will use the selected location's shipping address."*
* **If `same_as_ship_to === false`:** Render inputs for Country (disabled/defaulted to "India"), State, City, Address Line 1, Address Line 2{symbols validation only}, and Pincode (6 digits validation).



## 4. Backend SQL Logic Update (`/api/onboarding`)
Maintain same steps of onboarding but just add this same as ship to flow for new warehouse columns

In the backend endpoint handling `WAREHOUSE_SETUP`, update the SQL query to insert/update the new address fields and boolean flag:

```sql
INSERT INTO warehouses (
  company_id, location_id, code, name, type, same_as_ship_to,
  address_line_1, address_line_2, city, state, country, pincode,
  landline, mobile_no, fax, email, contact_person_name,
  contact_person_mobile, contact_person_email, is_default
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
)
ON CONFLICT (id) DO UPDATE SET
  location_id = EXCLUDED.location_id,
  same_as_ship_to = EXCLUDED.same_as_ship_to,
  address_line_1 = EXCLUDED.address_line_1,
  address_line_2 = EXCLUDED.address_line_2,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  country = EXCLUDED.country,
  pincode = EXCLUDED.pincode,
  updated_at = NOW();

```

```

```