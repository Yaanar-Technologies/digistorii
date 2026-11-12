// src/lib/warehouseRouter.ts
import { PoolClient } from "pg";

export interface WarehouseRoutingResult {
  warehouseId: number;
  warehouseName: string;
  reason: "nearest" | "stock_availability" | "default";
}

/**
 * Determine the optimal fulfillment warehouse for an online order based on:
 * 1. Pincode match (Nearest)
 * 2. Full stock availability (Single-source fulfillment)
 * 3. Default company fulfillment hub (Fallback)
 */
export async function assignOrderWarehouse(
  client: PoolClient,
  schema: string,
  destinationPincode: string | null,
  variantIds: number[] = []
): Promise<WarehouseRoutingResult> {
  const cleanPincode = (destinationPincode || "").trim();

  // Strategy 1: Check nearest warehouse matching customer destination pincode prefix or exact
  if (cleanPincode.length >= 3) {
    const pinMatchRes = await client.query(
      `SELECT id, name, pincode
       FROM "${schema}".warehouses
       WHERE pincode IS NOT NULL AND (pincode = $1 OR pincode LIKE $2)
       ORDER BY (CASE WHEN pincode = $1 THEN 1 ELSE 2 END)
       LIMIT 1`,
      [cleanPincode, `${cleanPincode.slice(0, 3)}%`]
    );

    if (pinMatchRes.rowCount && pinMatchRes.rows[0]) {
      return {
        warehouseId: Number(pinMatchRes.rows[0].id),
        warehouseName: pinMatchRes.rows[0].name,
        reason: "nearest",
      };
    }
  }

  // Strategy 2: Check warehouse with sufficient single-source stock for all items
  if (variantIds.length > 0) {
    const stockWhRes = await client.query(
      `SELECT cs.warehouse_id, w.name AS warehouse_name, COUNT(DISTINCT cs.product_id) AS matching_variants
       FROM "${schema}".current_stock cs
       JOIN "${schema}".warehouses w ON w.id = cs.warehouse_id
       WHERE cs.product_id = ANY($1::bigint[]) AND cs.current_stock > 0
       GROUP BY cs.warehouse_id, w.name
       HAVING COUNT(DISTINCT cs.product_id) = $2
       LIMIT 1`,
      [variantIds, variantIds.length]
    );

    if (stockWhRes.rowCount && stockWhRes.rows[0]) {
      return {
        warehouseId: Number(stockWhRes.rows[0].warehouse_id),
        warehouseName: stockWhRes.rows[0].warehouse_name,
        reason: "stock_availability",
      };
    }
  }

  // Strategy 3: Default company fulfillment hub
  const defaultRes = await client.query(
    `SELECT id, name
     FROM "${schema}".warehouses
     WHERE is_default = TRUE
     LIMIT 1`
  );

  if (defaultRes.rowCount && defaultRes.rows[0]) {
    return {
      warehouseId: Number(defaultRes.rows[0].id),
      warehouseName: defaultRes.rows[0].name,
      reason: "default",
    };
  }

  // Fallback to first available warehouse
  const anyRes = await client.query(
    `SELECT id, name
     FROM "${schema}".warehouses
     ORDER BY id ASC
     LIMIT 1`
  );

  if (anyRes.rowCount && anyRes.rows[0]) {
    return {
      warehouseId: Number(anyRes.rows[0].id),
      warehouseName: anyRes.rows[0].name,
      reason: "default",
    };
  }

  return {
    warehouseId: 1,
    warehouseName: "Primary Warehouse",
    reason: "default",
  };
}
