

**Root cause:** `user_responsibilities` has a fixed set of access columns (dashboard, purchase, inventory, sales, sales_billing, reports, settings) — there's no `ecommerce_access` column, so no responsibility can ever grant it, so your sidebar check (however it's gating the Ecommerce link) has nothing to key off.

**Prompt:**

> In `userResponsibilities.ts`, add a new access field `ecommerce_access` end-to-end:
>
> 1. Add `"ecommerce_access"` to `ResponsibilityAccessKey` and `RESPONSIBILITY_ACCESS_FIELDS`.
> 2. Add `ecommerce_access: boolean` to `ResponsibilityRecord`.
> 3. In `ensureResponsibilitySchema`, the existing `CREATE TABLE IF NOT EXISTS` won't add a column to a table that already exists for current companies — add an explicit migration step:
>    ```sql
>    ALTER TABLE public.user_responsibilities
>      ADD COLUMN IF NOT EXISTS ecommerce_access BOOLEAN DEFAULT FALSE;
>    ```
> 4. In `DEFAULT_RESPONSIBILITIES`: set `ecommerce_access: true` for "Admin" only, `false` for the rest. Add a new default responsibility:
>    ```ts
>    {
>      responsibility_name: "Site Handler",
>      dashboard_access: true,
>      purchase_access: false,
>      inventory_access: false,
>      sales_access: false,
>      sales_billing_access: false,
>      reports_access: false,
>      settings_access: false,
>      ecommerce_access: true,
>      is_system: true,
>    },
>    ```
> 5. Add `ecommerce_access: Boolean(row.ecommerce_access)` in `coerceResponsibilityRecord`, and include it in every `SELECT` list in `getResponsibilitiesForCompany` / `getResponsibilityById` / `seedDefaultResponsibilities` (column list + `$` params).
> 6. Sidebar visibility for the Ecommerce menu item must check **two** things, not one: `company_subscriptions.ecommerce_access = true` (plan allows it) **AND** `currentUser.responsibility.ecommerce_access = true` (role allows it). Missing either should hide the link — this is why it's invisible even for companies on an ecom-enabled plan if their Admin responsibility row predates this column.
> 7. Since existing companies' "Admin" rows were seeded before this column existed, run a one-time backfill: `UPDATE public.user_responsibilities SET ecommerce_access = TRUE WHERE responsibility_name = 'Admin' AND is_system = TRUE;`