import { createHash, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureCustomerSchema, normalizeIndianPhone, resolveCompanySlug } from "@/lib/customerAuth";

function hashOtp(otp: string) {
  return createHash("sha256").update(otp).digest("hex");
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const body = await req.json();
    const companySlug = await resolveCompanySlug(req, body);
    const identifier = String(body?.identifier || "").trim();

    if (!companySlug || !identifier) {
      return NextResponse.json(
        { success: false, message: "Company and Phone/Email identifier are required" },
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

    // Ensure schema is migrated
    await ensureCustomerSchema(client, schema);

    const isEmail = identifier.includes("@");
    const cleanPhone = !isEmail ? normalizeIndianPhone(identifier) : "";

    // Ensure customer row exists in ${schema}.customers
    let custRes = await client.query(
      `SELECT id, channel FROM "${schema}".customers WHERE (email = $1 AND $1 <> '') OR (phone = $1 AND $1 <> '') OR (phone = $2 AND $2 <> '') LIMIT 1`,
      [identifier, cleanPhone]
    );

    let customerId: number;
    if (!custRes.rowCount) {
      const insertCust = await client.query(
        `INSERT INTO "${schema}".customers (cust_code, cust_name, name, email, phone, channel)
         VALUES ($1, $2, $3, $4, $5, 'ecom')
         RETURNING id`,
        [
          `ECO-${Date.now().toString().slice(-6)}`,
          identifier.split("@")[0] || "Customer",
          identifier.split("@")[0] || "Customer",
          isEmail ? identifier : null,
          !isEmail ? (cleanPhone || identifier) : null,
        ]
      );
      customerId = insertCust.rows[0].id;
    } else {
      customerId = custRes.rows[0].id;
      if (custRes.rows[0].channel === "pos") {
        await client.query(
          `UPDATE "${schema}".customers SET channel = 'both' WHERE id = $1`,
          [customerId]
        );
      }
    }

    // Generate 6 digit OTP
    const otp = String(randomInt(100000, 1000000));
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    // Upsert into customer_ecom_auth
    await client.query(
      `INSERT INTO "${schema}".customer_ecom_auth (customer_id, phone, otp_hash, otp_expires_at, otp_attempts)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (customer_id)
       DO UPDATE SET
         phone = EXCLUDED.phone,
         otp_hash = EXCLUDED.otp_hash,
         otp_expires_at = EXCLUDED.otp_expires_at,
         otp_attempts = 0`,
      [customerId, identifier, otpHash, expiresAt]
    );

    return NextResponse.json({
      success: true,
      message: `OTP sent to ${identifier}`,
      sample_text: `Demo SMS: Your verification code for ${companySlug} storefront is ${otp}`,
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
