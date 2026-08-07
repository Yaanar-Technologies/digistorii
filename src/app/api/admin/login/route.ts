import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyPassword } from "@/lib/hash";
import { ensureCompanyResponsibilities } from "@/lib/userResponsibilities";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;
    const tenant = body.tenant; // pass company from login form
    console.log("Admin Login Backend Tenant : ", tenant);
    if (!tenant) return NextResponse.json({ success: false, message: "Company required" }, { status: 400 });

    // Check if the subscription is expired
    const companyCheck = await pool.query(
      `SELECT c.status AS company_status, cs.subscription_end, cs.status AS sub_status
       FROM public.companies c
       LEFT JOIN public.company_subscriptions cs ON cs.company_id = c.id
       WHERE c.subdomain_url = $1
       ORDER BY cs.updated_at DESC LIMIT 1`,
      [tenant]
    );

    const isExpired = companyCheck.rows[0]?.company_status === 'EXPIRED' ||
      (companyCheck.rows[0]?.subscription_end && new Date() > new Date(companyCheck.rows[0].subscription_end));

    // if (isExpired) {
    //   return NextResponse.json(
    //     { 
    //       success: false, 
    //       message: "Subscription expired please contact administrator" 
    //     },
    //     { status: 403 }
    //   );
    // }

    // get company
    const companyResult = await pool.query(
      "SELECT id FROM public.companies WHERE subdomain_url = $1",
      [tenant]
    );
    if (!companyResult.rows.length) return NextResponse.json({ success: false, message: "Company not found" }, { status: 404 });

    const companyId = companyResult.rows[0].id;
    console.log("Admin Login Backend Tenant Id : ", companyId);
    const client = await pool.connect();
    try {
      await ensureCompanyResponsibilities(client, Number(companyId));
    } finally {
      client.release();
    }

    const userResult = await pool.query(
      `SELECT
         u.*,c.company_name,
         COALESCE(cum.responsibility_id, u.responsibility_id) AS resolved_responsibility_id,
         r.responsibility_name,
         r.dashboard_access,
         r.purchase_access,
         r.inventory_access,
         r.sales_access,
         r.sales_billing_access,
         r.reports_access,
         r.settings_access,
         r.ecommerce_access
       FROM public.users u
       LEFT JOIN public.company_user_map cum
         ON cum.user_id = u.id
        AND cum.company_id = u.company_id
      LEFT JOIN public.companies c
        ON c.id=u.company_id
       LEFT JOIN public.user_responsibilities r
         ON r.id = COALESCE(cum.responsibility_id, u.responsibility_id)
       WHERE u.email = $1
         AND u.company_id = $2
         AND u.is_active = true
         AND COALESCE(r.settings_access, FALSE) = TRUE
       ORDER BY cum.id DESC
       LIMIT 1`,
      [email, companyId]
    );

    if (!userResult.rows.length)
      return NextResponse.json(
        { success: false, message: "Incorrect email or password" },
        { status: 401 }
      );

    const user = userResult.rows[0];
    console.log("Admin User found:", user);
    console.log("Admin Verifying password for user:", email);
    const validPassword = await verifyPassword(password, user.password_hash);
    console.log("Admin Password valid:", validPassword);
    if (!validPassword)
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );

    // set cookies
    const res = NextResponse.json({
      success: true, user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        company_name: tenant,
        responsibility_id: user.resolved_responsibility_id ?? user.responsibility_id ?? null,
        responsibility_name: user.responsibility_name ?? null,
        permissions: {
          dashboard_access: Boolean(user.dashboard_access),
          purchase_access: Boolean(user.purchase_access),
          inventory_access: Boolean(user.inventory_access),
          sales_access: Boolean(user.sales_access),
          sales_billing_access: Boolean(user.sales_billing_access),
          reports_access: Boolean(user.reports_access),
          settings_access: Boolean(user.settings_access),
          ecommerce_access: Boolean(user.ecommerce_access),
        },
      }
    });

    res.cookies.set("admin_user", JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      company_name: tenant,
      responsibility_id: user.resolved_responsibility_id ?? user.responsibility_id ?? null,
      responsibility_name: user.responsibility_name ?? null,
      permissions: {
        dashboard_access: Boolean(user.dashboard_access),
        purchase_access: Boolean(user.purchase_access),
        inventory_access: Boolean(user.inventory_access),
        sales_access: Boolean(user.sales_access),
        sales_billing_access: Boolean(user.sales_billing_access),
        reports_access: Boolean(user.reports_access),
        settings_access: Boolean(user.settings_access),
        ecommerce_access: Boolean(user.ecommerce_access),
      },
    }), {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
    });


    res.cookies.set("tenant", tenant, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { success: false, message: "Something went wrong during login.Please try again later." },
      { status: 500 }
    );

  }
}
