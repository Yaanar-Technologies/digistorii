import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@/lib/db";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  if (!companySlug) {
    return NextResponse.json(
      { success: false, message: "Company identifier is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const form = await req.json().catch(async () => null) || await req.formData();
    let file: File | null = null;
    let assetType = "ecom";

    if (form instanceof FormData) {
      const entry = form.get("file") || form.get("image") || form.get("files");
      if (entry instanceof File) file = entry;
      assetType = String(form.get("asset_type") || "ecom").trim();
    }

    if (!file || file.size === 0) {
      return NextResponse.json(
        { success: false, message: "No valid image file provided" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${timestamp}_${sanitizedOriginalName}`;
    const subfolder = assetType === "product" ? "image-master" : "ecom";

    let finalUrl = "";

    // Storage Target Detection (Vercel Blob in Prod vs. Local Disk in Dev)
    const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    const isVercelEnv = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

    if (hasBlobToken || isVercelEnv) {
      // Cloud Blob Storage (Vercel Blob)
      const blobPath = `${companySlug}/${subfolder}/${filename}`;
      const blob = await put(blobPath, file, { access: "public" });
      finalUrl = blob.url;
    } else {
      // Local Disk Storage
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const targetDirectory = path.join(process.cwd(), "public", "uploads", companySlug, subfolder);
      await mkdir(targetDirectory, { recursive: true });

      const filePath = path.join(targetDirectory, filename);
      await writeFile(filePath, buffer);

      finalUrl = `/uploads/${companySlug}/${subfolder}/${filename}`;
    }

    // Record asset entry in Postgres schema table
    const tenantRes = await client.query(
      `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (tenantRes.rowCount) {
      const schema = tenantRes.rows[0].schema_name;
      await client.query(
        `INSERT INTO "${schema}".store_theme_assets (asset_type, url, file_name)
         VALUES ($1, $2, $3)`,
        [assetType, finalUrl, filename]
      );
    }

    return NextResponse.json({
      success: true,
      url: finalUrl,
      file_name: filename,
      asset_type: assetType,
    });
  } catch (err: any) {
    console.error("Unified Upload Handler Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to upload image asset" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
