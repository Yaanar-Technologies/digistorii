import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
//import { ensureDB } from "@/lib/ensure-db";
import { getTenantSchema } from "@/lib/tenant";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  //await ensureDB();
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { company } = await getTenantSchema(req);
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, seatCount } = body;

    if (!company) {
      return NextResponse.json(
        { success: false, message: "Tenant header is missing" },
        { status: 400 }
      );
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !seatCount) {
      return NextResponse.json(
        { success: false, message: "Missing required verification fields" },
        { status: 400 }
      );
    }

    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeySecret) {
      throw new Error("Razorpay credentials are not configured");
    }

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return NextResponse.json(
        { success: false, message: "Invalid payment signature" },
        { status: 400 }
      );
    }

    await client.query("BEGIN");
    transactionStarted = true;

    // Check if company subscription row exists
    const checkSub = await client.query(
      `SELECT id, max_users 
       FROM public.company_subscriptions 
       WHERE company_id = (SELECT id FROM public.companies WHERE subdomain_url = $1)`,
      [company]
    );

    let updatedMaxUsers = 0;
    if ((checkSub.rowCount ?? 0) === 0) {
      // Find the first active plan or fallback
      const defaultPlan = await client.query(
        `SELECT id FROM public.plans WHERE is_active = TRUE ORDER BY id ASC LIMIT 1`
      );
      const planId = (defaultPlan.rowCount ?? 0) > 0 ? defaultPlan.rows[0].id : 1;

      const insertSub = await client.query(
        `INSERT INTO public.company_subscriptions (
          company_id, 
          plan_id, 
          max_users, 
          status, 
          created_at, 
          updated_at
         )
         VALUES (
          (SELECT id FROM public.companies WHERE subdomain_url = $1), 
          $2, 
          COALESCE(NULL, 5) + $3, 
          'ACTIVE', 
          NOW(), 
          NOW()
         )
         RETURNING max_users`,
        [company, planId, Number(seatCount)]
      );
      updatedMaxUsers = Number(insertSub.rows[0].max_users);
    } else {
      const updateResult = await client.query(
        `UPDATE public.company_subscriptions
         SET 
           max_users = COALESCE(max_users, 5) + $1,
           updated_at = NOW()
         WHERE company_id = (SELECT id FROM public.companies WHERE subdomain_url = $2)
         RETURNING max_users`,
        [Number(seatCount), company]
      );
      updatedMaxUsers = Number(updateResult.rows[0].max_users);
    }

    // Update payments record to paid status
    await client.query(
      `UPDATE public.payments
       SET 
         payment_status = 'paid',
         status = 'paid',
         razorpay_payment_id = $1,
         razorpay_signature = $2,
         updated_at = NOW()
       WHERE razorpay_order_id = $3`,
      [razorpay_payment_id, razorpay_signature, razorpay_order_id]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json({
      success: true,
      max_users: updatedMaxUsers,
    });
  } catch (err: any) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    return NextResponse.json(
      {
        success: false,
        error: "VERIFICATION_FAILED",
        message: err?.message || "Payment verification failed",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
