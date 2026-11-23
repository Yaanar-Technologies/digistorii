import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff } from "@/lib/apiGuard";
import { getCompanyPlanAccess } from "@/lib/userResponsibilities";
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
      const companyRes = await client.query(
        `SELECT year_type, currency FROM public.companies WHERE id = $1`,
        [companyId]
      );
      const yearType = companyRes.rows[0]?.year_type === "calendar" ? "calendar" : "fiscal";
      const currency = companyRes.rows[0]?.currency || "INR";
      const planAccess = await getCompanyPlanAccess(client, companyId);

      const { searchParams } = new URL(req.url);
      const defaultRange = getYearRange(yearType);
      const startDate = searchParams.get("startDate") || defaultRange.from;
      const endDate = searchParams.get("endDate") || defaultRange.to;
      const channelFilter = searchParams.get("channel") || "all"; // 'all', 'pos', 'ecom'
      const search = (searchParams.get("search") || "").trim();

      const items: Array<{
        id: string | number;
        ref_no: string;
        txn_date: string;
        channel: "POS" | "E-Commerce";
        customer_name: string;
        payment_status: string;
        order_status?: string;
        payment_method?: string;
        total_amount: number;
        is_realized: boolean;
      }> = [];

      // 1. POS sales
      if (planAccess.pos_access && (channelFilter === "all" || channelFilter === "pos")) {
        const posQuery = `
          SELECT 
            sh.id,
            sh.sales_no AS ref_no,
            TO_CHAR(sh.sales_date, 'YYYY-MM-DD') AS txn_date,
            COALESCE(c.name, 'Walk-in Customer') AS customer_name,
            sh.payment_status,
            sh.total_amount
          FROM "${schema}".sales_header sh
          LEFT JOIN "${schema}".customers c ON c.id = sh.customer_id
          WHERE sh.sales_date >= $1::date AND sh.sales_date <= $2::date
          ORDER BY sh.sales_date DESC, sh.id DESC
          LIMIT 100
        `;
        const posRes = await client.query(posQuery, [startDate, endDate]);
        for (const row of posRes.rows) {
          items.push({
            id: `pos-${row.id}`,
            ref_no: row.ref_no,
            txn_date: row.txn_date,
            channel: "POS",
            customer_name: row.customer_name,
            payment_status: row.payment_status,
            total_amount: Number(row.total_amount),
            is_realized: row.payment_status === "paid",
          });
        }
      }

      // 2. E-Com orders
      if (planAccess.ecommerce_access && (channelFilter === "all" || channelFilter === "ecom")) {
        try {
          const ecomQuery = `
            SELECT 
              o.id,
              o.order_no AS ref_no,
              TO_CHAR(o.created_at, 'YYYY-MM-DD') AS txn_date,
              COALESCE(c.name, 'Online Customer') AS customer_name,
              o.payment_status,
              o.order_status,
              o.payment_method,
              o.total_amount
            FROM "${schema}".online_orders o
            LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
            WHERE DATE(o.created_at) >= $1::date AND DATE(o.created_at) <= $2::date
            ORDER BY o.created_at DESC
            LIMIT 100
          `;
          const ecomRes = await client.query(ecomQuery, [startDate, endDate]);
          for (const row of ecomRes.rows) {
            items.push({
              id: `ecom-${row.id}`,
              ref_no: row.ref_no,
              txn_date: row.txn_date,
              channel: "E-Commerce",
              customer_name: row.customer_name,
              payment_status: row.payment_status,
              order_status: row.order_status,
              payment_method: row.payment_method,
              total_amount: Number(row.total_amount),
              is_realized: row.payment_status === "paid",
            });
          }
        } catch (err) {
          console.error("Failed to load ecom revenue list:", err);
        }
      }

      // Sort unified items by date descending
      items.sort((a, b) => (b.txn_date > a.txn_date ? 1 : -1));

      // Filter by search if provided
      const filtered = search
        ? items.filter(
            (i) =>
              i.ref_no.toLowerCase().includes(search.toLowerCase()) ||
              i.customer_name.toLowerCase().includes(search.toLowerCase())
          )
        : items;

      return NextResponse.json({
        success: true,
        data: {
          currency,
          plan: planAccess,
          items: filtered,
        },
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Finance revenue API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load revenue" },
      { status: 500 }
    );
  }
}
