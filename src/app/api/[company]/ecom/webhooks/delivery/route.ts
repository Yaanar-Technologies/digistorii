import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { POST as partnerHandler } from "./[partner]/route";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;

  // 1. Determine courier partner from query param, header, body hint, or store configuration
  const searchParams = req.nextUrl.searchParams;
  let partner = searchParams.get("partner") || req.headers.get("x-courier-partner");

  if (!partner) {
    if (req.headers.get("x-shiprocket-signature") || req.headers.get("x-api-key")) {
      partner = "shiprocket";
    } else if (req.headers.get("x-delhivery-signature") || req.headers.get("x-delhivery-token")) {
      partner = "delhivery";
    }
  }

  // Fallback to tenant configured delivery_partner
  if (!partner) {
    try {
      const tenantInfo = await getTenantSchemaByCompany(company);
      const res = await pool.query(
        `SELECT delivery_partner FROM "${tenantInfo.schema}".ecom_settings LIMIT 1`
      );
      if (res.rowCount && res.rows[0].delivery_partner) {
        partner = res.rows[0].delivery_partner.toLowerCase();
      }
    } catch {}
  }

  if (!partner) {
    partner = "shiprocket"; // Default carrier integration fallback
  }

  // Delegate directly to the carrier handler
  return partnerHandler(req, {
    params: Promise.resolve({ company, partner }),
  });
}

