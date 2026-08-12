import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

export const runtime = "nodejs";

type TemplateRow = {
  id: number;
  file_path: string;
  category_label: string | null;
  material_label: string | null;
  uom_label: string | null;
  source: string | null;
};

type TemplateMode = "all" | "tagged" | "selected";

async function generateTemplate(
  req: NextRequest,
  mode: TemplateMode,
  imageIds: number[] = []
) {
  const client = await pool.connect();
  try {
    const { schema } = await getTenantSchema(req);
      const isTagged = mode === "tagged";
  const isSelected = mode === "selected";

  const params: any[] = [];
  let whereParts: string[] = [];

  // Base condition (important fix)
  if (!isSelected) {
    // apply ONLY for all
    whereParts.push(`
      NOT EXISTS (
        SELECT 1
        FROM "${schema}".product_images pi
        WHERE pi.image_id = im.id
      )
    `);
  }

  // Tagged condition
  if (isTagged) {
        // apply ONLY for tagged
    whereParts.push(`
      im.category_id IS NOT NULL
      AND im.material_id IS NOT NULL
      AND im.uom_id IS NOT NULL
      AND im.source IS NOT NULL
    `);
  }

  // Selected condition (no restriction)
  if (isSelected) {
        // apply ONLY for selected
    params.push(imageIds);
    whereParts.push(`im.id = ANY($${params.length}::int[])`);
  }

  const whereClause =
    whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

     const imagesRes = await client.query<TemplateRow>(
    `
      SELECT
        im.id,
        im.file_path,
        COALESCE(c.path_string, c.category_name) AS category_label,
        CASE
          WHEN m.material_code IS NOT NULL AND m.material_name IS NOT NULL
            THEN CONCAT(m.material_code, ' - ', m.material_name)
          ELSE m.material_name
        END AS material_label,
        CASE
          WHEN u.uom_code IS NOT NULL AND u.uom_name IS NOT NULL
            THEN CONCAT(u.uom_code, ' - ', u.uom_name)
          ELSE u.uom_name
        END AS uom_label,
        im.source
      FROM "${schema}".image_master im
      LEFT JOIN "${schema}".product_categories c ON im.category_id = c.id
      LEFT JOIN "${schema}".product_materials m ON im.material_id = m.id
      LEFT JOIN "${schema}".uom u ON im.uom_id = u.id
      ${whereClause}
      ORDER BY category_label NULLS LAST, material_label NULLS LAST, im.source NULLS LAST, im.file_path
    `,
    params
  );

    const [categoriesRes, materialsRes, uomsRes, colorsRes, fittingsRes] = await Promise.all([
      client.query(
        `
          SELECT path_string, category_name
          FROM "${schema}".product_categories
          ORDER BY path_string ASC NULLS LAST, category_name ASC
        `
      ),
      client.query(
        `
          SELECT material_code, material_name
          FROM "${schema}".product_materials
          ORDER BY material_name ASC
        `
      ),
      client.query(
        `
          SELECT uom_code, uom_name
          FROM "${schema}".uom
          ORDER BY uom_name ASC
        `
      ),
      client.query(
        `
          SELECT id, color_name
          FROM "${schema}".product_colors
          ORDER BY color_name ASC
        `
      ),
      client.query(
        `
          SELECT id, fitting_name
          FROM "${schema}".product_fittings
          ORDER BY fitting_name ASC
        `
      ),
    ]);

    const categoryOptions = categoriesRes.rows
      .map((row: { path_string: string | null; category_name: string | null }) =>
        row.path_string || row.category_name || ""
      )
      .filter(Boolean);

    const materialOptions = materialsRes.rows
      .map((row: { material_code: string | null; material_name: string | null }) => {
        const code = String(row.material_code || "").trim();
        const name = String(row.material_name || "").trim();
        if (code && name) return `${code} - ${name}`;
        return name || code || "";
      })
      .filter(Boolean);

    const uomOptions = uomsRes.rows
      .map((row: { uom_code: string | null; uom_name: string | null }) => {
        const code = String(row.uom_code || "").trim();
        const name = String(row.uom_name || "").trim();
        if (code && name) return `${code} - ${name}`;
        return name || code || "";
      })
      .filter(Boolean);

    const colorOptions = colorsRes.rows
      .map((row: { color_name: string | null }) => String(row.color_name || "").trim())
      .filter(Boolean);

    const fittingOptions = fittingsRes.rows
      .map((row: { fitting_name: string | null }) => String(row.fitting_name || "").trim())
      .filter(Boolean);

    const genderOptions = ["Male", "Female", "Transgender", "Not Specified"];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Image Master Template");
    const listsSheet = workbook.addWorksheet("_lists", { state: "hidden" });

    const writeList = (col: number, values: string[], header: string) => {
      listsSheet.getCell(1, col).value = header;
      values.forEach((value, index) => {
        listsSheet.getCell(index + 2, col).value = value;
      });
    };

    writeList(1, categoryOptions, "Categories");
    writeList(2, materialOptions, "Materials");
    writeList(3, uomOptions, "UOMs");
    writeList(4, ["own", "vendor"], "Source");
    writeList(5, colorOptions, "Colors");
    writeList(6, fittingOptions, "Fittings");
    writeList(7, genderOptions, "Genders");

    worksheet.columns = [
      { header: "Image_id", key: "image_id", width: 12 },
      { header: "Image_url", key: "image_url", width: 50 },
      { header: "Category", key: "category", width: 30 },
      { header: "Material", key: "material", width: 30 },
      { header: "UOM", key: "uom", width: 16 },
      { header: "Source", key: "source", width: 12 },
      { header: "SKU", key: "sku", width: 20 },
      { header: "Product_name", key: "product_name", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "HSN", key: "hsn", width: 16 },
      { header: "Parent SKU", key: "parent_sku", width: 20 },
      { header: "Color", key: "color", width: 16 },
      { header: "Size", key: "size", width: 16 },
      { header: "Fitting", key: "fitting", width: 16 },
      { header: "Gender", key: "gender", width: 16 },
      { header: "Weight", key: "weight", width: 12 },
      { header: "Length", key: "length", width: 12 },
      { header: "Width", key: "width", width: 12 },
      { header: "Height", key: "height", width: 12 },
      { header: "Low stock amount", key: "low_stock_amount", width: 18 },
      { header: "Backorders allowed", key: "backorders_allowed", width: 20 },
      { header: "Barcode", key: "barcode", width: 20 },
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

    imagesRes.rows.forEach((row) => {
      worksheet.addRow({
        image_id: row.id,
        image_url: row.file_path,
        category: row.category_label || "",
        material: row.material_label || "",
        uom: row.uom_label || "",
        source: row.source || "",
        parent_sku: "",
        product_name: "",
        description: "",
        sku: "",
        hsn: "",
        color: "",
        size: "",
        fitting: "",
        gender: "",
        weight: "",
        length: "",
        width: "",
        height: "",
        low_stock_amount: "",
        backorders_allowed: "",
        barcode: "",
      });
    });

    const dataRows = Math.max(worksheet.rowCount, 2);
    const buildListRange = (col: number) => {
      const lastRow = Math.max(listsSheet.rowCount, 2);
      return `'_lists'!$${String.fromCharCode(64 + col)}$2:$${String.fromCharCode(64 + col)}$${lastRow}`;
    };

    const applyValidation = (columnKey: string, listCol: number) => {
      const columnIndex = worksheet.getColumn(columnKey).number || 0;
      if (!columnIndex) return;
      const range = `${worksheet.getColumn(columnIndex).letter}2:${worksheet.getColumn(
        columnIndex
      ).letter}${dataRows}`;
      (worksheet as any).dataValidations.add(range, {
        type: "list",
        allowBlank: true,
        formulae: [buildListRange(listCol)],
        showErrorMessage: true,
        errorTitle: "Invalid value",
        error: "Please select a value from the dropdown list.",
      });
    };

    applyValidation("category", 1);
    applyValidation("material", 2);
    applyValidation("uom", 3);
    applyValidation("source", 4);
    applyValidation("color", 5);
    applyValidation("fitting", 6);
    applyValidation("gender", 7);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="image-master-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Failed to generate template" },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

export async function GET(req: NextRequest) {
  const scope = String(req.nextUrl.searchParams.get("scope") || "all").toLowerCase();
  const mode: TemplateMode = scope === "tagged" ? "tagged" : "all";
  console.log(`Generating template with scope: ${mode}`);
  return generateTemplate(req, mode);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const rawIds = Array.isArray(body?.image_ids) ? body.image_ids : [];
    const imageIds: number[] = Array.from(
      new Set<number>(
        rawIds
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isInteger(id) && id > 0)
      )
    );

    if (!imageIds.length) {
      return NextResponse.json(
        { message: "image_ids must contain at least one valid image id" },
        { status: 400 }
      );
    }
    console.log(`Received request to generate template for ${imageIds.length} image IDs`);
    console.log("Generating template for image IDs:", imageIds);
    return generateTemplate(req, "selected", imageIds);
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Failed to generate template" },
      { status: 400 }
    );
  }
}
