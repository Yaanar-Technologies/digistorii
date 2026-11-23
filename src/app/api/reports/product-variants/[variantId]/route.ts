import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const { schema, company, companyId } = await getTenantSchema(req);
    const resolvedParams = await params;
    const variantId = parseInt(resolvedParams.variantId, 10);

    if (isNaN(variantId)) {
      return NextResponse.json(
        { success: false, message: "Invalid variant ID" },
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

    // 1. Fetch Variant & Product details
    const variantQuery = `
      SELECT 
        pv.id AS variant_id,
        pv.product_id,
        p.name AS product_name,
        p.product_code AS product_code,
        p.hsn_code,
        p.description,
        pv.sku,
        pv.barcode,
        pv.size,
        pv.gender,
        COALESCE(pc.color_name, '') AS color_name,
        COALESCE(pf.fitting_name, '') AS fitting_name,
        pv.low_stock_threshold,
        pv.status,
        (SELECT COALESCE(SUM(qty_in - qty_out), 0) FROM "${schema}".stock_ledger WHERE product_id = pv.id) AS current_stock
      FROM "${schema}".product_variants pv
      JOIN "${schema}".products p ON p.id = pv.product_id
      LEFT JOIN "${schema}".product_colors pc ON pc.id = pv.color_id
      LEFT JOIN "${schema}".product_fittings pf ON pf.id = pv.fitting_id
      WHERE pv.id = $1
      LIMIT 1
    `;
    const variantRes = await pool.query(variantQuery, [variantId]);

    if (variantRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Product variant not found" },
        { status: 404 }
      );
    }
    const variantInfo = variantRes.rows[0];

    // 2. Fetch Pricing & Discounts
    const pricingQuery = `
      SELECT 
        pp.base_cost,
        pp.operational_cost,
        pp.landed_price,
        pp.margin_type,
        pp.margin_value,
        pp.margin_amount,
        pp.unit_price,
        pp.tax_percent,
        pp.tax_amount,
        pp.final_selling_price,
        epo.ecom_price
      FROM "${schema}".product_variants pv
      LEFT JOIN "${schema}".product_pricing pp ON pp.variant_id = pv.id AND pp.is_active = TRUE
      LEFT JOIN "${schema}".ecom_price_overrides epo ON epo.variant_id = pv.id AND epo.is_active = TRUE
      WHERE pv.id = $1
      LIMIT 1
    `;
    const pricingRes = await pool.query(pricingQuery, [variantId]);
    const pricingRaw = pricingRes.rows[0] || {};

    const costPrice = Number(pricingRaw.landed_price ?? pricingRaw.base_cost ?? 0);
    const posPrice = Number(pricingRaw.final_selling_price ?? pricingRaw.unit_price ?? 0);
    const ecomPrice = Number(pricingRaw.ecom_price ?? posPrice);
    const profitMargin = posPrice > 0 ? ((posPrice - costPrice) / posPrice) * 100 : 0;

    // Active discounts
    const discountsQuery = `
      SELECT 
        d.id,
        d.name,
        d.description,
        d.channel,
        d.discount_type,
        d.value,
        d.coupon_code,
        d.applies_to
      FROM "${schema}".discounts d
      LEFT JOIN "${schema}".discount_variants dv ON dv.discount_id = d.id
      WHERE (d.applies_to = 'entire_order' OR dv.variant_id = $1)
      ORDER BY d.priority ASC, d.id ASC
    `;
    let activeDiscounts: any[] = [];
    try {
      const discountsRes = await pool.query(discountsQuery, [variantId]);
      activeDiscounts = discountsRes.rows;
    } catch {
      activeDiscounts = [];
    }

    // 3. Purchase Order (PO) History
    const poQuery = `
      SELECT 
        ph.id AS po_id,
        ph.purchase_no,
        ph.purchase_date,
        COALESCE(s.supplier_name, s.name, 'Unknown') AS supplier_name,
        s.supplier_code,
        pd.qty AS ordered_qty,
        pd.rate AS unit_cost,
        pd.line_total AS total_amount,
        COALESCE(ph.approval_status, 'Approved') AS approval_status
      FROM "${schema}".purchase_detail pd
      JOIN "${schema}".purchase_header ph ON ph.id = pd.purchase_id
      LEFT JOIN "${schema}".suppliers s ON s.id = ph.supplier_id
      WHERE pd.product_id = $1
      ORDER BY ph.purchase_date DESC, ph.id DESC
      LIMIT 50
    `;
    const poRes = await pool.query(poQuery, [variantId]);

    // 4. POS Sales Metrics & Monthly Trend
    let posSales = {
      order_count: 0,
      units_sold: 0,
      total_revenue: 0,
      avg_selling_price: 0,
      monthly_trend: [] as any[]
    };

    if (pos_access) {
      const posAggQuery = `
        SELECT 
          COUNT(DISTINCT sh.id) AS order_count,
          COALESCE(SUM(sd.qty), 0) AS units_sold,
          COALESCE(SUM(sd.line_total), 0) AS total_revenue
        FROM "${schema}".sales_detail sd
        JOIN "${schema}".sales_header sh ON sh.id = sd.sales_id
        WHERE sd.product_id = $1
      `;
      const posAggRes = await pool.query(posAggQuery, [variantId]);
      const posAgg = posAggRes.rows[0];
      const unitsSold = Number(posAgg?.units_sold || 0);
      const totalRev = Number(posAgg?.total_revenue || 0);

      const posTrendQuery = `
        SELECT 
          TO_CHAR(sh.sales_date, 'YYYY-MM') AS month_key,
          COALESCE(SUM(sd.qty), 0)::numeric AS units,
          COALESCE(SUM(sd.line_total), 0)::numeric AS revenue
        FROM "${schema}".sales_detail sd
        JOIN "${schema}".sales_header sh ON sh.id = sd.sales_id
        WHERE sd.product_id = $1 
          AND sh.sales_date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY TO_CHAR(sh.sales_date, 'YYYY-MM')
        ORDER BY month_key ASC
      `;
      const posTrendRes = await pool.query(posTrendQuery, [variantId]);

      posSales = {
        order_count: Number(posAgg?.order_count || 0),
        units_sold: unitsSold,
        total_revenue: totalRev,
        avg_selling_price: unitsSold > 0 ? Math.round((totalRev / unitsSold) * 100) / 100 : 0,
        monthly_trend: posTrendRes.rows
      };
    }

    // 5. E-Commerce Sales Metrics & Customer Preferences
    let ecomSales = {
      order_count: 0,
      units_sold: 0,
      total_revenue: 0,
      unique_customers: 0,
      repeat_purchase_rate: 0,
      avg_order_qty: 0,
      cart_count: 0,
      wishlist_count: 0,
      frequently_bought_together: [] as any[],
      monthly_trend: [] as any[]
    };

    if (ecom_access) {
      try {
        const ecomAggQuery = `
          SELECT 
            COUNT(DISTINCT o.id) AS order_count,
            COALESCE(SUM(oi.qty), 0) AS units_sold,
            COALESCE(SUM(oi.line_total), 0) AS total_revenue,
            COUNT(DISTINCT o.customer_id) AS unique_customers
          FROM "${schema}".online_order_items oi
          JOIN "${schema}".online_orders o ON o.id = oi.order_id
          WHERE oi.variant_id = $1 
            AND o.order_status NOT IN ('cancelled')
        `;
        const ecomAggRes = await pool.query(ecomAggQuery, [variantId]);
        const ecomAgg = ecomAggRes.rows[0];
        const ecomUnits = Number(ecomAgg?.units_sold || 0);
        const ecomRev = Number(ecomAgg?.total_revenue || 0);
        const uniqueCust = Number(ecomAgg?.unique_customers || 0);

        // Repeat purchase rate
        const repeatCustQuery = `
          WITH cust_counts AS (
            SELECT o.customer_id, COUNT(DISTINCT o.id) AS order_count
            FROM "${schema}".online_order_items oi
            JOIN "${schema}".online_orders o ON o.id = oi.order_id
            WHERE oi.variant_id = $1 
              AND o.order_status NOT IN ('cancelled') 
              AND o.customer_id IS NOT NULL
            GROUP BY o.customer_id
          )
          SELECT 
            COUNT(*) AS total_buyers,
            COUNT(*) FILTER (WHERE order_count > 1) AS repeat_buyers
          FROM cust_counts
        `;
        const repeatRes = await pool.query(repeatCustQuery, [variantId]);
        const totalBuyers = Number(repeatRes.rows[0]?.total_buyers || 0);
        const repeatBuyers = Number(repeatRes.rows[0]?.repeat_buyers || 0);
        const repeatRate = totalBuyers > 0 ? Math.round((repeatBuyers / totalBuyers) * 1000) / 10 : 0;

        // Frequently bought together companion variants
        const companionQuery = `
          SELECT 
            oi2.variant_id,
            p2.name AS product_name,
            pv2.sku,
            COALESCE(pc2.color_name, '') AS color_name,
            COALESCE(pv2.size, '') AS size,
            COUNT(DISTINCT oi2.order_id)::int AS times_bought_together
          FROM "${schema}".online_order_items oi1
          JOIN "${schema}".online_order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.variant_id != oi1.variant_id
          JOIN "${schema}".online_orders o ON o.id = oi1.order_id
          JOIN "${schema}".product_variants pv2 ON pv2.id = oi2.variant_id
          JOIN "${schema}".products p2 ON p2.id = pv2.product_id
          LEFT JOIN "${schema}".product_colors pc2 ON pc2.id = pv2.color_id
          WHERE oi1.variant_id = $1 
            AND o.order_status NOT IN ('cancelled')
          GROUP BY oi2.variant_id, p2.name, pv2.sku, pc2.color_name, pv2.size
          ORDER BY times_bought_together DESC
          LIMIT 5
        `;
        const companionRes = await pool.query(companionQuery, [variantId]);

        // Cart and wishlist count
        let cartCount = 0;
        let wishlistCount = 0;
        try {
          const cartRes = await pool.query(
            `SELECT COUNT(*)::int AS cnt FROM "${schema}".cart_items WHERE variant_id = $1`,
            [variantId]
          );
          cartCount = Number(cartRes.rows[0]?.cnt || 0);
        } catch { }

        try {
          const wishRes = await pool.query(
            `SELECT COUNT(*)::int AS cnt FROM "${schema}".wishlist_items WHERE variant_id = $1`,
            [variantId]
          );
          wishlistCount = Number(wishRes.rows[0]?.cnt || 0);
        } catch { }

        // Monthly E-Com trend
        const ecomTrendQuery = `
          SELECT 
            TO_CHAR(o.created_at, 'YYYY-MM') AS month_key,
            COALESCE(SUM(oi.qty), 0)::numeric AS units,
            COALESCE(SUM(oi.line_total), 0)::numeric AS revenue
          FROM "${schema}".online_order_items oi
          JOIN "${schema}".online_orders o ON o.id = oi.order_id
          WHERE oi.variant_id = $1 
            AND o.order_status NOT IN ('cancelled')
            AND o.created_at >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY TO_CHAR(o.created_at, 'YYYY-MM')
          ORDER BY month_key ASC
        `;
        const ecomTrendRes = await pool.query(ecomTrendQuery, [variantId]);

        ecomSales = {
          order_count: Number(ecomAgg?.order_count || 0),
          units_sold: ecomUnits,
          total_revenue: ecomRev,
          unique_customers: uniqueCust,
          repeat_purchase_rate: repeatRate,
          avg_order_qty: uniqueCust > 0 ? Math.round((ecomUnits / uniqueCust) * 100) / 100 : 0,
          cart_count: cartCount,
          wishlist_count: wishlistCount,
          frequently_bought_together: companionRes.rows,
          monthly_trend: ecomTrendRes.rows
        };
      } catch (ecomErr) {
        console.error("E-com metrics fetch error:", ecomErr);
      }
    }

    // 6. Chronological Stock Ledger Table with Running Balance
    const stockLedgerQuery = `
      SELECT 
        sl.id,
        sl.txn_date,
        sl.txn_type,
        sl.ref_type,
        sl.ref_id,
        COALESCE(os.doc_no, gh.grn_no, sh.sales_no, sl.ref_id::text) AS document_no,
        w.name AS warehouse_name,
        l.locator_name,
        sl.qty_in::numeric AS qty_in,
        sl.qty_out::numeric AS qty_out
      FROM "${schema}".stock_ledger sl
      LEFT JOIN "${schema}".warehouses w ON w.id = sl.warehouse_id
      LEFT JOIN "${schema}".locators l ON l.id = sl.locator_id
      LEFT JOIN "${schema}".opening_stock os ON os.id = sl.ref_id AND sl.ref_type = 'opening_stock'
      LEFT JOIN "${schema}".grn_header gh ON gh.id = sl.ref_id AND sl.ref_type = 'grn_header'
      LEFT JOIN "${schema}".sales_header sh ON sh.id = sl.ref_id AND sl.ref_type = 'sales_header'
      WHERE sl.product_id = $1
      ORDER BY sl.txn_date ASC, sl.id ASC
    `;
    const stockLedgerRes = await pool.query(stockLedgerQuery, [variantId]);

    // Calculate chronological running closing balance
    let runningBalance = 0;
    const stockLedgerHistory = stockLedgerRes.rows.map((row) => {
      const qIn = Number(row.qty_in || 0);
      const qOut = Number(row.qty_out || 0);
      const netChange = qIn - qOut;
      runningBalance += netChange;

      // Human-readable transaction type label
      let displayType = row.txn_type;
      if (row.txn_type === "GRN") displayType = "PO Inward (GRN)";
      else if (row.txn_type === "Sales") displayType = "Sales Outward";
      else if (row.txn_type === "Opening") displayType = "Opening Stock";
      else if (row.txn_type === "Adjustment") displayType = "Stock Adjustment";

      return {
        id: row.id,
        txn_date: row.txn_date,
        txn_type: displayType,
        raw_txn_type: row.txn_type,
        document_no: row.document_no,
        warehouse_name: row.warehouse_name,
        locator_name: row.locator_name,
        qty_in: qIn,
        qty_out: qOut,
        net_change: netChange,
        closing_balance: runningBalance
      };
    });

    // Reverse for latest first display in table
    stockLedgerHistory.reverse();

    return NextResponse.json({
      success: true,
      data: {
        variant: {
          ...variantInfo,
          current_stock: Number(variantInfo.current_stock || 0)
        },
        pricing: {
          base_cost: Number(pricingRaw.base_cost || 0),
          operational_cost: Number(pricingRaw.operational_cost || 0),
          cost_price: costPrice,
          margin_type: pricingRaw.margin_type || "percentage",
          margin_value: Number(pricingRaw.margin_value || 0),
          unit_price: Number(pricingRaw.unit_price || 0),
          tax_percent: Number(pricingRaw.tax_percent || 0),
          tax_amount: Number(pricingRaw.tax_amount || 0),
          pos_selling_price: posPrice,
          ecom_selling_price: ecomPrice,
          profit_margin_percent: Math.round(profitMargin * 100) / 100,
          active_discounts: activeDiscounts
        },
        po_history: poRes.rows.map((po) => ({
          po_id: po.po_id,
          purchase_no: po.purchase_no,
          purchase_date: po.purchase_date,
          supplier_name: po.supplier_name,
          supplier_code: po.supplier_code,
          ordered_qty: Number(po.ordered_qty || 0),
          unit_cost: Number(po.unit_cost || 0),
          total_amount: Number(po.total_amount || 0),
          approval_status: po.approval_status
        })),
        pos_sales: posSales,
        ecom_sales: ecomSales,
        stock_ledger: stockLedgerHistory
      },
      access: {
        pos_access,
        ecom_access
      }
    });
  } catch (err: any) {
    console.error("Single Product Variant Analytics Report Error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Failed to load variant analytics report"
      },
      { status: 500 }
    );
  }
}
