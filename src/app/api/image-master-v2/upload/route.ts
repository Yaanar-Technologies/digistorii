import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { fileTypeFromBuffer } from "file-type";
import path from "path";
import { writeFile } from "fs/promises";
import { pool } from "@/lib/db";
import {
  ensureDir,
  fileExists,
  getImageMasterDir,
  sanitizeFilename,
  toTenantKey,
} from "@/lib/image-master";
import { getTenantSchema } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    const tenant = toTenantKey(company);
    const form = await req.formData();

    const files = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File)
      .filter((file) => file.size > 0);

    if (!files.length) {
      return NextResponse.json({ message: "At least one file is required" }, { status: 400 });
    }
    const errors: string[] = [];
    const validFiles: File[] = [];
    const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/svg+xml",
      ];

      const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
      function hasValidExtension(filename: string) {
        return allowedExtensions.some(ext =>
          filename.toLowerCase().endsWith(ext)
        );
      }

    const dir = getImageMasterDir(tenant);
    await ensureDir(dir);

    const insertedRows: any[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const detectedType = await fileTypeFromBuffer(buffer);
      const fileHash = createHash("sha256").update(buffer).digest("hex");
     
      if (errors.length) {
  return NextResponse.json({
    success: false,
    message: `Invalid files: ${errors.join(", ")}`,
  }, { status: 400 });
}
        if (
    detectedType &&
    !allowedMimeTypes.includes(detectedType.mime)
  ) {
    return NextResponse.json(
      {
        success: false,
        message: `Invalid file format for ${file.name}. Allowed: JPG, PNG, WEBP, SVG.`,
      },
      { status: 400 }
    );
  }
      // Extension check (extra safety)
      if (!hasValidExtension(file.name)) {
        return NextResponse.json(
          {
            success: false,
            message: `Invalid file extension for ${file.name}.`,
          },
          { status: 400 }
        );
      }

      
      const existingRes = await client.query(
        `
          SELECT id, filename, file_path, category_id, material_id, uom_id, source, created_at
          FROM "${schema}".image_master
          WHERE file_hash = $1
          LIMIT 1
        `,
        [fileHash]
      );

      if (existingRes.rows.length) {
        insertedRows.push(existingRes.rows[0]);
        continue;
      }

      const original = sanitizeFilename(file.name);
      let finalName = original;
      if (await fileExists(path.join(dir, finalName))) {
        let unixSeconds = Math.floor(Date.now() / 1000);
        const parsed = path.parse(original);
        finalName = `${parsed.name}_${unixSeconds}${parsed.ext}`;
        while (await fileExists(path.join(dir, finalName))) {
          unixSeconds += 1;
          finalName = `${parsed.name}_${unixSeconds}${parsed.ext}`;
        }
      }

      const isVercel = process.env.VERCEL === "1" || Boolean(process.env.BLOB_READ_WRITE_TOKEN);
      let filePath = "";

      if (isVercel) {
        const { put } = await import("@vercel/blob");
        const blob = await put(`${tenant}/image-master/${finalName}`, buffer, { access: "public" });
        filePath = blob.url;
      } else {
        const targetPath = path.join(dir, finalName);
        await writeFile(targetPath, buffer);
        filePath = `${tenant}/image-master/${finalName}`;
      }

      const insertRes = await client.query(
        `
          INSERT INTO "${schema}".image_master
            (filename, file_path, file_hash)
          VALUES ($1, $2, $3)
          RETURNING id, filename, file_path, category_id, material_id, uom_id, source, created_at
        `,
        [finalName, filePath, fileHash]
      );
      insertedRows.push(insertRes.rows[0]);
    }

    if (!insertedRows.length) {
      return NextResponse.json({ message: "No files were saved" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: insertedRows });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to upload images" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
