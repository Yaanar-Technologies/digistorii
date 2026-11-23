import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff } from "@/lib/apiGuard";
import { ensureFinanceSchema } from "@/lib/financeSchema";
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
      await ensureFinanceSchema(client, schema);

      // 1. Fetch company year_type & plan access
      const companyRes = await client.query(
        `SELECT year_type, currency FROM public.companies WHERE id = $1`,
        [companyId]
      );
      const yearType: "fiscal" | "calendar" =
        companyRes.rows[0]?.year_type === "calendar" ? "calendar" : "fiscal";
      const currency = companyRes.rows[0]?.currency || "INR";

      const planAccess = await getCompanyPlanAccess(client, companyId);
      const isPos = planAccess.pos_access;
      const isEcom = planAccess.ecommerce_access;

      // 2. Date range
      const { searchParams } = new URL(req.url);
      const defaultRange = getYearRange(yearType);
      const startDate = searchParams.get("startDate") || defaultRange.from;
      const endDate = searchParams.get("endDate") || defaultRange.to;

      // 3. POS Revenue
      let posGross = 0;
      let posReturns = 0;
      let posModes: Array<{ mode_id: number; mode_name: string; amount: number }> = [];

      if (isPos) {
        const posRes = await client.query(
          `SELECT COALESCE(SUM(total_amount), 0) AS gross_total
           FROM "${schema}".sales_header
           WHERE payment_status = 'paid'
             AND sales_date >= $1::date AND sales_date <= $2::date`,
          [startDate, endDate]
        );
        posGross = Number(posRes.rows[0]?.gross_total || 0);

        try {
          const retRes = await client.query(
            `SELECT COALESCE(SUM(refund_amount), 0) AS return_total
             FROM "${schema}".sales_returns
             WHERE txn_date >= $1::date AND txn_date <= $2::date`,
            [startDate, endDate]
          );
          posReturns = Number(retRes.rows[0]?.return_total || 0);
        } catch {
          posReturns = 0;
        }

        try {
          const modesRes = await client.query(
            `SELECT 
               pm.id AS mode_id,
               pm.name AS mode_name,
               COALESCE(SUM(COALESCE(NULLIF(sp.actual_amount, 0), sp.amount)), 0) AS amount
             FROM "${schema}".sales_payments sp
             JOIN "${schema}".sales_header sh ON sh.id = sp.sales_id
             JOIN "${schema}".payment_modes pm ON pm.id = sp.payment_mode_id
             WHERE sh.payment_status = 'paid'
               AND sh.sales_date >= $1::date AND sh.sales_date <= $2::date
             GROUP BY pm.id, pm.name
             ORDER BY amount DESC`,
            [startDate, endDate]
          );
          posModes = modesRes.rows.map((r) => ({
            mode_id: Number(r.mode_id),
            mode_name: String(r.mode_name),
            amount: Number(r.amount),
          }));
        } catch {
          posModes = [];
        }
      }

      const netPosRevenue = Math.max(0, posGross - posReturns);

      // 4. E-Com Revenue & COD Receivables
      let ecomPaidRevenue = 0;
      let pendingCodReceivables = 0;
      let pendingCodCount = 0;
      let ecomMethods: Array<{ method: string; count: number; total: number }> = [];

      if (isEcom) {
        try {
          const ecomPaidRes = await client.query(
            `SELECT COALESCE(SUM(total_amount), 0) AS total_paid
             FROM "${schema}".online_orders
             WHERE payment_status = 'paid'
               AND DATE(created_at) >= $1::date AND DATE(created_at) <= $2::date`,
            [startDate, endDate]
          );
          ecomPaidRevenue = Number(ecomPaidRes.rows[0]?.total_paid || 0);

          const codPendingRes = await client.query(
            `SELECT 
               COALESCE(SUM(total_amount), 0) AS total_pending,
               COUNT(*) AS pending_count
             FROM "${schema}".online_orders
             WHERE payment_method = 'cod'
               AND payment_status != 'paid'
               AND order_status NOT IN ('cancelled', 'refunded', 'payment_failed')
               AND DATE(created_at) >= $1::date AND DATE(created_at) <= $2::date`,
            [startDate, endDate]
          );
          pendingCodReceivables = Number(codPendingRes.rows[0]?.total_pending || 0);
          pendingCodCount = Number(codPendingRes.rows[0]?.pending_count || 0);

          const methodsRes = await client.query(
            `SELECT 
               COALESCE(payment_method, 'other') AS method,
               COUNT(*) AS count,
               COALESCE(SUM(total_amount), 0) AS total
             FROM "${schema}".online_orders
             WHERE payment_status = 'paid'
               AND DATE(created_at) >= $1::date AND DATE(created_at) <= $2::date
             GROUP BY payment_method
             ORDER BY total DESC`,
            [startDate, endDate]
          );
          ecomMethods = methodsRes.rows.map((r) => ({
            method: String(r.method),
            count: Number(r.count),
            total: Number(r.total),
          }));
        } catch (err) {
          console.error("Ecom finance fetch error:", err);
        }
      }

      // 5. Total Realized Revenue based on plan
      let totalRevenue = 0;
      if (isPos && isEcom) {
        totalRevenue = netPosRevenue + ecomPaidRevenue;
      } else if (isPos) {
        totalRevenue = netPosRevenue;
      } else if (isEcom) {
        totalRevenue = ecomPaidRevenue;
      }

      // 6. Purchase Expenses (COGS): Count ONLY after GRN is fully completed (ph.status = 'Completed')
      let purchaseGross = 0;
      let purchaseReturns = 0;
      let completedPoCount = 0;

      try {
        const poRes = await client.query(
          `SELECT 
             COALESCE(SUM(total_amount), 0) AS gross_po,
             COUNT(*) AS count
           FROM "${schema}".purchase_header
           WHERE status = 'Completed'
             AND purchase_date >= $1::date AND purchase_date <= $2::date`,
          [startDate, endDate]
        );
        purchaseGross = Number(poRes.rows[0]?.gross_po || 0);
        completedPoCount = Number(poRes.rows[0]?.count || 0);

        const poRetRes = await client.query(
          `SELECT COALESCE(SUM(refund_amount), 0) AS ret_po
           FROM "${schema}".purchase_returns
           WHERE txn_date >= $1::date AND txn_date <= $2::date`,
          [startDate, endDate]
        );
        purchaseReturns = Number(poRetRes.rows[0]?.ret_po || 0);
      } catch (err) {
        console.error("Purchase expense fetch error:", err);
      }

      const netPurchaseExpenses = Math.max(0, purchaseGross - purchaseReturns);

      // 7. Manual Overheads from finance_expenses
      const overheadsRes = await client.query(
        `SELECT 
           COALESCE(SUM(amount), 0) AS total_overheads,
           COUNT(*) AS count
         FROM "${schema}".finance_expenses
         WHERE expense_date >= $1::date AND expense_date <= $2::date`,
        [startDate, endDate]
      );
      const totalOverheads = Number(overheadsRes.rows[0]?.total_overheads || 0);
      const overheadCount = Number(overheadsRes.rows[0]?.count || 0);

      const overheadsByCatRes = await client.query(
        `SELECT 
           category,
           COALESCE(SUM(amount), 0) AS amount,
           COUNT(*) AS count
         FROM "${schema}".finance_expenses
         WHERE expense_date >= $1::date AND expense_date <= $2::date
         GROUP BY category
         ORDER BY amount DESC`,
        [startDate, endDate]
      );
      const overheadsByCategory = overheadsByCatRes.rows.map((r) => ({
        category: String(r.category),
        amount: Number(r.amount),
        count: Number(r.count),
      }));

      // 8. Settlements Summary
      let settledRazorpay = 0;
      let razorpayFees = 0;
      let settledCod = 0;

      if (isEcom) {
        const settlementsRes = await client.query(
          `SELECT 
             channel,
             COALESCE(SUM(net_amount), 0) AS settled_net,
             COALESCE(SUM(fees + tax), 0) AS fees_total
           FROM "${schema}".finance_settlements
           WHERE status = 'settled'
             AND settled_at >= $1::date AND settled_at <= $2::date
           GROUP BY channel`,
          [startDate, endDate]
        );
        for (const row of settlementsRes.rows) {
          if (row.channel === "razorpay") {
            settledRazorpay = Number(row.settled_net);
            razorpayFees = Number(row.fees_total);
          } else if (row.channel === "cod") {
            settledCod = Number(row.settled_net);
          }
        }
      }

      // 9. Profit & Loss calculations
      const totalExpenses = netPurchaseExpenses + totalOverheads;
      const grossProfit = totalRevenue - netPurchaseExpenses;
      const netProfit = totalRevenue - totalExpenses;
      const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return NextResponse.json({
        success: true,
        data: {
          currency,
          yearType,
          dateRange: {
            from: startDate,
            to: endDate,
          },
          plan: {
            pos_access: isPos,
            ecommerce_access: isEcom,
          },
          kpis: {
            totalRevenue,
            netPurchaseExpenses,
            totalOverheads,
            totalExpenses,
            grossProfit,
            netProfit,
            grossMarginPct: Number(grossMarginPct.toFixed(1)),
            netMarginPct: Number(netMarginPct.toFixed(1)),
            pendingCodReceivables,
            pendingCodCount,
          },
          revenue: {
            pos: {
              gross: posGross,
              returns: posReturns,
              net: netPosRevenue,
              modes: posModes,
            },
            ecom: {
              realized: ecomPaidRevenue,
              pendingCod: pendingCodReceivables,
              pendingCodCount,
              methods: ecomMethods,
            },
          },
          expenses: {
            cogs: {
              gross: purchaseGross,
              returns: purchaseReturns,
              net: netPurchaseExpenses,
              completedPoCount,
            },
            overheads: {
              total: totalOverheads,
              count: overheadCount,
              byCategory: overheadsByCategory,
            },
          },
          settlements: {
            razorpay: {
              collected: ecomPaidRevenue,
              settled: settledRazorpay,
              fees: razorpayFees,
              pending: Math.max(0, ecomPaidRevenue - (settledRazorpay + razorpayFees)),
            },
            cod: {
              pendingReceivables: pendingCodReceivables,
              settled: settledCod,
            },
          },
        },
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Finance overview API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load finance overview" },
      { status: 500 }
    );
  }
}
