import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { buildAutoSku, getTenantSchema } from "@/lib/tenant";
import {
  buildInternalBarcode,
  normalizeBarcode,
  validateBarcodeOrThrow,
} from "@/lib/product-barcode";

type VariantInput = {
  id?: number | string;
  color_id?: number | null;
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
  id?: number;
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
  sku: string,
  excludeProductId?: number
): Promise<boolean> {
  if (excludeProductId) {
    const res = await client.query(
      `SELECT 1 FROM "${schema}".product_variants WHERE upper(sku) = upper($1) AND product_id <> $2 LIMIT 1`,
      [sku, excludeProductId]
    );
    return res.rowCount > 0;
  }
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
  usedSkuKeys: Set<string>,
  excludeProductId?: number
): Promise<string> {
  let candidate = baseSku;
  let counter = 1;
  while (true) {
    const key = candidate.trim().toUpperCase();
    if (
      !usedSkuKeys.has(key) &&
      !(await skuExists(client, schema, candidate, excludeProductId))
    ) {
      usedSkuKeys.add(key);
      return candidate;
    }
    candidate = `${baseSku}-${counter}`;
    counter += 1;
  }
}

async function barcodeExists(
  client: any,
  schema: string,
  barcode: string,
  excludeVariantId?: number
): Promise<boolean> {
  if (excludeVariantId) {
    const res = await client.query(
      `SELECT 1 FROM "${schema}".product_variants WHERE barcode = $1 AND id <> $2 LIMIT 1`,
      [barcode, excludeVariantId]
    );
    return res.rowCount > 0;
  }
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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    // const params = req.nextUrl.searchParams;
    // const company = params.get("company") || "";
    // const schema = await getTenantSchemaForCompany(client, company);
    const { id } = await context.params;
    const { company, schema } = await getTenantSchema(req);
    console.log("GET Product -Schema:",schema);
    const productResult = await client.query(
      `SELECT * FROM "${schema}".products WHERE id = $1`,
      [id]
    );
    if (!productResult.rows.length) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }

    const variantsResult = await client.query(
      `SELECT * FROM "${schema}".product_variants WHERE product_id = $1 ORDER BY id ASC`,
      [id]
    );
    const imagesResult = await client.query(
      `SELECT * FROM "${schema}".product_images WHERE product_id = $1 ORDER BY id ASC`,
      [id]
    );

    return NextResponse.json({
      product: productResult.rows[0],
      variants: variantsResult.rows,
      images: imagesResult.rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { message:  "Failed to fetch product in get " },
      { status: 400 }
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
  try {
    const { id } = await context.params;
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
    const status = Number(productPayload.status) === 2 ? 2 : 1;
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
        { message: "At least one variant is required in api id " },
        { status: 400 }
      );
    }

    const { company, schema } = await getTenantSchema(req);
    

    await client.query("BEGIN");

    const productResult = await client.query(
      `SELECT product_code FROM "${schema}".products WHERE id = $1`,
      [id]
    );
    if (!productResult.rows.length) {
      throw new Error("Product not found");
    }
    const productCode = productResult.rows[0].product_code as string;

    await client.query(
      `
        UPDATE "${schema}".products
        SET name = $1,
            category = $2,
            material = $3,
            uom = $4,
            hsn_code = $5,
            description = $6,
            weight = $7,
            length = $8,
            width = $9,
            height = $10,
            type = $11,
            source = $12,
            status = $13,
            updated_at = NOW()
        WHERE id = $14
      `,
      [
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
        status,
        id,
      ]
    );

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

    const existingVariantsRes = await client.query(
      `SELECT id, sku, color_id, gender, fitting_id, size, status, barcode FROM "${schema}".product_variants WHERE product_id = $1`,
      [id]
    );
    const existingVariantsById = new Map<
      number,
      { sku: string; color_id: number | null; gender: string | null; fitting_id: number | null; size: string; status: string; barcode: string }
    >();
    const existingSkuMap = new Map<string, number>();
    existingVariantsRes.rows.forEach(
      (row: { id: number; sku: string; color_id: number; gender: string; fitting_id: number; size: string; status: string; barcode: string }) => {
      const sku = String(row.sku || "");
        existingVariantsById.set(Number(row.id), {
          sku,
          color_id: row.color_id == null ? null : Number(row.color_id),
          gender: row.gender || null,
          fitting_id: row.fitting_id || null,
          size: String(row.size || ""),
          status: String(row.status || "draft"),
          barcode: String(row.barcode || ""),
        });
      if (sku) existingSkuMap.set(sku.toUpperCase(), Number(row.id));
    }
    );

    const variantsPayload = cleanedVariants;
    console.log("variantpayloads",variantsPayload);
    console.log("variantinput",variantsInput);
    const payloadVariantIds: number[] = [];
    const variantIdByIndex: number[] = [];
    const usedSkuKeys = new Set<string>();
    const usedBarcodeKeys = new Set<string>();
    const claimedExistingVariantIds = new Set<number>();

    for (const row of variantsPayload) {
      let payloadId = Number((row as VariantInput).id);
      console.log("Variant id",payloadId);
      let isExisting = Number.isFinite(payloadId) && existingVariantsById.has(payloadId);
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
      if (!isExisting && inputSku) {
        const matchId = existingSkuMap.get(inputSku.toUpperCase());
        if (matchId && !claimedExistingVariantIds.has(matchId)) {
          payloadId = matchId;
          isExisting = true;
        }
      }
      const existingVariant = isExisting ? existingVariantsById.get(payloadId) : undefined;
      const existingSku = existingVariant?.sku || "";
      const existingBarcode = String((existingVariant as any)?.barcode || "");
      let sku = inputSku || existingSku;

      if (inputSku) {
        const key = inputSku.toUpperCase();
        if (usedSkuKeys.has(key)) {
          throw new Error(`Duplicate SKU "${inputSku}" in variants`);
        }
        const existingOwnerId = existingSkuMap.get(key);
        if (existingOwnerId && existingOwnerId !== payloadId) {
          throw new Error(`SKU "${inputSku}" already exists`);
        }
        if (!existingOwnerId && (await skuExists(client, schema, inputSku, Number(id)))) {
          throw new Error(`SKU "${inputSku}" already exists`);
        }
        usedSkuKeys.add(key);
      }

      if (!sku) {
        const baseSku = buildAutoSku(productCode, colorId ? String(colorId) : "NA", size);
        sku = await resolveUniqueSku(client, schema, baseSku, usedSkuKeys, Number(id));
      } else {
        usedSkuKeys.add(sku.toUpperCase());
      }

      if (isExisting && existingVariant) {
        const normalizedColorId = colorId;
        const normalizedSize = size;
        const normalizedSku = inputSku || existingSku;
        console.log({
    incoming: normalizedColorId,
    existing: existingVariant.color_id,
    incomingType: typeof normalizedColorId,
    existingType: typeof existingVariant.color_id,
});

      }

      const variantStatus = normalizeVariantStatus(
        row.status ?? (existingVariant ? existingVariant.status : "draft")
      );
      const lowStockThreshold = row.low_stock_threshold !== undefined && row.low_stock_threshold !== null && (row.low_stock_threshold as any) !== "" ? Number(row.low_stock_threshold) : null;
      const backordersAllowed = row.backorders_allowed !== undefined && row.backorders_allowed !== null ? (row.backorders_allowed === true || (row.backorders_allowed as any) === "true") : null;
      const finalBarcode = inputBarcode || existingBarcode;
      if (finalBarcode) {
        validateBarcodeOrThrow(finalBarcode);
        if (usedBarcodeKeys.has(finalBarcode)) {
          throw new Error(`Duplicate barcode "${finalBarcode}" in variants`);
        }
        if (await barcodeExists(client, schema, finalBarcode, isExisting ? payloadId : undefined)) {
          throw new Error(`Barcode "${finalBarcode}" already exists`);
        }
        usedBarcodeKeys.add(finalBarcode);
      }
       console.log("existing",isExisting);
       
      if (isExisting) {
        claimedExistingVariantIds.add(payloadId);
        await client.query(
          `
            UPDATE "${schema}".product_variants
            SET low_stock_threshold = $1,
                backorders_allowed = $2,
                status = $3,
                barcode = $4,
                updated_at = NOW()
            WHERE id = $5
          `,
          [
            lowStockThreshold,
            backordersAllowed,
            variantStatus,
            finalBarcode || buildInternalBarcode(payloadId),
            payloadId,
          ]
        );
        payloadVariantIds.push(payloadId);
        variantIdByIndex.push(payloadId);
        console.log("updated values variants:",variantIdByIndex);
      } else {
        const insertedVariant = await client.query(
          `
            INSERT INTO "${schema}".product_variants
              (product_id, color_id, gender, fitting_id, size, sku, qty, low_stock_threshold, backorders_allowed, status, barcode)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, barcode
          `,
          [
            id,
            colorId,
            gender,
            fittingId,
            size || null,
            sku,
            qty,
            lowStockThreshold,
            backordersAllowed,
            variantStatus,
            finalBarcode || null,
          ]
        );
        const newId = insertedVariant.rows[0].id as number;
        if (!String(insertedVariant.rows[0].barcode || "").trim()) {
          await client.query(
            `
              UPDATE "${schema}".product_variants
              SET barcode = $2
              WHERE id = $1
            `,
            [newId, buildInternalBarcode(newId)]
          );
        }
        payloadVariantIds.push(newId);
        variantIdByIndex.push(newId);
        console.log("inserted variants line 359",variantIdByIndex);
      }
    }

    if (payloadVariantIds.length) {
      await client.query(
        `DELETE FROM "${schema}".product_variants WHERE product_id = $1 AND id NOT IN (${payloadVariantIds
          .map((_, i) => `$${i + 2}`)
          .join(", ")})`,
        [id, ...payloadVariantIds]
      );
    } else {
      await client.query(`DELETE FROM "${schema}".product_variants WHERE product_id = $1`, [id]);
    }

    const existingImagesRes = await client.query(
      `SELECT id FROM "${schema}".product_images WHERE product_id = $1`,
      [id]
    );
    const existingImageIds = new Set<number>(
      existingImagesRes.rows.map((row: { id: number }) => Number(row.id))
    );

    const payloadImageIds: number[] = [];
    let primaryAssigned = false;

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      console.log("image:",image);
      const rawUrl = String(image.image_url || "").trim();
      if (!rawUrl) continue;

      const normalized = normalizeImageInput(rawUrl);
      if (!normalized.filePath) continue;

      let variantId: number | null = null;
      if (image.level === "variant" && Number.isInteger(image.variantIndex)) {
        const idx = Number(image.variantIndex);
        variantId = variantIdByIndex[idx] ?? null;
      }

      let resolvedImageId: number | null = null;
      if (Number.isFinite(Number(image.image_id))) {
        resolvedImageId = Number(image.image_id);
      } else {
        const imageRes = await client.query(
          `SELECT id FROM "${schema}".image_master WHERE file_path = $1 LIMIT 1`,
          [normalized.filePath]
        );
        if (imageRes.rows.length) {
          resolvedImageId = Number(imageRes.rows[0].id);
        }
      }

      const isPrimary = image.is_primary === true || (!primaryAssigned && variantId === null);
      const sortOrder = index + 1;
      const imageRecordId = Number((image as ImageInput).id);
      console.log("imagerecord id",imageRecordId);

      if (Number.isFinite(imageRecordId) && existingImageIds.has(imageRecordId)) {
        await client.query(
          `
            UPDATE "${schema}".product_images
            SET variant_id = $1,
                image_id = $2,
                image_url = $3,
                alt_text = $4,
                is_primary = $5,
                sort_order = $6
            WHERE id = $7
          `,
          [
            variantId,
            resolvedImageId,
            normalized.imageUrl,
            image.alt_text || null,
            isPrimary,
            sortOrder,
            imageRecordId,
          ]
        );
        payloadImageIds.push(imageRecordId);
        console.log("updated images info 439:",payloadImageIds);
      } else {
        const insertedImage = await client.query(
          `
            INSERT INTO "${schema}".product_images
              (product_id, variant_id, image_id, image_url, alt_text, is_primary, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
          `,
          [
            id,
            variantId,
            resolvedImageId,
            normalized.imageUrl,
            image.alt_text || null,
            isPrimary,
            sortOrder,
          ]
        );
        payloadImageIds.push(insertedImage.rows[0].id as number);
        console.log("inserted image info 459:",payloadImageIds);
      }

      if (isPrimary) primaryAssigned = true;
    }

    if (payloadImageIds.length) {
      await client.query(
        `DELETE FROM "${schema}".product_images WHERE product_id = $1 AND id NOT IN (${payloadImageIds
          .map((_, i) => `$${i + 2}`)
          .join(", ")})`,
        [id, ...payloadImageIds]
      );
    } else {
      await client.query(`DELETE FROM "${schema}".product_images WHERE product_id = $1`, [id]);
    }

    await client.query("COMMIT");
    return NextResponse.json({ message: "Product updated successfully" });
  } catch (error: any) {
  await client.query("ROLLBACK");

  console.error("PUT PRODUCT ERROR");
  console.error(error);
  console.error(error.message);
  console.error(error.stack);

  return NextResponse.json(
    {
      message: error.message,
      detail: error
    },
    { status: 400 }
  );
} finally {
    client.release();
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect();
  try {
    const { id } = await context.params;
    // const company = req.nextUrl.searchParams.get("company") || "";

    const { company, schema } = await getTenantSchema(req);
    

    await client.query("BEGIN");
    await client.query(
      `UPDATE "${schema}".products SET status = 2, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await client.query(
      `UPDATE "${schema}".product_variants SET status = 'inactive', updated_at = NOW() WHERE product_id = $1`,
      [id]
    );
    await client.query("COMMIT");

    return NextResponse.json({ message: "Product marked as inactive successfully" });
  } catch (error: any) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { message: error.message || "Failed to mark product as inactive" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
