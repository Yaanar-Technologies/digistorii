import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { pool } from "@/lib/db";
import {
  calculatePricing,
  parseDateOnly,
  parseNonNegativeNumber,
} from "@/lib/pricing";
import { getTenantSchema } from "@/lib/tenant";

type UploadRowInput = {
  rowNumber: number;
  variantId: string;
  baseCost: number | null;
  operationalCost: number;
  marginType: "percentage" | "amount";
  marginValue: number;
  taxName: string;
  taxPercent: number;
  activeFrom: string;
  expiresAt: string | null;
};

type UploadValidationError = {
  row: number;
  variantId: string;
  message: string;
};

function isXlsxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx");
}

function buildErrorReportFile(errors: UploadValidationError[]): Buffer {
  const rows = errors.map((error) => ({
    Row: error.row,
    "Variant ID": error.variantId,
    Error: error.message,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Errors");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function cellAsText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeHeader(value: unknown): string {
  return cellAsText(value).toLowerCase().replace(/\s+/g, " ");
}

function parseWorksheetRows(buffer: Buffer, useLastPurchasePrice = false): {
  rows: UploadRowInput[];
  errors: UploadValidationError[];
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Template is empty");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
  });

  if (data.length <= 1) {
    return { rows: [], errors: [] };
  }

  const rows: UploadRowInput[] = [];
  const errors: UploadValidationError[] = [];
  const headers = (data[0] || []).map((value) => normalizeHeader(value));

  const variantIndex =
    headers.indexOf("variant id") >= 0 ? headers.indexOf("variant id") : headers.indexOf("variant_id");
  const baseCostIndex = headers.indexOf("base cost");
  const operationalCostIndex = headers.indexOf("operational cost");
  const marginTypeIndex = headers.indexOf("margin type");
  const marginValueIndex = headers.indexOf("margin value");
  const taxNameIndex = headers.indexOf("tax name");
  const activeFromIndex = headers.findIndex(
    (header) => header === "active from" || header === "active_from" || header === "effective date"
  );

  if (variantIndex < 0 || baseCostIndex < 0) {
    throw new Error("Invalid template columns");
  }
  if (operationalCostIndex < 0) {
    throw new Error("Template must include Operational Cost column");
  }
  if (marginTypeIndex < 0 || marginValueIndex < 0) {
    throw new Error("Template must include Margin Type and Margin Value columns");
  }
  if (taxNameIndex < 0) {
    throw new Error("Template must include Tax Name column");
  }

  for (let index = 1; index < data.length; index += 1) {
    const current = data[index] || [];
    const rowNumber = index + 1;
    const variantId = cellAsText(current[variantIndex]);
    const baseCostRaw = baseCostIndex >= 0 ? cellAsText(current[baseCostIndex]) : "";
    const operationalCostRaw =
      operationalCostIndex >= 0 ? cellAsText(current[operationalCostIndex]) : "";
    const marginTypeRaw = cellAsText(current[marginTypeIndex]).toLowerCase();
    const marginValueRaw = cellAsText(current[marginValueIndex]);
    const taxNameRaw = cellAsText(current[taxNameIndex]);
    const activeFromRaw = activeFromIndex >= 0 ? cellAsText(current[activeFromIndex]) : "";

    const isEmpty =
      !variantId &&
      !baseCostRaw &&
      !operationalCostRaw &&
      !marginTypeRaw &&
      !marginValueRaw &&
      !taxNameRaw &&
      !activeFromRaw;
    if (isEmpty) {
      continue;
    }

    if (!variantId) {
      errors.push({ row: rowNumber, variantId: "", message: "Variant ID is required" });
      continue;
    }

    try {
      if (!Number.isFinite(Number(variantId))) {
        throw new Error("Variant ID must be numeric");
      }
      
      let baseCost: number | null = null;
      if (baseCostRaw === "" && useLastPurchasePrice) {
        baseCost = null;
      } else {
        baseCost = parseNonNegativeNumber(baseCostRaw, "Base Cost", true);
      }

      const operationalCost = parseNonNegativeNumber(operationalCostRaw || "0", "Operational Cost", true);

      const today = new Date().toISOString().slice(0, 10);
      const activeFrom =
        activeFromRaw === "" ? today : parseDateOnly(activeFromRaw, "Active From");
      if (activeFrom < today) {
        throw new Error("Active From cannot be in the past");
      }

      if (marginTypeRaw && marginTypeRaw !== "percentage" && marginTypeRaw !== "amount") {
        throw new Error("Margin Type must be percentage or amount");
      }
      const marginType: "percentage" | "amount" =
        marginTypeRaw === "amount" ? "amount" : "percentage";

      rows.push({
        rowNumber,
        variantId,
        baseCost,
        operationalCost,
        marginType,
        marginValue:
          marginValueRaw === "" ? 0 : parseNonNegativeNumber(marginValueRaw, "Margin Value", true, 4),
        taxName: taxNameRaw,
        taxPercent: 0,
        activeFrom,
        expiresAt: null,
      });
    } catch (error: any) {
      errors.push({
        row: rowNumber,
        variantId,
        message: error.message || "Invalid row",
      });
    }
  }

  return { rows, errors };
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    const previewMode = String(req.nextUrl.searchParams.get("preview") || "").toLowerCase() === "true";
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "File is required" }, { status: 400 });
    }
    if (!isXlsxFile(file)) {
      return NextResponse.json({ message: "Only .xlsx files are allowed" }, { status: 400 });
    }

    
    const useLastPurchasePrice = String(req.nextUrl.searchParams.get("useLastPurchasePrice") || "").toLowerCase() === "true";
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseWorksheetRows(buffer, useLastPurchasePrice);

    // if (parsed.rows.length === 0) {
    //   return NextResponse.json({ message: "No pricing rows found in upload file" }, { status: 400 });
    // }

    // Fetch purchase prices if useLastPurchasePrice is active
    const purchasePriceMap = new Map<number, number>();
    if (useLastPurchasePrice && parsed.rows.length > 0) {
      const uniqueVariantIds = Array.from(
        new Set(
          parsed.rows
            .map((r) => Number(r.variantId))
            .filter((id) => !isNaN(id))
        )
      );

      if (uniqueVariantIds.length > 0) {
        const purchaseRes = await client.query(
          `
          SELECT DISTINCT ON (d.product_id)
            d.product_id AS variant_id,
            d.rate::numeric AS rate
          FROM "${schema}".purchase_detail d
          JOIN "${schema}".purchase_header h ON d.purchase_id = h.id
          WHERE d.product_id = ANY($1::bigint[])
            AND h.status IN ('Approved', 'Partial')
          ORDER BY d.product_id, h.purchase_date DESC, h.id DESC
          `,
          [uniqueVariantIds]
        );

        for (const row of purchaseRes.rows) {
          purchasePriceMap.set(Number(row.variant_id), Number(row.rate));
        }
      }
    }

    const variantResult = await client.query<{
      variant_id: number;
      sku: string;
      product_id: string | number;
      source_type: "vendor" | "own";
    }>(
      `
        SELECT
          pv.id AS variant_id,
          pv.sku,
          pv.barcode,
          pv.product_id,
          p.source AS source_type
        FROM "${schema}".product_variants pv
        INNER JOIN "${schema}".products p
          ON p.id = pv.product_id
        WHERE pv.status IN ('draft', 'active', 'out_of_stock')
          AND p.status = 1
      `
    );
    const variantMap = new Map(
      variantResult.rows.map((item) => [
        String(item.variant_id),
        { productId: item.product_id, sourceType: item.source_type, sku: item.sku },
      ])
    );

    const validationErrors: UploadValidationError[] = [...parsed.errors];
    const seenVariant = new Set<string>();
    for (const row of parsed.rows) {
      const variantMeta = variantMap.get(row.variantId);
      if (!variantMeta) {
        validationErrors.push({
          row: row.rowNumber,
          variantId: row.variantId,
          message: "Variant ID does not exist",
        });
      }
      if (seenVariant.has(row.variantId)) {
        validationErrors.push({
          row: row.rowNumber,
          variantId: row.variantId,
          message: "Duplicate Variant ID in upload",
        });
      }
      
      // Check if base cost is missing and no purchase price is found
      const latestPrice = purchasePriceMap.get(Number(row.variantId));
      if (row.baseCost === null && latestPrice === undefined) {
        validationErrors.push({
          row: row.rowNumber,
          variantId: row.variantId,
          message: "Base Cost is required (no purchase history found to auto-populate)",
        });
      }
      
      seenVariant.add(row.variantId);
    }

    const taxResult = await client.query(
      `
        SELECT id, tax_name, total_percentage
        FROM "${schema}".tax_master
        WHERE is_active = TRUE
        ORDER BY id
      `
    );
    const taxByName = new Map<string, number>(
      taxResult.rows.map((row: { tax_name: string; total_percentage: number }) => [
        String(row.tax_name || "").trim().toLowerCase(),
        Number(row.total_percentage || 0),
      ])
    );

    for (const row of parsed.rows) {
      const taxKey = String(row.taxName || "").trim().toLowerCase();
      if (taxKey && !taxByName.has(taxKey)) {
        validationErrors.push({
          row: row.rowNumber,
          variantId: row.variantId,
          message: `Tax Name "${row.taxName}" not found`,
        });
      }
    }

    if (validationErrors.length > 0) {
      const reportBuffer = buildErrorReportFile(validationErrors);
      return NextResponse.json(
        {
          message: "Upload failed: Check for errors and try again.",
          errorCount: validationErrors.length,
          errors: validationErrors,
          errorReport: reportBuffer.toString("base64"),
          errorReportFileName: "pricing-upload-errors.xlsx",
        },
        { status: 400 }
      );
    }

    const previewRows: Array<{
      variant_id: string;
      sku: string;
      base_cost: number;
      operational_cost: number;
      landed_price: number;
      margin_amount: number;
      tax_amount: number;
      unit_price: number;
      selling_price: number;
    }> = [];

    const variantIds: string[] = [];
    const baseCosts: number[] = [];
    const operationalCosts: number[] = [];
    const landedPrices: number[] = [];
    const marginTypes: string[] = [];
    const marginValues: number[] = [];
    const marginAmounts: number[] = [];
    const unitPrices: number[] = [];
    const taxPercents: number[] = [];
    const taxAmounts: number[] = [];
    const finalSellingPrices: number[] = [];
    const activeFromDates: string[] = [];
    const expiresAtDates: (string | null)[] = [];
    const productIds: (string | number)[] = [];
    const sourceTypes: ("vendor" | "own")[] = [];

    parsed.rows.forEach((row) => {
      const variantMeta = variantMap.get(row.variantId);
      if (!variantMeta) {
        throw new Error(`Variant ID "${row.variantId}" does not exist`);
      }

      const taxKey = String(row.taxName || "").trim().toLowerCase();
      const resolvedTaxPercent = taxKey ? taxByName.get(taxKey) ?? 0 : 0;

      const latestPrice = purchasePriceMap.get(Number(row.variantId));
      const resolvedBaseCost = latestPrice !== undefined ? latestPrice : row.baseCost;

      if (resolvedBaseCost === null) {
        throw new Error(`Base cost is missing for Variant ID "${row.variantId}"`);
      }

      const calculated = calculatePricing({
        baseCost: resolvedBaseCost,
        operationalCost: row.operationalCost,
        marginType: row.marginType,
        marginValue: row.marginValue,
        taxPercent: resolvedTaxPercent,
      });

      previewRows.push({
        variant_id: row.variantId,
        sku: variantMeta.sku,
        base_cost: resolvedBaseCost,
        operational_cost: row.operationalCost,
        landed_price: calculated.landedPrice,
        margin_amount: calculated.marginAmount,
        tax_amount: calculated.taxAmount,
        unit_price: calculated.unitPrice,
        selling_price: calculated.finalSellingPrice,
      });

      variantIds.push(row.variantId);
      baseCosts.push(resolvedBaseCost);
      operationalCosts.push(row.operationalCost);
      landedPrices.push(calculated.landedPrice);
      marginTypes.push(row.marginType);
      marginValues.push(row.marginValue);
      marginAmounts.push(calculated.marginAmount);
      unitPrices.push(calculated.unitPrice);
      taxPercents.push(resolvedTaxPercent);
      taxAmounts.push(calculated.taxAmount);
      finalSellingPrices.push(calculated.finalSellingPrice);
      activeFromDates.push(row.activeFrom);
      expiresAtDates.push(row.expiresAt);
      productIds.push(variantMeta.productId);
      sourceTypes.push(variantMeta.sourceType);
    });

    if (previewMode) {
      return NextResponse.json({
        message: "Preview ready",
        previewRows,
        updatedRows: previewRows.length,
      });
    }

    await client.query("BEGIN");
    await client.query(
      `
        UPDATE "${schema}".product_pricing
        SET is_active = FALSE, expires_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1
          AND is_active = TRUE
          AND variant_id = ANY($2::bigint[])
      `,
      [company, variantIds]
    );

    await client.query(
      `
        INSERT INTO "${schema}".product_pricing
          (
            tenant_id,
            product_id,
            variant_id,
            source_type,
            base_cost,
            operational_cost,
            landed_price,
            margin_type,
            margin_value,
            margin_amount,
            unit_price,
            tax_percent,
            tax_amount,
            final_selling_price,
            active_from,
            expires_at,
            is_active
          )
        SELECT
          $1::varchar(80),
          payload.product_id,
          payload.variant_id,
          payload.source_type,
          payload.base_cost,
          payload.operational_cost,
          payload.landed_price,
          payload.margin_type,
          payload.margin_value,
          payload.margin_amount,
          payload.unit_price,
          payload.tax_percent,
          payload.tax_amount,
          payload.final_selling_price,
          payload.active_from,
          payload.expires_at,
          CASE
            WHEN CURRENT_DATE >= payload.active_from
              AND (payload.expires_at IS NULL OR CURRENT_DATE <= payload.expires_at)
            THEN TRUE
            ELSE FALSE
          END
        FROM unnest(
          $2::bigint[],
          $3::bigint[],
          $4::text[],
          $5::numeric[],
          $6::numeric[],
          $7::numeric[],
          $8::text[],
          $9::numeric[],
          $10::numeric[],
          $11::numeric[],
          $12::numeric[],
          $13::numeric[],
          $14::numeric[],
          $15::date[],
          $16::date[]
        ) AS payload(
          variant_id,
          product_id,
          source_type,
          base_cost,
          operational_cost,
          landed_price,
          margin_type,
          margin_value,
          margin_amount,
          unit_price,
          tax_percent,
          tax_amount,
          final_selling_price,
          active_from,
          expires_at
        )
      `,
      [
        company,
        variantIds,
        productIds,
        sourceTypes,
        baseCosts,
        operationalCosts,
        landedPrices,
        marginTypes,
        marginValues,
        marginAmounts,
        unitPrices,
        taxPercents,
        taxAmounts,
        finalSellingPrices,
        activeFromDates,
        expiresAtDates,
      ]
    );
    
    await client.query(
  `
  UPDATE "${schema}".product_variants
  SET status = 'active',
      updated_at = NOW()
  WHERE id = ANY($1::bigint[])
  AND status = 'draft'
  `,
  [variantIds]
);

    await client.query("COMMIT");

    return NextResponse.json({
      message: "Pricing uploaded successfully",
      updatedRows: parsed.rows.length,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { message: error.message || "Failed to upload pricing" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}


