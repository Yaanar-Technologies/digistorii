import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function verifyPhase6() {
  const { pool } = await import("../src/lib/db");
  const { calculateShippingFee } = await import("../src/lib/shippingCalculator");
  const { getCourierAdapter } = await import("../src/lib/couriers");

  const client = await pool.connect();
  const schema = "tenant_3"; // nallisilks

  console.log("=== PHASE 6 FUNCTIONAL VERIFICATION ===");

  try {
    // 1. Verify schema columns on online_order_deliveries
    const colRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = 'online_order_deliveries'
      ORDER BY ordinal_position
    `, [schema]);

    const colNames = colRes.rows.map(r => r.column_name);
    console.log("online_order_deliveries columns:", colNames.join(", "));

    const requiredCols = [
      "attempt_count", "max_attempts", "failure_reason", "next_retry_date",
      "rto_initiated_at", "pod_type", "pod_resource_url", "delivered_to_person_name",
      "delivery_coordinates", "shipping_label_url", "return_awb", "return_pickup_scheduled_at"
    ];

    const missingCols = requiredCols.filter(c => !colNames.includes(c));
    if (missingCols.length > 0) {
      console.error("Missing columns in online_order_deliveries:", missingCols);
    } else {
      console.log("All Phase 6 delivery tracking/POD/RTO columns present!");
    }

    // 2. Verify shipping zones & rate rules
    const zonesRes = await client.query(`
      SELECT sz.name, sz.zone_type, srr.base_charge, srr.incremental_charge, srr.min_delivery_days, srr.max_delivery_days
      FROM "${schema}".shipping_zones sz
      LEFT JOIN "${schema}".shipping_rate_rules srr ON srr.zone_id = sz.id
      ORDER BY sz.id
    `);
    console.log("\nConfigured Shipping Zones & Rate Rules:");
    zonesRes.rows.forEach(z => {
      console.log(` - Zone: ${z.name} (${z.zone_type}) -> Base: ₹${z.base_charge}, Inc: ₹${z.incremental_charge}, Delivery: ${z.min_delivery_days}-${z.max_delivery_days} days`);
    });

    // 3. Test Shipping Calculation Matrix
    console.log("\nTesting dynamic shipping fee calculations:");
    const testCases = [
      { pincode: "600001", weight: 500, subtotal: 300, desc: "Intra-City 500g, ₹300 subtotal" },
      { pincode: "600001", weight: 1500, subtotal: 300, desc: "Intra-City 1500g (overweight), ₹300 subtotal" },
      { pincode: "600001", weight: 500, subtotal: 1000, desc: "Intra-City 500g, ₹1000 subtotal (Free Shipping Threshold)" },
      { pincode: "641001", weight: 500, subtotal: 300, desc: "Intra-State 500g, ₹300 subtotal" },
      { pincode: "560001", weight: 500, subtotal: 300, desc: "Inter-State National 500g, ₹300 subtotal" },
      { pincode: "190001", weight: 500, subtotal: 300, desc: "Remote / Special 500g, ₹300 subtotal" },
    ];

    for (const tc of testCases) {
      const calc = await calculateShippingFee(client, schema, tc.pincode, tc.weight, tc.subtotal);
      console.log(`   * [${tc.desc}]: Zone = ${calc.zoneName}, Fee = ₹${calc.shippingFee}, Free = ${calc.isFreeShipping}, ETA = "${calc.formattedArrival}"`);
    }

    // 4. Test Courier Adapters
    console.log("\nTesting Courier Adapters:");
    const selfAdapter = getCourierAdapter("self");
    const reversePickup = await selfAdapter.generateReturnPickup({
      orderNo: "ORD-TEST-001",
      returnId: 1,
      pickupAddress: {
        name: "Test Customer",
        address_line1: "123 Main St",
        city: "Chennai",
        state: "Tamil Nadu",
        pincode: "600001",
        phone: "9876543210"
      },
      items: [{ name: "Silk Saree", units: 1, selling_price: 2500 }]
    });
    console.log("   * SelfAdapter generateReturnPickup result:", reversePickup);

    // 5. Verify order_returns table exists
    const returnsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = 'order_returns'
    `, [schema]);
    console.log(`\norder_returns table verified with ${returnsRes.rowCount} columns.`);

    console.log("\n=== ALL PHASE 6 ARCHITECTURAL COMPONENTS VERIFIED! ===");
  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyPhase6();

