import { PoolClient } from "pg";

export type ResponsibilityAccessKey =
  | "dashboard_access"
  | "purchase_access"
  | "inventory_access"
  | "sales_access"
  | "sales_billing_access"
  | "reports_access"
  | "settings_access"
  | "ecommerce_access";

export type ResponsibilityRecord = {
  id: number;
  company_id: number;
  responsibility_name: string;
  dashboard_access: boolean;
  purchase_access: boolean;
  inventory_access: boolean;
  sales_access: boolean;
  sales_billing_access: boolean;
  reports_access: boolean;
  settings_access: boolean;
  ecommerce_access: boolean;
  is_system: boolean;
};

async function hasPublicColumn(client: PoolClient, tableName: string, columnName: string) {
  const result = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1`,
    [tableName, columnName]
  );
  return Boolean(result.rowCount);
}

export const RESPONSIBILITY_ACCESS_FIELDS: ResponsibilityAccessKey[] = [
  "dashboard_access",
  "purchase_access",
  "inventory_access",
  "sales_access",
  "sales_billing_access",
  "reports_access",
  "settings_access",
  "ecommerce_access",
];

export const DEFAULT_RESPONSIBILITIES: Array<
  Omit<ResponsibilityRecord, "id" | "company_id">
> = [
    {
      responsibility_name: "Admin",
      dashboard_access: true,
      purchase_access: true,
      inventory_access: true,
      sales_access: true,
      sales_billing_access: true,
      reports_access: true,
      settings_access: true,
      ecommerce_access: true,
      is_system: true,
    },
    {
      responsibility_name: "Site Handler",
      dashboard_access: true,
      purchase_access: false,
      inventory_access: false,
      sales_access: false,
      sales_billing_access: false,
      reports_access: false,
      settings_access: false,
      ecommerce_access: true,
      is_system: true,
    },
    {
      responsibility_name: "Inventory Manager",
      dashboard_access: true,
      purchase_access: false,
      inventory_access: true,
      sales_access: false,
      sales_billing_access: false,
      reports_access: true,
      settings_access: false,
      ecommerce_access: false,
      is_system: true,
    },
    {
      responsibility_name: "Purchasing Agent",
      dashboard_access: true,
      purchase_access: true,
      inventory_access: false,
      sales_access: false,
      sales_billing_access: false,
      reports_access: true,
      settings_access: false,
      ecommerce_access: false,
      is_system: true,
    },
    {
      responsibility_name: "Sales Person",
      dashboard_access: true,
      purchase_access: false,
      inventory_access: false,
      sales_access: true,
      sales_billing_access: true,
      reports_access: false,
      settings_access: false,
      ecommerce_access: false,
      is_system: true,
    },
    {
      responsibility_name: "Sales Manager",
      dashboard_access: true,
      purchase_access: false,
      inventory_access: false,
      sales_access: true,
      sales_billing_access: true,
      reports_access: true,
      settings_access: false,
      ecommerce_access: false,
      is_system: true,
    },
    {
      responsibility_name: "Accountant",
      dashboard_access: true,
      purchase_access: false,
      inventory_access: false,
      sales_access: false,
      sales_billing_access: false,
      reports_access: true,
      settings_access: false,
      ecommerce_access: false,
      is_system: true,
    },
  ];

function legacyRoleToResponsibilityName(role: string | null | undefined) {
  const normalized = String(role || "").trim().toUpperCase();
  switch (normalized) {
    case "OWNER":
    case "ADMIN":
      return "Admin";
    case "MANAGER":
      return "Sales Manager";
    case "WAREHOUSE_STAFF":
      return "Inventory Manager";
    case "CASHIER":
    default:
      return "Sales Person";
  }
}

export function coerceResponsibilityRecord(row: Record<string, unknown>): ResponsibilityRecord {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    responsibility_name: String(row.responsibility_name || ""),
    dashboard_access: Boolean(row.dashboard_access),
    purchase_access: Boolean(row.purchase_access),
    inventory_access: Boolean(row.inventory_access),
    sales_access: Boolean(row.sales_access),
    sales_billing_access: Boolean(row.sales_billing_access),
    reports_access: Boolean(row.reports_access),
    settings_access: Boolean(row.settings_access),
    ecommerce_access: Boolean(row.ecommerce_access),
    is_system: Boolean(row.is_system),
  };
}

export async function ensureResponsibilitySchema(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.user_responsibilities (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      responsibility_name VARCHAR(100) NOT NULL,
      dashboard_access BOOLEAN DEFAULT TRUE,
      purchase_access BOOLEAN DEFAULT FALSE,
      inventory_access BOOLEAN DEFAULT FALSE,
      sales_access BOOLEAN DEFAULT FALSE,
      sales_billing_access BOOLEAN DEFAULT FALSE,
      reports_access BOOLEAN DEFAULT FALSE,
      settings_access BOOLEAN DEFAULT FALSE,
      ecommerce_access BOOLEAN DEFAULT FALSE,
      is_system BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    UPDATE public.user_responsibilities 
    SET ecommerce_access = TRUE 
    WHERE responsibility_name = 'Admin' AND is_system = TRUE;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_user_responsibilities_company_name
    ON public.user_responsibilities(company_id, responsibility_name);
  `);
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_users_responsibility_id'
      ) THEN
        ALTER TABLE public.users
        ADD CONSTRAINT fk_users_responsibility_id
        FOREIGN KEY (responsibility_id)
        REFERENCES public.user_responsibilities(id)
        ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_company_user_map_responsibility_id'
      ) THEN
        ALTER TABLE public.company_user_map
        ADD CONSTRAINT fk_company_user_map_responsibility_id
        FOREIGN KEY (responsibility_id)
        REFERENCES public.user_responsibilities(id)
        ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);
}

export async function seedDefaultResponsibilities(client: PoolClient, companyId: number) {
  await ensureResponsibilitySchema(client);

  for (const responsibility of DEFAULT_RESPONSIBILITIES) {
    await client.query(
      `INSERT INTO public.user_responsibilities
       (
         company_id, responsibility_name, dashboard_access, purchase_access,
         inventory_access, sales_access, sales_billing_access, reports_access,
         settings_access, ecommerce_access, is_system, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       ON CONFLICT (company_id, responsibility_name) DO NOTHING`,
      [
        companyId,
        responsibility.responsibility_name,
        responsibility.dashboard_access,
        responsibility.purchase_access,
        responsibility.inventory_access,
        responsibility.sales_access,
        responsibility.sales_billing_access,
        responsibility.reports_access,
        responsibility.settings_access,
        responsibility.ecommerce_access,
        responsibility.is_system,
      ]
    );
  }
}

export async function ensureCompanyResponsibilities(client: PoolClient, companyId: number) {
  await seedDefaultResponsibilities(client, companyId);
  const usersHasRole = await hasPublicColumn(client, "users", "role");
  const companyMapHasRole = await hasPublicColumn(client, "company_user_map", "role");

  const responsibilityResult = await client.query(
    `SELECT id, responsibility_name
     FROM public.user_responsibilities
     WHERE company_id = $1`,
    [companyId]
  );

  const idByName = new Map<string, number>();
  for (const row of responsibilityResult.rows) {
    idByName.set(String(row.responsibility_name), Number(row.id));
  }

  const userRows = await client.query(
    `SELECT
       id,
       ${usersHasRole ? "role" : "NULL::text AS role"}
     FROM public.users
     WHERE company_id = $1
       AND responsibility_id IS NULL`,
    [companyId]
  );

  for (const row of userRows.rows) {
    const name = legacyRoleToResponsibilityName(row.role);
    const responsibilityId = idByName.get(name);
    if (!responsibilityId) continue;
    await client.query(
      `UPDATE public.users
       SET responsibility_id = $1
       WHERE id = $2`,
      [responsibilityId, Number(row.id)]
    );
  }

  const mappingRows = await client.query(
    `SELECT
       cum.id,
       cum.user_id,
       ${companyMapHasRole ? "cum.role" : "NULL::text AS role"},
       u.responsibility_id AS user_responsibility_id
     FROM public.company_user_map cum
     LEFT JOIN public.users u
       ON u.id = cum.user_id
     WHERE cum.company_id = $1
       AND cum.responsibility_id IS NULL`,
    [companyId]
  );

  for (const row of mappingRows.rows) {
    const fallbackName = legacyRoleToResponsibilityName(row.role);
    const responsibilityId =
      Number(row.user_responsibility_id) || idByName.get(fallbackName) || null;
    if (!responsibilityId) continue;
    await client.query(
      `UPDATE public.company_user_map
       SET responsibility_id = $1
       WHERE id = $2`,
      [responsibilityId, Number(row.id)]
    );
  }
}

export async function getResponsibilitiesForCompany(client: PoolClient, companyId: number) {
  await ensureCompanyResponsibilities(client, companyId);
  const result = await client.query(
    `SELECT
       id,
       company_id,
       responsibility_name,
       dashboard_access,
       purchase_access,
       inventory_access,
       sales_access,
       sales_billing_access,
       reports_access,
       settings_access,
       ecommerce_access,
       is_system
     FROM public.user_responsibilities
     WHERE company_id = $1
     ORDER BY responsibility_name ASC`,
    [companyId]
  );
  return result.rows.map((row) => coerceResponsibilityRecord(row));
}

export async function getResponsibilityById(
  client: PoolClient,
  companyId: number,
  responsibilityId: number
) {
  await ensureCompanyResponsibilities(client, companyId);
  const result = await client.query(
    `SELECT
       id,
       company_id,
       responsibility_name,
       dashboard_access,
       purchase_access,
       inventory_access,
       sales_access,
       sales_billing_access,
       reports_access,
       settings_access,
       ecommerce_access,
       is_system
     FROM public.user_responsibilities
     WHERE company_id = $1 AND id = $2
     LIMIT 1`,
    [companyId, responsibilityId]
  );
  return result.rowCount ? coerceResponsibilityRecord(result.rows[0]) : null;
}
