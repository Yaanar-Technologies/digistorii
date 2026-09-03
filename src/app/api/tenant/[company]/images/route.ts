import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  const { company } = await params;
  const companySlug = (company || "").trim().toLowerCase();

  if (!companySlug) {
    return NextResponse.json(
      { success: false, message: "Company parameter is required" },
      { status: 400 }
    );
  }

  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ success: true, images: [] });
  }

  const ids = idsParam
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => !isNaN(id) && id > 0);

  if (ids.length === 0) {
    return NextResponse.json({ success: true, images: [] });
  }

  const client = await pool.connect();
  try {
    const tenantRes = await client.query(
      `SELECT schema_name FROM public.companies WHERE LOWER(subdomain_url) = $1 LIMIT 1`,
      [companySlug]
    );

    if (!tenantRes.rowCount) {
      return NextResponse.json(
        { success: false, message: `Tenant ${company} not found` },
        { status: 404 }
      );
    }

    const schema = tenantRes.rows[0].schema_name;

    const result = await client.query(
      `
        SELECT
          id,
          filename,
          file_path,
          category_id,
          material_id,
          color_id,
          source
        FROM "${schema}".image_master
        WHERE id = ANY($1::bigint[])
      `,
      [ids]
    );

    const images = result.rows.map((row) => ({
      id: Number(row.id),
      filename: row.filename,
      filePath: row.file_path,
      url: row.file_path,
      categoryId: row.category_id ? Number(row.category_id) : null,
      materialId: row.material_id ? Number(row.material_id) : null,
      colorId: row.color_id ? Number(row.color_id) : null,
      source: row.source || null,
    }));

    return NextResponse.json({
      success: true,
      images,
    });
  } catch (err: any) {
    console.error("Batch image resolver error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to resolve images" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
