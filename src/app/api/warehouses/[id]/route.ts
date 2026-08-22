import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

const schemaValidator = /^[a-z][a-z0-9_]{0,62}$/;
const typeValues = ["global", "local"] as const;

const warehouseSchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  name: z.string().trim().min(1, "Name is required"),
  location_id: z.union([z.number(), z.string()]),
  type: z.enum(typeValues),
  same_as_ship_to: z.boolean().default(true),
  address_line_1: z.string().optional().nullable(),
  address_line_2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  landline: z.string().optional().nullable(),
  mobile_no: z.string().optional().nullable(),
  fax: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  contact_person_name: z.string().optional().nullable(),
  contact_person_mobile: z.string().optional().nullable(),
  contact_person_email: z.string().optional().nullable()
});

type WarehouseInput = z.infer<typeof warehouseSchema>;

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function asNull(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function validateEmail(value?: string | null) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseLocationId(value: string | number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizePayload(data: WarehouseInput) {
  const email = asNull(data.email);
  const contactEmail = asNull(data.contact_person_email);
  if (email && !validateEmail(email)) {
    throw new Error("Invalid email");
  }
  if (contactEmail && !validateEmail(contactEmail)) {
    throw new Error("Invalid contact person email");
  }

  return {
    code: data.code.trim(),
    name: data.name.trim(),
    location_id: parseLocationId(data.location_id),
    type: data.type,
    same_as_ship_to: data.same_as_ship_to,
    address_line_1: asNull(data.address_line_1),
    address_line_2: asNull(data.address_line_2),
    city: asNull(data.city),
    state: asNull(data.state),
    country: asNull(data.country) || 'India',
    pincode: asNull(data.pincode),
    effective_from: asNull(data.effective_from),
    effective_to: asNull(data.effective_to),
    description: asNull(data.description),
    landline: asNull(data.landline),
    mobile_no: asNull(data.mobile_no),
    fax: asNull(data.fax),
    email,
    contact_person_name: asNull(data.contact_person_name),
    contact_person_mobile: asNull(data.contact_person_mobile),
    contact_person_email: contactEmail,
  };
}

async function ensureLocation(client: any, schema: string, locationId: number) {
  const result = await client.query(
    `SELECT id FROM "${schema}".locations WHERE id = $1`,
    [locationId]
  );
  return result.rowCount ? true : false;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const { id } = await context.params;
    const recordId = parseId(id);

    if (!schema || !schemaValidator.test(schema)) {
      return NextResponse.json({ success: false, error: "Invalid schema" }, { status: 400 });
    }
    if (!recordId) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const result = await client.query(
      `SELECT
        w.id, w.code, w.name, w.location_id, w.type, w.effective_from, w.effective_to,
        w.same_as_ship_to, w.address_line_1, w.address_line_2, w.city, w.state, w.country, w.pincode,
        w.description, w.landline, w.mobile_no, w.fax, w.email,
        w.contact_person_name, w.contact_person_mobile, w.contact_person_email,
       w.created_at, w.updated_at,
        l.name AS location_name
       FROM "${schema}".warehouses w
       LEFT JOIN "${schema}".locations l ON l.id = w.location_id
       WHERE w.id = $1`,
      [recordId]
    );
    if (!result.rowCount) {
      return NextResponse.json({ success: false, error: "Warehouse not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Fetch failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const { id } = await context.params;
    const recordId = parseId(id);

    if (!schema || !schemaValidator.test(schema)) {
      return NextResponse.json({ success: false, error: "Invalid schema" }, { status: 400 });
    }
    if (!recordId) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = warehouseSchema.parse(body);
    const payload = normalizePayload(parsed);

    if (!payload.location_id) {
      return NextResponse.json({ success: false, error: "Location is required" }, { status: 400 });
    }

    const locationExists = await ensureLocation(client, schema, payload.location_id);
    if (!locationExists) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 400 });
    }

    const duplicate = await client.query(
      `SELECT id FROM "${schema}".warehouses
       WHERE lower(code) = lower($1) AND id <> $2
       LIMIT 1`,
      [payload.code, recordId]
    );
    if (duplicate.rowCount) {
      return NextResponse.json({ success: false, error: "Warehouse code already exists" }, { status: 409 });
    }

    const result = await client.query(
      `UPDATE "${schema}".warehouses
       SET
        code = $1,
        name = $2,
        location_id = $3,
        type = $4,
        same_as_ship_to = $5,
        address_line_1 = $6,
        address_line_2 = $7,
        city = $8,
        state = $9,
        country = $10,
        pincode = $11,
        effective_from = $12,
        effective_to = $13,
        description = $14,
        landline = $15,
        mobile_no = $16,
        fax = $17,
        email = $18,
        contact_person_name = $19,
        contact_person_mobile = $20,
        contact_person_email = $21,
        updated_at = NOW()
       WHERE id = $22
       RETURNING id, code, name, location_id, type, 
        same_as_ship_to, address_line_1, address_line_2, city, state, country, pincode,
        effective_from, effective_to,
        description, landline, mobile_no, fax, email,
        contact_person_name, contact_person_mobile, contact_person_email,
         created_at, updated_at`,
      [
        payload.code,
        payload.name,
        payload.location_id,
        payload.type,
        payload.same_as_ship_to,
        payload.address_line_1,
        payload.address_line_2,
        payload.city,
        payload.state,
        payload.country,
        payload.pincode,
        payload.effective_from,
        payload.effective_to,
        payload.description,
        payload.landline,
        payload.mobile_no,
        payload.fax,
        payload.email,
        payload.contact_person_name,
        payload.contact_person_mobile,
        payload.contact_person_email,
        recordId,
      ]
    );
    if (!result.rowCount) {
      return NextResponse.json({ success: false, error: "Warehouse not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ success: false, error: error.errors[0]?.message || "Validation failed" }, { status: 400 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ success: false, error: "Warehouse code already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message || "Update failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const { id } = await context.params;
    const recordId = parseId(id);

    if (!schema || !schemaValidator.test(schema)) {
      return NextResponse.json({ success: false, error: "Invalid schema" }, { status: 400 });
    }
    if (!recordId) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const result = await client.query(
      `DELETE FROM "${schema}".warehouses WHERE id = $1 RETURNING id`,
      [recordId]
    );
    if (!result.rowCount) {
      return NextResponse.json({ success: false, error: "Warehouse not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Delete failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
