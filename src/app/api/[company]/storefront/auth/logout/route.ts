import { NextRequest, NextResponse } from "next/server";
import { CUSTOMER_COOKIE_NAME } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  // Clear session cookies
  response.cookies.set(CUSTOMER_COOKIE_NAME, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  response.cookies.set("storefront_customer_token", "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });

  return response;
}

