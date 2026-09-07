// src/lib/orderStateMachine.ts
import { PoolClient } from "pg";

export type OrderStatus =
  | "placed"
  | "confirmed"
  | "packed"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "payment_failed"
  | "returned"
  | "refunded";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "refunded"
  | "partial";

export type DeliveryStatus =
  | "not_shipped"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "rto";

export interface TransitionOptions {
  changedBy: string;
  note?: string;
}

/**
 * Custom typed error for invalid or rejected state transitions.
 */
export class OrderTransitionError extends Error {
  public readonly orderId: number;
  public readonly fromStatus: string;
  public readonly toStatus: string;
  public readonly reason: string;
  public readonly statusType: "order" | "payment" | "delivery";

  constructor(
    orderId: number,
    fromStatus: string,
    toStatus: string,
    reason: string,
    statusType: "order" | "payment" | "delivery" = "order"
  ) {
    super(
      `[Order #${orderId}] Cannot transition ${statusType}_status from '${fromStatus}' to '${toStatus}': ${reason}`
    );
    this.name = "OrderTransitionError";
    this.orderId = orderId;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.reason = reason;
    this.statusType = statusType;
    Object.setPrototypeOf(this, OrderTransitionError.prototype);
  }
}

/**
 * Adjacency map of legal Order Status transitions.
 *
 * Legal transitions:
 *  - placed            -> [confirmed, cancelled, payment_failed]
 *  - confirmed         -> [packed, cancelled]
 *  - packed            -> [shipped, cancelled]
 *  - shipped           -> [out_for_delivery, returned]
 *  - out_for_delivery  -> [delivered, packed, returned] (packed allowed for retry after failed delivery)
 *  - delivered         -> [returned]
 *  - payment_failed    -> [placed, cancelled]
 *  - returned          -> [refunded]
 *  - cancelled         -> [] (Terminal)
 *  - refunded          -> [] (Terminal)
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ["confirmed", "cancelled", "payment_failed"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "returned"],
  out_for_delivery: ["delivered", "packed", "returned"],
  delivered: ["returned"],
  payment_failed: ["placed", "cancelled"],
  returned: ["refunded"],
  cancelled: [],
  refunded: [],
} as const;

/**
 * Adjacency map of legal Payment Status transitions.
 *
 * Legal transitions:
 *  - pending     -> [authorized, paid, failed]
 *  - authorized  -> [paid, failed, refunded]
 *  - paid        -> [refunded, partial]
 *  - failed      -> [pending, paid]
 *  - partial     -> [paid, refunded]
 *  - refunded    -> [] (Terminal)
 */
export const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ["authorized", "paid", "failed"],
  authorized: ["paid", "failed", "refunded"],
  paid: ["refunded", "partial"],
  failed: ["pending", "paid"],
  partial: ["paid", "refunded"],
  refunded: [],
} as const;

/**
 * Adjacency map of legal Delivery Status transitions.
 *
 * Legal transitions:
 *  - not_shipped       -> [picked_up, in_transit]
 *  - picked_up         -> [in_transit, out_for_delivery, failed_delivery, rto]
 *  - in_transit        -> [out_for_delivery, failed_delivery, rto]
 *  - out_for_delivery  -> [delivered, failed_delivery, rto]
 *  - failed_delivery   -> [out_for_delivery, rto, not_shipped]
 *  - delivered         -> [rto]
 *  - rto               -> [] (Terminal)
 */
export const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  not_shipped: ["picked_up", "in_transit"],
  picked_up: ["in_transit", "out_for_delivery", "failed_delivery", "rto"],
  in_transit: ["out_for_delivery", "failed_delivery", "rto"],
  out_for_delivery: ["delivered", "failed_delivery", "rto"],
  failed_delivery: ["out_for_delivery", "rto", "not_shipped"],
  delivered: ["rto"],
  rto: [],
} as const;

/* ==========================================================================
   Order State Machine Implementation
   ========================================================================== */

class OrderStateMachine {
  /**
   * Transition order_status of an online order with row-level locking,
   * audit logging, and in-transaction side effects.
   */
  public async transitionOrderStatus(
    client: PoolClient,
    schema: string,
    orderId: number,
    toStatus: string,
    opts: TransitionOptions
  ): Promise<void> {
    const targetStatus = toStatus as OrderStatus;

    // 1. Row-level lock on the online_orders row
    const orderRes = await client.query(
      `SELECT id, order_no, order_status, payment_status, payment_method, delivery_status, total_amount
       FROM "${schema}".online_orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (!orderRes.rowCount) {
      throw new OrderTransitionError(
        orderId,
        "unknown",
        toStatus,
        "Order not found",
        "order"
      );
    }

    const order = orderRes.rows[0];
    const fromStatus = order.order_status as OrderStatus;

    // 2. Idempotent no-op guard
    if (fromStatus === targetStatus) {
      console.warn(
        `[OrderStateMachine] Order #${orderId} is already in order_status '${toStatus}'. Skipping transition.`
      );
      return;
    }

    // 3. Adjacency map validation
    const allowedTargets = ORDER_STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowedTargets.includes(targetStatus)) {
      throw new OrderTransitionError(
        orderId,
        fromStatus,
        toStatus,
        `Transition from '${fromStatus}' to '${toStatus}' is not allowed. Valid targets: [${allowedTargets.join(", ")}]`,
        "order"
      );
    }

    // 4. Execute pre-update verification and side effects
    await this.applyOrderSideEffects(
      client,
      schema,
      order,
      fromStatus,
      targetStatus,
      opts
    );

    // 5. Update online_orders
    await client.query(
      `UPDATE "${schema}".online_orders
       SET order_status = $1,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [targetStatus, opts.changedBy, orderId]
    );

    // 6. Insert audit history
    await client.query(
      `INSERT INTO "${schema}".online_order_status_history
         (order_id, status_type, from_status, to_status, changed_by, note, created_at)
       VALUES ($1, 'order', $2, $3, $4, $5, NOW())`,
      [orderId, fromStatus, targetStatus, opts.changedBy, opts.note || null]
    );
  }

  /**
   * Transition payment_status of an online order with row-level locking,
   * audit logging, and chained order status side effects.
   */
  public async transitionPaymentStatus(
    client: PoolClient,
    schema: string,
    orderId: number,
    toStatus: string,
    opts: TransitionOptions
  ): Promise<void> {
    const targetStatus = toStatus as PaymentStatus;

    // 1. Row-level lock on online_orders
    const orderRes = await client.query(
      `SELECT id, order_no, order_status, payment_status, payment_method
       FROM "${schema}".online_orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (!orderRes.rowCount) {
      throw new OrderTransitionError(
        orderId,
        "unknown",
        toStatus,
        "Order not found",
        "payment"
      );
    }

    const order = orderRes.rows[0];
    const fromStatus = order.payment_status as PaymentStatus;

    // 2. Idempotent no-op guard
    if (fromStatus === targetStatus) {
      console.warn(
        `[OrderStateMachine] Order #${orderId} is already in payment_status '${toStatus}'. Skipping transition.`
      );
      return;
    }

    // 3. Adjacency map validation
    const allowedTargets = PAYMENT_STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowedTargets.includes(targetStatus)) {
      throw new OrderTransitionError(
        orderId,
        fromStatus,
        toStatus,
        `Payment transition from '${fromStatus}' to '${toStatus}' is not allowed. Valid targets: [${allowedTargets.join(", ")}]`,
        "payment"
      );
    }

    // 4. Update online_orders
    await client.query(
      `UPDATE "${schema}".online_orders
       SET payment_status = $1,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [targetStatus, opts.changedBy, orderId]
    );

    // 5. Insert audit history
    await client.query(
      `INSERT INTO "${schema}".online_order_status_history
         (order_id, status_type, from_status, to_status, changed_by, note, created_at)
       VALUES ($1, 'payment', $2, $3, $4, $5, NOW())`,
      [orderId, fromStatus, targetStatus, opts.changedBy, opts.note || null]
    );

    // 6. Chained side effects:
    // - pending -> paid: if order_status is still 'placed', auto-confirm order
    if (targetStatus === "paid" && order.order_status === "placed") {
      await this.transitionOrderStatus(client, schema, orderId, "confirmed", {
        changedBy: opts.changedBy,
        note: opts.note || "Auto-confirmed via payment captured",
      });
    }

    // - -> failed: if order_status is 'placed', auto-set payment_failed
    if (targetStatus === "failed" && order.order_status === "placed") {
      await this.transitionOrderStatus(client, schema, orderId, "payment_failed", {
        changedBy: opts.changedBy,
        note: opts.note || "Auto-updated to payment_failed via payment failure",
      });
    }
  }

  /**
   * Transition delivery_status of an online order with row-level locking,
   * audit logging, and chained order status side effects.
   */
  public async transitionDeliveryStatus(
    client: PoolClient,
    schema: string,
    orderId: number,
    toStatus: string,
    opts: TransitionOptions
  ): Promise<void> {
    const targetStatus = toStatus as DeliveryStatus;

    // 1. Row-level lock on online_orders
    const orderRes = await client.query(
      `SELECT id, order_no, order_status, delivery_status, payment_method, payment_status
       FROM "${schema}".online_orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (!orderRes.rowCount) {
      throw new OrderTransitionError(
        orderId,
        "unknown",
        toStatus,
        "Order not found",
        "delivery"
      );
    }

    const order = orderRes.rows[0];
    const fromStatus = order.delivery_status as DeliveryStatus;

    // 2. Idempotent no-op guard
    if (fromStatus === targetStatus) {
      console.warn(
        `[OrderStateMachine] Order #${orderId} is already in delivery_status '${toStatus}'. Skipping transition.`
      );
      return;
    }

    // 3. Adjacency map validation
    const allowedTargets = DELIVERY_STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowedTargets.includes(targetStatus)) {
      throw new OrderTransitionError(
        orderId,
        fromStatus,
        toStatus,
        `Delivery transition from '${fromStatus}' to '${toStatus}' is not allowed. Valid targets: [${allowedTargets.join(", ")}]`,
        "delivery"
      );
    }

    // 4. Update online_orders
    await client.query(
      `UPDATE "${schema}".online_orders
       SET delivery_status = $1,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [targetStatus, opts.changedBy, orderId]
    );

    // 5. Insert audit history
    await client.query(
      `INSERT INTO "${schema}".online_order_status_history
         (order_id, status_type, from_status, to_status, changed_by, note, created_at)
       VALUES ($1, 'delivery', $2, $3, $4, $5, NOW())`,
      [orderId, fromStatus, targetStatus, opts.changedBy, opts.note || null]
    );

    // 6. Chained side effects:
    // - -> delivered: auto-call transitionOrderStatus(... 'delivered')
    if (targetStatus === "delivered" && order.order_status !== "delivered") {
      await this.transitionOrderStatus(client, schema, orderId, "delivered", {
        changedBy: opts.changedBy,
        note: opts.note || "Auto-delivered via courier delivery confirmation",
      });
    }

    // - -> out_for_delivery: mirror into online_orders.order_status if valid
    if (targetStatus === "out_for_delivery" && order.order_status === "shipped") {
      await this.transitionOrderStatus(client, schema, orderId, "out_for_delivery", {
        changedBy: opts.changedBy,
        note: opts.note || "Auto-updated order status to out_for_delivery",
      });
    }
  }

  /* --------------------------------------------------------------------------
     Private Side Effects Implementations
     -------------------------------------------------------------------------- */

  private async applyOrderSideEffects(
    client: PoolClient,
    schema: string,
    order: any,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    opts: TransitionOptions
  ): Promise<void> {
    const orderId = order.id;

    switch (toStatus) {
      case "confirmed": {
        // placed -> confirmed:
        // Only allowed if payment_status is 'paid' OR payment_method is 'cod'
        const isPaid = order.payment_status === "paid";
        const isCod = order.payment_method === "cod";

        if (!isPaid && !isCod) {
          throw new OrderTransitionError(
            orderId,
            fromStatus,
            toStatus,
            `Order can only be confirmed if payment_status is 'paid' or payment_method is 'cod' (Current payment_status: '${order.payment_status}', payment_method: '${order.payment_method}')`,
            "order"
          );
        }

        // Convert this order's 'held' inventory_reservations rows to 'converted' (permanent stock deduction)
        await client.query(
          `UPDATE "${schema}".inventory_reservations
           SET status = 'converted'
           WHERE order_ref_id = $1 AND status = 'held'`,
          [orderId]
        );
        break;
      }

      case "cancelled": {
        // -> cancelled:
        // 1. Release all 'held' reservations for this order back to 'released'
        await client.query(
          `UPDATE "${schema}".inventory_reservations
           SET status = 'released'
           WHERE order_ref_id = $1 AND status = 'held'`,
          [orderId]
        );

        // 2. If payment_status was 'paid', create an online_order_payments refund intent row (status 'created')
        if (order.payment_status === "paid") {
          await client.query(
            `INSERT INTO "${schema}".online_order_payments
               (order_id, gateway, amount, status, method, raw_response, created_at)
             VALUES ($1, 'razorpay', $2, 'created', $3, $4, NOW())`,
            [
              orderId,
              order.total_amount || 0,
              order.payment_method || "card",
              JSON.stringify({
                intent: "refund",
                reason: opts.note || "Order cancelled by staff/customer",
                initiated_by: opts.changedBy,
                order_total: order.total_amount,
              }),
            ]
          );
        }
        break;
      }

      case "packed": {
        // -> packed:
        // Verify all online_order_items have fulfillment_status = 'allocated' before allowing transition
        const itemsRes = await client.query(
          `SELECT id, product_name, fulfillment_status
           FROM "${schema}".online_order_items
           WHERE order_id = $1`,
          [orderId]
        );

        const unallocatedItems = itemsRes.rows.filter(
          (item) => item.fulfillment_status !== "allocated" && item.fulfillment_status !== "fulfilled"
        );

        if (unallocatedItems.length > 0) {
          const itemNames = unallocatedItems
            .map((i) => `"${i.product_name}" (${i.fulfillment_status})`)
            .join(", ");
          throw new OrderTransitionError(
            orderId,
            fromStatus,
            toStatus,
            `Cannot pack order: All items must have fulfillment_status = 'allocated'. Unallocated items: ${itemNames}`,
            "order"
          );
        }
        break;
      }

      case "shipped": {
        // -> shipped:
        // Require an online_order_deliveries row with a non-null awb_number to already exist
        const deliveryRes = await client.query(
          `SELECT id, awb_number, courier_partner
           FROM "${schema}".online_order_deliveries
           WHERE order_id = $1
           LIMIT 1`,
          [orderId]
        );

        if (!deliveryRes.rowCount || !deliveryRes.rows[0].awb_number) {
          throw new OrderTransitionError(
            orderId,
            fromStatus,
            toStatus,
            "Cannot ship order: A delivery shipment record with a valid non-null AWB number must be created prior to shipping.",
            "order"
          );
        }
        break;
      }

      case "delivered": {
        // -> delivered:
        // 1. Set online_order_deliveries.delivered_at = NOW()
        await client.query(
          `UPDATE "${schema}".online_order_deliveries
           SET delivered_at = NOW(),
               updated_at = NOW()
           WHERE order_id = $1`,
          [orderId]
        );

        // 2. If payment_method = 'cod', transition payment_status -> 'paid'
        if (order.payment_method === "cod" && order.payment_status !== "paid") {
          await this.transitionPaymentStatus(client, schema, orderId, "paid", {
            changedBy: opts.changedBy,
            note: opts.note || "COD payment collected upon delivery",
          });
        }
        break;
      }

      case "returned": {
        // -> returned:
        // Create reversal note (actual stock reversal happens in separate returns/QC flow)
        console.info(
          `[OrderStateMachine] Order #${orderId} marked as 'returned'. Physical stock QC & reversal should proceed in the returns workflow.`
        );
        break;
      }

      default:
        break;
    }
  }
}

// Export singleton instance methods for direct and clean functional consumption
const stateMachine = new OrderStateMachine();

export const transitionOrderStatus = (
  client: PoolClient,
  schema: string,
  orderId: number,
  toStatus: string,
  opts: TransitionOptions
): Promise<void> => stateMachine.transitionOrderStatus(client, schema, orderId, toStatus, opts);

export const transitionPaymentStatus = (
  client: PoolClient,
  schema: string,
  orderId: number,
  toStatus: string,
  opts: TransitionOptions
): Promise<void> => stateMachine.transitionPaymentStatus(client, schema, orderId, toStatus, opts);

export const transitionDeliveryStatus = (
  client: PoolClient,
  schema: string,
  orderId: number,
  toStatus: string,
  opts: TransitionOptions
): Promise<void> => stateMachine.transitionDeliveryStatus(client, schema, orderId, toStatus, opts);
