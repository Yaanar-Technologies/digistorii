import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifySession, StaffSessionPayload } from "@/lib/session";

export async function GET(req: NextRequest) {
  // Get admin cookie
  const adminCookie = req.cookies.get("admin_user")?.value;

  if (!adminCookie) {
    return NextResponse.json({ success: false, message: "Not logged in" }, { status: 401 });
  }

  try {
    const user = await verifySession<StaffSessionPayload>(adminCookie, "staff");
    if (!user) {
      return NextResponse.json({ success: false, message: "Invalid or expired session" }, { status: 401 });
    }

    return NextResponse.json({ success: true, user });
  } catch (err) {
    return NextResponse.json({ success: false, message: "Invalid cookie" }, { status: 401 });
  }
}