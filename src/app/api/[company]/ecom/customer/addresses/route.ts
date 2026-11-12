import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import {
  ensureCustomerSchema,
  normalizeIndianPhone,
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
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await ensureCustomerSchema(client, session.schema);
    const result = await client.query(
      `SELECT 
         id, customer_id, recipient_name, recipient_phone,
         address_line1, address_line2, city, state, pincode, country,
         is_default, COALESCE(address_type, 'Home') AS address_type, created_at
       FROM "${session.schema}".customer_addresses
       WHERE customer_id = $1
       ORDER BY is_default DESC, id DESC`,
      [session.customerId]
    );

    return NextResponse.json({ success: true, addresses: result.rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await ensureCustomerSchema(client, session.schema);
    const body = await req.json().catch(() => ({}));
    const recipientName = String(body?.recipient_name || body?.name || "").trim();
    const recipientPhone = String(body?.recipient_phone || body?.phone || "").trim();
    const addressLine1 = String(body?.address_line1 || "").trim();
    const addressLine2 = String(body?.address_line2 || "").trim();
    const city = String(body?.city || "").trim();
    const state = String(body?.state || "").trim();
    const pincode = String(body?.pincode || "").trim();
    const country = String(body?.country || "India").trim();
    const addressType = String(body?.address_type || "Home").trim();
    const isDefault = Boolean(body?.is_default);

    if (!recipientName || !recipientPhone || !addressLine1 || !city || !state || !pincode) {
      return NextResponse.json({ success: false, error: "All required address fields must be filled" }, { status: 400 });
    }

    if (!validateIndianPhone(recipientPhone)) {
      return NextResponse.json({ success: false, error: "Please enter a valid 10-digit phone number" }, { status: 400 });
    }

    if (!validateIndianPincode(pincode)) {
      return NextResponse.json({ success: false, error: "Please enter a valid 6-digit Indian PIN code" }, { status: 400 });
    }

    if (isDefault) {
      await client.query(
        `UPDATE "${session.schema}".customer_addresses SET is_default = FALSE WHERE customer_id = $1`,
        [session.customerId]
      );
    }

    const insertRes = await client.query(
      `INSERT INTO "${session.schema}".customer_addresses (
         customer_id, recipient_name, recipient_phone, address_line1, address_line2,
         city, state, pincode, country, is_default, address_type, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        session.customerId,
        recipientName,
        normalizeIndianPhone(recipientPhone),
        addressLine1,
        addressLine2 || null,
        city,
        state,
        pincode,
        country,
        isDefault,
        addressType,
      ]
    );

    return NextResponse.json({ success: true, address: insertRes.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
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
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await ensureCustomerSchema(client, session.schema);
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!id) return NextResponse.json({ success: false, error: "Address ID required" }, { status: 400 });

    const recipientName = String(body?.recipient_name || body?.name || "").trim();
    const recipientPhone = String(body?.recipient_phone || body?.phone || "").trim();
    const addressLine1 = String(body?.address_line1 || "").trim();
    const addressLine2 = String(body?.address_line2 || "").trim();
    const city = String(body?.city || "").trim();
    const state = String(body?.state || "").trim();
    const pincode = String(body?.pincode || "").trim();
    const addressType = String(body?.address_type || "Home").trim();
    const isDefault = Boolean(body?.is_default);

    if (isDefault) {
      await client.query(
        `UPDATE "${session.schema}".customer_addresses SET is_default = FALSE WHERE customer_id = $1`,
        [session.customerId]
      );
    }

    const updateRes = await client.query(
      `UPDATE "${session.schema}".customer_addresses
       SET recipient_name = $1, recipient_phone = $2, address_line1 = $3, address_line2 = $4,
           city = $5, state = $6, pincode = $7, address_type = $8, is_default = $9, updated_at = NOW()
       WHERE id = $10 AND customer_id = $11
       RETURNING *`,
      [
        recipientName,
        normalizeIndianPhone(recipientPhone),
        addressLine1,
        addressLine2 || null,
        city,
        state,
        pincode,
        addressType,
        isDefault,
        id,
        session.customerId,
      ]
    );

    return NextResponse.json({ success: true, address: updateRes.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ success: false, error: "Address ID required" }, { status: 400 });

    await client.query(
      `DELETE FROM "${session.schema}".customer_addresses WHERE id = $1 AND customer_id = $2`,
      [id, session.customerId]
    );

    return NextResponse.json({ success: true, message: "Address removed" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

