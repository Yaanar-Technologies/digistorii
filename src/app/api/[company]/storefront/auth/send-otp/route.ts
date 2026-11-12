import { createHash, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCustomerSchema, normalizeIndianPhone, validateIndianPhone } from "@/lib/customerAuth";
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

    if (!companySlug || !rawPhone) {
      return NextResponse.json(
        { success: false, message: "Company and Phone number are required" },
        { status: 400 }
      );
    }

    if (!validateIndianPhone(rawPhone)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid 10-digit Indian mobile number" },
        { status: 400 }
      );
    }

    const { schema } = await getTenantSchemaByCompany(companySlug);
    await ensureCustomerSchema(client, schema);

    const cleanPhone = normalizeIndianPhone(rawPhone);

    // Rate limiting: check recent OTPs in the last 60 seconds
    const recentOtps = await client.query(
      `SELECT id FROM "${schema}".customer_otps
       WHERE phone = $1 AND created_at > NOW() - INTERVAL '60 seconds'`,
      [cleanPhone]
    );

    if (recentOtps.rowCount && recentOtps.rowCount >= 2) {
      return NextResponse.json(
        { success: false, message: "Please wait 60 seconds before requesting another OTP." },
        { status: 429 }
      );
    }

    // Generate 6 digit OTP (In production send via SMS, in development provide demo code)
    const otpCode = process.env.NODE_ENV === "production" ? String(randomInt(100000, 999999)) : "123456";
    const hashed = hashOtp(otpCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await client.query(
      `INSERT INTO "${schema}".customer_otps (phone, otp_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [cleanPhone, hashed, expiresAt]
    );

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully to your mobile number",
      // Include demo OTP in development / sandbox mode for testing convenience
      demoOtp: process.env.NODE_ENV !== "production" ? otpCode : undefined,
    });
  } catch (err: any) {
    console.error("Storefront Send OTP Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to send OTP" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

