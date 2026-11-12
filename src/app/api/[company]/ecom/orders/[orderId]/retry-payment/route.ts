import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { decryptSecret } from "@/lib/cryptoHelper";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const client = await pool.connect();

  try {
    const { company, orderId: rawOrderId } = await params;
    const orderId = Number(rawOrderId);

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID." },
        { status: 400 }
      );
    }

    let schema = "";
    try {
      const tenantInfo = await getTenantSchemaByCompany(company);
      schema = tenantInfo.schema;
    } catch {
      return NextResponse.json(
        { success: false, error: `Company '${company}' not found.` },
        { status: 404 }
      );
    }

    const customerSession = await getStorefrontCustomerSession(req, company);
    if (!customerSession) {
      return NextResponse.json(
        { success: false, error: "Please sign in to retry payment." },
        { status: 401 }
      );
    }

    // 1. Fetch Order
    const orderRes = await client.query(
      `SELECT id, order_no, customer_id, total_amount, currency, order_status, payment_status, created_at
       FROM "${schema}".online_orders
       WHERE id = $1 AND customer_id = $2
       LIMIT 1`,
      [orderId, customerSession.customerId]
    );

    if (orderRes.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Order not found or access denied." },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    // Cannot retry if already paid or cancelled
    if (order.payment_status === "paid") {
      return NextResponse.json(
        { success: false, error: "This order is already paid." },
        { status: 400 }
      );
    }

    if (order.order_status === "cancelled") {
      return NextResponse.json(
        { success: false, error: "This order was cancelled and cannot be paid." },
        { status: 400 }
      );
    }

    // 2. Fetch Razorpay Credentials
    let keyId = "";
    let keySecret = "";

    const gwRes = await client.query(
      `SELECT *
       FROM "${schema}".payment_gateway_configs
       WHERE provider = 'razorpay' AND is_active = true
       LIMIT 1`
    );

    if (gwRes.rowCount && gwRes.rowCount > 0) {
      const gw = gwRes.rows[0];
      if (gw.is_live_mode && gw.live_key_id && (gw.live_key_secret_enc || gw.live_key_secret)) {
        keyId = gw.live_key_id;
        try {
          keySecret = decryptSecret(gw.live_key_secret_enc || gw.live_key_secret);
        } catch {}
      } else if (gw.test_key_id && (gw.test_key_secret_enc || gw.test_key_secret)) {
        keyId = gw.test_key_id;
        try {
          keySecret = decryptSecret(gw.test_key_secret_enc || gw.test_key_secret);
        } catch {}
      } else if (gw.key_id && (gw.key_secret || gw.key_secret_enc)) {
        keyId = gw.key_id;
        try {
          keySecret = decryptSecret(gw.key_secret || gw.key_secret_enc);
        } catch {}
      }
    }

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

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { success: false, error: "Payment gateway credentials are not configured." },
        { status: 400 }
      );
    }

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const amountInPaise = Math.round(Number(order.total_amount) * 100);

    const rzpOrder = await rzp.orders.create({
      amount: amountInPaise,
      currency: order.currency || "INR",
      receipt: `${order.order_no}-R${Date.now().toString().slice(-4)}`,
      notes: {
        company,
        order_id: String(orderId),
        retry: "true",
      },
    });

    // Record new payment row
    await client.query(
      `INSERT INTO "${schema}".online_order_payments (
         order_id, gateway, gateway_order_id, amount, status, method, raw_response, created_at
       )
       VALUES ($1, 'razorpay', $2, $3, 'created', 'retry', $4, NOW())`,
      [orderId, rzpOrder.id, Number(order.total_amount), JSON.stringify(rzpOrder)]
    );

    return NextResponse.json({
      success: true,
      order_id: orderId,
      order_no: order.order_no,
      razorpay_order_id: rzpOrder.id,
      razorpay_key_id: keyId,
      key_id: keyId,
      amount: amountInPaise,
      currency: order.currency || "INR",
    });
  } catch (err: any) {
    console.error("[Retry Payment Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to initialize payment retry." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

