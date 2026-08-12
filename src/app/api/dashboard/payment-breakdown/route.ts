import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "today"; // today, monthly, yearly, custom
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let dateCondition = "";
    const params: any[] = [];
    let paramIndex = 1;

    // Optional tenant_id handling if needed, usually we query within the schema.
    // If the table doesn't have tenant_id, this might fail, but standard pattern is schema.table
    // For safety we rely on the schema, but if tenant_id is needed:
    // dateCondition += ` AND sp.tenant_id = $${paramIndex}`; params.push(company); paramIndex++;

    if (filter === "today") {
      dateCondition += ` AND DATE(sp.created_at) = CURRENT_DATE`;
    } else if (filter === "monthly") {
      dateCondition += ` AND DATE_TRUNC('month', sp.created_at) = DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (filter === "yearly") {
      dateCondition += ` AND DATE_TRUNC('year', sp.created_at) = DATE_TRUNC('year', CURRENT_DATE)`;
    } else if (filter === "custom" && startDate && endDate) {
      dateCondition += ` AND DATE(sp.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    }

    // Removing WHERE 1=1 AND tenant_id to avoid crash if tenant_id doesn't exist, we rely on the schema segregation.
    // Actually, in digistorii, tables inside the tenant schema also usually have tenant_id. Let's include it.
    params.unshift(company);
    const tenantCondition = `sp.tenant_id = $1`;

    const query = `
      SELECT 
        pm.id AS mode_id,
        pm.name AS mode_name,
        SUM(COALESCE(NULLIF(sp.actual_amount, 0), sp.amount)) AS total_amount
      FROM "${schema}".sales_payments sp
      JOIN "${schema}".payment_modes pm ON sp.payment_mode_id = pm.id
      WHERE ${tenantCondition} ${dateCondition}
      GROUP BY pm.id, pm.name
      ORDER BY total_amount DESC
    `;

    const result = await client.query(query, params);

    const totalsByMode = result.rows.reduce((acc, row) => {
      acc[row.mode_id] = {
        name: row.mode_name,
        amount: Number(row.total_amount) || 0
      };
      return acc;
    }, {} as Record<number, { name: string, amount: number }>);

    const grandTotal = Object.values(totalsByMode).reduce((sum: number, mode: any) => sum + mode.amount, 0);

    return NextResponse.json({
      success: true,
      data: {
        totalsByMode,
        grandTotal
      }
    });

  } catch (error: any) {
    // Fallback if tenant_id doesn't exist in sales_payment
    if (error.code === '42703' && error.message.includes('tenant_id')) {
      try {
        const { schema } = await getTenantSchema(req);
        const { searchParams } = new URL(req.url);
        const filter = searchParams.get("filter") || "today";
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        let dateCondition = "";
        const params: any[] = [];
        let paramIndex = 1;

        if (filter === "today") {
          dateCondition += ` AND DATE(sp.created_at) = CURRENT_DATE`;
        } else if (filter === "monthly") {
          dateCondition += ` AND DATE_TRUNC('month', sp.created_at) = DATE_TRUNC('month', CURRENT_DATE)`;
        } else if (filter === "yearly") {
          dateCondition += ` AND DATE_TRUNC('year', sp.created_at) = DATE_TRUNC('year', CURRENT_DATE)`;
        } else if (filter === "custom" && startDate && endDate) {
          dateCondition += ` AND DATE(sp.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
          params.push(startDate, endDate);
          paramIndex += 2;
        }

        const query = `
          SELECT 
            pm.id AS mode_id,
            pm.name AS mode_name,
            SUM(COALESCE(NULLIF(sp.actual_amount, 0), sp.amount)) AS total_amount
          FROM "${schema}".sales_payments sp
          JOIN "${schema}".payment_modes pm ON sp.payment_mode_id = pm.id
          WHERE 1=1 ${dateCondition}
          GROUP BY pm.id, pm.name
          ORDER BY total_amount DESC
        `;

        const result = await client.query(query, params);

        const totalsByMode = result.rows.reduce((acc, row) => {
          acc[row.mode_id] = {
            name: row.mode_name,
            amount: Number(row.total_amount) || 0
          };
          return acc;
        }, {} as Record<number, { name: string, amount: number }>);

        const grandTotal = Object.values(totalsByMode).reduce((sum: number, mode: any) => sum + mode.amount, 0);

        return NextResponse.json({
          success: true,
          data: {
            totalsByMode,
            grandTotal
          }
        });
      } catch (fallbackError: any) {
        return NextResponse.json(
          { success: false, error: fallbackError.message || "Failed to fetch payment breakdown" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch payment breakdown" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
