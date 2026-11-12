import { PoolClient, Pool } from "pg";
import Razorpay from "razorpay";
import { decryptSecret } from "@/lib/cryptoHelper";

type Queryable = Pool | PoolClient;

export interface ExecuteRefundParams {
  orderId: number;
  companyId: number;
  refundAmount: number;
  reason?: string;
  returnId?: number;
  paymentId?: number;
  staffName?: string;
}

export interface ExecuteRefundResult {
  success: boolean;
  gatewayRefundId?: string;
  status: "SUCCESS" | "FAILED" | "INITIATED";
  error?: string;
}

export async function executeOrderRefund(
  client: Queryable,
  schema: string,
  params: ExecuteRefundParams
): Promise<ExecuteRefundResult> {
  const { orderId, companyId, refundAmount, reason, returnId, staffName } = params;

  // 1. Fetch captured payment row
  const paymentRes = await client.query(
    `SELECT id, gateway, gateway_payment_id, amount, status
     FROM "${schema}".online_order_payments
     WHERE order_id = $1 AND gateway_payment_id IS NOT NULL AND status IN ('captured', 'paid')
     ORDER BY id DESC
     LIMIT 1`,
    [orderId]
  );

  const paymentRow = paymentRes.rowCount ? paymentRes.rows[0] : null;

  // 2. Fetch Razorpay credentials
  let keyId = "";
  let keySecret = "";

  const gwRes = await client.query(
    `SELECT key_id, key_secret_enc, is_live_mode, live_key_id, live_key_secret_enc, test_key_id, test_key_secret_enc
     FROM "${schema}".payment_gateway_configs
     WHERE provider = 'razorpay' AND is_active = true
     LIMIT 1`
  );

  if (gwRes.rowCount && gwRes.rowCount > 0) {
    const gw = gwRes.rows[0];
    if (gw.is_live_mode && gw.live_key_id && gw.live_key_secret_enc) {
      keyId = gw.live_key_id;
      try {
        keySecret = decryptSecret(gw.live_key_secret_enc);
      } catch {}
    } else if (gw.test_key_id && gw.test_key_secret_enc) {
      keyId = gw.test_key_id;
      try {
        keySecret = decryptSecret(gw.test_key_secret_enc);
      } catch {}
    } else if (gw.key_id && gw.key_secret_enc) {
      keyId = gw.key_id;
      try {
        keySecret = decryptSecret(gw.key_secret_enc);
      } catch {}
    }
  }

  // Fallback to ecom_settings
  if (!keyId || !keySecret) {
    const ecomRes = await client.query(
      `SELECT payment_gateway_key_id, payment_gateway_key_secret_enc
       FROM "${schema}".ecom_settings
       LIMIT 1`
    );
    if (ecomRes.rowCount && ecomRes.rowCount > 0) {
      keyId = ecomRes.rows[0].payment_gateway_key_id || "";
      if (ecomRes.rows[0].payment_gateway_key_secret_enc) {
        try {
          keySecret = decryptSecret(ecomRes.rows[0].payment_gateway_key_secret_enc);
        } catch {}
      }
    }
  }

  // If Razorpay gateway credentials and payment id are available, dispatch API call
  if (paymentRow?.gateway_payment_id && keyId && keySecret) {
    try {
      const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const amountInPaise = Math.round(refundAmount * 100);

      const notesObj: Record<string, string> = {
        order_id: String(orderId),
        reason: reason || "Return refund",
        processed_by: staffName || "System",
      };
      if (returnId) {
        notesObj.return_id = String(returnId);
      }

      const rzpRefund: any = await (rzp.payments as any).refund(paymentRow.gateway_payment_id, {
        amount: amountInPaise,
        notes: notesObj,
      });

      const gatewayRefundId = String(rzpRefund?.id || `RZP-REFUND-${Date.now()}`);

      // Log in payment_refunds
      await client.query(
        `INSERT INTO "${schema}".payment_refunds (
           company_id, order_id, payment_id, gateway_refund_id,
           amount, status, notes, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6, NOW(), NOW())`,
        [
          companyId,
          orderId,
          paymentRow.id,
          gatewayRefundId,
          refundAmount,
          reason || "Partial/Full return refund processed via Razorpay",
        ]
      );

      return {
        success: true,
        gatewayRefundId,
        status: "SUCCESS",
      };
    } catch (apiErr: any) {
      console.error("[Refund Service] Razorpay refund API failed:", apiErr);

      // Record Failed Refund
      await client.query(
        `INSERT INTO "${schema}".payment_refunds (
           company_id, order_id, payment_id, gateway_refund_id,
           amount, status, failure_reason, notes, created_at, updated_at
         )
         VALUES ($1, $2, $3, NULL, $4, 'FAILED', $5, $6, NOW(), NOW())`,
        [
          companyId,
          orderId,
          paymentRow?.id || null,
          refundAmount,
          apiErr.message || "Gateway API error",
          reason || "Attempted online refund",
        ]
      );

      // Raise Critical Operational Alert
      await client.query(
        `INSERT INTO "${schema}".admin_operational_alerts (
           company_id, alert_type, severity, title, message, payload, is_resolved, created_at
         )
         VALUES ($1, 'REFUND_FAILURE', 'CRITICAL', $2, $3, $4, FALSE, NOW())`,
        [
          companyId,
          `Refund Failed for Order #${orderId}`,
          `Automatic gateway refund of ₹${refundAmount} failed: ${apiErr.message || "Unknown error"}. Manual payout required.`,
          JSON.stringify({ orderId, returnId, error: apiErr.message, amount: refundAmount }),
        ]
      );

      return {
        success: false,
        status: "FAILED",
        error: apiErr.message || "Refund API invocation failed",
      };
    }
  }

  // Non-prepaid or offline manual refund recording (e.g. COD / Bank Transfer)
  const manualRefundId = `MANUAL-REFUND-${orderId}-${Date.now().toString().slice(-6)}`;
  await client.query(
    `INSERT INTO "${schema}".payment_refunds (
       company_id, order_id, payment_id, gateway_refund_id,
       amount, status, notes, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6, NOW(), NOW())`,
    [
      companyId,
      orderId,
      paymentRow?.id || null,
      manualRefundId,
      refundAmount,
      reason || "Manual / Offline / COD credit refund recorded",
    ]
  );

  return {
    success: true,
    gatewayRefundId: manualRefundId,
    status: "SUCCESS",
  };
}
