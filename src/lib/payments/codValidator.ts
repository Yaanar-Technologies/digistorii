import { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

export interface CodValidationResult {
  eligible: boolean;
  maxCodAmount: number;
  reason?: string;
  requirePhoneOtp?: boolean;
}

export async function validateCodEligibility(
  client: Queryable,
  schema: string,
  orderSubtotal: number,
  destinationPincode?: string | null,
  isPhoneVerified: boolean = true
): Promise<CodValidationResult> {
  // 1. Fetch store COD settings
  const settingsRes = await client.query(
    `SELECT cod_max_order_value, cod_require_otp
     FROM "${schema}".ecom_settings
     LIMIT 1`
  );

  const settings = settingsRes.rows[0] || {};
  const maxCod = settings.cod_max_order_value != null ? Number(settings.cod_max_order_value) : 5000;
  const requireOtp = Boolean(settings.cod_require_otp);

  // 2. Check Maximum Order Value
  if (maxCod > 0 && orderSubtotal > maxCod) {
    return {
      eligible: false,
      maxCodAmount: maxCod,
      reason: `Order value (₹${orderSubtotal.toLocaleString("en-IN")}) exceeds maximum permitted limit of ₹${maxCod.toLocaleString("en-IN")} for Cash on Delivery.`,
    };
  }

  // 3. Check Pincode COD Serviceability
  if (destinationPincode) {
    const cleanPin = destinationPincode.trim();
    const pinRes = await client.query(
      `SELECT cod_available
       FROM "${schema}".shipping_zone_pincodes
       WHERE pincode = $1
       LIMIT 1`,
      [cleanPin]
    );

    if (pinRes.rowCount && pinRes.rowCount > 0) {
      if (pinRes.rows[0].cod_available === false) {
        return {
          eligible: false,
          maxCodAmount: maxCod,
          reason: `Cash on Delivery is currently unserviceable for pincode ${cleanPin}. Please select an online payment method.`,
        };
      }
    }
  }

  // 4. Check Phone OTP Verification requirement
  if (requireOtp && !isPhoneVerified) {
    return {
      eligible: true,
      maxCodAmount: maxCod,
      requirePhoneOtp: true,
      reason: "OTP verification required for phone number before placing COD order.",
    };
  }

  return {
    eligible: true,
    maxCodAmount: maxCod,
    requirePhoneOtp: false,
  };
}

