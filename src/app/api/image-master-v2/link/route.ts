import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export const runtime = "nodejs";

type VariantCandidate = {
  variant_id: number;
  product_id: number;
  sku: string;
  barcode: string | null;
  product_name: string;
};

type UnlinkedImageRow = {
  id: number;
  filename: string;
  file_path: string;
};

type AutoMatchItem = {
  image_id: number;
  filename: string;
  file_path: string;
  product_id: number;
  variant_id: number;
  sku: string;
  barcode: string | null;
  product_name: string;
  match_type: "barcode" | "sku_exact" | "sku_prefix" | "barcode_prefix";
  match_value: string;
};

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim();
}

function stripVariantImageSuffix(stem: string): string {
  return stem.replace(/(?:[_-]\d+|\(\d+\))$/, "").trim();
}

function findBestVariantMatch(
  filename: string,
  variants: VariantCandidate[],
  skuExactMap: Map<string, VariantCandidate>,
  barcodeExactMap: Map<string, VariantCandidate>,
  sortedSkuCandidates: Array<{ key: string; variant: VariantCandidate }>,
  sortedBarcodeCandidates: Array<{ key: string; variant: VariantCandidate }>
): Omit<AutoMatchItem, "image_id" | "filename" | "file_path"> | null {
  const stem = stripExtension(filename);
  if (!stem) return null;

  const stemLower = stem.toLowerCase();
  const stemNoSuffixLower = stripVariantImageSuffix(stem).toLowerCase();

  // 1. Exact barcode match
  const exactBarcode = barcodeExactMap.get(stemLower);
  if (exactBarcode) {
    return {
      product_id: exactBarcode.product_id,
      variant_id: exactBarcode.variant_id,
      sku: exactBarcode.sku,
      barcode: exactBarcode.barcode,
      product_name: exactBarcode.product_name,
      match_type: "barcode",
      match_value: exactBarcode.barcode || stem,
    };
  }

  // 2. Exact SKU match
  const exactSku = skuExactMap.get(stemLower);
  if (exactSku) {
    return {
      product_id: exactSku.product_id,
      variant_id: exactSku.variant_id,
      sku: exactSku.sku,
      barcode: exactSku.barcode,
      product_name: exactSku.product_name,
      match_type: "sku_exact",
      match_value: exactSku.sku,
    };
  }

  // 3. Barcode with _1 / -1 suffix
  if (stemNoSuffixLower && stemNoSuffixLower !== stemLower) {
    const barcodeSuffixMatch = barcodeExactMap.get(stemNoSuffixLower);
    if (barcodeSuffixMatch) {
      return {
        product_id: barcodeSuffixMatch.product_id,
        variant_id: barcodeSuffixMatch.variant_id,
        sku: barcodeSuffixMatch.sku,
        barcode: barcodeSuffixMatch.barcode,
        product_name: barcodeSuffixMatch.product_name,
        match_type: "barcode_prefix",
        match_value: barcodeSuffixMatch.barcode || stemNoSuffixLower,
      };
    }

    const skuSuffixMatch = skuExactMap.get(stemNoSuffixLower);
    if (skuSuffixMatch) {
      return {
        product_id: skuSuffixMatch.product_id,
        variant_id: skuSuffixMatch.variant_id,
        sku: skuSuffixMatch.sku,
        barcode: skuSuffixMatch.barcode,
        product_name: skuSuffixMatch.product_name,
        match_type: "sku_prefix",
        match_value: skuSuffixMatch.sku,
      };
    }
  }

  // 4. Prefix match (SKU_... or SKU-... or barcode_... or barcode-...) using longest key first
  for (const candidate of sortedSkuCandidates) {
    if (
      stemLower.startsWith(`${candidate.key}_`) ||
      stemLower.startsWith(`${candidate.key}-`)
    ) {
      return {
        product_id: candidate.variant.product_id,
        variant_id: candidate.variant.variant_id,
        sku: candidate.variant.sku,
        barcode: candidate.variant.barcode,
        product_name: candidate.variant.product_name,
        match_type: "sku_prefix",
        match_value: candidate.variant.sku,
      };
    }
  }

  for (const candidate of sortedBarcodeCandidates) {
    if (
      stemLower.startsWith(`${candidate.key}_`) ||
      stemLower.startsWith(`${candidate.key}-`)
    ) {
      return {
        product_id: candidate.variant.product_id,
        variant_id: candidate.variant.variant_id,
        sku: candidate.variant.sku,
        barcode: candidate.variant.barcode,
        product_name: candidate.variant.product_name,
        match_type: "barcode_prefix",
        match_value: candidate.variant.barcode || candidate.key,
      };
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const idsParam = req.nextUrl.searchParams.get("image_ids") || "";
    const filterIds = idsParam
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    const imagesQuery = filterIds.length
      ? client.query<UnlinkedImageRow>(
          `
            SELECT im.id, im.filename, im.file_path
            FROM "${schema}".image_master im
            WHERE im.id = ANY($1::int[])
              AND NOT EXISTS (
                SELECT 1 FROM "${schema}".product_images pi WHERE pi.image_id = im.id
              )
            ORDER BY im.id ASC
          `,
          [filterIds]
        )
      : client.query<UnlinkedImageRow>(
          `
            SELECT im.id, im.filename, im.file_path
            FROM "${schema}".image_master im
            WHERE NOT EXISTS (
              SELECT 1 FROM "${schema}".product_images pi WHERE pi.image_id = im.id
            )
            ORDER BY im.id ASC
          `
        );

    const variantsQuery = client.query<VariantCandidate>(
      `
        SELECT
          pv.id AS variant_id,
          pv.product_id,
          pv.sku,
          pv.barcode,
          p.name AS product_name
        FROM "${schema}".product_variants pv
        JOIN "${schema}".products p ON p.id = pv.product_id
        ORDER BY pv.id ASC
      `
    );

    const [imagesRes, variantsRes] = await Promise.all([imagesQuery, variantsQuery]);
    const variants = variantsRes.rows;

    const skuExactMap = new Map<string, VariantCandidate>();
    const barcodeExactMap = new Map<string, VariantCandidate>();
    const sortedSkuCandidates: Array<{ key: string; variant: VariantCandidate }> = [];
    const sortedBarcodeCandidates: Array<{ key: string; variant: VariantCandidate }> = [];

    for (const v of variants) {
      const skuKey = String(v.sku || "").trim().toLowerCase();
      if (skuKey && !skuExactMap.has(skuKey)) {
        skuExactMap.set(skuKey, v);
        sortedSkuCandidates.push({ key: skuKey, variant: v });
      }
      const barcodeKey = String(v.barcode || "").trim().toLowerCase();
      if (barcodeKey && !barcodeExactMap.has(barcodeKey)) {
        barcodeExactMap.set(barcodeKey, v);
        sortedBarcodeCandidates.push({ key: barcodeKey, variant: v });
      }
    }

    sortedSkuCandidates.sort((a, b) => b.key.length - a.key.length);
    sortedBarcodeCandidates.sort((a, b) => b.key.length - a.key.length);

    const matches: AutoMatchItem[] = [];
    let unmatchedCount = 0;

    for (const img of imagesRes.rows) {
      const found = findBestVariantMatch(
        img.filename,
        variants,
        skuExactMap,
        barcodeExactMap,
        sortedSkuCandidates,
        sortedBarcodeCandidates
      );
      if (found) {
        matches.push({
          image_id: Number(img.id),
          filename: img.filename,
          file_path: img.file_path,
          ...found,
        });
      } else {
        unmatchedCount += 1;
      }
    }

    return NextResponse.json({
      success: true,
      matches,
      unmatched_count: unmatchedCount,
      total_unlinked: imagesRes.rows.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to auto-match images" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const body = await req.json().catch(() => null);

    type LinkRequestItem = {
      image_id: number;
      product_id: number;
      variant_id: number | null;
    };

    const linkItems: LinkRequestItem[] = [];

    if (Array.isArray(body?.matches)) {
      for (const m of body.matches) {
        const imageId = Number(m?.image_id);
        const productId = Number(m?.product_id);
        const variantId = m?.variant_id != null ? Number(m.variant_id) : null;
        if (
          Number.isInteger(imageId) &&
          imageId > 0 &&
          Number.isInteger(productId) &&
          productId > 0
        ) {
          linkItems.push({
            image_id: imageId,
            product_id: productId,
            variant_id: variantId && Number.isInteger(variantId) ? variantId : null,
          });
        }
      }
    } else {
      const rawImageIds = Array.isArray(body?.image_ids) ? body.image_ids : [];
      const productId = Number(body?.product_id);
      const variantId = body?.variant_id != null ? Number(body.variant_id) : null;

      const imageIds = Array.from(
        new Set<number>(
          rawImageIds
            .map((id: unknown) => Number(id))
            .filter((id: number) => Number.isInteger(id) && id > 0)
        )
      );

      if (!imageIds.length) {
        return NextResponse.json(
          { success: false, message: "At least one image_id is required." },
          { status: 400 }
        );
      }
      if (!Number.isInteger(productId) || productId <= 0) {
        return NextResponse.json(
          { success: false, message: "Valid product_id is required." },
          { status: 400 }
        );
      }

      for (const imageId of imageIds) {
        linkItems.push({
          image_id: imageId,
          product_id: productId,
          variant_id: variantId && Number.isInteger(variantId) ? variantId : null,
        });
      }
    }

    if (!linkItems.length) {
      return NextResponse.json(
        { success: false, message: "No valid image link pairs provided." },
        { status: 400 }
      );
    }

    const imageIds = Array.from(new Set(linkItems.map((item) => item.image_id)));
    const imagesRes = await client.query<{ id: number; file_path: string }>(
      `SELECT id, file_path FROM "${schema}".image_master WHERE id = ANY($1::int[])`,
      [imageIds]
    );
    const imageMap = new Map<number, string>();
    imagesRes.rows.forEach((row) => {
      imageMap.set(Number(row.id), row.file_path);
    });

    await client.query("BEGIN");

    let linkedCount = 0;
    let skippedCount = 0;

    for (const item of linkItems) {
      const filePath = imageMap.get(item.image_id);
      if (!filePath) {
        skippedCount += 1;
        continue;
      }

      const dupRes = await client.query(
        `
          SELECT 1
          FROM "${schema}".product_images
          WHERE image_id = $1
            AND product_id = $2
            AND variant_id IS NOT DISTINCT FROM $3
          LIMIT 1
        `,
        [item.image_id, item.product_id, item.variant_id]
      );
      if (dupRes.rows.length > 0) {
        skippedCount += 1;
        continue;
      }

      const primaryRes = await client.query<{ has_primary: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM "${schema}".product_images
            WHERE product_id = $1 AND is_primary = TRUE
          ) AS has_primary
        `,
        [item.product_id]
      );
      const hasPrimary = Boolean(primaryRes.rows[0]?.has_primary);

      const orderRes = await client.query<{ next_order: number }>(
        `
          SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
          FROM "${schema}".product_images
          WHERE product_id = $1
        `,
        [item.product_id]
      );
      const nextOrder = Number(orderRes.rows[0]?.next_order || 1);

      await client.query(
        `
          INSERT INTO "${schema}".product_images
            (product_id, variant_id, image_id, image_url, alt_text, is_primary, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          item.product_id,
          item.variant_id,
          item.image_id,
          filePath,
          null,
          !hasPrimary,
          nextOrder,
        ]
      );
      linkedCount += 1;
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      linked_count: linkedCount,
      skipped_count: skippedCount,
    });
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to link images" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

