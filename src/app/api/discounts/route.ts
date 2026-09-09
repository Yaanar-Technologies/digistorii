import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

type DiscountPayload = {
  name?: string;
  description?: string;
  discount_type?: "percentage" | "fixed";
  value?: number | string;
  coupon_code?: string | null;
  applies_to?: "specific_variants" | "entire_order";
  priority?: number | string;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
  variant_ids?: Array<number | string>;
};

const ALLOWED_TYPES = new Set(["percentage", "fixed"]);
const ALLOWED_APPLIES_TO = new Set(["specific_variants", "entire_order"]);

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const result = await client.query(
      `
        SELECT
          d.id,
          d.name,
          d.description,
          d.discount_type,
          d.value,
          d.coupon_code,
          d.applies_to,
          d.priority,
          d.starts_at,
          d.ends_at,
          d.is_active,
          d.created_at,
          CASE 
            WHEN d.is_active = TRUE 
              AND (d.starts_at IS NULL OR d.starts_at <= NOW()) 
              AND (d.ends_at IS NULL OR d.ends_at >= NOW()) 
            THEN 'active'
            ELSE 'inactive'
          END AS status,
          COUNT(dv.variant_id)::int AS variant_count
        FROM "${schema}".discounts d
        LEFT JOIN "${schema}".discount_variants dv
          ON dv.discount_id = d.id
        GROUP BY d.id
        ORDER BY
          CASE 
            WHEN d.is_active = TRUE 
              AND (d.starts_at IS NULL OR d.starts_at <= NOW()) 
              AND (d.ends_at IS NULL OR d.ends_at >= NOW()) 
            THEN 1
            ELSE 0
          END DESC,
          d.created_at DESC,
          d.priority ASC
      `
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch discounts" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const body = (await req.json()) as DiscountPayload;

    const name = asText(body.name);
    const discountType = asText(body.discount_type || "").toLowerCase();
    const appliesTo = asText(body.applies_to || "specific_variants").toLowerCase();
    const value = toNumber(body.value, NaN);
    const priority = Math.max(1, Math.floor(toNumber(body.priority, 1)));
    const couponCode = asText(body.coupon_code);
    const couponValue = couponCode ? couponCode : null;
    const startsAt = body.starts_at ? new Date(body.starts_at) : null;
    const endsAt = body.ends_at ? new Date(body.ends_at) : null;
    const variantIds = Array.isArray(body.variant_ids)
      ? body.variant_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];

    if (!name) {
      return NextResponse.json({ success: false, error: "Discount name is required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(discountType)) {
      return NextResponse.json(
        { success: false, error: "Invalid discount type" },
        { status: 400 }
      );
    }
    const resolvedAppliesTo = ALLOWED_APPLIES_TO.has(appliesTo) ? appliesTo : "specific_variants";

    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ success: false, error: "Discount value must be >= 0" }, { status: 400 });
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      return NextResponse.json(
        { success: false, error: "Start date must be before end date" },
        { status: 400 }
      );
    }

    await client.query("BEGIN");
    const insertRes = await client.query(
      `
        INSERT INTO "${schema}".discounts
          (name, description, discount_type, value, coupon_code, applies_to, priority, starts_at, ends_at, is_active)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
      [
        name,
        asText(body.description) || null,
        discountType,
        value,
        couponValue,
        resolvedAppliesTo,
        priority,
        startsAt,
        endsAt,
        body.is_active ?? true,
      ]
    );

    const discount = insertRes.rows[0];

    if (resolvedAppliesTo === "specific_variants" && variantIds.length) {
      await client.query(
        `
          INSERT INTO "${schema}".discount_variants
            (discount_id, variant_id)
          SELECT d.id, v.id
          FROM unnest($2::bigint[]) AS v(id)
          JOIN "${schema}".discounts d ON d.id = $1
        `,
        [discount.id, variantIds]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: discount });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create discount" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
