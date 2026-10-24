import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { decryptSecret } from "@/lib/cryptoHelper";
import { transitionPaymentStatus, OrderTransitionError } from "@/lib/orderStateMachine";

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
  let inTransaction = false;

  try {
    const { company: paramCompany } = await params;
    let companyName = paramCompany;
    let schema = "";
    let companyId: number | null = null;

    // Tenant comes from the company in the URL; client headers are ignored.
    try {
      const tenantInfo = await getTenantSchemaByCompany(paramCompany);
      schema = tenantInfo.schema;
      companyName = tenantInfo.company;
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

    if (!companyId) {
      const compRes = await client.query(
        `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = LOWER($1) LIMIT 1`,
        [companyName]
      );
      if (compRes.rowCount) {
        companyId = Number(compRes.rows[0].id);
        schema = compRes.rows[0].schema_name;
      } else {
        return NextResponse.json(
          { success: false, error: `Company '${companyName}' not found.` },
          { status: 404 }
        );
      }
    }

    const body: VerifyPaymentRequestBody = await req.json().catch(() => ({}));
    const {
      orderId: rawOrderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    const orderId = Number(rawOrderId);

    // 1. Validate required payload attributes
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
      `SELECT key_secret
       FROM "${schema}".payment_gateway_configs
       WHERE provider = 'razorpay' AND is_active = TRUE
       LIMIT 1`
    );

    if (gatewayRes.rowCount && gatewayRes.rows[0].key_secret) {
      gatewaySecretEnc = gatewayRes.rows[0].key_secret;
    } else {
      const settingsRes = await client.query(
        `SELECT gateway_key_secret_enc
         FROM "${schema}".ecom_settings
         WHERE company_id = $1
         LIMIT 1`,
        [companyId]
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
      console.error("[Payment Verify] Failed to decrypt gateway secret:", decryptErr);
      return NextResponse.json(
        { success: false, error: "Invalid payment gateway secret configuration." },
        { status: 500 }
      );
    }

    // 3. Verify HMAC-SHA256 signature server-side
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

    // 4. Begin Database Transaction
    await client.query("BEGIN");
    inTransaction = true;

    // Fetch and lock the order row
    const orderRes = await client.query(
      `SELECT id, order_no, order_status, payment_status, total_amount
       FROM "${schema}".online_orders
       WHERE id = $1 AND customer_id = $2
       FOR UPDATE`,
      [orderId, customerSession.customerId]
    );

    if (orderRes.rowCount === 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        { success: false, error: `Order #${orderId} not found.` },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    // Idempotency check: If already marked paid and confirmed, return success without re-executing
    if (order.payment_status === "paid") {
      await client.query("COMMIT");
      inTransaction = false;
      return NextResponse.json({
        success: true,
        orderId,
        order_no: order.order_no,
        message: "Payment has already been verified and processed.",
      });
    }

    // 5. Update or insert record in online_order_payments table
    const payRes = await client.query(
      `SELECT id FROM "${schema}".online_order_payments
       WHERE order_id = $1 AND (gateway_order_id = $2 OR gateway_order_id IS NULL)
       LIMIT 1`,
      [orderId, razorpay_order_id]
    );

    const verificationPayload = JSON.stringify({
      verified_via: "client_sync_verify",
      razorpay_order_id,
      razorpay_payment_id,
      verified_at: new Date().toISOString(),
    });

    if (payRes.rowCount) {
      await client.query(
        `UPDATE "${schema}".online_order_payments
         SET gateway_payment_id = $1,
             gateway_signature = $2,
             status = 'captured',
             raw_response = COALESCE(raw_response, '{}'::jsonb) || $3::jsonb
         WHERE id = $4`,
        [razorpay_payment_id, razorpay_signature, verificationPayload, payRes.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO "${schema}".online_order_payments (
           order_id, gateway, gateway_order_id, gateway_payment_id, gateway_signature,
           amount, status, raw_response, created_at
         )
         VALUES ($1, 'razorpay', $2, $3, $4, $5, 'captured', $6, NOW())`,
        [
          orderId,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          Number(order.total_amount),
          verificationPayload,
        ]
      );
    }

    // 6. Transition payment status to 'paid'
    // State machine automatically confirms order and converts inventory reservations
    await transitionPaymentStatus(client, schema, orderId, "paid", {
      changedBy: "customer:verification",
      note: `Verified via synchronous payment verification with Payment ID: ${razorpay_payment_id}`,
    });

    // 7. Ensure reservations are converted to 'converted'
    await client.query(
      `UPDATE "${schema}".inventory_reservations
       SET status = 'converted'
       WHERE order_ref_id = $1 AND status = 'held'`,
      [orderId]
    );

    // 8. Idempotently clear ordered cart items for this customer
    await client.query(
      `DELETE FROM "${schema}".cart_items
       WHERE customer_id = (SELECT customer_id FROM "${schema}".online_orders WHERE id = $1)
         AND variant_id IN (
           SELECT variant_id FROM "${schema}".online_order_items WHERE order_id = $1
         )`,
      [orderId]
    );

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      orderId,
      order_no: order.order_no,
      message: "Payment verified and order confirmed successfully.",
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (err instanceof OrderTransitionError || err.name === "OrderTransitionError") {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409 }
      );
    }
    console.error("[Verify Payment Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to verify payment." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
