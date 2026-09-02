import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  ensureCustomerSchema,
  normalizeIndianPhone,
  validateIndianPhone,
  validateIndianPincode,
} from "@/lib/customerAuth";

function getSessionCustomer(req: NextRequest) {
  const cookieVal = req.cookies.get("customer_session")?.value;
  if (!cookieVal) return null;
  try {
    const session = JSON.parse(cookieVal);
    if (!session.customerId || !session.company) return null;
    return session;
  } catch (err) {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = getSessionCustomer(req);
  const searchCompany = req.nextUrl.searchParams.get("company") || session?.company;

  if (!session && !searchCompany) {
    return NextResponse.json({ success: false, message: "Unauthorized customer session" }, { status: 401 });
  }

  const customerId = session?.customerId;
  if (!customerId) {
    return NextResponse.json({ success: false, message: "Unauthorized customer session" }, { status: 401 });
  }

  const companySlug = (session?.company || searchCompany || "").trim().toLowerCase();
  const client = await pool.connect();
  try {
    const companyRes = await client.query(
      `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!companyRes.rowCount) {
      return NextResponse.json({ success: false, message: "Company not found" }, { status: 404 });
    }

    const { schema_name: schema } = companyRes.rows[0];
    await ensureCustomerSchema(client, schema);

    const result = await client.query(
      `SELECT 
         id, customer_id, recipient_name, recipient_phone,
         address_line1, address_line2, address_line3,
         city, state, pincode, country, is_default, created_at
       FROM "${schema}".customer_addresses
       WHERE customer_id = $1
       ORDER BY is_default DESC, id DESC`,
      [customerId]
    );

    return NextResponse.json({ success: true, addresses: result.rows });
  } catch (err: any) {
    console.error("Get Customer Addresses Error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to fetch addresses" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const session = getSessionCustomer(req);
  const body = await req.json().catch(() => ({}));
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  const client = await pool.connect();
  try {
    const companyRes = await client.query(
      `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!companyRes.rowCount) {
      return NextResponse.json({ success: false, message: "Company not found" }, { status: 404 });
    }

    const { schema_name: schema } = companyRes.rows[0];
    await ensureCustomerSchema(client, schema);

    let customerId = session?.customerId || Number(body?.customerId || 0);
    const recipientName = String(body?.recipient_name || body?.recipientName || body?.fullName || "").trim();
    const rawRecipientPhone = String(body?.recipient_phone || body?.recipientPhone || body?.phone || "").trim();
    const addressLine1 = String(body?.address_line1 || body?.addressLine1 || body?.addressLine || "").trim();
    const addressLine2 = String(body?.address_line2 || body?.addressLine2 || "").trim();
    const city = String(body?.city || "").trim();
    const state = String(body?.state || "").trim();
    const pincode = String(body?.pincode || body?.postalCode || "").trim();
    const country = String(body?.country || "India").trim();
    const isDefault = body?.is_default === true || body?.isDefault === true;

    if (!recipientName) {
      return NextResponse.json({ success: false, message: "Recipient name is required" }, { status: 400 });
    }

    if (!validateIndianPhone(rawRecipientPhone)) {
      return NextResponse.json(
        { success: false, message: "Recipient phone must be a valid 10-digit Indian phone number starting with 6-9" },
        { status: 400 }
      );
    }

    if (!addressLine1) {
      return NextResponse.json({ success: false, message: "Address line 1 is required" }, { status: 400 });
    }

    if (!city) {
      return NextResponse.json({ success: false, message: "City is required" }, { status: 400 });
    }

    if (!state) {
      return NextResponse.json({ success: false, message: "State is required" }, { status: 400 });
    }

    if (!validateIndianPincode(pincode)) {
      return NextResponse.json(
        { success: false, message: "Invalid PIN code. India standard 6-digit numeric PIN code is required (e.g. 560001)" },
        { status: 400 }
      );
    }

    // Ensure customer row exists if not authenticated
    if (!customerId || customerId <= 0) {
      const custRes = await client.query(
        `INSERT INTO "${schema}".customers (cust_code, cust_name, name, email, phone, channel)
         VALUES ($1, $2, $3, $4, $5, 'ecom')
         RETURNING id`,
        [
          `ECO-${Date.now().toString().slice(-6)}`,
          recipientName,
          recipientName,
          body?.email || null,
          normalizeIndianPhone(rawRecipientPhone),
        ]
      );
      customerId = custRes.rows[0].id;
    }

    await client.query("BEGIN");

    // If is_default = true, clear previous default flag for this customer
    if (isDefault) {
      await client.query(
        `UPDATE "${schema}".customer_addresses SET is_default = FALSE WHERE customer_id = $1`,
        [customerId]
      );
    }

    const insertRes = await client.query(
      `INSERT INTO "${schema}".customer_addresses (
         customer_id, recipient_name, recipient_phone, address_line1, address_line2, city, state, pincode, country, is_default
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, customer_id, recipient_name, recipient_phone, address_line1, address_line2, city, state, pincode, country, is_default`,
      [
        customerId,
        recipientName,
        normalizeIndianPhone(rawRecipientPhone),
        addressLine1,
        addressLine2,
        city,
        state,
        pincode,
        country || "India",
        isDefault,
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Address saved successfully",
      address: insertRes.rows[0],
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Save Customer Address Error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to save address" }, { status: 500 });
  } finally {
    client.release();
  }
}
