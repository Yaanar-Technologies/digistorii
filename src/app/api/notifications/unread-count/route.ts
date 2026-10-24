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

export async function GET(req: NextRequest) {
  try {
    const { userId, session } = await getUserId(req);
    if (!userId || !session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { company, schema } = await getTenantSchema(req);
    if (session.company_name && session.company_name.trim().toLowerCase() !== company.trim().toLowerCase()) {
      return NextResponse.json({ success: false, error: "Forbidden: Company mismatch" }, { status: 403 });
    }

    const res = await pool.query(`
      SELECT COUNT(*) as unread_count
      FROM "${schema}".notification_recipients
      WHERE user_id = $1 AND is_read = false
    `, [userId]);

    return NextResponse.json({
      success: true,
      unreadCount: Number(res.rows[0]?.unread_count || 0)
    });
  } catch (error: any) {
    console.error("GET unread-count error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
