import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  ensureCustomerSchema,
  normalizeIndianPhone,
  resolveCompanySlug,
  verifyPassword,
} from "@/lib/customerAuth";
import {
  signSession,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_EXPIRY_SECONDS,
  getCookieOptions,
} from "@/lib/session";

export async function POST(
  req: NextRequest) {
  const client = await pool.connect();
  try {
    const body = await req.json();
    const companySlug = await resolveCompanySlug(req, body);
    const identifier = String(body?.identifier || body?.email || body?.phone || "").trim();
    const password = String(body?.password || "").trim();

    if (!companySlug) {
      return NextResponse.json({ success: false, message: "Company parameter is required" }, { status: 400 });
    }

    if (!identifier || !password) {
      return NextResponse.json({ success: false, message: "Phone/Email and Password are required" }, { status: 400 });
    }

    const companyRes = await client.query(
      `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!companyRes.rowCount) {
      return NextResponse.json({ success: false, message: "Merchant company not found" }, { status: 404 });
    }

    const { schema_name: schema } = companyRes.rows[0];

    // Ensure customer schema is migrated
    await ensureCustomerSchema(client, schema);

    const isEmail = identifier.includes("@");
    const cleanPhone = !isEmail ? normalizeIndianPhone(identifier) : "";

    const custRes = await client.query(
      `SELECT id, cust_name, name, email, phone, channel, password_hash 
       FROM "${schema}".customers 
       WHERE (email = $1 AND $1 <> '') OR (phone = $2 AND $2 <> '') OR (phone = $3 AND $3 <> '')
       LIMIT 1`,
      [identifier, identifier, cleanPhone]
    );

    if (!custRes.rowCount) {
      return NextResponse.json({ success: false, message: "No customer account found with these credentials" }, { status: 400 });
    }

    const record = custRes.rows[0];

    if (record.channel === "pos" && !record.password_hash) {
      return NextResponse.json(
        { success: false, message: "Your phone number is registered via POS. Please click 'Create Account' or use OTP to set up online access." },
        { status: 400 }
      );
    }

    if (!record.password_hash || !verifyPassword(password, record.password_hash)) {
      return NextResponse.json({ success: false, message: "Invalid email/phone or password" }, { status: 400 });
    }

    const sessionData = {
      customerId: record.id,
      channel: record.channel || "ecom",
      email: record.email || "",
      phone: record.phone || "",
      name: record.name || record.cust_name || "Customer",
      company: companySlug,
    };

    const token = await signSession(sessionData, CUSTOMER_SESSION_EXPIRY_SECONDS, "customer");

    const response = NextResponse.json({
      success: true,
      message: "Sign in successful",
      customer: sessionData,
    });

    response.cookies.set(
      CUSTOMER_COOKIE_NAME,
      token,
      getCookieOptions(CUSTOMER_SESSION_EXPIRY_SECONDS)
    );

    return response;
  } catch (err: any) {
    console.error("E-com Login Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to sign in" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
