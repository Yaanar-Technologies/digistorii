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
  rto: 5,
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
      const {
        awbNumber,
        status,
        location,
        timestamp,
        failureReason,
        nextRetryDate,
        podType,
        podResourceUrl,
        deliveredToPersonName,
        deliveryCoordinates,
      } = parsedEvent;

      if (!awbNumber) {
        console.warn(
          `[Delivery Webhook] Event received without an AWB number from partner '${partner}'.`
        );
        return NextResponse.json({ status: "ok", message: "No AWB found in payload" }, { status: 200 });
      }

      // 5. Look up online_order_deliveries by awb_number
      const deliveryRes = await client.query(
        `SELECT id, order_id, courier_partner, awb_number, attempt_count, max_attempts,
                picked_up_at, out_for_delivery_at, delivered_at
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

      // Determine effective target status taking NDR attempts into account
      let effectiveStatus: NormalizedDeliveryStatus = status;
      const currentAttempts = Number(deliveryRow.attempt_count || 0);
      const maxAttempts = Number(deliveryRow.max_attempts || 3);
      let nextAttempts = currentAttempts;

      if (status === "failed_delivery") {
        nextAttempts = currentAttempts + 1;
        if (nextAttempts >= maxAttempts) {
          effectiveStatus = "rto";
        } else {
          effectiveStatus = "failed_delivery";
        }
      }

      // 6. Idempotency & progression guard
      const currentRank = STATUS_PROGRESSION[currentDeliveryStatus] ?? 0;
      const incomingRank = STATUS_PROGRESSION[effectiveStatus] ?? 0;

      if (
        (currentDeliveryStatus === effectiveStatus && effectiveStatus !== "failed_delivery") ||
        (currentDeliveryStatus === "delivered" && effectiveStatus !== "delivered") ||
        (currentDeliveryStatus === "rto" && effectiveStatus !== "rto") ||
        (currentRank > incomingRank && currentDeliveryStatus !== "failed_delivery")
      ) {
        return NextResponse.json(
          { status: "ok", message: "Event already processed or superseded" },
          { status: 200 }
        );
      }

      // Begin transaction for database update & state transition
      await client.query("BEGIN");

      const eventTimestamp = timestamp || new Date();

      if (effectiveStatus === "failed_delivery") {
        await client.query(
          `UPDATE "${schema}".online_order_deliveries
           SET attempt_count = $1,
               failure_reason = COALESCE($2, failure_reason),
               next_retry_date = COALESCE($3, next_retry_date, NOW() + INTERVAL '1 day'),
               last_location = COALESCE($4, last_location),
               last_webhook_payload = $5,
               updated_at = NOW()
           WHERE id = $6`,
          [
            nextAttempts,
            failureReason || "Customer Unavailable / Delivery Attempt Failed",
            nextRetryDate || null,
            location || null,
            JSON.stringify(payload),
            deliveryRow.id,
          ]
        );
      } else if (effectiveStatus === "rto") {
        await client.query(
          `UPDATE "${schema}".online_order_deliveries
           SET attempt_count = GREATEST(attempt_count, $1),
               failure_reason = COALESCE($2, failure_reason, 'Max delivery attempts exceeded (RTO)'),
               rto_initiated_at = COALESCE(rto_initiated_at, NOW()),
               last_location = COALESCE($3, last_location),
               last_webhook_payload = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [
            nextAttempts,
            failureReason || "Max delivery attempts reached or customer rejected package",
            location || null,
            JSON.stringify(payload),
            deliveryRow.id,
          ]
        );

        // Record internal staff alert note for package arrival restock
        await client.query(
          `INSERT INTO "${schema}".order_notes (company_id, order_id, author_name, author_type, content, is_customer_visible, created_at)
           SELECT company_id, id, 'System Logistics', 'system',
                  'Alert: Shipment failed after ' || $1 || ' attempt(s) and has been converted to RTO (Return to Origin). Awaiting physical arrival at warehouse for QC inspection and inventory restock ledger reversal.',
                  false, NOW()
           FROM "${schema}".online_orders
           WHERE id = $2`,
          [nextAttempts, orderId]
        );
      } else if (effectiveStatus === "delivered") {
        await client.query(
          `UPDATE "${schema}".online_order_deliveries
           SET delivered_at = COALESCE(delivered_at, $1),
               pod_type = COALESCE($2, pod_type),
               pod_resource_url = COALESCE($3, pod_resource_url),
               delivered_to_person_name = COALESCE($4, delivered_to_person_name),
               delivery_coordinates = COALESCE($5, delivery_coordinates),
               last_location = COALESCE($6, last_location),
               last_webhook_payload = $7,
               updated_at = NOW()
           WHERE id = $8`,
          [
            eventTimestamp.toISOString(),
            podType || null,
            podResourceUrl || null,
            deliveredToPersonName || null,
            deliveryCoordinates ? JSON.stringify(deliveryCoordinates) : null,
            location || null,
            JSON.stringify(payload),
            deliveryRow.id,
          ]
        );
      } else {
        let timestampUpdateClause = "";
        if (effectiveStatus === "picked_up") {
          timestampUpdateClause = `, picked_up_at = COALESCE(picked_up_at, '${eventTimestamp.toISOString()}')`;
        } else if (effectiveStatus === "out_for_delivery") {
          timestampUpdateClause = `, out_for_delivery_at = COALESCE(out_for_delivery_at, '${eventTimestamp.toISOString()}')`;
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
      }

      // Call transitionDeliveryStatus inside transaction (allowing forward fast-forwarding for skipped carrier scans)
      if (currentDeliveryStatus !== effectiveStatus) {
        await transitionDeliveryStatus(client, schema, orderId, effectiveStatus, {
          changedBy: `webhook:${partner}`,
          note: `Status updated to '${effectiveStatus}' by courier webhook for AWB: ${awbNumber}${
            effectiveStatus === "failed_delivery" ? ` (Attempt #${nextAttempts})` : ""
          }`,
          allowFastForward: true,
        });
      }

      await client.query("COMMIT");
    } catch (bizErr) {
      await client.query("ROLLBACK");
      console.error(
        `[Delivery Webhook] Error processing event for company '${company}', partner '${partner}':`,
        bizErr
      );
    }

    // Always return 200 once signature-verified
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
