import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { generateSalesNo } from "@/lib/document-number-generator";
import { getTenantSchema } from "@/lib/tenant";
import { isFinalStatus, insertStockLedgerEntry } from "@/lib/stockLedger";
import { allocateSalesStockFIFO } from "@/lib/stockAllocation";

async function ensureSalesReturnTables(client: any, schema: string) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".sales_returns (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      sales_invoice_id INT NOT NULL REFERENCES "${schema}".sales_header(id) ON DELETE RESTRICT,
      txn_date DATE NOT NULL,
      refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".sales_return_items (
      id BIGSERIAL PRIMARY KEY,
      sales_return_id BIGINT NOT NULL REFERENCES "${schema}".sales_returns(id) ON DELETE CASCADE,
      sales_invoice_line_id INT NOT NULL REFERENCES "${schema}".sales_detail(id) ON DELETE RESTRICT,
      product_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      returned_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_return_items_header
    ON "${schema}".sales_return_items(sales_return_id);
  `);
}

async function resolveVariantId(
  client: any,
  schema: string,
  idValue: any
): Promise<number> {
  const id = Number(idValue);
  if (!Number.isFinite(id)) throw new Error("Invalid variant id");
  const variantRes = await client.query(
    `SELECT id FROM "${schema}".product_variants WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (variantRes.rows.length) return Number(variantRes.rows[0].id);
  throw new Error("Variant not found");
}

const toPositiveInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const getWarehouseFromCookie = (req: NextRequest) => {
  const userCookie = req.cookies.get("user")?.value;
  if (!userCookie) return null;

  try {
    const parsed = JSON.parse(userCookie);
    // warehouse_id is from company_user_map, not user_settings
    return toPositiveInt(parsed?.warehouse_id);
  } catch {
    return null;
  }
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

const roundMoney = (value: unknown) => Number(Number(value || 0).toFixed(2));

const normalizePaymentRows = (
  payments: any
): Array<{
  payment_mode_id: number;
  amount: number;
  paid_amount: number;
  actual_amount: number;
  return_change: number;
}> => {
  if (!Array.isArray(payments)) return [];
  return payments
    .map((row) => ({
      payment_mode_id: toPositiveInt(row?.payment_mode_id),
      amount: roundMoney(row?.amount),
      paid_amount: roundMoney(row?.paid_amount || row?.amount),
      actual_amount: roundMoney(row?.actual_amount),
      return_change: roundMoney(row?.return_change),
    }))
    .filter(
      (row): row is {
        payment_mode_id: number;
        amount: number;
        paid_amount: number;
        actual_amount: number;
        return_change: number;
      } =>
        Boolean(row.payment_mode_id) && Number.isFinite(row.amount) && row.amount > 0
    );
};

const calculatePaymentStatus = (totalAmount: number, paidAmount: number) => {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= totalAmount) return "paid";
  return "partial";
};

async function resolveWarehouseContext(client: any, schema: string, warehouseId: number) {
  const warehouseRes = await client.query(
    `SELECT id, name, location_id FROM "${schema}".warehouses WHERE id = $1 LIMIT 1`,
    [warehouseId]
  );
  if (!warehouseRes.rowCount) {
    throw new Error("Warehouse not found");
  }
  return {
    warehouse_id: Number(warehouseRes.rows[0].id),
    warehouse_name: String(warehouseRes.rows[0].name || ""),
    location_id: toPositiveInt(warehouseRes.rows[0].location_id),
  };
}


// async function ensurePaymentsTrackingColumns(client: any, schema: string) {
//   await client.query(`
//     ALTER TABLE "${schema}".sales_header 
//     ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;
//   `);

//   await client.query(`
//     ALTER TABLE "${schema}".sales_payments 
//     ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0.00,
//     ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(12,2) DEFAULT 0.00,
//     ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;
//   `);

//   await client.query(`
//     UPDATE "${schema}".sales_payments
//     SET paid_amount = amount,
//         actual_amount = amount
//     WHERE paid_amount = 0.00 AND actual_amount = 0.00;
//   `);
// }

async function replaceSalesPayments(
  client: any,
  schema: string,
  salesId: number,
  payments: Array<{
    payment_mode_id: number;
    amount: number;
    paid_amount: number;
    actual_amount: number;
    return_change: number;
  }>,
  createdBy: string | number | null,
  locationId: number | null,
  warehouseId: number
) {
  await client.query(`DELETE FROM "${schema}".sales_payments WHERE sales_id = $1`, [salesId]);
  if (!payments.length) return;
  for (const payment of payments) {
    await client.query(
      `INSERT INTO "${schema}".sales_payments (
         sales_id, payment_mode_id, amount, paid_amount, actual_amount, return_change,
         created_by, location_id, warehouse_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        salesId,
        payment.payment_mode_id,
        payment.amount,
        payment.paid_amount,
        payment.actual_amount,
        payment.return_change,
        createdBy,
        locationId,
        warehouseId
      ]
    );
  }
}

async function validatePaymentModes(
  client: any,
  schema: string,
  paymentModeIds: number[]
) {
  if (!paymentModeIds.length) return;
  const res = await client.query(
    `SELECT id FROM "${schema}".payment_modes WHERE id = ANY($1::int[])`,
    [paymentModeIds]
  );
  if (res.rowCount !== paymentModeIds.length) {
    throw new Error("One or more payment modes are invalid");
  }
}


// ---------------- GET: fetch all sales with details ----------------
export async function GET(req: NextRequest) {
  try {

    const { company, schema } = await getTenantSchema(req);

    const res = await pool.query(`
      SELECT
        h.*,
        s.name as customer_name,
        s.email as customer_email,
        s.phone as customer_phone,
        w.name as warehouse_name,
        l.name as location_name,
        CONCAT_WS(', ',
          ca.address_line1,
          ca.address_line2,
          ca.city,
          ca.state,
          ca.pincode
        ) as customer_address
      FROM ${schema}.sales_header h
      LEFT JOIN ${schema}.customers s
      ON h.customer_id = s.id
      LEFT JOIN ${schema}.warehouses w
      ON h.warehouse_id = w.id
      LEFT JOIN ${schema}.locations l
      ON h.location_id = l.id
      LEFT JOIN ${schema}.customer_addresses ca
      ON ca.customer_id = s.id 
      ORDER BY h.id DESC
    `);

    // console.log("Fetched Sales:", res.rows);
    return NextResponse.json({ success: true, data: res.rows });

  } catch (err: any) {

    console.error("Sales Fetch DB Error:", err);

    if (err.code === "42P01") {
      return NextResponse.json(
        { success: false, error: "Table sales_header or sales_detail does not exist" },
        { status: 500 }
      );
    }

    if (err.code === "28P01") {
      return NextResponse.json(
        { success: false, error: "Database authentication failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: err.message || "Database query failed"
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    const userId = getUserIdFromCookie(req);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get warehouse_id from user context (company_user_map), not from user_settings
    const warehouseId = getWarehouseFromCookie(req);
    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: "Warehouse not assigned for this user. Contact administrator." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { header, details, payments, returns } = body;

    if (!header || (!details?.length && !returns?.items?.length)) {
      return NextResponse.json(
        { success: false, error: "Header and at least one detail or return item are required" },
        { status: 400 }
      );
    }
    await client.query("BEGIN");

    // Ensure Sales Return Tables exist
    await ensureSalesReturnTables(client, schema);
    // await ensurePaymentsTrackingColumns(client, schema);

    const warehouseContext = await resolveWarehouseContext(client, schema, warehouseId);
    const locatorId = null;
    const normalizedPayments = normalizePaymentRows(payments);
    await validatePaymentModes(
      client,
      schema,
      normalizedPayments.map((row) => row.payment_mode_id)
    );
    const totalTendered = roundMoney(
      normalizedPayments.reduce((sum, row) => sum + Number(row.paid_amount || row.amount || 0), 0)
    );
    const totalAmount = roundMoney(header.total_amount);
    const paymentStatus = calculatePaymentStatus(totalAmount, totalTendered);

    // Generate sales_no
    const salesNo = await generateSalesNo(schema);
    // Insert header
    const headerQuery = `
      INSERT INTO ${schema}.sales_header
        (sales_no, customer_id, sales_date, currency, warehouse_id, location_id, locator_id, status, payment_status, subtotal, tax_amount, total_amount, return_change, created_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
      RETURNING id
    `;
    const statusValue = header.status || "Entered";
    const headerValues = [
      salesNo,
      header.customer_id,
      header.sales_date,
      header.currency,
      warehouseContext.warehouse_id,
      warehouseContext.location_id,
      locatorId,
      statusValue,
      paymentStatus,
      header.subtotal,
      header.tax_amount,
      header.total_amount,
      header.return_change || 0.0,
      userId,
    ];
    const headerRes = await client.query(headerQuery, headerValues);
    if (!headerRes.rows.length) throw new Error("Failed to save sales header");

    const salesId = headerRes.rows[0].id;
    await replaceSalesPayments(
      client,
      schema,
      salesId,
      normalizedPayments,
      userId,
      warehouseContext.location_id,
      warehouseContext.warehouse_id
    );

    const shouldAllocate = isFinalStatus(statusValue);
    let allocationWarehouseId: number | null = warehouseContext.warehouse_id;
    if (shouldAllocate) {
      if (!allocationWarehouseId) {
        throw new Error("Warehouse not set for this sale");
      }
    }

    // Insert details
    const detailQuery = `
      INSERT INTO ${schema}.sales_detail
        (sales_id, product_id, UOM, rate, qty, discount, tax_master_id, tax_amount, line_total, created_by, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      RETURNING id
    `;
    if (details && details.length > 0) {
      for (const d of details) {
        const variantId = await resolveVariantId(client, schema, d.product_id);
        const taxMasterId = d.tax_id && d.tax_id > 0 ? d.tax_id : null;
        const detailRes = await client.query(detailQuery, [
          salesId,
          variantId,
          d.uom,
          d.rate,
          d.qty,
          d.discount,
          taxMasterId,
          d.tax_amount,
          d.line_total,
          userId
        ]);
        if (shouldAllocate) {
          const salesDetailId = Number(detailRes.rows[0]?.id);
          await allocateSalesStockFIFO(client, {
            schema,
            tenantId: company,
            salesId,
            salesDetailId,
            productId: variantId,
            qtyToSell: Number(d.qty || 0),
            warehouseId: allocationWarehouseId!,
            txnDate: header.sales_date
          });
        }
      }
    }

    // Process returns (if present)
    if (returns && returns.items && returns.items.length > 0) {
      const returnRes = await client.query(
        `INSERT INTO "${schema}".sales_returns
          (tenant_id, sales_invoice_id, txn_date, refund_amount, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [company, returns.sales_invoice_id, header.sales_date, returns.refund_amount, userId]
      );
      const returnId = returnRes.rows[0].id;

      for (const item of returns.items) {
        const qtyCheck = await client.query(
          `SELECT qty FROM "${schema}".sales_detail WHERE id = $1`,
          [item.sales_invoice_line_id]
        );
        const originalQty = Number(qtyCheck.rows[0]?.qty || 0);

        const prevReturnedRes = await client.query(
          `SELECT COALESCE(SUM(sri.returned_qty), 0) AS prev_returned
           FROM "${schema}".sales_return_items sri
           JOIN "${schema}".sales_returns sr ON sr.id = sri.sales_return_id
           WHERE sri.sales_invoice_line_id = $1`,
          [item.sales_invoice_line_id]
        );
        const prevReturned = Number(prevReturnedRes.rows[0]?.prev_returned || 0);

        if (prevReturned + Number(item.returned_qty) > originalQty) {
          throw new Error(`Returned quantity for variant ${item.product_id} exceeds available returnable quantity`);
        }

        const retItemRes = await client.query(
          `INSERT INTO "${schema}".sales_return_items
            (sales_return_id, sales_invoice_line_id, product_id, warehouse_id, locator_id, returned_qty, unit_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            returnId,
            item.sales_invoice_line_id,
            item.product_id,
            item.warehouse_id || warehouseId,
            item.locator_id || null,
            item.returned_qty,
            item.unit_price
          ]
        );
        const returnLineItemId = retItemRes.rows[0].id;

        // Find original locator used
        const origLedgerRes = await client.query(
          `SELECT locator_id FROM "${schema}".stock_ledger
           WHERE ref_type = 'sales_header' AND ref_id = $1 AND ref_line_id = $2
           LIMIT 1`,
          [returns.sales_invoice_id, item.sales_invoice_line_id]
        );
        let finalLocatorId = origLedgerRes.rows[0]?.locator_id || item.locator_id;
        if (!finalLocatorId) {
          const defaultLocRes = await client.query(
            `SELECT id FROM "${schema}".locators WHERE warehouse_id = $1 LIMIT 1`,
            [item.warehouse_id || warehouseId]
          );
          finalLocatorId = defaultLocRes.rows[0]?.id;
        }
        if (!finalLocatorId) {
          throw new Error("No locator found for returning stock");
        }

        // Insert stock ledger entry for return
        await insertStockLedgerEntry(client, schema, {
          tenant_id: company,
          txn_date: header.sales_date,
          txn_type: "Sales Return",
          ref_type: "SalesReturn",
          ref_id: Number(returnId),
          ref_line_id: Number(returnLineItemId),
          warehouse_id: Number(item.warehouse_id || warehouseId),
          locator_id: Number(finalLocatorId),
          product_id: Number(item.product_id),
          qty_in: Number(item.returned_qty),
          qty_out: 0
        });
      }
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Sales saved successfully",
      sales_no: salesNo,
      id: salesId,
      payment_status: paymentStatus,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Sales Save Error:", err);
    let msg = "Internal server error";
    let statusCode = 500;
    if (err.code === "23505") msg = "Duplicate entry detected";
    else if (err.message) msg = err.message;
    if (msg === "Insufficient stock" || msg === "Warehouse not set for this sale") {
      statusCode = 400;
    }

    return NextResponse.json({ success: false, error: msg }, { status: statusCode });
  } finally {
    client.release();
  }
}
