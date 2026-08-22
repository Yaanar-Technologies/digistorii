import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/hash";
import { createCompanySchema } from "@/lib/schema";
//import { ensureDB } from "@/lib/ensure-db";
import { ensureCompanyResponsibilities, getResponsibilitiesForCompany } from "@/lib/userResponsibilities";

type SetupPayload = {
  businessName?: string;
  company_name?: string;
  slug?: string;
  subdomain_url?: string;
  ownerName?: string;
  full_name?: string;
  ownerEmail?: string;
  email?: string;
  ownerPhone?: string;
  phone?: string;
  password?: string;
};

function normalizePayload(payload: SetupPayload) {
  const businessName = (payload.businessName || payload.company_name || "").trim();
  const slug = (payload.slug || payload.subdomain_url || "").trim().toLowerCase();
  const ownerName = (payload.ownerName || payload.full_name || "").trim();
  const ownerEmail = (payload.ownerEmail || payload.email || "").trim().toLowerCase();
  const ownerPhone = (payload.ownerPhone || payload.phone || "").trim();
  const password = payload.password || "";

  if (!businessName || !slug || !ownerName || !ownerEmail || !ownerPhone || !password) {
    throw new Error("Missing required fields");
  }

  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    throw new Error("Invalid slug format");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  return {
    businessName,
    slug,
    ownerName,
    ownerEmail,
    ownerPhone,
    password,
  };
}

export async function POST(req: Request) {
  //await ensureDB();
  const body = (await req.json()) as SetupPayload;
  const input = normalizePayload(body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingCompany = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [input.slug]
    );
    if (existingCompany.rowCount) {
      throw new Error("Company URL already taken");
    }

    const companyResult = await client.query(
      `INSERT INTO public.companies
       (company_name, subdomain_url, schema_name, setup_stage)
       VALUES ($1, $2, $3, 'ACCOUNT_CREATED')
       RETURNING id, subdomain_url`,
      [input.businessName, input.slug, `tenant_pending_${Date.now()}`]
    );

    const companyId = Number(companyResult.rows[0].id);
    const schemaName = `tenant_${companyId}`;

    await client.query(
      `UPDATE public.companies
       SET schema_name = $1, setup_stage = 'ACCOUNT_CREATED', updated_at = NOW()
       WHERE id = $2`,
      [schemaName, companyId]
    );

    await createCompanySchema(client, schemaName);
    await ensureCompanyResponsibilities(client, companyId);
    const responsibilities = await getResponsibilitiesForCompany(client, companyId);
    const adminResponsibility = responsibilities.find(
      (entry) => entry.responsibility_name === "Admin"
    );
    if (!adminResponsibility) {
      throw new Error("Default Admin responsibility could not be created");
    }

    const existingEmail = await client.query(
      `SELECT id FROM public.users WHERE company_id = $1 AND email = $2`,
      [companyId, input.ownerEmail]
    );
    if (existingEmail.rowCount) {
      throw new Error("Email already exists for this company");
    }

    const existingPhone = await client.query(
      `SELECT id FROM public.users WHERE company_id = $1 AND phone = $2`,
      [companyId, input.ownerPhone]
    );
    if (existingPhone.rowCount) {
      throw new Error("Phone number already exists for this company");
    }

    const passwordHash = await hashPassword(input.password);
    const userResult = await client.query(
      `INSERT INTO public.users
       (company_id, name, email, phone, password_hash, responsibility_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        companyId,
        input.ownerName,
        input.ownerEmail,
        input.ownerPhone,
        passwordHash,
        adminResponsibility.id,
      ]
    );

    const ownerUserId = Number(userResult.rows[0].id);
    const defaultUsername = input.ownerEmail.split("@")[0] || `owner${ownerUserId}`;

    await client.query(
      `INSERT INTO public.company_user_map
       (user_id, company_id, username, responsibility_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (user_id, company_id) DO UPDATE
       SET responsibility_id = EXCLUDED.responsibility_id, is_active = TRUE`,
      [ownerUserId, companyId, defaultUsername, adminResponsibility.id]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Company and Admin User created successfully",
      companyId,
      slug: input.slug,
      setup_stage: "ACCOUNT_CREATED",
      onboardingUrl: `/setup?company=${encodeURIComponent(input.slug)}`,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");

    // Check for PostgreSQL Unique Violation error code
    if (err.code === "23505") {
      let customMessage = "Duplicate entry detected";

      if (err.detail) {
        if (err.detail.includes("email")) {
          customMessage = "This email address is already registered.";
        } else if (err.detail.includes("phone")) {
          customMessage = "This phone number is already registered.";
        } else if (err.detail.includes("subdomain_url") || err.detail.includes("slug")) {
          customMessage = "This business URL/slug is already taken.";
        }
      } else if (err.message) {
        customMessage = err.message;
      }

      return NextResponse.json(
        { success: false, message: customMessage },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: err.message || "Something went wrong" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
