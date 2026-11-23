import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifySession, STAFF_COOKIE_NAME, StaffSessionPayload } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const userCookie = cookieStore.get(STAFF_COOKIE_NAME);

  if (!userCookie?.value) {
    return NextResponse.json({
      success: false,
      message: "User not logged in"
    }, { status: 401 });
  }

  const parsedCookie = await verifySession<StaffSessionPayload>(userCookie.value, "staff");
  if (!parsedCookie) {
    return NextResponse.json({
      success: false,
      message: "Unauthorized: Invalid or expired session"
    }, { status: 401 });
  }

  const userId = Number(parsedCookie?.user_id ?? parsedCookie?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({
      success: false,
      message: "Invalid user ID"
    }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.id, u.username, u.name, u.email, u.phone, u.company_id,
              c.id as company_id, c.company_name AS real_company_name, c.subdomain_url as company_name
         FROM public.users u
         JOIN public.companies c ON u.company_id = c.id
        WHERE u.id = $1`,
      [userId]
    );

    if (!result.rowCount) {
      return NextResponse.json({
        success: false,
        message: "User not found"
      }, { status: 404 });
    }

    const user = result.rows[0];
    const tenant = user.company_name;

    const companyCheck = await client.query(
      `SELECT c.status AS company_status, cs.subscription_end, cs.grace_period_end_date, cs.status AS sub_status
       FROM public.companies c
       LEFT JOIN public.company_subscriptions cs ON cs.company_id = c.id
       WHERE c.subdomain_url = $1
       ORDER BY cs.updated_at DESC LIMIT 1`,
      [tenant]
    );

    const row = companyCheck.rows[0];
    const subEnd = row?.subscription_end ? new Date(row.subscription_end) : null;
    const graceEnd = row?.grace_period_end_date
      ? new Date(row.grace_period_end_date)
      : subEnd
      ? new Date(subEnd.getTime() + 3 * 24 * 60 * 60 * 1000)
      : null;

    // Hard lockout ONLY when past the 3-day grace period
    const isPastGrace = graceEnd ? new Date() > graceEnd : false;
    const isExplicitlySuspended = row?.company_status === "SUSPENDED" || row?.sub_status === "suspended";

    if (isPastGrace || isExplicitlySuspended) {
      return NextResponse.json(
        { 
          success: false, 
          message: "Subscription and grace period have expired. Please contact administrator to renew." 
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        ...user,
        rememberMe: Boolean(parsedCookie?.rememberMe),
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to fetch user"
    }, { status: 500 });
  } finally {
    client.release();
  }
}