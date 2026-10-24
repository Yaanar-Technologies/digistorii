// This webhook is the only source of truth for payment_status — any client-side Razorpay checkout success callback built later must NOT independently mark orders paid.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { decryptSecret } from "@/lib/cryptoHelper";
import { transitionPaymentStatus } from "@/lib/orderStateMachine";

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
    // 3. Load ecom_settings.gateway_webhook_secret_enc for this company
    const settingsRes = await client.query(
      `SELECT gateway_webhook_secret_enc
       FROM "${schema}".ecom_settings
       LIMIT 1`
    );

    const webhookSecretEnc = settingsRes.rows[0]?.gateway_webhook_secret_enc;
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
      console.error(
        `[Razorpay Webhook] Failed to decrypt webhook secret for company '${company}':`,
        err
      );
      return NextResponse.json(
        { success: false, error: "Invalid webhook secret configuration" },
        { status: 400 }
      );
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

    // 5. Parse verified payload and process business logic
    // Once signature is verified, any downstream processing error returns 200 to prevent Razorpay disablement
    try {
      const payload = JSON.parse(rawBody);
      const eventName = payload?.event;
      const paymentEntity = payload?.payload?.payment?.entity;
      const refundEntity = payload?.payload?.refund?.entity;

      const rzpOrderId: string | undefined = paymentEntity?.order_id;
      const rzpPaymentId: string | undefined = paymentEntity?.id || refundEntity?.payment_id;

      // Handle events
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
            // Idempotency check
            if (paymentRow.status === "authorized" && paymentRow.gateway_payment_id === rzpPaymentId) {
              return NextResponse.json({ status: "ok", message: "Already processed" }, { status: 200 });
            }

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
            // Idempotency check
            if (paymentRow.status === "captured" && paymentRow.gateway_payment_id === rzpPaymentId) {
              return NextResponse.json({ status: "ok", message: "Already processed" }, { status: 200 });
            }

            await client.query(
              `UPDATE "${schema}".online_order_payments
               SET gateway_payment_id = COALESCE($1, gateway_payment_id),
                   status = 'captured',
                   raw_response = $2
               WHERE id = $3`,
              [rzpPaymentId || null, JSON.stringify(payload), paymentRow.id]
            );

            // Chained state machine handles transition to paid & order to confirmed + converts reservations
            await transitionPaymentStatus(client, schema, paymentRow.order_id, "paid", {
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
              [paymentRow.order_id]
            );
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
            // Idempotency check
            if (paymentRow.status === "failed") {
              return NextResponse.json({ status: "ok", message: "Already processed" }, { status: 200 });
            }

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
            // Idempotency check
            if (paymentRow.status === "refunded") {
              return NextResponse.json({ status: "ok", message: "Already processed" }, { status: 200 });
            }

            await client.query(
              `UPDATE "${schema}".online_order_payments
               SET status = 'refunded',
                   raw_response = $1
               WHERE id = $2`,
              [JSON.stringify(payload), paymentRow.id]
            );

            await transitionPaymentStatus(client, schema, paymentRow.order_id, "refunded", {
              changedBy: "webhook:razorpay",
              note: `Refund processed: ${refundId || "N/A"}`,
            });
          }
        }
      } else {
        console.log(`[Razorpay Webhook] Received unhandled event '${eventName}' for company '${company}'.`);
      }
    } catch (bizErr) {
      console.error(
        `[Razorpay Webhook] Error processing event for company '${company}':`,
        bizErr
      );
    }

    // Always return 200 once signature verification passed
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
