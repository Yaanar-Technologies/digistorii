import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
 
// Get company ID from subdomain / tenant
async function getCompanyIdAndSchema(company: string) {
    const companyData = await pool.query(
        "SELECT id, schema_name FROM public.companies WHERE subdomain_url = $1",
        [company]
    );
 
    if (!companyData.rows.length) throw new Error("Company not found");
 
    return {
        companyId: companyData.rows[0].id,
        schema: companyData.rows[0].schema_name,
    };
}
 
export async function GET(req: NextRequest) {
    try {
        const tenant = req.headers.get("x-tenant") || "";
        const { companyId, schema } = await getCompanyIdAndSchema(tenant);
        console.log("companyId : ", companyId);
        const res = await pool.query(`
       SELECT cs.*, c.subdomain_url as companyName, c.year_type
  FROM ${schema}.company_settings cs
  JOIN public.companies c
    ON c.id = cs.company_id
  WHERE cs.company_id = $1
  LIMIT 1
    `, [companyId]);
 
        return NextResponse.json({
            success: true,
            data: res.rows[0] || null,
        });
 
    } catch (err: any) {
        console.error("GET Company Settings Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
 
export async function POST(req: NextRequest) {
    const client = await pool.connect();
 
    try {
        const tenant = req.headers.get("x-tenant") || "";
        const { companyId, schema } = await getCompanyIdAndSchema(tenant);
 
        const body = await req.json();
        const {
            userName,
            baseCurrency,
            dateFormat,
            timeZone,
            financialYearStart,
            financialYearEnd,
            salesTarget
        } = body;
 
 
        if (!baseCurrency) {
            return NextResponse.json({ success: false, error: "Base Currency is required" }, { status: 400 });
        }
 
        await client.query("BEGIN");
 
        // UPSERT company settings for this company
        await client.query(`
      INSERT INTO ${schema}.company_settings
        (company_id, base_currency, date_format, time_zone, financial_year_start, financial_year_end,sales_target,created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7,$8, NOW())
      ON CONFLICT (company_id)
      DO UPDATE SET
        base_currency = EXCLUDED.base_currency,
        date_format = EXCLUDED.date_format,
        time_zone = EXCLUDED.time_zone,
        financial_year_start = EXCLUDED.financial_year_start,
        financial_year_end = EXCLUDED.financial_year_end,
        sales_target = EXCLUDED.sales_target,
        updated_by = $8,
        updated_at = NOW()
    `, [
            companyId,
            baseCurrency,
            dateFormat,
            timeZone,
            financialYearStart,
            financialYearEnd,
            salesTarget,
            userName
        ]);
 
        await client.query("COMMIT");
 
        return NextResponse.json({ success: true, message: "Company settings saved successfully" });
 
    } catch (err: any) {
        await client.query("ROLLBACK");
        console.error("POST Company Settings Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
        client.release();
    }
}