import { NextRequest, NextResponse } from "next/server";
import { getTenantSchema } from "@/lib/tenant";
import { getStatisticsChart } from "@/lib/dashboardService";

export async function GET(req: NextRequest) {
    try {
        const { schema } = await getTenantSchema(req);

        const searchParams = req.nextUrl.searchParams;
        const yearType = searchParams.get("yearType") || "fiscal";
        const fromDate = searchParams.get("fromDate");
        const toDate = searchParams.get("toDate");

        if (!fromDate || !toDate) {
            return NextResponse.json({ success: false, error: "fromDate and toDate are required" }, { status: 400 });
        }

        const data = await getStatisticsChart(schema, yearType, fromDate, toDate);

        return NextResponse.json({
            success: true,
            data
        });

    } catch (err: any) {
        console.error("Statistics API Error:", err);
        return NextResponse.json(
            {
                success: false,
                error: err.message || "Statistics fetch failed"
            },
            { status: 500 }
        );
    }

}