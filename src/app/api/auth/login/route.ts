import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "../../../../lib/pages/login";
import { pool } from "@/lib/db"; // Import your database pool
import {
  signSession,
  STAFF_COOKIE_NAME,
  STAFF_SESSION_EXPIRY_SECONDS,
  getCookieOptions,
} from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const company = url.searchParams.get("company");
    const { email, password } = await req.json();
    console.log("Login attempt for company:", company, "email:", email);

    if (!company)
      return NextResponse.json(
        { success: false, message: "Company required" },
        { status: 400 }
      );

    // Check if the subscription is expired
    const companyCheck = await pool.query(
      `SELECT c.status AS company_status, cs.subscription_end, cs.status AS sub_status
       FROM public.companies c
       LEFT JOIN public.company_subscriptions cs ON cs.company_id = c.id
       WHERE c.subdomain_url = $1
       ORDER BY cs.updated_at DESC LIMIT 1`,
      [company]
    );

    const isExpired = companyCheck.rows[0]?.company_status === 'EXPIRED' || 
                      (companyCheck.rows[0]?.subscription_end && new Date() > new Date(companyCheck.rows[0].subscription_end));

    if (isExpired) {
      return NextResponse.json(
        { 
          success: false, 
          message: "Subscription expired please contact administrator" 
        },
        { status: 403 }
      );
    }

    const result = await loginUser(company, email, password);

    if (result.success && result.user) {
      // 1. Fetch real display company name from public.companies
      let realCompanyName = company; // Default fallback to subdomain

      try {
        const companyRes = await pool.query(
          `SELECT company_name FROM public.companies WHERE id = $1`,
          [result.user.company_id]
        );
        if (companyRes.rowCount && companyRes.rows[0].company_name) {
          realCompanyName = companyRes.rows[0].company_name; // "DK Designs"
        }
      } catch (dbErr) {
        console.error("Failed to fetch real company name:", dbErr);
      }

      // 2. Attach real_company_name and company_name to user payload
      const { password: _p, password_hash: _ph, ...userWithoutSecrets } = (result.user || {}) as Record<string, any>;
      const updatedUser = {
        ...userWithoutSecrets,
        company_name: company,            // Subdomain string (e.g., "dkdesigns")
        real_company_name: realCompanyName, // Real name (e.g., "DK Designs")
      };

      console.log("Login successful for user:", email, "in company:", realCompanyName);

      const token = await signSession(updatedUser, STAFF_SESSION_EXPIRY_SECONDS, "staff");

      // 3. Construct response with enriched user object
      const response = NextResponse.json({
        ...result,
        user: updatedUser,
      });

      // 4. Set updated cookies
      response.cookies.set(
        STAFF_COOKIE_NAME,
        token,
        getCookieOptions(STAFF_SESSION_EXPIRY_SECONDS)
      );

      response.cookies.set("tenant", company, getCookieOptions(STAFF_SESSION_EXPIRY_SECONDS));

      return response;
    }

    return NextResponse.json(result);

  } catch (err: any) {
    console.error("Route error:", err);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}