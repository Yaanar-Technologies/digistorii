import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
    const { id } = await context.params;
    const body = await req.json();
    const isActive = Boolean(body?.is_active);

    const result = await client.query(
      `
        UPDATE "${schema}".discounts
        SET is_active = $1
        WHERE id = $2
        RETURNING *,
          CASE 
            WHEN is_active = TRUE 
              AND (starts_at IS NULL OR starts_at <= NOW()) 
              AND (ends_at IS NULL OR ends_at >= NOW()) 
            THEN 'active'
            ELSE 'inactive'
          END AS status
      `,
      [isActive, id]
    );

    if (!result.rows.length) {
      return NextResponse.json({ success: false, error: "Discount not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update discount status" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
