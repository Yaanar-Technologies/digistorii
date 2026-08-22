import { PoolClient } from "pg";
import { checkLowStockAndNotify } from "./inventoryHook";

export type StockLedgerEntry = {
  tenant_id: string;
  txn_date: string;
  txn_type:
    | "Opening"
    | "GRN"
    | "Sales"
    | "Sales Return"
    | "Purchase Return"
    | "Transfer In"
    | "Transfer Out"
    | "Adjustment";
  ref_type: string;
  ref_id: number;
  ref_line_id: number;
  warehouse_id: number;
  locator_id: number;
  product_id: number;
  qty_in: number;
  qty_out: number;
};

type StockLayerEntry = {
  tenant_id: string;
  product_id: number;
  warehouse_id: number;
  locator_id: number;
  source_txn_type: "Opening" | "GRN";
  source_ref_id: number;
  source_ref_line_id: number;
  qty_remaining: number;
  cost: number;
};

export function isFinalStatus(status?: string | null) {
  if (!status) return false;
  const normalized = status.trim();
  return normalized === "Entered" || normalized === "Partial";
}

async function assertNoExistingLedgerEntries(
  client: PoolClient,
  schema: string,
  refType: string,
  refId: number
) {
  const res = await client.query(
    `SELECT 1 FROM "${schema}".stock_ledger WHERE ref_type = $1 AND ref_id = $2 LIMIT 1`,
    [refType, refId]
  );
  if (res.rowCount) {
    throw new Error(`Stock ledger already posted for ${refType} ${refId}`);
  }
}

async function assertNoExistingStockLayers(
  client: PoolClient,
  schema: string,
  sourceTxnType: StockLayerEntry["source_txn_type"],
  sourceRefId: number
) {
  const res = await client.query(
    `SELECT 1 FROM "${schema}".stock_layers WHERE source_txn_type = $1 AND source_ref_id = $2 LIMIT 1`,
    [sourceTxnType, sourceRefId]
  );
  if (res.rowCount) {
    throw new Error(`Stock layers already posted for ${sourceTxnType} ${sourceRefId}`);
  }
}

export async function insertStockLedgerEntry(
  client: PoolClient,
  schema: string,
  entry: StockLedgerEntry
) {
  if ((entry.qty_in > 0 && entry.qty_out > 0) || (entry.qty_in <= 0 && entry.qty_out <= 0)) {
    throw new Error("Stock ledger entry must have either qty_in or qty_out (not both)");
  }

  await client.query(
    `
      INSERT INTO "${schema}".stock_ledger
      (
        tenant_id,
        txn_date,
        txn_type,
        ref_type,
        ref_id,
        ref_line_id,
        warehouse_id,
        locator_id,
        product_id,
        qty_in,
        qty_out,
        created_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    `,
    [
      entry.tenant_id,
      entry.txn_date,
      entry.txn_type,
      entry.ref_type,
      entry.ref_id,
      entry.ref_line_id,
      entry.warehouse_id,
      entry.locator_id,
      entry.product_id,
      entry.qty_in,
      entry.qty_out
    ]
  );

  // Trigger low stock check and notifications
  await checkLowStockAndNotify(client, schema, entry.tenant_id, entry.product_id);
}

async function insertStockLayerEntry(
  client: PoolClient,
  schema: string,
  layer: StockLayerEntry
) {
  if (layer.qty_remaining <= 0) {
    throw new Error("Stock layer qty_remaining must be greater than 0");
  }
  await client.query(
    `
      INSERT INTO "${schema}".stock_layers
      (
        tenant_id,
        product_id,
        warehouse_id,
        locator_id,
        source_txn_type,
        source_ref_id,
        source_ref_line_id,
        qty_remaining,
        cost,
        created_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    `,
    [
      layer.tenant_id,
      layer.product_id,
      layer.warehouse_id,
      layer.locator_id,
      layer.source_txn_type,
      layer.source_ref_id,
      layer.source_ref_line_id,
      layer.qty_remaining,
      layer.cost
    ]
  );
}

export async function postOpeningStockToLedger(
  client: PoolClient,
  schema: string,
  tenantId: string,
  openingStockId: number
) {
  await assertNoExistingLedgerEntries(client, schema, "opening_stock", openingStockId);
  await assertNoExistingStockLayers(client, schema, "Opening", openingStockId);

  const headerRes = await client.query(
    `SELECT id, date FROM "${schema}".opening_stock WHERE id = $1`,
    [openingStockId]
  );
  if (!headerRes.rowCount) {
    throw new Error("Opening stock not found");
  }

  const txnDate = headerRes.rows[0].date;
  const itemsRes = await client.query(
    `
      SELECT id, qty, warehouse_id, locator_id, product_id
      FROM "${schema}".opening_stock_items
      WHERE opening_stock_id = $1
    `,
    [openingStockId]
  );

  for (const item of itemsRes.rows) {
    const qty = Number(item.qty || 0);
    if (qty <= 0) continue;
    await insertStockLedgerEntry(client, schema, {
      tenant_id: tenantId,
      txn_date: txnDate,
      txn_type: "Opening",
      ref_type: "opening_stock",
      ref_id: openingStockId,
      ref_line_id: Number(item.id),
      warehouse_id: Number(item.warehouse_id),
      locator_id: Number(item.locator_id),
      product_id: Number(item.product_id),
      qty_in: qty,
      qty_out: 0
    });
    await insertStockLayerEntry(client, schema, {
      tenant_id: tenantId,
      product_id: Number(item.product_id),
      warehouse_id: Number(item.warehouse_id),
      locator_id: Number(item.locator_id),
      source_txn_type: "Opening",
      source_ref_id: openingStockId,
      source_ref_line_id: Number(item.id),
      qty_remaining: qty,
      cost: 0
    });
  }
}

export async function postGrnToLedger(
  client: PoolClient,
  schema: string,
  tenantId: string,
  grnId: number
) {
  await assertNoExistingLedgerEntries(client, schema, "grn_header", grnId);
  await assertNoExistingStockLayers(client, schema, "GRN", grnId);

  const headerRes = await client.query(
    `SELECT id, grn_date FROM "${schema}".grn_header WHERE id = $1`,
    [grnId]
  );
  if (!headerRes.rowCount) {
    throw new Error("GRN not found");
  }

  const txnDate = headerRes.rows[0].grn_date;
  const detailsRes = await client.query(
    `
      SELECT id, qty, warehouse_id, locator_id, product_id
      FROM "${schema}".grn_detail
      WHERE grn_id = $1
    `,
    [grnId]
  );

  for (const row of detailsRes.rows) {
    const qty = Number(row.qty || 0);
    if (qty <= 0) continue;
    await insertStockLedgerEntry(client, schema, {
      tenant_id: tenantId,
      txn_date: txnDate,
      txn_type: "GRN",
      ref_type: "grn_header",
      ref_id: grnId,
      ref_line_id: Number(row.id),
      warehouse_id: Number(row.warehouse_id),
      locator_id: Number(row.locator_id),
      product_id: Number(row.product_id),
      qty_in: qty,
      qty_out: 0
    });
    await insertStockLayerEntry(client, schema, {
      tenant_id: tenantId,
      product_id: Number(row.product_id),
      warehouse_id: Number(row.warehouse_id),
      locator_id: Number(row.locator_id),
      source_txn_type: "GRN",
      source_ref_id: grnId,
      source_ref_line_id: Number(row.id),
      qty_remaining: qty,
      cost: 0
    });
  }
}

export async function postSalesToLedger(
  client: PoolClient,
  schema: string,
  tenantId: string,
  salesId: number
) {
  await assertNoExistingLedgerEntries(client, schema, "sales_header", salesId);

  const headerRes = await client.query(
    `SELECT id, sales_date FROM "${schema}".sales_header WHERE id = $1`,
    [salesId]
  );
  if (!headerRes.rowCount) {
    throw new Error("Sales document not found");
  }

  const txnDate = headerRes.rows[0].sales_date;
  const allocationsRes = await client.query(
    `
      SELECT
        sa.id,
        sa.qty_allocated,
        sd.id AS sales_detail_id,
        sd.product_id,
        sl.warehouse_id,
        sl.locator_id
      FROM "${schema}".sales_allocations sa
      JOIN "${schema}".sales_detail sd
        ON sd.id = sa.sales_detail_id
      JOIN "${schema}".stock_layers sl
        ON sl.id = sa.stock_layer_id
      WHERE sd.sales_id = $1
    `,
    [salesId]
  );

  for (const row of allocationsRes.rows) {
    const qty = Number(row.qty_allocated || 0);
    if (qty <= 0) continue;
    await insertStockLedgerEntry(client, schema, {
      tenant_id: tenantId,
      txn_date: txnDate,
      txn_type: "Sales",
      ref_type: "sales_header",
      ref_id: salesId,
      ref_line_id: Number(row.sales_detail_id),
      warehouse_id: Number(row.warehouse_id),
      locator_id: Number(row.locator_id),
      product_id: Number(row.product_id),
      qty_in: 0,
      qty_out: qty
    });
  }
}
