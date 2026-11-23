import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const result = await client.query(
      `
        SELECT
          d.id,
          d.discount_type,
          d.value,
          d.priority,
          dv.variant_id::int AS variant_id
        FROM "${schema}".discounts d
        INNER JOIN "${schema}".discount_variants dv
          ON dv.discount_id = d.id
        WHERE d.is_active = TRUE
          AND COALESCE(d.channel, 'both') IN ('pos', 'both')
          AND (d.starts_at IS NULL OR d.starts_at <= NOW())
          AND (d.ends_at IS NULL OR d.ends_at >= NOW())
      `
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch active discounts" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
