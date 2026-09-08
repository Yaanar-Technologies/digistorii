import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/cryptoHelper";

async function ensurePaymentGatewayTable(client: any, schema: string) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".payment_gateway_configs (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
      key_id VARCHAR(255) NOT NULL,
      key_secret VARCHAR(255) NOT NULL,
      webhook_secret VARCHAR(255),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (provider)
    );
  `);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();

  try {
    const { company: paramCompany } = await params;
    let schema = "";
    let companyId: number | null = null;

    try {
      const tenantInfo = await getTenantSchema(req);
      schema = tenantInfo.schema;
      companyId = tenantInfo.companyId;
    } catch {
      const tenantInfo = await getTenantSchemaByCompany(paramCompany);
      schema = tenantInfo.schema;
    }

    if (!companyId) {
      const compRes = await client.query(
        `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = LOWER($1) LIMIT 1`,
        [paramCompany]
      );
      if (compRes.rowCount) {
        companyId = Number(compRes.rows[0].id);
        schema = compRes.rows[0].schema_name;
      } else {
        return NextResponse.json(
          { success: false, error: `Company '${paramCompany}' not found.` },
          { status: 404 }
        );
      }
    }

    await ensurePaymentGatewayTable(client, schema);

    const configRes = await client.query(
      `SELECT id, provider, key_id, key_secret, webhook_secret, is_active, updated_at
       FROM "${schema}".payment_gateway_configs
       WHERE provider = 'razorpay'
       LIMIT 1`
    );

    let config = null;

    if (configRes.rowCount) {
      const row = configRes.rows[0];
      let maskedSecret = "••••••••";
      try {
        const decrypted = decryptSecret(row.key_secret);
        maskedSecret = maskSecret(decrypted, 4);
      } catch {
        maskedSecret = maskSecret(row.key_secret, 4);
      }

      config = {
        provider: row.provider || "razorpay",
        key_id: row.key_id,
        key_secret_masked: maskedSecret,
        has_secret: !!row.key_secret,
        has_webhook_secret: !!row.webhook_secret,
        is_active: row.is_active ?? true,
        updated_at: row.updated_at,
      };
    } else {
      // Check fallback in ecom_settings
      const ecomRes = await client.query(
        `SELECT gateway_key_id, gateway_key_secret_enc, gateway_webhook_secret_enc
         FROM "${schema}".ecom_settings
         WHERE company_id = $1
         LIMIT 1`,
        [companyId]
      );

      if (ecomRes.rowCount && ecomRes.rows[0].gateway_key_id) {
        const eRow = ecomRes.rows[0];
        let maskedSecret = "••••••••";
        if (eRow.gateway_key_secret_enc) {
          try {
            const decrypted = decryptSecret(eRow.gateway_key_secret_enc);
            maskedSecret = maskSecret(decrypted, 4);
          } catch {
            maskedSecret = maskSecret(eRow.gateway_key_secret_enc, 4);
          }
        }

        config = {
          provider: "razorpay",
          key_id: eRow.gateway_key_id,
          key_secret_masked: maskedSecret,
          has_secret: !!eRow.gateway_key_secret_enc,
          has_webhook_secret: !!eRow.gateway_webhook_secret_enc,
          is_active: true,
          updated_at: null,
        };
      }
    }

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (err: any) {
    console.error("[Get Payment Gateway Settings Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load payment gateway settings" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();

  try {
    const { company: paramCompany } = await params;
    let schema = "";
    let companyId: number | null = null;

    try {
      const tenantInfo = await getTenantSchema(req);
      schema = tenantInfo.schema;
      companyId = tenantInfo.companyId;
    } catch {
      const tenantInfo = await getTenantSchemaByCompany(paramCompany);
      schema = tenantInfo.schema;
    }

    if (!companyId) {
      const compRes = await client.query(
        `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = LOWER($1) LIMIT 1`,
        [paramCompany]
      );
      if (compRes.rowCount) {
        companyId = Number(compRes.rows[0].id);
        schema = compRes.rows[0].schema_name;
      } else {
        return NextResponse.json(
          { success: false, error: `Company '${paramCompany}' not found.` },
          { status: 404 }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const {
      provider = "razorpay",
      key_id,
      key_secret,
      webhook_secret,
      is_active = true,
    } = body;

    const trimmedKeyId = String(key_id || "").trim();
    const trimmedKeySecret = String(key_secret || "").trim();
    const trimmedWebhookSecret = String(webhook_secret || "").trim();

    if (!trimmedKeyId) {
      return NextResponse.json(
        { success: false, error: "Razorpay Key ID (key_id) is required." },
        { status: 400 }
      );
    }

    await ensurePaymentGatewayTable(client, schema);

    // Check existing config to see if key_secret was left unchanged (e.g. masked)
    const existingRes = await client.query(
      `SELECT key_secret, webhook_secret FROM "${schema}".payment_gateway_configs WHERE provider = $1 LIMIT 1`,
      [provider]
    );

    let encryptedSecret = "";
    if (trimmedKeySecret && !trimmedKeySecret.includes("••••")) {
      encryptedSecret = encryptSecret(trimmedKeySecret);
    } else if (existingRes.rowCount && existingRes.rows[0].key_secret) {
      encryptedSecret = existingRes.rows[0].key_secret;
    } else {
      return NextResponse.json(
        { success: false, error: "Razorpay Key Secret is required." },
        { status: 400 }
      );
    }

    let encryptedWebhookSecret: string | null = null;
    if (trimmedWebhookSecret && !trimmedWebhookSecret.includes("••••")) {
      encryptedWebhookSecret = encryptSecret(trimmedWebhookSecret);
    } else if (existingRes.rowCount && existingRes.rows[0].webhook_secret) {
      encryptedWebhookSecret = existingRes.rows[0].webhook_secret;
    }

    // 1. Upsert payment_gateway_configs
    await client.query(
      `INSERT INTO "${schema}".payment_gateway_configs (
         provider, key_id, key_secret, webhook_secret, is_active, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (provider) DO UPDATE
       SET key_id = EXCLUDED.key_id,
           key_secret = EXCLUDED.key_secret,
           webhook_secret = COALESCE(EXCLUDED.webhook_secret, "${schema}".payment_gateway_configs.webhook_secret),
           is_active = EXCLUDED.is_active,
           updated_at = NOW()`,
      [provider, trimmedKeyId, encryptedSecret, encryptedWebhookSecret, !!is_active]
    );

    // 2. Sync to ecom_settings for backward compatibility
    await client.query(
      `UPDATE "${schema}".ecom_settings
       SET gateway_provider = $1,
           gateway_key_id = $2,
           gateway_key_secret_enc = $3,
           gateway_webhook_secret_enc = COALESCE($4, gateway_webhook_secret_enc),
           updated_at = NOW()
       WHERE company_id = $5`,
      [provider, trimmedKeyId, encryptedSecret, encryptedWebhookSecret, companyId]
    );

    return NextResponse.json({
      success: true,
      message: "Razorpay payment gateway configuration saved successfully.",
    });
  } catch (err: any) {
    console.error("[Save Payment Gateway Settings Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save payment gateway settings" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
