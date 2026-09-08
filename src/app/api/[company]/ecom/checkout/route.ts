import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { pool } from "@/lib/db";
import { getTenantSchema, getTenantSchemaByCompany } from "@/lib/tenant";
import { decryptSecret } from "@/lib/cryptoHelper";
import { applySalesRowCalculation, calculateSalesTotals } from "@/lib/pricing/salesCalculations";

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

    // Step 2: Load ecom_settings
    const settingsRes = await client.query(
      `SELECT payment_mode, gateway_provider, gateway_key_id, gateway_key_secret_enc
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

    if (paymentMethod !== "cod") {
      if (!ecomSettings?.gateway_key_id || !ecomSettings?.gateway_key_secret_enc) {
        return NextResponse.json(
          {
            success: false,
            error: "Payment gateway not configured for this store.",
          },
          { status: 400 }
        );
      }
    }

    // Begin single DB transaction
    await client.query("BEGIN");
    inTransaction = true;

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
           pv.id AS variant_id, p.product_name AS product_name,
           u.name AS uom_name,
           p.hsn_code,
           COALESCE(
             (SELECT epo.ecom_price FROM "${schema}".ecom_price_overrides epo WHERE epo.variant_id = pv.id AND epo.is_active = TRUE LIMIT 1),
             (SELECT pp.final_selling_price FROM "${schema}".product_pricing pp WHERE pp.variant_id = pv.id AND pp.is_active = TRUE LIMIT 1),
             0.00
           ) AS live_price,
           (SELECT pp.unit_price FROM "${schema}".product_pricing pp WHERE pp.variant_id = pv.id AND pp.is_active = TRUE LIMIT 1) AS unit_price,
           (SELECT pp.tax_percent FROM "${schema}".product_pricing pp WHERE pp.variant_id = pv.id AND pp.is_active = TRUE LIMIT 1) AS tax_percent,
           (SELECT pp.tax_master_id FROM "${schema}".product_pricing pp WHERE pp.variant_id = pv.id AND pp.is_active = TRUE LIMIT 1) AS tax_master_id,
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
    const discountAmount = totals.discount;
    const taxAmount = totals.tax;
    const shippingFee = 0;
    const totalAmount = totals.total;

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
             order_type, created_by, created_at
           )
           VALUES ($1, $2, $3, $4, $5, 'INR', $6, $7, $8, $9, $10, 'placed', 'pending', $11, 'not_shipped', 'online', 'customer', NOW())
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
            discountAmount,
            totalAmount,
            paymentMethod,
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
         VALUES ($1, $2, $3, 'held', NOW() + interval '20 minutes', NOW())
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
    const razorpaySecret = decryptSecret(ecomSettings.gateway_key_secret_enc);
    const razorpayKeyId = ecomSettings.gateway_key_id;

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
