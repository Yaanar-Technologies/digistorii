import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStorefrontCustomerSession } from "@/lib/storefrontAuth";
import { CUSTOMER_COOKIE_NAME } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const session = await getStorefrontCustomerSession(req, company);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // Soft delete customer identity & anonymize PII to maintain accounting / GST invoice integrity
    const anonymizedName = `Deleted Customer #${session.customerId}`;
    await client.query(
      `UPDATE "${session.schema}".customers
       SET is_deleted = TRUE,
           deleted_at = NOW(),
           cust_name = $1,
           name = $1,
           password_hash = NULL,
           reset_password_token = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [anonymizedName, session.customerId]
    );

    // Revoke session cookie
    const response = NextResponse.json({
      success: true,
      message: "Your customer account has been permanently deactivated.",
    });

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
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

