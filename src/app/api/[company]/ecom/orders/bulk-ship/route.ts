import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";
import { decryptSecret } from "@/lib/cryptoHelper";
import { getCourierAdapter } from "@/lib/couriers";
import { transitionOrderStatus, OrderTransitionError } from "@/lib/orderStateMachine";

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface BulkShipResultItem {
  orderId: number;
  orderNo: string;
  success: boolean;
  awbNumber?: string;
  trackingUrl?: string;
  shippingLabelUrl?: string;
  courierPartner?: string;
  error?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;

  const guard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: true });
  if (!guard.ok) return guard.response;

  const schema = guard.schema;
  const staffUsername = staffDisplayName(guard.staff);

  let body: { orderIds?: (number | string)[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body provided." }, { status: 400 });
  }

  const rawOrderIds = body.orderIds;
  if (!Array.isArray(rawOrderIds) || rawOrderIds.length === 0) {
    return NextResponse.json({ success: false, error: "orderIds array must be provided and non-empty." }, { status: 400 });
  }

  const numericOrderIds = rawOrderIds
    .map((id) => Number(id))
    .filter((id) => !isNaN(id) && id > 0);

  if (numericOrderIds.length === 0) {
    return NextResponse.json({ success: false, error: "No valid numeric order IDs provided." }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    // 1. Fetch tenant logistics & courier configuration
    const settingsRes = await client.query(
      `SELECT delivery_partner, delivery_api_key_enc, delivery_api_secret_enc, pickup_location_code,
              default_length_cm, default_width_cm, default_height_cm, default_weight_grams
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
        return NextResponse.json(
          {
            success: false,
            error: `Failed to decrypt stored credentials for partner '${deliveryPartner}'. Please re-save your settings.`,
          },
          { status: 400 }
        );
      }

      if (deliveryPartner === "shiprocket" && (!deliveryApiKey || !deliveryApiSecret)) {
        return NextResponse.json(
          {
            success: false,
            error: "Shiprocket API Key (email) and Secret (password) are not fully configured in store settings.",
          },
          { status: 400 }
        );
      }

      if (deliveryPartner === "delhivery" && !deliveryApiKey) {
        return NextResponse.json(
          {
            success: false,
            error: "Delhivery API Token is not configured in store settings.",
          },
          { status: 400 }
        );
      }
    }

    const adapter = getCourierAdapter(deliveryPartner);

    const defaultLength = Math.max(0.1, Number(ecomSettings.default_length_cm || 10));
    const defaultWidth = Math.max(0.1, Number(ecomSettings.default_width_cm || 10));
    const defaultHeight = Math.max(0.1, Number(ecomSettings.default_height_cm || 10));
    const defaultWeight = Math.max(1, Number(ecomSettings.default_weight_grams || 500));
    const pickupLocationCode = ecomSettings.pickup_location_code || "Primary";

    // 2. Fetch all selected orders and verify they are in 'packed' status
    const ordersRes = await client.query(
      `SELECT
         o.id, o.order_no, o.order_status, o.payment_method, o.total_amount, o.subtotal,
         o.shipping_address_id, o.customer_id,
         ca.address_line1, ca.address_line2, ca.city, ca.state, ca.pincode, ca.country,
         ca.recipient_name,
         COALESCE(ca.recipient_phone, c.phone, '0000000000') AS phone,
         COALESCE(c.email, 'order@storefront.local') AS email
       FROM "${schema}".online_orders o
       LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
       LEFT JOIN "${schema}".customer_addresses ca ON ca.id = o.shipping_address_id
       WHERE o.id = ANY($1)`,
      [numericOrderIds]
    );

    const ordersMap = new Map<number, any>();
    for (const row of ordersRes.rows) {
      ordersMap.set(Number(row.id), row);
    }

    // Pre-fetch items for all selected orders
    const itemsRes = await client.query(
      `SELECT
         oi.order_id,
         pv.id AS variant_id,
         oi.product_name AS name,
         oi.qty AS units,
         oi.rate AS selling_price,
         oi.discount,
         oi.tax_amount AS tax,
         oi.hsn_no AS hsn,
         p.weight, p.length, p.width, p.height
       FROM "${schema}".online_order_items oi
       LEFT JOIN "${schema}".product_variants pv ON pv.id = oi.variant_id
       LEFT JOIN "${schema}".products p ON p.id = pv.product_id
       WHERE oi.order_id = ANY($1)`,
      [numericOrderIds]
    );

    const orderItemsMap = new Map<number, any[]>();
    for (const item of itemsRes.rows) {
      const oId = Number(item.order_id);
      if (!orderItemsMap.has(oId)) {
        orderItemsMap.set(oId, []);
      }
      orderItemsMap.get(oId)!.push(item);
    }

    // Process orders in controlled concurrency chunks of 5
    const results: BulkShipResultItem[] = [];
    const chunks = chunkArray(numericOrderIds, 5);

    for (const chunk of chunks) {
      const settled = await Promise.allSettled(
        chunk.map(async (orderId) => {
          const order = ordersMap.get(orderId);
          if (!order) {
            return {
              orderId,
              orderNo: `ID#${orderId}`,
              success: false,
              error: `Order #${orderId} not found in store records.`,
            };
          }

          if (order.order_status !== "packed") {
            return {
              orderId,
              orderNo: order.order_no,
              success: false,
              error: `Order status is '${order.order_status}'. Only 'packed' orders can be shipped.`,
            };
          }

          const rawItems = orderItemsMap.get(orderId) || [];
          if (rawItems.length === 0) {
            return {
              orderId,
              orderNo: order.order_no,
              success: false,
              error: "No line items found for this order.",
            };
          }

          // Compute dimensions and weight
          let calculatedLength = 0;
          let calculatedWidth = 0;
          let calculatedHeight = 0;
          let calculatedWeightGrams = 0;

          const shipmentItems = rawItems.map((item) => {
            const units = Math.max(1, Number(item.units || 1));
            const itemWeight = Number(item.weight) > 0 ? Number(item.weight) : defaultWeight;
            calculatedWeightGrams += itemWeight * units;

            if (Number(item.length) > calculatedLength) calculatedLength = Number(item.length);
            if (Number(item.width) > calculatedWidth) calculatedWidth = Number(item.width);
            calculatedHeight += (Number(item.height) > 0 ? Number(item.height) : defaultHeight) * units;

            return {
              name: item.name,
              units,
              selling_price: Number(item.selling_price || 0),
              discount: Number(item.discount || 0),
              tax: Number(item.tax || 0),
              hsn: item.hsn || undefined,
            };
          });

          const finalLength = Math.max(calculatedLength || defaultLength, 1);
          const finalWidth = Math.max(calculatedWidth || defaultWidth, 1);
          const finalHeight = Math.max(calculatedHeight || defaultHeight, 1);
          const finalWeight = Math.max(calculatedWeightGrams || defaultWeight, 10);
          const finalVolumetric = (finalLength * finalWidth * finalHeight) / 5;

          const isCod = order.payment_method === "cod";

          // Execute 3PL Shipment Creation
          const shipmentResult = await adapter.createShipment({
            orderNo: order.order_no,
            items: shipmentItems,
            shippingAddress: {
              name: order.recipient_name || "Customer",
              address_line1: order.address_line1 || "Customer Address",
              address_line2: order.address_line2 || undefined,
              city: order.city || "City",
              state: order.state || "State",
              pincode: order.pincode || "000000",
              country: order.country || "India",
              phone: order.phone || "0000000000",
              email: order.email || "order@storefront.local",
            },
            pickupLocationCode,
            codAmount: isCod ? Number(order.total_amount) : 0,
            subtotal: Number(order.subtotal || order.total_amount),
            totalAmount: Number(order.total_amount),
            deliveryApiKey,
            deliveryApiSecret,
            lengthCm: finalLength,
            widthCm: finalWidth,
            heightCm: finalHeight,
            weightGrams: finalWeight,
            volumetricWeightGrams: finalVolumetric,
          });

          const awb = shipmentResult.awbNumber;
          const trackingUrl = shipmentResult.trackingUrl || null;
          const labelUrl = shipmentResult.shippingLabelUrl || null;
          const courierPartner = shipmentResult.courierName || deliveryPartner;
          const estimatedDelivery = shipmentResult.estimatedDeliveryAt || null;

          // Dedicated per-order transactional DB persistence
          const orderClient = await pool.connect();
          try {
            await orderClient.query("BEGIN");

            await orderClient.query(
              `INSERT INTO "${schema}".online_order_deliveries (
                 order_id, courier_partner, awb_number, tracking_url, shipping_label_url,
                 estimated_delivery_at, dispatched_at, pickup_scheduled_at,
                 length_cm, width_cm, height_cm, actual_weight_grams, volumetric_weight_grams,
                 is_active, created_at, updated_at
               )
               VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8, $9, $10, $11, true, NOW(), NOW())
               ON CONFLICT (order_id, awb_number) DO UPDATE
               SET courier_partner = EXCLUDED.courier_partner,
                   tracking_url = EXCLUDED.tracking_url,
                   shipping_label_url = COALESCE(EXCLUDED.shipping_label_url, "${schema}".online_order_deliveries.shipping_label_url),
                   estimated_delivery_at = EXCLUDED.estimated_delivery_at,
                   length_cm = EXCLUDED.length_cm,
                   width_cm = EXCLUDED.width_cm,
                   height_cm = EXCLUDED.height_cm,
                   actual_weight_grams = EXCLUDED.actual_weight_grams,
                   volumetric_weight_grams = EXCLUDED.volumetric_weight_grams,
                   dispatched_at = COALESCE("${schema}".online_order_deliveries.dispatched_at, NOW()),
                   updated_at = NOW()`,
              [
                orderId,
                courierPartner,
                awb,
                trackingUrl,
                labelUrl,
                estimatedDelivery,
                finalLength,
                finalWidth,
                finalHeight,
                finalWeight,
                finalVolumetric,
              ]
            );

            await transitionOrderStatus(orderClient, schema, orderId, "shipped", {
              changedBy: staffUsername,
              note: `Bulk dispatched with ${courierPartner} (AWB: ${awb})`,
            });

            await orderClient.query("COMMIT");

            return {
              orderId,
              orderNo: order.order_no,
              success: true,
              awbNumber: awb,
              trackingUrl: trackingUrl || undefined,
              shippingLabelUrl: labelUrl || undefined,
              courierPartner,
            };
          } catch (dbErr: any) {
            await orderClient.query("ROLLBACK");
            throw dbErr;
          } finally {
            orderClient.release();
          }
        })
      );

      for (let i = 0; i < settled.length; i++) {
        const itemRes = settled[i];
        const currentOrderId = chunk[i];
        const order = ordersMap.get(currentOrderId);

        if (itemRes.status === "fulfilled") {
          results.push(itemRes.value);
        } else {
          results.push({
            orderId: currentOrderId,
            orderNo: order?.order_no || `ID#${currentOrderId}`,
            success: false,
            error: itemRes.reason?.message || "Failed to create shipment on carrier network.",
          });
        }
      }
    }

    const successfulCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      total: results.length,
      successful: successfulCount,
      failed: failedCount,
      results,
    });
  } catch (err: any) {
    console.error("[Bulk Ship Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process bulk shipments." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

