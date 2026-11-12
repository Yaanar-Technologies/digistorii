import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCustomerSchema, normalizeIndianPhone } from "@/lib/customerAuth";
import {
  signSession,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_EXPIRY_SECONDS,
  getCookieOptions,
} from "@/lib/session";
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
    const rawPhone = String(body?.phone || body?.identifier || "").trim();
    const otpCode = String(body?.otp || "").trim();
    const optionalName = String(body?.name || "").trim();

    if (!companySlug || !rawPhone || !otpCode) {
      return NextResponse.json(
        { success: false, message: "Phone number and OTP code are required" },
        { status: 400 }
      );
    }

    const { schema } = await getTenantSchemaByCompany(companySlug);
    await ensureCustomerSchema(client, schema);

    const cleanPhone = normalizeIndianPhone(rawPhone);
    const hashed = hashOtp(otpCode);

    // Verify OTP against database (or allow dev bypass '123456')
    const isDevDemo = process.env.NODE_ENV !== "production" && otpCode === "123456";

    if (!isDevDemo) {
      const otpRes = await client.query(
        `SELECT id, expires_at FROM "${schema}".customer_otps
         WHERE phone = $1 AND otp_hash = $2 AND expires_at > NOW()
         ORDER BY id DESC LIMIT 1`,
        [cleanPhone, hashed]
      );

      if (!otpRes.rowCount) {
        return NextResponse.json(
          { success: false, message: "Invalid or expired OTP code. Please request a new code." },
          { status: 400 }
        );
      }

      // Delete used OTP
      await client.query(`DELETE FROM "${schema}".customer_otps WHERE id = $1`, [otpRes.rows[0].id]);
    }

    // Check if customer exists
    let custRes = await client.query(
      `SELECT id, cust_name, name, email, phone, channel, is_deleted
       FROM "${schema}".customers
       WHERE phone = $1 OR phone = $2
       LIMIT 1`,
      [rawPhone, cleanPhone]
    );

    let customerRecord: any;

    if (custRes.rowCount && custRes.rowCount > 0) {
      customerRecord = custRes.rows[0];
      if (customerRecord.is_deleted) {
        await client.query(
          `UPDATE "${schema}".customers SET is_deleted = FALSE, deleted_at = NULL, is_verified = TRUE WHERE id = $1`,
          [customerRecord.id]
        );
      }
    } else {
      // Auto-register customer via OTP
      const customerName = optionalName || `User-${cleanPhone.slice(-4)}`;
      const custCode = `EC-${Date.now().toString().slice(-6)}`;
      const insertRes = await client.query(
        `INSERT INTO "${schema}".customers (
           cust_code, cust_name, name, phone, channel, is_verified, created_at, updated_at
         )
         VALUES ($1, $2, $2, $3, 'ecom', TRUE, NOW(), NOW())
         RETURNING id, cust_name, name, email, phone, channel`,
        [custCode, customerName, cleanPhone]
      );
      customerRecord = insertRes.rows[0];
    }

    const sessionData = {
      customerId: customerRecord.id,
      channel: customerRecord.channel || "ecom",
      email: customerRecord.email || "",
      phone: customerRecord.phone || cleanPhone,
      name: customerRecord.name || customerRecord.cust_name || "Customer",
      company: companySlug,
    };

    const token = await signSession(sessionData, CUSTOMER_SESSION_EXPIRY_SECONDS, "customer");

    const response = NextResponse.json({
      success: true,
      message: "Verified successfully",
      customer: sessionData,
    });

    response.cookies.set(
      CUSTOMER_COOKIE_NAME,
      token,
      getCookieOptions(CUSTOMER_SESSION_EXPIRY_SECONDS)
    );
    response.cookies.set(
      "storefront_customer_token",
      token,
      getCookieOptions(CUSTOMER_SESSION_EXPIRY_SECONDS)
    );

    return response;
  } catch (err: any) {
    console.error("Storefront Verify OTP Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to verify OTP" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

