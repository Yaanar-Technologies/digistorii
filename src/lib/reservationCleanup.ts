import { PoolClient } from "pg";
import { transitionOrderStatus } from "@/lib/orderStateMachine";

/**
 * Finds inventory_reservations with status='held' AND expires_at < NOW(),
 * sets them to 'released', updates online_order_items fulfillment_status, and
 * transitions affected orders that are still 'placed' / 'pending' to 'cancelled'.
 *
 * @param client Open pg PoolClient within an active transaction or session.
 * @param schema Tenant schema name.
 * @returns Total count of expired reservations released.
 */
export async function releaseExpiredReservations(
  client: PoolClient,
  schema: string
): Promise<number> {
  // 1. Fetch expired held reservations
  const expiredRes = await client.query(
    `SELECT id, variant_id, qty_reserved, order_ref_id
     FROM "${schema}".inventory_reservations
     WHERE status = 'held' AND expires_at < NOW()`
  );

  if (expiredRes.rowCount === 0) {
    return 0;
  }

  const expiredReservations = expiredRes.rows;
  const expiredIds = expiredReservations.map((r) => r.id);
  const orderRefIds = Array.from(
    new Set(
      expiredReservations
        .map((r) => r.order_ref_id)
        .filter((id): id is number => typeof id === "number" || (typeof id === "string" && !isNaN(Number(id))))
        .map((id) => Number(id))
    )
  );

  // 2. Transition affected orders still in placed / pending to cancelled
  for (const orderId of orderRefIds) {
    const orderCheck = await client.query(
      `SELECT id, order_status, payment_status
       FROM "${schema}".online_orders
       WHERE id = $1`,
      [orderId]
    );

    if (
      orderCheck.rowCount &&
      orderCheck.rows[0].order_status === "placed" &&
      orderCheck.rows[0].payment_status === "pending"
    ) {
      try {
        await transitionOrderStatus(client, schema, orderId, "cancelled", {
          changedBy: "system",
          note: "reservation expired",
        });
      } catch (err) {
        console.error(
          `[ReservationCleanup] Failed to transition order #${orderId} to cancelled:`,
          err
        );
      }
    }
  }

  // 3. Mark remaining expired held reservations as released
  const updateRes = await client.query(
    `UPDATE "${schema}".inventory_reservations
     SET status = 'released'
     WHERE status = 'held' AND expires_at < NOW()`
  );

  // 4. Update online_order_items fulfillment_status to cancelled if they pointed to these reservations
  if (expiredIds.length > 0) {
    await client.query(
      `UPDATE "${schema}".online_order_items
       SET fulfillment_status = 'cancelled'
       WHERE reservation_id = ANY($1::bigint[])
         AND fulfillment_status = 'reserved'`,
      [expiredIds]
    );
  }

  return updateRes.rowCount || expiredIds.length;
}
