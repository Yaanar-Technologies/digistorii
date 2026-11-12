import { PoolClient, Pool } from "pg";

type Queryable = Pool | PoolClient;

export interface ShippingCalculationResult {
  shippingFee: number;
  isFreeShipping: boolean;
  zoneId: number | null;
  zoneName: string;
  zoneType: string;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  estimatedArrivalDate: Date;
  formattedArrival: string;
  breakdown: {
    baseCharge: number;
    incrementalCharge: number;
    weightGrams: number;
    subtotal: number;
    freeShippingReason?: string;
  };
}

export async function calculateShippingFee(
  client: Queryable,
  schema: string,
  destinationPincode: string | null | undefined,
  totalWeightGrams: number = 500,
  orderSubtotal: number = 0
): Promise<ShippingCalculationResult> {
  const cleanPincode = (destinationPincode || "").trim();
  const weight = Math.max(100, Number(totalWeightGrams) || 500);
  const subtotal = Math.max(0, Number(orderSubtotal) || 0);

  // 1. Fetch store settings for fallback threshold/base fee
  const settingsRes = await client.query(
    `SELECT shipping_free_threshold, shipping_fee
     FROM "${schema}".ecom_settings
     LIMIT 1`
  );
  const settings = settingsRes.rows[0] || {};
  const globalFreeThreshold = settings.shipping_free_threshold != null
    ? Number(settings.shipping_free_threshold)
    : 500;
  const globalBaseFee = settings.shipping_fee != null
    ? Number(settings.shipping_fee)
    : 49;

  // 2. Resolve Zone by Pincode
  let resolvedZone: { id: number; name: string; zone_type: string } = {
    id: 0,
    name: "Standard National",
    zone_type: "INTER_STATE",
  };

  if (cleanPincode) {
    const zoneRes = await client.query(
      `SELECT sz.id, sz.name, sz.zone_type
       FROM "${schema}".shipping_zone_pincodes zp
       JOIN "${schema}".shipping_zones sz ON sz.id = zp.zone_id
       WHERE zp.pincode = $1 AND sz.is_active = true
       LIMIT 1`,
      [cleanPincode]
    );
    if (zoneRes.rowCount && zoneRes.rowCount > 0) {
      resolvedZone = zoneRes.rows[0];
    }
  }

  // Fallback to INTER_STATE or first active zone if pincode not mapped
  if (resolvedZone.id === 0) {
    const fallbackRes = await client.query(
      `SELECT id, name, zone_type
       FROM "${schema}".shipping_zones
       WHERE is_active = true
       ORDER BY CASE WHEN zone_type = 'INTER_STATE' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`
    );
    if (fallbackRes.rowCount && fallbackRes.rowCount > 0) {
      resolvedZone = fallbackRes.rows[0];
    }
  }

  // 3. Resolve Rate Rule for this Zone
  let rateRule: {
    base_charge: number;
    incremental_weight_grams: number;
    incremental_charge: number;
    is_free_shipping: boolean;
    min_delivery_days: number;
    max_delivery_days: number;
  } | null = null;

  if (resolvedZone.id > 0) {
    const ruleRes = await client.query(
      `SELECT base_charge, incremental_weight_grams, incremental_charge, is_free_shipping,
              min_delivery_days, max_delivery_days
       FROM "${schema}".shipping_rate_rules
       WHERE zone_id = $1
         AND is_active = true
         AND (min_order_value <= $2)
         AND (max_order_value IS NULL OR max_order_value >= $2)
         AND (min_weight_grams <= $3)
         AND (max_weight_grams IS NULL OR max_weight_grams >= $3)
       ORDER BY is_free_shipping DESC, base_charge ASC
       LIMIT 1`,
      [resolvedZone.id, subtotal, weight]
    );

    if (ruleRes.rowCount && ruleRes.rowCount > 0) {
      rateRule = {
        base_charge: Number(ruleRes.rows[0].base_charge || 0),
        incremental_weight_grams: Number(ruleRes.rows[0].incremental_weight_grams || 500),
        incremental_charge: Number(ruleRes.rows[0].incremental_charge || 0),
        is_free_shipping: Boolean(ruleRes.rows[0].is_free_shipping),
        min_delivery_days: Number(ruleRes.rows[0].min_delivery_days || 2),
        max_delivery_days: Number(ruleRes.rows[0].max_delivery_days || 5),
      };
    }
  }

  // Default rate rule fallback if no specific rule matched
  if (!rateRule) {
    rateRule = {
      base_charge: globalBaseFee,
      incremental_weight_grams: 500,
      incremental_charge: 25,
      is_free_shipping: false,
      min_delivery_days: 2,
      max_delivery_days: 5,
    };
  }

  const minDays = rateRule.min_delivery_days;
  const maxDays = rateRule.max_delivery_days;
  const estimatedArrivalDate = new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000);
  const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const formattedArrival = `Arrives by ${estimatedArrivalDate.toLocaleDateString("en-US", options)} (${minDays}–${maxDays} business days)`;

  // Check Free Shipping Conditions
  if (rateRule.is_free_shipping) {
    return {
      shippingFee: 0,
      isFreeShipping: true,
      zoneId: resolvedZone.id || null,
      zoneName: resolvedZone.name,
      zoneType: resolvedZone.zone_type,
      minDeliveryDays: minDays,
      maxDeliveryDays: maxDays,
      estimatedArrivalDate,
      formattedArrival,
      breakdown: {
        baseCharge: 0,
        incrementalCharge: 0,
        weightGrams: weight,
        subtotal,
        freeShippingReason: "Zone Free Shipping Rule matched",
      },
    };
  }

  if (globalFreeThreshold > 0 && subtotal >= globalFreeThreshold) {
    return {
      shippingFee: 0,
      isFreeShipping: true,
      zoneId: resolvedZone.id || null,
      zoneName: resolvedZone.name,
      zoneType: resolvedZone.zone_type,
      minDeliveryDays: minDays,
      maxDeliveryDays: maxDays,
      estimatedArrivalDate,
      formattedArrival,
      breakdown: {
        baseCharge: 0,
        incrementalCharge: 0,
        weightGrams: weight,
        subtotal,
        freeShippingReason: `Order subtotal exceeds free delivery threshold (₹${globalFreeThreshold})`,
      },
    };
  }

  // Calculate Base + Ceiling Incremental Charge for weight exceeding incremental threshold
  const baseCharge = rateRule.base_charge;
  const baseWeightAllowance = rateRule.incremental_weight_grams; // typically 500g covered by base charge
  let incrementalCharge = 0;

  if (weight > baseWeightAllowance && rateRule.incremental_weight_grams > 0) {
    const extraWeight = weight - baseWeightAllowance;
    const additionalUnits = Math.ceil(extraWeight / rateRule.incremental_weight_grams);
    incrementalCharge = additionalUnits * rateRule.incremental_charge;
  }

  const calculatedFee = Number((baseCharge + incrementalCharge).toFixed(2));

  return {
    shippingFee: calculatedFee,
    isFreeShipping: false,
    zoneId: resolvedZone.id || null,
    zoneName: resolvedZone.name,
    zoneType: resolvedZone.zone_type,
    minDeliveryDays: minDays,
    maxDeliveryDays: maxDays,
    estimatedArrivalDate,
    formattedArrival,
    breakdown: {
      baseCharge,
      incrementalCharge,
      weightGrams: weight,
      subtotal,
    },
  };
}
