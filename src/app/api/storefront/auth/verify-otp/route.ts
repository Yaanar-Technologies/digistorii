import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const body = await req.json();
    const companySlug = (body?.company || "").trim().toLowerCase();
    const identifier = String(body?.identifier || "").trim();
    const otp = String(body?.otp || "").trim();

    if (!companySlug || !identifier || !otp) {
      return NextResponse.json(
        { success: false, message: "Company, identifier, and OTP are required" },
        { status: 400 }
      );
    }

    const companyRes = await client.query(
      `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!companyRes.rowCount) {
      return NextResponse.json({ success: false, message: "Merchant company not found" }, { status: 404 });
    }

    const { schema_name: schema } = companyRes.rows[0];

    const authRes = await client.query(
      `SELECT a.id, a.customer_id, a.otp_hash, a.otp_expires_at, a.otp_attempts, c.name, c.email, c.phone
       FROM "${schema}".customer_ecom_auth a
       JOIN "${schema}".customers c ON c.id = a.customer_id
       WHERE a.phone = $1 LIMIT 1`,
      [identifier]
    );

    if (!authRes.rowCount) {
      return NextResponse.json({ success: false, message: "No active verification request found" }, { status: 400 });
    }

    const record = authRes.rows[0];
    if (new Date(record.otp_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ success: false, message: "OTP has expired. Please request a new code." }, { status: 400 });
    }

    if (hashOtp(otp) !== record.otp_hash) {
      await client.query(
        `UPDATE "${schema}".customer_ecom_auth SET otp_attempts = otp_attempts + 1 WHERE id = $1`,
        [record.id]
      );
      return NextResponse.json({ success: false, message: "Invalid OTP verification code" }, { status: 400 });
    }

    // Success: mark verified & update last login
    await client.query(
      `UPDATE "${schema}".customer_ecom_auth
       SET is_verified = TRUE, last_login = NOW(), otp_attempts = 0
       WHERE id = $1`,
      [record.id]
    );

    const customerSessionData = {
      customerId: record.customer_id,
      identifier,
      name: record.name || identifier,
      company: companySlug,
    };

    const response = NextResponse.json({
      success: true,
      message: "Authentication successful",
      customer: customerSessionData,
    });

    response.cookies.set("customer_session", JSON.stringify(customerSessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

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
