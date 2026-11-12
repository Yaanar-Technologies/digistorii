import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();

  try {
    const { company: paramCompany } = await params;
    const company = (paramCompany || "").trim().toLowerCase();

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

    const body = await req.json().catch(() => ({}));
    const rawOrderId = body.order_id || body.orderId;
    const orderNo = body.order_no ? String(body.order_no).trim() : null;
    const directAmount = body.amount ? Number(body.amount) : null;
    const currency = body.currency ? String(body.currency).toUpperCase() : "INR";
    const customNotes = body.notes && typeof body.notes === "object" ? body.notes : {};

    let orderId: number | null = null;
    let resolvedOrderNo: string | null = null;
    let amountInPaise = 0;

    if (rawOrderId || orderNo) {
      let orderQuery = `SELECT id, order_no, customer_id, total_amount, currency, order_status, payment_status 
                        FROM "${schema}".online_orders `;
      const queryParams: any[] = [];

      if (rawOrderId) {
        orderQuery += `WHERE id = $1 LIMIT 1`;
        queryParams.push(Number(rawOrderId));
      } else {
        orderQuery += `WHERE order_no = $1 LIMIT 1`;
        queryParams.push(orderNo);
      }

      const orderRes = await client.query(orderQuery, queryParams);

      if (orderRes.rowCount === 0) {
        return NextResponse.json(
          { success: false, error: "Referenced order not found in this store." },
          { status: 404 }
        );
      }

      const order = orderRes.rows[0];
      orderId = Number(order.id);
      resolvedOrderNo = order.order_no;

      if (order.payment_status === "paid") {
        return NextResponse.json(
          { success: false, error: "This order is already paid." },
          { status: 400 }
        );
      }

      if (order.order_status === "cancelled") {
        return NextResponse.json(
          { success: false, error: "This order was cancelled and cannot accept payment." },
          { status: 400 }
        );
      }

      amountInPaise = Math.round(Number(order.total_amount) * 100);
    } else if (directAmount && directAmount > 0) {
      amountInPaise = Math.round(directAmount * 100);
      resolvedOrderNo = `PRE-${Date.now()}`;
    } else {
      return NextResponse.json(
        { success: false, error: "Either order_id, order_no, or a positive amount must be provided." },
        { status: 400 }
      );
    }

    // 1. Fetch Tenant Razorpay Credentials (from payment_gateway_configs or ecom_settings fallback)
    let keyId = "";
    let keySecretEnc = "";

    const gwRes = await client.query(
      `SELECT *
       FROM "${schema}".payment_gateway_configs
       WHERE provider = 'razorpay' AND is_active = TRUE
       LIMIT 1`
    );

    if (gwRes.rowCount && gwRes.rowCount > 0) {
      const gw = gwRes.rows[0];
      if (gw.is_live_mode && gw.live_key_id && (gw.live_key_secret_enc || gw.live_key_secret)) {
        keyId = gw.live_key_id;
        keySecretEnc = gw.live_key_secret_enc || gw.live_key_secret;
      } else if (gw.test_key_id && (gw.test_key_secret_enc || gw.test_key_secret)) {
        keyId = gw.test_key_id;
        keySecretEnc = gw.test_key_secret_enc || gw.test_key_secret;
      } else {
        keyId = gw.key_id;
        keySecretEnc = gw.key_secret || gw.key_secret_enc;
      }
    } else {
      // Legacy ecom_settings fallback
      const ecomRes = await client.query(
        `SELECT gateway_key_id, gateway_key_secret_enc
         FROM "${schema}".ecom_settings
         LIMIT 1`
      );
      if (ecomRes.rowCount && ecomRes.rows[0].gateway_key_id && ecomRes.rows[0].gateway_key_secret_enc) {
        keyId = ecomRes.rows[0].gateway_key_id;
        keySecretEnc = ecomRes.rows[0].gateway_key_secret_enc;
      }
    }

    if (!keyId || !keySecretEnc) {
      return NextResponse.json(
        {
          success: false,
          error: "Razorpay payment gateway credentials are not configured for this merchant store.",
        },
        { status: 400 }
      );
    }

    let keySecret = "";
    try {
      keySecret = decryptSecret(keySecretEnc);
    } catch {
      keySecret = keySecretEnc; // Fallback if plain
    }

    // 2. Dynamically instantiate Razorpay SDK per tenant
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // 3. Create Gateway Order
    const receiptStr = resolvedOrderNo
      ? resolvedOrderNo.slice(0, 40)
      : `rcpt_${Date.now()}`;

    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency,
      receipt: receiptStr,
      notes: {
        company,
        order_id: orderId ? String(orderId) : "",
        order_no: resolvedOrderNo || "",
        ...customNotes,
      },
    });

    // 4. Update online_orders record to pending and record in online_order_payments
    if (orderId) {
      await client.query(
        `UPDATE "${schema}".online_orders
         SET payment_status = 'pending',
             updated_at = NOW()
         WHERE id = $1`,
        [orderId]
      );

      await client.query(
        `INSERT INTO "${schema}".online_order_payments (
           order_id, gateway, gateway_order_id, amount, status, method, raw_response, created_at
         )
         VALUES ($1, 'razorpay', $2, $3, 'created', 'online', $4, NOW())`,
        [
          orderId,
          rzpOrder.id,
          (amountInPaise / 100).toFixed(2),
          JSON.stringify(rzpOrder),
        ]
      );
    }

    return NextResponse.json({
      success: true,
      razorpay_order_id: rzpOrder.id,
      key_id: keyId,
      amount: amountInPaise,
      currency,
      order_id: orderId,
      order_no: resolvedOrderNo,
    });
  } catch (err: any) {
    console.error("[Razorpay Create Order Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create Razorpay payment order" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

