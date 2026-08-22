import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

function getUserId(req: NextRequest): number | null {
  const userCookie = req.cookies.get("user")?.value;
  if (!userCookie) return null;
  try {
    const parsed = JSON.parse(userCookie);
    const id = Number(parsed?.user_id ?? parsed?.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { schema } = await getTenantSchema(req);

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
