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

    // Record asset entry in Postgres schema table
    const client = await pool.connect();
    try {
      const tenantRes = await client.query(
        `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
        [companySlug]
      );

      if (tenantRes.rowCount) {
        const schema = tenantRes.rows[0].schema_name;
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
      url: fileUrl,
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
