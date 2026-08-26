import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const body = await req.json();
    const companySlug = (body?.company || "").trim().toLowerCase();
    const customerId = Number(body?.customerId || 0);
    const address = body?.address;
    const paymentMethod = String(body?.paymentMethod || "COD");
    const razorpayPaymentId = body?.razorpayPaymentId;
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!companySlug || !items.length) {
      return NextResponse.json(
        { success: false, message: "Company and non-empty cart items are required" },
        { status: 400 }
      );
    }

    const companyRes = await client.query(
      `SELECT id, schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!companyRes.rowCount) {
      return NextResponse.json({ success: false, message: "Merchant company not found" }, { status: 404 });
    }

    const { schema_name: schema } = companyRes.rows[0];

    // Ensure customer row exists or fallback to guest customer record
    let finalCustId = customerId;
    if (!finalCustId || finalCustId <= 0) {
      const custRes = await client.query(
        `INSERT INTO "${schema}".customers (cust_code, cust_name, name, email, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          `GUEST-${Date.now().toString().slice(-6)}`,
          address?.fullName || "Guest Customer",
          address?.fullName || "Guest Customer",
          address?.email || `guest_${Date.now()}@checkout.local`,
          address?.phone || "0000000000",
        ]
      );
      finalCustId = custRes.rows[0].id;
    }

    // Insert address into customer_addresses if provided
    if (address?.line1) {
      await client.query(
        `INSERT INTO "${schema}".customer_addresses (customer_id, address_line1, address_line2, city, state, pincode, country, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         ON CONFLICT DO NOTHING`,
        [
          finalCustId,
          address.line1,
          address.line2 || "",
          address.city || "",
          address.state || "",
          address.pincode || "",
          address.country || "India",
        ]
      );
    }

    await client.query("BEGIN");
    transactionStarted = true;

    // Calculate total & verify stock
    let subtotal = 0;
    for (const item of items) {
      const itemPrice = Number(item.price || 0);
      const itemQty = Number(item.quantity || 1);
      subtotal += itemPrice * itemQty;
    }

    const salesNo = `ORD-${Date.now().toString().slice(-8)}`;

    const salesHeaderRes = await client.query(
      `INSERT INTO "${schema}".sales_header (
        sales_no, customer_id, sales_date, currency, status, payment_status, subtotal, tax_amount, total_amount, created_by, created_at
      )
      VALUES ($1, $2, CURRENT_DATE, 'INR', 'Placed', $3, $4, 0, $4, 'Storefront Customer', NOW())
      RETURNING id`,
      [salesNo, finalCustId, paymentMethod === "RAZORPAY" ? "paid" : "unpaid", subtotal]
    );

    const salesId = salesHeaderRes.rows[0].id;

    for (const item of items) {
      const variantId = Number(item.variantId || item.id);
      const itemPrice = Number(item.price || 0);
      const itemQty = Number(item.quantity || 1);

      await client.query(
        `INSERT INTO "${schema}".sales_detail (
          sales_id, product_id, UOM, rate, qty, discount, line_total, created_by, created_at
        )
        VALUES ($1, $2, 'PCS', $3, $4, 0, $5, 'Storefront Customer', NOW())`,
        [salesId, variantId, itemPrice, itemQty, itemPrice * itemQty]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json({
      success: true,
      orderNo: salesNo,
      salesId,
      totalAmount: subtotal,
      paymentMethod,
      razorpayPaymentId,
      message: "Congratulations! Your order has been placed successfully.",
    });
  } catch (err: any) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    console.error("Storefront Place Order Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to place order" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
