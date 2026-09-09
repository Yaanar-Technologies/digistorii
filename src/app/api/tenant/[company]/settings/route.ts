// src/app/api/tenant/[company]/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  if (!companySlug) {
    return NextResponse.json(
      { success: false, message: "Company parameter is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const tenantRes = await client.query(
      `SELECT c.id, c.schema_name, c.company_name
       FROM public.companies c
       WHERE LOWER(c.subdomain_url) = $1
       LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const { schema_name: schema, id: companyId, company_name } = tenantRes.rows[0];

    const settingsRes = await client.query(
      `SELECT 
         payment_mode,
         shipping_free_threshold,
         shipping_fee,
         serviceable_countries,
         serviceable_states,
         serviceable_pincodes,
         terms_and_conditions,
         return_refund_policy,
         delivery_note,
         support_email,
         support_phone,
         use_custom_pricing,
         use_custom_discounts
       FROM "${schema}".ecom_settings
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    const settings = settingsRes.rows[0] || {};

    return NextResponse.json({
      success: true,
      company: companySlug,
      companyName: company_name,
      settings: {
        payment_mode: settings.payment_mode || "both",
        shipping_free_threshold: settings.shipping_free_threshold != null ? Number(settings.shipping_free_threshold) : 500.00,
        shipping_fee: settings.shipping_fee != null ? Number(settings.shipping_fee) : 49.00,
        serviceable_countries: settings.serviceable_countries || ["India"],
        serviceable_states: settings.serviceable_states || [],
        serviceable_pincodes: settings.serviceable_pincodes || [],
        terms_and_conditions: settings.terms_and_conditions || "",
        return_refund_policy: settings.return_refund_policy || "",
        delivery_note: settings.delivery_note || "",
        support_email: settings.support_email || "",
        support_phone: settings.support_phone || "",
      },
    });
  } catch (err: any) {
    console.error("Tenant settings API load error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load tenant settings" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
