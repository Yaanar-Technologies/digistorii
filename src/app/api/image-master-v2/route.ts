import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);

    const summaryRes = await client.query(
      `
        SELECT
          COUNT(*) AS total_images,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM "${schema}".product_images pi
              WHERE pi.image_id = im.id
            )
          ) AS linked_images,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM "${schema}".product_images pi
              WHERE pi.image_id = im.id
            )
          ) AS unlinked_images,
          COUNT(*) FILTER (
            WHERE im.category_id IS NULL
              OR im.material_id IS NULL
              OR im.uom_id IS NULL
              OR im.source IS NULL
          ) AS untagged_images
          ,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM "${schema}".product_images pi
              WHERE pi.image_id = im.id
            )
            AND im.category_id IS NOT NULL
            AND im.material_id IS NOT NULL
            AND im.uom_id IS NOT NULL
            AND im.source IS NOT NULL
          ) AS unlinked_tagged_images,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM "${schema}".product_images pi
              WHERE pi.image_id = im.id
            )
            AND (
              im.category_id IS NULL
              OR im.material_id IS NULL
              OR im.uom_id IS NULL
              OR im.source IS NULL
            )
          ) AS unlinked_untagged_images
        FROM "${schema}".image_master im
      `
    );

    const rowsRes = await client.query(
      `
        SELECT
          im.id,
          im.filename,
          im.file_path,
          im.category_id,
          im.material_id,
          im.uom_id,
          im.source,
          im.created_at,
          COALESCE(c.path_string, c.category_name) AS category_label,
          CASE
            WHEN m.material_code IS NOT NULL AND m.material_name IS NOT NULL
              THEN CONCAT(m.material_code, ' - ', m.material_name)
            ELSE m.material_name
          END AS material_label,
          CASE
            WHEN u.uom_code IS NOT NULL AND u.uom_name IS NOT NULL
              THEN CONCAT(u.uom_code, ' - ', u.uom_name)
            ELSE u.uom_name
          END AS uom_label,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM "${schema}".product_images pi
              WHERE pi.image_id = im.id
            )
              THEN 'linked'
            WHEN im.category_id IS NULL
              OR im.material_id IS NULL
              OR im.uom_id IS NULL
              OR im.source IS NULL
              THEN 'untagged'
            ELSE 'unlinked'
          END AS status,
          EXISTS (
            SELECT 1
            FROM "${schema}".product_images pi
            WHERE pi.image_id = im.id
          ) AS is_linked,
          link.sku AS linked_sku
        FROM "${schema}".image_master im
        LEFT JOIN "${schema}".product_categories c ON im.category_id = c.id
        LEFT JOIN "${schema}".product_materials m ON im.material_id = m.id
        LEFT JOIN "${schema}".uom u ON im.uom_id = u.id
        LEFT JOIN LATERAL (
          SELECT pv.sku
          FROM "${schema}".product_images pi
          LEFT JOIN "${schema}".product_variants pv ON pi.variant_id = pv.id
          WHERE pi.image_id = im.id
          ORDER BY pv.sku ASC NULLS LAST
          LIMIT 1
        ) link ON TRUE
        ORDER BY im.created_at DESC
      `
    );

    const summaryRow = summaryRes.rows[0] || {};
    const summary = {
      total: Number(summaryRow.total_images || 0),
      linked: Number(summaryRow.linked_images || 0),
      unlinked: Number(summaryRow.unlinked_images || 0),
      untagged: Number(summaryRow.untagged_images || 0),
      unlinked_tagged: Number(summaryRow.unlinked_tagged_images || 0),
      unlinked_untagged: Number(summaryRow.unlinked_untagged_images || 0),
    };

    return NextResponse.json({
      success: true,
      summary,
      data: rowsRes.rows || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load image master" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
