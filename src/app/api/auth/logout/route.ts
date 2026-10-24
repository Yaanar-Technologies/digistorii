import { NextResponse } from "next/server";
import { STAFF_COOKIE_NAME, getCookieOptions } from "@/lib/session";
 
export async function POST() {
  const response = NextResponse.json({ success: true });
 
  response.cookies.set(STAFF_COOKIE_NAME, "", getCookieOptions(0));
 
  return response;
}