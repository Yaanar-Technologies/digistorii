import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCustomerSchema, normalizeIndianPhone } from "@/lib/customerAuth";
import { getTenantSchemaByCompany } from "@/lib/tenant";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();
  try {
    const { company } = await params;
    const companySlug = (company || "").trim().toLowerCase();
    const body = await req.json().catch(() => ({}));
    const identifier = String(body?.identifier || body?.email || body?.phone || "").trim();

    if (!companySlug || !identifier) {
      return NextResponse.json(
        { success: false, message: "Email or Phone identifier is required" },
        { status: 400 }
      );
    }

    const { schema } = await getTenantSchemaByCompany(companySlug);
    await ensureCustomerSchema(client, schema);

    const isEmail = identifier.includes("@");
    const cleanPhone = !isEmail ? normalizeIndianPhone(identifier) : "";

    const custRes = await client.query(
      `SELECT id, email, phone, name, cust_name FROM "${schema}".customers
       WHERE ((email = $1 AND $1 <> '') OR (phone = $2 AND $2 <> '') OR (phone = $3 AND $3 <> ''))
         AND (is_deleted IS NOT TRUE)
       LIMIT 1`,
      [identifier, identifier, cleanPhone]
    );

    if (!custRes.rowCount) {
      // Return positive generic feedback to prevent user enumeration
      return NextResponse.json({
        success: true,
        message: "If an account exists with this credential, a password reset link has been dispatched.",
      });
    }

    const customer = custRes.rows[0];
    const resetToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

    await client.query(
      `UPDATE "${schema}".customers
       SET reset_password_token = $1, reset_password_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [resetToken, expiresAt, customer.id]
    );

    const resetLink = `/${companySlug}/account/reset-password?token=${resetToken}`;

    return NextResponse.json({
      success: true,
      message: "Password reset link generated successfully.",
      resetToken,
      resetLink,
    });
  } catch (err: any) {
    console.error("Forgot password error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to process password reset" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

