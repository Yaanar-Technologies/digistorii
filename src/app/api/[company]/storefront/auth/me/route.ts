import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import {
  ensureCustomerSchema,
  normalizeIndianPhone,
  validateEmail,
  validateIndianPhone,
  validateIndianPincode,
} from "@/lib/customerAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);

  if (!session) {
    return NextResponse.json({ authenticated: false, customer: null });
  }

  const client = await pool.connect();
  try {
    await ensureCustomerSchema(client, session.schema);

    const custRes = await client.query(
      `SELECT id, cust_code, cust_name, name, email, phone, channel, is_verified,
              notification_preferences, created_at
       FROM "${session.schema}".customers
       WHERE id = $1 AND is_deleted IS NOT TRUE
       LIMIT 1`,
      [session.customerId]
    );

    if (!custRes.rowCount) {
      return NextResponse.json({ authenticated: false, customer: null });
    }

    const customer = custRes.rows[0];

    // Fetch default addresses
    const addrRes = await client.query(
      `SELECT id, recipient_name, recipient_phone, address_line1, address_line2,
              city, state, pincode, country, is_default, address_type
       FROM "${session.schema}".customer_addresses
       WHERE customer_id = $1
       ORDER BY is_default DESC, id DESC`,
      [session.customerId]
    );

    return NextResponse.json({
      authenticated: true,
      customer: {
        id: customer.id,
        cust_code: customer.cust_code,
        name: customer.name || customer.cust_name || "Customer",
        email: customer.email || "",
        phone: customer.phone || "",
        channel: customer.channel,
        is_verified: customer.is_verified,
        notification_preferences: customer.notification_preferences || { whatsapp: true, sms: true, email: true },
        created_at: customer.created_at,
        addresses: addrRes.rows,
      },
    });
  } catch (err: any) {
    console.error("Storefront Me Error:", err);
    return NextResponse.json({ authenticated: false, customer: null });
  } finally {
    client.release();
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);

  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await ensureCustomerSchema(client, session.schema);
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name || body?.cust_name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();

    // Address fields
    const addressLine1 = String(body?.address_line1 || "").trim();
    const addressLine2 = String(body?.address_line2 || "").trim();
    const city = String(body?.city || "").trim();
    const state = String(body?.state || "").trim();
    const pincode = String(body?.pincode || "").trim();
    const country = String(body?.country || "India").trim();

    if (!name) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }

    if (email && !validateEmail(email)) {
      return NextResponse.json({ success: false, error: "Invalid email address format" }, { status: 400 });
    }

    if (phone && !validateIndianPhone(phone)) {
      return NextResponse.json({ success: false, error: "Invalid 10-digit Indian phone number" }, { status: 400 });
    }

    const cleanPhone = phone ? normalizeIndianPhone(phone) : null;

    // Check email uniqueness if modified
    if (email) {
      const emailCheck = await client.query(
        `SELECT id FROM "${session.schema}".customers WHERE LOWER(email) = $1 AND id <> $2 AND is_deleted IS NOT TRUE LIMIT 1`,
        [email, session.customerId]
      );
      if (emailCheck.rowCount) {
        return NextResponse.json({ success: false, error: "This email address is already in use by another customer" }, { status: 400 });
      }
    }

    // Check phone uniqueness if modified
    if (cleanPhone) {
      const phoneCheck = await client.query(
        `SELECT id FROM "${session.schema}".customers WHERE phone = $1 AND id <> $2 AND is_deleted IS NOT TRUE LIMIT 1`,
        [cleanPhone, session.customerId]
      );
      if (phoneCheck.rowCount) {
        return NextResponse.json({ success: false, error: "This phone number is already registered to another customer" }, { status: 400 });
      }
    }

    await client.query("BEGIN");

    // 1. Update customer record
    await client.query(
      `UPDATE "${session.schema}".customers
       SET name = $1, cust_name = $1, email = COALESCE($2, email), phone = COALESCE($3, phone), updated_at = NOW()
       WHERE id = $4`,
      [name, email || null, cleanPhone, session.customerId]
    );

    // 2. Update or insert primary shipping address if provided
    if (addressLine1 && city && state && pincode) {
      if (!validateIndianPincode(pincode)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ success: false, error: "Please enter a valid 6-digit Indian PIN code" }, { status: 400 });
      }

      // Check if user already has an address
      const existingAddr = await client.query(
        `SELECT id FROM "${session.schema}".customer_addresses
         WHERE customer_id = $1
         ORDER BY is_default DESC, id DESC
         LIMIT 1`,
        [session.customerId]
      );

      if (existingAddr.rowCount) {
        const addrId = existingAddr.rows[0].id;
        await client.query(
          `UPDATE "${session.schema}".customer_addresses
           SET recipient_name = $1, recipient_phone = $2, address_line1 = $3, address_line2 = $4,
               city = $5, state = $6, pincode = $7, country = $8, is_default = TRUE, updated_at = NOW()
           WHERE id = $9`,
          [
            name,
            cleanPhone || "",
            addressLine1,
            addressLine2 || null,
            city,
            state,
            pincode,
            country,
            addrId,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO "${session.schema}".customer_addresses (
             customer_id, recipient_name, recipient_phone, address_line1, address_line2,
             city, state, pincode, country, is_default, address_type, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, 'Home', NOW(), NOW())`,
          [
            session.customerId,
            name,
            cleanPhone || "",
            addressLine1,
            addressLine2 || null,
            city,
            state,
            pincode,
            country,
          ]
        );
      }
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Profile and shipping address saved successfully",
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("PUT storefront me error:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to update profile" }, { status: 500 });
  } finally {
    client.release();
  }
}
