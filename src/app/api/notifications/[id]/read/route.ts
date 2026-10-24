import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import { verifySession, STAFF_COOKIE_NAME, StaffSessionPayload } from "@/lib/session";

async function getUserId(req: NextRequest): Promise<{ userId: number | null; session: StaffSessionPayload | null }> {
  const userCookie = req.cookies.get(STAFF_COOKIE_NAME)?.value;
  if (!userCookie) return { userId: null, session: null };
  const parsed = await verifySession<StaffSessionPayload>(userCookie, "staff");
  if (!parsed) return { userId: null, session: null };
  const id = Number(parsed?.user_id ?? parsed?.id);
  return { userId: Number.isInteger(id) && id > 0 ? id : null, session: parsed };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, session } = await getUserId(req);
    if (!userId || !session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const { company, schema } = await getTenantSchema(req);
    if (session.company_name && session.company_name.trim().toLowerCase() !== company.trim().toLowerCase()) {
      return NextResponse.json({ success: false, error: "Forbidden: Company mismatch" }, { status: 403 });
    }

    const res = await pool.query(`
      UPDATE "${schema}".notification_recipients
      SET is_read = true, read_at = NOW()
      WHERE notification_id = $1 AND user_id = $2
      RETURNING id
    `, [id, userId]);

    if (res.rowCount === 0) {
      return NextResponse.json({ success: false, error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Notification marked as read"
    });
  } catch (error: any) {
    console.error("PATCH /api/notifications/[id]/read error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
