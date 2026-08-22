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
  contact_person_email: z.string().optional().nullable(),

});

type WarehouseInput = z.infer<typeof warehouseSchema>;

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

async function getCompanyWarehouseLimit(client: any, companySlug: string): Promise<number> {
  const result = await client.query(
    `SELECT
       COALESCE(
         cs.max_warehouses,
         (
           SELECT pf.value_int
           FROM public.plan_features pf
           WHERE pf.plan_id = cs.plan_id
             AND pf.feature_key = 'max_warehouses'
           LIMIT 1
         ),
         1
       ) AS max_warehouses
     FROM public.companies c
     LEFT JOIN public.company_subscriptions cs
       ON cs.company_id = c.id
     WHERE c.subdomain_url = $1
     ORDER BY cs.updated_at DESC NULLS LAST, cs.id DESC NULLS LAST
     LIMIT 1`,
    [companySlug]
  );
  return Number(result.rows[0]?.max_warehouses ?? 1);
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    if (!schema || !schemaValidator.test(schema)) {
      return NextResponse.json({ success: false, error: "Invalid schema" }, { status: 400 });
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
       LEFT JOIN "${schema}".locations l ON w.location_id = l.id
       ORDER BY w.id DESC`
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Fetch failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, company } = await getTenantSchema(req);
    if (!schema || !schemaValidator.test(schema)) {
      return NextResponse.json({ success: false, error: "Invalid schema" }, { status: 400 });
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
      `SELECT id FROM "${schema}".warehouses WHERE lower(code) = lower($1) LIMIT 1`,
      [payload.code]
    );
    if (duplicate.rowCount) {
      return NextResponse.json({ success: false, error: "Warehouse code already exists" }, { status: 409 });
    }

    const maxWarehouses = await getCompanyWarehouseLimit(client, company);
    const warehouseCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${schema}".warehouses`
    );
    const currentCount = Number(warehouseCount.rows[0]?.count || 0);
    if (currentCount >= maxWarehouses) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot create more than ${maxWarehouses} warehouses for subscription plan`,
        },
        { status: 400 }
      );
    }

    const result = await client.query(
      `INSERT INTO "${schema}".warehouses
       (
        code, name, location_id, type, 
        same_as_ship_to, address_line_1, address_line_2, city, state, country, pincode,
        effective_from, effective_to, description,
        landline, mobile_no, fax, email,
        contact_person_name, contact_person_mobile, contact_person_email,
         created_at, updated_at
       )
       VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,
        $15,$16,$17,$18,
        $19,$20,$21,
       NOW(),NOW()
       )
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
      ]
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ success: false, error: error.errors[0]?.message || "Validation failed" }, { status: 400 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ success: false, error: "Warehouse code already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message || "Insert failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
