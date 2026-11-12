import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import { encryptSecret } from "@/lib/cryptoHelper";
import { ensureLogisticsSchema } from "@/lib/logisticsSchema";

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, companyId } = await getTenantSchema(req);

    // Ensure logistics columns exist on schema
    await ensureLogisticsSchema(client, schema);

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

    // Sanitize credentials: NEVER return plaintext or encrypted ciphertext to the client
    const sanitizedSettings = {
      ...settings,
      delivery_api_key_enc: undefined,
      delivery_api_secret_enc: undefined,
      delivery_webhook_secret_enc: undefined,
      gateway_key_secret_enc: undefined,
      has_delivery_api_key: Boolean(settings.delivery_api_key_enc),
      has_delivery_api_secret: Boolean(settings.delivery_api_secret_enc),
      has_delivery_webhook_secret: Boolean(settings.delivery_webhook_secret_enc),
      delivery_api_key_masked: settings.delivery_api_key_enc ? "••••••••••••" : "",
      delivery_partner: settings.delivery_partner || "self",
      pickup_location_code: settings.pickup_location_code || "",
      default_length_cm: settings.default_length_cm != null ? Number(settings.default_length_cm) : 10,
      default_width_cm: settings.default_width_cm != null ? Number(settings.default_width_cm) : 10,
      default_height_cm: settings.default_height_cm != null ? Number(settings.default_height_cm) : 10,
      default_weight_grams: settings.default_weight_grams != null ? Number(settings.default_weight_grams) : 500,
      custom_domain: domainInfo.custom_domain || "",
      custom_domain_status: domainInfo.custom_domain_status || "not_configured",
      custom_domain_verified_at: domainInfo.custom_domain_verified_at || null,
    };

    return NextResponse.json({
      success: true,
      settings: sanitizedSettings,
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

    // Ensure logistics columns exist on schema
    await ensureLogisticsSchema(client, schema);

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
      privacy_policy,
      support_email,
      support_phone,
      shipping_free_threshold,
      shipping_fee,
      use_custom_pricing,
      use_custom_discounts,
      custom_domain,
      custom_domain_status,
      // Logistics & Courier Fields
      delivery_partner,
      delivery_api_key,
      delivery_api_secret,
      delivery_webhook_secret,
      pickup_location_code,
      default_length_cm,
      default_width_cm,
      default_height_cm,
      default_weight_grams,
    } = body;

    const parsedThreshold = shipping_free_threshold !== undefined && shipping_free_threshold !== null && !isNaN(Number(shipping_free_threshold))
      ? Math.max(0, Number(shipping_free_threshold))
      : 500.00;

    const parsedShippingFee = shipping_fee !== undefined && shipping_fee !== null && !isNaN(Number(shipping_fee))
      ? Math.max(0, Number(shipping_fee))
      : 49.00;

    const parsedLength = default_length_cm !== undefined && default_length_cm !== null && !isNaN(Number(default_length_cm))
      ? Math.max(0, Number(default_length_cm))
      : 10.00;

    const parsedWidth = default_width_cm !== undefined && default_width_cm !== null && !isNaN(Number(default_width_cm))
      ? Math.max(0, Number(default_width_cm))
      : 10.00;

    const parsedHeight = default_height_cm !== undefined && default_height_cm !== null && !isNaN(Number(default_height_cm))
      ? Math.max(0, Number(default_height_cm))
      : 10.00;

    const parsedWeight = default_weight_grams !== undefined && default_weight_grams !== null && !isNaN(Number(default_weight_grams))
      ? Math.max(0, Number(default_weight_grams))
      : 500.00;

    // Start transaction
    await client.query("BEGIN");

    // 1. Fetch existing settings to preserve existing encrypted credentials if not updated
    const settingsExist = await client.query(
      `SELECT id, delivery_api_key_enc, delivery_api_secret_enc, delivery_webhook_secret_enc
       FROM "${schema}".ecom_settings WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    const existingSettings = settingsExist.rows[0] || {};

    let finalDeliveryApiKeyEnc = existingSettings.delivery_api_key_enc || null;
    if (delivery_api_key !== undefined) {
      if (typeof delivery_api_key === "string" && delivery_api_key.trim().length > 0) {
        finalDeliveryApiKeyEnc = encryptSecret(delivery_api_key.trim());
      } else if (delivery_api_key === "" && delivery_partner === "self") {
        finalDeliveryApiKeyEnc = null;
      }
    }

    let finalDeliveryApiSecretEnc = existingSettings.delivery_api_secret_enc || null;
    if (delivery_api_secret !== undefined) {
      if (typeof delivery_api_secret === "string" && delivery_api_secret.trim().length > 0) {
        finalDeliveryApiSecretEnc = encryptSecret(delivery_api_secret.trim());
      } else if (delivery_api_secret === "" && delivery_partner === "self") {
        finalDeliveryApiSecretEnc = null;
      }
    }

    let finalDeliveryWebhookSecretEnc = existingSettings.delivery_webhook_secret_enc || null;
    if (delivery_webhook_secret !== undefined) {
      if (typeof delivery_webhook_secret === "string" && delivery_webhook_secret.trim().length > 0) {
        finalDeliveryWebhookSecretEnc = encryptSecret(delivery_webhook_secret.trim());
      } else if (delivery_webhook_secret === "" && delivery_partner === "self") {
        finalDeliveryWebhookSecretEnc = null;
      }
    }

    // Determine setup status
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
             privacy_policy = $11,
             support_email = $12,
             support_phone = $13,
             shipping_free_threshold = $14,
             shipping_fee = $15,
             use_custom_pricing = $16,
             use_custom_discounts = $17,
             setup_status = $18,
             delivery_partner = $19,
             delivery_api_key_enc = $20,
             delivery_api_secret_enc = $21,
             delivery_webhook_secret_enc = $22,
             pickup_location_code = $23,
             default_length_cm = $24,
             default_width_cm = $25,
             default_height_cm = $26,
             default_weight_grams = $27,
             updated_at = NOW()
         WHERE company_id = $28`,
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
          privacy_policy || null,
          support_email || null,
          support_phone || null,
          parsedThreshold,
          parsedShippingFee,
          use_custom_pricing === true,
          use_custom_discounts === true,
          setup_status,
          delivery_partner || "self",
          finalDeliveryApiKeyEnc,
          finalDeliveryApiSecretEnc,
          finalDeliveryWebhookSecretEnc,
          pickup_location_code || null,
          parsedLength,
          parsedWidth,
          parsedHeight,
          parsedWeight,
          companyId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO "${schema}".ecom_settings (
          company_id, payment_mode, gateway_provider, gateway_key_id, gateway_key_secret_enc,
          serviceable_countries, serviceable_states, serviceable_pincodes, terms_and_conditions,
          return_refund_policy, delivery_note, privacy_policy, support_email, support_phone,
          shipping_free_threshold, shipping_fee, use_custom_pricing,
          use_custom_discounts, setup_status, delivery_partner, delivery_api_key_enc,
          delivery_api_secret_enc, delivery_webhook_secret_enc, pickup_location_code,
          default_length_cm, default_width_cm, default_height_cm, default_weight_grams
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
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
          privacy_policy || null,
          support_email || null,
          support_phone || null,
          parsedThreshold,
          parsedShippingFee,
          use_custom_pricing === true,
          use_custom_discounts === true,
          setup_status,
          delivery_partner || "self",
          finalDeliveryApiKeyEnc,
          finalDeliveryApiSecretEnc,
          finalDeliveryWebhookSecretEnc,
          pickup_location_code || null,
          parsedLength,
          parsedWidth,
          parsedHeight,
          parsedWeight,
        ]
      );
    }

    // 2. Update custom domain info in public.companies if provided
    if (custom_domain !== undefined) {
      const cleanDomain = custom_domain ? custom_domain.trim().toLowerCase() : null;

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
