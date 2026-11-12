import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { requireStaff } from "@/lib/apiGuard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();

  try {
    const { company } = await params;
    const guard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: true });
    if (!guard.ok) return guard.response;

    const schema = guard.schema;

    const alertsRes = await client.query(
      `SELECT id, alert_type, severity, title, message, payload, is_resolved, created_at
       FROM "${schema}".admin_operational_alerts
       WHERE is_resolved = false
       ORDER BY CASE WHEN severity = 'CRITICAL' THEN 0 ELSE 1 END, created_at DESC
       LIMIT 10`
    );

    return NextResponse.json({
      success: true,
      alerts: alertsRes.rows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load operational alerts." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();

  try {
    const { company } = await params;
    const guard = await requireStaff(req, company, { permission: "ecommerce_access", requireEcom: true });
    if (!guard.ok) return guard.response;

    const schema = guard.schema;
    const body = await req.json();
    const alertId = Number(body?.alertId);

    if (!alertId) {
      return NextResponse.json({ success: false, error: "alertId is required." }, { status: 400 });
    }

    await client.query(
      `UPDATE "${schema}".admin_operational_alerts
       SET is_resolved = true,
           updated_at = NOW()
       WHERE id = $1`,
      [alertId]
    );

    return NextResponse.json({ success: true, message: "Alert resolved." });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to resolve alert." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

