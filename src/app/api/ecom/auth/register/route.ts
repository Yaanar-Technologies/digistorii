import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  ensureCustomerSchema,
  hashPassword,
  normalizeIndianPhone,
  validateEmail,
  validateIndianPhone,
} from "@/lib/customerAuth";

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const body = await req.json();
    const companySlug = (body?.company || "").trim().toLowerCase();
    const custName = String(body?.cust_name || body?.name || "").trim();
    const rawPhone = String(body?.phone || "").trim();
    const rawEmail = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();

    if (!companySlug) {
      return NextResponse.json({ success: false, message: "Company parameter is required" }, { status: 400 });
    }

    if (!custName) {
      return NextResponse.json({ success: false, message: "Customer name is required" }, { status: 400 });
    }

    if (!validateIndianPhone(rawPhone)) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid 10-digit Indian phone number starting with 6-9" },
        { status: 400 }
      );
    }

    if (!validateEmail(rawEmail)) {
      return NextResponse.json({ success: false, message: "Please provide a valid email address" }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ success: false, message: "Password must be at least 6 characters long" }, { status: 400 });
    }

    const phone = normalizeIndianPhone(rawPhone);
    const email = rawEmail;

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

    // Account Reconciliation (POS vs E-Com)
    const existingCust = await client.query(
      `SELECT id, channel, password_hash, cust_name, email, phone 
       FROM "${schema}".customers 
       WHERE phone = $1 OR email = $2 
       LIMIT 1`,
      [phone, email]
    );

    let customerId: number;
    let finalChannel = "ecom";
    const passwordHash = hashPassword(password);

    if (existingCust.rowCount) {
      const record = existingCust.rows[0];

      // If registered via POS previously, upgrade to 'both'
      if (record.channel === "pos" || !record.password_hash) {
        finalChannel = "both";
        const updateRes = await client.query(
          `UPDATE "${schema}".customers
           SET channel = 'both',
               password_hash = $1,
               cust_name = COALESCE(NULLIF($2, ''), cust_name),
               name = COALESCE(NULLIF($2, ''), name),
               email = COALESCE(NULLIF($3, ''), email),
               phone = COALESCE(NULLIF($4, ''), phone),
               is_verified = TRUE,
               updated_at = NOW()
           WHERE id = $5
           RETURNING id, channel`,
          [passwordHash, custName, email, phone, record.id]
        );
        customerId = updateRes.rows[0].id;
        finalChannel = updateRes.rows[0].channel;
      } else {
        // Customer already exists with ecom/both access and password
        return NextResponse.json(
          { success: false, message: "An e-commerce account with this phone or email already exists. Please sign in." },
          { status: 400 }
        );
      }
    } else {
      // Create brand new e-commerce customer
      const custCode = `ECO-${Date.now().toString().slice(-6)}`;
      const insertRes = await client.query(
        `INSERT INTO "${schema}".customers (cust_code, cust_name, name, email, phone, channel, password_hash, is_verified)
         VALUES ($1, $2, $3, $4, $5, 'ecom', $6, TRUE)
         RETURNING id, channel`,
        [custCode, custName, custName, email, phone, passwordHash]
      );
      customerId = insertRes.rows[0].id;
      finalChannel = insertRes.rows[0].channel;
    }

    const sessionData = {
      customerId,
      channel: finalChannel,
      email,
      phone,
      name: custName,
      company: companySlug,
    };

    const response = NextResponse.json({
      success: true,
      message: "Customer account registered successfully",
      customer: sessionData,
    });

    response.cookies.set("customer_session", JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err: any) {
    console.error("E-com Registration Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to register customer" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
