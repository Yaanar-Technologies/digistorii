import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { getNextProductCodeByType } from "@/lib/document-number-generator";
import {
  buildInternalBarcode,
  normalizeBarcode,
  validateBarcodeOrThrow,
} from "@/lib/product-barcode";
import { getTenantSchema } from "@/lib/tenant";
import { normalizeSku } from "@/lib/product-utils";
import { getRuleValidationError } from "@/lib/formValidationRules";
import { getNextOpeningStockDocNo, postOpeningStockToLedger } from "@/lib/stockLedger";

type FieldKey =
  | "name"
  | "description"
  | "category"
  | "material"
  | "uom"
  | "hsn_code"
  | "weight"
  | "length"
  | "width"
  | "height"
  | "color"
  | "size"
  | "fitting"
  | "gender"
  | "parent_sku"
  | "sku"
  | "low_stock_threshold"
  | "backorders_allowed"
  | "barcode"
  | "qty"
  | "warehouse"
  | "locator";

type MappingConfig = {
  templateName?: string;
  sheetName: string;
  fields: Partial<Record<FieldKey, string>>;
};

type ParsedRow = {
  rowNumber: number;
  values: Partial<Record<FieldKey, string>>;
  errors: string[];
};

type ExistingSkuRecord = {
  sku: string;
  product_id: number;
};

type PreliminaryRow = {
  rowNumber: number;
  values: Partial<Record<FieldKey, string>>;
  errors: string[];
  categoryId: string | null;
  materialId: string | null;
  uomId: string | null;
  genderId: string | null;
  barcode: string | null;
  explicitSku: string;
  normalizedSku: string | null;
  parentSku: string;
  normalizedParentSku: string | null;
  finalSku: string | null;
  rootSku: string | null;
  rootType: "upload" | "existing" | null;
  rootProductId: number | null;
  rootRowNumber: number | null;
  isRootRow: boolean;
  initialQty: number;
  warehouseId: number | null;
  locatorId: number | null;
};

type ValidatedRow = {
  rowNumber: number;
  values: Partial<Record<FieldKey, string>>;
  categoryId: string | null;
  materialId: string | null;
  uomId: string | null;
  genderId: string | null;
  barcode: string | null;
  finalSku: string;
  rootSku: string;
  rootType: "upload" | "existing";
  rootProductId: number | null;
  rootRowNumber: number | null;
  isRootRow: boolean;
  initialQty: number;
  warehouseId: number | null;
  locatorId: number | null;
};

type ProductFamily = {
  rootSku: string;
  rootRow: ValidatedRow;
  rows: ValidatedRow[];
};

const REQUIRED_FIELDS: FieldKey[] = [
  "name",
  "description",
  "hsn_code",
  "color",
  "size",
  "fitting",
  "gender",
];

const IMPORTABLE_FIELDS: FieldKey[] = [
  "name",
  "description",
  "category",
  "material",
  "uom",
  "hsn_code",
  "weight",
  "length",
  "width",
  "height",
  "color",
  "size",
  "fitting",
  "gender",
  "parent_sku",
  "sku",
  "low_stock_threshold",
  "backorders_allowed",
  "barcode",
  "qty",
  "warehouse",
  "locator",
];

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeSkuRef(value: string): string {
  return value.trim().toUpperCase();
}

function asNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return null;
}

function buildVariantSku(parentSku: string, color: string, size: string, fitting: string) {
  const safeParent = normalizeSku(parentSku || "NA");
  const safeColor = normalizeSku(color || "NA");
  const safeSize = normalizeSku(size || "NA");
  const safeFitting = normalizeSku(fitting || "NA");
  return `${safeParent}-${safeColor}-${safeSize}-${safeFitting}`;
}

async function loadLookupMap(
  client: PoolClient,
  schema: string,
  table: string,
  idCol: string,
  labelCols: string[]
) {
  const query = `SELECT ${[idCol, ...labelCols].join(", ")} FROM "${schema}".${table}`;
  const res = await client.query(query);
  const map = new Map<string, string>();
  for (const row of res.rows) {
    for (const key of labelCols) {
      const value = stringValue(row[key]);
      if (value) map.set(value.toLowerCase(), String(row[idCol]));
    }
    if (labelCols.length > 1) {
      const combo = labelCols.map((key) => stringValue(row[key])).filter(Boolean).join(" - ");
      if (combo) map.set(combo.toLowerCase(), String(row[idCol]));
    }
  }
  return map;
}

function readWorkbook(buffer: Buffer) {
  return XLSX.read(buffer, { type: "buffer" });
}

function getRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function parseRows(rows: Record<string, unknown>[], mapping: MappingConfig): ParsedRow[] {
  return rows.map((row, index) => {
    const values: Partial<Record<FieldKey, string>> = {};
    const errors: string[] = [];

    for (const field of IMPORTABLE_FIELDS) {
      const header = mapping.fields[field];
      if (header) values[field] = stringValue(row[header]);
    }

    for (const field of REQUIRED_FIELDS) {
      if (!stringValue(values[field])) {
        errors.push(`${field} is required`);
      }
    }

    // Validate name, description, sku fields to allow only alphanumeric characters, spaces, hyphens, and commas
    const nameError = getRuleValidationError('alphanumeric-spaces-hyphens', values.name || '');
    if (nameError) errors.push(`name: ${nameError}`);
    const descriptionError = getRuleValidationError('alphanumeric-spaces-hyphens', values.description || '');
    if (descriptionError) errors.push(`description: ${descriptionError}`);
    if (values.sku) {
      const skuError = getRuleValidationError('alphanumeric-spaces-hyphens', values.sku);
      if (skuError) errors.push(`sku: ${skuError}`);
    }

    const sku = stringValue(values.sku);
    const parentSku = stringValue(values.parent_sku);
    if (!sku && !parentSku) {
      errors.push("Either sku or parent_sku is required");
    }
    if (sku && parentSku && normalizeSkuRef(sku) === normalizeSkuRef(parentSku)) {
      errors.push(`parent_sku cannot be the same as sku for "${sku}"`);
    }

    if (values.barcode) {
      try {
        validateBarcodeOrThrow(values.barcode);
      } catch (error: any) {
        errors.push(error.message);
      }
    }

    if (values.backorders_allowed && asBoolean(values.backorders_allowed) === null) {
      errors.push("backorders_allowed must be yes/no or true/false");
    }

    for (const numericField of ["weight", "length", "width", "height", "low_stock_threshold"] as FieldKey[]) {
      const value = stringValue(values[numericField]);
      if (value && asNumber(value) === null) {
        errors.push(`${numericField} must be numeric`);
      }
    }

    const qtyRaw = stringValue(values.qty);
    if (qtyRaw) {
      const qtyVal = asNumber(qtyRaw);
      if (qtyVal === null || qtyVal < 0) {
        errors.push("qty must be a valid non-negative number");
      } else if (qtyVal > 0 && (!stringValue(values.warehouse) || !stringValue(values.locator))) {
        errors.push("Warehouse and Locator are required when Quantity > 0");
      }
    }

    return { rowNumber: index + 2, values, errors };
  });
}

async function saveTemplate(client: PoolClient, schema: string, mapping: MappingConfig) {
  const templateName = stringValue(mapping.templateName);
  if (!templateName) return null;
  const res = await client.query(
    `
      INSERT INTO "${schema}".product_import_mapping_templates (template_name, sheet_name, mapping_json, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (template_name)
      DO UPDATE SET sheet_name = EXCLUDED.sheet_name, mapping_json = EXCLUDED.mapping_json, updated_at = NOW()
      RETURNING id
    `,
    [templateName, mapping.sheetName, JSON.stringify(mapping)]
  );
  return Number(res.rows[0]?.id || 0) || null;
}

function resolveLookupId(map: Map<string, string>, value: string, label: string, rowErrors: string[]) {
  if (!value) return null;
  const found = map.get(value.toLowerCase());
  if (!found) {
    rowErrors.push(`Unknown ${label}: ${value}`);
    return null;
  }
  return found;
}

async function loadExistingSkuMap(client: PoolClient, schema: string, skuRefs: string[]) {
  if (!skuRefs.length) return new Map<string, ExistingSkuRecord>();
  const res = await client.query(
    `
      SELECT upper(sku) AS sku_key, sku, product_id
      FROM "${schema}".product_variants
      WHERE upper(sku) = ANY($1::text[])
    `,
    [skuRefs]
  );
  return new Map<string, ExistingSkuRecord>(
    res.rows.map((row: { sku_key: string; sku: string; product_id: number }) => [
      String(row.sku_key),
      { sku: row.sku, product_id: Number(row.product_id) },
    ])
  );
}

async function validateRows(options: {
  client: PoolClient;
  schema: string;
  parsedRows: ParsedRow[];
}) {
  const { client, schema, parsedRows } = options;
  const categoryMap = await loadLookupMap(client, schema, "product_categories", "id", [
    "path_string",
    "category_name",
  ]);
  const materialMap = await loadLookupMap(client, schema, "product_materials", "id", [
    "material_code",
    "material_name",
  ]);
  const uomMap = await loadLookupMap(client, schema, "uom", "id", ["uom_name", "uom_code"]);

  const [warehousesRes, locatorsRes] = await Promise.all([
    client.query(
      `
        SELECT id, code, name
        FROM "${schema}".warehouses
        WHERE effective_to IS NULL OR effective_to >= CURRENT_DATE
      `
    ),
    client.query(
      `
        SELECT id, locator_name, warehouse_id
        FROM "${schema}".locators
        WHERE effective_to IS NULL OR effective_to >= CURRENT_DATE
      `
    ),
  ]);

  type WarehouseMeta = { id: number; code: string; name: string };
  type LocatorMeta = { id: number; locator_name: string; warehouse_id: number };

  const warehouseById = new Map<number, WarehouseMeta>();
  const warehouseByKey = new Map<string, WarehouseMeta>();
  for (const w of warehousesRes.rows) {
    const meta: WarehouseMeta = {
      id: Number(w.id),
      code: stringValue(w.code),
      name: stringValue(w.name),
    };
    warehouseById.set(meta.id, meta);
    if (meta.code) warehouseByKey.set(meta.code.toLowerCase(), meta);
    if (meta.name) warehouseByKey.set(meta.name.toLowerCase(), meta);
    if (meta.code && meta.name) {
      warehouseByKey.set(`${meta.code} - ${meta.name}`.toLowerCase(), meta);
      warehouseByKey.set(`${meta.name} - ${meta.code}`.toLowerCase(), meta);
    }
  }

  const locatorsList: LocatorMeta[] = locatorsRes.rows.map((l: any) => ({
    id: Number(l.id),
    locator_name: stringValue(l.locator_name),
    warehouse_id: Number(l.warehouse_id),
  }));

  const locatorMatchesValue = (locator: LocatorMeta, targetLower: string) => {
    const locatorName = locator.locator_name.toLowerCase();
    if (locatorName === targetLower) return true;
    const wh = warehouseById.get(locator.warehouse_id);
    if (!wh) return false;
    const candidates = [
      wh.name ? `${wh.name} - ${locator.locator_name}` : "",
      wh.code ? `${wh.code} - ${locator.locator_name}` : "",
      wh.code && wh.name ? `${wh.code} - ${wh.name} - ${locator.locator_name}` : "",
    ];
    return candidates.some((c) => c.toLowerCase() === targetLower);
  };

  const preliminaryRows: PreliminaryRow[] = [];
  const rowErrors = new Map<number, string[]>();
  const uploadSkuRows = new Map<string, PreliminaryRow[]>();
  const skuRefs = new Set<string>();
  const barcodeRows = new Map<string, PreliminaryRow[]>();
  const ALLOWED_GENDERS = ["male", "female", "transgender", "not specified"];
  const pushErrors = (rowNumber: number, errors: string[]) => {
    if (!errors.length) return;
    const current = rowErrors.get(rowNumber) || [];
    current.push(...errors);
    rowErrors.set(rowNumber, current);
  };

  for (const row of parsedRows) {
    const isEmpty = Object.values(row.values).every((value) => !stringValue(value));
    if (isEmpty) {
      pushErrors(row.rowNumber, row.errors);
      continue;
    }

    const errors = [...row.errors];
    const categoryId = resolveLookupId(categoryMap, stringValue(row.values.category), "category", errors);
    const materialId = resolveLookupId(materialMap, stringValue(row.values.material), "material", errors);
    const uomId = resolveLookupId(uomMap, stringValue(row.values.uom), "uom", errors);
    const genderStr = stringValue(row.values.gender).toLowerCase();
    const barcode = normalizeBarcode(row.values.barcode);
    const explicitSku = stringValue(row.values.sku);
    const normalizedSku = explicitSku ? normalizeSkuRef(explicitSku) : null;
    const parentSku = stringValue(row.values.parent_sku);
    const normalizedParentSku = parentSku ? normalizeSkuRef(parentSku) : null;
    if (genderStr && !ALLOWED_GENDERS.includes(genderStr)) {
      errors.push(`Unknown gender: ${row.values.gender}`);
    }

    const qtyNum = asNumber(stringValue(row.values.qty));
    const initialQty = qtyNum !== null && qtyNum > 0 ? qtyNum : 0;
    let resolvedWarehouseId: number | null = null;
    let resolvedLocatorId: number | null = null;

    if (initialQty > 0) {
      const warehouseStr = stringValue(row.values.warehouse);
      const locatorStr = stringValue(row.values.locator);
      if (warehouseStr && locatorStr) {
        const matchedWarehouse = warehouseByKey.get(warehouseStr.toLowerCase()) || null;
        if (!matchedWarehouse) {
          errors.push(`Unknown warehouse: ${warehouseStr}`);
        } else {
          resolvedWarehouseId = matchedWarehouse.id;
        }

        const locatorLower = locatorStr.toLowerCase();
        const matchingLocators = locatorsList.filter((l) => locatorMatchesValue(l, locatorLower));
        if (matchingLocators.length === 0) {
          errors.push(`Unknown locator: ${locatorStr}`);
        } else if (resolvedWarehouseId !== null) {
          const matchingForWarehouse = matchingLocators.find(
            (l) => l.warehouse_id === resolvedWarehouseId
          );
          if (!matchingForWarehouse) {
            errors.push(
              `Locator "${locatorStr}" does not belong to Warehouse "${warehouseStr}"`
            );
          } else {
            resolvedLocatorId = matchingForWarehouse.id;
          }
        }
      }
    }

    const nextRow: PreliminaryRow = {
      rowNumber: row.rowNumber,
      values: row.values,
      errors,
      categoryId,
      materialId,
      uomId,
      genderId: stringValue(row.values.gender),
      barcode,
      explicitSku,
      normalizedSku,
      parentSku,
      normalizedParentSku,
      finalSku: null,
      rootSku: null,
      rootType: null,
      rootProductId: null,
      rootRowNumber: null,
      isRootRow: false,
      initialQty,
      warehouseId: resolvedWarehouseId,
      locatorId: resolvedLocatorId,
    };

    preliminaryRows.push(nextRow);

    if (normalizedSku) {
      skuRefs.add(normalizedSku);
      uploadSkuRows.set(normalizedSku, [...(uploadSkuRows.get(normalizedSku) || []), nextRow]);
    }
    if (normalizedParentSku) {
      skuRefs.add(normalizedParentSku);
    }
    if (barcode) {
      barcodeRows.set(barcode, [...(barcodeRows.get(barcode) || []), nextRow]);
    }
  }

  const existingSkuMap = await loadExistingSkuMap(client, schema, [...skuRefs]);

  for (const rows of uploadSkuRows.values()) {
    if (rows.length > 1) {
      rows.forEach((row) => row.errors.push(`Duplicate SKU "${row.explicitSku}" in upload`));
    }
  }

  for (const row of preliminaryRows) {
    if (row.normalizedSku && existingSkuMap.has(row.normalizedSku)) {
      row.errors.push(`SKU "${row.explicitSku}" already exists`);
    }
  }

  for (const [barcode, rows] of barcodeRows.entries()) {
    if (rows.length > 1) {
      rows.forEach((row) => row.errors.push(`Duplicate barcode "${barcode}" in upload`));
      continue;
    }
    const existingBarcode = await client.query(
      `SELECT 1 FROM "${schema}".product_variants WHERE barcode = $1 LIMIT 1`,
      [barcode]
    );
    if ((existingBarcode.rowCount || 0) > 0) {
      rows[0].errors.push(`Barcode "${barcode}" already exists`);
    }
  }

  const resolving = new Set<number>();
  const resolveFamily = (row: PreliminaryRow): boolean => {
    if (row.rootType && row.rootSku) return true;
    if (resolving.has(row.rowNumber)) {
      row.errors.push("Circular parent_sku reference detected");
      return false;
    }

    if (!row.normalizedParentSku) {
      if (!row.normalizedSku) {
        row.errors.push("Either sku or parent_sku is required");
        return false;
      }
      row.rootType = "upload";
      row.rootSku = row.normalizedSku;
      row.rootProductId = null;
      row.rootRowNumber = row.rowNumber;
      row.isRootRow = true;
      return true;
    }

    resolving.add(row.rowNumber);

    const uploadParents = uploadSkuRows.get(row.normalizedParentSku) || [];
    if (uploadParents.length > 1) {
      row.errors.push(`parent_sku "${row.parentSku}" matches multiple rows in upload`);
      resolving.delete(row.rowNumber);
      return false;
    }

    if (uploadParents.length === 1) {
      const parentRow = uploadParents[0];
      const resolvedParent = resolveFamily(parentRow);
      if (!resolvedParent || !parentRow.rootType || !parentRow.rootSku) {
        row.errors.push(`parent_sku "${row.parentSku}" references a row with validation errors`);
        resolving.delete(row.rowNumber);
        return false;
      }
      row.rootType = parentRow.rootType;
      row.rootSku = parentRow.rootSku;
      row.rootProductId = parentRow.rootProductId;
      row.rootRowNumber = parentRow.rootRowNumber;
      row.isRootRow = false;
      resolving.delete(row.rowNumber);
      return true;
    }

    const existingParent = existingSkuMap.get(row.normalizedParentSku);
    if (existingParent) {
      row.rootType = "existing";
      row.rootSku = normalizeSkuRef(existingParent.sku);
      row.rootProductId = existingParent.product_id;
      row.rootRowNumber = null;
      row.isRootRow = false;
      resolving.delete(row.rowNumber);
      return true;
    }

    row.errors.push(`parent_sku "${row.parentSku}" not found in upload or database`);
    resolving.delete(row.rowNumber);
    return false;
  };

  for (const row of preliminaryRows) {
    resolveFamily(row);
  }

  for (const row of preliminaryRows) {
    if (row.errors.length > 0) {
      pushErrors(row.rowNumber, row.errors);
      continue;
    }

    row.finalSku =
      row.explicitSku ||
      buildVariantSku(
        row.parentSku || row.rootSku || "",
        stringValue(row.values.color),
        stringValue(row.values.size),
        stringValue(row.values.fitting)
      );
  }

  const finalSkuRows = new Map<string, PreliminaryRow[]>();
  for (const row of preliminaryRows) {
    if (row.errors.length > 0 || !row.finalSku) continue;
    const key = normalizeSkuRef(row.finalSku);
    finalSkuRows.set(key, [...(finalSkuRows.get(key) || []), row]);
  }

  for (const rows of finalSkuRows.values()) {
    if (rows.length > 1) {
      rows.forEach((row) => row.errors.push(`Duplicate SKU "${row.finalSku}" in upload`));
    }
  }

  const existingFinalSkus = await loadExistingSkuMap(client, schema, [...finalSkuRows.keys()]);
  for (const row of preliminaryRows) {
    if (row.errors.length > 0 || !row.finalSku) continue;
    const key = normalizeSkuRef(row.finalSku);
    if (row.normalizedSku && key === row.normalizedSku) continue;
    if (existingFinalSkus.has(key)) {
      row.errors.push(`SKU "${row.finalSku}" already exists`);
    }
  }

  const validRows: ValidatedRow[] = [];
  for (const row of preliminaryRows) {
    if (row.errors.length > 0 || !row.finalSku || !row.rootSku || !row.rootType) {
      pushErrors(row.rowNumber, row.errors);
      continue;
    }
    validRows.push({
      rowNumber: row.rowNumber,
      values: row.values,
      categoryId: row.categoryId,
      materialId: row.materialId,
      uomId: row.uomId,
      genderId: row.genderId,
      barcode: row.barcode,
      finalSku: row.finalSku,
      rootSku: row.rootSku,
      rootType: row.rootType,
      rootProductId: row.rootProductId,
      rootRowNumber: row.rootRowNumber,
      isRootRow: row.isRootRow,
      initialQty: row.initialQty,
      warehouseId: row.warehouseId,
      locatorId: row.locatorId,
    });
  }

  return {
    validRows,
    rowErrors: [...rowErrors.entries()]
      .map(([rowNumber, errors]) => ({
        rowNumber,
        errors: Array.from(new Set(errors)),
      }))
      .sort((a, b) => a.rowNumber - b.rowNumber),
  };
}

function groupNewFamilies(validRows: ValidatedRow[]) {
  const families = new Map<string, ProductFamily>();

  for (const row of validRows) {
    if (row.rootType !== "upload") continue;
    const existing = families.get(row.rootSku);
    if (existing) {
      existing.rows.push(row);
      if (row.isRootRow) existing.rootRow = row;
      continue;
    }
    families.set(row.rootSku, {
      rootSku: row.rootSku,
      rootRow: row,
      rows: [row],
    });
  }

  return families;
}

function getFamilyRowsInPriorityOrder(family: ProductFamily) {
  return [family.rootRow, ...family.rows.filter((row) => row.rowNumber !== family.rootRow.rowNumber)];
}

function getFamilyString(family: ProductFamily, field: FieldKey) {
  for (const row of getFamilyRowsInPriorityOrder(family)) {
    const value = stringValue(row.values[field]);
    if (value) return value;
  }
  return "";
}

function getFamilyNumber(family: ProductFamily, field: FieldKey) {
  for (const row of getFamilyRowsInPriorityOrder(family)) {
    const value = asNumber(stringValue(row.values[field]));
    if (value !== null) return value;
  }
  return null;
}

function getFamilyLookup(family: ProductFamily, field: "categoryId" | "materialId" | "uomId" | "genderId") {
  for (const row of getFamilyRowsInPriorityOrder(family)) {
    if (row[field]) return row[field];
  }
  return null;
}

async function importRows(options: {
  client: PoolClient;
  schema: string;
  company: string;
  fileName: string;
  mapping: MappingConfig;
  parsedRows: ParsedRow[];
}) {
  const { client, schema, company, fileName, mapping, parsedRows } = options;
  const { validRows, rowErrors } = await validateRows({ client, schema, parsedRows });
  const batchTemplateId = await saveTemplate(client, schema, mapping);
  const batchRes = await client.query(
    `
      INSERT INTO "${schema}".product_import_batches
        (sheet_name, mapping_template_id, source_file_name, total_rows, imported_products, imported_variants, status)
      VALUES ($1, $2, $3, $4, 0, 0, 'completed')
      RETURNING id
    `,
    [mapping.sheetName, batchTemplateId, fileName, parsedRows.length]
  );
  const batchId = Number(batchRes.rows[0].id);

  const uniqueColors = new Set<string>();
  const uniqueFittings = new Set<string>();
  for (const row of validRows) {
    const c = stringValue(row.values.color);
    if (c) uniqueColors.add(c);
    const f = stringValue(row.values.fitting);
    if (f) uniqueFittings.add(f);
  }

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

  const families = groupNewFamilies(validRows);
  const familyProductIds = new Map<string, number>();
  let productCount = 0;
  let variantCount = 0;
  const initialStockEntries: Array<{
    warehouseId: number;
    locatorId: number;
    variantId: number;
    sku: string;
    qty: number;
  }> = [];

  for (const family of families.values()) {
    const productCode = await getNextProductCodeByType(schema, "finished_good", client);
    const productRes = await client.query(
      `
        INSERT INTO "${schema}".products
          (product_code, name, description, category, material, uom, hsn_code, weight, length, width, height, type, source, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'finished_good', 'vendor', 1)
        RETURNING id
      `,
      [
        productCode,
        getFamilyString(family, "name"),
        getFamilyString(family, "description") || null,
        getFamilyLookup(family, "categoryId"),
        getFamilyLookup(family, "materialId"),
        getFamilyLookup(family, "uomId"),
        getFamilyString(family, "hsn_code") || null,
        getFamilyNumber(family, "weight"),
        getFamilyNumber(family, "length"),
        getFamilyNumber(family, "width"),
        getFamilyNumber(family, "height"),
      ]
    );
    const productId = Number(productRes.rows[0].id);
    familyProductIds.set(family.rootSku, productId);
    productCount += 1;

    await client.query(
      `INSERT INTO "${schema}".product_import_batch_items (batch_id, product_id, row_number, item_type) VALUES ($1, $2, $3, 'product')`,
      [batchId, productId, family.rootRow.rowNumber]
    );
  }

  for (const row of validRows) {
    const productId =
      row.rootType === "existing" ? row.rootProductId : familyProductIds.get(row.rootSku) ?? null;
    if (!productId) {
      rowErrors.push({
        rowNumber: row.rowNumber,
        errors: ["Unable to resolve product family for import"],
      });
      continue;
    }

    const colorStr = stringValue(row.values.color);
    const fittingStr = stringValue(row.values.fitting);
    const genderStr = row.genderId ? stringValue(row.genderId) : "Not Specified";

    const variantRes = await client.query(
      `
        INSERT INTO "${schema}".product_variants
          (product_id, color_id, size, gender, fitting_id, sku, qty, low_stock_threshold, backorders_allowed, status, barcode)
        VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, 'draft', $9)
        RETURNING id, barcode
      `,
      [
        productId,
        colorStr ? (colorMap.get(colorStr.toLowerCase()) || null) : null,
        stringValue(row.values.size) || null,
        genderStr,
        fittingStr ? (fittingMap.get(fittingStr.toLowerCase()) || null) : null,
        row.finalSku,
        asNumber(stringValue(row.values.low_stock_threshold)) ?? 5,
        asBoolean(stringValue(row.values.backorders_allowed)) ?? false,
        row.barcode || null,
      ]
    );

    const variantId = Number(variantRes.rows[0].id);
    if (!stringValue(variantRes.rows[0].barcode)) {
      await client.query(`UPDATE "${schema}".product_variants SET barcode = $2 WHERE id = $1`, [
        variantId,
        buildInternalBarcode(variantId),
      ]);
    }

    variantCount += 1;
    await client.query(
      `INSERT INTO "${schema}".product_import_batch_items (batch_id, product_id, variant_id, row_number, item_type) VALUES ($1, $2, $3, $4, 'variant')`,
      [batchId, productId, variantId, row.rowNumber]
    );

    if (row.initialQty > 0 && row.warehouseId && row.locatorId) {
      initialStockEntries.push({
        warehouseId: row.warehouseId,
        locatorId: row.locatorId,
        variantId,
        sku: row.finalSku,
        qty: row.initialQty,
      });
    }
  }

  let openingStockCount = 0;
  if (initialStockEntries.length > 0) {
    const stockGroups = new Map<string, typeof initialStockEntries>();
    for (const entry of initialStockEntries) {
      const groupKey = `${entry.warehouseId}-${entry.locatorId}`;
      stockGroups.set(groupKey, [...(stockGroups.get(groupKey) || []), entry]);
    }

    for (const groupEntries of stockGroups.values()) {
      const { warehouseId, locatorId } = groupEntries[0];
      const docNo = await getNextOpeningStockDocNo(client, schema);
      const statusValue = "Entered";
      const headerRes = await client.query(
        `
          INSERT INTO "${schema}".opening_stock
            (doc_no, date, description, warehouse_id, locator_id, status, created_at, updated_at)
          VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, NOW(), NOW())
          RETURNING id
        `,
        [docNo, "Initial stock via Product Excel Import", warehouseId, locatorId, statusValue]
      );
      const openingStockId = Number(headerRes.rows[0].id);

      const itemValues: Array<number | string> = [openingStockId, warehouseId, locatorId];
      const itemPlaceholders = groupEntries.map((entry, idx) => {
        const base = idx * 3;
        itemValues.push(entry.variantId, entry.sku, entry.qty);
        return `($1, $2, $3, $${base + 4}, $${base + 5}, $${base + 6}, NOW())`;
      });

      await client.query(
        `
          INSERT INTO "${schema}".opening_stock_items
            (opening_stock_id, warehouse_id, locator_id, product_id, sku, qty, created_at)
          VALUES ${itemPlaceholders.join(", ")}
        `,
        itemValues
      );

      await postOpeningStockToLedger(client, schema, company, openingStockId);
      openingStockCount += 1;
    }
  }

  await client.query(
    `UPDATE "${schema}".product_import_batches SET imported_products = $2, imported_variants = $3 WHERE id = $1`,
    [batchId, productCount, variantCount]
  );

  return {
    batchId,
    productCount,
    variantCount,
    uploadedRows: variantCount,
    openingStockCount,
    initialStockItemsCount: initialStockEntries.length,
    failedRows: rowErrors.length,
    rowErrors: rowErrors.sort((a, b) => a.rowNumber - b.rowNumber),
  };
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const templates = await client.query(
      `SELECT id, template_name, sheet_name, mapping_json, updated_at FROM "${schema}".product_import_mapping_templates ORDER BY updated_at DESC`
    );
    const lastBatch = await client.query(
      `SELECT id, source_file_name, imported_products, imported_variants, created_at FROM "${schema}".product_import_batches ORDER BY created_at DESC LIMIT 1`
    );
    return NextResponse.json({ templates: templates.rows, lastBatch: lastBatch.rows[0] || null });
  } catch (error: any) {
    return NextResponse.json({ message: error.message || "Failed to load import metadata" }, { status: 400 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    const form = await req.formData();
    const action = stringValue(form.get("action") || "parse");

    if (action === "undo") {
      await client.query("BEGIN");
      const batchRes = await client.query(
        `SELECT id FROM "${schema}".product_import_batches ORDER BY created_at DESC LIMIT 1`
      );
      const batchId = Number(batchRes.rows[0]?.id || 0);
      if (!batchId) throw new Error("No import batch available to undo");

      const [categoriesRes, materialsRes, uomsRes] = await Promise.all([
        client.query(
          `
            SELECT path_string, category_name
            FROM "${schema}".product_categories
            ORDER BY path_string ASC NULLS LAST, category_name ASC
          `
        ),
        client.query(
          `
            SELECT material_code, material_name
            FROM "${schema}".product_materials
            ORDER BY material_name ASC
          `
        ),
        client.query(
          `
            SELECT uom_code, uom_name
            FROM "${schema}".uom
            ORDER BY uom_name ASC
          `
        )

      ]);

      const createdProductsRes = await client.query(
        `
          SELECT DISTINCT product_id
          FROM "${schema}".product_import_batch_items
          WHERE batch_id = $1
            AND item_type = 'product'
            AND product_id IS NOT NULL
        `,
        [batchId]
      );
      const createdProductIds = createdProductsRes.rows.map((row) => Number(row.product_id)).filter(Boolean);

      const createdVariantsRes = await client.query(
        `
          SELECT DISTINCT variant_id, product_id
          FROM "${schema}".product_import_batch_items
          WHERE batch_id = $1
            AND item_type = 'variant'
            AND variant_id IS NOT NULL
        `,
        [batchId]
      );

      const existingProductVariantIds = createdVariantsRes.rows
        .filter((row) => !createdProductIds.includes(Number(row.product_id)))
        .map((row) => Number(row.variant_id))
        .filter(Boolean);

      if (existingProductVariantIds.length) {
        await client.query(
          `DELETE FROM "${schema}".product_variants WHERE id = ANY($1::bigint[])`,
          [existingProductVariantIds]
        );
      }

      if (createdProductIds.length) {
        await client.query(`DELETE FROM "${schema}".products WHERE id = ANY($1::bigint[])`, [createdProductIds]);
      }

      await client.query(`DELETE FROM "${schema}".product_import_batches WHERE id = $1`, [batchId]);
      await client.query("COMMIT");
      return NextResponse.json({ success: true, message: "Last import undone" });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "File is required" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = readWorkbook(buffer);

    if (action === "parse") {
      const uomOptions = (await client.query(`SELECT uom_code, uom_name FROM "${schema}".uom`)).rows
        .map((row: { uom_code: string | null; uom_name: string | null }) => {
          const code = String(row.uom_code || "").trim();
          const name = String(row.uom_name || "").trim();
          if (code && name) return `${code} - ${name}`;
          return name || code || "";
        })
        .filter(Boolean);

      const sheets = workbook.SheetNames.map((sheetName) => {
        const rows = getRows(workbook, sheetName);
        const headers = rows[0] ? Object.keys(rows[0]) : [];
        return {
          sheetName,
          headers,
          previewRows: rows.slice(0, 5),
        };
      });
      return NextResponse.json({
        success: true,
        sheets,
        requiredFields: REQUIRED_FIELDS,
        fields: IMPORTABLE_FIELDS,
        lookups: { uom: uomOptions }
      });
    }

    const mapping = JSON.parse(String(form.get("mapping") || "{}")) as MappingConfig;
    if (!mapping.sheetName) {
      return NextResponse.json({ message: "sheetName is required in mapping" }, { status: 400 });
    }
    const rows = getRows(workbook, mapping.sheetName);
    const parsedRows = parseRows(rows, mapping);

    if (action === "preview") {
      const validation = await validateRows({ client, schema, parsedRows });
      return NextResponse.json({
        success: validation.rowErrors.length === 0,
        totalRows: parsedRows.length,
        validRows: validation.validRows.length,
        failedRows: validation.rowErrors.length,
        previewRows: parsedRows.slice(0, 10),
        rowErrors: validation.rowErrors,
      });
    }

    if (action === "import") {
      await client.query("BEGIN");
      const result = await importRows({
        client,
        schema,
        company,
        fileName: file.name,
        mapping,
        parsedRows,
      });
      if (result.variantCount === 0 && result.rowErrors.length > 0) {
        throw new Error(`Upload failed. 0 rows uploaded and ${result.rowErrors.length} row(s) failed.`);
      }
      await client.query("COMMIT");
      const openingStockNote =
        result.openingStockCount > 0
          ? ` Created ${result.openingStockCount} opening stock entry/entries for ${result.initialStockItemsCount} variant(s).`
          : "";
      return NextResponse.json({
        success: result.rowErrors.length === 0,
        batchId: result.batchId,
        productCount: result.productCount,
        variantCount: result.variantCount,
        uploadedRows: result.uploadedRows,
        openingStockCount: result.openingStockCount,
        initialStockItemsCount: result.initialStockItemsCount,
        failedRows: result.failedRows,
        message:
          result.rowErrors.length > 0
            ? `Uploaded ${result.uploadedRows} row(s) as ${result.productCount} product(s) and ${result.variantCount} variant(s).${openingStockNote} ${result.failedRows} row(s) failed.`
            : `Uploaded ${result.uploadedRows} row(s) as ${result.productCount} product(s) and ${result.variantCount} variant(s).${openingStockNote}`,
        rowErrors: result.rowErrors,
      });
    }

    return NextResponse.json({ message: `Unsupported action "${action}"` }, { status: 400 });
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({ message: error.message || "Failed to import products" }, { status: 400 });
  } finally {
    client.release();
  }
}
