import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { pool } from "@/lib/db";
//import { ensureDB } from "@/lib/ensure-db";
import {
  normalizeBillingInterval,
} from "@/lib/onboarding";

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  //await ensureDB();
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const body = await req.json();
    const companyId = Number(body?.company_id || 0);
    const planId = Number(body?.plan_id || 0);
    const planNameInput = String(body?.plan_name || "").trim();
    const billingInterval = normalizeBillingInterval(body?.billing_interval);

    if (!companyId || (!planId && !planNameInput)) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          message: "Missing required fields",
        },
        { status: 400 }
      );
    }

    const planParams: unknown[] = [];
    let planWhere = "";
    if (Number.isInteger(planId) && planId > 0) {
      planParams.push(planId);
      planWhere = "id = $1";
    } else {
      planParams.push(planNameInput.toUpperCase());
      planWhere = "UPPER(name) = $1";
    }
    const planResult = await client.query(
      `SELECT id, name, price_monthly, price_yearly
       FROM public.plans
       WHERE ${planWhere} AND is_active = TRUE
       LIMIT 1`,
      planParams
    );
    if (!planResult.rowCount) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          message: "Selected plan is not available",
        },
        { status: 400 }
      );
    }
    const planRow = planResult.rows[0];
    const normalizedPlanName = String(planRow.name || "").toUpperCase();
    const amountInINR =
      billingInterval === "yearly"
        ? Number(planRow.price_yearly || 0)
        : Number(planRow.price_monthly || 0);

    if (!toPositiveNumber(amountInINR)) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          message: "Invalid plan or amount selected",
        },
        { status: 400 }
      );
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const paidCheck = await client.query(
      `SELECT id
       FROM public.payments
       WHERE company_id = $1
         AND UPPER(plan_name) = $2
         AND COALESCE(LOWER(billing_interval), 'monthly') = $3
         AND (
           LOWER(COALESCE(payment_status, '')) = 'paid'
           OR LOWER(COALESCE(status, '')) = 'paid'
         )
       LIMIT 1`,
      [companyId, normalizedPlanName, billingInterval]
    );

    if (paidCheck.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return NextResponse.json(
        {
          success: false,
          error: "ALREADY_SUBSCRIBED",
          message: "You already have an active subscription for this billing cycle.",
          already_paid: true,
        },
        { status: 400 }
      );
    }

    const existing = await client.query(
      `SELECT id, razorpay_order_id, amount
       FROM public.payments
       WHERE company_id = $1
         AND UPPER(plan_name) = $2
         AND COALESCE(LOWER(billing_interval), 'monthly') = $3
         AND amount = $4
         AND LOWER(COALESCE(payment_status, status, 'created')) = 'created'
       ORDER BY id DESC
       LIMIT 1`,
      [companyId, normalizedPlanName, billingInterval, Math.round(amountInINR * 100)]
    );

    if (existing.rowCount) {
      await client.query("COMMIT");
      transactionStarted = false;

      return NextResponse.json({
        success: true,
        reused: true,
        billing_interval: billingInterval,
        amount_inr: amountInINR,
        order: {
          id: existing.rows[0].razorpay_order_id,
          amount: Number(existing.rows[0].amount),
          currency: "INR",
        },
        payment: {
          id: Number(existing.rows[0].id),
          company_id: companyId,
          plan_name: normalizedPlanName,
        },
      });
    }

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new Error("Razorpay credentials are not configured");
    }

    const razorpay = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });

    const amountInPaise = Math.round(amountInINR * 100);
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${companyId}_${Date.now()}`,
    });

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
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
      RETURNING id`,
      [
        companyId,
        normalizedPlanName,
        amountInINR,
        billingInterval,
        amountInPaise,
        "INR",
        "created",
        "created",
        order.id,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json({
      success: true,
      reused: false,
      billing_interval: billingInterval,
      amount_inr: amountInINR,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      payment: {
        id: Number(result.rows[0].id),
        company_id: companyId,
        plan_name: normalizedPlanName,
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
