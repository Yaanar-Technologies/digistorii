import { PoolClient } from "pg";
import { pool } from "@/lib/db";

export function getReservationTimeoutMinutes(): number {
  const envVal = Number(process.env.RESERVATION_TIMEOUT_MINUTES);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 30;
}

export const RESERVATION_TTL_MINUTES = getReservationTimeoutMinutes();

/**
 * Expire unpaid stock reservations older than RESERVATION_TIMEOUT_MINUTES (default 30).
 * Overload 1: single schema (returns number of released reservations).
 * Overload 2: all schemas (returns summary object).
 */
export async function releaseExpiredReservations(
  client: PoolClient,
  schema: string
): Promise<number>;
export async function releaseExpiredReservations(): Promise<{
  releasedReservations: number;
  cancelledOrders: number;
}>;
export async function releaseExpiredReservations(
  clientParam?: PoolClient,
  schemaParam?: string
): Promise<number | { releasedReservations: number; cancelledOrders: number }> {
  const timeoutMinutes = getReservationTimeoutMinutes();

  // Handle single schema call
  if (clientParam && schemaParam) {
    let releasedCount = 0;
    const expiredOrdersRes = await clientParam.query(
      `SELECT id
       FROM "${schemaParam}".online_orders
       WHERE (payment_method IN ('online', 'prepaid', 'razorpay') OR payment_method <> 'cod')
         AND payment_status = 'pending'
         AND order_status = 'placed'
         AND created_at < NOW() - INTERVAL '${timeoutMinutes} minutes'`
    );

    for (const row of expiredOrdersRes.rows) {
      const orderId = Number(row.id);
      try {
        const resUpdate = await clientParam.query(
          `UPDATE "${schemaParam}".inventory_reservations
           SET status = 'released'
           WHERE order_ref_id = $1 AND status = 'held'`,
          [orderId]
        );

        await clientParam.query(
          `UPDATE "${schemaParam}".online_orders
           SET order_status = 'cancelled',
               payment_status = 'failed',
               updated_by = 'system:auto_cancel',
               updated_at = NOW()
           WHERE id = $1`,
          [orderId]
        );

        await clientParam.query(
          `INSERT INTO "${schemaParam}".online_order_status_history (
             order_id, status_type, from_status, to_status, changed_by, note, created_at
           )
           VALUES (
             $1, 'order', 'placed', 'cancelled', 'system:auto_cancel',
             $2, NOW()
           )`,
          [orderId, `Auto-cancelled: payment not completed within ${timeoutMinutes} minutes`]
        );

        await clientParam.query(
          `UPDATE "${schemaParam}".online_order_items
           SET fulfillment_status = 'cancelled'
           WHERE order_id = $1 AND fulfillment_status = 'reserved'`,
          [orderId]
        );

        releasedCount += resUpdate.rowCount || 0;
      } catch (err) {
        console.error(`[ReservationCleanup] Error cancelling order #${orderId}:`, err);
      }
    }
    return releasedCount;
  }

  // Handle all-schema call
  let totalReleasedReservations = 0;
  let totalCancelledOrders = 0;

  const mainClient = await pool.connect();
  try {
    const companiesRes = await mainClient.query(
      `SELECT schema_name FROM public.companies WHERE schema_name IS NOT NULL`
    );
    const schemas = companiesRes.rows.map((r) => r.schema_name).filter(Boolean);

    for (const schema of schemas) {
      const expiredOrdersRes = await mainClient.query(
        `SELECT id
         FROM "${schema}".online_orders
         WHERE (payment_method IN ('online', 'prepaid', 'razorpay') OR payment_method <> 'cod')
           AND payment_status = 'pending'
           AND order_status = 'placed'
           AND created_at < NOW() - INTERVAL '${timeoutMinutes} minutes'`
      );

      if (!expiredOrdersRes.rowCount) continue;

      for (const row of expiredOrdersRes.rows) {
        const orderId = Number(row.id);
        const orderClient = await pool.connect();
        try {
          await orderClient.query("BEGIN");

          const lockRes = await orderClient.query(
            `SELECT id, order_status, payment_status
             FROM "${schema}".online_orders
             WHERE id = $1
               AND (payment_method IN ('online', 'prepaid', 'razorpay') OR payment_method <> 'cod')
               AND payment_status = 'pending'
               AND order_status = 'placed'
               AND created_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
             FOR UPDATE SKIP LOCKED`,
            [orderId]
          );

          if (lockRes.rowCount === 0) {
            await orderClient.query("ROLLBACK");
            continue;
          }

          const resUpdate = await orderClient.query(
            `UPDATE "${schema}".inventory_reservations
             SET status = 'released'
             WHERE order_ref_id = $1 AND status = 'held'`,
            [orderId]
          );

          await orderClient.query(
            `UPDATE "${schema}".online_orders
             SET order_status = 'cancelled',
                 payment_status = 'failed',
                 updated_by = 'system:auto_cancel',
                 updated_at = NOW()
             WHERE id = $1`,
            [orderId]
          );

          await orderClient.query(
            `INSERT INTO "${schema}".online_order_status_history (
               order_id, status_type, from_status, to_status, changed_by, note, created_at
             )
             VALUES (
               $1, 'order', 'placed', 'cancelled', 'system:auto_cancel',
               $2, NOW()
             )`,
            [orderId, `Auto-cancelled: payment not completed within ${timeoutMinutes} minutes`]
          );

          await orderClient.query(
            `UPDATE "${schema}".online_order_items
             SET fulfillment_status = 'cancelled'
             WHERE order_id = $1 AND fulfillment_status = 'reserved'`,
            [orderId]
          );

          await orderClient.query("COMMIT");

          totalCancelledOrders += 1;
          totalReleasedReservations += resUpdate.rowCount || 0;
        } catch (err) {
          await orderClient.query("ROLLBACK");
          console.error(
            `[ReservationCleanup] Error processing auto-cancellation for order #${orderId} in schema ${schema}:`,
            err
          );
        } finally {
          orderClient.release();
        }
      }
    }
  } catch (err) {
    console.error("[ReservationCleanup] Failed to execute releaseExpiredReservations:", err);
  } finally {
    mainClient.release();
  }

  return {
    releasedReservations: totalReleasedReservations,
    cancelledOrders: totalCancelledOrders,
  };
}

/**
 * Abandoned cart cleanup: Delete cart_items not updated for 30 days across all tenant schemas.
 */
export async function abandonedCartCleanup(): Promise<number> {
  let totalDeletedItems = 0;
  const client = await pool.connect();
  try {
    const companiesRes = await client.query(
      `SELECT schema_name FROM public.companies WHERE schema_name IS NOT NULL`
    );
    const schemas = companiesRes.rows.map((r) => r.schema_name).filter(Boolean);

    for (const schema of schemas) {
      try {
        const delRes = await client.query(
          `DELETE FROM "${schema}".cart_items
           WHERE COALESCE(updated_at, created_at) < NOW() - INTERVAL '30 days'`
        );
        totalDeletedItems += delRes.rowCount || 0;
      } catch (err) {
        console.error(`[CartCleanup] Error cleaning cart_items for schema ${schema}:`, err);
      }
    }
  } catch (err) {
    console.error("[CartCleanup] Failed to execute abandonedCartCleanup:", err);
  } finally {
    client.release();
  }

  return totalDeletedItems;
}

/**
 * Helper to run all cleanup tasks and return aggregated results.
 */
export async function runAllCleanupTasks(): Promise<{
  releasedReservations: number;
  cancelledOrders: number;
  cleanedCartItems: number;
}> {
  const reservationResult = await releaseExpiredReservations();
  const cleanedCartItems = await abandonedCartCleanup();

  return {
    releasedReservations: reservationResult.releasedReservations,
    cancelledOrders: reservationResult.cancelledOrders,
    cleanedCartItems,
  };
}
