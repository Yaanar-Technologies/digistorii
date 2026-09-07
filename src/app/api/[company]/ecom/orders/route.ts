import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();

  try {
    const { company } = await params;
    let schema = "";

    try {
      const tenantInfo = await getTenantSchema(req);
      schema = tenantInfo.schema;
    } catch {
      const tenantInfo = await getTenantSchemaByCompany(company);
      schema = tenantInfo.schema;
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const paymentStatus = searchParams.get("payment_status") || "";
    const deliveryStatus = searchParams.get("delivery_status") || "";
    const fromDate = searchParams.get("from_date") || "";
    const toDate = searchParams.get("to_date") || "";
    const search = (searchParams.get("search") || "").trim();

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)));
    const offset = (page - 1) * pageSize;

    // Build filter conditions
    const whereConditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`o.order_status = $${paramIndex++}`);
      values.push(status);
    }

    if (paymentStatus) {
      whereConditions.push(`o.payment_status = $${paramIndex++}`);
      values.push(paymentStatus);
    }

    if (deliveryStatus) {
      whereConditions.push(`o.delivery_status = $${paramIndex++}`);
      values.push(deliveryStatus);
    }

    if (fromDate) {
      whereConditions.push(`o.created_at >= $${paramIndex++}::timestamp`);
      values.push(`${fromDate} 00:00:00`);
    }

    if (toDate) {
      whereConditions.push(`o.created_at <= $${paramIndex++}::timestamp`);
      values.push(`${toDate} 23:59:59`);
    }

    if (search) {
      whereConditions.push(
        `(o.order_no ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`
      );
      values.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // 1. Total count query
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM "${schema}".online_orders o
      LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
      ${whereClause}
    `;
    const countRes = await client.query(countQuery, values);
    const total = parseInt(countRes.rows[0]?.total || "0", 10);

    // 2. Paginated orders query
    const ordersQuery = `
      SELECT
        o.id,
        o.order_no,
        o.customer_id,
        COALESCE(c.name, 'Guest Customer') AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        o.order_status,
        o.payment_status,
        o.delivery_status,
        o.payment_method,
        o.subtotal,
        o.tax_amount,
        o.shipping_fee,
        o.discount_amount,
        o.total_amount,
        o.currency,
        o.created_at,
        (
          SELECT COUNT(*)
          FROM "${schema}".online_order_items oi
          WHERE oi.order_id = o.id
        ) AS items_count
      FROM "${schema}".online_orders o
      LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const ordersRes = await client.query(ordersQuery, [...values, pageSize, offset]);

    // 3. Status summary counts across all orders for top filter chips
    const summaryRes = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE order_status = 'placed') AS placed,
        COUNT(*) FILTER (WHERE order_status = 'confirmed') AS confirmed,
        COUNT(*) FILTER (WHERE order_status = 'packed') AS packed,
        COUNT(*) FILTER (WHERE order_status = 'shipped') AS shipped,
        COUNT(*) FILTER (WHERE order_status = 'out_for_delivery') AS out_for_delivery,
        COUNT(*) FILTER (WHERE order_status = 'delivered') AS delivered,
        COUNT(*) FILTER (WHERE order_status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE order_status = 'payment_failed') AS payment_failed,
        COUNT(*) FILTER (WHERE order_status = 'returned') AS returned,
        COUNT(*) FILTER (WHERE order_status = 'refunded') AS refunded,
        COUNT(*) FILTER (WHERE payment_status = 'pending') AS payment_pending,
        COUNT(*) FILTER (WHERE payment_status = 'paid') AS payment_paid
      FROM "${schema}".online_orders
    `);

    const summaryRow = summaryRes.rows[0] || {};
    const summary = {
      total: parseInt(summaryRow.total || "0", 10),
      placed: parseInt(summaryRow.placed || "0", 10),
      confirmed: parseInt(summaryRow.confirmed || "0", 10),
      packed: parseInt(summaryRow.packed || "0", 10),
      shipped: parseInt(summaryRow.shipped || "0", 10),
      out_for_delivery: parseInt(summaryRow.out_for_delivery || "0", 10),
      delivered: parseInt(summaryRow.delivered || "0", 10),
      cancelled: parseInt(summaryRow.cancelled || "0", 10),
      payment_failed: parseInt(summaryRow.payment_failed || "0", 10),
      returned: parseInt(summaryRow.returned || "0", 10),
      refunded: parseInt(summaryRow.refunded || "0", 10),
      payment_pending: parseInt(summaryRow.payment_pending || "0", 10),
      payment_paid: parseInt(summaryRow.payment_paid || "0", 10),
    };

    return NextResponse.json({
      success: true,
      orders: ordersRes.rows.map((row) => ({
        ...row,
        total_amount: Number(row.total_amount),
        subtotal: Number(row.subtotal),
        tax_amount: Number(row.tax_amount),
        shipping_fee: Number(row.shipping_fee),
        discount_amount: Number(row.discount_amount),
        items_count: parseInt(row.items_count || "0", 10),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      summary,
    });
  } catch (err: any) {
    console.error("[Orders List API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch orders." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
