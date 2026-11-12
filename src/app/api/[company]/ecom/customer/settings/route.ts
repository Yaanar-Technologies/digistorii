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
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await ensureCustomerSchema(client, session.schema);
    const body = await req.json().catch(() => ({}));
    const preferences = body?.preferences || { whatsapp: true, sms: true, email: true };

    await client.query(
      `UPDATE "${session.schema}".customers
       SET notification_preferences = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(preferences), session.customerId]
    );

    return NextResponse.json({
      success: true,
      message: "Notification preferences updated successfully",
      preferences,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

