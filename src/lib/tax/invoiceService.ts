import { PoolClient, Pool } from "pg";
import {
  calculateGstSplit,
  getStateGstCode,
  numberToWordsIndian,
  ItemGstBreakdown,
} from "./gstCalculator";

type Queryable = Pool | PoolClient;

export function getFinancialYearCode(date: Date = new Date()): string {
  const month = date.getMonth(); // 0 = Jan, 3 = April
  const year = date.getFullYear();
  if (month >= 3) {
    const nextYearShort = String(year + 1).slice(-2);
    return `${String(year).slice(-2)}-${nextYearShort}`;
  } else {
    const currentYearShort = String(year).slice(-2);
    return `${String(year - 1).slice(-2)}-${currentYearShort}`;
  }
}

export async function generateNextInvoiceNumber(
  client: Queryable,
  schema: string,
  prefix: string = "INV"
): Promise<{ invoiceNo: string; financialYear: string }> {
  const fy = getFinancialYearCode();
  const fyPattern = `${prefix}/${fy}/%`;

  const countRes = await client.query(
    `SELECT COUNT(*) FROM "${schema}".tax_invoices WHERE invoice_no LIKE $1`,
    [fyPattern]
  );
  const nextSeq = parseInt(countRes.rows[0]?.count || "0", 10) + 1;
  const seqPadded = String(nextSeq).padStart(6, "0");
  const invoiceNo = `${prefix}/${fy}/${seqPadded}`;

  return { invoiceNo, financialYear: fy };
}

export async function generateNextCreditNoteNumber(
  client: Queryable,
  schema: string,
  prefix: string = "CN"
): Promise<{ creditNoteNo: string; financialYear: string }> {
  const fy = getFinancialYearCode();
  const fyPattern = `${prefix}/${fy}/%`;

  const countRes = await client.query(
    `SELECT COUNT(*) FROM "${schema}".credit_notes WHERE credit_note_no LIKE $1`,
    [fyPattern]
  );
  const nextSeq = parseInt(countRes.rows[0]?.count || "0", 10) + 1;
  const seqPadded = String(nextSeq).padStart(6, "0");
  const creditNoteNo = `${prefix}/${fy}/${seqPadded}`;

  return { creditNoteNo, financialYear: fy };
}

export async function generateTaxInvoiceForOrder(
  client: Queryable,
  schema: string,
  orderId: number
): Promise<any> {
  // Check if invoice already exists
  const existingRes = await client.query(
    `SELECT * FROM "${schema}".tax_invoices WHERE order_id = $1 LIMIT 1`,
    [orderId]
  );
  if (existingRes.rowCount && existingRes.rowCount > 0) {
    return existingRes.rows[0];
  }

  // Load Order with Customer & Address
  const orderRes = await client.query(
    `SELECT
       o.id, o.order_no, o.company_id, o.customer_id, o.total_amount, o.subtotal,
       o.tax_amount, o.shipping_fee, o.discount_amount, o.payment_method, o.created_at,
       ca.recipient_name, ca.address_line1, ca.address_line2, ca.city, ca.state, ca.pincode,
       c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
       comp.company_name, comp.gst_number AS seller_gstin, comp.state AS seller_state, comp.address AS seller_address
     FROM "${schema}".online_orders o
     LEFT JOIN "${schema}".customer_addresses ca ON ca.id = o.shipping_address_id
     LEFT JOIN "${schema}".customers c ON c.id = o.customer_id
     LEFT JOIN public.companies comp ON comp.id = o.company_id
     WHERE o.id = $1`,
    [orderId]
  );

  if (orderRes.rowCount === 0) {
    throw new Error(`Order #${orderId} not found.`);
  }

  const order = orderRes.rows[0];
  const sellerState = order.seller_state || "Tamil Nadu";
  const buyerState = order.state || "Tamil Nadu";

  // Fetch Items
  const itemsRes = await client.query(
    `SELECT variant_id, product_name, hsn_no, qty, rate, discount, tax_amount
     FROM "${schema}".online_order_items
     WHERE order_id = $1`,
    [orderId]
  );

  const rawSubtotal = Number(order.subtotal || 0);
  const gstSplit = calculateGstSplit(sellerState, buyerState, rawSubtotal, 5);

  const itemsJson: ItemGstBreakdown[] = itemsRes.rows.map((r) => {
    const qty = Number(r.qty || 1);
    const rate = Number(r.rate || 0);
    const taxableVal = Number((qty * rate).toFixed(2));
    const itemGst = calculateGstSplit(sellerState, buyerState, taxableVal, 5);

    return {
      variantId: Number(r.variant_id || 0),
      productName: r.product_name,
      hsnCode: r.hsn_no || "5208", // standard textile/apparel HSN
      qty,
      rate,
      taxableValue: taxableVal,
      taxRatePercent: 5,
      cgstAmount: itemGst.cgstAmount,
      sgstAmount: itemGst.sgstAmount,
      igstAmount: itemGst.igstAmount,
      totalTax: itemGst.totalTax,
      lineTotal: Number((taxableVal + itemGst.totalTax).toFixed(2)),
    };
  });

  const { invoiceNo, financialYear } = await generateNextInvoiceNumber(client, schema);

  const fullShippingAddress = [
    order.recipient_name,
    order.address_line1,
    order.address_line2,
    order.city,
    order.state,
    order.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const insertRes = await client.query(
    `INSERT INTO "${schema}".tax_invoices (
       company_id, order_id, invoice_no, financial_year, invoice_date,
       customer_name, customer_gstin, billing_address, shipping_address,
       place_of_supply, state_code, is_interstate,
       subtotal, cgst_amount, sgst_amount, igst_amount, total_tax, total_amount,
       items, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
     ON CONFLICT (order_id) DO UPDATE
     SET updated_at = NOW()
     RETURNING *`,
    [
      order.company_id,
      orderId,
      invoiceNo,
      financialYear,
      order.customer_name || order.recipient_name || "Valued Customer",
      null, // Retail B2C customer GSTIN null
      fullShippingAddress,
      fullShippingAddress,
      gstSplit.placeOfSupply,
      gstSplit.stateCode,
      gstSplit.isInterstate,
      rawSubtotal,
      gstSplit.cgstAmount,
      gstSplit.sgstAmount,
      gstSplit.igstAmount,
      gstSplit.totalTax,
      Number(order.total_amount),
      JSON.stringify(itemsJson),
    ]
  );

  return insertRes.rows[0];
}

export async function generateCreditNoteForReturn(
  client: Queryable,
  schema: string,
  returnId: number,
  orderId: number
): Promise<any> {
  const existingRes = await client.query(
    `SELECT * FROM "${schema}".credit_notes WHERE return_id = $1 LIMIT 1`,
    [returnId]
  );
  if (existingRes.rowCount && existingRes.rowCount > 0) {
    return existingRes.rows[0];
  }

  // Load Return & Invoice details
  const returnRes = await client.query(
    `SELECT r.*, ti.id AS invoice_id, ti.invoice_no, ti.is_interstate, ti.state_code, o.company_id
     FROM "${schema}".order_returns r
     JOIN "${schema}".online_orders o ON o.id = r.order_id
     LEFT JOIN "${schema}".tax_invoices ti ON ti.order_id = r.order_id
     WHERE r.id = $1`,
    [returnId]
  );

  if (returnRes.rowCount === 0) {
    throw new Error(`Return #${returnId} not found.`);
  }

  const ret = returnRes.rows[0];
  const { creditNoteNo } = await generateNextCreditNoteNumber(client, schema);

  const refundAmt = Number(ret.refund_amount || 0);
  const taxableAmt = Number((refundAmt / 1.05).toFixed(2));
  const taxAmt = Number((refundAmt - taxableAmt).toFixed(2));

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (ret.is_interstate) {
    igst = taxAmt;
  } else {
    cgst = Number((taxAmt / 2).toFixed(2));
    sgst = Number((taxAmt - cgst).toFixed(2));
  }

  const cnInsertRes = await client.query(
    `INSERT INTO "${schema}".credit_notes (
       company_id, order_id, return_id, invoice_id,
       credit_note_no, credit_note_date, original_invoice_no, reason,
       taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount,
       items, created_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, NOW())
     RETURNING *`,
    [
      ret.company_id,
      orderId,
      returnId,
      ret.invoice_id || null,
      creditNoteNo,
      ret.invoice_no || `INV-REF-${orderId}`,
      ret.return_reason || "Customer Return",
      taxableAmt,
      cgst,
      sgst,
      igst,
      refundAmt,
      ret.items || "[]",
    ]
  );

  return cnInsertRes.rows[0];
}

export function renderInvoiceHtml(
  invoice: any,
  company: any,
  options?: { companySlug?: string; orderId?: number }
): string {
  const items: ItemGstBreakdown[] = Array.isArray(invoice.items) ? invoice.items : [];
  const wordsTotal = numberToWordsIndian(Number(invoice.total_amount));
  const companySlug = options?.companySlug || "";
  const orderId = options?.orderId || invoice.order_id || "";
  const backUrl = companySlug
    ? (orderId ? `/${companySlug}/workspace/ecom-orders/${orderId}` : `/${companySlug}/workspace/ecom-orders`)
    : "/workspace/ecom-orders";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice - ${invoice.invoice_no}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.4; color: #1e293b; margin: 0; padding: 24px; background: #fff; }
    .invoice-card { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; padding: 28px; border-radius: 8px; }
    .header-row { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
    .company-name { font-size: 22px; font-weight: 800; color: #0f172a; }
    .invoice-title { font-size: 20px; font-weight: 800; color: #4338ca; text-align: right; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
    .info-title { font-weight: 700; font-size: 12px; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 20px; }
    th { background: #f1f5f9; color: #334155; font-size: 11px; text-transform: uppercase; font-weight: 700; border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .totals-table { width: 340px; margin-left: auto; border-collapse: collapse; }
    .totals-table td { padding: 6px 12px; border: none; }
    .totals-table tr.grand-total { font-size: 15px; font-weight: 800; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; }
    .words-box { margin-top: 20px; padding: 10px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 12px; }
    .footer { margin-top: 36px; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 11px; color: #64748b; text-align: center; }
    @media print {
      body { padding: 0; background: #fff; }
      .invoice-card { border: none; padding: 0; max-width: 100%; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width: 800px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center;">
    <a href="${backUrl}" onclick="if (window.history.length > 1) { window.history.back(); return false; }" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: #f1f5f9; color: #334155; text-decoration: none; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      Back to Order
    </a>
    <button onclick="window.print()" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print / Save as PDF
    </button>
  </div>

  <div class="invoice-card">
    <div class="header-row">
      <div>
        <div class="company-name">${company.company_name || "Nalli Silks"}</div>
        <div style="font-size: 12px; color: #475569; margin-top: 4px;">
          ${company.address || "Corporate Office"}, ${company.city || "Chennai"}, ${company.state || "Tamil Nadu"}
        </div>
        <div style="font-size: 12px; font-weight: 600; margin-top: 4px;">
          GSTIN: ${company.gst_number || "33AAAAA0000A1Z5"}
        </div>
      </div>
      <div>
        <div class="invoice-title">TAX INVOICE</div>
        <div style="font-size: 12px; color: #475569; text-align: right; margin-top: 4px;">
          Invoice No: <strong>${invoice.invoice_no}</strong>
        </div>
        <div style="font-size: 12px; color: #475569; text-align: right; margin-top: 2px;">
          Date: ${new Date(invoice.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </div>
        <div style="font-size: 12px; color: #475569; text-align: right; margin-top: 2px;">
          Place of Supply: <strong>${invoice.place_of_supply} (${invoice.state_code})</strong>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="info-box">
        <div class="info-title">Billed & Shipped To:</div>
        <div style="font-weight: 700; font-size: 13px;">${invoice.customer_name}</div>
        <div style="color: #475569; margin-top: 3px;">${invoice.shipping_address || "Customer Address"}</div>
        <div style="margin-top: 4px;">GSTIN/UIN: <em>Unregistered (B2C)</em></div>
      </div>

      <div class="info-box">
        <div class="info-title">Statutory Declarations:</div>
        <div>Reverse Charge (RCM): <strong>No</strong></div>
        <div>State Code: <strong>${invoice.state_code}</strong></div>
        <div>Supply Type: <strong>${invoice.is_interstate ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"}</strong></div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Description of Goods</th>
          <th class="text-center" style="width: 70px;">HSN</th>
          <th class="text-center" style="width: 40px;">Qty</th>
          <th class="text-right" style="width: 80px;">Rate (₹)</th>
          <th class="text-right" style="width: 90px;">Taxable (₹)</th>
          <th class="text-right" style="width: 70px;">GST %</th>
          <th class="text-right" style="width: 90px;">Total (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (it, idx) => `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td><strong>${it.productName}</strong></td>
            <td class="text-center">${it.hsnCode || "5208"}</td>
            <td class="text-center">${it.qty}</td>
            <td class="text-right">${it.rate.toFixed(2)}</td>
            <td class="text-right">${it.taxableValue.toFixed(2)}</td>
            <td class="text-right">${it.taxRatePercent}%</td>
            <td class="text-right font-weight: 700;">${it.lineTotal.toFixed(2)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>

    <table class="totals-table">
      <tr>
        <td>Taxable Amount:</td>
        <td class="text-right">₹${Number(invoice.subtotal).toFixed(2)}</td>
      </tr>
      ${
        invoice.is_interstate
          ? `
      <tr>
        <td>Integrated Tax (IGST 5%):</td>
        <td class="text-right">₹${Number(invoice.igst_amount).toFixed(2)}</td>
      </tr>`
          : `
      <tr>
        <td>Central Tax (CGST 2.5%):</td>
        <td class="text-right">₹${Number(invoice.cgst_amount).toFixed(2)}</td>
      </tr>
      <tr>
        <td>State Tax (SGST 2.5%):</td>
        <td class="text-right">₹${Number(invoice.sgst_amount).toFixed(2)}</td>
      </tr>`
      }
      <tr class="grand-total">
        <td>Total Invoice Value:</td>
        <td class="text-right">₹${Number(invoice.total_amount).toFixed(2)}</td>
      </tr>
    </table>

    <div class="words-box">
      <strong>Amount in Words:</strong> ${wordsTotal}
    </div>

    <div class="footer">
      This is a computer-generated statutory Tax Invoice and requires no physical signature under Indian GST Act.
    </div>
  </div>
</body>
</html>
  `.trim();
}

