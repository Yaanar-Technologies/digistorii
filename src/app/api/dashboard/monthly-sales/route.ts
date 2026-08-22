import { NextRequest, NextResponse } from "next/server";
import { getTenantSchema } from "@/lib/tenant";
import { getMonthlySales } from "@/lib/dashboardService";

export async function GET(req: NextRequest) {
  try {
    const { schema } = await getTenantSchema(req);
    
    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const yearType = searchParams.get("yearType") || "fiscal";
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    if (!fromDate || !toDate) {
      return NextResponse.json({ success: false, error: "fromDate and toDate are required" }, { status: 400 });
    }

    const data = await getMonthlySales(schema, yearType, fromDate, toDate);

    return NextResponse.json({
      success: true,
      data
    });

  } catch (err: any) {
    console.error("Monthly Sales API Error", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Monthly sales fetch failed"
      },
      { status: 500 }
    );
  }
}