// This webhook is the sole mutator and single source of truth for payment_status.
// Client-side verify route is read-only and polls order status.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { decryptSecret } from "@/lib/cryptoHelper";
import { transitionPaymentStatus } from "@/lib/orderStateMachine";
import { generateTaxInvoiceForOrder } from "@/lib/tax/invoiceService";
import { autoFulfillOrder } from "@/lib/fulfillment/autoFulfill";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  // 1. Read the raw request body as text BEFORE any JSON parsing (Razorpay signature requires raw payload)
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to read request body" },
      { status: 400 }
    );
  }

  // 2. Resolve company + schema from URL param
  const { company } = await params;
  let schema = "";
  try {
    const tenantInfo = await getTenantSchemaByCompany(company);
    schema = tenantInfo.schema;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Tenant schema could not be resolved for '${company}'` },
      { status: 404 }
    );
  }

  const client = await pool.connect();

  try {
    // 3. Load webhook secret from payment_gateway_configs or ecom_settings
    let webhookSecretEnc = "";
    const gwRes = await client.query(
      `SELECT *
       FROM "${schema}".payment_gateway_configs
       WHERE provider = 'razorpay' AND is_active = true
       LIMIT 1`
    );

    if (gwRes.rowCount && gwRes.rowCount > 0) {
      const gw = gwRes.rows[0];
      webhookSecretEnc = gw.is_live_mode
        ? gw.live_webhook_secret_enc || gw.webhook_secret
        : gw.test_webhook_secret_enc || gw.webhook_secret;
    }

    if (!webhookSecretEnc) {
      const settingsRes = await client.query(
        `SELECT gateway_webhook_secret_enc
         FROM "${schema}".ecom_settings
         LIMIT 1`
      );
      webhookSecretEnc = settingsRes.rows[0]?.gateway_webhook_secret_enc;
    }

    if (!webhookSecretEnc) {
      console.warn(
        `[Razorpay Webhook] Webhook secret is not configured for company '${company}'. Rejecting request.`
      );
      return NextResponse.json(
        { success: false, error: "Webhook secret not configured for this tenant" },
        { status: 400 }
      );
    }

    let decryptedWebhookSecret = "";
    try {
      decryptedWebhookSecret = decryptSecret(webhookSecretEnc);
    } catch (err) {
      decryptedWebhookSecret = webhookSecretEnc; // In case stored as plain text
    }

    // 4. Verify 'x-razorpay-signature' header against raw body
    const receivedSignature = req.headers.get("x-razorpay-signature");
    if (!receivedSignature) {
      return NextResponse.json(
        { success: false, error: "Missing x-razorpay-signature header" },
        { status: 400 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", decryptedWebhookSecret)
      .update(rawBody)
      .digest("hex");

    const isSignatureValid =
      receivedSignature.length === expectedSignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(receivedSignature, "utf8"),
        Buffer.from(expectedSignature, "utf8")
      );

    if (!isSignatureValid) {
      console.warn(`[Razorpay Webhook] Invalid signature received for company '${company}'.`);
      return NextResponse.json(
        { success: false, error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    // 5. Parse verified payload
    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ status: "ok", message: "Invalid JSON ignored" }, { status: 200 });
    }

    const eventId = payload?.event_id || payload?.id || `evt_${receivedSignature.slice(0, 32)}`;
    const eventName = payload?.event;

    // 6. Strict Webhook Idempotency Check
    const eventCheckRes = await client.query(
      `SELECT id FROM "${schema}".payment_webhook_events WHERE event_id = $1 LIMIT 1`,
      [eventId]
    );

    if (eventCheckRes.rowCount && eventCheckRes.rowCount > 0) {
      return NextResponse.json(
        { status: "ok", message: "Event already processed (idempotent duplicate)" },
        { status: 200 }
      );
    }

    // 7. Process Event Payloads
    try {
      const paymentEntity = payload?.payload?.payment?.entity;
      const refundEntity = payload?.payload?.refund?.entity;

      const rzpOrderId: string | undefined = paymentEntity?.order_id;
      const rzpPaymentId: string | undefined = paymentEntity?.id || refundEntity?.payment_id;

      if (eventName === "payment.authorized") {
        if (rzpOrderId || rzpPaymentId) {
          const payRes = await client.query(
            `SELECT id, order_id, status, gateway_payment_id
             FROM "${schema}".online_order_payments
             WHERE gateway_order_id = $1 OR gateway_payment_id = $2
             LIMIT 1`,
            [rzpOrderId || null, rzpPaymentId || null]
          );

          if (payRes.rowCount) {
            const paymentRow = payRes.rows[0];
            await client.query(
              `UPDATE "${schema}".online_order_payments
               SET gateway_payment_id = COALESCE($1, gateway_payment_id),
                   status = 'authorized',
                   raw_response = $2
               WHERE id = $3`,
              [rzpPaymentId || null, JSON.stringify(payload), paymentRow.id]
            );

            await transitionPaymentStatus(client, schema, paymentRow.order_id, "authorized", {
              changedBy: "webhook:razorpay",
              note: `Authorized via Razorpay payment ID: ${rzpPaymentId || "N/A"}`,
            });
          }
        }
      } else if (eventName === "payment.captured") {
        if (rzpOrderId || rzpPaymentId) {
          const payRes = await client.query(
            `SELECT id, order_id, status, gateway_payment_id
             FROM "${schema}".online_order_payments
             WHERE gateway_order_id = $1 OR gateway_payment_id = $2
             LIMIT 1`,
            [rzpOrderId || null, rzpPaymentId || null]
          );

          if (payRes.rowCount) {
            const paymentRow = payRes.rows[0];
            const orderId = Number(paymentRow.order_id);

            await client.query("BEGIN");

            await client.query(
              `UPDATE "${schema}".online_order_payments
               SET gateway_payment_id = COALESCE($1, gateway_payment_id),
                   status = 'captured',
                   raw_response = $2
               WHERE id = $3`,
              [rzpPaymentId || null, JSON.stringify(payload), paymentRow.id]
            );

            // Chained state machine handles transition to paid & order to confirmed + converts reservations
            await transitionPaymentStatus(client, schema, orderId, "paid", {
              changedBy: "webhook:razorpay",
              note: `Captured via Razorpay payment ID: ${rzpPaymentId || "N/A"}`,
            });

            // Idempotently clear ordered cart items for this customer
            await client.query(
              `DELETE FROM "${schema}".cart_items
               WHERE customer_id = (SELECT customer_id FROM "${schema}".online_orders WHERE id = $1)
                 AND variant_id IN (
                   SELECT variant_id FROM "${schema}".online_order_items WHERE order_id = $1
                 )`,
              [orderId]
            );

            // Statutory GST Tax Invoice Generation
            try {
              await generateTaxInvoiceForOrder(client, schema, orderId);
            } catch (invErr: any) {
              console.warn(
                `[Razorpay Webhook] Auto invoice generation notice for order #${orderId}:`,
                invErr.message
              );
            }

            await client.query("COMMIT");

            // Trigger Asynchronous Zero-Touch Fulfillment Pipeline (Phase B)
            autoFulfillOrder(schema, orderId, { trigger: "webhook:razorpay" }).catch((fErr) => {
              console.warn(
                `[Razorpay Webhook] Auto-fulfillment notice for order #${orderId}:`,
                fErr?.message
              );
            });
          }
        }
      } else if (eventName === "payment.failed") {
        if (rzpOrderId || rzpPaymentId) {
          const payRes = await client.query(
            `SELECT id, order_id, status, gateway_payment_id
             FROM "${schema}".online_order_payments
             WHERE gateway_order_id = $1 OR gateway_payment_id = $2
             LIMIT 1`,
            [rzpOrderId || null, rzpPaymentId || null]
          );

          if (payRes.rowCount) {
            const paymentRow = payRes.rows[0];
            const errorDesc =
              paymentEntity?.error_description ||
              paymentEntity?.error_reason ||
              "Payment failed at Razorpay";

            await client.query(
              `UPDATE "${schema}".online_order_payments
               SET gateway_payment_id = COALESCE($1, gateway_payment_id),
                   status = 'failed',
                   raw_response = $2
               WHERE id = $3`,
              [rzpPaymentId || null, JSON.stringify(payload), paymentRow.id]
            );

            await transitionPaymentStatus(client, schema, paymentRow.order_id, "failed", {
              changedBy: "webhook:razorpay",
              note: `Failed: ${errorDesc}`,
            });
          }
        }
      } else if (eventName === "refund.processed") {
        const refundPaymentId = refundEntity?.payment_id || rzpPaymentId;
        const refundId = refundEntity?.id;
        const refundAmount = Number(refundEntity?.amount || 0) / 100;

        if (refundPaymentId || rzpOrderId) {
          const payRes = await client.query(
            `SELECT id, order_id, status
             FROM "${schema}".online_order_payments
             WHERE gateway_payment_id = $1 OR gateway_order_id = $2
             LIMIT 1`,
            [refundPaymentId || null, rzpOrderId || null]
          );

          if (payRes.rowCount) {
            const paymentRow = payRes.rows[0];

            await client.query(
              `UPDATE "${schema}".online_order_payments
               SET status = 'refunded',
                   raw_response = $1
               WHERE id = $2`,
              [JSON.stringify(payload), paymentRow.id]
            );

            await client.query(
              `INSERT INTO "${schema}".payment_refunds (
                 order_id, payment_id, gateway_refund_id, amount, status, notes, created_at, updated_at
               )
               VALUES ($1, $2, $3, $4, 'SUCCESS', 'Refund confirmed by Razorpay webhook', NOW(), NOW())
               ON CONFLICT DO NOTHING`,
              [paymentRow.order_id, paymentRow.id, refundId || null, refundAmount]
            );

            await transitionPaymentStatus(client, schema, paymentRow.order_id, "refunded", {
              changedBy: "webhook:razorpay",
              note: `Refund processed: ${refundId || "N/A"}`,
            });
          }
        }
      } else if (eventName === "refund.failed") {
        const refundPaymentId = refundEntity?.payment_id || rzpPaymentId;
        const refundId = refundEntity?.id;
        const errorDesc = refundEntity?.error_description || "Gateway refund processing failed";

        if (refundPaymentId || rzpOrderId) {
          const payRes = await client.query(
            `SELECT id, order_id
             FROM "${schema}".online_order_payments
             WHERE gateway_payment_id = $1 OR gateway_order_id = $2
             LIMIT 1`,
            [refundPaymentId || null, rzpOrderId || null]
          );

          if (payRes.rowCount) {
            const orderId = payRes.rows[0].order_id;

            // Record failed refund
            await client.query(
              `INSERT INTO "${schema}".payment_refunds (
                 order_id, payment_id, gateway_refund_id, amount, status, failure_reason, notes, created_at, updated_at
               )
               VALUES ($1, $2, $3, $4, 'FAILED', $5, 'Webhook reported refund.failed', NOW(), NOW())`,
              [orderId, payRes.rows[0].id, refundId || null, Number(refundEntity?.amount || 0) / 100, errorDesc]
            );

            // Critical Operational Alert for Admin
            await client.query(
              `INSERT INTO "${schema}".admin_operational_alerts (
                 alert_type, severity, title, message, payload, is_resolved, created_at
               )
               VALUES ('REFUND_FAILURE', 'CRITICAL', $1, $2, $3, FALSE, NOW())`,
              [
                `Refund Failed for Order #${orderId}`,
                `Razorpay reported refund failure (${refundId || "N/A"}): ${errorDesc}. Immediate manual action needed.`,
                JSON.stringify({ orderId, refundId, error: errorDesc }),
              ]
            );
          }
        }
      }

      // Record in payment_webhook_events
      await client.query(
        `INSERT INTO "${schema}".payment_webhook_events (event_id, event_type, payload, processed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (event_id) DO NOTHING`,
        [eventId, eventName, JSON.stringify(payload)]
      );
    } catch (bizErr) {
      console.error(
        `[Razorpay Webhook] Error processing event '${eventName}' for company '${company}':`,
        bizErr
      );
    }

    return NextResponse.json({ status: "ok", received: true }, { status: 200 });
  } catch (err: any) {
    console.error(`[Razorpay Webhook Server Error]:`, err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
