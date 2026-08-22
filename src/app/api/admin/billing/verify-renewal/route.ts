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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, interval } = body;

    if (!company) {
      return NextResponse.json(
        { success: false, message: "Tenant header is missing" },
        { status: 400 }
      );
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !interval) {
      return NextResponse.json(
        { success: false, message: "Missing required verification fields" },
        { status: 400 }
      );
    }

    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeySecret) {
      throw new Error("Razorpay credentials are not configured");
    }

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

    const companyRes = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );

    if (!companyRes.rowCount) {
      throw new Error("Company not found");
    }
    const companyId = companyRes.rows[0].id;

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

    const subRes = await client.query(
      `SELECT subscription_end FROM public.company_subscriptions WHERE company_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [companyId]
    );

    let baseDate = new Date();
    if (subRes.rowCount && subRes.rows[0].subscription_end) {
      const currentEnd = new Date(subRes.rows[0].subscription_end);
      if (currentEnd > new Date()) {
        baseDate = currentEnd;
      }
    }

    const newEnd = new Date(baseDate);
    if (interval === "yearly") {
      newEnd.setFullYear(newEnd.getFullYear() + 1);
    } else {
      newEnd.setMonth(newEnd.getMonth() + 1);
    }

    await client.query(
      `UPDATE public.company_subscriptions
       SET 
         subscription_start = NOW(),
         subscription_end = $1,
         status = 'active',
         updated_at = NOW()
       WHERE company_id = $2`,
      [newEnd, companyId]
    );

    await client.query(
      `UPDATE public.companies
       SET status = 'LIVE',
           updated_at = NOW()
       WHERE id = $1`,
      [companyId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json({
      success: true,
      message: "Subscription renewed successfully",
      subscription_end: newEnd,
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
