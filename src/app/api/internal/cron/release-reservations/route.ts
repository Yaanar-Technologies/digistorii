import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/reservationCleanup";

async function handleReleaseReservations(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const xCronSecret = req.headers.get("x-cron-secret");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;

    if (xCronSecret !== cronSecret && bearerToken !== cronSecret) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid or missing cron secret." },
        { status: 401 }
      );
    }
  }

  const poolClient = await pool.connect();
  let companies: Array<{ id: number; company_name: string; schema_name: string }> = [];

  try {
    const compRes = await poolClient.query(
      `SELECT id, company_name, schema_name
       FROM public.companies
       WHERE schema_name IS NOT NULL`
    );
    companies = compRes.rows;
  } catch (err: any) {
    console.error("[Cron:ReleaseReservations] Failed to fetch company schemas:", err);
    return NextResponse.json(
      { success: false, error: "Failed to query tenant schemas." },
      { status: 500 }
    );
  } finally {
    poolClient.release();
  }

  const results: Array<{
    companyId: number;
    companyName: string;
    schema: string;
    releasedCount: number;
    status: "success" | "error";
    error?: string;
  }> = [];

  let totalReleased = 0;

  for (const company of companies) {
    const tenantClient = await pool.connect();
    try {
      await tenantClient.query("BEGIN");
      const released = await releaseExpiredReservations(tenantClient, company.schema_name);
      await tenantClient.query("COMMIT");

      totalReleased += released;
      results.push({
        companyId: company.id,
        companyName: company.company_name,
        schema: company.schema_name,
        releasedCount: released,
        status: "success",
      });
    } catch (tenantErr: any) {
      try {
        await tenantClient.query("ROLLBACK");
      } catch (rbErr) {
        console.error(`[Cron:ReleaseReservations] Rollback failed for ${company.schema_name}:`, rbErr);
      }
      console.error(
        `[Cron:ReleaseReservations] Error processing schema '${company.schema_name}':`,
        tenantErr
      );
      results.push({
        companyId: company.id,
        companyName: company.company_name,
        schema: company.schema_name,
        releasedCount: 0,
        status: "error",
        error: tenantErr.message || String(tenantErr),
      });
    } finally {
      tenantClient.release();
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    totalReleased,
    tenantCount: companies.length,
    results,
  });
}

export async function POST(req: NextRequest) {
  return handleReleaseReservations(req);
}

export async function GET(req: NextRequest) {
  return handleReleaseReservations(req);
}
