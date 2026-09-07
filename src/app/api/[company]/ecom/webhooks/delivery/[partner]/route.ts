import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { decryptSecret } from "@/lib/cryptoHelper";
import { getCourierAdapter, NormalizedDeliveryStatus } from "@/lib/couriers";
import { transitionDeliveryStatus } from "@/lib/orderStateMachine";

const STATUS_PROGRESSION: Record<string, number> = {
  not_shipped: 0,
  picked_up: 1,
  in_transit: 2,
  out_for_delivery: 3,
  delivered: 4,
  failed_delivery: 3,
  rto: 4,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; partner: string }> }
) {
  // 1. Read raw body as text before parsing
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Failed to read webhook request body" },
      { status: 400 }
    );
  }

  // 2. Resolve company + schema and validate courier partner
  const { company, partner } = await params;
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
    const settingsRes = await client.query(
      `SELECT delivery_partner, delivery_webhook_secret_enc
       FROM "${schema}".ecom_settings
       LIMIT 1`
    );

    const ecomSettings = settingsRes.rows[0] || null;
    const configuredPartner = (ecomSettings?.delivery_partner || "").toLowerCase();

    if (configuredPartner !== partner.toLowerCase()) {
      console.warn(
        `[Delivery Webhook] Mismatch: Request for partner '${partner}' but store is configured with '${configuredPartner}'.`
      );
      return NextResponse.json(
        {
          success: false,
          error: `Delivery partner mismatch. Configured: '${configuredPartner}', received: '${partner}'.`,
        },
        { status: 400 }
      );
    }

    // 3. Decrypt secret and verify webhook signature
    const webhookSecretEnc = ecomSettings?.delivery_webhook_secret_enc;
    if (!webhookSecretEnc) {
      console.warn(
        `[Delivery Webhook] Webhook secret not configured for delivery partner '${partner}' in company '${company}'.`
      );
      return NextResponse.json(
        { success: false, error: "Delivery webhook secret not configured" },
        { status: 400 }
      );
    }

    let decryptedSecret = "";
    try {
      decryptedSecret = decryptSecret(webhookSecretEnc);
    } catch (err) {
      console.error(
        `[Delivery Webhook] Failed to decrypt delivery webhook secret for company '${company}':`,
        err
      );
      return NextResponse.json(
        { success: false, error: "Invalid delivery webhook secret configuration" },
        { status: 400 }
      );
    }

    const adapter = getCourierAdapter(partner);

    const headersRecord: Record<string, string | string[] | undefined> = {};
    req.headers.forEach((val, key) => {
      headersRecord[key.toLowerCase()] = val;
    });

    const isSignatureValid = adapter.verifyWebhookSignature(rawBody, headersRecord, decryptedSecret);
    if (!isSignatureValid) {
      console.warn(
        `[Delivery Webhook] Invalid signature from partner '${partner}' for company '${company}'.`
      );
      return NextResponse.json(
        { success: false, error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    // 4. Parse verified payload
    try {
      const payload = JSON.parse(rawBody);
      const parsedEvent = adapter.parseWebhookEvent(payload);
      const { awbNumber, status, location, timestamp } = parsedEvent;

      if (!awbNumber) {
        console.warn(
          `[Delivery Webhook] Event received without an AWB number from partner '${partner}'.`
        );
        return NextResponse.json({ status: "ok", message: "No AWB found in payload" }, { status: 200 });
      }

      // 5. Look up online_order_deliveries by awb_number
      const deliveryRes = await client.query(
        `SELECT id, order_id, courier_partner, awb_number, picked_up_at, out_for_delivery_at, delivered_at
         FROM "${schema}".online_order_deliveries
         WHERE awb_number = $1
         LIMIT 1`,
        [awbNumber]
      );

      if (deliveryRes.rowCount === 0) {
        console.info(
          `[Delivery Webhook] No matching shipment found for AWB '${awbNumber}' in schema '${schema}'.`
        );
        return NextResponse.json(
          { status: "ok", message: "Shipment AWB not recognized, logged" },
          { status: 200 }
        );
      }

      const deliveryRow = deliveryRes.rows[0];
      const orderId = Number(deliveryRow.order_id);

      // Check current delivery status on the online_orders row
      const orderRes = await client.query(
        `SELECT id, delivery_status, order_status
         FROM "${schema}".online_orders
         WHERE id = $1
         LIMIT 1`,
        [orderId]
      );

      if (orderRes.rowCount === 0) {
        return NextResponse.json({ status: "ok", message: "Order not found" }, { status: 200 });
      }

      const currentDeliveryStatus = orderRes.rows[0].delivery_status;

      // 6. Idempotency & progression guard
      const currentRank = STATUS_PROGRESSION[currentDeliveryStatus] ?? 0;
      const incomingRank = STATUS_PROGRESSION[status] ?? 0;

      if (
        currentDeliveryStatus === status ||
        (currentDeliveryStatus === "delivered" && status !== "delivered") ||
        (currentDeliveryStatus === "rto" && status !== "rto") ||
        (currentRank > incomingRank && currentDeliveryStatus !== "failed_delivery")
      ) {
        return NextResponse.json(
          { status: "ok", message: "Event already processed or superseded" },
          { status: 200 }
        );
      }

      // Begin transaction for database update & state transition
      await client.query("BEGIN");

      // 7. Update online_order_deliveries
      let timestampUpdateClause = "";
      const eventTimestamp = timestamp || new Date();

      if (status === "picked_up") {
        timestampUpdateClause = `, picked_up_at = COALESCE(picked_up_at, '${eventTimestamp.toISOString()}')`;
      } else if (status === "out_for_delivery") {
        timestampUpdateClause = `, out_for_delivery_at = COALESCE(out_for_delivery_at, '${eventTimestamp.toISOString()}')`;
      } else if (status === "delivered") {
        timestampUpdateClause = `, delivered_at = COALESCE(delivered_at, '${eventTimestamp.toISOString()}')`;
      }

      await client.query(
        `UPDATE "${schema}".online_order_deliveries
         SET last_location = COALESCE($1, last_location),
             last_webhook_payload = $2,
             updated_at = NOW()
             ${timestampUpdateClause}
         WHERE id = $3`,
        [location || null, JSON.stringify(payload), deliveryRow.id]
      );

      // 8. Call transitionDeliveryStatus inside transaction
      await transitionDeliveryStatus(client, schema, orderId, status, {
        changedBy: `webhook:${partner}`,
        note: `Status updated to '${status}' by courier webhook for AWB: ${awbNumber}`,
      });

      await client.query("COMMIT");
    } catch (bizErr) {
      await client.query("ROLLBACK");
      console.error(
        `[Delivery Webhook] Error processing event for company '${company}', partner '${partner}':`,
        bizErr
      );
    }

    // 9. Always return 200 once signature-verified
    return NextResponse.json({ status: "ok", received: true }, { status: 200 });
  } catch (err: any) {
    console.error(`[Delivery Webhook Server Error]:`, err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
