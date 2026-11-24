import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const pathSegments = params?.path || [];

    if (!pathSegments.length) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const decodedSegments = pathSegments.map((seg) => decodeURIComponent(seg));
    const uploadsBase = path.normalize(path.join(process.cwd(), "public", "uploads"));
    const filePath = path.normalize(path.join(uploadsBase, ...decodedSegments));

    // Security check: ensure path stays within public/uploads
    if (!filePath.startsWith(uploadsBase)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".gif": "image/gif",
      ".pdf": "application/pdf",
      ".ico": "image/x-icon",
      ".avif": "image/avif",
    };

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving uploaded file:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
