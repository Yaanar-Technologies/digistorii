import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; variantId: string }> }
) {
  const { company, variantId: rawVariantId } = await params;
  const companySlug = (company || "").trim().toLowerCase();
  const variantId = Number(rawVariantId || 0);

  if (!companySlug || !variantId || isNaN(variantId)) {
    return NextResponse.json(
      { success: false, message: "Company and valid variantId are required." },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const email = (body.email || "").trim().toLowerCase();
  const phone = (body.phone || "").trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return NextResponse.json(
      { success: false, message: "A valid email address is required." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const tenantRes = await client.query(
      `SELECT c.id, c.schema_name
       FROM public.companies c
       WHERE LOWER(c.subdomain_url) = $1
       LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const { schema_name: schema } = tenantRes.rows[0];

    // Ensure table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".back_in_stock_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
        email VARCHAR(255),
        phone VARCHAR(50),
        status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'notified', 'cancelled')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        notified_at TIMESTAMP WITH TIME ZONE
      );
      CREATE INDEX IF NOT EXISTS idx_back_in_stock_variant ON "${schema}".back_in_stock_subscriptions(variant_id, status);
    `);

    // Verify variant exists
    const variantRes = await client.query(
      `SELECT id FROM "${schema}".product_variants WHERE id = $1 LIMIT 1`,
      [variantId]
    );

    if (!variantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: "Product variant not found." },
        { status: 404 }
      );
    }

    // Check if already subscribed and pending
    const existingRes = await client.query(
      `SELECT id FROM "${schema}".back_in_stock_subscriptions
       WHERE variant_id = $1 AND LOWER(email) = $2 AND status = 'pending'
       LIMIT 1`,
      [variantId, email]
    );

    if (existingRes.rowCount && existingRes.rowCount > 0) {
      return NextResponse.json({
        success: true,
        message: "You're already subscribed! We'll email you as soon as this item is back in stock.",
      });
    }

    // Insert new subscription
    await client.query(
      `INSERT INTO "${schema}".back_in_stock_subscriptions (variant_id, email, phone, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())`,
      [variantId, email, phone || null]
    );

    return NextResponse.json({
      success: true,
      message: "Thank you! We'll notify you as soon as this item is restocked.",
    });
  } catch (err: any) {
    console.error("Back in stock subscription error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to subscribe for stock notification." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
