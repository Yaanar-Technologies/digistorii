import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCustomerSchema, hashPassword } from "@/lib/customerAuth";
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
    const token = String(body?.token || "").trim();
    const newPassword = String(body?.password || body?.newPassword || "").trim();

    if (!companySlug || !token || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Token and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    const { schema } = await getTenantSchemaByCompany(companySlug);
    await ensureCustomerSchema(client, schema);

    const custRes = await client.query(
      `SELECT id FROM "${schema}".customers
       WHERE reset_password_token = $1 AND reset_password_expires_at > NOW() AND is_deleted IS NOT TRUE
       LIMIT 1`,
      [token]
    );

    if (!custRes.rowCount) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired password reset link. Please request a new one." },
        { status: 400 }
      );
    }

    const customerId = custRes.rows[0].id;
    const hashedPassword = hashPassword(newPassword);

    await client.query(
      `UPDATE "${schema}".customers
       SET password_hash = $1, reset_password_token = NULL, reset_password_expires_at = NULL, updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, customerId]
    );

    return NextResponse.json({
      success: true,
      message: "Password updated successfully. You can now sign in with your new password.",
    });
  } catch (err: any) {
    console.error("Reset password error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to reset password" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

