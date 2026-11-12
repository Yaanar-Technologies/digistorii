import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff } from "@/lib/apiGuard";
import { decryptSecret } from "@/lib/cryptoHelper";
import { getCourierAdapter } from "@/lib/couriers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;

  const guard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: true });
  if (!guard.ok) return guard.response;

  const schema = guard.schema;

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const searchParams = req.nextUrl.searchParams;
  const rawAction = (searchParams.get("action") || body.action || "").trim().toLowerCase();
  const rawOrderIds = body.orderIds || searchParams.get("orderIds")?.split(",") || [];
  const rawShipmentIds = body.shipmentIds || searchParams.get("shipmentIds")?.split(",") || [];

  const targetIds = (rawOrderIds && rawOrderIds.length > 0 ? rawOrderIds : rawShipmentIds)
    .map((id: any) => Number(id))
    .filter((id: number) => !isNaN(id) && id > 0);

  if (targetIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "Please provide a non-empty array of orderIds or shipmentIds." },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    // 1. Fetch courier configuration
    const settingsRes = await client.query(
      `SELECT delivery_partner, delivery_api_key_enc, delivery_api_secret_enc
       FROM "${schema}".ecom_settings
       LIMIT 1`
    );

    const ecomSettings = settingsRes.rows[0] || {};
    const deliveryPartner = (ecomSettings.delivery_partner || "self").trim().toLowerCase();

    let deliveryApiKey = "";
    let deliveryApiSecret = "";

    if (deliveryPartner !== "self") {
      try {
        if (ecomSettings.delivery_api_key_enc) {
          deliveryApiKey = decryptSecret(ecomSettings.delivery_api_key_enc);
        }
        if (ecomSettings.delivery_api_secret_enc) {
          deliveryApiSecret = decryptSecret(ecomSettings.delivery_api_secret_enc);
        }
      } catch (err: any) {
        console.warn("Could not decrypt courier credentials for print route:", err?.message);
      }
    }

    const adapter = getCourierAdapter(deliveryPartner);

    // 2. Fetch delivery records with order details
    const deliveriesRes = await client.query(
      `SELECT
         d.id AS delivery_id,
         d.order_id,
         d.courier_partner,
         d.awb_number,
         d.tracking_url,
         d.shipping_label_url,
         d.manifest_id,
         d.actual_weight_grams,
         d.created_at AS dispatched_at,
         o.order_no,
         o.order_status,
         o.total_amount,
         ca.recipient_name,
         ca.city,
         ca.state,
         ca.pincode,
         ca.address_line1
       FROM "${schema}".online_order_deliveries d
       JOIN "${schema}".online_orders o ON o.id = d.order_id
       LEFT JOIN "${schema}".customer_addresses ca ON ca.id = o.shipping_address_id
       WHERE (d.order_id = ANY($1) OR d.id = ANY($1)) AND d.awb_number IS NOT NULL`,
      [targetIds]
    );

    const rows = deliveriesRes.rows;

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No active delivery records with assigned AWBs found for the selected orders. Please create shipments first.",
        },
        { status: 404 }
      );
    }

    // Handle Action 1: Print Shipping Labels (action = "labels" or "print_labels")
    if (rawAction === "labels" || rawAction === "print_labels") {
      const labels: Array<{
        orderId: number;
        orderNo: string;
        awbNumber: string;
        labelUrl: string;
        courier: string;
      }> = [];

      for (const row of rows) {
        let labelUrl = row.shipping_label_url || "";

        // If label URL is missing, request dynamically from adapter
        if (!labelUrl && adapter.generateLabel) {
          try {
            const generated = await adapter.generateLabel(row.awb_number || row.order_id, {
              apiKey: deliveryApiKey,
              apiSecret: deliveryApiSecret,
            });
            if (generated?.labelUrl) {
              labelUrl = generated.labelUrl;
              // Persist dynamically generated label URL
              await client.query(
                `UPDATE "${schema}".online_order_deliveries
                 SET shipping_label_url = $1, updated_at = NOW()
                 WHERE id = $2`,
                [labelUrl, row.delivery_id]
              );
            }
          } catch (err: any) {
            console.warn(`Failed to generate label for AWB ${row.awb_number}:`, err?.message);
          }
        }

        labels.push({
          orderId: Number(row.order_id),
          orderNo: row.order_no,
          awbNumber: row.awb_number,
          labelUrl: labelUrl || "",
          courier: row.courier_partner || deliveryPartner,
        });
      }

      return NextResponse.json({
        success: true,
        count: labels.length,
        labels,
      });
    }

    // Handle Action 2: Generate Courier Handover Manifest (action = "manifest" or "generate_manifest")
    if (rawAction === "manifest" || rawAction === "generate_manifest") {
      const awbNumbers = rows.map((r) => r.awb_number).filter(Boolean);
      const deliveryIds = rows.map((r) => r.delivery_id);

      let manifestId = `MAN-${deliveryPartner.toUpperCase()}-${Date.now().toString().slice(-6)}`;
      let manifestUrl = "";

      if (adapter.generateManifest) {
        try {
          const manifestRes = await adapter.generateManifest(awbNumbers, {
            apiKey: deliveryApiKey,
            apiSecret: deliveryApiSecret,
          });
          if (manifestRes.manifestId) manifestId = manifestRes.manifestId;
          if (manifestRes.manifestUrl) manifestUrl = manifestRes.manifestUrl;
        } catch (manifestErr: any) {
          console.warn("Carrier manifest API notice:", manifestErr?.message);
        }
      }

      // Update manifest_id on deliveries table
      await client.query(
        `UPDATE "${schema}".online_order_deliveries
         SET manifest_id = $1, updated_at = NOW()
         WHERE id = ANY($2)`,
        [manifestId, deliveryIds]
      );

      return NextResponse.json({
        success: true,
        manifestId,
        manifestUrl,
        shipmentCount: rows.length,
        courierPartner: deliveryPartner,
        generatedAt: new Date().toISOString(),
        orders: rows.map((r) => ({
          orderId: r.order_id,
          orderNo: r.order_no,
          awbNumber: r.awb_number,
          recipientName: r.recipient_name || "Customer",
          destinationPincode: r.pincode || "—",
          destinationCity: r.city || "—",
          weightGrams: r.actual_weight_grams || 500,
          totalAmount: r.total_amount,
        })),
      });
    }

    return NextResponse.json({ success: false, error: `Unsupported action: '${rawAction}'.` }, { status: 400 });
  } catch (err: any) {
    console.error("[Bulk Print Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process bulk print action." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

