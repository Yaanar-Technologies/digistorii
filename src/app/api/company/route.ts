// Public: returns only the display name for a company slug (used by login pages).
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const company = url.searchParams.get("company");

  if (!company) {
    return NextResponse.json({ success: false, message: "Company required" }, { status: 400 });
  }

  try {
    const res = await pool.query(
      `SELECT company_name FROM public.companies WHERE subdomain_url = $1 LIMIT 1`,
      [company]
    );

    if (res.rowCount && res.rows[0].company_name) {
      return NextResponse.json({
        success: true,
        company_name: res.rows[0].company_name, // "DK Designs"
      });
    }

    return NextResponse.json({ success: false, message: "Company not found" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}