import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  verifySession,
  signSession,
  STAFF_COOKIE_NAME,
  STAFF_SESSION_EXPIRY_SECONDS,
  getCookieOptions,
  StaffSessionPayload,
} from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { company } = await req.json();

    if (!company) {
      return NextResponse.json(
        { success: false, message: "Company is required" },
        { status: 400 }
      );
    }

    // Set setup as completed in the database
    await pool.query(
      `UPDATE public.companies SET has_completed_guided_setup = TRUE WHERE subdomain_url = $1`,
      [company]
    );

    const res = NextResponse.json({ success: true, message: "Setup completed" });

    // Refresh the staff session cookie so the browser knows setup is completed across all page reloads
    const userCookie = req.cookies.get(STAFF_COOKIE_NAME)?.value;
    if (userCookie) {
      const session = await verifySession<StaffSessionPayload>(userCookie, "staff");
      if (session) {
        const updatedSession = { ...session, has_completed_guided_setup: true };
        const token = await signSession(updatedSession, STAFF_SESSION_EXPIRY_SECONDS, "staff");
        res.cookies.set(
          STAFF_COOKIE_NAME,
          token,
          getCookieOptions(STAFF_SESSION_EXPIRY_SECONDS)
        );
      }
    }

    return res;
  } catch (error) {
    console.error("Failed to complete guided setup", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}