import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

type PricingFilter = "priced" | "unpriced" | "both";

type TemplateRow = {
  variant_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  base_cost: string | number | null;
  operational_cost: string | number | null;
  margin_type: string | null;
  margin_value: string | number | null;
  active_from: string | Date | null;
  expires_at: string | Date | null;
  
};

function parsePricingFilter(raw: string): PricingFilter {
  const value = raw.trim().toLowerCase();
  if (value === "priced" || value === "unpriced" || value === "both") return value;
  return "unpriced";
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const { company, schema } = await getTenantSchema(req);
    const pricingFilter = parsePricingFilter(
      String(req.nextUrl.searchParams.get("pricingFilter") || "unpriced")
    );
    const useLastPurchasePrice = req.nextUrl.searchParams.get("useLastPurchasePrice") === "true";
    const includePriced = pricingFilter === "priced" || pricingFilter === "both";
    const includeUnpriced = pricingFilter === "unpriced" || pricingFilter === "both";
const baseCostSelect = useLastPurchasePrice
      ? `COALESCE(lp.rate::numeric, pp.base_cost) AS base_cost`
      : `pp.base_cost`;

    const latestPurchaseJoin = useLastPurchasePrice
      ? `
        LEFT JOIN (
          SELECT DISTINCT ON (d.product_id)
            d.product_id,
            d.rate
          FROM "${schema}".purchase_detail d
          JOIN "${schema}".purchase_header h ON d.purchase_id = h.id
          WHERE h.status IN ('Completed', 'Partial')
          ORDER BY d.product_id, h.purchase_date DESC, h.id DESC
        ) lp ON lp.product_id = pv.id
      `
      : "";
    const skuResult = await client.query<TemplateRow>(
      `
        SELECT
          pv.id AS variant_id,p.product_code,p.name AS product_name,
          pv.sku,
            pv.barcode,
          ${baseCostSelect},
          pp.operational_cost,
          pp.margin_type,
          pp.margin_value,
          pp.active_from,
          pp.expires_at
        FROM "${schema}".product_variants pv
        INNER JOIN "${schema}".products p
          ON p.id = pv.product_id
        LEFT JOIN "${schema}".product_pricing pp
          ON pp.tenant_id = $1
          AND pp.variant_id = pv.id
          AND pp.is_active = TRUE
          AND CURRENT_DATE >= pp.active_from::date
          AND (pp.expires_at IS NULL OR CURRENT_DATE <= pp.expires_at::date)
          ${latestPurchaseJoin}
        WHERE pv.status IN ('draft', 'active', 'out_of_stock')
          AND p.status = 1
          AND (
            ($2::boolean = TRUE AND pp.id IS NOT NULL)
            OR
            ($3::boolean = TRUE AND pp.id IS NULL)
          )
        ORDER BY pv.id ASC
      `,
      [company, includePriced, includeUnpriced]
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Pricing Template");
    worksheet.columns = [
      { header: "Variant ID", key: "variant_id", width: 16 },
      { header: "Product Code", key: "product_code", width: 24 },
      { header: "Product Name", key: "product_name", width: 32 },
      { header: "SKU", key: "sku", width: 24 },
      { header: "Base Cost", key: "base_cost", width: 16 },
      { header: "Operational Cost", key: "operational_cost", width: 18 },
      { header: "Margin Type", key: "margin_type", width: 16 },
      { header: "Margin Value", key: "margin_value", width: 16 },
      { header: "Active From", key: "active_from", width: 16 },
      { header: "Tax Name", key: "tax_name", width: 20 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFF6FF" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    const todayText = new Date().toISOString().slice(0, 10);
    for (const row of skuResult.rows) {
      const activeFromValue = row.active_from
        ? new Date(row.active_from)
        : new Date(`${todayText}T00:00:00Z`);
      worksheet.addRow({
        variant_id: row.variant_id,
        product_code: row.product_code,
        product_name: row.product_name,
        sku: row.sku,
        base_cost: row.base_cost ?? "",
        operational_cost: row.operational_cost ?? 0,
        margin_type: row.margin_type ?? "percentage",
        margin_value: row.margin_value ?? "",
        active_from: activeFromValue,
        tax_name: "",
      });
    }

    worksheet.getColumn("active_from").numFmt = "yyyy-mm-dd";

    const taxResult = await client.query(
      `
        SELECT tax_name
        FROM "${schema}".tax_master
        WHERE is_active = TRUE
        ORDER BY id
      `
    );
    const taxNames = taxResult.rows
      .map((row: { tax_name: string }) => String(row.tax_name || "").trim())
      .filter((name: string) => name);

    const listSheet = workbook.addWorksheet("Lists");
    listSheet.getColumn(1).values = ["Margin Type", "percentage", "amount"];
    listSheet.getColumn(2).values = ["Tax Name", ...taxNames];
    listSheet.state = "veryHidden";

    const marginTypeRange = `Lists!$A$2:$A$3`;
    const taxNameRange = taxNames.length
      ? `Lists!$B$2:$B$${taxNames.length + 1}`
      : `Lists!$B$2:$B$2`;

    const marginTypeColumn = worksheet.getColumn("margin_type").number;
    const taxNameColumn = worksheet.getColumn("tax_name").number;

    for (let i = 2; i <= worksheet.rowCount; i += 1) {
      worksheet.getCell(i, marginTypeColumn).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [marginTypeRange],
      };
      worksheet.getCell(i, taxNameColumn).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [taxNameRange],
      };
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="pricing-update-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Failed to generate pricing template" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}
