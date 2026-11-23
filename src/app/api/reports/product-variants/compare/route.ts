import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const { schema, company, companyId } = await getTenantSchema(req);
    const { searchParams } = new URL(req.url);

    const idsParam = searchParams.get("ids")?.trim() || "";
    if (!idsParam) {
      return NextResponse.json(
        { success: false, message: "Variant IDs parameter (ids) is required" },
        { status: 400 }
      );
    }

    const variantIds = idsParam
      .split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id) && id > 0);

    if (variantIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid variant IDs provided" },
        { status: 400 }
      );
    }

    // Resolve company subscription flags
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

    // Single fast batch query using CTEs
    const query = `
      WITH selected_variants AS (
        SELECT unnest($1::bigint[]) AS v_id
      ),
      stock_agg AS (
        SELECT 
          sl.product_id AS v_id,
          COALESCE(SUM(sl.qty_in - sl.qty_out), 0) AS current_stock
        FROM "${schema}".stock_ledger sl
        WHERE sl.product_id = ANY($1::bigint[])
        GROUP BY sl.product_id
      ),
      latest_po AS (
        SELECT DISTINCT ON (pd.product_id)
          pd.product_id AS v_id,
          pd.rate AS last_purchase_cost,
          COALESCE(s.supplier_name, s.name, 'N/A') AS top_supplier,
          ph.purchase_date
        FROM "${schema}".purchase_detail pd
        JOIN "${schema}".purchase_header ph ON ph.id = pd.purchase_id
        LEFT JOIN "${schema}".suppliers s ON s.id = ph.supplier_id
        WHERE pd.product_id = ANY($1::bigint[])
        ORDER BY pd.product_id, ph.purchase_date DESC, ph.id DESC
      ),
      pos_sales_agg AS (
        SELECT 
          sd.product_id AS v_id,
          COALESCE(SUM(sd.qty), 0) AS pos_sold_qty,
          COALESCE(SUM(sd.line_total), 0) AS pos_revenue
        FROM "${schema}".sales_detail sd
        WHERE sd.product_id = ANY($1::bigint[])
        GROUP BY sd.product_id
      ),
      ecom_sales_agg AS (
        SELECT 
          oi.variant_id AS v_id,
          COALESCE(SUM(oi.qty), 0) AS ecom_sold_qty,
          COALESCE(SUM(oi.line_total), 0) AS ecom_revenue,
          COUNT(DISTINCT o.id) AS ecom_order_count,
          COUNT(DISTINCT o.customer_id) AS ecom_unique_customers
        FROM "${schema}".online_order_items oi
        JOIN "${schema}".online_orders o ON o.id = oi.order_id
        WHERE oi.variant_id = ANY($1::bigint[])
          AND o.order_status NOT IN ('cancelled')
        GROUP BY oi.variant_id
      ),
      ecom_repeat_buyers AS (
        SELECT 
          buyer_orders.variant_id AS v_id,
          COUNT(*) AS total_buyers,
          COUNT(*) FILTER (WHERE buyer_orders.order_cnt > 1) AS repeat_buyers
        FROM (
          SELECT 
            oi.variant_id,
            o.customer_id,
            COUNT(DISTINCT o.id) AS order_cnt
          FROM "${schema}".online_order_items oi
          JOIN "${schema}".online_orders o ON o.id = oi.order_id
          WHERE oi.variant_id = ANY($1::bigint[])
            AND o.order_status NOT IN ('cancelled')
            AND o.customer_id IS NOT NULL
          GROUP BY oi.variant_id, o.customer_id
        ) buyer_orders
        GROUP BY buyer_orders.variant_id
      )
      SELECT 
        pv.id AS variant_id,
        pv.sku,
        pv.barcode,
        pv.size,
        COALESCE(pc.color_name, '') AS color_name,
        COALESCE(pf.fitting_name, '') AS fitting_name,
        p.name AS product_name,
        p.product_code AS product_code,
        pv.low_stock_threshold,
        COALESCE(sa.current_stock, 0)::numeric AS current_stock,
        COALESCE(lpo.last_purchase_cost, pp.landed_price, pp.base_cost, 0)::numeric AS last_purchase_cost,
        COALESCE(lpo.top_supplier, 'N/A') AS top_supplier,
        COALESCE(pp.final_selling_price, pp.unit_price, 0)::numeric AS pos_selling_price,
        COALESCE(epo.ecom_price, pp.final_selling_price, pp.unit_price, 0)::numeric AS ecom_selling_price,
        COALESCE(psa.pos_sold_qty, 0)::numeric AS pos_sold_qty,
        COALESCE(psa.pos_revenue, 0)::numeric AS pos_revenue,
        COALESCE(esa.ecom_sold_qty, 0)::numeric AS ecom_sold_qty,
        COALESCE(esa.ecom_revenue, 0)::numeric AS ecom_revenue,
        COALESCE(esa.ecom_order_count, 0)::int AS ecom_order_count,
        COALESCE(esa.ecom_unique_customers, 0)::int AS ecom_unique_customers,
        COALESCE(erb.total_buyers, 0)::int AS ecom_total_buyers,
        COALESCE(erb.repeat_buyers, 0)::int AS ecom_repeat_buyers
      FROM selected_variants sv
      JOIN "${schema}".product_variants pv ON pv.id = sv.v_id
      JOIN "${schema}".products p ON p.id = pv.product_id
      LEFT JOIN "${schema}".product_colors pc ON pc.id = pv.color_id
      LEFT JOIN "${schema}".product_fittings pf ON pf.id = pv.fitting_id
      LEFT JOIN stock_agg sa ON sa.v_id = pv.id
      LEFT JOIN latest_po lpo ON lpo.v_id = pv.id
      LEFT JOIN "${schema}".product_pricing pp ON pp.variant_id = pv.id AND pp.is_active = TRUE
      LEFT JOIN "${schema}".ecom_price_overrides epo ON epo.variant_id = pv.id AND epo.is_active = TRUE
      LEFT JOIN pos_sales_agg psa ON psa.v_id = pv.id
      LEFT JOIN ecom_sales_agg esa ON esa.v_id = pv.id
      LEFT JOIN ecom_repeat_buyers erb ON erb.v_id = pv.id
      ORDER BY p.name ASC, pv.sku ASC
    `;

    const result = await pool.query(query, [variantIds]);

    const formattedData = result.rows.map((row) => {
      const cost = Number(row.last_purchase_cost || 0);
      const posPrice = Number(row.pos_selling_price || 0);
      const ecomPrice = Number(row.ecom_selling_price || 0);
      const posQty = pos_access ? Number(row.pos_sold_qty || 0) : 0;
      const posRev = pos_access ? Number(row.pos_revenue || 0) : 0;
      const ecomQty = ecom_access ? Number(row.ecom_sold_qty || 0) : 0;
      const ecomRev = ecom_access ? Number(row.ecom_revenue || 0) : 0;

      const totalQty = posQty + ecomQty;
      const totalRev = posRev + ecomRev;

      const refPrice = pos_access ? posPrice : ecomPrice;
      const profitMargin = refPrice > 0 ? ((refPrice - cost) / refPrice) * 100 : 0;

      const totalBuyers = Number(row.ecom_total_buyers || 0);
      const repeatBuyers = Number(row.ecom_repeat_buyers || 0);
      const repeatBuyerRate = totalBuyers > 0 ? Math.round((repeatBuyers / totalBuyers) * 1000) / 10 : 0;

      return {
        variant_id: row.variant_id,
        sku: row.sku,
        barcode: row.barcode || "-",
        size: row.size || "-",
        color_name: row.color_name || "-",
        fitting_name: row.fitting_name || "-",
        product_name: row.product_name,
        product_code: row.product_code,
        current_stock: Number(row.current_stock || 0),
        low_stock_threshold: Number(row.low_stock_threshold || 5),
        last_purchase_cost: cost,
        top_supplier: row.top_supplier,
        pos_selling_price: posPrice,
        ecom_selling_price: ecomPrice,
        profit_margin_percent: Math.round(profitMargin * 100) / 100,
        pos_sold_qty: posQty,
        pos_revenue: posRev,
        ecom_sold_qty: ecomQty,
        ecom_revenue: ecomRev,
        total_sold_qty: totalQty,
        total_revenue: totalRev,
        ecom_repeat_buyer_rate: repeatBuyerRate
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedData,
      access: {
        pos_access,
        ecom_access
      }
    });
  } catch (err: any) {
    console.error("Multi-Variant Comparison Error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Failed to load variant comparison"
      },
      { status: 500 }
    );
  }
}
