// Read-Only Client Verification & Polling Handshake Route
// The inbound Razorpay webhook remains the sole mutator of payment_status to 'paid'.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { decryptSecret } from "@/lib/cryptoHelper";

interface VerifyPaymentRequestBody {
  orderId: number | string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();

  try {
    const { company: paramCompany } = await params;
    let schema = "";
    let companyId: number | null = null;

    try {
      const tenantInfo = await getTenantSchemaByCompany(paramCompany);
      schema = tenantInfo.schema;
    } catch {
      return NextResponse.json(
        { success: false, error: `Company '${paramCompany}' not found.` },
        { status: 404 }
      );
    }

    const customerSession = await getStorefrontCustomerSession(req, paramCompany);
    if (!customerSession) {
      return NextResponse.json(
        { success: false, error: "Please sign in to verify this payment." },
        { status: 401 }
      );
    }

    const compRes = await client.query(
      `SELECT id FROM public.companies WHERE schema_name = $1 LIMIT 1`,
      [schema]
    );
    if (compRes.rowCount) {
      companyId = Number(compRes.rows[0].id);
    }

    let body: VerifyPaymentRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body provided." },
        { status: 400 }
      );
    }

    const { orderId: rawOrderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    const orderId = Number(rawOrderId);

    if (
      !orderId ||
      isNaN(orderId) ||
      !razorpay_order_id?.trim() ||
      !razorpay_payment_id?.trim() ||
      !razorpay_signature?.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required verification fields: orderId, razorpay_order_id, razorpay_payment_id, and razorpay_signature are all required.",
        },
        { status: 400 }
      );
    }

    // 2. Fetch gateway credentials from tenant payment_gateway_configs (with ecom_settings fallback)
    let gatewaySecretEnc: string | null = null;

    const gatewayRes = await client.query(
      `SELECT *
       FROM "${schema}".payment_gateway_configs
       WHERE provider = 'razorpay' AND is_active = TRUE
       LIMIT 1`
    );

    if (gatewayRes.rowCount) {
      const gw = gatewayRes.rows[0];
      gatewaySecretEnc = gw.is_live_mode
        ? gw.live_key_secret_enc || gw.key_secret || gw.key_secret_enc
        : gw.test_key_secret_enc || gw.key_secret || gw.key_secret_enc;
    }

    if (!gatewaySecretEnc) {
      const settingsRes = await client.query(
        `SELECT gateway_key_secret_enc
         FROM "${schema}".ecom_settings
         LIMIT 1`
      );
      gatewaySecretEnc = settingsRes.rows[0]?.gateway_key_secret_enc || null;
    }

    if (!gatewaySecretEnc) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment gateway credentials are not configured for this store.",
        },
        { status: 400 }
      );
    }

    let decryptedSecret = "";
    try {
      decryptedSecret = decryptSecret(gatewaySecretEnc);
    } catch (decryptErr) {
      decryptedSecret = gatewaySecretEnc;
    }

    // 3. Verify HMAC-SHA256 signature mathematically
    const signaturePayload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", decryptedSecret)
      .update(signaturePayload)
      .digest("hex");

    const isSignatureValid =
      razorpay_signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(razorpay_signature, "utf8"),
        Buffer.from(expectedSignature, "utf8")
      );

    if (!isSignatureValid) {
      console.warn(
        `[Payment Verify] Signature verification failed for order #${orderId}. Received: ${razorpay_signature}`
      );
      return NextResponse.json(
        { success: false, error: "Invalid payment signature verification failed." },
        { status: 400 }
      );
    }

    // 4. Correlate payment ID on online_order_payments if not already attached
    await client.query(
      `UPDATE "${schema}".online_order_payments
       SET gateway_payment_id = COALESCE(gateway_payment_id, $1),
           gateway_signature = COALESCE(gateway_signature, $2)
       WHERE order_id = $3 AND (gateway_order_id = $4 OR gateway_order_id IS NULL)`,
      [razorpay_payment_id, razorpay_signature, orderId, razorpay_order_id]
    );

    // 5. Read current database order state (Read-Only)
    const orderRes = await client.query(
      `SELECT id, order_no, order_status, payment_status, total_amount
       FROM "${schema}".online_orders
       WHERE id = $1 AND customer_id = $2
       LIMIT 1`,
      [orderId, customerSession.customerId]
    );

    if (orderRes.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found or access denied.` },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    // 6. Return appropriate state based on webhook processing status
    if (order.payment_status === "paid") {
      return NextResponse.json({
        success: true,
        status: "PAID",
        orderId,
        order_no: order.order_no,
        message: "Payment verified and order confirmed successfully.",
      });
    }

    if (order.payment_status === "failed") {
      return NextResponse.json({
        success: false,
        status: "FAILED",
        orderId,
        order_no: order.order_no,
        error: "Payment was reported failed by gateway.",
      });
    }

    // If webhook is in flight / processing:
    return NextResponse.json({
      success: true,
      status: "PROCESSING",
      orderId,
      order_no: order.order_no,
      message: "Payment signature verified. Processing transaction via gateway webhook...",
    });
  } catch (err: any) {
    console.error("[Payment Verify Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
