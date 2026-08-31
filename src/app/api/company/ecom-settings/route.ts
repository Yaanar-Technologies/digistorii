import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, companyId } = await getTenantSchema(req);

    // Fetch ecom settings
    const result = await client.query(
      `SELECT * FROM "${schema}".ecom_settings WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    let settings = result.rows[0] || null;

    if (!settings) {
      // If it doesn't exist, insert default settings
      const insertRes = await client.query(
        `INSERT INTO "${schema}".ecom_settings (company_id, payment_mode, setup_status)
         VALUES ($1, 'cod_only', 'incomplete')
         RETURNING *`,
        [companyId]
      );
      settings = insertRes.rows[0];
    }

    // Fetch custom domain configuration from companies table
    const domainRes = await client.query(
      `SELECT custom_domain, custom_domain_status, custom_domain_verified_at
       FROM public.companies WHERE id = $1`,
      [companyId]
    );
    const domainInfo = domainRes.rows[0] || {};

    return NextResponse.json({
      success: true,
      settings: {
        ...settings,
        custom_domain: domainInfo.custom_domain || "",
        custom_domain_status: domainInfo.custom_domain_status || "not_configured",
        custom_domain_verified_at: domainInfo.custom_domain_verified_at || null,
      },
    });
  } catch (err: any) {
    console.error("GET ecom-settings error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to fetch settings" }, { status: 400 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, companyId } = await getTenantSchema(req);
    const body = await req.json();

    const {
      payment_mode,
      gateway_provider,
      gateway_key_id,
      gateway_key_secret_enc,
      serviceable_countries,
      serviceable_states,
      serviceable_pincodes,
      terms_and_conditions,
      return_refund_policy,
      delivery_note,
      support_email,
      support_phone,
      use_custom_pricing,
      use_custom_discounts,
      custom_domain,
      custom_domain_status,
    } = body;

    // Start transaction
    await client.query("BEGIN");

    // 1. Update company settings
    const settingsExist = await client.query(
      `SELECT id FROM "${schema}".ecom_settings WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    // Determine setup status
    // Flipps to complete once payment_mode + at least one serviceable region + T&C are filled
    const isServiceableFilled = (serviceable_countries && serviceable_countries.length > 0) ||
      (serviceable_states && serviceable_states.length > 0) ||
      (serviceable_pincodes && serviceable_pincodes.length > 0);
    const isComplete = payment_mode && isServiceableFilled && terms_and_conditions && terms_and_conditions.trim().length > 0;
    const setup_status = isComplete ? "complete" : "incomplete";

    if (settingsExist.rowCount) {
      await client.query(
        `UPDATE "${schema}".ecom_settings
         SET payment_mode = $1,
             gateway_provider = $2,
             gateway_key_id = $3,
             gateway_key_secret_enc = $4,
             serviceable_countries = $5,
             serviceable_states = $6,
             serviceable_pincodes = $7,
             terms_and_conditions = $8,
             return_refund_policy = $9,
             delivery_note = $10,
             support_email = $11,
             support_phone = $12,
             use_custom_pricing = $13,
             use_custom_discounts = $14,
             setup_status = $15,
             updated_at = NOW()
         WHERE company_id = $16`,
        [
          payment_mode || "cod_only",
          gateway_provider || null,
          gateway_key_id || null,
          gateway_key_secret_enc || null,
          serviceable_countries || ["India"],
          serviceable_states || null,
          serviceable_pincodes || null,
          terms_and_conditions || null,
          return_refund_policy || null,
          delivery_note || null,
          support_email || null,
          support_phone || null,
          use_custom_pricing === true,
          use_custom_discounts === true,
          setup_status,
          companyId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO "${schema}".ecom_settings (
          company_id, payment_mode, gateway_provider, gateway_key_id, gateway_key_secret_enc,
          serviceable_countries, serviceable_states, serviceable_pincodes, terms_and_conditions,
          return_refund_policy, delivery_note, support_email, support_phone, use_custom_pricing,
          use_custom_discounts, setup_status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          companyId,
          payment_mode || "cod_only",
          gateway_provider || null,
          gateway_key_id || null,
          gateway_key_secret_enc || null,
          serviceable_countries || ["India"],
          serviceable_states || null,
          serviceable_pincodes || null,
          terms_and_conditions || null,
          return_refund_policy || null,
          delivery_note || null,
          support_email || null,
          support_phone || null,
          use_custom_pricing === true,
          use_custom_discounts === true,
          setup_status,
        ]
      );
    }

    // 2. Update custom domain info in public.companies if provided
    if (custom_domain !== undefined) {
      const cleanDomain = custom_domain ? custom_domain.trim().toLowerCase() : null;

      // If custom domain is changed, update domain status
      const existingDomainResult = await client.query(
        `SELECT custom_domain, custom_domain_status FROM public.companies WHERE id = $1`,
        [companyId]
      );
      const existingDomain = existingDomainResult.rows[0]?.custom_domain || "";
      const existingStatus = existingDomainResult.rows[0]?.custom_domain_status || "not_configured";

      if (cleanDomain !== existingDomain) {
        const nextStatus = cleanDomain ? "pending_dns" : "not_configured";
        const verifiedAt = null;

        await client.query(
          `UPDATE public.companies
           SET custom_domain = $1,
               custom_domain_status = $2,
               custom_domain_verified_at = $3,
               updated_at = NOW()
           WHERE id = $4`,
          [cleanDomain, nextStatus, verifiedAt, companyId]
        );
      } else if (custom_domain_status !== undefined && custom_domain_status !== existingStatus) {
        // Allow updating status if triggered (e.g. verifying or failing)
        const verifiedAt = custom_domain_status === "verified" ? new Date() : null;
        await client.query(
          `UPDATE public.companies
           SET custom_domain_status = $1,
               custom_domain_verified_at = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [custom_domain_status, verifiedAt, companyId]
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, message: "Settings saved successfully", setup_status });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("POST ecom-settings error:", err);
    return NextResponse.json({ success: false, message: err.message || "Failed to save settings" }, { status: 400 });
  } finally {
    client.release();
  }
}
