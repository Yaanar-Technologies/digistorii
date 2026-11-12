import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import {
  getNextOpeningStockDocNo,
  isFinalStatus,
  postOpeningStockToLedger,
} from "@/lib/stockLedger";

const schemaValidator = /^[a-z][a-z0-9_]{0,62}$/;

const itemSchema = z.object({
  product_id: z.union([z.number(), z.string()]),
  sku: z.string().trim().min(1, "SKU is required"),
  qty: z.union([z.number(), z.string()]),
});

const openingStockSchema = z.object({
  date: z.string().trim().min(1, "Date is required"),
  warehouse_id: z.union([z.number(), z.string()]),
  locator_id: z.union([z.number(), z.string()]),
  description: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, "At least one item is required"),
});

type OpeningStockInput = z.infer<typeof openingStockSchema>;

function asNull(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function parseId(value: string | number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseQty(value: string | number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function ensureWarehouse(client: any, schema: string, warehouseId: number) {
  const result = await client.query(
    `SELECT id FROM "${schema}".warehouses WHERE id = $1`,
    [warehouseId]
  );
  return result.rowCount ? true : false;
}

async function ensureLocator(client: any, schema: string, locatorId: number) {
  const result = await client.query(
    `SELECT id, warehouse_id FROM "${schema}".locators WHERE id = $1`,
    [locatorId]
  );
  return result.rowCount ? result.rows[0] : null;
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const { company, schema } = await getTenantSchema(req);
    if (!schema || !schemaValidator.test(schema)) {
      return NextResponse.json({ success: false, error: "Invalid schema" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = openingStockSchema.parse(body);

    const warehouseId = parseId(parsed.warehouse_id);
    const locatorId = parseId(parsed.locator_id);
    if (!warehouseId) {
      return NextResponse.json({ success: false, error: "Warehouse is required" }, { status: 400 });
    }
    if (!locatorId) {
      return NextResponse.json({ success: false, error: "Store locator is required" }, { status: 400 });
    }

    const seenSkus = new Set<string>();
    const items = parsed.items.map((item) => {
      const sku = item.sku.trim();
      if (seenSkus.has(sku)) {
        throw new Error(`Duplicate SKU detected: ${sku}`);
      }
      seenSkus.add(sku);

      const productId = parseId(item.product_id);
      if (!productId) {
        throw new Error("Invalid product");
      }

      const qty = parseQty(item.qty);
      if (qty === null || qty < 0) {
        throw new Error(`Invalid quantity for SKU ${sku}`);
      }

      return { product_id: productId, sku, qty };
    });

    const hasPositiveQty = items.some((item) => item.qty > 0);
    if (!hasPositiveQty) {
      return NextResponse.json(
        { success: false, error: "At least one quantity must be greater than 0" },
        { status: 400 }
      );
    }

    const warehouseExists = await ensureWarehouse(client, schema, warehouseId);
    if (!warehouseExists) {
      return NextResponse.json({ success: false, error: "Warehouse not found" }, { status: 400 });
    }

    const locatorRow = await ensureLocator(client, schema, locatorId);
    if (!locatorRow) {
      return NextResponse.json({ success: false, error: "Locator not found" }, { status: 400 });
    }
    if (locatorRow.warehouse_id !== warehouseId) {
      return NextResponse.json(
        { success: false, error: "Locator does not belong to selected warehouse" },
        { status: 400 }
      );
    }

    const productTupleValues: Array<string | number> = [];
    const productTuplePlaceholders = items.map((item, idx) => {
      const base = idx * 2;
      productTupleValues.push(item.product_id, item.sku);
      return `($${base + 1}, $${base + 2})`;
    });
    const productCheck = await client.query(
      `
        SELECT id, product_id, sku
        FROM "${schema}".product_variants
        WHERE (product_id, sku) IN (${productTuplePlaceholders.join(", ")})
      `,
      productTupleValues
    );
    if (productCheck.rowCount !== items.length) {
      return NextResponse.json({ success: false, error: "One or more products are invalid" }, { status: 400 });
    }

    // Map product_id and sku to variant id
    const variantMap = new Map<string, number>();
    productCheck.rows.forEach((row: any) => {
      variantMap.set(`${row.product_id}-${row.sku}`, row.id);
    });

    // Update items to use variant id instead of product_id
    items.forEach((item) => {
      const variantId = variantMap.get(`${item.product_id}-${item.sku}`);
      if (!variantId) {
        throw new Error(`Variant not found for product ${item.product_id} with SKU ${item.sku}`);
      }
      item.product_id = variantId;
    });

    await client.query("BEGIN");
    inTransaction = true;

    const docNo = await getNextOpeningStockDocNo(client, schema);
    const statusValue = asNull(parsed.status) || "Entered";
    const headerResult = await client.query(
      `
        INSERT INTO "${schema}".opening_stock
          (doc_no, date, description, warehouse_id, locator_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, doc_no, date, description, warehouse_id, locator_id, status, created_at, updated_at
      `,
      [docNo, parsed.date, asNull(parsed.description), warehouseId, locatorId, statusValue]
    );

    const openingStockId = headerResult.rows[0].id as number;
    const itemValues: Array<number | string> = [openingStockId, warehouseId, locatorId];
    const itemRows = items.map((item, idx) => {
      const base = idx * 3;
      itemValues.push(item.product_id, item.sku, item.qty);
      return `($1, $2, $3, $${base + 4}, $${base + 5}, $${base + 6}, NOW())`;
    });

    const itemsResult = await client.query(
      `
        INSERT INTO "${schema}".opening_stock_items
          (opening_stock_id, warehouse_id, locator_id, product_id, sku, qty, created_at)
        VALUES ${itemRows.join(", ")}
        RETURNING id, opening_stock_id, warehouse_id, locator_id, product_id, sku, qty, created_at
      `,
      itemValues
    );

    if (isFinalStatus(statusValue)) {
      await postOpeningStockToLedger(client, schema, company, openingStockId);
      console.log(`Opening stock ${docNo} posted to ledger`);
      console.log('final status',statusValue);
    }

    await client.query("COMMIT");
    inTransaction = false;
    return NextResponse.json({
      success: true,
      data: {
        header: headerResult.rows[0],
        items: itemsResult.rows,
      },
    });
  } catch (error: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (error.name === "ZodError") {
      return NextResponse.json({ success: false, error: error.errors[0]?.message || "Validation failed" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message || "Insert failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    if (!schema || !schemaValidator.test(schema)) {
      return NextResponse.json({ success: false, error: "Invalid schema" }, { status: 400 });
    }
console.log("Fetching opening stock list for schema:", schema); 
    const result = await client.query(
      `
        SELECT
          os.id,
          os.doc_no,
          os.date,
          os.description,
          os.warehouse_id,
          os.locator_id,
          os.status,
          os.created_at,
          os.updated_at,
          w.name AS warehouse_name,
          l.locator_name
        FROM "${schema}".opening_stock os
        LEFT JOIN "${schema}".warehouses w ON w.id = os.warehouse_id
        LEFT JOIN "${schema}".locators l ON l.id = os.locator_id
        ORDER BY os.id DESC
      `
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Fetch failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
