import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const { schema, company, companyId } = await getTenantSchema(req);
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.trim() || "";
    const barcode = searchParams.get("barcode")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    // Resolve company subscription flags (pos_access, ecommerce_access)
    let pos_access = true;
    let ecom_access = false;
    let resolvedCompanyId = companyId;

    if (!resolvedCompanyId && company) {
      const cRes = await pool.query(
        `SELECT id FROM public.companies WHERE subdomain_url = $1 LIMIT 1`,
        [company]
      );
      if (cRes.rows.length > 0) {
        resolvedCompanyId = Number(cRes.rows[0].id);
      }
    }

    if (resolvedCompanyId) {
      const subRes = await pool.query(
        `SELECT ecommerce_access, COALESCE(pos_access, TRUE) AS pos_access
         FROM public.company_subscriptions
         WHERE company_id = $1
         ORDER BY
           CASE WHEN UPPER(COALESCE(status, '')) IN ('ACTIVE', 'TRIALING') THEN 0 ELSE 1 END,
           updated_at DESC, id DESC
         LIMIT 1`,
        [resolvedCompanyId]
      );
      if (subRes.rows.length > 0) {
        pos_access = Boolean(subRes.rows[0].pos_access);
        ecom_access = Boolean(subRes.rows[0].ecommerce_access);
      }
    }

    // Build dynamic query filters
    const whereClauses: string[] = ["1=1"];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      const searchPattern = `%${search}%`;
      whereClauses.push(`(
        p.name ILIKE $${paramIndex} OR
        pv.sku ILIKE $${paramIndex} OR
        COALESCE(pc.color_name, '') ILIKE $${paramIndex} OR
        COALESCE(pv.size, '') ILIKE $${paramIndex}
      )`);
      params.push(searchPattern);
      paramIndex++;
    }

    if (barcode) {
      const barcodePattern = `%${barcode}%`;
      whereClauses.push(`pv.barcode ILIKE $${paramIndex}`);
      params.push(barcodePattern);
      paramIndex++;
    }

    const whereSql = whereClauses.join(" AND ");

    // Count query
    const countSql = `
      SELECT COUNT(*) AS total
      FROM "${schema}".product_variants pv
      JOIN "${schema}".products p ON p.id = pv.product_id
      LEFT JOIN "${schema}".product_colors pc ON pc.id = pv.color_id
      WHERE ${whereSql}
    `;
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0]?.total || "0", 10);
    const totalPages = Math.ceil(total / limit) || 1;

    // Data query with stock ledger rollup & pricing
    const dataSql = `
      WITH stock_rollup AS (
        SELECT 
          product_id, 
          COALESCE(SUM(qty_in - qty_out), 0) AS current_stock
        FROM "${schema}".stock_ledger
        GROUP BY product_id
      )
      SELECT 
        pv.id AS variant_id,
        pv.product_id,
        p.name AS product_name,
        p.product_code AS product_code,
        pv.sku,
        pv.barcode,
        pv.size,
        pv.gender,
        COALESCE(pc.color_name, '') AS color_name,
        COALESCE(pf.fitting_name, '') AS fitting_name,
        pv.low_stock_threshold,
        pv.status,
        COALESCE(sr.current_stock, 0)::numeric AS current_stock,
        COALESCE(pp.landed_price, pp.base_cost, 0)::numeric AS cost_price,
        COALESCE(pp.final_selling_price, pp.unit_price, 0)::numeric AS pos_price,
        COALESCE(epo.ecom_price, pp.final_selling_price, 0)::numeric AS ecom_price
      FROM "${schema}".product_variants pv
      JOIN "${schema}".products p ON p.id = pv.product_id
      LEFT JOIN "${schema}".product_colors pc ON pc.id = pv.color_id
      LEFT JOIN "${schema}".product_fittings pf ON pf.id = pv.fitting_id
      LEFT JOIN stock_rollup sr ON sr.product_id = pv.id
      LEFT JOIN "${schema}".product_pricing pp ON pp.variant_id = pv.id AND pp.is_active = TRUE
      LEFT JOIN "${schema}".ecom_price_overrides epo ON epo.variant_id = pv.id AND epo.is_active = TRUE
      WHERE ${whereSql}
      ORDER BY p.name ASC, pv.sku ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);
    const dataResult = await pool.query(dataSql, params);

    return NextResponse.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      access: {
        pos_access,
        ecom_access
      }
    });
  } catch (err: any) {
    console.error("Product Variants List Report Error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Failed to fetch product variants"
      },
      { status: 500 }
    );
  }
}
