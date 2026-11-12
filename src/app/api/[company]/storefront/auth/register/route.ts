import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  ensureCustomerSchema,
  hashPassword,
  normalizeIndianPhone,
  validateEmail,
  validateIndianPhone,
} from "@/lib/customerAuth";
import {
  signSession,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_EXPIRY_SECONDS,
  getCookieOptions,
} from "@/lib/session";
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
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();
    const password = String(body?.password || "").trim();

    if (!companySlug) {
      return NextResponse.json({ success: false, message: "Company parameter is required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ success: false, message: "Full Name is required" }, { status: 400 });
    }

    if (!validateIndianPhone(phone)) {
      return NextResponse.json({ success: false, message: "Valid 10-digit Indian phone number is required" }, { status: 400 });
    }

    if (email && !validateEmail(email)) {
      return NextResponse.json({ success: false, message: "Valid email address is required" }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ success: false, message: "Password must be at least 6 characters" }, { status: 400 });
    }

    const { schema } = await getTenantSchemaByCompany(companySlug);
    await ensureCustomerSchema(client, schema);

    const cleanPhone = normalizeIndianPhone(phone);

    // Check if phone or email already registered
    const existing = await client.query(
      `SELECT id, channel, password_hash, is_deleted 
       FROM "${schema}".customers 
       WHERE (phone = $1 OR phone = $2) OR (email = $3 AND $3 <> '')
       LIMIT 1`,
      [phone, cleanPhone, email]
    );

    let customerId: number;
    const passwordHashed = hashPassword(password);

    if (existing.rowCount && existing.rowCount > 0) {
      const rec = existing.rows[0];
      // If customer exists from POS without password or was soft deleted, claim/update account
      if (!rec.password_hash || rec.is_deleted) {
        const updateRes = await client.query(
          `UPDATE "${schema}".customers
           SET cust_name = $1, name = $1, email = COALESCE($2, email),
               password_hash = $3, channel = 'both', is_verified = TRUE,
               is_deleted = FALSE, deleted_at = NULL, updated_at = NOW()
           WHERE id = $4
           RETURNING id`,
          [name, email || null, passwordHashed, rec.id]
        );
        customerId = updateRes.rows[0].id;
      } else {
        return NextResponse.json(
          { success: false, message: "An account with this phone or email already exists. Please sign in." },
          { status: 400 }
        );
      }
    } else {
      // Create new customer
      const custCode = `EC-${Date.now().toString().slice(-6)}`;
      const insertRes = await client.query(
        `INSERT INTO "${schema}".customers (
           cust_code, cust_name, name, email, phone, channel, password_hash, is_verified, created_at, updated_at
         )
         VALUES ($1, $2, $2, $3, $4, 'ecom', $5, TRUE, NOW(), NOW())
         RETURNING id`,
        [custCode, name, email || null, cleanPhone, passwordHashed]
      );
      customerId = insertRes.rows[0].id;
    }

    const sessionData = {
      customerId,
      channel: "ecom",
      email: email || "",
      phone: cleanPhone,
      name,
      company: companySlug,
    };

    const token = await signSession(sessionData, CUSTOMER_SESSION_EXPIRY_SECONDS, "customer");

    const response = NextResponse.json({
      success: true,
      message: "Registration successful",
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
    console.error("Storefront Register Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to register" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

