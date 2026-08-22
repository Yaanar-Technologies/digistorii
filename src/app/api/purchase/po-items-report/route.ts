import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";
 
export async function GET(req: NextRequest) {
 
    try {
 
        const { company, schema } = await getTenantSchema(req);
 
        const { searchParams } = new URL(req.url);
 
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const supplier = searchParams.get("supplier");
        const product = searchParams.get("product");
 
        // BACKEND VALIDATION
 
        if (!from || !to) {
            return NextResponse.json({
                success: false,
                message: "From Date and To Date required"
            });
        }
 
        if (new Date(from) > new Date(to)) {
            return NextResponse.json({
                success: false,
                message: "Invalid date range"
            });
        }
 
        const result = await pool.query(
            `
            SELECT
            ph.purchase_no,
            ph.purchase_date,
            ph.status AS po_status,
            s.supplier_code,
            s.name AS supplier_name,
            p.product_code,
            p.name AS product_name,
            pd.uom,
            pd.qty,
            pd.rate AS price,
            RANK() OVER (PARTITION BY pd.product_id ORDER BY pd.rate ASC) AS price_rank,
            u.uom_code,
            u.uom_name
            FROM ${schema}.purchase_header ph
            JOIN ${schema}.suppliers s
            ON s.id = ph.supplier_id
            JOIN ${schema}.purchase_detail pd
            ON pd.purchase_id = ph.id
            JOIN ${schema}.products p
            ON p.id::text = pd.product_id::text
            LEFT JOIN "${schema}".uom u
                        ON u.id::text = pd.uom
            WHERE ph.purchase_date BETWEEN $1 AND $2
            AND ($3::int IS NULL OR ph.supplier_id = $3)
            AND ($4::text IS NULL OR $4 = '' OR pd.product_id::text = $4)
            ORDER BY ph.purchase_date DESC
            `,
            [from, to, supplier ? Number(supplier) : null, product || null]
 
        );
 
        return NextResponse.json({
            success: true,
            data: result.rows
        });
 
    } catch (err: any) {
 
        console.error("PO Items Report Error:", err);
 
        return NextResponse.json({
            success: false,
            message: "Database error occurred while fetching report"
        });
 
    }
 
}
 