import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { pool } from "@/lib/db";
//import { ensureDB } from "@/lib/ensure-db";
import { getTenantSchema } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  //await ensureDB();
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { company } = await getTenantSchema(req);
    const body = await req.json();
    const interval = String(body?.interval || "monthly").toLowerCase();

    if (!company) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "Tenant header is missing" },
        { status: 400 }
      );
    }

    if (interval !== "monthly" && interval !== "yearly") {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "Invalid interval. Must be 'monthly' or 'yearly'" },
        { status: 400 }
      );
    }

    const companyResult = await client.query(
      `SELECT id FROM public.companies WHERE subdomain_url = $1`,
      [company]
    );

    if (!companyResult.rowCount) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "Company not found" },
        { status: 404 }
      );
    }

    const companyId = Number(companyResult.rows[0].id);

    const subResult = await client.query(
      `SELECT plan_id FROM public.company_subscriptions WHERE company_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [companyId]
    );

    let planId = 1;
    if (subResult.rowCount) {
      planId = subResult.rows[0].plan_id;
    }

    const planResult = await client.query(
      `SELECT name, price_monthly, price_yearly FROM public.plans WHERE id = $1`,
      [planId]
    );

    if (!planResult.rowCount) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "Plan not found" },
        { status: 404 }
      );
    }

    const plan = planResult.rows[0];
    const amountInINR = interval === "yearly" ? Number(plan.price_yearly) : Number(plan.price_monthly);
    const amountInPaise = Math.round(amountInINR * 100);

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error("Razorpay credentials are not configured");
    }

    const razorpay = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `renew_${companyId}_${Date.now()}`,
    });

    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `INSERT INTO public.payments (
        company_id,
        plan_name,
        plan_price,
        billing_interval,
        amount,
        currency,
        status,
        payment_status,
        razorpay_order_id,
        payment_type,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id`,
      [
        companyId,
        plan.name,
        amountInINR,
        interval,
        amountInPaise,
        "INR",
        "created",
        "created",
        order.id,
        "SUBSCRIPTION_RENEWAL",
        JSON.stringify({ interval, planId }),
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json({
      success: true,
      interval,
      amount_inr: amountInINR,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      payment: {
        id: Number(result.rows[0].id),
        company_id: companyId,
      },
    });
  } catch (err: any) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    return NextResponse.json(
      {
        success: false,
        error: "ORDER_CREATION_FAILED",
        message: err?.message || "Unable to create payment order. Please try again.",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
