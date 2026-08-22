//C:\Users\yanna\digistorii\src\app\api\purchase\[id]\route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getNextProductCodeByType } from "@/lib/document-number-generator";
import { buildAutoSku, getTenantSchema } from "@/lib/tenant";

async function skuExists(client: any, schema: string, sku: string) {
  const res = await client.query(
    `SELECT 1 FROM "${schema}".product_variants WHERE upper(sku) = upper($1) LIMIT 1`,
    [sku]
  );
  return res.rowCount > 0;
}

async function resolveUniqueSku(client: any, schema: string, baseSku: string) {
  let candidate = baseSku;
  let counter = 1;
  while (await skuExists(client, schema, candidate)) {
    candidate = `${baseSku}-${counter}`;
    counter += 1;
  }
  return candidate;
}

async function resolveVariantId(
  client: any,
  schema: string,
  idValue: any
): Promise<number> {
  const id = Number(idValue);
  if (!Number.isFinite(id)) throw new Error("Invalid variant id");
  const variantRes = await client.query(
    `SELECT id FROM "${schema}".product_variants WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (variantRes.rows.length) return Number(variantRes.rows[0].id);

  const fallbackRes = await client.query(
    `SELECT id FROM "${schema}".product_variants WHERE product_id = $1 ORDER BY id ASC LIMIT 1`,
    [id]
  );
  if (fallbackRes.rows.length) return Number(fallbackRes.rows[0].id);
  throw new Error("Variant not found for selected product");
}

async function createVariantForNewProduct(
  client: any,
  schema: string,
  detail: any,
  newProduct: any,
  tempKey: string,
  cache: Map<string, number>
) {
  console.log("CREATE TEMP PRODUCT", {
    tempKey,
    productName: newProduct?.name || detail?.product_name,
    sku: newProduct?.sku,
    detailProductId: detail?.product_id,
  });
  if (cache.has(tempKey)) {
    const cachedVariantId = cache.get(tempKey)!;
    console.log("REUSE CACHED TEMP PRODUCT VARIANT", { tempKey, variantId: cachedVariantId });
    return cachedVariantId;
  }

  const productName = String(detail?.product_name || newProduct?.name || "").trim();
  if (!productName) {
    throw new Error("New product name is required");
  }
  const type =
    detail?.type === "raw_material" || detail?.type === "other" ? detail.type : "finished_good";
  const source =
    detail?.source === "vendor" || newProduct?.source === "vendor" ? "vendor" : "own";
  const categoryId = String(detail?.category_id || newProduct?.categoryId || "").trim();
  const materialId = String(detail?.material || newProduct?.materialId || "").trim();
  const providedProductCode = String(detail?.product_code || newProduct?.product_code || "").trim();
  let productCode = providedProductCode;
  if (providedProductCode) {
    const productCodeRes = await client.query(
      `SELECT id FROM "${schema}".products WHERE UPPER(product_code) = UPPER($1) LIMIT 1`,
      [providedProductCode]
    );
    if (productCodeRes.rows.length) {
      throw new Error(`Product code "${providedProductCode}" already exists`);
    }
  } else {
    productCode = await getNextProductCodeByType(schema, type, client);
  }

  const productRes = await client.query(
    `
      INSERT INTO "${schema}".products
        (product_code, name, category, material, uom, hsn_code, description, type, source, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW())
      RETURNING id
    `,
    [
      productCode,
      productName,
      categoryId || null,
      materialId || null,
      String(detail?.uom || "").trim() || null,
      String(detail?.hsn_no || "").trim() || null,
      String(detail?.description || "").trim() || null,
      type,
      source,
    ]
  );

  const productId = Number(productRes.rows[0]?.id);
  if (!Number.isFinite(productId)) {
    throw new Error("Failed to create product for purchase item");
  }

  const requestedSku = String(detail?.sku || newProduct?.sku || "").trim();
  let sku = requestedSku;
  if (requestedSku) {
    if (await skuExists(client, schema, requestedSku)) {
      throw new Error(`SKU "${requestedSku}" already exists`);
    }
  } else {
    const baseSku = buildAutoSku(productCode, "NA", "NA");
    sku = await resolveUniqueSku(client, schema, baseSku);
  }

  const variantRes = await client.query(
    `
      INSERT INTO "${schema}".product_variants
        (product_id, color_id, size, sku, qty, low_stock_threshold, backorders_allowed, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
      RETURNING id
    `,
    [productId, "NA", "NA", sku, 0, 5, false]
  );
  const variantId = Number(variantRes.rows[0]?.id);
  if (!Number.isFinite(variantId)) {
    throw new Error("Failed to create variant for purchase item");
  }

  await client.query(
    `
      UPDATE "${schema}".product_variants
      SET barcode = LPAD(id::text, 10, '0')
      WHERE id = $1
    `,
    [variantId]
  );
  cache.set(tempKey, variantId);
  return variantId;
}

function isNewPurchaseItem(detail: any) {
  if (detail?.is_new === true) return true;
  if (typeof detail?.product_id === "string" && detail.product_id.startsWith("temp-")) return true;
  return !!(detail?.newProduct && typeof detail.newProduct === "object");
}

function getTempKey(detail: any) {
  return String(
    detail?.temp_id ||
    detail?.product_id ||
    detail?.newProduct?.temp_id ||
    detail?.newProduct?.sku ||
    detail?.newProduct?.name ||
    ""
  ).trim();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {

  const client = await pool.connect();

  try {

    const { schema, company } = await getTenantSchema(req);
    const { id: purchaseId } = await context.params;

    const headerRes = await client.query(
      `SELECT
              ph.*,
              pc.company_name,
              pc.gst_number AS company_gstin,
              CONCAT_WS(', ', pc.address, pc.city, pc.state, pc.country) AS company_address,
              s.supplier_code,
              s.name as supplier_name,
              s.email as supplier_email,
              s.phone as supplier_phone,
              s.currency as curr,
              s.gstin as supplier_gstin,
              cr.currency_code as currency_code,
              CONCAT_WS(', ', s.address_line1, s.address_line2, s.address_line3, s.city, s.state, s.pincode) as supplier_address,
              dt.despatch_name as despatch_terms_name,
              pt.name as payment_terms_name
            FROM ${schema}.purchase_header ph
            LEFT JOIN public.companies pc
              ON pc.subdomain_url = $2
            LEFT JOIN ${schema}.suppliers s
              ON ph.supplier_id = s.id
            Left Join ${schema}.currencies c
			  ON ph.currency=c.id
            LEFT JOIN "${schema}".despatch_terms dt
              ON ph.despatch_terms = dt.id
            LEFT JOIN "${schema}".payment_terms pt
              ON ph.payment_terms = pt.id
            LEFT JOIN "${schema}".currencies cr
              ON cr.id::text = ph.currency::text
            WHERE ph.id=$1`,
      [purchaseId, company]
    );

    let renewedFromPurchaseNo: string | null = null;
    const headerRow = headerRes.rows[0] || null;
    const renewedFromPoId = Number(headerRow?.renewed_from_po_id);
    if (Number.isFinite(renewedFromPoId) && renewedFromPoId > 0) {
      const renewedFromRes = await client.query(
        `
                  SELECT purchase_no
                  FROM "${schema}".purchase_header
                  WHERE id = $1
                  LIMIT 1
                `,
        [renewedFromPoId]
      );
      renewedFromPurchaseNo = renewedFromRes.rows[0]?.purchase_no || null;
    }

    const detailRes = await client.query(
      `SELECT
                d.*,
                d.hsn_no AS hsn_code,
                (COALESCE(d.qty, 0) * COALESCE(d.rate, 0)) AS taxable_value,
                p.product_code,
                p.name AS product_name,
                p.description,
                d.tax_master_id AS tax_id,
                tr.tax_name,
                tr.total_percentage AS tax_percent,
                u.uom_code,
                u.uom_name,
                pv.sku
            FROM ${schema}.purchase_detail d
            LEFT JOIN ${schema}.product_variants pv
              ON pv.id = d.product_id
            LEFT JOIN ${schema}.products p
              ON p.id = COALESCE(pv.product_id, d.product_id)
            LEFT JOIN "${schema}".uom u
              ON u.id::text = p.uom
            LEFT JOIN ${schema}.tax_master tr
              ON tr.id = d.tax_master_id
            WHERE d.purchase_id = $1
            ORDER BY d.id`,
      [purchaseId]
    );

    const detailRows = detailRes.rows || [];
    const taxIds = Array.from(
      new Set(
        detailRows
          .map((row: any) => Number(row.tax_id))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    );

    let taxComponentsById = new Map<
      number,
      Array<{ component_name: string; component_percentage: number }>
    >();

    if (taxIds.length) {
      const componentsRes = await client.query(
        `
                  SELECT
                    tax_master_id,
                    component_name,
                    component_percentage
                  FROM "${schema}".tax_component
                  WHERE tax_master_id = ANY($1::int[])
                  ORDER BY id
                `,
        [taxIds]
      );

      taxComponentsById = componentsRes.rows.reduce((map, row) => {
        const taxId = Number(row.tax_master_id);
        if (!map.has(taxId)) map.set(taxId, []);
        map.get(taxId)!.push({
          component_name: row.component_name,
          component_percentage: Number(row.component_percentage || 0)
        });
        return map;
      }, new Map<number, Array<{ component_name: string; component_percentage: number }>>());
    }

    const details = detailRows.map((row: any) => ({
      ...row,
      tax_components: taxComponentsById.get(Number(row.tax_id)) || []
    }));

    const toNumber = (value: any) => Number(value || 0);
    const taxComponentTotals: Record<string, number> = {};

    details.forEach((row: any) => {
      const taxComponents = row.tax_components || [];
      const lineTaxAmount = toNumber(row.tax_amount);
      if (!taxComponents.length || lineTaxAmount <= 0) return;

      const totalPercent = taxComponents.reduce(
        (sum: number, comp: any) => sum + toNumber(comp.component_percentage),
        0
      );
      if (totalPercent <= 0) return;

      taxComponents.forEach((comp: any) => {
        const compName = comp.component_name || "Tax";
        const compAmount =
          (toNumber(comp.component_percentage) / totalPercent) * lineTaxAmount;
        taxComponentTotals[compName] =
          (taxComponentTotals[compName] || 0) + compAmount;
      });
    });

    const componentTotals = Object.entries(taxComponentTotals).map(
      ([component_name, amount]) => {
        const sample = details
          .flatMap(d => d.tax_components || [])
          .find(c => c.component_name === component_name);

        return {
          component_name,
          component_percentage: Number(sample?.component_percentage || 0),
          amount: Number(amount.toFixed(2))
        };
      }
    );
    const componentsTotal = componentTotals.reduce(
      (sum, comp) => sum + toNumber(comp.amount),
      0
    );

    const freightTaxTotal = toNumber(headerRow?.freight_tax_amount);
    const tax_breakdown = {
      components: componentTotals,
      components_total: Number(componentsTotal.toFixed(2)),
      freight_tax_total: Number(freightTaxTotal.toFixed(2)),
      total_tax_including_freight: Number(
        (componentsTotal + freightTaxTotal).toFixed(2)
      )
    };

    console.log("Fetched Purchase print data for ID:", purchaseId);
    return NextResponse.json({
      success: true,
      data: {
        header: headerRow
          ? {
            ...headerRow,
            renewed_from_purchase_no: renewedFromPurchaseNo,
            tax_breakdown
          }
          : null,
        details
      }
    });

  } catch (error: any) {

    console.error("Fetch Purchase Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );

  } finally {

    client.release();

  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {

  const client = await pool.connect();
  let failedItem: any = null;

  try {

    const { schema } = await getTenantSchema(req);
    const { id: purchaseId } = await context.params;

    const body = await req.json();

    const { header, details } = body;
    console.log("RECEIVED PO PAYLOAD", {
      purchaseId,
      header: { po_type: header?.po_type, purchase_no: header?.purchase_no, supplier_id: header?.supplier_id },
      detailCount: Array.isArray(details) ? details.length : 0,
      detailSummaries: Array.isArray(details)
        ? details.map((d: any) => ({
          product_id: d.product_id,
          temp_id: d.temp_id,
          product_code: d.product_code,
          is_new: d.is_new,
          hasNewProduct: !!d.newProduct,
        }))
        : [],
    });

    const {
      po_type,
      purchase_no,
      ref_no,
      bill_to,
      ship_to,
      despatch_terms,
      payment_terms,
      freight_charges,
      freight_tax,
      freight_tax_amount,
      packaging_amount,
      notes,
      attachment_url,
      supplier_id,
      purchase_date,
      req_date,
      currency,
      conversion_rate,
      status,
      user_name
    } = header;
    const supplierRes = await client.query(
      `SELECT purchase_hold FROM ${schema}.suppliers WHERE id = $1`,
      [supplier_id]
    );

    if (supplierRes.rows[0]?.purchase_hold) {
      return NextResponse.json(
        { success: false, message: "Supplier is on purchase hold" },
        { status: 400 }
      );
    }


    await client.query("BEGIN");

    const poType = po_type || "standard";
    const purchaseNo = String(purchase_no || "").trim();
    if (poType === "manual" && !purchaseNo) {
      throw new Error("PO number is required for manual type");
    }

    const toNumber = (value: any) => Number(value || 0);
    const round2 = (value: number) => Number(value.toFixed(2));
    const subtotal = details.reduce(
      (sum: number, d: any) => sum + toNumber(d.qty) * toNumber(d.rate),
      0
    );
    const productTax = details.reduce(
      (sum: number, d: any) => sum + toNumber(d.tax_amount),
      0
    );
    const freightBase = toNumber(freight_charges);
    const freightTaxAmount = toNumber(freight_tax_amount);
    const packagingAmount = toNumber(packaging_amount);
    const extraChargesTotal = freightBase + freightTaxAmount + packagingAmount;
    const grandTotal = subtotal + productTax + extraChargesTotal;

    // UPDATE HEADER
    await client.query(
      `UPDATE ${schema}.purchase_header
      SET po_type=$1,
          purchase_no=$2,
          ref_no=$3,
          bill_to=$4,
          ship_to=$5,
          despatch_terms=$6,
          payment_terms=$7,
          freight_charges=$8,
          freight_tax=$9,
          freight_tax_amount=$10,
          packaging_amount=$11,
          notes=$12,
          attachment_url=$13,
          supplier_id=$14,
          purchase_date=$15,
          req_date=$16,
          currency=$17,
          conversion_rate=$18,
          status=$19,
          subtotal=$20,
          tax_amount=$21,
          total_amount=$22,
          updated_by=$23,
          updated_at=NOW()
      WHERE id=$24
      `,
      [
        poType,
        purchaseNo || null,
        ref_no || null,
        bill_to ? String(bill_to).trim() : null,
        ship_to ? String(ship_to).trim() : null,
        despatch_terms ? Number(despatch_terms) : null,
        payment_terms ? Number(payment_terms) : null,
        Number(freight_charges || 0),
        Number(freight_tax || 0),
        Number(freight_tax_amount || 0),
        Number(packaging_amount || 0),
        notes || null,
        attachment_url || null,
        supplier_id,
        purchase_date,
        req_date,
        currency,
        conversion_rate,
        status || "Awaiting for approval",
        round2(subtotal),
        round2(productTax),
        round2(grandTotal),
        user_name,
        purchaseId
      ]
    );

    // FETCH existing detail ids from DB
    const existingRes = await client.query(
      `SELECT id FROM ${schema}.purchase_detail WHERE purchase_id=$1`,
      [purchaseId]
    );

    const existingIds = existingRes.rows.map((r) => r.id);

    const incomingIds = details
      .filter((d: any) => d.id)
      .map((d: any) => d.id);

    // FIND deleted rows
    const deletedIds = existingIds.filter(
      (id: number) => !incomingIds.includes(id)
    );

    if (deletedIds.length > 0) {
      await client.query(
        `DELETE FROM ${schema}.purchase_detail
         WHERE id = ANY($1::int[])`,
        [deletedIds]
      );
    }

    // LOOP details
    const createdTempVariantMap = new Map<string, number>();
    const resolvedDetails: Array<any & { resolved_variant_id: number }> = [];

    for (let index = 0; index < details.length; index += 1) {
      const item = details[index];
      failedItem = {
        index,
        id: item?.id ?? null,
        product_id: item?.product_id ?? null,
        temp_id: item?.temp_id ?? null,
        product_code: item?.product_code ?? null,
        product_name: item?.product_name ?? null,
        is_new: item?.is_new ?? false
      };
      let variantId: number;

      if (isNewPurchaseItem(item)) {
        const tempKey = getTempKey(item);
        if (!tempKey) {
          throw new Error(`Missing temp_id for new product at row ${index + 1}`);
        }
        variantId = await createVariantForNewProduct(
          client,
          schema,
          item,
          item.newProduct || {},
          tempKey,
          createdTempVariantMap
        );
      } else {
        variantId = await resolveVariantId(client, schema, item.product_id);
      }

      resolvedDetails.push({
        ...item,
        resolved_variant_id: variantId
      });
    }

    console.log(
      "RESOLVED PURCHASE ITEM VARIANTS",
      resolvedDetails.map((item) => ({
        id: item.id || null,
        temp_id: item.temp_id || null,
        product_id: item.product_id || null,
        resolved_variant_id: item.resolved_variant_id,
        is_new: item.is_new === true
      }))
    );

    for (const item of resolvedDetails) {
      const taxMasterId = item.tax_id && item.tax_id > 0 ? item.tax_id : null;

      if (item.id) {


        // UPDATE EXISTING ROW
        await client.query(
          `
          UPDATE ${schema}.purchase_detail
          SET product_id=$1,
              UOM=$2,
              HSN_NO=$3,
              rate=$4,
              qty=$5,
              tax_master_id=$6,
              tax_amount=$7,
              line_total=$8,
              updated_by=$9,
              updated_at=NOW()
          WHERE id=$10
          `,
          [
            item.resolved_variant_id,
            item.uom,
            item.hsn_no,
            item.rate,
            item.qty,
            taxMasterId,
            item.tax_amount,
            item.line_total,
            user_name,
            item.id
          ]
        );

      } else {

        // INSERT NEW ROW
        await client.query(
          `
          INSERT INTO ${schema}.purchase_detail
          (
            purchase_id,
            product_id,
            UOM,
            HSN_NO,
            rate,
            qty,
            tax_master_id,
            tax_amount,
            line_total,
            created_by,
            created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
          `,
          [
            purchaseId,
            item.resolved_variant_id,
            item.uom,
            item.hsn_no,
            item.rate,
            item.qty,
            taxMasterId,
            item.tax_amount,
            item.line_total,
            user_name
          ]
        );
      }
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Purchase Updated Successfully",
      debug: {
        resolved_items: resolvedDetails.map((item) => ({
          id: item.id || null,
          temp_id: item.temp_id || null,
          product_id: item.product_id || null,
          resolved_variant_id: item.resolved_variant_id,
          is_new: item.is_new === true
        }))
      }
    });

  } catch (error: any) {

    await client.query("ROLLBACK");

    console.error("Purchase Update Failed, rolling back:", {
      code: error?.code,
      message: error?.message,
      detail: error?.detail,
      stack: error?.stack
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        debug: {
          code: error?.code || null,
          detail: error?.detail || null,
          hint: error?.hint || null,
          failed_item: failedItem
        }
      },
      { status: 400 }
    );

  } finally {

    client.release();

  }
}

