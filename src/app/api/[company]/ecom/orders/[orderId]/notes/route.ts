import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const client = await pool.connect();

  try {
    const { company, orderId: rawOrderId } = await params;
    const orderId = Number(rawOrderId);

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID." },
        { status: 400 }
      );
    }

    let schema = "";
    try {
      const tenantInfo = await getTenantSchema(req);
      schema = tenantInfo.schema;
    } catch {
      const tenantInfo = await getTenantSchemaByCompany(company);
      schema = tenantInfo.schema;
    }

    const isCustomerView = req.nextUrl.searchParams.get("customer") === "true";

    let query = `
      SELECT id, order_id, company_id, author_name, author_type, content, is_customer_visible, created_at
      FROM "${schema}".order_notes
      WHERE order_id = $1
    `;
    const values: any[] = [orderId];

    if (isCustomerView) {
      query += ` AND is_customer_visible = TRUE`;
    }

    query += ` ORDER BY created_at ASC`;

    const res = await client.query(query, values);

    return NextResponse.json({
      success: true,
      notes: res.rows,
    });
  } catch (err: any) {
    console.error("Fetch order notes error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load order notes." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string; orderId: string }> }
) {
  const client = await pool.connect();

  try {
    const { company, orderId: rawOrderId } = await params;
    const orderId = Number(rawOrderId);

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid order ID." },
        { status: 400 }
      );
    }

    let schema = "";
    try {
      const tenantInfo = await getTenantSchema(req);
      schema = tenantInfo.schema;
    } catch {
      const tenantInfo = await getTenantSchemaByCompany(company);
      schema = tenantInfo.schema;
    }

    const orderRes = await client.query(
      `SELECT id, company_id FROM "${schema}".online_orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    if (!orderRes.rowCount) {
      return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
    }
    const companyId = Number(orderRes.rows[0].company_id);

    const body = await req.json();
    const {
      content,
      authorName = "Support Agent",
      authorType = "staff",
      isCustomerVisible = false,
    } = body || {};

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "Note content cannot be empty." },
        { status: 400 }
      );
    }

    const res = await client.query(
      `INSERT INTO "${schema}".order_notes (
         order_id, company_id, author_name, author_type, content, is_customer_visible, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, order_id, company_id, author_name, author_type, content, is_customer_visible, created_at`,
      [
        orderId,
        companyId,
        authorName.trim(),
        ["staff", "customer", "system"].includes(authorType) ? authorType : "staff",
        content.trim(),
        Boolean(isCustomerVisible),
      ]
    );

    return NextResponse.json({
      success: true,
      note: res.rows[0],
    });
  } catch (err: any) {
    console.error("Create order note error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create order note." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
