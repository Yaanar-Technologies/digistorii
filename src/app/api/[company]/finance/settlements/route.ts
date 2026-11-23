import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";
import { ensureFinanceSchema } from "@/lib/financeSchema";
import { getYearRange } from "@/lib/dateRange";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  try {
    const { company } = await params;
    const guard = await requireStaff(req, company, { permission: "finance_access" });
    if (!guard.ok) {
      return guard.response;
    }

    const { schema, companyId } = guard;
    const client = await pool.connect();

    try {
      await ensureFinanceSchema(client, schema);

      const companyRes = await client.query(
        `SELECT year_type, currency FROM public.companies WHERE id = $1`,
        [companyId]
      );
      const yearType = companyRes.rows[0]?.year_type === "calendar" ? "calendar" : "fiscal";
      const currency = companyRes.rows[0]?.currency || "INR";

      const { searchParams } = new URL(req.url);
      const defaultRange = getYearRange(yearType);
      const startDate = searchParams.get("startDate") || defaultRange.from;
      const endDate = searchParams.get("endDate") || defaultRange.to;
      const channel = searchParams.get("channel"); // optional filter

      let whereClause = `WHERE settled_at >= $1::date AND settled_at <= $2::date`;
      const values: any[] = [startDate, endDate];

      if (channel && (channel === "razorpay" || channel === "cod" || channel === "pos")) {
        whereClause += ` AND channel = $3`;
        values.push(channel);
      }

      const settlementsRes = await client.query(
        `SELECT 
           id,
           channel,
           settlement_ref,
           amount,
           fees,
           tax,
           net_amount,
           TO_CHAR(settled_at, 'YYYY-MM-DD') AS settled_at,
           bank_reference,
           status,
           notes,
           created_by,
           created_at
         FROM "${schema}".finance_settlements
         ${whereClause}
         ORDER BY settled_at DESC, id DESC
         LIMIT 100`,
        values
      );

      return NextResponse.json({
        success: true,
        data: {
          currency,
          items: settlementsRes.rows,
        },
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Finance settlements GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load settlements" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  try {
    const { company } = await params;
    const guard = await requireStaff(req, company, { permission: "finance_access" });
    if (!guard.ok) {
      return guard.response;
    }

    const { schema, staff } = guard;
    const client = await pool.connect();

    try {
      await ensureFinanceSchema(client, schema);

      const body = await req.json();
      const channel = String(body.channel || "").toLowerCase();
      const settlementRef = String(body.settlement_ref || "").trim();
      const amount = Number(body.amount);
      const fees = Number(body.fees || 0);
      const tax = Number(body.tax || 0);
      const netAmount = Number(body.net_amount ?? (amount - fees - tax));
      const settledAt = body.settled_at || new Date().toISOString().split("T")[0];
      const bankReference = String(body.bank_reference || "").trim();
      const notes = String(body.notes || "").trim();
      const status = String(body.status || "settled").toLowerCase();

      if (!channel || !["razorpay", "cod", "pos"].includes(channel)) {
        return NextResponse.json(
          { success: false, error: "Valid channel ('razorpay', 'cod', 'pos') is required" },
          { status: 400 }
        );
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { success: false, error: "Valid settlement amount is required" },
          { status: 400 }
        );
      }

      const userDisplay = staffDisplayName(staff);

      const insertRes = await client.query(
        `INSERT INTO "${schema}".finance_settlements
           (channel, settlement_ref, amount, fees, tax, net_amount, settled_at, bank_reference, status, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)
         RETURNING id, channel, settlement_ref, amount, fees, tax, net_amount, TO_CHAR(settled_at, 'YYYY-MM-DD') AS settled_at, bank_reference, status, notes, created_at`,
        [channel, settlementRef, amount, fees, tax, netAmount, settledAt, bankReference, status, notes, userDisplay]
      );

      return NextResponse.json({
        success: true,
        data: insertRes.rows[0],
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Finance settlements POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to record settlement" },
      { status: 500 }
    );
  }
}
