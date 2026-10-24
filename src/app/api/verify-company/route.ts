// app/api/verify-company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token || token.trim() === "") {
    return new NextResponse("<h1>Invalid or missing token link.</h1>", {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const client = await pool.connect();
  try {
    const companyResult = await client.query(
      `SELECT id, company_name, setup_stage 
       FROM public.companies 
       WHERE verification_token = $1 LIMIT 1`,
      [token]
    );

    if (companyResult.rowCount === 0) {
      return new NextResponse("<h1>This link is invalid or has expired.</h1>", {
        status: 403,
        headers: { "Content-Type": "text/html" },
      });
    }

    const company = companyResult.rows[0];

    // Optional: If they already clicked it previously, don't execute extra updates
    if (company.setup_stage === "LIVE") {
      return new NextResponse(`
        <html><body><div style="text-align:center;font-family:sans-serif;margin-top:50px;">
          <h1 style="color:#2563eb;">Workspace Already Active!</h1>
          <p>Your workspace is already live. You can close this window safely.</p>
        </div></body></html>
      `, { headers: { "Content-Type": "text/html" } });
    }

    // Only a paid workspace that finished business details may go live.
    const paid = await client.query(
      `SELECT 1 FROM public.company_subscriptions
       WHERE company_id = $1 AND LOWER(payment_status) = 'paid' LIMIT 1`,
      [company.id]
    );
    if (company.setup_stage !== "BUSINESS_SETUP" || !paid.rowCount) {
      return new NextResponse("<h1>Complete payment and business details before activating.</h1>", {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    // 2. Mark company as LIVE only after matching the true token key
    await client.query(
      `UPDATE public.companies
       SET setup_stage = 'LIVE', 
           verification_token = NULL, -- Optional: consume token so it cannot be reused
           updated_at = NOW()
       WHERE id = $1`,
      [company.id]
    );

    return new NextResponse(`
      <html>
        <head>
          <title>Workspace Activated!</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #f8fafc; }
            .card { max-width: 480px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            h1 { color: #16a34a; margin-bottom: 8px; }
            p { color: #475569; font-size: 15px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1> Workspace Activated!</h1>
            <p>Your workspace <strong>${escapeHtml(String(company.company_name))}</strong> is now live.</p>
            <p>You can safely close this page tab now and return to your onboarding wizard.</p>
          </div>
        </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html" },
    });

  } catch (error) {
    console.error("Verification error:", error);
    return new NextResponse("<h1>Activation failed. Internal system error.</h1>", {
      status: 500,
      headers: { "Content-Type": "text/html" }
    });
  } finally {
    client.release();
  }
}