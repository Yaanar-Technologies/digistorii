import { NextRequest, NextResponse } from "next/server";
import { CUSTOMER_COOKIE_NAME, getCookieOptions } from "@/lib/session";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  response.cookies.set(CUSTOMER_COOKIE_NAME, "", getCookieOptions(0));

  return response;
}
