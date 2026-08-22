import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {

  try {
    const { company, schema } = await getTenantSchema(req);
    const { id } = await context.params; 

    const header = await pool.query(`
      SELECT
        ph.*,
        s.supplier_code,
        s.name as supplier_name,
        s.email as supplier_email,
        s.phone as supplier_phone,
        s.currency as curr,
			  c.currency_code as currency,
        CONCAT_WS(', ', s.address_line1, s.address_line2, s.address_line3, s.city, s.state, s.pincode) as supplier_address,
        dt.despatch_name as despatch_terms_name,
        pt.name as payment_terms_name,
        c.currency_code as currency_code
      FROM ${schema}.purchase_header ph
      LEFT JOIN ${schema}.suppliers s
        ON ph.supplier_id = s.id
      Left Join ${schema}.currencies c
			  ON ph.currency=c.id
      LEFT JOIN "${schema}".despatch_terms dt
        ON ph.despatch_terms = dt.id
      LEFT JOIN "${schema}".payment_terms pt
        ON ph.payment_terms = pt.id
      LEFT JOIN "${schema}".currencies ce
        ON ce.id::text = ph.currency::text
      WHERE ph.id=$1
    `, [id]);

    if (!header.rows.length) throw new Error("Purchase Order Not Found");
    // console.log("header : ",header.rows);

    const items = await pool.query(
      `
      SELECT 
        d.*,
        p.product_code,
        p.name as product_name,
        tr.tax_name,
        tr.total_percentage AS tax_percent
      FROM ${schema}.purchase_detail d
      LEFT JOIN ${schema}.product_variants pv
      ON pv.id = d.product_id
      LEFT JOIN ${schema}.products p
      ON p.id = COALESCE(pv.product_id, d.product_id)
      LEFT JOIN ${schema}.tax_master tr
            ON tr.id = d.tax_master_id
      WHERE d.purchase_id=$1
      `,
      [id]
    );
    // console.log("items : ",items.rows);
    return NextResponse.json({
      success: true,
      data: {
        ...header.rows[0],
        items: items.rows
      }
    });
  } catch (err: any) {
    console.error("Purchase Approval GET Error:", err);
    return NextResponse.json(
    { success: false, error: err.message },
    { status: 500 }
  );
  }
}

export async function POST( req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    const body = await req.json();
    const { id } = await context.params; 

    const { action, reason, user_name } = body;

    if (!["approve", "reject"].includes(action))
      throw new Error("Invalid action");

    if (action === "reject" && !reason?.trim())
      throw new Error("Reject reason is required");

    await client.query("BEGIN");

    let approval_status = "";
    let status = "";

    if (action === "approve") {
      approval_status = "Approved";
      status = "Approved";
    } else {
      approval_status = "Rejected";
      status = "Rejected";
    }

    await client.query(`
      UPDATE ${schema}.purchase_header
      SET approval_status=$1, reject_reason=$2, status=$3, updated_by=$4, updated_at=NOW()
      WHERE id=$5
    `, [approval_status, reason || null, status, user_name, id]);

    await client.query("COMMIT");

   return NextResponse.json({ success: true, message: `Purchase ${action} successfully` });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Purchase Approval Error:", err);
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 });
  } finally {
    client.release();
  }
}
