import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

const ALLOWED_TYPES = new Set(["percentage", "fixed"]);

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const { id } = await context.params;

    const discountRes = await client.query(
      `
        SELECT
          d.*,
          CASE 
            WHEN d.is_active = TRUE 
              AND (d.starts_at IS NULL OR d.starts_at <= NOW()) 
              AND (d.ends_at IS NULL OR d.ends_at >= NOW()) 
            THEN 'active'
            ELSE 'inactive'
          END AS status
        FROM "${schema}".discounts d
        WHERE d.id = $1
      `,
      [id]
    );
    if (!discountRes.rows.length) {
      return NextResponse.json({ success: false, error: "Discount not found" }, { status: 404 });
    }

    const variantsRes = await client.query(
      `
        SELECT
          dv.variant_id::int,
          p.product_code,
          p.name AS product_name,
          pv.sku,
          pv.barcode
        FROM "${schema}".discount_variants dv
        INNER JOIN "${schema}".product_variants pv
          ON pv.id = dv.variant_id
        INNER JOIN "${schema}".products p
          ON p.id = pv.product_id
        WHERE dv.discount_id = $1
        ORDER BY pv.id
      `,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...discountRes.rows[0],
        variant_ids: variantsRes.rows.map((row) => Number(row.variant_id)),
        variants: variantsRes.rows,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch discount" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const { id } = await context.params;
    const body = await req.json();

    const name = asText(body.name);
    const discountType = asText(body.discount_type || "").toLowerCase();
    const value = toNumber(body.value, NaN);
    const priority = Math.max(1, Math.floor(toNumber(body.priority, 1)));
    const couponCode = asText(body.coupon_code);
    const couponValue = couponCode ? couponCode : null;
    const startsAt = body.starts_at ? new Date(body.starts_at) : null;
    const endsAt = body.ends_at ? new Date(body.ends_at) : null;
    const variantIds = Array.isArray(body.variant_ids)
      ? body.variant_ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v))
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
    const updateRes = await client.query(
      `
        UPDATE "${schema}".discounts
        SET
          name = $1,
          description = $2,
          discount_type = $3,
          value = $4,
          coupon_code = $5,
          priority = $6,
          starts_at = $7,
          ends_at = $8,
          is_active = $9
        WHERE id = $10
        RETURNING *
      `,
      [
        name,
        asText(body.description) || null,
        discountType,
        value,
        couponValue,
        priority,
        startsAt,
        endsAt,
        body.is_active ?? true,
        id,
      ]
    );

    if (!updateRes.rows.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ success: false, error: "Discount not found" }, { status: 404 });
    }

    await client.query(
      `DELETE FROM "${schema}".discount_variants WHERE discount_id = $1`,
      [id]
    );

    if (variantIds.length) {
      await client.query(
        `
          INSERT INTO "${schema}".discount_variants
            (discount_id, variant_id)
          SELECT d.id, v.id
          FROM unnest($2::bigint[]) AS v(id)
          JOIN "${schema}".discounts d ON d.id = $1
        `,
        [id, variantIds]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: updateRes.rows[0] });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update discount" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
