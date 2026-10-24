import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import { generatePurchaseReturnNo } from "@/lib/document-number-generator";
import { insertStockLedgerEntry } from "@/lib/stockLedger";
import { cookies } from "next/headers";
import { verifySession, STAFF_COOKIE_NAME, StaffSessionPayload } from "@/lib/session";

async function ensurePurchaseReturnTables(client: any, schema: string) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".purchase_returns (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      grn_id INT NOT NULL REFERENCES "${schema}".grn_header(id) ON DELETE RESTRICT,
      purchase_return_no VARCHAR(100) UNIQUE,
      txn_date DATE NOT NULL,
      refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".purchase_return_items (
      id BIGSERIAL PRIMARY KEY,
      purchase_return_id BIGINT NOT NULL REFERENCES "${schema}".purchase_returns(id) ON DELETE CASCADE,
      grn_line_id INT NOT NULL REFERENCES "${schema}".grn_detail(id) ON DELETE RESTRICT,
      product_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      returned_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_purchase_return_items_header
    ON "${schema}".purchase_return_items(purchase_return_id);
  `);
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    await ensurePurchaseReturnTables(client, schema);

    const result = await client.query(
      `
        SELECT 
          pr.id,
          pr.purchase_return_no,
          pr.txn_date,
          pr.refund_amount,
          pr.created_by,
          pr.created_at,
          gh.grn_no,
          s.name as supplier_name,
          s.supplier_code
        FROM "${schema}".purchase_returns pr
        JOIN "${schema}".grn_header gh ON gh.id = pr.grn_id
        LEFT JOIN "${schema}".suppliers s ON s.id = gh.supplier_id
        ORDER BY pr.id DESC
      `
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch purchase returns" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    await ensurePurchaseReturnTables(client, schema);

    const body = await req.json();
    const { grn_id, txn_date, refund_amount, items } = body;

    if (!grn_id || !txn_date || !items?.length) {
      return NextResponse.json(
        { success: false, error: "grn_id, txn_date, and items are required" },
        { status: 400 }
      );
    }

    // Get username from session cookie
    let username = "system";
    try {
      const cookieStore = await cookies();
      const userCookie = cookieStore.get(STAFF_COOKIE_NAME);
      if (userCookie?.value) {
        const parsed = await verifySession<StaffSessionPayload>(userCookie.value, "staff");
        if (parsed) {
          username = parsed.username || parsed.email || parsed.name || "system";
        }
      }
    } catch (e) {
      // Ignore cookie verification error and fallback
    }

    await client.query("BEGIN");

    // Generate Return No
    const returnNo = await generatePurchaseReturnNo(schema);

    // Insert purchase returns header
    const returnRes = await client.query(
      `
        INSERT INTO "${schema}".purchase_returns
          (tenant_id, grn_id, purchase_return_no, txn_date, refund_amount, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `,
      [company, grn_id, returnNo, txn_date, refund_amount || 0, username]
    );

    const returnId = Number(returnRes.rows[0].id);

    // Process each return item
    for (const item of items) {
      const grnLineId = Number(item.grn_line_id);
      const returnQty = Number(item.return_qty);
      if (isNaN(returnQty) || returnQty <= 0) {
        throw new Error("Returned quantity must be greater than 0");
      }

      // Fetch GRN Detail to check received qty and get fallback locator/warehouse
      const grnDetailRes = await client.query(
        `
          SELECT qty, product_id, warehouse_id, locator_id
          FROM "${schema}".grn_detail
          WHERE id = $1 AND grn_id = $2
        `,
        [grnLineId, grn_id]
      );

      if (!grnDetailRes.rowCount) {
        throw new Error(`GRN line item ${grnLineId} not found under GRN ${grn_id}`);
      }

      const grnDetail = grnDetailRes.rows[0];
      const receivedQty = Number(grnDetail.qty || 0);

      // Fetch previously returned quantity for this line
      const prevReturnRes = await client.query(
        `
          SELECT COALESCE(SUM(pri.returned_qty), 0) AS total_returned
          FROM "${schema}".purchase_return_items pri
          JOIN "${schema}".purchase_returns pr ON pr.id = pri.purchase_return_id
          WHERE pri.grn_line_id = $1
        `,
        [grnLineId]
      );
      const prevReturned = Number(prevReturnRes.rows[0]?.total_returned || 0);

      if (prevReturned + returnQty > receivedQty) {
        throw new Error(
          `Cannot return more than received qty. Received: ${receivedQty}, Previously Returned: ${prevReturned}, Attempting: ${returnQty}`
        );
      }

      const finalWarehouseId = Number(item.warehouse_id || grnDetail.warehouse_id);
      const finalLocatorId = Number(item.locator_id || grnDetail.locator_id);
      const unitPrice = Number(item.unit_price || 0);

      // Insert return detail item
      const returnItemRes = await client.query(
        `
          INSERT INTO "${schema}".purchase_return_items
            (purchase_return_id, grn_line_id, product_id, warehouse_id, locator_id, returned_qty, unit_price)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
        [
          returnId,
          grnLineId,
          Number(item.product_id || grnDetail.product_id),
          finalWarehouseId,
          finalLocatorId,
          returnQty,
          unitPrice
        ]
      );
      const returnItemId = Number(returnItemRes.rows[0].id);

      // Post negative stock movement to ledger: txn_type = 'Purchase Return', qty_in = 0, qty_out = returnQty
      await insertStockLedgerEntry(client, schema, {
        tenant_id: company,
        txn_date: txn_date,
        txn_type: "Purchase Return",
        ref_type: "PurchaseReturn",
        ref_id: returnId,
        ref_line_id: returnItemId,
        warehouse_id: finalWarehouseId,
        locator_id: finalLocatorId,
        product_id: Number(item.product_id || grnDetail.product_id),
        qty_in: 0,
        qty_out: returnQty
      });
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Purchase return created successfully",
      purchase_return_no: returnNo,
      id: returnId
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create purchase return" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
