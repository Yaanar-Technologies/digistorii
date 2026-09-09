import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";
import { decryptSecret } from "@/lib/cryptoHelper";
import { applySalesRowCalculation, calculateSalesTotals } from "@/lib/pricing/salesCalculations";
import { transitionOrderStatus } from "@/lib/orderStateMachine";
import { RESERVATION_TTL_MINUTES } from "@/lib/reservationCleanup";

type PaymentMethod = "upi" | "card" | "netbanking" | "wallet" | "cod";

interface CheckoutItemInput {
  variantId: number | string;
  qty: number | string;
}

interface CheckoutRequestBody {
  customerId: number | string;
  shippingAddressId?: number | string;
  billingAddressId?: number | string;
  paymentMethod: PaymentMethod;
  items: CheckoutItemInput[];
  couponCode?: string;
  idempotencyKey?: string;
}

function generateOrderNumber(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ORD-${result}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const client = await pool.connect();
  let inTransaction = false;

  try {
    const { company: paramCompany } = await params;
    let companyName = paramCompany;
    let schema = "";
    let companyId: number | null = null;

    try {
      const tenantInfo = await getTenantSchema(req);
      companyName = tenantInfo.company || paramCompany;
      schema = tenantInfo.schema;
      companyId = tenantInfo.companyId;
    } catch {
      const tenantInfo = await getTenantSchemaByCompany(paramCompany);
      schema = tenantInfo.schema;
      companyName = tenantInfo.company;
    }

    if (!companyId) {
      const compRes = await client.query(
        `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = LOWER($1) LIMIT 1`,
        [companyName]
      );
      if (compRes.rowCount) {
        companyId = Number(compRes.rows[0].id);
        schema = compRes.rows[0].schema_name;
      } else {
        return NextResponse.json(
          { success: false, error: `Company '${companyName}' not found.` },
          { status: 404 }
        );
      }
    }

    const body: CheckoutRequestBody = await req.json();
    const { customerId, shippingAddressId, billingAddressId, paymentMethod, items } = body;

    const validPaymentMethods: PaymentMethod[] = ["upi", "card", "netbanking", "wallet", "cod"];
    if (!paymentMethod || !validPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid payment method. Allowed: ${validPaymentMethods.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cart is empty. Please add items to checkout." },
        { status: 400 }
      );
    }

    const parsedCustomerId = Number(customerId);
    if (!parsedCustomerId || isNaN(parsedCustomerId)) {
      return NextResponse.json(
        { success: false, error: "A valid customerId is required for checkout." },
        { status: 400 }
      );
    }

    // Step 2: Load payment settings and tenant gateway configuration
    const settingsRes = await client.query(
      `SELECT payment_mode, shipping_free_threshold, shipping_fee
       FROM "${schema}".ecom_settings
       WHERE company_id = $1
       LIMIT 1`,
      [companyId]
    );

    const ecomSettings = settingsRes.rows[0] || null;
    const paymentMode = ecomSettings?.payment_mode || "both";

    if (paymentMode === "cod_only" && paymentMethod !== "cod") {
      return NextResponse.json(
        {
          success: false,
          error: "Store accepts Cash on Delivery (COD) only.",
        },
        { status: 400 }
      );
    }

    if (paymentMode === "prepaid_only" && paymentMethod === "cod") {
      return NextResponse.json(
        {
          success: false,
          error: "Cash on Delivery (COD) is not accepted by this store.",
        },
        { status: 400 }
      );
    }

    let tenantKeyId: string | null = null;
    let tenantKeySecretEnc: string | null = null;

    if (paymentMethod !== "cod") {
      // 1. Check primary payment_gateway_configs table
      const gatewayRes = await client.query(
        `SELECT key_id, key_secret, is_active
         FROM "${schema}".payment_gateway_configs 
         WHERE provider = 'razorpay' AND is_active = TRUE
         LIMIT 1`
      );

      if (gatewayRes.rowCount && gatewayRes.rows[0].key_id && gatewayRes.rows[0].key_secret) {
        tenantKeyId = gatewayRes.rows[0].key_id;
        tenantKeySecretEnc = gatewayRes.rows[0].key_secret;
      } else {
        // Fallback to legacy ecom_settings
        const legacyRes = await client.query(
          `SELECT gateway_key_id, gateway_key_secret_enc
           FROM "${schema}".ecom_settings
           WHERE company_id = $1
           LIMIT 1`,
          [companyId]
        );
        if (legacyRes.rowCount && legacyRes.rows[0].gateway_key_id && legacyRes.rows[0].gateway_key_secret_enc) {
          tenantKeyId = legacyRes.rows[0].gateway_key_id;
          tenantKeySecretEnc = legacyRes.rows[0].gateway_key_secret_enc;
        }
      }

      if (!tenantKeyId || !tenantKeySecretEnc) {
        return NextResponse.json(
          {
            success: false,
            error: "Payment gateway is not configured or active for this store. Please contact the store administrator.",
          },
          { status: 400 }
        );
      }
    }

    // Begin single DB transaction
    await client.query("BEGIN");
    inTransaction = true;

    // Concurrency guard: Row lock on customer to serialize simultaneous checkouts
    await client.query(
      `SELECT id FROM "${schema}".customers WHERE id = $1 FOR UPDATE`,
      [parsedCustomerId]
    );

    // Check for existing active pending prepaid order within reservation TTL window
    const pendingOrderRes = await client.query(
      `SELECT id, order_no, total_amount, currency, shipping_address_id, billing_address_id, payment_method, notes
       FROM "${schema}".online_orders
       WHERE customer_id = $1
         AND order_status = 'placed'
         AND payment_status = 'pending'
         AND payment_method != 'cod'
         AND created_at >= NOW() - INTERVAL '${RESERVATION_TTL_MINUTES} minutes'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [parsedCustomerId]
    );

    if (pendingOrderRes.rowCount && pendingOrderRes.rowCount > 0) {
      const existingOrder = pendingOrderRes.rows[0];

      // Query existing order items
      const existingItemsRes = await client.query(
        `SELECT variant_id, qty FROM "${schema}".online_order_items WHERE order_id = $1`,
        [existingOrder.id]
      );

      const requestedCartMap = new Map<number, number>();
      for (const it of items) {
        const vId = Number(it.variantId);
        const q = Number(it.qty);
        requestedCartMap.set(vId, (requestedCartMap.get(vId) || 0) + q);
      }

      const existingCartMap = new Map<number, number>();
      for (const it of existingItemsRes.rows) {
        const vId = Number(it.variant_id);
        const q = Number(it.qty);
        existingCartMap.set(vId, (existingCartMap.get(vId) || 0) + q);
      }

      let isCartIdentical = requestedCartMap.size === existingCartMap.size;
      if (isCartIdentical) {
        for (const [vId, q] of requestedCartMap.entries()) {
          if (existingCartMap.get(vId) !== q) {
            isCartIdentical = false;
            break;
          }
        }
      }

      if (
        isCartIdentical &&
        paymentMethod !== "cod" &&
        existingOrder.payment_method === paymentMethod &&
        tenantKeyId &&
        tenantKeySecretEnc
      ) {
        // Reuse existing order & existing/new Razorpay order
        const existingPaymentRes = await client.query(
          `SELECT gateway_order_id, raw_response
           FROM "${schema}".online_order_payments
           WHERE order_id = $1 AND gateway_order_id IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 1`,
          [existingOrder.id]
        );

        let razorpayOrderId = existingPaymentRes.rows[0]?.gateway_order_id;
        const razorpaySecret = decryptSecret(tenantKeySecretEnc);
        const razorpayKeyId = tenantKeyId;
        const amountInPaise = Math.round(Number(existingOrder.total_amount) * 100);

        if (!razorpayOrderId) {
          const razorpayClient = new Razorpay({
            key_id: razorpayKeyId,
            key_secret: razorpaySecret,
          });

          const rzpOrder = await razorpayClient.orders.create({
            amount: amountInPaise,
            currency: existingOrder.currency || "INR",
            receipt: existingOrder.order_no,
            notes: {
              company: companyName,
              order_id: String(existingOrder.id),
              customer_id: String(parsedCustomerId),
            },
          });
          razorpayOrderId = rzpOrder.id;

          await client.query(
            `INSERT INTO "${schema}".online_order_payments (
               order_id, gateway, gateway_order_id, amount, status, method, raw_response, created_at
             )
             VALUES ($1, 'razorpay', $2, $3, 'created', $4, $5, NOW())`,
            [
              existingOrder.id,
              rzpOrder.id,
              Number(existingOrder.total_amount),
              paymentMethod,
              JSON.stringify(rzpOrder),
            ]
          );
        }

        await client.query("COMMIT");
        inTransaction = false;

        return NextResponse.json({
          success: true,
          order_no: existingOrder.order_no,
          order_id: Number(existingOrder.id),
          razorpay_order_id: razorpayOrderId,
          razorpay_key_id: razorpayKeyId,
          key_id: razorpayKeyId,
          amount: amountInPaise,
          currency: existingOrder.currency || "INR",
          payment_method: paymentMethod,
          reused_existing: true,
        });
      } else {
        // Cancel old stale/mismatched order and release its held reservations
        await transitionOrderStatus(client, schema, Number(existingOrder.id), "cancelled", {
          changedBy: "system",
          note: "Superseded by new checkout attempt",
        });
      }
    }

    // Step 3: Stock availability check across all items
    const shortItems: Array<{
      variantId: number;
      productName: string;
      requestedQty: number;
      availableQty: number;
      shortBy: number;
    }> = [];

    const preparedItems: Array<{
      variantId: number;
      requestedQty: number;
      productName: string;
      uom: string;
      hsnCode: string | null;
      rate: number;
      discount: number;
      taxMasterId: number | null;
      taxAmount: number;
      lineTotal: number;
    }> = [];

    for (const item of items) {
      const variantId = Number(item.variantId);
      const requestedQty = Number(item.qty);

      if (!variantId || isNaN(variantId) || requestedQty <= 0) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return NextResponse.json(
          { success: false, error: "Invalid variant ID or quantity in checkout items." },
          { status: 400 }
        );
      }

      // Check available stock view
      const stockRes = await client.query(
        `SELECT COALESCE(SUM(available_qty), 0) AS available_qty
         FROM "${schema}".ecom_available_stock
         WHERE variant_id = $1`,
        [variantId]
      );

      const availableQty = Number(stockRes.rows[0]?.available_qty || 0);

      // Step 4: Fetch live price & discount info
      const variantRes = await client.query(
        `SELECT
           pv.id AS variant_id, p.name AS product_name,
           u.uom_name as uom_name,
           p.hsn_code,
           COALESCE(
             (SELECT epo.ecom_price FROM "${schema}".ecom_price_overrides epo WHERE epo.variant_id = pv.id AND epo.is_active = TRUE LIMIT 1),
             (SELECT pp.final_selling_price FROM "${schema}".product_pricing pp WHERE pp.variant_id = pv.id AND pp.is_active = TRUE LIMIT 1),
             0.00
           ) AS live_price,
           (SELECT pp.unit_price FROM "${schema}".product_pricing pp WHERE pp.variant_id = pv.id AND pp.is_active = TRUE LIMIT 1) AS unit_price,
           (SELECT pp.tax_percent FROM "${schema}".product_pricing pp WHERE pp.variant_id = pv.id AND pp.is_active = TRUE LIMIT 1) AS tax_percent,
           (
  SELECT tm.id 
  FROM "${schema}".tax_master tm 
  WHERE tm.total_percentage = (
    SELECT pp.tax_percent 
    FROM "${schema}".product_pricing pp 
    WHERE pp.variant_id = pv.id AND pp.is_active = TRUE 
    LIMIT 1
  ) 
  AND tm.is_active = TRUE 
  LIMIT 1
) AS tax_master_id,

           act_disc.discount_name,
           act_disc.discount_type,
           act_disc.discount_value
         FROM "${schema}".product_variants pv
         LEFT JOIN "${schema}".products p ON p.id = pv.product_id
         LEFT JOIN "${schema}".uom u ON u.id::text = p.uom::text
         LEFT JOIN LATERAL (
           SELECT
             d.name AS discount_name,
             d.discount_type,
             d.value AS discount_value
           FROM "${schema}".discount_variants dv
           INNER JOIN "${schema}".discounts d ON d.id = dv.discount_id
           WHERE dv.variant_id = pv.id
             AND d.is_active = TRUE
             AND COALESCE(d.channel, 'both') IN ('ecom', 'both')
             AND (d.starts_at IS NULL OR d.starts_at <= NOW())
             AND (d.ends_at IS NULL OR d.ends_at >= NOW())
             AND d.coupon_code IS NULL
           ORDER BY d.priority ASC, d.value DESC, d.created_at DESC
           LIMIT 1
         ) act_disc ON true
         WHERE pv.id = $1
         LIMIT 1`,
        [variantId]
      );

      if (variantRes.rowCount === 0) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return NextResponse.json(
          { success: false, error: `Product variant #${variantId} not found.` },
          { status: 404 }
        );
      }

      const vRow = variantRes.rows[0];
      const productName = vRow.product_name || `Variant #${variantId}`;

      if (availableQty < requestedQty) {
        shortItems.push({
          variantId,
          productName,
          requestedQty,
          availableQty,
          shortBy: requestedQty - availableQty,
        });
      }

      const livePrice = Number(vRow.live_price || 0);
      const taxPercent = Number(vRow.tax_percent || 0);
      let unitPrice = vRow.unit_price != null ? Number(vRow.unit_price) : 0;
      if (!unitPrice || unitPrice <= 0) {
        unitPrice = taxPercent > 0 ? livePrice / (1 + taxPercent / 100) : livePrice;
      }

      const discountValue = Number(vRow.discount_value || 0);
      const hasDiscount = discountValue > 0 && !!vRow.discount_type;

      const calcRow = applySalesRowCalculation<{
        rate: number;
        qty: number;
        tax_percent: number;
        discount: number;
        discount_auto?: boolean;
        discount_type?: "percentage" | "fixed";
        discount_value?: number;
        amount?: number;
        tax_amount?: number;
        line_total?: number;
      }>({
        rate: unitPrice,
        qty: requestedQty,
        tax_percent: taxPercent,
        discount: 0,
        discount_auto: hasDiscount,
        discount_type: vRow.discount_type,
        discount_value: discountValue,
      });

      preparedItems.push({
        variantId,
        requestedQty,
        productName,
        uom: vRow.uom_name || "PCS",
        hsnCode: vRow.hsn_code || null,
        rate: Number(calcRow.rate || unitPrice),
        discount: Number(calcRow.discount || 0),
        taxMasterId: vRow.tax_master_id ? Number(vRow.tax_master_id) : null,
        taxAmount: Number(calcRow.tax_amount || 0),
        lineTotal: Number(calcRow.line_total || 0),
      });
    }

    // Step 3 failure condition: any item short
    if (shortItems.length > 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient stock for one or more items.",
          shortItems,
        },
        { status: 400 }
      );
    }

    // Calculate aggregated sales totals
    const totals = calculateSalesTotals(
      preparedItems.map((p) => ({
        amount: p.rate * p.requestedQty,
        discount: p.discount,
        tax_amount: p.taxAmount,
        line_total: p.lineTotal,
      }))
    );

    const subtotal = totals.subtotal;
    let discountAmount = totals.discount;
    const taxAmount = totals.tax;

    // Phase 2: Apply entered coupon code discount if provided
    let couponDiscount = 0;
    let couponAppliedNotes: string | null = null;
    const rawCouponCode = String(body.couponCode || "").trim();

    if (rawCouponCode) {
      const couponRes = await client.query(
        `
          SELECT
            d.id,
            d.name,
            d.discount_type,
            d.value,
            d.coupon_code,
            d.applies_to,
            array_remove(array_agg(dv.variant_id), NULL) AS allowed_variants
          FROM "${schema}".discounts d
          LEFT JOIN "${schema}".discount_variants dv ON d.id = dv.discount_id
          WHERE d.is_active = TRUE
            AND LOWER(d.coupon_code) = LOWER($1)
            AND (d.starts_at IS NULL OR d.starts_at <= NOW())
            AND (d.ends_at IS NULL OR d.ends_at >= NOW())
          GROUP BY d.id
          LIMIT 1
        `,
        [rawCouponCode]
      );

      if (couponRes.rowCount) {
        const couponInfo = couponRes.rows[0];
        const couponVal = Number(couponInfo.value || 0);
        const appliesTo = couponInfo.applies_to || "specific_variants";
        const discType = couponInfo.discount_type;

        if (appliesTo === "entire_order") {
          if (discType === "percentage") {
            couponDiscount = Number(((subtotal * couponVal) / 100).toFixed(2));
          } else {
            couponDiscount = Math.min(couponVal, subtotal);
          }
        } else {
          const allowedVariants: number[] = (couponInfo.allowed_variants || []).map((id: any) => Number(id));
          const matchingItems = preparedItems.filter((p) => allowedVariants.includes(Number(p.variantId)));
          const eligibleSubtotal = matchingItems.reduce((sum, p) => sum + (p.rate * p.requestedQty), 0);

          if (eligibleSubtotal > 0) {
            if (discType === "percentage") {
              couponDiscount = Number(((eligibleSubtotal * couponVal) / 100).toFixed(2));
            } else {
              couponDiscount = Math.min(couponVal, eligibleSubtotal);
            }
          }
        }

        if (couponDiscount > 0) {
          couponAppliedNotes = `Coupon: ${couponInfo.coupon_code} (-₹${couponDiscount.toFixed(2)})`;
        }
      }
    }

    const totalDiscountAmount = Number((discountAmount + couponDiscount).toFixed(2));

    const shippingFreeThreshold = ecomSettings?.shipping_free_threshold != null
      ? Math.max(0, Number(ecomSettings.shipping_free_threshold))
      : 500;
    const baseShippingFee = ecomSettings?.shipping_fee != null
      ? Math.max(0, Number(ecomSettings.shipping_fee))
      : 49;

    const shippingFee = subtotal >= shippingFreeThreshold ? 0 : baseShippingFee;
    const totalAmount = Math.max(0, Number((totals.total - couponDiscount + shippingFee).toFixed(2)));

    // Step 5: INSERT online_orders with retry for unique order_no collision
    let orderRow: { id: number; order_no: string; total_amount: string; currency: string } | null =
      null;
    let orderInsertAttempts = 0;

    while (orderInsertAttempts < 5 && !orderRow) {
      orderInsertAttempts++;
      const candidateOrderNo = generateOrderNumber();
      try {
        const orderInsertRes = await client.query(
          `INSERT INTO "${schema}".online_orders (
             order_no, company_id, customer_id, shipping_address_id, billing_address_id,
             currency, subtotal, tax_amount, shipping_fee, discount_amount, total_amount,
             order_status, payment_status, payment_method, delivery_status,
             order_type, notes, created_by, created_at
           )
           VALUES ($1, $2, $3, $4, $5, 'INR', $6, $7, $8, $9, $10, 'placed', 'pending', $11, 'not_shipped', 'online', $12, 'customer', NOW())
           RETURNING id, order_no, total_amount, currency`,
          [
            candidateOrderNo,
            companyId,
            parsedCustomerId,
            shippingAddressId ? Number(shippingAddressId) : null,
            billingAddressId ? Number(billingAddressId) : null,
            subtotal,
            taxAmount,
            shippingFee,
            totalDiscountAmount,
            totalAmount,
            paymentMethod,
            couponAppliedNotes,
          ]
        );
        orderRow = orderInsertRes.rows[0];
      } catch (err: any) {
        if (err.code === "23505" && err.constraint?.includes("order_no")) {
          // Collision on order_no, retry loop
          continue;
        }
        throw err;
      }
    }

    if (!orderRow) {
      throw new Error("Failed to generate a unique order number. Please try again.");
    }

    const orderId = Number(orderRow.id);

    // Step 6 & 7: INSERT online_order_items and inventory_reservations per line
    for (const item of preparedItems) {
      // 6. Insert item row with pending status
      const itemInsertRes = await client.query(
        `INSERT INTO "${schema}".online_order_items (
           order_id, variant_id, product_name, uom, hsn_no,
           rate, qty, discount, tax_master_id, tax_amount, line_total,
           fulfillment_status, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', NOW())
         RETURNING id`,
        [
          orderId,
          item.variantId,
          item.productName,
          item.uom,
          item.hsnCode,
          item.rate,
          item.requestedQty,
          item.discount,
          item.taxMasterId,
          item.taxAmount,
          item.lineTotal,
        ]
      );

      const orderItemId = itemInsertRes.rows[0].id;

      // 7. Insert held inventory reservation (expires in 20 minutes)
      const reservationRes = await client.query(
        `INSERT INTO "${schema}".inventory_reservations (
           variant_id, qty_reserved, order_ref_id, status, expires_at, created_at
         )
         VALUES ($1, $2, $3, 'held', NOW() + interval '${RESERVATION_TTL_MINUTES} minutes', NOW())
         RETURNING id`,
        [item.variantId, item.requestedQty, orderId]
      );

      const reservationId = reservationRes.rows[0].id;

      // Link reservation to online_order_items and set fulfillment_status = 'reserved'
      await client.query(
        `UPDATE "${schema}".online_order_items
         SET reservation_id = $1, fulfillment_status = 'reserved'
         WHERE id = $2`,
        [reservationId, orderItemId]
      );
    }

    // Step 8: INSERT online_order_status_history
    await client.query(
      `INSERT INTO "${schema}".online_order_status_history (
         order_id, status_type, from_status, to_status, changed_by, note, created_at
       )
       VALUES ($1, 'order', NULL, 'placed', 'customer', 'Order placed at checkout', NOW())`,
      [orderId]
    );

    // Step 9: Branch on paymentMethod
    if (paymentMethod === "cod") {
      await client.query("COMMIT");
      inTransaction = false;

      return NextResponse.json({
        success: true,
        order_no: orderRow.order_no,
        order_id: orderId,
        payment_method: "cod",
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total_amount: Number(orderRow.total_amount),
        currency: orderRow.currency || "INR",
        message: "Order placed successfully with Cash on Delivery.",
      });
    }

    // Prepaid branch: Razorpay Order Creation using tenant's own decrypted credentials
    const razorpaySecret = decryptSecret(tenantKeySecretEnc!);
    const razorpayKeyId = tenantKeyId!;

    const razorpayClient = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpaySecret,
    });

    const amountInPaise = Math.round(Number(orderRow.total_amount) * 100);

    const rzpOrder = await razorpayClient.orders.create({
      amount: amountInPaise,
      currency: orderRow.currency || "INR",
      receipt: orderRow.order_no,
      notes: {
        company: companyName,
        order_id: String(orderId),
        customer_id: String(parsedCustomerId),
      },
    });

    // Insert online_order_payments
    await client.query(
      `INSERT INTO "${schema}".online_order_payments (
         order_id, gateway, gateway_order_id, amount, status, method, raw_response, created_at
       )
       VALUES ($1, 'razorpay', $2, $3, 'created', $4, $5, NOW())`,
      [
        orderId,
        rzpOrder.id,
        Number(orderRow.total_amount),
        paymentMethod,
        JSON.stringify(rzpOrder),
      ]
    );

    await client.query("COMMIT");
    inTransaction = false;

    return NextResponse.json({
      success: true,
      order_no: orderRow.order_no,
      order_id: orderId,
      razorpay_order_id: rzpOrder.id,
      razorpay_key_id: razorpayKeyId,
      key_id: razorpayKeyId,
      amount: amountInPaise,
      currency: orderRow.currency || "INR",
      payment_method: paymentMethod,
    });
  } catch (err: any) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    console.error("[Checkout Route Error]:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "An unexpected error occurred during checkout.",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
