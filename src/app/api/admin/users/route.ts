import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/hash";
import { getTenantSchema } from "@/lib/tenant";
import {
  ensureCompanyResponsibilities,
  getResponsibilitiesForCompany,
} from "@/lib/userResponsibilities";

type ApiError = {
  status: number;
  message: string;
  field?: string;
  index?: number;
};

function parsePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asApiError(error: unknown): ApiError | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as Partial<ApiError>;
  if (!candidate.status || !candidate.message) return null;
  return {
    status: candidate.status,
    message: candidate.message,
    field: candidate.field,
    index: candidate.index,
  };
}

async function getCompanyUserLimit(client: any, companySlug: string): Promise<number> {
  const result = await client.query(
    `SELECT
       COALESCE(
         cs.max_users,
         (
           SELECT pf.value_int
           FROM public.plan_features pf
           WHERE pf.plan_id = cs.plan_id
             AND pf.feature_key = 'max_users'
           LIMIT 1
         ),
         1
       ) AS max_users
     FROM public.companies c
     LEFT JOIN public.company_subscriptions cs
       ON cs.company_id = c.id
     WHERE c.subdomain_url = $1
     ORDER BY cs.updated_at DESC NULLS LAST, cs.id DESC NULLS LAST
     LIMIT 1`,
    [companySlug]
  );
  return Number(result.rows[0]?.max_users ?? 1);
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    const existingCompany = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );
    if (!existingCompany.rowCount) {
      return NextResponse.json(
        { success: false, message: "Company not found" },
        { status: 404 }
      );
    }
    const companyId = Number(existingCompany.rows[0].id);
    await ensureCompanyResponsibilities(client, companyId);

    const result = await client.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.is_active,
         u.created_at,
         COALESCE(cum.responsibility_id, u.responsibility_id) AS responsibility_id,
         r.responsibility_name as role,
         cum.location_id,
         cum.warehouse_id,
         l.name AS location_name,
         w.name AS warehouse_name
       FROM public.users u
       LEFT JOIN public.company_user_map cum
         ON cum.user_id = u.id
        AND cum.company_id = u.company_id
       LEFT JOIN public.user_responsibilities r
         ON r.id = COALESCE(cum.responsibility_id, u.responsibility_id)
       LEFT JOIN "${schema}".locations l
         ON l.id = cum.location_id
       LEFT JOIN "${schema}".warehouses w
         ON w.id = cum.warehouse_id
       WHERE u.company_id = $1
       ORDER BY u.id DESC`,
      [companyId]
    );

    const maxUsers = await getCompanyUserLimit(client, company);
    const currentCount = Number(result.rowCount || 0);

    return NextResponse.json({
      success: true,
      users: result.rows,
      maxUsers,
      currentCount,
    });
  } catch (error) {
    console.error("GET USERS ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const { company, schema } = await getTenantSchema(req);
  const body = await req.json();
  const users = Array.isArray(body?.users) ? body.users : [];

  if (!users.length) {
    return NextResponse.json(
      { success: false, message: "At least one user is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    // 1. CHECK LIMITS BEFORE STARTING THE TRANSACTION
    const maxUsers = await getCompanyUserLimit(client, company);
    const userCountResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM public.users WHERE company_id = (
         SELECT id FROM public.companies WHERE subdomain_url = $1
       )`,
      [company]
    );
    const currentCount = Number(userCountResult.rows[0]?.count || 0);

    // Check if adding the incoming users will exceed the limit
    if (currentCount + users.length > maxUsers) {
      return NextResponse.json(
        {
          success: false,
          // Changed 'error' to 'message' to match your API standard
          message: `Cannot create more than ${maxUsers} users for subscription plan. You currently have ${currentCount}.`,
        },
        { status: 400 }
      );
    }

    // 2. START TRANSACTION ONLY AFTER CHECKS PASS
    await client.query("BEGIN");

    const existingCompany = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );
    if (!existingCompany.rowCount) {
      throw { status: 404, message: "Company not found" } as ApiError;
    }
    const companyId = Number(existingCompany.rows[0].id);
    await ensureCompanyResponsibilities(client, companyId);
    const responsibilities = await getResponsibilitiesForCompany(client, companyId);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const responsibilityId = parsePositiveInt(user?.responsibility_id);
      const locationId = parsePositiveInt(user?.location_id);
      const warehouseId = parsePositiveInt(user?.warehouse_id);

      if (!responsibilityId || !responsibilities.some((entry) => entry.id === responsibilityId)) {
        throw {
          status: 400,
          field: "responsibility_id",
          index: i,
          message: "Invalid responsibility selected",
        } as ApiError;
      }
      if (!locationId) {
        throw {
          status: 400,
          field: "location_id",
          index: i,
          message: "Location is required",
        } as ApiError;
      }
      if (!warehouseId) {
        throw {
          status: 400,
          field: "warehouse_id",
          index: i,
          message: "Warehouse is required",
        } as ApiError;
      }

      const locationExists = await client.query(
        `SELECT id FROM "${schema}".locations WHERE id = $1`,
        [locationId]
      );
      if (!locationExists.rowCount) {
        throw {
          status: 400,
          field: "location_id",
          index: i,
          message: "Selected location not found",
        } as ApiError;
      }

      const warehouseExists = await client.query(
        `SELECT id FROM "${schema}".warehouses WHERE id = $1 AND location_id = $2`,
        [warehouseId, locationId]
      );
      if (!warehouseExists.rowCount) {
        throw {
          status: 400,
          field: "warehouse_id",
          index: i,
          message: "Selected warehouse does not belong to selected location",
        } as ApiError;
      }

      const email = String(user?.email || "").trim().toLowerCase();
      const phone = String(user?.phone || "").trim();
      const username = String(user?.username || "").trim();

      const existingEmail = await client.query(
        `SELECT id FROM public.users WHERE company_id = $1 AND email = $2`,
        [companyId, email]
      );
      if (existingEmail.rowCount) {
        throw {
          status: 409,
          field: "email",
          index: i,
          message: "Email already exists for this company",
        } as ApiError;
      }

      const existingPhone = await client.query(
        `SELECT id FROM public.users WHERE phone = $1`,
        [phone]
      );
      if (existingPhone.rowCount) {
        throw {
          status: 409,
          field: "phone",
          index: i,
          message: "Phone number already exists for this company",
        } as ApiError;
      }

      const existingUsername = await client.query(
        `SELECT id FROM public.users WHERE company_id = $1 AND username = $2`,
        [companyId, username]
      );
      if (existingUsername.rowCount) {
        throw {
          status: 409,
          field: "username",
          index: i,
          message: "Username already exists for this company",
        } as ApiError;
      }

      const hashed = await hashPassword(String(user?.password || ""));
      const userInsert = await client.query(
        `INSERT INTO public.users (company_id, name, username, email, phone, password_hash, is_active, responsibility_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          companyId,
          String(user?.full_name || "").trim(),
          username,
          email,
          phone,
          hashed,
          Boolean(user?.status),
          responsibilityId,
        ]
      );

      const newUserId = Number(userInsert.rows[0]?.id);
      await client.query(
        `INSERT INTO public.company_user_map
         (user_id, company_id, username, responsibility_id, location_id, warehouse_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (user_id, company_id) DO UPDATE
         SET username = EXCLUDED.username,
             responsibility_id = EXCLUDED.responsibility_id,
             location_id = EXCLUDED.location_id,
             warehouse_id = EXCLUDED.warehouse_id,
             is_active = TRUE`,
        [newUserId, companyId, username, responsibilityId, locationId, warehouseId]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      message: "Users created successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    const knownError = asApiError(error);
    if (knownError) {
      return NextResponse.json(
        {
          success: false,
          message: knownError.message,
          field: knownError.field,
          index: knownError.index,
        },
        { status: knownError.status }
      );
    }
    console.error("POST USERS ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
