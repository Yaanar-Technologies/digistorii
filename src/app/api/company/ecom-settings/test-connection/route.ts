import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import { decryptSecret } from "@/lib/cryptoHelper";
import { getCourierAdapter } from "@/lib/couriers";

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema, companyId } = await getTenantSchema(req);
    const body = await req.json();

    const {
      partner,
      delivery_api_key,
      delivery_api_secret,
    } = body;

    const selectedPartner = (partner || "self").trim().toLowerCase();

    let apiKey = delivery_api_key ? String(delivery_api_key).trim() : "";
    let apiSecret = delivery_api_secret ? String(delivery_api_secret).trim() : "";

    // If credentials are not provided directly in body, load from tenant's ecom_settings
    if ((!apiKey || !apiSecret) && selectedPartner !== "self") {
      const settingsRes = await client.query(
        `SELECT delivery_partner, delivery_api_key_enc, delivery_api_secret_enc
         FROM "${schema}".ecom_settings
         WHERE company_id = $1
         LIMIT 1`,
        [companyId]
      );

      const settings = settingsRes.rows[0] || {};

      if (!apiKey && settings.delivery_api_key_enc) {
        try {
          apiKey = decryptSecret(settings.delivery_api_key_enc);
        } catch (decryptErr) {
          console.error("Failed to decrypt stored delivery_api_key_enc:", decryptErr);
        }
      }

      if (!apiSecret && settings.delivery_api_secret_enc) {
        try {
          apiSecret = decryptSecret(settings.delivery_api_secret_enc);
        } catch (decryptErr) {
          console.error("Failed to decrypt stored delivery_api_secret_enc:", decryptErr);
        }
      }
    }

    if (selectedPartner === "shiprocket" && (!apiKey || !apiSecret)) {
      return NextResponse.json({
        success: false,
        message: "Shiprocket requires both an API Key (Account Email) and API Secret (Password).",
      });
    }

    if (selectedPartner === "delhivery" && !apiKey) {
      return NextResponse.json({
        success: false,
        message: "Delhivery requires an API Token (apiKey).",
      });
    }

    const adapter = getCourierAdapter(selectedPartner);
    const testResult = await adapter.testConnection({
      apiKey,
      apiSecret,
    });

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message || (testResult.success ? "Connected successfully" : "Connection failed"),
    });
  } catch (err: any) {
    console.error("Courier test connection error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Failed to test courier connection",
      },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

