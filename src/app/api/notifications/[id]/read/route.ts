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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const { schema } = await getTenantSchema(req);

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
