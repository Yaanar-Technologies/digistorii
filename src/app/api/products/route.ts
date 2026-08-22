//C:\Users\yanna\template_tailwind\src\app\api\products\route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { buildAutoSku, getTenantSchema } from "@/lib/tenant";
import { getNextProductCodeByType } from "@/lib/document-number-generator";
import {
  buildInternalBarcode,
  normalizeBarcode,
  validateBarcodeOrThrow,
} from "@/lib/product-barcode";
type VariantInput = {
  color_id?: number | null;
  color?: string;
  gender?: string | null;
  fitting_id?: number | null;
  size?: string;
  sku?: string;
  qty?: number;
  status?: string;
  low_stock_threshold?: any;
  backorders_allowed?: any;
  barcode?: string;
};

type ImageInput = {
  image_id?: number;
  image_url: string;
  alt_text?: string;
  level?: "product" | "variant";
  variantIndex?: number;
  is_primary?: boolean;
};

async function skuExists(
  client: any,
  schema: string,
  sku: string
): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM "${schema}".product_variants WHERE upper(sku) = upper($1) LIMIT 1`,
    [sku]
  );
  return res.rowCount > 0;
}

async function resolveUniqueSku(
  client: any,
  schema: string,
  baseSku: string,
  usedSkuKeys: Set<string>
): Promise<string> {
  let candidate = baseSku;
  let counter = 1;
  while (true) {
    const key = candidate.trim().toUpperCase();
    if (!usedSkuKeys.has(key) && !(await skuExists(client, schema, candidate))) {
      usedSkuKeys.add(key);
      return candidate;
    }
    candidate = `${baseSku}-${counter}`;
    counter += 1;
  }
}

async function barcodeExists(client: any, schema: string, barcode: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM "${schema}".product_variants WHERE barcode = $1 LIMIT 1`,
    [barcode]
  );
  return res.rowCount > 0;
}

const VARIANT_STATUSES = new Set(["draft", "active", "inactive"]);

function normalizeVariantStatus(value: any): "draft" | "active" | "inactive" {
  if (typeof value === "string" && VARIANT_STATUSES.has(value)) {
    return value as "draft" | "active" | "inactive";
  }
  return "draft";
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const params = req.nextUrl.searchParams;
    const nextCode = params.get("next_code");
    const search = params.get("search") || "";
    const barcode = normalizeBarcode(params.get("barcode") || "");
    const barcodeLookup = params.get("barcode_lookup") === "1";
    const category = params.get("category") || "";
    const source = params.get("source") || "";
    const status = params.get("status") || "";
    const type = params.get("type") || "";
    const moduleParam = params.get("module") || "";
    const { company, schema } = await getTenantSchema(req);
    const productTypeColumnRes = await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'products'
          AND column_name = 'product_type'
        LIMIT 1
      `,
      [schema]
    );
    const productTypeColumn = productTypeColumnRes.rowCount
      ? "product_type"
      : "type";

    if (nextCode === "1") {
      const typeParam = params.get("type") || "finished_good";
      const productCode = await getNextProductCodeByType(schema, typeParam);
      return NextResponse.json({ product_code: productCode });
    }

    if (barcodeLookup && barcode) {
      const result = await client.query(
        `
          SELECT
            p.id,
            p.product_code,
            p.name,
            p.${productTypeColumn} AS type,
            p.category,
            p.material,
            p.source,
            p.status,
            pv.id AS variant_id,
            pv.color_id,
            pv.size,
            pv.fitting_id,
            pv.gender,
            pv.sku,
            pv.barcode
          FROM "${schema}".product_variants pv
          INNER JOIN "${schema}".products p ON p.id = pv.product_id
          WHERE pv.barcode = $1
          LIMIT 1
        `,
        [barcode]
      );
      const matched = result.rows[0] || null;
      return NextResponse.json({
        found: (result.rowCount || 0) > 0,
        lookup_type: "barcode",
        barcode,
        product: matched,
        variant: matched
          ? {
            id: matched.variant_id,
            sku: matched.sku,
            color: matched.color,
            size: matched.size,
            fitting: matched.fitting,
            gender: matched.gender,
            barcode: matched.barcode,
          }
          : null,
      });
    }

    const values: Array<string | number> = [];
    const where: string[] = [];

    if (search.trim()) {
      values.push(`%${search.trim()}%`);
      values.push(`%${search.trim()}%`);
      where.push(`(p.name ILIKE $${values.length - 1} OR p.product_code ILIKE $${values.length})`);
    }
    if (category.trim()) {
      values.push(category.trim());
      where.push(`p.category = $${values.length}`);
    }
    if (source.trim()) {
      values.push(source.trim());
      where.push(`p.source = $${values.length}`);
    }
    if (type.trim()) {
      values.push(type.trim());
      where.push(`p.${productTypeColumn} = $${values.length}`);
    }
    if (moduleParam === "sales") {
      values.push("finished_good");
      where.push(`p.${productTypeColumn} = $${values.length}`);
    }
    if (status.trim()) {
      const normalized = status === "active" ? 1 : status === "archived" ? 2 : Number(status);
      if (Number.isFinite(normalized)) {
        values.push(normalized);
        where.push(`p.status = $${values.length}`);
      }
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const result = await client.query(
      `
        SELECT
          p.id,
          p.product_code,
          p.name,
          p.${productTypeColumn} AS product_type,
          p.category,
          p.material,
          p.source,
          p.status,
          p.${productTypeColumn} AS type,
          COUNT(v.id)::INT AS variants_count
        FROM "${schema}".products p
        LEFT JOIN "${schema}".product_variants v ON v.product_id = p.id
        ${whereClause}
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `,
      values
    );

    return NextResponse.json({ products: result.rows });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Failed to fetch products" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const body = await req.json();
    const productPayload = body?.product ?? body ?? {};
    // const company = String(productPayload.company || "").trim();
    const name = String(productPayload.name || "").trim();
    const category = String(productPayload.category || "").trim();
    const material = String(productPayload.material || "").trim();
    const uom = String(productPayload.uom || "").trim();
    const hsnCode = String(productPayload.hsn_code || "").trim();
    const description = String(productPayload.description || "").trim();
    const weight =
      productPayload.weight === null || productPayload.weight === undefined
        ? null
        : Number(productPayload.weight);
    const length =
      productPayload.length === null || productPayload.length === undefined
        ? null
        : Number(productPayload.length);
    const width =
      productPayload.width === null || productPayload.width === undefined
        ? null
        : Number(productPayload.width);
    const height =
      productPayload.height === null || productPayload.height === undefined
        ? null
        : Number(productPayload.height);
    const source = productPayload.source === "vendor" ? "vendor" : "own";

    const type =
      productPayload.type === "raw_material" || productPayload.type === "other"
        ? productPayload.type
        : "finished_good";
    const variantsInput = (Array.isArray(body?.variants)
      ? body.variants
      : productPayload.variants || []) as VariantInput[];
    const images = (productPayload.images || []) as ImageInput[];

    if (!name) {
      return NextResponse.json(
        { message: "Product name is required" },
        { status: 400 }
      );
    }
    const cleanedVariants = Array.isArray(variantsInput)
      ? variantsInput.filter(
        (variant) =>
          variant.color_id ||
          String(variant.size || "").trim() ||
          String(variant.sku || "").trim()
      )
      : [];

    if (type === "finished_good" && cleanedVariants.length === 0) {
      return NextResponse.json(
        { message: "At least one variant is required in api" },
        { status: 400 }
      );
    }


    const { company, schema } = await getTenantSchema(req);

    await client.query("BEGIN");

    const productCode = await getNextProductCodeByType(schema, type, client);
    const productResult = await client.query(
      `
        INSERT INTO "${schema}".products
          (product_code, name, category, material, uom, hsn_code, description, weight, length, width, height, type, source, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1)
        RETURNING id, product_code
      `,
      [
        productCode,
        name,
        category || null,
        material || null,
        uom || null,
        hsnCode || null,
        description || null,
        weight,
        length,
        width,
        height,
        type,
        source,
      ]
    );

    const productId = productResult.rows[0].id as number;
    const insertedVariantIds: number[] = [];
    const insertedVariants: Array<{ id: number; sku: string; barcode: string }> = [];

    const variantsToInsert: VariantInput[] =
      cleanedVariants.length > 0
        ? cleanedVariants
        : type === "finished_good"
          ? []
          : [
            {
              color: "NA",
              size: "NA",
              sku: "",
              qty: 0,
              low_stock_threshold: null,
              backorders_allowed: null,
            },
          ];

    const usedSkuKeys = new Set<string>();
    const usedBarcodeKeys = new Set<string>();

    for (const row of variantsToInsert) {
      const colorId = row.color_id || null;
      const gender = row.gender || null;
      const fittingId = row.fitting_id || null;
      const size = String(row.size || "").trim();
      const qty = Number(row.qty ?? 0);
      if (!Number.isFinite(qty)) {
        throw new Error("Variant qty must be a number");
      }

      const inputSku = String(row.sku || "").trim();
      const inputBarcode = normalizeBarcode(row.barcode);
      let sku = "";
      if (inputSku) {
        const key = inputSku.toUpperCase();
        if (usedSkuKeys.has(key)) {
          throw new Error(`Duplicate SKU "${inputSku}" in variants`);
        }
        if (await skuExists(client, schema, inputSku)) {
          throw new Error(`SKU "${inputSku}" already exists`);
        }
        usedSkuKeys.add(key);
        sku = inputSku;
      } else {
        const baseSku = buildAutoSku(productCode, colorId ? String(colorId) : "NA", size);
        sku = await resolveUniqueSku(client, schema, baseSku, usedSkuKeys);
      }

      const lowStockThreshold = row.low_stock_threshold !== undefined && row.low_stock_threshold !== null && (row.low_stock_threshold as any) !== "" ? Number(row.low_stock_threshold) : null;
      const backordersAllowed = row.backorders_allowed !== undefined && row.backorders_allowed !== null ? (row.backorders_allowed === true || (row.backorders_allowed as any) === "true") : null;
      const variantStatus = normalizeVariantStatus(row.status);
      if (inputBarcode) {
        validateBarcodeOrThrow(inputBarcode);
        if (usedBarcodeKeys.has(inputBarcode)) {
          throw new Error(`Duplicate barcode "${inputBarcode}" in variants`);
        }
        if (await barcodeExists(client, schema, inputBarcode)) {
          throw new Error(`Barcode "${inputBarcode}" already exists`);
        }
        usedBarcodeKeys.add(inputBarcode);
      }

      const insertedVariant = await client.query(
        `
          INSERT INTO "${schema}".product_variants
            (product_id, color_id, size, gender, fitting_id, sku, qty, low_stock_threshold, backorders_allowed, status, barcode)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, sku, barcode
        `,
        [
          productId,
          colorId,
          size || null,
          gender,
          fittingId,
          sku,
          qty,
          lowStockThreshold,
          backordersAllowed,
          variantStatus,
          inputBarcode || null,
        ]
      );
      const variantRow = insertedVariant.rows[0];
      const barcodeText = String(variantRow.barcode || "").trim();
      const finalBarcode = barcodeText
        ? barcodeText
        : String(
          (
            await client.query(
              `
                  UPDATE "${schema}".product_variants
                  SET barcode = $2
                  WHERE id = $1
                  RETURNING barcode
                `,
              [variantRow.id, buildInternalBarcode(Number(variantRow.id))]
            )
          ).rows[0]?.barcode || ""
        );
      insertedVariantIds.push(variantRow.id as number);
      insertedVariants.push({
        id: variantRow.id as number,
        sku: String(variantRow.sku || sku),
        barcode: finalBarcode,
      });
      console.log("inserted variants pro 290", insertedVariants);
    }


    const normalizeImageInput = (value: string) => {
      let path = String(value || "").trim();
      if (!path) return { filePath: "", imageUrl: "" };
      const uploadsIndex = path.toLowerCase().indexOf("/uploads/");
      if (uploadsIndex !== -1) {
        path = path.slice(uploadsIndex + "/uploads/".length);
      } else if (path.toLowerCase().startsWith("uploads/")) {
        path = path.slice("uploads/".length);
      } else if (path.startsWith("/")) {
        path = path.slice(1);
      }
      path = path.replace(/^\/+/, "");
      return { filePath: path, imageUrl: `/uploads/${path}` };
    };

    let primaryAssigned = false;
    for (const image of images) {
      const normalized = normalizeImageInput(image.image_url);
      if (!normalized.imageUrl) continue;

      let variantId: number | null = null;
      if (image.level === "variant" && Number.isInteger(image.variantIndex)) {
        const idx = Number(image.variantIndex);
        variantId = insertedVariantIds[idx] ?? null;
      }

      let resolvedImageId: number | null = null;
      if (Number.isFinite(Number(image.image_id))) {
        resolvedImageId = Number(image.image_id);
      } else if (normalized.filePath) {
        const imageRes = await client.query(
          `SELECT id FROM "${schema}".image_master WHERE file_path = $1 LIMIT 1`,
          [normalized.filePath]
        );
        if (imageRes.rows.length) {
          resolvedImageId = Number(imageRes.rows[0].id);
        }
      }

      const isPrimary = image.is_primary === true || (!primaryAssigned && variantId === null);
      await client.query(
        `
          INSERT INTO "${schema}".product_images
            (product_id, variant_id, image_id, image_url, alt_text, is_primary, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          productId,
          variantId,
          resolvedImageId,
          normalized.imageUrl,
          image.alt_text || null,
          isPrimary,
          1,
        ]
      );
      if (isPrimary) {
        primaryAssigned = true;
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({
      message: "Product created successfully",
      product: { id: productId, product_code: productCode, name, type },
      variants: insertedVariants.map((variant) => ({
        variant_id: variant.id,
        sku: variant.sku,
        barcode: variant.barcode,
        product_id: productId,
        product_name: name,
        product_code: productCode,
      })),
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { message: error.message || "Failed to create product" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
