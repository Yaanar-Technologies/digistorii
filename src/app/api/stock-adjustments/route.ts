import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import { verifySession, STAFF_COOKIE_NAME, StaffSessionPayload } from "@/lib/session";
import { insertStockLedgerEntry } from "@/lib/stockLedger";

// Helper to ensure the adjustment tables exist in the tenant schema
async function ensureStockAdjustmentTables(client: any, schema: string) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".stock_adjustments (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      txn_date DATE NOT NULL,
      warehouse_id INT NOT NULL REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT NOT NULL REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      reason TEXT,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".stock_adjustment_items (
      id BIGSERIAL PRIMARY KEY,
      adjustment_id BIGINT NOT NULL REFERENCES "${schema}".stock_adjustments(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      system_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      physical_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      adjustment_qty NUMERIC(12,2) NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_header
    ON "${schema}".stock_adjustment_items(adjustment_id);
  `);
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    await ensureStockAdjustmentTables(client, schema);

    const result = await client.query(
      `
        SELECT
          sa.id AS adjustment_id,
          sa.txn_date,
          sa.reason,
          w.name AS warehouse_name,
          l.locator_name,
          COUNT(sai.id) AS total_items,
          SUM(sai.adjustment_qty) AS total_variance
        FROM "${schema}".stock_adjustments sa
        LEFT JOIN "${schema}".stock_adjustment_items sai ON sai.adjustment_id = sa.id
        LEFT JOIN "${schema}".warehouses w ON w.id = sa.warehouse_id
        LEFT JOIN "${schema}".locators l ON l.id = sa.locator_id
        WHERE sa.tenant_id = $1
        GROUP BY sa.id, sa.txn_date, sa.reason, w.name, l.locator_name
        ORDER BY sa.id DESC
      `,
      [company]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch stock adjustments" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const { company, schema } = await getTenantSchema(req);
    await ensureStockAdjustmentTables(client, schema);

    const body = await req.json();
    const { txn_date, warehouse_id, locator_id, reason, items } = body;

    const requiredFields = {
      txn_date,
      warehouse_id,
      locator_id,
      items,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing required field(s): ${missingFields.join(", ")}`,
          missingFields,
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items array is required and cannot be empty" },
        { status: 400 }
      );
    }

    for (const item of items) {
      const { product_id, physical_qty } = item;
      if (!product_id || physical_qty === undefined || physical_qty === null) {
        return NextResponse.json(
          { success: false, error: "Each item must have a product_id and physical_qty" },
          { status: 400 }
        );
      }
      const parsedPhysicalQty = Number(physical_qty);
      if (isNaN(parsedPhysicalQty) || parsedPhysicalQty < 0) {
        return NextResponse.json(
          { success: false, error: "Physical stock input cannot be less than 0" },
          { status: 400 }
        );
      }
    }

    // Reason validation: alphanumeric-spaces-hyphens (Only letters, numbers, spaces, hyphens, and commas)
    if (reason && reason.trim()) {
      const invalidRegex = /[^a-zA-Z0-9\s.,'-]/;
      if (invalidRegex.test(reason)) {
        return NextResponse.json(
          { success: false, error: "Reason field must only contain letters, numbers, spaces, hyphens, commas, dots, and apostrophes." },
          { status: 400 }
        );
      }
    }

    // Get user details if available from cookies
    const userCookie = req.cookies.get(STAFF_COOKIE_NAME)?.value;
    let createdBy = "system";
    if (userCookie) {
      const user = await verifySession<StaffSessionPayload>(userCookie, "staff");
      if (user) {
        createdBy = user.name || user.username || "system";
      }
    }

    // Start transaction
    await client.query("BEGIN");
    inTransaction = true;

    // 1. Insert header
    const headerRes = await client.query(
      `
        INSERT INTO "${schema}".stock_adjustments
          (tenant_id, txn_date, warehouse_id, locator_id, reason, created_by, created_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `,
      [company, txn_date, warehouse_id, locator_id, reason || null, createdBy]
    );
    const adjustmentId = headerRes.rows[0].id;

    let totalAdjustmentsProcessed = 0;

    for (const item of items) {
      const { product_id, physical_qty } = item;
      const parsedPhysicalQty = Number(physical_qty);

      // Get current stock
      const stockRes = await client.query(
        `
          SELECT COALESCE(SUM(current_stock), 0) AS current_stock
          FROM "${schema}".current_stock
          WHERE tenant_id = $1
            AND warehouse_id = $2
            AND locator_id = $3
            AND product_id = $4
        `,
        [company, warehouse_id, locator_id, product_id]
      );
      const systemQty = Number(stockRes.rows[0]?.current_stock || 0);
      const adjustmentQty = parsedPhysicalQty - systemQty;

      if (adjustmentQty === 0) {
        continue;
      }

      // 2. Insert item
      const itemRes = await client.query(
        `
          INSERT INTO "${schema}".stock_adjustment_items
            (adjustment_id, product_id, system_qty, physical_qty, adjustment_qty)
          VALUES
            ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [adjustmentId, product_id, systemQty, parsedPhysicalQty, adjustmentQty]
      );
      const itemId = itemRes.rows[0].id;

      // 3. Insert into stock_ledger
      const qtyIn = adjustmentQty > 0 ? adjustmentQty : 0;
      const qtyOut = adjustmentQty < 0 ? Math.abs(adjustmentQty) : 0;

      await insertStockLedgerEntry(client, schema, {
        tenant_id: company,
        txn_date: txn_date,
        txn_type: "Adjustment",
        ref_type: "stock_adjustment",
        ref_id: Number(adjustmentId),
        ref_line_id: Number(itemId),
        warehouse_id: Number(warehouse_id),
        locator_id: Number(locator_id),
        product_id: Number(product_id),
        qty_in: qtyIn,
        qty_out: qtyOut
      });

      totalAdjustmentsProcessed++;
    }

    if (totalAdjustmentsProcessed === 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        { success: false, error: "Zero-variance adjustments (Physical = System) are not allowed" },
        { status: 400 }
      );
    }

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: "Stock adjustment saved successfully",
      data: {
        adjustment_id: adjustmentId
      }
    });

  } catch (error: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process stock adjustment" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
