import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; variantId: string }> }
) {
  const { company, variantId: rawVariantId } = await params;
  const companySlug = (company || "").trim().toLowerCase();
  const variantId = Number(rawVariantId || 0);

  if (!companySlug || !variantId) {
    return NextResponse.json(
      { success: false, message: "Company and valid variantId are required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    // 1. Get tenant schema
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

    const { schema_name: schema, id: companyId } = tenantRes.rows[0];

    // Ensure specifications column exists on products if table was pre-existing
    await client.query(`ALTER TABLE "${schema}".products ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '[]'::jsonb`);

    // 2. Find target variant to get product_id
    const targetVariantRes = await client.query(
      `SELECT id, product_id FROM "${schema}".product_variants WHERE id = $1 LIMIT 1`,
      [variantId]
    );

    if (!targetVariantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: "Product variant not found" },
        { status: 404 }
      );
    }

    const productId = targetVariantRes.rows[0].product_id;

    // 3. Fetch Product record
    const productRes = await client.query(
      `SELECT id, product_code, name, description, category, material, weight, length, width, height, specifications
       FROM "${schema}".products
       WHERE id = $1 LIMIT 1`,
      [productId]
    );

    const productRecord = productRes.rows[0] || {};

    // 4. Fetch Product Images (both product-level and variant-level)
    const imagesRes = await client.query(
      `SELECT id, variant_id, image_url, is_primary, sort_order
       FROM "${schema}".product_images
       WHERE product_id = $1
       ORDER BY is_primary DESC, sort_order ASC, id ASC`,
      [productId]
    );

    const allImages = imagesRes.rows.map((r) => r.image_url);

    // 5. Fetch Sibling Variants
    const variantsQuery = `
      SELECT
        pv.id AS variant_id,
        pv.product_id,
        pv.sku,
        pv.size,
        pv.gender,
        pf.fitting_name AS fitting,
        pv.low_stock_threshold,
        pv.barcode,
        pv.status,
        pc.color_name AS color,
        COALESCE(
          (
            SELECT epo.ecom_price 
            FROM "${schema}".ecom_price_overrides epo 
            WHERE epo.variant_id = pv.id AND epo.is_active = TRUE 
            LIMIT 1
          ),
          (
            SELECT pp.final_selling_price 
            FROM "${schema}".product_pricing pp 
            WHERE pp.variant_id = pv.id AND pp.is_active = TRUE 
            LIMIT 1
          ),
          0.00
        ) AS effective_price,
        (
          SELECT pp.unit_price 
          FROM "${schema}".product_pricing pp 
          WHERE pp.variant_id = pv.id AND pp.is_active = TRUE 
          LIMIT 1
        ) AS compare_at_price,
        COALESCE(
          (
            SELECT eas.available_qty 
            FROM "${schema}".ecom_available_stock eas 
            WHERE eas.variant_id = pv.id 
            LIMIT 1
          ),
          pv.qty,
          0
        ) AS available_qty
      FROM "${schema}".product_variants pv
      LEFT JOIN "${schema}".product_colors pc ON pc.id = pv.color_id
      LEFT JOIN "${schema}".product_fittings pf ON pf.id = pv.fitting_id
      WHERE pv.product_id = $1 AND pv.status = 'active'
      ORDER BY pv.id ASC
    `;

    const variantsRes = await client.query(variantsQuery, [productId]);

    const siblingVariants = variantsRes.rows.map((row) => {
      // Find variant-specific images, or fallback to all images
      const variantImages = imagesRes.rows
        .filter((img) => img.variant_id === row.variant_id)
        .map((img) => img.image_url);

      const images = variantImages.length > 0 ? variantImages : allImages;

      return {
        variantId: Number(row.variant_id),
        sku: row.sku,
        color: row.color || null,
        size: row.size || null,
        gender: row.gender || null,
        fitting: row.fitting || null,
        effectivePrice: Number(row.effective_price || 0),
        compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
        availableQty: Number(row.available_qty || 0),
        lowStockThreshold: Number(row.low_stock_threshold || 5),
        inStock: Number(row.available_qty || 0) > 0,
        images: images.length > 0 ? images : ["https://placehold.co/600x400?text=No+Image+Available"],
      };
    });

    // 6. Fetch Footer Settings / Delivery info from ecom_settings
    const settingsRes = await client.query(
      `SELECT terms_and_conditions, return_refund_policy, delivery_note, support_email, support_phone
       FROM "${schema}".ecom_settings
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    const footerSettings = {
      termsAndConditions: settingsRes.rows[0]?.terms_and_conditions || "Standard delivery: 5 to 7 business days from date of order.",
      returnRefundPolicy: settingsRes.rows[0]?.return_refund_policy || "Products with stitching require an additional 4 to 5 business days.",
      deliveryNote: settingsRes.rows[0]?.delivery_note || "Standard delivery takes 5-7 business days.",
      supportEmail: settingsRes.rows[0]?.support_email || "support@merchant.com",
      supportPhone: settingsRes.rows[0]?.support_phone || "+91 98765 43210",
    };

    return NextResponse.json({
      success: true,
      product: {
        id: productRecord.id,
        productCode: productRecord.product_code,
        name: productRecord.name,
        description: productRecord.description || "",
        category: productRecord.category || "Apparel",
        material: productRecord.material || null,
        weight: productRecord.weight ? Number(productRecord.weight) : null,
        length: productRecord.length ? Number(productRecord.length) : null,
        width: productRecord.width ? Number(productRecord.width) : null,
        height: productRecord.height ? Number(productRecord.height) : null,
        specifications: Array.isArray(productRecord.specifications) ? productRecord.specifications : [],
      },
      targetVariantId: variantId,
      variants: siblingVariants,
      footerSettings,
    });
  } catch (err: any) {
    console.error("Error fetching product detail:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load product details" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
