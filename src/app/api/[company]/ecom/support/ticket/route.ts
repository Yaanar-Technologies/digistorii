import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { ensureCustomerSchema } from "@/lib/customerAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);

  if (!session) {
    return NextResponse.json({ success: false, error: "Please sign in to submit a support request." }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await ensureCustomerSchema(client, session.schema);
    const body = await req.json().catch(() => ({}));
    const category = String(body?.category || "general").trim();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    const orderId = body?.orderId ? Number(body.orderId) : null;

    if (!subject || !message) {
      return NextResponse.json(
        { success: false, error: "Subject and Message description are required." },
        { status: 400 }
      );
    }

    const ticketNo = `TKT-${Date.now().toString().slice(-6)}`;

    const res = await client.query(
      `INSERT INTO "${session.schema}".ecom_support_tickets (
         ticket_no, customer_id, order_id, category, subject, message, status, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW(), NOW())
       RETURNING id, ticket_no, category, subject, status, created_at`,
      [ticketNo, session.customerId, orderId, category, subject, message]
    );

    return NextResponse.json({
      success: true,
      message: "Your support ticket has been received. Our team will contact you shortly.",
      ticket: res.rows[0],
    });
  } catch (err: any) {
    console.error("Support ticket error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to submit support ticket" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

