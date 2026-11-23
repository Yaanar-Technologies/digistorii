import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

type ActiveDiscountRequest = {
  variant_ids?: Array<number | string>;
  coupon_code?: string | null;
  sales_date?: string | null;
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const body = (await req.json()) as ActiveDiscountRequest;
    const variantIds = Array.isArray(body.variant_ids)
      ? body.variant_ids.map((id) => toNumber(id)).filter((id): id is number => id !== null)
      : [];

    if (!variantIds.length) {
      return NextResponse.json({ success: true, data: {} });
    }

    const coupon = String(body.coupon_code || "").trim();
    const couponValue = coupon ? coupon : null;
    const dateValue = body.sales_date ? new Date(body.sales_date) : new Date();

    const result = await client.query(
      `
        SELECT
          dv.variant_id::int,
          d.id,
          d.name,
          d.discount_type,
          d.value,
          d.priority,
          d.coupon_code
        FROM "${schema}".discounts d
        INNER JOIN "${schema}".discount_variants dv
          ON dv.discount_id = d.id
        WHERE d.is_active = TRUE
          AND COALESCE(d.channel, 'both') IN ('pos', 'both')
          AND dv.variant_id = ANY($1::bigint[])
          AND (d.starts_at IS NULL OR d.starts_at <= $2)
          AND (d.ends_at IS NULL OR d.ends_at >= $2)
          AND (
            ($3::text IS NULL AND d.coupon_code IS NULL)
            OR
            ($3::text IS NOT NULL AND (d.coupon_code IS NULL OR d.coupon_code = $3))
          )
        ORDER BY dv.variant_id, d.priority ASC, d.value DESC, d.created_at DESC
      `,
      [variantIds, dateValue, couponValue]
    );

    const bestByVariant: Record<string, any> = {};
    for (const row of result.rows) {
      const key = String(row.variant_id);
      if (!bestByVariant[key]) {
        bestByVariant[key] = row;
      }
    }

    return NextResponse.json({ success: true, data: bestByVariant });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch discounts" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
