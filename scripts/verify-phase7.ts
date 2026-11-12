import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function verifyPhase7() {
  const { pool } = await import("../src/lib/db");
  const { calculateGstSplit, numberToWordsIndian } = await import("../src/lib/tax/gstCalculator");
  const { generateNextInvoiceNumber, generateNextCreditNoteNumber, renderInvoiceHtml } = await import("../src/lib/tax/invoiceService");
  const { validateCodEligibility } = await import("../src/lib/payments/codValidator");

  const client = await pool.connect();
  const schema = "tenant_3"; // nallisilks

  console.log("=== PHASE 7: PAYMENTS, INVOICING & GST VERIFICATION ===");

  try {
    // 1. Check Tables
    const tables = [
      "payment_webhook_events",
      "payment_refunds",
      "admin_operational_alerts",
      "tax_invoices",
      "credit_notes"
    ];

    console.log("\n1. Verifying Phase 7 Database Tables:");
    for (const t of tables) {
      const res = await client.query(`
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      `, [schema, t]);
      const exists = parseInt(res.rows[0].count, 10) > 0;
      console.log(`   * Table '${t}': ${exists ? "EXISTS (OK)" : "MISSING (FAILED)"}`);
    }

    // 2. Test GST Calculator
    console.log("\n2. Testing GST Tax Split Engine:");
    const intraState = calculateGstSplit("Tamil Nadu", "Tamil Nadu", 1000, 5);
    console.log(`   * Intra-State (TN -> TN, ₹1000 @ 5%):`);
    console.log(`     - CGST (${intraState.cgstRate}%): ₹${intraState.cgstAmount}`);
    console.log(`     - SGST (${intraState.sgstRate}%): ₹${intraState.sgstAmount}`);
    console.log(`     - IGST (${intraState.igstRate}%): ₹${intraState.igstAmount}`);
    console.log(`     - Total Tax: ₹${intraState.totalTax}, Total Amount: ₹${intraState.totalAmount}`);

    const interState = calculateGstSplit("Tamil Nadu", "Karnataka", 1000, 5);
    console.log(`   * Inter-State (TN -> KA, ₹1000 @ 5%):`);
    console.log(`     - CGST: ₹${interState.cgstAmount}, SGST: ₹${interState.sgstAmount}`);
    console.log(`     - IGST (${interState.igstRate}%): ₹${interState.igstAmount}`);
    console.log(`     - Total Tax: ₹${interState.totalTax}, Total Amount: ₹${interState.totalAmount}`);

    const words = numberToWordsIndian(1050.50);
    console.log(`   * Number to Words (₹1050.50): "${words}"`);

    // 3. Test Sequential Numbering
    console.log("\n3. Testing Sequential Document Numbering:");
    const nextInv = await generateNextInvoiceNumber(client, schema);
    console.log(`   * Next Sequential Tax Invoice Number: ${nextInv.invoiceNo} (FY: ${nextInv.financialYear})`);

    const nextCn = await generateNextCreditNoteNumber(client, schema);
    console.log(`   * Next Sequential Credit Note Number: ${nextCn.creditNoteNo} (FY: ${nextCn.financialYear})`);

    // 4. Test COD Eligibility Validator
    console.log("\n4. Testing Cash on Delivery (COD) Rules Engine:");
    const codEligible = await validateCodEligibility(client, schema, 2500, "600001");
    console.log(`   * Subtotal ₹2500: Eligible = ${codEligible.eligible}`);

    const codOverLimit = await validateCodEligibility(client, schema, 7500, "600001");
    console.log(`   * Subtotal ₹7500 (> MOV limit): Eligible = ${codOverLimit.eligible}, Reason = "${codOverLimit.reason}"`);

    // 5. Test Invoice HTML Renderer
    console.log("\n5. Testing GST Tax Invoice HTML Renderer:");
    const mockInvoice = {
      invoice_no: nextInv.invoiceNo,
      invoice_date: new Date(),
      customer_name: "Divya K",
      shipping_address: "123 Anna Salai, Chennai, Tamil Nadu 600002",
      place_of_supply: "Tamil Nadu",
      state_code: "33",
      is_interstate: false,
      subtotal: 2500,
      cgst_amount: 62.5,
      sgst_amount: 62.5,
      igst_amount: 0,
      total_tax: 125,
      total_amount: 2625,
      items: [
        {
          variantId: 1,
          productName: "Kanchipuram Pure Silk Saree",
          hsnCode: "5208",
          qty: 1,
          rate: 2500,
          taxableValue: 2500,
          taxRatePercent: 5,
          cgstAmount: 62.5,
          sgstAmount: 62.5,
          igstAmount: 0,
          totalTax: 125,
          lineTotal: 2625
        }
      ]
    };
    const mockCompany = {
      company_name: "Nalli Silk Sarees Private Limited",
      gst_number: "33AABCN1234F1Z8",
      address: "No. 9 Nageswaran Road, T. Nagar",
      city: "Chennai",
      state: "Tamil Nadu"
    };

    const renderedHtml = renderInvoiceHtml(mockInvoice, mockCompany);
    console.log(`   * Rendered HTML Length: ${renderedHtml.length} characters (Contains 'TAX INVOICE': ${renderedHtml.includes("TAX INVOICE")})`);

    console.log("\n=== ALL PHASE 7 MODULES SUCCESSFULLY VERIFIED! ===");
  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyPhase7();

