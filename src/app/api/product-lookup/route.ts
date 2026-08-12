import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

const toPositiveInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

function getUserIdFromCookie(req: NextRequest): number | null {
  const userCookie = req.cookies.get("user")?.value;
  if (!userCookie) return null;

  try {
    const parsed = JSON.parse(userCookie);
    const maybeUserId = Number(parsed?.user_id ?? parsed?.id);
    if (!Number.isInteger(maybeUserId) || maybeUserId <= 0) return null;
    return maybeUserId;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();

  try {
    const { company, schema } = await getTenantSchema(req);

    const type = req.nextUrl.searchParams.get("type"); // "products" or "taxes"
    const moduleParam = req.nextUrl.searchParams.get("module") || "";
    const productTypeColumnRes = await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'products'
          AND column_name = 'product_type'
        LIMIT 1
      `,
      [schema]
    );
    const productTypeColumn = productTypeColumnRes.rowCount
      ? "product_type"
      : "type";
    const warehouseParam = req.nextUrl.searchParams.get("warehouse_id");
    const isOpsModule = moduleParam === "ops" || type === "ops_lookup";
    const isSalesModule = moduleParam === "sales";
    const salesProductFilter =
      isSalesModule ? `AND p.${productTypeColumn} = 'finished_good'` : "";
    let targetWarehouseId: number | null = null;

    if (isSalesModule) {
      const userId = getUserIdFromCookie(req);
      if (!userId) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }

      const companyRes = await client.query(
        `SELECT id FROM public.companies WHERE subdomain_url = $1 LIMIT 1`,
        [company]
      );
      const companyId = toPositiveInt(companyRes.rows[0]?.id);
      if (!companyId) {
        return NextResponse.json(
          { success: false, error: "Company not found" },
          { status: 404 }
        );
      }

      const userWarehouseRes = await client.query(
        `
          SELECT warehouse_id
          FROM public.company_user_map
          WHERE user_id = $1
            AND company_id = $2
            AND is_active = TRUE
          ORDER BY id DESC
          LIMIT 1
        `,
        [userId, companyId]
      );
      targetWarehouseId = toPositiveInt(userWarehouseRes.rows[0]?.warehouse_id);

      if (!targetWarehouseId) {
        return NextResponse.json({ success: true, data: [] });
      }
    } else if (isOpsModule && warehouseParam) {
      targetWarehouseId = toPositiveInt(warehouseParam);
    }

    let warehouseSourceFilter = "";
    if (isSalesModule) {
      warehouseSourceFilter = `
        AND (
          EXISTS (
            SELECT 1
            FROM "${schema}".opening_stock_items osi
            WHERE osi.product_id = pv.id
              AND osi.warehouse_id = $2
          )
          OR EXISTS (
            SELECT 1
            FROM "${schema}".grn_detail gd
            WHERE gd.product_id = pv.id
              AND gd.warehouse_id = $2
          )
        )
      `;
    } else if (isOpsModule) {
      warehouseSourceFilter = `
        AND NOT EXISTS (
          SELECT 1
          FROM "${schema}".opening_stock_items osi
          WHERE osi.product_id = pv.id
            AND osi.warehouse_id = $2
        )
        AND (
          NOT EXISTS (
            SELECT 1
            FROM "${schema}".current_stock cs
            WHERE cs.product_id = pv.id
              AND cs.tenant_id = $1
              AND ($2::int IS NULL OR cs.warehouse_id = $2::int)
          )
          OR (
            SELECT COALESCE(SUM(cs.current_stock), 0)
            FROM "${schema}".current_stock cs
            WHERE cs.product_id = pv.id
              AND cs.tenant_id = $1
              AND ($2::int IS NULL OR cs.warehouse_id = $2::int)
          ) = 0
        )
      `;
    }

    let result;
    if (type === "uoms") {
      result = await client.query(`
        SELECT
          id::int,
          uom_code,
          uom_name
        FROM "${schema}".uom
        ORDER BY id
      `);
      return NextResponse.json({ success: true, data: result.rows });
    } else if (type === "taxes") {
      result = await client.query(`
        SELECT
          id::int,
          tax_name,
          total_percentage,
          effective_from,
          effective_to,
          is_active
        FROM "${schema}".tax_master
        WHERE is_active = TRUE
        ORDER BY id
      `);
      return NextResponse.json({ success: true, data: result.rows });
    } else if (type === "polist") {

      result = await client.query(
        `
      SELECT
      h.id as purchase_id,
      h.purchase_no,
      h.supplier_id,
      h.status as po_status,
      h.approval_status,
      s.supplier_code,
      s.name as supplier_name
    FROM ${schema}.purchase_header h
    LEFT JOIN ${schema}.suppliers s
      ON h.supplier_id = s.id
    WHERE h.approval_status ='Approved'
    ORDER BY h.id DESC
      `
      );

      return NextResponse.json(result.rows);

    } else if (type === "poitems") {
      const poId = req.nextUrl.searchParams.get("po_id");
      if (!poId) return NextResponse.json({ success: false, message: "PO ID required" }, { status: 400 });
      console.log("purchase order lookup 63");
      const result = await client.query(
        `
    SELECT  ph.status as po_status,d.id AS detail_id,d.product_id,p.product_code,p.name AS product_name,
    p.description,u.uom_code,u.uom_name,
    d.uom,d.hsn_no,d.qty AS order_qty,
    COALESCE(SUM(gd.qty),0) AS received_qty
FROM ${schema}.purchase_header ph
LEFT JOIN ${schema}.purchase_detail d
    ON ph.id = d.purchase_id
LEFT JOIN ${schema}.product_variants pv
ON pv.id::text = d.product_id::text
LEFT JOIN ${schema}.products p
ON p.id::text = COALESCE(pv.product_id, d.product_id)::text
LEFT JOIN "${schema}".uom u
ON u.id::text = d.uom
LEFT JOIN ${schema}.grn_detail gd
ON gd.product_id::text = d.product_id::text
AND gd.order_qty = d.qty
AND gd.grn_id IN (
    SELECT id FROM ${schema}.grn_header
    WHERE purchase_id = d.purchase_id
)
WHERE d.purchase_id = $1
GROUP BY d.id,d.product_id,p.product_code,p.name,p.description,u.uom_code,u.uom_name,d.uom,d.hsn_no,d.qty,ph.status
HAVING (d.qty - COALESCE(SUM(gd.qty),0)) > 0
ORDER BY d.id 
    `,
        [poId]
      );

      return NextResponse.json({ success: true, items: result.rows });
    } else if (type === "currencies") {
      result = await client.query(`
        SELECT
          c.id::int,
          c.currency_code,
          c.currency_name,
          cr.conversion_rate
        FROM "${schema}".currencies c
        LEFT JOIN "${schema}".currency_rates cr
          ON cr.currency_id = c.id
        ORDER BY c.id
      `);

      return NextResponse.json({ success: true, data: result.rows });
    } else if (type === "lookup") {
      console.log("Fetching product lookup data...110");
      result = await client.query(
        `
        SELECT
          pv.id::int AS variant_id,
          pv.id::int AS id,
          p.id::int AS product_id,
          p.product_code AS code,
          p.product_code,
          pv.sku,
          pcl.color_name as color,
          p.name,
          p.description,
          COALESCE(pc.path_string, pc.category_name, p.category) AS category_name,
          COALESCE(pc.path_string, pc.category_name, p.category) AS category,
          stock.current_stock AS current_stock,
          COALESCE(pp.final_selling_price, 0) AS selling_price,
          p.${productTypeColumn} AS type,
          p.source,
          p.uom,
          u.uom_code,
          u.uom_name,
          p.hsn_code,
          pv.barcode
        FROM "${schema}".product_variants pv
        INNER JOIN "${schema}".products p
          ON p.id = pv.product_id
        LEFT JOIN "${schema}".product_categories pc
          ON pc.id::text = p.category::text
        LEFT JOIN "${schema}".uom u
          ON u.id::text = p.uom
        LEFT JOIN "${schema}".product_colors pcl
          on pcl.id::text = pv.color_id::text
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(cs.current_stock), 0) AS current_stock
          FROM "${schema}".current_stock cs
          WHERE cs.product_id = pv.id
            AND cs.tenant_id = $1
            AND ($2::int IS NULL OR cs.warehouse_id = $2::int)
        ) stock
          ON TRUE
        LEFT JOIN "${schema}".product_pricing pp
          ON pp.variant_id = pv.id
          AND pp.tenant_id = $1
          AND pp.is_active = TRUE
        WHERE p.status = 1
          AND pv.status IN ('draft', 'active')
          ${salesProductFilter}
          ${warehouseSourceFilter}
        ORDER BY stock.current_stock ASC
        `
        , [company, targetWarehouseId]);
      return NextResponse.json({ success: true, data: result.rows });

    } else {
      console.log("in else 150");
      result = await client.query(
        `
      SELECT
        p.id::int AS product_id,
        p.product_code,
        p.name AS product_name,
        p.description,
        COALESCE(pc.path_string, pc.category_name, p.category) AS category,
        stock.current_stock AS current_stock,
        p.material,
        p.uom,
        p.hsn_code,
        p.weight,
        p.length,
        u.uom_code,
        u.uom_name,
        p.${productTypeColumn} AS type,
        p.source,
        p.status,
        pv.id::int AS variant_id,
        pv.sku,
        pv.barcode
      FROM "${schema}".products p
       LEFT JOIN "${schema}".uom u
        ON u.id::text = p.uom
      INNER JOIN "${schema}".product_variants pv
        ON pv.product_id = p.id
      LEFT JOIN "${schema}".product_categories pc
        ON pc.id::text = p.category::text
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cs.current_stock), 0) AS current_stock
        FROM "${schema}".current_stock cs
        WHERE cs.product_id = pv.id
          AND cs.tenant_id = $1
          AND ($2::int IS NULL OR cs.warehouse_id = $2::int)
      ) stock
        ON TRUE
      WHERE p.status = 1
        AND pv.status IN ('draft', 'active')
        ${salesProductFilter}
        ${warehouseSourceFilter}
      ORDER BY p.id, pv.id
      `
        , [company, targetWarehouseId]);

      return NextResponse.json(result.rows);

    }


  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Failed to fetch products" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

