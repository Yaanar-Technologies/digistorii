import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  if (!companySlug) {
    return NextResponse.json(
      { success: false, message: "Company parameter is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const tenantRes = await client.query(
      `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const schema = tenantRes.rows[0].schema_name;

    // Check if discounts table exists
    const tableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = $1 AND table_name = 'discounts'
    `, [schema]);

    if (!tableCheck.rowCount) {
      return NextResponse.json({ success: true, offers: [] });
    }

    // Ensure channel column exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = '${schema}' AND table_name = 'discounts' AND column_name = 'channel'
        ) THEN
          ALTER TABLE "${schema}".discounts ADD COLUMN channel VARCHAR(10) NOT NULL DEFAULT 'both';
        END IF;
      END $$;
    `);

    // Query active discounts applicable to e-commerce
    const result = await client.query(`
      SELECT
        d.id,
        d.name AS title,
        d.description,
        d.discount_type AS "discountType",
        d.value AS "discountValue",
        d.coupon_code AS "couponCode",
        d.is_active AS "isActive",
        d.starts_at AS "startsAt",
        d.ends_at AS "endsAt",
        d.priority,
        d.channel,
        (
          SELECT COUNT(*)::int
          FROM "${schema}".discount_variants dv
          WHERE dv.discount_id = d.id
        ) AS variant_count
      FROM "${schema}".discounts d
      WHERE d.is_active = TRUE
        AND COALESCE(d.channel, 'both') IN ('ecom', 'both')
        AND (d.starts_at IS NULL OR d.starts_at <= NOW())
        AND (d.ends_at IS NULL OR d.ends_at >= NOW())
      ORDER BY d.priority ASC, d.created_at DESC
    `);

    const offers = result.rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      description: row.description || "",
      discountType: row.discountType as "percentage" | "fixed",
      discountValue: Number(row.discountValue || 0),
      couponCode: row.couponCode || null,
      isActive: Boolean(row.isActive),
      startsAt: row.startsAt ? new Date(row.startsAt).toISOString() : null,
      endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
      scope: (row.variant_count > 0 ? "specific_products" : "storewide") as "specific_products" | "storewide",
    }));

    return NextResponse.json({
      success: true,
      offers,
    });
  } catch (err: any) {
    console.error("Offers fetch error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to fetch offers" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
