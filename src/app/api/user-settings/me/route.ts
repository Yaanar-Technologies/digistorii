import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import { verifySession, STAFF_COOKIE_NAME, StaffSessionPayload } from "@/lib/session";

const schemaValidator = /^[a-z][a-z0-9_]{0,62}$/;

async function getUserIdFromCookie(req: NextRequest): Promise<{ userId: number | null; session: StaffSessionPayload | null }> {
  const userCookie = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  if (!userCookie) return { userId: null, session: null };

  const parsed = await verifySession<StaffSessionPayload>(userCookie, "staff");
  if (!parsed) return { userId: null, session: null };

  const maybeUserId = Number(parsed?.user_id ?? parsed?.id);
  if (!Number.isInteger(maybeUserId) || maybeUserId <= 0) return { userId: null, session: null };
  return { userId: maybeUserId, session: parsed };
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { userId, session } = await getUserIdFromCookie(req);
    if (!userId || !session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { company, schema } = await getTenantSchema(req);

    if (session.company_name && session.company_name.trim().toLowerCase() !== company.trim().toLowerCase()) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Company mismatch" },
        { status: 403 }
      );
    }
    if (!schema || !schemaValidator.test(schema)) {
      return NextResponse.json(
        { success: false, error: "Invalid schema" },
        { status: 400 }
      );
    }

    const companyRes = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );
    const companyId = companyRes.rows[0]?.id;
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
    }

    const userRes = await client.query(
      `SELECT id FROM public.users WHERE id = $1 AND company_id = $2 AND is_active = TRUE`,
      [userId, companyId]
    );
    if (!userRes.rowCount) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const settingsRes = await client.query(
      `
        SELECT
          default_warehouse_id,
          default_locator_id,
          branch_name,
          user_id
        FROM "${schema}".user_settings
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    const row = settingsRes.rows[0] || {};
    console.log("user-settings GET - fetched settings:", row);
    return NextResponse.json({
      success: true,
      data: {
        default_warehouse_id: row.default_warehouse_id ?? null,
        default_locator_id: row.default_locator_id ?? null,
        branch_name: row.branch_name ?? null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch user settings" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
