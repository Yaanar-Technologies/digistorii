import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  try {
    const { company } = await params;
    const companySlug = (company || "").trim().toLowerCase();

    if (!companySlug) {
      return NextResponse.json(
        { success: false, error: "Company identifier is required" },
        { status: 400 }
      );
    }

    // Read the formData stream ONLY ONCE
    const formData = await req.formData();
    const file = (formData.get("file") || formData.get("image") || formData.get("files")) as File | null;
    const subfolder = (formData.get("folder") || formData.get("subfolder") || formData.get("asset_type") || "ecom") as string;
    
    // Optional FKs & tagging per spec
    const rawCategoryId = formData.get("category_id");
    const rawMaterialId = formData.get("material_id");
    const rawColorId = formData.get("color_id");
    const source = (formData.get("source") as string) || subfolder || "ecom";

    const categoryId = rawCategoryId ? Number(rawCategoryId) : null;
    const materialId = rawMaterialId ? Number(rawMaterialId) : null;
    const colorId = rawColorId ? Number(rawColorId) : null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${timestamp}_${sanitizedOriginalName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const isVercel = process.env.VERCEL === "1" || Boolean(process.env.BLOB_READ_WRITE_TOKEN);

    let fileUrl = "";

    if (isVercel) {
      // 1. Production (Vercel Blob)
      const blob = await put(`${companySlug}/${subfolder}/${filename}`, buffer, {
        access: "public",
      });
      fileUrl = blob.url;
    } else {
      // 2. Local Development (Disk)
      const targetDir = path.join(process.cwd(), "public", "uploads", companySlug, subfolder);
      await mkdir(targetDir, { recursive: true });
      await writeFile(path.join(targetDir, filename), buffer);
      fileUrl = `/uploads/${companySlug}/${subfolder}/${filename}`;
    }

    let imageMasterId: number | null = null;

    // Record asset entry in Postgres schema table & image_master
    const client = await pool.connect();
    try {
      const tenantRes = await client.query(
        `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
        [companySlug]
      );

      if (tenantRes.rowCount) {
        const schema = tenantRes.rows[0].schema_name;

        // Ensure color_id column exists
        await client.query(`
          ALTER TABLE "${schema}".image_master
          ADD COLUMN IF NOT EXISTS color_id INT REFERENCES "${schema}".product_colors(id);
        `);

        // Check if image already exists by hash in image_master
        const existingImg = await client.query(
          `SELECT id, file_path FROM "${schema}".image_master WHERE file_hash = $1 LIMIT 1`,
          [fileHash]
        );

        if (existingImg.rowCount) {
          imageMasterId = Number(existingImg.rows[0].id);
          // If existing had no category/material/color tag but current upload specifies it, optionally update
          if (categoryId || materialId || colorId) {
            await client.query(
              `UPDATE "${schema}".image_master
               SET category_id = COALESCE($1, category_id),
                   material_id = COALESCE($2, material_id),
                   color_id = COALESCE($3, color_id),
                   source = COALESCE($4, source)
               WHERE id = $5`,
              [categoryId, materialId, colorId, source, imageMasterId]
            );
          }
        } else {
          const insertImg = await client.query(
            `INSERT INTO "${schema}".image_master
              (filename, file_path, file_hash, category_id, material_id, color_id, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [filename, fileUrl, fileHash, categoryId, materialId, colorId, source]
          );
          imageMasterId = Number(insertImg.rows[0].id);
        }

        // Store in store_theme_assets as well for legacy tables
        await client.query(
          `INSERT INTO "${schema}".store_theme_assets (asset_type, url, file_name)
           VALUES ($1, $2, $3)`,
          [subfolder, fileUrl, filename]
        );
      }
    } finally {
      client.release();
    }

    return NextResponse.json({
      success: true,
      id: imageMasterId,
      imageId: imageMasterId,
      url: fileUrl,
      filePath: fileUrl,
      fileName: filename,
      asset_type: subfolder,
    });
  } catch (error: any) {
    console.error("Upload Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
