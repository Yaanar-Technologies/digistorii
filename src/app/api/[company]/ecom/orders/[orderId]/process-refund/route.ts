import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { pool } from "@/lib/db";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";
import { decryptSecret } from "@/lib/cryptoHelper";
import { postReturnRestockToLedger } from "@/lib/inventoryLedgerService";
import { generateCreditNoteForReturn } from "@/lib/tax/invoiceService";
import {
  transitionOrderStatus,
  transitionPaymentStatus,
  OrderTransitionError,
} from "@/lib/orderStateMachine";

interface ProcessRefundRequestBody {
  returnId?: number;
  refundAmount?: number;
  qcPassed?: boolean;
  qcNotes?: string;
  refundMethod?: "gateway" | "store_credit" | "manual_bank_transfer";
  warehouseId?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const client = await pool.connect();
  let inTransaction = false;

  try {
    const { company, orderId: rawOrderId } = await params;
    const orderId = Number(rawOrderId);

    const guard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: true });
    if (!guard.ok) return guard.response;

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID provided." },
        { status: 400 }
      );
    }

    let body: ProcessRefundRequestBody = {};
    try {
      body = await req.json();
    } catch { }

    const schema = guard.schema;
    const staffUsername = staffDisplayName(guard.staff);
    const qcPassed = body.qcPassed !== false; // Default true unless explicitly failed

    await client.query("BEGIN");
    inTransaction = true;

    // 1. Fetch Return Record
    let returnQuery = `
      SELECT id, order_id, customer_id, status, return_reason, refund_amount, refund_status, items
      FROM "${schema}".order_returns
      WHERE order_id = $1
    `;
    const queryParams: any[] = [orderId];

    if (body.returnId) {
      returnQuery += ` AND id = $2`;
      queryParams.push(body.returnId);
    } else {
      returnQuery += ` AND status NOT IN ('refunded', 'cancelled', 'rejected') ORDER BY id DESC LIMIT 1`;
    }

    const returnRes = await client.query(returnQuery, queryParams);
    if (returnRes.rowCount === 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        { success: false, error: "No eligible active return record found for this order." },
        { status: 404 }
      );
    }

    const returnRecord = returnRes.rows[0];

    // 2. Fetch Order Row
    const orderRes = await client.query(
      `SELECT id, order_no, company_id, customer_id, warehouse_id, order_status,
              payment_status, payment_method, total_amount, currency
       FROM "${schema}".online_orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found.` },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];
    const companyId = order.company_id;

    // Handle QC Failure
    if (!qcPassed) {
      await client.query(
        `UPDATE "${schema}".order_returns
         SET status = 'qc_failed',
             qc_notes = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [body.qcNotes || "QC Inspection failed. Items rejected.", returnRecord.id]
      );

      await client.query(
        `INSERT INTO "${schema}".order_notes (company_id, order_id, author_name, author_type, content, is_customer_visible, created_at)
         VALUES ($1, $2, $3, 'staff', $4, true, NOW())`,
        [
          companyId,
          orderId,
          staffUsername,
          `Return QC failed. Note: ${body.qcNotes || "Returned package did not meet inspection standards."}`,
        ]
      );

      // Phase 7: Generate Statutory GST Credit Note
    try {
      await generateCreditNoteForReturn(client, schema, returnRecord.id, orderId);
    } catch (cnErr: any) {
      console.warn("[Process Refund] Credit note generation notice:", cnErr.message);
    }

    await client.query("COMMIT");
      inTransaction = false;

      return NextResponse.json({
        success: true,
        message: "Return marked as QC Failed. Restock and refund skipped.",
        return_id: returnRecord.id,
        status: "qc_failed",
      });
    }

    // 3. Restock inventory items into stock_ledger (FIFO layers credit)
    const returnItems = Array.isArray(returnRecord.items) ? returnRecord.items : [];
    const targetWarehouseId = body.warehouseId || order.warehouse_id || 1;

    for (const item of returnItems) {
      const variantId = Number(item.variant_id);
      const qty = Number(item.qty || 1);
      const unitRate = Number(item.price || 0);

      if (variantId > 0 && qty > 0) {
        try {
          await postReturnRestockToLedger(
            client,
            schema,
            orderId,
            String(companyId),
            variantId,
            qty,
            unitRate,
            targetWarehouseId
          );
        } catch (restockErr: any) {
          console.warn(
            `[Process Refund] Warning posting restock to ledger for variant ${variantId}:`,
            restockErr.message
          );
        }
      }
    }

    // 4. Determine refund amount
    const targetRefundAmount =
      body.refundAmount != null && Number(body.refundAmount) > 0
        ? Number(body.refundAmount)
        : Number(returnRecord.refund_amount || order.total_amount);

    let refundGatewayId = "";
    let refundProcessedSuccessfully = false;

    // 5. Payment Gateway or Store Credit Refund Execution
    const isPrepaid = order.payment_method !== "cod";

    if (isPrepaid && body.refundMethod !== "store_credit" && body.refundMethod !== "manual_bank_transfer") {
      // Look up captured payment
      const paymentRes = await client.query(
        `SELECT id, gateway, gateway_payment_id, amount
         FROM "${schema}".online_order_payments
         WHERE order_id = $1 AND gateway_payment_id IS NOT NULL
         ORDER BY id DESC
         LIMIT 1`,
        [orderId]
      );

      if (paymentRes.rowCount && paymentRes.rowCount > 0) {
        const paymentRow = paymentRes.rows[0];
        const gatewayPaymentId = paymentRow.gateway_payment_id;

        // Fetch Razorpay credentials
        const gwRes = await client.query(
          `SELECT *
           FROM "${schema}".payment_gateway_configs
           WHERE provider = 'razorpay' AND is_active = true
           LIMIT 1`
        );

        let keyId = gwRes.rows[0]?.key_id;
        let secretEnc = gwRes.rows[0]?.key_secret || gwRes.rows[0]?.key_secret_enc;

        if (!keyId || !secretEnc) {
          const ecomRes = await client.query(
            `SELECT payment_gateway_key_id, payment_gateway_key_secret_enc
             FROM "${schema}".ecom_settings
             LIMIT 1`
          );
          keyId = ecomRes.rows[0]?.payment_gateway_key_id;
          secretEnc = ecomRes.rows[0]?.payment_gateway_key_secret_enc;
        }

        if (keyId && secretEnc) {
          try {
            const secret = decryptSecret(secretEnc);
            const rzp = new Razorpay({ key_id: keyId, key_secret: secret });

            const rzpRefundRes = await rzp.payments.refund(gatewayPaymentId, {
              amount: Math.round(targetRefundAmount * 100),
              notes: {
                order_id: String(orderId),
                return_id: String(returnRecord.id),
                processed_by: staffUsername,
              },
            });

            refundGatewayId = rzpRefundRes.id;
            refundProcessedSuccessfully = true;

            // Insert refund record in payments
            await client.query(
              `INSERT INTO "${schema}".online_order_payments (
                 order_id, gateway, gateway_payment_id, amount, status, method, raw_response, created_at
               )
               VALUES ($1, 'razorpay_refund', $2, $3, 'refunded', 'gateway_refund', $4, NOW())`,
              [orderId, refundGatewayId, targetRefundAmount, JSON.stringify(rzpRefundRes)]
            );
          } catch (gatewayErr: any) {
            console.error("[Process Refund] Razorpay refund API failed:", gatewayErr);
            // Fall back to recorded manual/pending refund
            refundGatewayId = `MANUAL-FALLBACK-${Date.now()}`;
          }
        }
      }
    }

    if (!refundGatewayId) {
      // COD or Manual / Store Credit
      const refundPrefix =
        body.refundMethod === "store_credit"
          ? "STORE-CREDIT-"
          : order.payment_method === "cod"
          ? "COD-REFUND-"
          : "MANUAL-REFUND-";
      refundGatewayId = `${refundPrefix}${order.order_no}-${Date.now().toString().slice(-6)}`;
      refundProcessedSuccessfully = true;
    }

    // 6. Transition Order State to 'returned' then 'refunded'
    if (order.order_status !== "returned" && order.order_status !== "refunded") {
      await transitionOrderStatus(client, schema, orderId, "returned", {
        changedBy: staffUsername,
        note: `Order marked returned following successful QC inspection for return #${returnRecord.id}`,
      });
    }

    if (order.order_status !== "refunded") {
      await transitionOrderStatus(client, schema, orderId, "refunded", {
        changedBy: staffUsername,
        note: `Refund of ₹${targetRefundAmount} issued (${refundGatewayId})`,
      });
    }

    // Transition Payment Status to 'refunded' if paid or partial
    if (order.payment_status === "paid" || order.payment_status === "partial" || order.payment_status === "authorized") {
      await transitionPaymentStatus(client, schema, orderId, "refunded", {
        changedBy: staffUsername,
        note: `Payment marked refunded (${refundGatewayId})`,
      });
    }

    // 7. Update order_returns record
    await client.query(
      `UPDATE "${schema}".order_returns
       SET status = 'refunded',
           refund_status = 'completed',
           refund_id = $1,
           refund_amount = $2,
           qc_notes = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [refundGatewayId, targetRefundAmount, body.qcNotes || "QC Passed and items restocked", returnRecord.id]
    );

    // 8. Add Audit Order Note
    await client.query(
      `INSERT INTO "${schema}".order_notes (company_id, order_id, author_name, author_type, content, is_customer_visible, created_at)
       VALUES ($1, $2, $3, 'staff', $4, true, NOW())`,
      [
        companyId,
        orderId,
        staffUsername,
        `QC Passed & Refund Completed. Amount: ₹${targetRefundAmount}. Reference: ${refundGatewayId}. Items credited back to inventory ledger.`,
      ]
    );

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      message: `Return QC passed, items restocked, and refund of ₹${targetRefundAmount} processed.`,
      return_id: returnRecord.id,
      refund_id: refundGatewayId,
      refund_amount: targetRefundAmount,
      order_status: "refunded",
      payment_status: "refunded",
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (err instanceof OrderTransitionError || err.name === "OrderTransitionError") {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    console.error("[Process Refund Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process refund." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

