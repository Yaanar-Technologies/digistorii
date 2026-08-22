import { NextResponse } from "next/server";
//import { ensureDB } from "@/lib/ensure-db";
import { pool } from "@/lib/db";
import { normalizeBillingInterval } from "@/lib/onboarding";

function normalizeFeatures(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeFeatures(parsed);
    } catch {
      return value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export async function GET(req: Request) {
  //await ensureDB();
  const client = await pool.connect();

  try {
    const url = new URL(req.url);
    const billingCycle = normalizeBillingInterval(url.searchParams.get("billing_cycle"));
    const planId = Number(url.searchParams.get("plan_id") || 0);

    await client.query(`ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS billing_period VARCHAR(50) DEFAULT 'Monthly / Yearly'`);
    await client.query(`ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await client.query(`ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0`);

    const params: unknown[] = [];
    let where = "WHERE is_active = TRUE";
    if (Number.isInteger(planId) && planId > 0) {
      params.push(planId);
      where += ` AND id = $${params.length}`;
    }

    const result = await client.query(
      `SELECT id, name, price_monthly, price_yearly, billing_period, features
       FROM public.plans
       ${where}
       ORDER BY display_order ASC, id ASC`,
      params
    );

    const plans = result.rows.map((row) => {
      const price = billingCycle === "yearly" ? Number(row.price_yearly || 0) : Number(row.price_monthly || 0);
      return {
        plan_id: Number(row.id),
        plan_name: String(row.name || ""),
        amount: price,
        price,
        billing_cycle: billingCycle,
        billing_period: billingCycle === "yearly" ? "Yearly" : "Monthly",
        available_billing_period: String(row.billing_period || "Monthly / Yearly"),
        features: normalizeFeatures(row.features),
        price_monthly: Number(row.price_monthly || 0),
        price_yearly: Number(row.price_yearly || 0),
      };
    });

    return NextResponse.json({ success: true, plans });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Unable to load plans" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
