
import { pool } from "@/lib/db";
 
export const getDashboardMetrics = async (schema: string) => {
  try {
    // 1. Plan-agnostic check for table existence
    const tableCheck = await pool.query(`
      SELECT
        to_regclass('${schema}.sales_header') IS NOT NULL AS has_pos,
        to_regclass('${schema}.online_orders') IS NOT NULL AS has_ecom
    `);

    const hasPos = Boolean(tableCheck.rows[0]?.has_pos);
    const hasEcom = Boolean(tableCheck.rows[0]?.has_ecom);

    // 2. Fetch POS & Online Order sales metrics in parallel
    const [posRes, ecomRes] = await Promise.all([
      hasPos
        ? pool.query(`
            SELECT
              COUNT(*) FILTER (
                WHERE COALESCE(sales_date, created_at::date) = CURRENT_DATE
              )::int AS today_count,
              COALESCE(SUM(total_amount) FILTER (
                WHERE COALESCE(sales_date, created_at::date) = CURRENT_DATE
              ), 0)::numeric AS today_revenue,
              COUNT(*) FILTER (
                WHERE COALESCE(sales_date, created_at::date) = CURRENT_DATE - 1
              )::int AS yesterday_count,
              COALESCE(SUM(total_amount) FILTER (
                WHERE COALESCE(sales_date, created_at::date) = CURRENT_DATE - 1
              ), 0)::numeric AS yesterday_revenue
            FROM "${schema}".sales_header
          `)
        : Promise.resolve({ rows: [{ today_count: 0, today_revenue: 0, yesterday_count: 0, yesterday_revenue: 0 }] }),

      hasEcom
        ? pool.query(`
            SELECT
              COUNT(*) FILTER (
                WHERE order_status != 'cancelled'
                  AND created_at::date = CURRENT_DATE
              )::int AS today_count,
              COALESCE(SUM(total_amount) FILTER (
                WHERE order_status != 'cancelled'
                  AND created_at::date = CURRENT_DATE
              ), 0)::numeric AS today_revenue,
              COUNT(*) FILTER (
                WHERE order_status != 'cancelled'
                  AND created_at::date = CURRENT_DATE - 1
              )::int AS yesterday_count,
              COALESCE(SUM(total_amount) FILTER (
                WHERE order_status != 'cancelled'
                  AND created_at::date = CURRENT_DATE - 1
              ), 0)::numeric AS yesterday_revenue
            FROM "${schema}".online_orders
          `)
        : Promise.resolve({ rows: [{ today_count: 0, today_revenue: 0, yesterday_count: 0, yesterday_revenue: 0 }] }),
    ]);

    const posRow = posRes.rows[0] || {};
    const ecomRow = ecomRes.rows[0] || {};

    const todaySalesCount = Number(posRow.today_count || 0) + Number(ecomRow.today_count || 0);
    const todayRevenue = Number(posRow.today_revenue || 0) + Number(ecomRow.today_revenue || 0);

    const yesterdaySalesCount = Number(posRow.yesterday_count || 0) + Number(ecomRow.yesterday_count || 0);
    const yesterdayRevenue = Number(posRow.yesterday_revenue || 0) + Number(ecomRow.yesterday_revenue || 0);

    // Card 2: Today AOV = today_revenue / today_count (0 if count is 0)
    const todayAov = todaySalesCount > 0 ? Number((todayRevenue / todaySalesCount).toFixed(2)) : 0;
    const yesterdayAov = yesterdaySalesCount > 0 ? Number((yesterdayRevenue / yesterdaySalesCount).toFixed(2)) : 0;

    // Card 1 Trend: Today's sales count vs Yesterday's sales count
    let salesCountGrowth = 0;
    if (yesterdaySalesCount === 0) {
      salesCountGrowth = todaySalesCount > 0 ? 100 : 0;
    } else {
      salesCountGrowth = Number((((todaySalesCount - yesterdaySalesCount) / yesterdaySalesCount) * 100).toFixed(2));
    }

    // Card 2 Trend: Today's AOV vs Yesterday's AOV
    let aovGrowth = 0;
    if (yesterdayAov === 0) {
      aovGrowth = todayAov > 0 ? 100 : 0;
    } else {
      aovGrowth = Number((((todayAov - yesterdayAov) / yesterdayAov) * 100).toFixed(2));
    }

    const metrics = {
      todaySalesCount,
      salesCountGrowth,
      todayAov,
      aovGrowth,
      todayRevenue,
      yesterdaySalesCount,
      yesterdayRevenue,
      yesterdayAov,

      // Legacy fallback keys
      customers: 0,
      orders: todaySalesCount,
      customerGrowth: salesCountGrowth,
      orderGrowth: aovGrowth,
    };

    return metrics;
  } catch (error: any) {
    console.error("Dashboard Metrics DB Error:", error);
    throw new Error("Database error while fetching dashboard metrics");
  }
};
 
 
export const getMonthlySales = async (schema: string, yearType: string, fromDate: string, toDate: string) => {
  try {
    const isFiscal = yearType === 'fiscal';
    
    // Create an ordered list of months depending on the year type
    // Fiscal: 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3
    // Calendar: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    const monthValues = isFiscal
      ? "(1,4),(2,5),(3,6),(4,7),(5,8),(6,9),(7,10),(8,11),(9,12),(10,1),(11,2),(12,3)"
      : "(1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(7,7),(8,8),(9,9),(10,10),(11,11),(12,12)";

    const result = await pool.query(`
      SELECT
        m.month,
        COALESCE(SUM(p.total_amount),0) AS sales
      FROM (VALUES ${monthValues}) m(idx, month)
      LEFT JOIN ${schema}.sales_header p
        ON EXTRACT(MONTH FROM p.created_at) = m.month
        AND p.created_at >= $1::date 
        AND p.created_at <= $2::date
      GROUP BY m.idx, m.month
      ORDER BY m.idx
    `, [fromDate, toDate]);

    const monthlySales = result.rows.map((row: any) => Number(row.sales));

    return monthlySales;
  } catch (error: any) {
    console.error("Monthly Sales DB Error");
    console.error("Message:", error.message);
    throw new Error("Database error while fetching monthly sales");
  }
};
 
export const getMonthlyTargetMetrics = async (schema: string, salesTarget: number) => {
  try {
 
    // console.log("Monthly Target Fetch Start");
    // console.log("Tenant Schema:", schema);
 
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(total_amount) FILTER (
          WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
        ),0) AS revenue,
 
        COALESCE(SUM(total_amount) FILTER (
          WHERE created_at::date = CURRENT_DATE
        ),0) AS today_revenue
 
      FROM ${schema}.sales_header
    `);
 
    const revenue = Number(result.rows[0].revenue || 0);
    const todayRevenue = Number(result.rows[0].today_revenue || 0);
 
    /* Example fixed target (can come from settings) */
    // console.log("getMonthlyTargetMetrics salesTarget : ",salesTarget);
    const target: number = salesTarget;
 
    const progress = target === 0 ? 0 : Number(((revenue / target) * 100).toFixed(2));
 
    const data = {
      target,
      revenue,
      todayRevenue,
      progress
    };
 
    // console.log("Monthly Target Result:", data);
    return data;
  } catch (error: any) {
    console.error("Monthly Target DB Error");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("Detail:", error.detail);
    console.error("Stack:", error.stack);
    throw new Error("Database error while fetching monthly target");
 
  }
};
 
export const getStatisticsChart = async (schema: string, yearType: string, fromDate: string, toDate: string) => {
  try {
    const isFiscal = yearType === 'fiscal';
    const monthValues = isFiscal
      ? "(1,4),(2,5),(3,6),(4,7),(5,8),(6,9),(7,10),(8,11),(9,12),(10,1),(11,2),(12,3)"
      : "(1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(7,7),(8,8),(9,9),(10,10),(11,11),(12,12)";

    const result = await pool.query(`
      SELECT
        m.month,
        COALESCE(COUNT(p.id),0) AS sales,
        COALESCE(SUM(p.total_amount),0) AS revenue
      FROM (VALUES ${monthValues}) m(idx, month)
      LEFT JOIN ${schema}.sales_header p
        ON EXTRACT(MONTH FROM p.created_at) = m.month
        AND p.created_at >= $1::date
        AND p.created_at <= $2::date
      GROUP BY m.idx, m.month
      ORDER BY m.idx
    `, [fromDate, toDate]);

    const sales: number[] = [];
    const revenue: number[] = [];

    result.rows.forEach((row: any) => {
      sales.push(Number(row.sales));
      revenue.push(Number(row.revenue));
    });

    const data = {
      sales,
      revenue
    };

    return data;
  } catch (error: any) {
    console.error("Statistics Chart DB Error");
    console.error("Message:", error.message);
    throw new Error("Database error while fetching statistics chart");
  }
};
 