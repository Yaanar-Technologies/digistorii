import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/hash";
import { ensureDB } from "@/lib/ensure-db";
import { createEcomSchema } from "@/lib/schema";
import { ensureLocationTableShape } from "@/lib/locationSchema";
import { normalizeBillingInterval, PLAN_CONFIG, SetupStage, getNextStepNumber, isValidSetupStage, } from "@/lib/onboarding";
import {
  extractPanFromGstin,
  getGstStateCodeForState,
  isValidGstin,
  isValidPan,
  normalizeGstin,
  normalizePan,
} from "@/lib/onboardingBusiness";
import {
  ensureCompanyResponsibilities,
  getResponsibilitiesForCompany,
} from "@/lib/userResponsibilities";

type CompanyContext = {
  id: number;
  company_name: string;
  subdomain_url: string;
  schema_name: string;
  setup_stage: SetupStage;
  gst_number: string | null;
  pan_number: string | null;
  currency: string | null;
};

function toSetupStage(value: string | null | undefined): SetupStage {
  if (value && isValidSetupStage(value)) return value;
  return "ACCOUNT_CREATED";
}

async function getCompanyContext(client: any, company: string): Promise<CompanyContext> {
  const result = await client.query(
    `SELECT id, company_name, subdomain_url, schema_name, setup_stage, gst_number, pan_number, currency
     FROM public.companies
     WHERE subdomain_url = $1
     LIMIT 1`,
    [company]
  );

  if (!result.rowCount) {
    throw new Error("Company not found");
  }

  const row = result.rows[0];
  return {
    id: Number(row.id),
    company_name: row.company_name,
    subdomain_url: row.subdomain_url,
    schema_name: row.schema_name,
    setup_stage: toSetupStage(row.setup_stage),
    gst_number: row.gst_number || null,
    pan_number: row.pan_number || null,
    currency: row.currency || null,
  };
}

async function getOwnerForCompany(client: any, companyId: number) {
  const owner = await client.query(
    `SELECT id, phone, phone_verified
     FROM public.users
     WHERE company_id = $1
     ORDER BY id ASC
     LIMIT 1`,
    [companyId]
  );
  return owner.rows[0] || null;
}

async function getPlanDetails(client: any, planId: number, billingInterval: string) {
  const planResult = await client.query(
    `SELECT id, name, price_monthly, price_yearly
     FROM public.plans
     WHERE id = $1 AND is_active = TRUE
     LIMIT 1`,
    [planId]
  );
  if (!planResult.rowCount) {
    throw new Error("Selected plan is not available");
  }
  const planRow = planResult.rows[0];
  const featuresResult = await client.query(
    `SELECT feature_key, value_int, value_bool
     FROM public.plan_features
     WHERE plan_id = $1`,
    [planId]
  );
  const featureMap = new Map<string, any>(
    featuresResult.rows.map((row: any) => [String(row.feature_key), row])
  );
  const planCode = String(planRow.name || "").toUpperCase();
  const fallback = (PLAN_CONFIG as any)[planCode] || PLAN_CONFIG.BASIC;
  const getInt = (key: string, fallbackValue: number) => {
    const value = featureMap.get(key)?.value_int;
    return value == null ? fallbackValue : Number(value);
  };
  const getBool = (key: string, fallbackValue: boolean) => {
    const value = featureMap.get(key)?.value_bool;
    return value == null ? fallbackValue : Boolean(value);
  };

  return {
    id: Number(planRow.id),
    code: planCode,
    amount:
      normalizeBillingInterval(billingInterval) === "yearly"
        ? Number(planRow.price_yearly || 0)
        : Number(planRow.price_monthly || 0),
    ecommerce_access: getBool("ecommerce_access", Boolean(fallback.ecommerce_access)),
    max_users: getInt("max_users", Number(fallback.max_users || 5)),
    max_warehouses: getInt("max_warehouses", Number(fallback.max_warehouses || 1)),
    max_locations: getInt("max_locations", Number(fallback.max_locations || 1)),
  };
}

async function getPlanForCompany(client: any, companyId: number) {
  const sub = await client.query(
    `SELECT
       cs.plan_id,
       cs.plan_code,
       (SELECT name FROM public.plans WHERE id = cs.plan_id) AS plan_name,
       cs.ecommerce_access,
       cs.max_users,
       cs.max_warehouses,
       COALESCE(
         cs.max_locations,
         (
           SELECT pf.value_int
           FROM public.plan_features pf
           WHERE pf.plan_id = cs.plan_id
             AND pf.feature_key = 'max_locations'
           LIMIT 1
         ),
         cs.max_warehouses,
         1
       ) AS max_locations,
       cs.status,
       cs.billing_interval,
       cs.amount,
       cs.payment_status,
       cs.razorpay_order_id,
       cs.subscription_start,
       cs.subscription_end
     FROM public.company_subscriptions cs
     WHERE cs.company_id = $1
     ORDER BY cs.updated_at DESC, cs.id DESC
     LIMIT 1`,
    [companyId]
  );
  if (!sub.rowCount) {
    return null;
  }
  return sub.rows[0];
}

function parseCompany(req: NextRequest): string {
  const companyFromQuery = req.nextUrl.searchParams.get("company");
  const companyFromHeader = req.headers.get("x-tenant");
  const company = (companyFromQuery || companyFromHeader || "").trim().toLowerCase();
  if (!company) {
    throw new Error("Company is required");
  }
  return company;
}

export async function GET(req: NextRequest) {
  //await ensureDB();
  const client = await pool.connect();
  try {
    const company = parseCompany(req);
    const context = await getCompanyContext(client, company);
    await ensureCompanyResponsibilities(client, context.id);

    const subscription = await getPlanForCompany(client, context.id);
    const businessSettings = await client.query(
      `SELECT gst_number, pan_number, business_address, city, state, country, currency, timezone, invoice_prefix
       FROM "${context.schema_name}".business_settings
       ORDER BY id ASC
       LIMIT 1`
    );
    const businessRow = businessSettings.rows[0] || null;
    const stateCode = getGstStateCodeForState(String(businessRow?.state || "").trim());
    const gstAvailable = Boolean(businessRow?.gst_available);

    const rawGst = String(businessRow?.gst_number || "").trim();

    const gstNumber =
      gstAvailable && rawGst
        ? normalizeGstin(rawGst, stateCode)
        : "";

    const panInput =
      gstAvailable
        ? normalizePan(String(businessRow?.pan_number || "").trim())
        : "";

    const panNumber =
      gstAvailable && gstNumber
        ? panInput || extractPanFromGstin(gstNumber)
        : "";
    const currency = context.currency || businessRow?.currency || null;

    if (
      (gstNumber && gstNumber !== context.gst_number) ||
      (panNumber && panNumber !== context.pan_number) ||
      (currency && currency !== context.currency)
    ) {
      await client.query(
        `UPDATE public.companies
         SET gst_number = COALESCE(gst_number, $2),
             pan_number = COALESCE(pan_number, $3),
             currency = COALESCE(currency, $4),
             updated_at = NOW()
         WHERE id = $1`,
        [context.id, gstNumber, panNumber, currency]
      );
    }
    const warehouseCountResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${context.schema_name}".warehouses`
    );
    const locationCountResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${context.schema_name}".locations`
    );
    const paymentModesCountResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${context.schema_name}".payment_modes WHERE is_active = TRUE`
    );
    const staffCountResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM public.company_user_map
       WHERE company_id = $1 AND is_active = TRUE`,
      [context.id]
    );
    const owner = await getOwnerForCompany(client, context.id);

    return NextResponse.json({
      success: true,
      company: {
        id: context.id,
        name: context.company_name,
        slug: context.subdomain_url,
        schema: context.schema_name,
        setup_stage: context.setup_stage,
        next_step: getNextStepNumber(context.setup_stage),
        owner_phone: owner?.phone || null,
        phone_verified: Boolean(owner?.phone_verified),
      },
      subscription: subscription
        ? {
          plan_id: Number(subscription.plan_id),
          plan_code: subscription.plan_code,
          plan_name: subscription.plan_code,
          subscription_end: subscription.subscription_end,
          subscription_start: subscription.subscription_start,
          ecommerce_access: Boolean(subscription.ecommerce_access),
          max_users: Number(subscription.max_users ?? 5),
          max_locations: Number(subscription.max_locations ?? subscription.max_warehouses ?? 1),
          max_warehouses: Number(subscription.max_warehouses ?? 1),
          status: subscription.status,
          billing_interval: normalizeBillingInterval(subscription.billing_interval),
          amount: Number(subscription.amount ?? 0),
        }
        : null,
      business_settings: {
        ...(businessRow || {}),
        gst_available: gstAvailable,
        gst_number: gstNumber,
        pan_number: panNumber,
        currency,
      },
      counts: {
        locations: Number(locationCountResult.rows[0]?.count || 0),
        warehouses: Number(warehouseCountResult.rows[0]?.count || 0),
        payment_modes: Number(paymentModesCountResult.rows[0]?.count || 0),
        users: Number(staffCountResult.rows[0]?.count || 0),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Unable to load onboarding status" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  //await ensureDB();
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const body = await req.json();
    const company = String(body?.company || "").trim().toLowerCase();
    const step = String(body?.step || "").trim().toUpperCase();
    const data = body?.data || {};

    if (!company) {
      throw new Error("Company is required");
    }

    const context = await getCompanyContext(client, company);
    await ensureCompanyResponsibilities(client, context.id);

    await client.query("BEGIN");
    transactionStarted = true;

    if (step === "PHONE_VERIFIED") {
      // Mark phone as verified and advance stage
      const owner = await getOwnerForCompany(client, context.id);
      if (!owner?.phone_verified) {
        throw new Error("Phone number must be verified via OTP before proceeding");
      }
      await client.query(
        `UPDATE public.companies
         SET setup_stage = 'PHONE_VERIFIED', updated_at = NOW()
         WHERE id = $1`,
        [context.id]
      );
    } else if (step === "PLAN_SELECTED") {
      const requestedPlanId = Number(data?.plan_id || 0);
      const billingInterval = normalizeBillingInterval(data?.billing_interval);
      const plan = await getPlanDetails(client, requestedPlanId, billingInterval);
      const paymentStatusInput = String(data?.payment_status || "").trim().toUpperCase();
      const paymentStatus = paymentStatusInput === "SUCCESS" ? "paid" : "created";
      const razorpayOrderId = String(data?.razorpay_order_id || "").trim() || null;
      const razorpayPaymentId = String(data?.payment_id || "").trim() || null;
      const razorpaySignature = String(data?.razorpay_signature || "").trim() || null;
      const periodStart = new Date();
      const periodEnd = new Date(periodStart);
      if (billingInterval === "yearly") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const subscriptionUpsert = await client.query(
        `INSERT INTO public.company_subscriptions
         (
           company_id,
           plan_id,
           plan_code,
           ecommerce_access,
           max_users,
           max_warehouses,
           max_locations,
           billing_interval,
           amount,
           payment_status,
           razorpay_order_id,
           subscription_start,
           subscription_end,
          status,
           current_period_start,
           current_period_end,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ACTIVE', $12, $13, NOW())
         ON CONFLICT (company_id) DO UPDATE
         SET
           plan_id = EXCLUDED.plan_id,
           plan_code = EXCLUDED.plan_code,
           ecommerce_access = EXCLUDED.ecommerce_access,
           max_users = EXCLUDED.max_users,
           max_warehouses = EXCLUDED.max_warehouses,
           max_locations = EXCLUDED.max_locations,
           billing_interval = EXCLUDED.billing_interval,
           amount = EXCLUDED.amount,
           payment_status = EXCLUDED.payment_status,
           razorpay_order_id = EXCLUDED.razorpay_order_id,
           subscription_start = EXCLUDED.subscription_start,
           subscription_end = EXCLUDED.subscription_end,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           status = 'ACTIVE',
           updated_at = NOW()
         RETURNING id`,
        [
          context.id,
          plan.id,
          plan.code,
          plan.ecommerce_access,
          plan.max_users,
          plan.max_warehouses,
          plan.max_locations,
          billingInterval,
          plan.amount,
          paymentStatus,
          razorpayOrderId,
          periodStart,
          periodEnd,
        ]
      );
      const subscriptionId = Number(subscriptionUpsert.rows[0]?.id || 0);

      if (plan.ecommerce_access) {
        await createEcomSchema(client, context.schema_name, context.id);
      }

      await client.query(
        `WITH latest_payment AS (
           SELECT id
           FROM public.payments
           WHERE company_id = $1
             AND UPPER(plan_name) = $2
             AND COALESCE(LOWER(billing_interval), 'monthly') = $3
           ORDER BY id DESC
           LIMIT 1
         )
         UPDATE public.payments p
         SET
           subscription_id = CASE WHEN $4 > 0 THEN $4 ELSE p.subscription_id END,
           payment_status = $5,
           status = CASE WHEN $5 = 'paid' THEN 'paid' ELSE p.status END,
           razorpay_payment_id = COALESCE($6, p.razorpay_payment_id),
           razorpay_order_id = COALESCE($7, p.razorpay_order_id),
           razorpay_signature = COALESCE($8, p.razorpay_signature),
           subscription_start = $9,
           subscription_end = $10,
           updated_at = NOW()
         FROM latest_payment
         WHERE p.id = latest_payment.id`,
        [
          context.id,
          plan.code,
          billingInterval,
          subscriptionId,
          paymentStatus,
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature,
          periodStart,
          periodEnd,
        ]
      );

      await client.query(
        `UPDATE public.companies
         SET setup_stage = 'PLAN_SELECTED',
             subscription_plan = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [context.id, plan.code]
      );
    } else if (step === "BUSINESS_SETUP") {
      const gstAvailable = Boolean(data?.gst_available);
      const state = String(data?.state || "").trim();
      const currency =
        String(data?.currency || "").trim().toUpperCase() || null;
      let gstNumber = "";
      let panNumber = "";
      if (gstAvailable) {
        const stateCode = getGstStateCodeForState(state);
        gstNumber = normalizeGstin(
          String(data?.gst_number || "").trim(),
          stateCode
        );
        const panInput = normalizePan(
          String(data?.pan_number || "").trim()
        );
        panNumber = gstNumber
          ? panInput || extractPanFromGstin(gstNumber)
          : "";
      }
      // if (gstNumber && !isValidGstin(gstNumber)) {
      //   throw new Error("GST number must match the format 33AAAAA9999A1Z5");
      // }
      // if (gstNumber && stateCode && !gstNumber.startsWith(stateCode)) {
      //   throw new Error("GST number state code must match the selected state");
      // }
      // if (panNumber && !isValidPan(panNumber)) {
      //   throw new Error("PAN number must match the format AAAAA9999A");
      // }
      if (currency) {
        const currencyExists = await client.query(
          `SELECT 1
           FROM "${context.schema_name}".currencies
           WHERE upper(currency_code) = $1
           LIMIT 1`,
          [currency]
        );
        if (!currencyExists.rowCount) {
          throw new Error("Selected currency is invalid");
        }
      }

      const payload = {
        gst_available: gstAvailable,
        gst_number: gstAvailable ? gstNumber : null,
        pan_number: gstAvailable ? panNumber : null,

        business_address:
          String(data?.business_address || "").trim() || null,

        city:
          String(data?.city || "").trim() || null,

        state:
          state || null,

        country: "India",

        timezone:
          String(data?.timezone || "").trim() || null,

        invoice_prefix:
          String(data?.invoice_prefix || "").trim() || null,
      };

      await client.query(
        `UPDATE public.companies
   SET gst_available = $2,
       gst_number = $3,
       pan_number = $4,
       address = $5,
       city = $6,
       state = $7,
       country = $8,
       currency = $9,
       updated_at = NOW()
   WHERE id = $1`,
        [
          context.id,
          payload.gst_available,
          payload.gst_number,
          payload.pan_number,
          payload.business_address,
          payload.city,
          payload.state,
          payload.country,
          currency
        ]
      );
      const existingBusiness = await client.query(
        `SELECT id FROM "${context.schema_name}".business_settings ORDER BY id ASC LIMIT 1`
      );
      if (existingBusiness.rowCount) {
        await client.query(
          `UPDATE "${context.schema_name}".business_settings
SET gst_available = $1,
    gst_number = $2,
    pan_number = $3,
    business_address = $4,
    city = $5,
    state = $6,
    country = $7,
    timezone = $8,
    invoice_prefix = $9,
    updated_at = NOW()
WHERE id = $10`,
          [
            payload.gst_available,
            payload.gst_number,
            payload.pan_number,
            payload.business_address,
            payload.city,
            payload.state,
            payload.country,
            payload.timezone,
            payload.invoice_prefix,
            existingBusiness.rows[0].id,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO "${context.schema_name}".business_settings
(
  gst_available,
  gst_number,
  pan_number,
  business_address,
  city,
  state,
  country,
  timezone,
  invoice_prefix,
  created_at,
  updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())`,
          [
            payload.gst_available,
            payload.gst_number,
            payload.pan_number,
            payload.business_address,
            payload.city,
            payload.state,
            payload.country,
            payload.timezone,
            payload.invoice_prefix,
          ]
        );
      }

      await client.query(
        `UPDATE public.companies
         SET setup_stage = 'BUSINESS_SETUP', updated_at = NOW()
         WHERE id = $1`,
        [context.id]
      );

      // Auto-create default location and warehouse if they don't exist
      let locationId: number | null = null;
      let warehouseId: number | null = null;

      const locCheck = await client.query(`SELECT id FROM "${context.schema_name}".locations WHERE is_default = TRUE LIMIT 1`);
      if (locCheck.rowCount) {
        locationId = locCheck.rows[0].id;
      } else {
        const locationInsert = await client.query(
          `INSERT INTO "${context.schema_name}".locations
           (
             name, type, same_as_registered, same_as_bill_to,
             registered_address_line_1, registered_country, registered_state, registered_city,
             is_default, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           RETURNING id`,
          ["Main Branch", "global", true, true, payload.business_address, payload.country, payload.state, payload.city, true]
        );
        locationId = locationInsert.rows[0].id;
      }

      const whCheck = await client.query(`SELECT id FROM "${context.schema_name}".warehouses WHERE is_default = TRUE LIMIT 1`);
      if (whCheck.rowCount) {
        warehouseId = whCheck.rows[0].id;
      } else {
        const warehouseInsert = await client.query(
          `INSERT INTO "${context.schema_name}".warehouses
           (
             code, name, location_id, type, 
             same_as_ship_to, address_line_1, address_line_2, city, state, country, pincode,
             is_default, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
           RETURNING id`,
          [
            "WH001",
            "Default Warehouse",
            locationId,
            "global",
            true,
            payload.business_address,
            null,
            payload.city,
            payload.state,
            payload.country,
            null,
            true
          ]
        );
        warehouseId = warehouseInsert.rows[0].id;
      }

      const owner = await getOwnerForCompany(client, context.id);
      if (owner?.id) {
        await client.query(
          `UPDATE public.company_user_map
           SET location_id = COALESCE(location_id, $1),
               warehouse_id = COALESCE(warehouse_id, $2)
           WHERE company_id = $3 AND user_id = $4`,
          [locationId, warehouseId, context.id, owner.id]
        );
      }
    } else if (step === "LOCATION_SETUP") {
      const subscription = await getPlanForCompany(client, context.id);
      const maxLocations = Number(
        subscription?.max_locations ??
        subscription?.max_warehouses ??
        PLAN_CONFIG.BASIC.max_locations ??
        PLAN_CONFIG.BASIC.max_warehouses
      );
      const locationCountResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM "${context.schema_name}".locations`
      );
      const currentCount = Number(locationCountResult.rows[0]?.count || 0);
      if (currentCount >= maxLocations) {
        throw new Error(`Location limit reached for this plan (max ${maxLocations})`);
      }

      const locationName = String(data?.name || "").trim();
      if (!locationName) {
        throw new Error("Location name is required");
      }
      const isDefault = Boolean(data?.is_default ?? true);
      if (!isDefault) {
        const defaultLocationCount = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM "${context.schema_name}".locations
           WHERE is_default = TRUE`
        );
        if (Number(defaultLocationCount.rows[0]?.count || 0) === 0) {
          throw new Error("At least one default location is mandatory");
        }
      }

      const locationInsert = await client.query(
        `INSERT INTO "${context.schema_name}".locations
         (
           name, type, inactive_date, same_as_registered, same_as_bill_to, description,
           registered_address_line_1, registered_address_line_2, registered_country, registered_state, registered_city, registered_pincode,
           bill_address_line_1, bill_address_line_2, bill_country, bill_state, bill_city, bill_pincode,
           ship_address_line_1, ship_address_line_2, ship_country, ship_state, ship_city, ship_pincode,
           landline, mobile, fax, email, contact_person,
           is_default, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18,
           $19, $20, $21, $22, $23, $24,
           $25, $26, $27, $28, $29,
           $30, NOW(), NOW()
         )
         RETURNING id`,
        [
          locationName,
          String(data?.type || "global").trim() || "global",
          String(data?.inactive_date || "").trim() || null,
          Boolean(data?.same_as_registered),
          Boolean(data?.same_as_bill_to),
          String(data?.description || "").trim() || null,
          String(data?.registered_address_line_1 || "").trim() || null,
          String(data?.registered_address_line_2 || "").trim() || null,
          String(data?.registered_country || "").trim() || null,
          String(data?.registered_state || "").trim() || null,
          String(data?.registered_city || "").trim() || null,
          String(data?.registered_pincode || "").trim() || null,
          String(data?.bill_address_line_1 || "").trim() || null,
          String(data?.bill_address_line_2 || "").trim() || null,
          String(data?.bill_country || "").trim() || null,
          String(data?.bill_state || "").trim() || null,
          String(data?.bill_city || "").trim() || null,
          String(data?.bill_pincode || "").trim() || null,
          String(data?.ship_address_line_1 || "").trim() || null,
          String(data?.ship_address_line_2 || "").trim() || null,
          String(data?.ship_country || "").trim() || null,
          String(data?.ship_state || "").trim() || null,
          String(data?.ship_city || "").trim() || null,
          String(data?.ship_pincode || "").trim() || null,
          String(data?.landline || "").trim() || null,
          String(data?.mobile || "").trim() || null,
          String(data?.fax || "").trim() || null,
          String(data?.email || "").trim() || null,
          String(data?.contact_person || "").trim() || null,
          isDefault,
        ]
      );

      if (isDefault) {
        await client.query(
          `UPDATE "${context.schema_name}".locations
           SET is_default = FALSE
           WHERE id <> $1`,
          [Number(locationInsert.rows[0].id)]
        );
      }

      await client.query(
        `UPDATE public.companies
         SET setup_stage = 'LOCATION_SETUP', updated_at = NOW()
         WHERE id = $1`,
        [context.id]
      );


    } else if (step === "WAREHOUSE_SETUP") {
      const subscription = await getPlanForCompany(client, context.id);
      const maxWarehouses = Number(subscription?.max_warehouses ?? PLAN_CONFIG.BASIC.max_warehouses);
      const warehouseCountResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM "${context.schema_name}".warehouses`
      );
      const currentCount = Number(warehouseCountResult.rows[0]?.count || 0);
      if (currentCount >= maxWarehouses) {
        throw new Error(`Warehouse limit reached for this plan (max ${maxWarehouses})`);
      }

      const warehouseName = String(data?.name || data?.warehouse_name || "").trim();
      let warehouseAddressLine1 = String(data?.address_line_1 || "").trim();
      let warehouseAddressLine2 = String(data?.address_line_2 || "").trim();
      let warehouseCity = String(data?.city || "").trim();
      let warehouseState = String(data?.state || "").trim();
      let warehouseCountry = String(data?.country || "India").trim();
      let warehousePincode = String(data?.pincode || "").trim();
      const sameAsShipTo = Boolean(data?.same_as_ship_to ?? true);
      const warehouseCodeInput = String(data?.code || "").trim();
      const isDefault = Boolean(data?.is_default ?? true);
      if (!warehouseName) {
        throw new Error("Warehouse name is required");
      }
      if (!isDefault) {
        const defaultWarehouseCount = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM "${context.schema_name}".warehouses
           WHERE is_default = TRUE`
        );
        if (Number(defaultWarehouseCount.rows[0]?.count || 0) === 0) {
          throw new Error("At least one default warehouse is mandatory");
        }
      }

      const requestedLocationId = Number(data?.location_id || 0);
      let locationId = Number.isInteger(requestedLocationId) && requestedLocationId > 0 ? requestedLocationId : 0;
      if (!locationId) {
        const defaultLocation = await client.query(
          `SELECT id
           FROM "${context.schema_name}".locations
           ORDER BY is_default DESC, id ASC
           LIMIT 1`
        );
        if (!defaultLocation.rowCount) {
          throw new Error("At least one location is required before warehouse setup");
        }
        locationId = Number(defaultLocation.rows[0].id);
      }
      const locationExists = await client.query(
        `SELECT id, ship_address_line_1, ship_address_line_2, ship_city, ship_state, ship_country, ship_pincode FROM "${context.schema_name}".locations WHERE id = $1`,
        [locationId]
      );
      if (!locationExists.rowCount) {
        throw new Error("Selected location does not exist");
      }
      if (sameAsShipTo) {
        const loc = locationExists.rows[0];
        warehouseAddressLine1 = loc.ship_address_line_1 || "";
        warehouseAddressLine2 = loc.ship_address_line_2 || "";
        warehouseCity = loc.ship_city || "";
        warehouseState = loc.ship_state || "";
        warehouseCountry = loc.ship_country || "India";
        warehousePincode = loc.ship_pincode || "";
      }

      const warehouseCode = warehouseCodeInput || `WH${String(currentCount + 1).padStart(3, "0")}`;
      const duplicateWarehouseCode = await client.query(
        `SELECT id FROM "${context.schema_name}".warehouses
         WHERE lower(code) = lower($1)
         LIMIT 1`,
        [warehouseCode]
      );
      if (duplicateWarehouseCode.rowCount) {
        throw new Error("Warehouse code already exists");
      }

      const warehouseInsert = await client.query(
        `INSERT INTO "${context.schema_name}".warehouses
         (
           code, name, location_id, type, 
           same_as_ship_to, address_line_1, address_line_2, city, state, country, pincode,
           is_default,
           effective_from, effective_to, description, landline, mobile_no, fax, email,
           contact_person_name, contact_person_mobile, contact_person_email,
           created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4, 
           $5, $6, $7, $8, $9, $10, $11,
           $12,
           $13, $14, $15, $16, $17, $18, $19,
           $20, $21, $22,
           NOW(), NOW()
         )
           RETURNING id`,
        [
          warehouseCode,
          warehouseName,
          locationId,
          String(data?.type || "global").trim() || "global",
          sameAsShipTo,
          warehouseAddressLine1 || null,
          warehouseAddressLine2 || null,
          warehouseCity || null,
          warehouseState || null,
          warehouseCountry || null,
          warehousePincode || null,
          isDefault,
          String(data?.effective_from || "").trim() || null,
          String(data?.effective_to || "").trim() || null,
          String(data?.description || "").trim() || null,
          String(data?.landline || "").trim() || null,
          String(data?.mobile_no || "").trim() || null,
          String(data?.fax || "").trim() || null,
          String(data?.email || "").trim() || null,
          String(data?.contact_person_name || "").trim() || null,
          String(data?.contact_person_mobile || "").trim() || null,
          String(data?.contact_person_email || "").trim() || null,

        ]
      );
      const warehouseId = Number(warehouseInsert.rows[0].id);
      const owner = await getOwnerForCompany(client, context.id);


      if (owner?.id) {
        await client.query(
          `
          UPDATE public.company_user_map
          SET
              location_id = $1,
              warehouse_id = $2
          WHERE
              company_id = $3
              AND user_id = $4
              AND location_id IS NULL
              AND warehouse_id IS NULL
          `,
          [
            locationId,
            warehouseId,
            context.id,
            owner.id,
          ]
        );
      }

      if (isDefault) {
        await client.query(
          `UPDATE "${context.schema_name}".warehouses
           SET is_default = FALSE
           WHERE id <> $1`,
          [warehouseId]
        );
      }

      await client.query(
        `UPDATE public.companies
         SET setup_stage = 'WAREHOUSE_SETUP', updated_at = NOW()
         WHERE id = $1`,
        [context.id]
      );
    } else if (step === "STAFF_SETUP") {
      const users: Array<{
        name: string;
        email: string;
        username: string;
        phone: string;
        password: string;
        responsibility_id?: string | number;
        location_id?: string | number;
        warehouse_id?: string | number;
      }> = Array.isArray(data?.users)
          ? data.users
          : [];

      const responsibilities = await getResponsibilitiesForCompany(client, context.id);
      const subscription = await getPlanForCompany(client, context.id);
      const maxUsers = Number(subscription?.max_users ?? PLAN_CONFIG.BASIC.max_users);
      const mappedUsers = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM public.company_user_map
         WHERE company_id = $1 AND is_active = TRUE`,
        [context.id]
      );
      const existingUserCount = Number(mappedUsers.rows[0]?.count || 0);

      if (existingUserCount + users.length > maxUsers) {
        throw new Error(`User limit exceeded for selected plan (max ${maxUsers})`);
      }

      for (const user of users) {
        const name = String(user?.name || "").trim();
        const email = String(user?.email || "").trim().toLowerCase();
        const phone = String(user?.phone || "").trim();
        const username = String(user?.username || "").trim();
        const password = String(user?.password || "").trim();
        const responsibilityId = Number(user?.responsibility_id || 0);
        const locationId = Number(user?.location_id || 0);
        const warehouseId = Number(user?.warehouse_id || 0);
        if (
          !name ||
          !email ||
          !phone ||
          !username ||
          !password ||
          !Number.isInteger(responsibilityId) ||
          responsibilityId <= 0 ||
          !responsibilities.some((entry) => entry.id === responsibilityId) ||
          !Number.isInteger(locationId) ||
          locationId <= 0 ||
          !Number.isInteger(warehouseId) ||
          warehouseId <= 0
        ) {
          throw new Error("Invalid staff record");
        }

        const locationExists = await client.query(
          `SELECT id
           FROM "${context.schema_name}".locations
           WHERE id = $1
           LIMIT 1`,
          [locationId]
        );
        if (!locationExists.rowCount) {
          throw new Error(`Selected location does not exist for ${email}`);
        }

        const warehouseExists = await client.query(
          `SELECT id
           FROM "${context.schema_name}".warehouses
           WHERE id = $1 AND location_id = $2
           LIMIT 1`,
          [warehouseId, locationId]
        );
        if (!warehouseExists.rowCount) {
          throw new Error(`Selected warehouse does not belong to location for ${email}`);
        }

        const existingEmail = await client.query(
          `SELECT id FROM public.users WHERE company_id = $1 AND email = $2`,
          [context.id, email]
        );
        if (existingEmail.rowCount) {
          throw new Error(`Email already exists for ${email}`);
        }

        const existingPhone = await client.query(
          `SELECT id FROM public.users WHERE phone = $1`,
          [phone]
        );
        if (existingPhone.rowCount) {
          throw new Error(`Phone already exists for ${phone}`);
        }

        // const tempPassword = `${randomBytes(6).toString("hex")}Aa1!`;
        const passwordHash = await hashPassword(password);

        const newUser = await client.query(
          `INSERT INTO public.users
           (company_id, name,username, email, phone, password_hash, responsibility_id, is_active)
           VALUES ($1, $2, $3, $4, $5, $6,$7, TRUE)
           RETURNING id`,
          [context.id, name, username, email, phone, passwordHash, responsibilityId]
        );
        const userId = Number(newUser.rows[0].id);

        await client.query(
          `INSERT INTO public.company_user_map
           (user_id, company_id, username, responsibility_id, location_id, warehouse_id, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           ON CONFLICT (user_id, company_id) DO UPDATE
           SET responsibility_id = EXCLUDED.responsibility_id,
               location_id = EXCLUDED.location_id,
               warehouse_id = EXCLUDED.warehouse_id,
               is_active = TRUE`,
          [userId, context.id, email.split("@")[0], responsibilityId, locationId, warehouseId]
        );
      }

      await client.query(
        `UPDATE public.companies
         SET setup_stage = 'STAFF_SETUP', updated_at = NOW()
         WHERE id = $1`,
        [context.id]
      );
    } else if (step === "LIVE") {
      const subscription = await getPlanForCompany(client, context.id);
      if (!subscription || String(subscription.payment_status || "").toLowerCase() !== "paid") {
        throw new Error("Payment must be completed before launch");
      }
      await client.query(
        `UPDATE public.companies
         SET setup_stage = 'LIVE', updated_at = NOW()
         WHERE id = $1`,
        [context.id]
      );
    } else {
      throw new Error("Unsupported onboarding step");
    }

    await client.query("COMMIT");
    transactionStarted = false;

    const updated = await getCompanyContext(client, company);
    const subscription = await getPlanForCompany(client, updated.id);

    return NextResponse.json({
      success: true,
      setup_stage: updated.setup_stage,
      next_step: getNextStepNumber(updated.setup_stage),
      subscription: subscription
        ? {
          plan_id: Number(subscription.plan_id),
          plan_code: subscription.plan_code,
          plan_name: subscription.plan_code,
          ecommerce_access: Boolean(subscription.ecommerce_access),
          max_users: Number(subscription.max_users ?? 5),
          max_locations: Number(subscription.max_locations ?? subscription.max_warehouses ?? 1),
          max_warehouses: Number(subscription.max_warehouses ?? 1),
          status: subscription.status,
          billing_interval: normalizeBillingInterval(subscription.billing_interval),
          amount: Number(subscription.amount ?? 0),
        }
        : null,
    });
  } catch (error: any) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    return NextResponse.json(
      { success: false, message: error.message || "Unable to save onboarding step" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
