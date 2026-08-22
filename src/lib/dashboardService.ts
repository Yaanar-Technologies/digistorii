
import { pool } from "@/lib/db";
 
export const getDashboardMetrics = async (schema: string) => {
  try {
    console.log("Dashboard Metrics Fetch Start");
    console.log("Tenant Schema:", schema);
 
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM ${schema}.customers) AS customers,
        (SELECT COUNT(*)::int FROM ${schema}.sales_header) AS orders,
 
        /* customer growth */
        (SELECT COUNT(*) FROM ${schema}.customers
         WHERE created_at >= NOW() - INTERVAL '30 days') AS customer_current,
 
        (SELECT COUNT(*) FROM ${schema}.customers
         WHERE created_at >= NOW() - INTERVAL '60 days'
         AND created_at < NOW() - INTERVAL '30 days') AS customer_previous,
 
        /* order growth */
        (SELECT COUNT(*) FROM ${schema}.sales_header
         WHERE created_at >= NOW() - INTERVAL '30 days') AS order_current,
 
        (SELECT COUNT(*) FROM ${schema}.sales_header
         WHERE created_at >= NOW() - INTERVAL '60 days'
         AND created_at < NOW() - INTERVAL '30 days') AS order_previous
    `);
 
    const row = result.rows[0];
 
    const customers = Number(row.customers || 0);
    const orders = Number(row.orders || 0);
 
    const customerCurrent = Number(row.customer_current || 0);
    const customerPrevious = Number(row.customer_previous || 0);
 
    const orderCurrent = Number(row.order_current || 0);
    const orderPrevious = Number(row.order_previous || 0);
 
    // console.log("Customers:", customers);
    // console.log("Orders:", orders);
    // console.log("Customer Current:", customerCurrent);
    // console.log("Customer Previous:", customerPrevious);
    // console.log("Order Current:", orderCurrent);
    // console.log("Order Previous:", orderPrevious);
 
    const customerGrowth =
      customerPrevious === 0
        ? 0
        : Number((((customerCurrent - customerPrevious) / customerPrevious) * 100).toFixed(2));
 
    const orderGrowth =
      orderPrevious === 0
        ? 0
        : Number((((orderCurrent - orderPrevious) / orderPrevious) * 100).toFixed(2));
 
    const metrics = {
      customers,
      orders,
      customerGrowth,
      orderGrowth,
    };
    // console.log("Dashboard Metrics Result:", metrics);
    return metrics;
  } catch (error: any) {
    /* DB Error Logging */
    console.error("Dashboard Metrics DB Error");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("Detail:", error.detail);
    console.error("Stack:", error.stack);
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
 