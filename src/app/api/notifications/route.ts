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
    const searchParams = req.nextUrl.searchParams;
    const readParam = searchParams.get("read"); // 'true' or 'false'
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 20)));
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        n.id, n.type, n.title, n.message, n.metadata, n.created_at,
        nr.is_read, nr.read_at
      FROM "${schema}".notification_recipients nr
      JOIN "${schema}".notifications n ON n.id = nr.notification_id
      WHERE nr.user_id = $1
    `;
    const params: any[] = [userId];

    if (readParam === "true" || readParam === "false") {
      query += ` AND nr.is_read = $2`;
      params.push(readParam === "true");
    }

    // Add order, limit, offset
    query += ` ORDER BY n.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const res = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM "${schema}".notification_recipients nr
      WHERE nr.user_id = $1
    `;
    const countParams: any[] = [userId];
    if (readParam === "true" || readParam === "false") {
      countQuery += ` AND nr.is_read = $2`;
      countParams.push(readParam === "true");
    }
    const countRes = await pool.query(countQuery, countParams);
    const total = Number(countRes.rows[0]?.total || 0);

    return NextResponse.json({
      success: true,
      data: res.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Mark all as read
export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { schema } = await getTenantSchema(req);

    await pool.query(`
      UPDATE "${schema}".notification_recipients
      SET is_read = true, read_at = NOW()
      WHERE user_id = $1 AND is_read = false
    `, [userId]);

    return NextResponse.json({
      success: true,
      message: "All notifications marked as read"
    });
  } catch (error: any) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
