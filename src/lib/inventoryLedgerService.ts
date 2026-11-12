// src/lib/inventoryLedgerService.ts
import { PoolClient } from "pg";
import { insertStockLedgerEntry } from "./stockLedger";

export interface DepleteFifoResult {
  totalCogs: number;
  layersDepleted: Array<{ layerId: number; qtyAllocated: number; unitCost: number }>;
}

/**
 * Ensure database schema has necessary tables and constraints for ledger integration.
 */
export async function ensureLedgerAndNotesSchema(client: PoolClient, schema: string): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      -- Ensure inventory_reservations constraint supports 'consumed'
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reservations_status_check'
      ) THEN
        ALTER TABLE "${schema}".inventory_reservations DROP CONSTRAINT inventory_reservations_status_check;
      END IF;
      ALTER TABLE "${schema}".inventory_reservations ADD CONSTRAINT inventory_reservations_status_check
        CHECK (status IN ('held', 'converted', 'released', 'consumed'));
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END $$;

    ALTER TABLE "${schema}".online_order_items ADD COLUMN IF NOT EXISTS cogs_amount NUMERIC(12,2) DEFAULT 0;

    CREATE TABLE IF NOT EXISTS "${schema}".order_notes (
      id BIGSERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      order_id BIGINT NOT NULL REFERENCES "${schema}".online_orders(id) ON DELETE CASCADE,
      author_name VARCHAR(100) NOT NULL,
      author_type VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (author_type IN ('admin', 'staff', 'system', 'customer')),
      content TEXT NOT NULL,
      is_customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_order_notes_order
      ON "${schema}".order_notes(order_id, created_at);
  `);
}

/**
 * Release all locked reservations (held or converted) for an order back to available stock.
 * Resolves Problem D-10 (Zombie Stock on Cancellation).
 */
export async function releaseOrderReservations(
  client: PoolClient,
  schema: string,
  orderId: number
): Promise<number> {
  const res = await client.query(
    `UPDATE "${schema}".inventory_reservations
     SET status = 'released'
     WHERE order_ref_id = $1 AND status IN ('held', 'converted')
     RETURNING id`,
    [orderId]
  );
  return res.rowCount || 0;
}

/**
 * Post fulfilled online sales to the physical stock ledger and deplete FIFO layers (D-9, D-7).
 * Atomically marks the converted reservation as 'consumed' so available stock is never double-deducted.
 */
export async function postOnlineOrderToLedger(
  client: PoolClient,
  schema: string,
  orderId: number,
  tenantId: string
): Promise<void> {
  await ensureLedgerAndNotesSchema(client, schema);

  // 1. Check if order has already been posted to stock_ledger to prevent duplicate posting
  const existingLedgerRes = await client.query(
    `SELECT 1 FROM "${schema}".stock_ledger
     WHERE ref_type = 'online_orders' AND ref_id = $1
     LIMIT 1`,
    [orderId]
  );

  if (existingLedgerRes.rowCount && existingLedgerRes.rowCount > 0) {
    // Already posted to ledger; skip
    return;
  }

  // 2. Fetch order header for warehouse assignment
  const orderRes = await client.query(
    `SELECT id, warehouse_id, order_no
     FROM "${schema}".online_orders
     WHERE id = $1`,
    [orderId]
  );

  if (!orderRes.rowCount) {
    throw new Error(`Order #${orderId} not found.`);
  }

  let warehouseId = orderRes.rows[0].warehouse_id ? Number(orderRes.rows[0].warehouse_id) : null;

  // If no warehouse specified on order, find default warehouse
  if (!warehouseId) {
    const whRes = await client.query(
      `SELECT id FROM "${schema}".warehouses WHERE is_default = TRUE LIMIT 1`
    );
    if (whRes.rowCount) {
      warehouseId = Number(whRes.rows[0].id);
    } else {
      const anyWh = await client.query(`SELECT id FROM "${schema}".warehouses ORDER BY id ASC LIMIT 1`);
      if (anyWh.rowCount) {
        warehouseId = Number(anyWh.rows[0].id);
      }
    }
  }

  // Fetch a valid locator for this warehouse
  let defaultLocatorId = 1;
  if (warehouseId) {
    const locRes = await client.query(
      `SELECT id FROM "${schema}".locators ORDER BY id ASC LIMIT 1`
    );
    if (locRes.rowCount) {
      defaultLocatorId = Number(locRes.rows[0].id);
    }
  }

  // 3. Fetch order items
  const itemsRes = await client.query(
    `SELECT id, variant_id, qty, rate, reservation_id
     FROM "${schema}".online_order_items
     WHERE order_id = $1`,
    [orderId]
  );

  const todayStr = new Date().toISOString().split("T")[0];

  for (const item of itemsRes.rows) {
    const itemId = Number(item.id);
    const variantId = Number(item.variant_id);
    const qtyToDeplete = Number(item.qty || 0);
    if (qtyToDeplete <= 0) continue;

    let remainingNeeded = qtyToDeplete;
    let totalCogs = 0;
    let itemLocatorId = defaultLocatorId;

    // 4. Query active FIFO stock layers for this variant and warehouse
    if (warehouseId) {
      const layersRes = await client.query(
        `SELECT id, qty_remaining, cost, locator_id
         FROM "${schema}".stock_layers
         WHERE product_id = $1 AND warehouse_id = $2 AND qty_remaining > 0
         ORDER BY created_at ASC, id ASC
         FOR UPDATE`,
        [variantId, warehouseId]
      );

      for (const layer of layersRes.rows) {
        if (remainingNeeded <= 0) break;
        const layerId = Number(layer.id);
        const layerQty = Number(layer.qty_remaining || 0);
        const layerCost = Number(layer.cost || 0);
        itemLocatorId = Number(layer.locator_id) || itemLocatorId;

        const allocatedFromLayer = Math.min(layerQty, remainingNeeded);
        remainingNeeded -= allocatedFromLayer;
        totalCogs += allocatedFromLayer * layerCost;

        await client.query(
          `UPDATE "${schema}".stock_layers
           SET qty_remaining = qty_remaining - $1
           WHERE id = $2`,
          [allocatedFromLayer, layerId]
        );
      }
    }

    // 5. Insert debit entry into stock_ledger (txn_type: 'Sales', qty_out: qtyToDeplete)
    if (warehouseId) {
      await insertStockLedgerEntry(client, schema, {
        tenant_id: tenantId,
        txn_date: todayStr,
        txn_type: "Sales",
        ref_type: "online_orders",
        ref_id: orderId,
        ref_line_id: itemId,
        warehouse_id: warehouseId,
        locator_id: itemLocatorId,
        product_id: variantId,
        qty_in: 0,
        qty_out: qtyToDeplete,
      });
    }

    // 6. Record COGS on online_order_items
    await client.query(
      `UPDATE "${schema}".online_order_items
       SET cogs_amount = $1, fulfillment_status = 'fulfilled'
       WHERE id = $2`,
      [Number(totalCogs.toFixed(2)), itemId]
    );

    // 7. Transition the reservation from 'converted' to 'consumed'
    // This stops it from counting as active reservation, so available stock is decremented exactly once!
    if (item.reservation_id) {
      await client.query(
        `UPDATE "${schema}".inventory_reservations
         SET status = 'consumed'
         WHERE id = $1`,
        [Number(item.reservation_id)]
      );
    } else {
      await client.query(
        `UPDATE "${schema}".inventory_reservations
         SET status = 'consumed'
         WHERE order_ref_id = $1 AND variant_id = $2 AND status = 'converted'`,
        [orderId, variantId]
      );
    }
  }
}

/**
 * Restock returned items after QC inspection into stock_ledger and create a new FIFO layer.
 */
export async function postReturnRestockToLedger(
  client: PoolClient,
  schema: string,
  orderId: number,
  tenantId: string,
  variantId: number,
  quantity: number,
  unitCost: number = 0,
  warehouseId?: number
): Promise<void> {
  if (quantity <= 0) return;

  let whId = warehouseId;
  if (!whId) {
    const whRes = await client.query(`SELECT id FROM "${schema}".warehouses WHERE is_default = TRUE LIMIT 1`);
    whId = whRes.rowCount ? Number(whRes.rows[0].id) : 1;
  }

  let locatorId = 1;
  const locRes = await client.query(`SELECT id FROM "${schema}".locators ORDER BY id ASC LIMIT 1`);
  if (locRes.rowCount) locatorId = Number(locRes.rows[0].id);

  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Insert credit entry to stock_ledger
  await insertStockLedgerEntry(client, schema, {
    tenant_id: tenantId,
    txn_date: todayStr,
    txn_type: "Sales Return",
    ref_type: "online_orders",
    ref_id: orderId,
    ref_line_id: variantId,
    warehouse_id: whId,
    locator_id: locatorId,
    product_id: variantId,
    qty_in: quantity,
    qty_out: 0,
  });

  // 2. Create new FIFO layer
  await client.query(
    `INSERT INTO "${schema}".stock_layers (
       tenant_id, product_id, warehouse_id, locator_id,
       source_txn_type, source_ref_id, source_ref_line_id,
       qty_remaining, cost, created_at
     )
     VALUES ($1, $2, $3, $4, 'Opening', $5, $6, $7, $8, NOW())`,
    [tenantId, variantId, whId, locatorId, orderId, variantId, quantity, unitCost]
  );
}
