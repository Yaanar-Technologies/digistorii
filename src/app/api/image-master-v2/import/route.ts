import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
import { normalizeSku } from "@/lib/product-utils";
import { PoolClient } from "pg";
import { getRuleValidationError } from "@/lib/formValidationRules";
import {
  validateBarcodeOrThrow,
  normalizeBarcode,
} from "@/lib/product-barcode";

export const runtime = "nodejs";

type ParsedVariant = {
  row: number;
  parentSku: string;
  sku: string;
  color: string;
  size: string;
  fitting: string;
  gender: string;
  lowStockAmount: number | null;
  backordersAllowed: boolean;
  barcode: string;
  imageUrls: string[];
  imageIds: number[];
};

type ParsedParent = {
  row: number;
  sku: string;
  name: string;
  categoryId: string | null;
  materialId: string | null;
  uomId: string | null;
  source: "own" | "vendor";
  hsn: string | null;
  description: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  variants: ParsedVariant[];
};

type Lookups = {
  categoryByLabel: Map<string, string>;
  materialByLabel: Map<string, string>;
  uomByLabel: Map<string, string>;
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function cell(row: Record<string, unknown>, header: string): string {
  const normalized = normalizeHeader(header);
  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeader(key) === normalized) {
      return stringValue(value);
    }
  }
  return "";
}

function asNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function splitImageUrls(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitImageIds(value: string): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((num) => Number.isFinite(num) && num > 0);
}

function parseBooleanFlexible(value: string): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return null;
}

const UOM_ALIASES = new Map<string, string>([
  ["ea", "each"],
  ["pc", "pcs"],
  ["nos", "number"],
  ["gms", "gram"],
  ["mtr", "metre"],
  ["1ltr", "litre"],
]);

async function loadLookups(client: PoolClient, schema: string): Promise<Lookups> {
  const categoryRows = await client.query(
    `
      SELECT id, path_string, category_name
      FROM "${schema}".product_categories
      ORDER BY path_string ASC
    `
  );
  const categoryByLabel = new Map<string, string>();
  categoryRows.rows.forEach((row: { id: number; path_string: string | null; category_name: string }) => {
    const idText = String(row.id);
    const pathLabel = row.path_string ? normalizeLookupKey(row.path_string) : "";
    const nameLabel = row.category_name ? normalizeLookupKey(row.category_name) : "";
    if (pathLabel) categoryByLabel.set(pathLabel, idText);
    if (nameLabel) categoryByLabel.set(nameLabel, idText);
    categoryByLabel.set(normalizeLookupKey(idText), idText);
  });

  const materialRows = await client.query(
    `
      SELECT id, material_code, material_name
      FROM "${schema}".product_materials
      ORDER BY material_name ASC
    `
  );
  const materialByLabel = new Map<string, string>();
  materialRows.rows.forEach((row: { id: number; material_code: string; material_name: string }) => {
    const idText = String(row.id);
    const code = String(row.material_code || "").trim();
    const name = String(row.material_name || "").trim();
    const combo = code && name ? `${code} - ${name}` : "";
    if (combo) materialByLabel.set(normalizeLookupKey(combo), idText);
    if (name) materialByLabel.set(normalizeLookupKey(name), idText);
    if (code) materialByLabel.set(normalizeLookupKey(code), idText);
    materialByLabel.set(normalizeLookupKey(idText), idText);
  });

  const uomRows = await client.query(
    `
      SELECT id, uom_code, uom_name
      FROM "${schema}".uom
      ORDER BY uom_name ASC
    `
  );
  const uomByLabel = new Map<string, string>();
  uomRows.rows.forEach((row: { id: number; uom_code: string; uom_name: string }) => {
    const idText = String(row.id);
    const code = String(row.uom_code || "").trim();
    const name = String(row.uom_name || "").trim();
    const combo = code && name ? `${code} - ${name}` : "";
    if (combo) uomByLabel.set(normalizeLookupKey(combo), idText);
    if (name) uomByLabel.set(normalizeLookupKey(name), idText);
    if (code) uomByLabel.set(normalizeLookupKey(code), idText);
    uomByLabel.set(normalizeLookupKey(idText), idText);
  });

  return { categoryByLabel, materialByLabel, uomByLabel };
}

function resolveLookupStrict(
  label: string,
  map: Map<string, string>,
  rowNumber: number,
  fieldName: string,
  errors: string[],
  aliases?: Map<string, string>
): string | null {
  if (!label) return null;
  let normalized = normalizeLookupKey(label);
  if (aliases && aliases.has(normalized)) {
    normalized = aliases.get(normalized) || normalized;
  }
  const resolved = map.get(normalized);
  if (!resolved) {
    errors.push(`Row ${rowNumber}: ${fieldName} "${label}" not found.`);
    return null;
  }
  return resolved;
}

function buildVariantSku(parentSku: string, color: string, size: string, fitting: string) {
  const safeParent = normalizeSku(parentSku || "NA");
  const safeColor = normalizeSku(color || "NA");
  const safeSize = normalizeSku(size || "NA");
  const safeFitting = normalizeSku(fitting || "NA");
  return `${safeParent}-${safeColor}-${safeSize}-${safeFitting}`;
}

async function parseSheet(buffer: Buffer, lookups: Lookups) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Template is empty");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rows.length === 0) {
    return {
      parents: [],
      orphanVariants: [],
      errors: ["Template has no data rows."],
      warnings: [],
    };
  }

  const requiredHeaders = [
    "image_id",
    "image_url",
    "category",
    "material",
    "uom",
    "source",
    "sku",
    "product_name",
    "description", 
    "hsn",
    "parent sku",
    "color",
    "size",
    "fitting",
    "gender",
    "weight",
    "length",
    "width",
    "height",
    "Low stock amount",
    "backorders allowed",
    "barcode",
  ];
  const actualHeaders = Object.keys(rows[0]).map(normalizeHeader);

const expectedHeaders = requiredHeaders.map(normalizeHeader);

const missingHeaders = expectedHeaders.filter(
  (h) => !actualHeaders.includes(h)
);

if (missingHeaders.length > 0) {
  return {
    parents: [],
    orphanVariants: [],
    errors: [`Invalid template. Missing headers: ${missingHeaders.join(", ")}`],
    warnings: [],
  };
}

  const isRowEmpty = (row: Record<string, unknown>) =>
    requiredHeaders.every((header) => !cell(row, header));

  const parents = new Map<string, ParsedParent>();
  const orphanVariants: ParsedVariant[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const strictErrors: string[] = [];

  rows.forEach((row: Record<string, unknown>, index: number) => {
    const rowNumber = index + 2;
    // console.log("Row data:", rowNumber, row);
    // if (isRowEmpty(row)) return;
    if (isRowEmpty(row)) {
      warnings.push(`Row ${rowNumber}: Empty row skipped.`);
      return;
    }

    const imageIdRaw = cell(row, "image_id");
    const imageUrlRaw = cell(row, "image_url");
    const categoryRaw = cell(row, "category");
    const materialRaw = cell(row, "material");
    const uomRaw = cell(row, "uom");
    const sourceRaw = cell(row, "source");
    const skuRaw = cell(row, "sku");
    const nameRaw = cell(row, "product_name");
    const description = cell(row, "description");
    const hsn = cell(row, "hsn");
    const parentSkuRaw = cell(row, "parent sku");
    const color = cell(row, "color");
    const size = cell(row, "size");
    const fitting = cell(row, "fitting");
    const gender = cell(row, "gender");
    const weightRaw = cell(row, "weight");
    const lengthRaw = cell(row, "length");
    const widthRaw = cell(row, "width");
    const heightRaw = cell(row, "height");
    const lowStockRaw = cell(row, "Low stock amount");
    const backordersRaw = cell(row, "backorders allowed");
    const barcodeRaw = cell(row, "barcode");

    const categoryId = resolveLookupStrict(
      categoryRaw,
      lookups.categoryByLabel,
      rowNumber,
      "Category",
      strictErrors
    );
    const materialId = resolveLookupStrict(
      materialRaw,
      lookups.materialByLabel,
      rowNumber,
      "Material",
      strictErrors
    );
    const uomId = resolveLookupStrict(
      uomRaw,
      lookups.uomByLabel,
      rowNumber,
      "UOM",
      strictErrors,
      UOM_ALIASES
    );

    let source: "own" | "vendor" = "own";
    if (sourceRaw) {
      const normalized = sourceRaw.trim().toLowerCase();
      if (normalized === "own" || normalized === "vendor") {
        source = normalized;
      } else {
        strictErrors.push(`Row ${rowNumber}: Source "${sourceRaw}" is invalid.`);
      }
    }

    const weight = weightRaw ? asNumber(weightRaw) : null;
    const length = lengthRaw ? asNumber(lengthRaw) : null;
    const width = widthRaw ? asNumber(widthRaw) : null;
    const height = heightRaw ? asNumber(heightRaw) : null;
    const lowStockAmount = lowStockRaw ? asNumber(lowStockRaw) : null;
    const backordersAllowed = parseBooleanFlexible(backordersRaw);
    const barcode = normalizeBarcode(barcodeRaw);

    if (weightRaw && weight === null) {
      errors.push(`Row ${rowNumber}: Weight must be numeric.`);
    }
    if (lengthRaw && length === null) {
      errors.push(`Row ${rowNumber}: Length must be numeric.`);
    }
    if (widthRaw && width === null) {
      errors.push(`Row ${rowNumber}: Width must be numeric.`);
    }
    if (heightRaw && height === null) {
      errors.push(`Row ${rowNumber}: Height must be numeric.`);
    }
    if (lowStockRaw && lowStockAmount === null) {
      errors.push(`Row ${rowNumber}: Low stock amount must be numeric.`);
    }
    if (backordersRaw && backordersAllowed === null) {
      errors.push(`Row ${rowNumber}: backorders allowed must be yes/no or true/false.`);
    }

    // Validate name, description, sku, hsn, parent_sku, size to restrict symbols
    if (nameRaw) {
      const nameErr = getRuleValidationError('alphanumeric-spaces-hyphens', nameRaw);
      if (nameErr) errors.push(`Row ${rowNumber}: product_name: ${nameErr}`);
    }
    if (description) {
      const descErr = getRuleValidationError('alphanumeric-spaces-hyphens', description);
      if (descErr) errors.push(`Row ${rowNumber}: description: ${descErr}`);
    }
    if (skuRaw) {
      const skuErr = getRuleValidationError('alphanumeric-spaces-hyphens', skuRaw);
      if (skuErr) errors.push(`Row ${rowNumber}: sku: ${skuErr}`);
    }
    if (hsn) {
      const hsnErr = getRuleValidationError('alphanumeric-spaces-hyphens', hsn);
      if (hsnErr) errors.push(`Row ${rowNumber}: hsn: ${hsnErr}`);
    }
    if (parentSkuRaw) {
      const parentSkuErr = getRuleValidationError('alphanumeric-spaces-hyphens', parentSkuRaw);
      if (parentSkuErr) errors.push(`Row ${rowNumber}: parent sku: ${parentSkuErr}`);
    }
    if (size) {
      const sizeErr = getRuleValidationError('alphanumeric-spaces-hyphens', size);
      if (sizeErr) errors.push(`Row ${rowNumber}: size: ${sizeErr}`);
    }

    if (barcode) {
      try {
        validateBarcodeOrThrow(barcode);
      } catch (err: any) {
        errors.push(`Row ${rowNumber}: barcode: ${err.message}`);
      }
    }

    const parentSku = parentSkuRaw || skuRaw || `AUTO-${rowNumber}`;
    const parentKey = normalizeLookupKey(parentSku);

    const variantSku = skuRaw || buildVariantSku(parentSku, color, size, fitting);
    const imageUrls = splitImageUrls(imageUrlRaw);
    const imageIds = splitImageIds(imageIdRaw);
    //console.log("Detected headers:", Object.keys(rows[0]));
    if (!parentSkuRaw) {
      if (!nameRaw) {
        errors.push(`Row ${rowNumber}: product_name is required for parent rows.`);
        // console.log(`rownumber: ${rowNumber} missing product name for parent row with auto-generated SKU ${parentSku}`);
      }


      if (parents.has(parentKey)) {
        errors.push(`Row ${rowNumber}: Duplicate parent SKU "${parentSku}".`);
        return;
      }

      const parent: ParsedParent = {
        row: rowNumber,
        sku: parentSku,
        name: nameRaw,
        categoryId,
        materialId,
        uomId,
        source,
        hsn: hsn || null,
        description: description || null,
        weight,
        length,
        width,
        height,
        variants: [],
      };

      parent.variants.push({
        row: rowNumber,
        parentSku,
        sku: variantSku,
        color,
        size,
        fitting,
        gender,
        lowStockAmount,
        backordersAllowed: backordersAllowed ?? false,
        barcode,
        imageUrls,
        imageIds,
      });

      parents.set(parentKey, parent);
      return;
    }

    const parent = parents.get(parentKey);
    const variant: ParsedVariant = {
      row: rowNumber,
      parentSku,
      sku: variantSku,
      color,
      size,
      fitting,
      gender,
      lowStockAmount,
      backordersAllowed: backordersAllowed ?? false,
      barcode,
      imageUrls,
      imageIds,
    };

    if (parent) {
      if (!parent.name && nameRaw) parent.name = nameRaw;
      if (!parent.categoryId && categoryId) parent.categoryId = categoryId;
      if (!parent.materialId && materialId) parent.materialId = materialId;
      if (!parent.uomId && uomId) parent.uomId = uomId;
      if (!parent.hsn && hsn) parent.hsn = hsn;
      if (!parent.description && description) parent.description = description;
      if (parent.weight == null && weight != null) parent.weight = weight;
      if (parent.length == null && length != null) parent.length = length;
      if (parent.width == null && width != null) parent.width = width;
      if (parent.height == null && height != null) parent.height = height;
      parent.variants.push(variant);
    } else {
      orphanVariants.push(variant);
    }
  });

  const skuSet = new Map<string, number>();
  parents.forEach((parent) => {
    parent.variants.forEach((variant) => {
      const key = normalizeLookupKey(variant.sku);
      if (skuSet.has(key)) {
        errors.push(`Row ${variant.row}: Duplicate SKU "${variant.sku}".`);
      } else {
        skuSet.set(key, variant.row);
      }
    });
  });
  orphanVariants.forEach((variant) => {
    const key = normalizeLookupKey(variant.sku);
    if (skuSet.has(key)) {
      errors.push(`Row ${variant.row}: Duplicate SKU "${variant.sku}".`);
    } else {
      skuSet.set(key, variant.row);
    }
  });

  return {
    parents: [...parents.values()],
    orphanVariants,
    errors: [...errors, ...strictErrors],
    warnings,
  };
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "File is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const lookups = await loadLookups(client, schema);
    const parsed = await parseSheet(buffer, lookups);

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { success: false, errors: parsed.errors, warnings: parsed.warnings },
        { status: 400 }
      );
    }

    if (
        parsed.parents.length === 0 &&
        parsed.orphanVariants.length === 0
      ) {
        return NextResponse.json(
          {
            success: false,
            errors: ["No valid data found in file. Check template format."],
            warnings: parsed.warnings,
          },
          { status: 400 }
        );
      }

    const allSkus = [
      ...parsed.parents.flatMap((parent) => parent.variants.map((variant) => variant.sku)),
      ...parsed.orphanVariants.map((variant) => variant.sku),
    ];

    const duplicateErrors: string[] = [];

    const barcodeSet = new Set<string>();
    parsed.parents.forEach((parent) => {
      parent.variants.forEach((v) => {
        if (v.barcode) {
          if (barcodeSet.has(v.barcode.toLowerCase())) {
            duplicateErrors.push(`Row ${v.row}: Duplicate barcode "${v.barcode}" in upload.`);
          }
          barcodeSet.add(v.barcode.toLowerCase());
        }
      });
    });
    parsed.orphanVariants.forEach((v) => {
      if (v.barcode) {
        if (barcodeSet.has(v.barcode.toLowerCase())) {
          duplicateErrors.push(`Row ${v.row}: Duplicate barcode "${v.barcode}" in upload.`);
        }
        barcodeSet.add(v.barcode.toLowerCase());
      }
    });

    if (allSkus.length) {
      const existing = await client.query(
        `
          SELECT sku
          FROM "${schema}".product_variants
          WHERE sku = ANY($1::text[])
        `,
        [allSkus]
      );
      if (existing.rows.length > 0) {
        const dupes = existing.rows.map((row: { sku: string }) => row.sku);
        dupes.forEach((sku) => duplicateErrors.push(`SKU "${sku}" already exists.`));
      }
    }

    const allBarcodes = [
      ...parsed.parents.flatMap((parent) => parent.variants.map((variant) => variant.barcode).filter(Boolean)),
      ...parsed.orphanVariants.map((variant) => variant.barcode).filter(Boolean),
    ];

    if (allBarcodes.length) {
      const existingBarcodes = await client.query(
        `
          SELECT barcode
          FROM "${schema}".product_variants
          WHERE barcode = ANY($1::text[])
        `,
        [allBarcodes]
      );
      if (existingBarcodes.rows.length > 0) {
        const dupes = existingBarcodes.rows.map((row: { barcode: string }) => row.barcode);
        dupes.forEach((barcode) => duplicateErrors.push(`Barcode "${barcode}" already exists.`));
      }
    }

    if (duplicateErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          errors: duplicateErrors,
          warnings: parsed.warnings,
        },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    let existingParentMap = new Map<string, number>();
    if (parsed.orphanVariants.length) {
      const uniqueParentSkus = [...new Set(parsed.orphanVariants.map((variant) => variant.parentSku))];
      const parentRes = await client.query(
        `
          SELECT sku, product_id
          FROM "${schema}".product_variants
          WHERE sku = ANY($1::text[])
        `,
        [uniqueParentSkus]
      );
      existingParentMap = new Map(
        parentRes.rows.map((row: { sku: string; product_id: number }) => [row.sku, row.product_id])
      );

      parsed.orphanVariants.forEach((variant) => {
        if (!existingParentMap.has(variant.parentSku)) {
          parsed.errors.push(
            `Row ${variant.row}: Parent SKU "${variant.parentSku}" not found in upload or database.`
          );
        }
      });
    }

    if (parsed.errors.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, errors: parsed.errors, warnings: parsed.warnings },
        { status: 400 }
      );
    }

    const nextProductCode = async () => {
      const result = await client.query(
        `
          SELECT COALESCE(
            MAX(CAST(SUBSTRING(product_code FROM 4) AS INTEGER)),
            0
          ) AS max_code
          FROM "${schema}".products
          WHERE product_code ~ $1
        `,
        ["^PR-[0-9]+$"]
      );
      const maxCode = Number(result.rows[0]?.max_code || 0);
      let current = maxCode + 1;
      return () => `PR-${String(current++).padStart(3, "0")}`;
    };

    const getNextCode = await nextProductCode();
    let insertedProducts = 0;
    let insertedVariants = 0;

    const uniqueColors = new Set<string>();
    const uniqueFittings = new Set<string>();
    parsed.parents.forEach((p) => p.variants.forEach((v) => {
      if (v.color) uniqueColors.add(v.color);
      if (v.fitting) uniqueFittings.add(v.fitting);
    }));
    parsed.orphanVariants.forEach((v) => {
      if (v.color) uniqueColors.add(v.color);
      if (v.fitting) uniqueFittings.add(v.fitting);
    });

    for (const c of uniqueColors) {
      await client.query(`
        INSERT INTO "${schema}".product_colors (color_name, hex_code)
        VALUES ($1, '#000000')
        ON CONFLICT (color_name) DO NOTHING
      `, [c]);
    }
    const colorMapRes = await client.query(`SELECT id, color_name FROM "${schema}".product_colors`);
    const colorMap = new Map<string, number>();
    for (const r of colorMapRes.rows) {
      colorMap.set(String(r.color_name).toLowerCase(), Number(r.id));
    }

    for (const f of uniqueFittings) {
      await client.query(`
        INSERT INTO "${schema}".product_fittings (fitting_name)
        VALUES ($1)
        ON CONFLICT (fitting_name) DO NOTHING
      `, [f]);
    }
    const fittingMapRes = await client.query(`SELECT id, fitting_name FROM "${schema}".product_fittings`);
    const fittingMap = new Map<string, number>();
    for (const r of fittingMapRes.rows) {
      fittingMap.set(String(r.fitting_name).toLowerCase(), Number(r.id));
    }

    try {
      for (const group of parsed.parents) {
        const productCode = getNextCode();
        const productInsert = await client.query(
          `
            INSERT INTO "${schema}".products
              (product_code, name, category, material, uom, hsn_code, description, weight, length, width, height, source, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1)
            RETURNING id
          `,
          [
            productCode,
            group.name,
            group.categoryId,
            group.materialId,
            group.uomId,
            group.hsn,
            group.description,
            group.weight,
            group.length,
            group.width,
            group.height,
            group.source || "own",
          ]
        );
        const productId = productInsert.rows[0].id as number;
        insertedProducts += 1;

        for (const variant of group.variants) {
          const variantInsert = await client.query(
            `
              INSERT INTO "${schema}".product_variants
                (product_id, color_id, size, fitting_id, gender, sku, qty, low_stock_threshold, backorders_allowed, status, barcode)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
              RETURNING id, barcode
            `,
            [
              productId,
              variant.color ? (colorMap.get(variant.color.toLowerCase()) || null) : null,
              variant.size || null,
              variant.fitting ? (fittingMap.get(variant.fitting.toLowerCase()) || null) : null,
              variant.gender || null,
              variant.sku,
              0,
              variant.lowStockAmount ?? 5,
              variant.backordersAllowed,
              variant.barcode || null,
            ]
          );
          const variantId = variantInsert.rows[0].id as number;
          if (!variantInsert.rows[0].barcode) {
            await client.query(
              `
                UPDATE "${schema}".product_variants
                SET barcode = LPAD(id::text, 10, '0')
                WHERE id = $1
              `,
              [variantId]
            );
          }
          insertedVariants += 1;

          let order = 1;
          for (const [index, imageUrl] of variant.imageUrls.entries()) {
            const imageId = variant.imageIds[index] ?? null;
            //  console.log("Image id inserted:",imageId);
            await client.query(
              `
                INSERT INTO "${schema}".product_images
                  (product_id, variant_id, image_id, image_url, alt_text, is_primary, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
              `,
              [productId, variantId, imageId, imageUrl, null, order === 1, order]
            );
            order += 1;
          }
        }
      }

      for (const variant of parsed.orphanVariants) {
        const productId = existingParentMap.get(variant.parentSku);
        if (!productId) continue;

        const variantInsert = await client.query(
          `
            INSERT INTO "${schema}".product_variants
              (product_id, color_id, size, fitting_id, gender, sku, qty, low_stock_threshold, backorders_allowed, status, barcode)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
            RETURNING id, barcode
          `,
          [
            productId,
            variant.color ? (colorMap.get(variant.color.toLowerCase()) || null) : null,
            variant.size || null,
            variant.fitting ? (fittingMap.get(variant.fitting.toLowerCase()) || null) : null,
            variant.gender || null,
            variant.sku,
            0,
            variant.lowStockAmount ?? 5,
            variant.backordersAllowed,
            variant.barcode || null,
          ]
        );
        const variantId = variantInsert.rows[0].id as number;
        if (!variantInsert.rows[0].barcode) {
          await client.query(
            `
              UPDATE "${schema}".product_variants
              SET barcode = LPAD(id::text, 10, '0')
              WHERE id = $1
            `,
            [variantId]
          );
        }
        insertedVariants += 1;

        let order = 1;
        for (const [index, imageUrl] of variant.imageUrls.entries()) {
          const imageId = variant.imageIds[index] ?? null;
          // console.log("Image id inserted:",imageId);
          await client.query(
            `
              INSERT INTO "${schema}".product_images
                (product_id, variant_id, image_id, image_url, alt_text, is_primary, sort_order)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [productId, variantId, imageId, imageUrl, null, order === 1, order]
          );
          order += 1;
        }
      }
    } catch (importError: any) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: importError?.message || "Import failed",
          warnings: parsed.warnings,
        },
        { status: 400 }
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      inserted_products: insertedProducts,
      inserted_variants: insertedVariants,
      warnings: parsed.warnings,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to import products" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
