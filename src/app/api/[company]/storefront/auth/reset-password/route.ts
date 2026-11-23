import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCustomerSchema, hashPassword } from "@/lib/customerAuth";
import { getTenantSchemaByCompany } from "@/lib/tenant";

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();
  try {
    const { company } = await params;
    const companySlug = (company || "").trim().toLowerCase();
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || body?.identifier || "").trim().toLowerCase();
    const otpCode = String(body?.otp || body?.token || "").trim();
    const newPassword = String(body?.password || body?.newPassword || "").trim();

    if (!companySlug || !email || !otpCode || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Email, OTP verification code, and new password are required" },
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

    const hashed = hashOtp(otpCode);

    // Verify OTP against customer_otps table
    const otpRes = await client.query(
      `SELECT id FROM "${schema}".customer_otps
       WHERE email = $1 AND otp_hash = $2 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [email, hashed]
    );

    // Or check against customers reset_password_token for backwards compatibility
    const custRes = await client.query(
      `SELECT id FROM "${schema}".customers
       WHERE LOWER(email) = $1 AND is_deleted IS NOT TRUE
         AND (
           reset_password_token = $2 AND reset_password_expires_at > NOW()
           OR reset_password_token = $3 AND reset_password_expires_at > NOW()
         )
       LIMIT 1`,
      [email, hashed, otpCode]
    );

    if (!otpRes.rowCount && !custRes.rowCount) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired verification code. Please request a new code." },
        { status: 400 }
      );
    }

    // Find customer ID
    let customerId: number;
    if (custRes.rowCount) {
      customerId = custRes.rows[0].id;
    } else {
      const cRes = await client.query(
        `SELECT id FROM "${schema}".customers WHERE LOWER(email) = $1 AND is_deleted IS NOT TRUE LIMIT 1`,
        [email]
      );
      if (!cRes.rowCount) {
        return NextResponse.json(
          { success: false, message: "Customer account not found" },
          { status: 404 }
        );
      }
      customerId = cRes.rows[0].id;
    }

    const hashedPassword = hashPassword(newPassword);

    await client.query(
      `UPDATE "${schema}".customers
       SET password_hash = $1, reset_password_token = NULL, reset_password_expires_at = NULL, is_verified = TRUE, updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, customerId]
    );

    // Clean up used OTPs
    await client.query(
      `DELETE FROM "${schema}".customer_otps WHERE email = $1`,
      [email]
    );

    return NextResponse.json({
      success: true,
      message: "Password updated successfully! You can now sign in with your new password.",
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
