import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireStaff, staffDisplayName } from "@/lib/apiGuard";
import { ensureFinanceSchema } from "@/lib/financeSchema";
import { getYearRange } from "@/lib/dateRange";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  try {
    const { company } = await params;
    const guard = await requireStaff(req, company, { permission: "finance_access" });
    if (!guard.ok) {
      return guard.response;
    }

    const { schema, companyId } = guard;
    const client = await pool.connect();

    try {
      await ensureFinanceSchema(client, schema);

      const companyRes = await client.query(
        `SELECT year_type, currency FROM public.companies WHERE id = $1`,
        [companyId]
      );
      const yearType = companyRes.rows[0]?.year_type === "calendar" ? "calendar" : "fiscal";
      const currency = companyRes.rows[0]?.currency || "INR";

      const { searchParams } = new URL(req.url);
      const defaultRange = getYearRange(yearType);
      const startDate = searchParams.get("startDate") || defaultRange.from;
      const endDate = searchParams.get("endDate") || defaultRange.to;
      const typeFilter = searchParams.get("type") || "all"; // 'all', 'cogs', 'manual'

      const items: Array<{
        id: string | number;
        type: "cogs" | "manual";
        category: string;
        title: string;
        ref_no: string;
        date: string;
        payment_mode: string;
        amount: number;
        created_by?: string;
        notes?: string;
      }> = [];

      // 1. Auto-listed completed-GRN Purchases (COGS)
      if (typeFilter === "all" || typeFilter === "cogs") {
        try {
          const poRes = await client.query(
            `SELECT 
               ph.id,
               ph.purchase_no AS ref_no,
               TO_CHAR(ph.purchase_date, 'YYYY-MM-DD') AS date,
               s.name AS supplier_name,
               ph.total_amount,
               ph.payment_terms
             FROM "${schema}".purchase_header ph
             LEFT JOIN "${schema}".suppliers s ON s.id = ph.supplier_id
             WHERE ph.status = 'Completed'
               AND ph.purchase_date >= $1::date AND ph.purchase_date <= $2::date
             ORDER BY ph.purchase_date DESC, ph.id DESC
             LIMIT 100`,
            [startDate, endDate]
          );

          for (const row of poRes.rows) {
            items.push({
              id: `po-${row.id}`,
              type: "cogs",
              category: "Purchase (COGS)",
              title: `PO #${row.ref_no} - ${row.supplier_name || "Supplier"}`,
              ref_no: row.ref_no,
              date: row.date,
              payment_mode: "Credit / Supplier Terms",
              amount: Number(row.total_amount),
            });
          }
        } catch (err) {
          console.error("Failed to load completed PO expenses:", err);
        }
      }

      // 2. Manual Overheads from finance_expenses
      if (typeFilter === "all" || typeFilter === "manual") {
        const manualRes = await client.query(
          `SELECT 
             id,
             category,
             title,
             amount,
             TO_CHAR(expense_date, 'YYYY-MM-DD') AS date,
             payment_mode,
             reference_no AS ref_no,
             notes,
             created_by
           FROM "${schema}".finance_expenses
           WHERE expense_date >= $1::date AND expense_date <= $2::date
           ORDER BY expense_date DESC, id DESC
           LIMIT 100`,
          [startDate, endDate]
        );

        for (const row of manualRes.rows) {
          items.push({
            id: Number(row.id),
            type: "manual",
            category: row.category,
            title: row.title,
            ref_no: row.ref_no || "-",
            date: row.date,
            payment_mode: row.payment_mode || "Bank Transfer",
            amount: Number(row.amount),
            notes: row.notes || "",
            created_by: row.created_by || "",
          });
        }
      }

      // Sort by date descending
      items.sort((a, b) => (b.date > a.date ? 1 : -1));

      return NextResponse.json({
        success: true,
        data: {
          currency,
          items,
        },
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Finance expenses GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load expenses" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  try {
    const { company } = await params;
    const guard = await requireStaff(req, company, { permission: "finance_access" });
    if (!guard.ok) {
      return guard.response;
    }

    const { schema, staff } = guard;
    const client = await pool.connect();

    try {
      await ensureFinanceSchema(client, schema);

      const body = await req.json();
      const category = String(body.category || "").trim();
      const title = String(body.title || "").trim();
      const amount = Number(body.amount);
      const expenseDate = body.expense_date || new Date().toISOString().split("T")[0];
      const paymentMode = String(body.payment_mode || "Bank Transfer").trim();
      const referenceNo = String(body.reference_no || "").trim();
      const notes = String(body.notes || "").trim();

      if (!category) {
        return NextResponse.json({ success: false, error: "Category is required" }, { status: 400 });
      }
      if (!title) {
        return NextResponse.json({ success: false, error: "Expense title/description is required" }, { status: 400 });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ success: false, error: "Valid expense amount is required" }, { status: 400 });
      }

      const userDisplay = staffDisplayName(staff);

      const insertRes = await client.query(
        `INSERT INTO "${schema}".finance_expenses
           (category, title, amount, expense_date, payment_mode, reference_no, notes, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)
         RETURNING id, category, title, amount, TO_CHAR(expense_date, 'YYYY-MM-DD') AS expense_date, payment_mode, reference_no, notes, created_at`,
        [category, title, amount, expenseDate, paymentMode, referenceNo, notes, userDisplay]
      );

      return NextResponse.json({
        success: true,
        data: insertRes.rows[0],
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Finance expenses POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create expense" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ company: string }> }
) {
  try {
    const { company } = await params;
    const guard = await requireStaff(req, company, { permission: "finance_access" });
    if (!guard.ok) {
      return guard.response;
    }

    const { schema } = guard;
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "Invalid expense ID" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM "${schema}".finance_expenses WHERE id = $1`, [id]);
      return NextResponse.json({ success: true, message: "Expense deleted" });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Finance expenses DELETE error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete expense" },
      { status: 500 }
    );
  }
}
