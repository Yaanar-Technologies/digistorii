import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getTenantSchema } from "@/lib/tenant";

async function resolveVariantId(
    client: any,
    schema: string,
    idValue: any
): Promise<number> {
    const id = Number(idValue);
    if (!Number.isFinite(id)) throw new Error("Invalid variant id");
    const variantRes = await client.query(
        `SELECT id FROM "${schema}".product_variants WHERE id = $1 LIMIT 1`,
        [id]
    );
    if (variantRes.rows.length) return Number(variantRes.rows[0].id);

    const fallbackRes = await client.query(
        `SELECT id FROM "${schema}".product_variants WHERE product_id = $1 ORDER BY id ASC LIMIT 1`,
        [id]
    );
    if (fallbackRes.rows.length) return Number(fallbackRes.rows[0].id);
    throw new Error("Variant not found for selected product");
}

const toPositiveInt = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
};

const roundMoney = (value: unknown) => Number(Number(value || 0).toFixed(2));

const normalizePaymentRows = (
    payments: any
): Array<{
    payment_mode_id: number;
    amount: number;
    paid_amount: number;
    actual_amount: number;
    return_change: number;
}> => {
    if (!Array.isArray(payments)) return [];
    return payments
        .map((row) => ({
            payment_mode_id: toPositiveInt(row?.payment_mode_id),
            amount: roundMoney(row?.amount),
            paid_amount: roundMoney(row?.paid_amount || row?.amount),
            actual_amount: roundMoney(row?.actual_amount),
            return_change: roundMoney(row?.return_change),
        }))
        .filter(
            (row): row is {
                payment_mode_id: number;
                amount: number;
                paid_amount: number;
                actual_amount: number;
                return_change: number;
            } =>
                Boolean(row.payment_mode_id) && Number.isFinite(row.amount) && row.amount > 0
        );
};
const calculatePaymentStatus = (totalAmount: number, paidAmount: number) => {
    if (paidAmount <= 0) return "unpaid";
    if (paidAmount >= totalAmount) return "paid";
    return "partial";
};
async function resolveWarehouseContext(client: any, schema: string, warehouseId: number) {
    const warehouseRes = await client.query(
        `SELECT id, name, location_id FROM "${schema}".warehouses WHERE id = $1 LIMIT 1`,
        [warehouseId]
    );
    if (!warehouseRes.rowCount) {
        throw new Error("Warehouse not found");
    }
    return {
        warehouse_id: Number(warehouseRes.rows[0].id),
        warehouse_name: String(warehouseRes.rows[0].name || ""),
        location_id: toPositiveInt(warehouseRes.rows[0].location_id),
    };
}

async function validatePaymentModes(
    client: any,
    schema: string,
    paymentModeIds: number[]
) {
    if (!paymentModeIds.length) return;
    const res = await client.query(
        `SELECT id FROM "${schema}".payment_modes WHERE id = ANY($1::int[])`,
        [paymentModeIds]
    );
    if (res.rowCount !== paymentModeIds.length) {
        throw new Error("One or more payment modes are invalid");
    }
}

// async function ensurePaymentsTrackingColumns(client: any, schema: string) {
//   await client.query(`
//     ALTER TABLE "${schema}".sales_header 
//     ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;
//   `);

//   await client.query(`
//     ALTER TABLE "${schema}".sales_payments 
//     ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0.00,
//     ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(12,2) DEFAULT 0.00,
//     ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;
//   `);

//   await client.query(`
//     UPDATE "${schema}".sales_payments
//     SET paid_amount = amount,
//         actual_amount = amount
//     WHERE paid_amount = 0.00 AND actual_amount = 0.00;
//   `);
// }

async function replaceSalesPayments(
    client: any,
    schema: string,
    salesId: number,
    payments: Array<{
        payment_mode_id: number;
        amount: number;
        paid_amount: number;
        actual_amount: number;
        return_change: number;
    }>,
    createdBy: string | number | null,
    locationId: number | null,
    warehouseId: number
) {
    await client.query(`DELETE FROM "${schema}".sales_payments WHERE sales_id = $1`, [salesId]);
    if (!payments.length) return;
    for (const payment of payments) {
        await client.query(
            `INSERT INTO "${schema}".sales_payments (
               sales_id, payment_mode_id, amount, paid_amount, actual_amount, return_change,
               created_by, location_id, warehouse_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                salesId,
                payment.payment_mode_id,
                payment.amount,
                payment.paid_amount,
                payment.actual_amount,
                payment.return_change,
                createdBy,
                locationId,
                warehouseId
            ]
        );
    }
}

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {

    const client = await pool.connect();

    try {

        const { schema } = await getTenantSchema(req);
        const { id: saleId } = await context.params;

        const headerRes = await client.query(
            `SELECT sh.*,s.name as customer_name,
            s.email as customer_email,
            s.phone as customer_phone,
            w.name as warehouse_name,
            loc.name as location_name,
            CONCAT_WS(', ', sa.address_line1, sa.address_line2, sa.city, sa.state, sa.pincode) as customer_address 
            FROM ${schema}.sales_header sh 
            LEFT JOIN ${schema}.customers s ON sh.customer_id = s.id 
            LEFT JOIN "${schema}".warehouses w ON sh.warehouse_id = w.id
            LEFT JOIN "${schema}".locations loc ON sh.location_id = loc.id
            LEFT JOIN ${schema}.customer_addresses sa ON s.id = sa.customer_id
            WHERE sh.id=$1`,
            [saleId]
        );

        const detailRes = await client.query(
            `SELECT
                d.*,
                pv.id AS variant_id,
                p.product_code,
                p.name as product_name,
                p.description,
                d.tax_master_id AS tax_id,
                u.uom_code,
                u.uom_name,
                tr.tax_name,
                tr.total_percentage AS tax_percent,
                dis.value as discount
            FROM ${schema}.sales_detail d
            LEFT JOIN "${schema}".product_variants pv
                ON pv.id::text = d.product_id::text
            LEFT JOIN ${schema}.products p
                ON p.id::text = COALESCE(pv.product_id, d.product_id)::text
            LEFT JOIN "${schema}".uom u
                ON u.id::text = d.uom
            LEFT JOIN ${schema}.tax_master tr
                ON tr.id = d.tax_master_id
            LEFT JOIN ${schema}.discount_variants dv
                ON dv.variant_id = pv.id
            LEFT JOIN ${schema}.discounts dis
                ON dis.id = dv.discount_id
            WHERE d.sales_id = $1`,
            [saleId]
        );

        const paymentsRes = await client.query(
            `SELECT
                sp.id,
                sp.sales_id,
                sp.payment_mode_id,
                pm.name AS payment_mode_name,
                sp.amount,
                sp.paid_amount,
                sp.actual_amount,
                sp.return_change,
                sp.location_id,
                sp.warehouse_id,
                sp.created_at,
                sp.created_by
            FROM "${schema}".sales_payments sp
            LEFT JOIN "${schema}".payment_modes pm
              ON pm.id = sp.payment_mode_id
            WHERE sp.sales_id = $1
            ORDER BY sp.id ASC`,
            [saleId]
        );

        return NextResponse.json({
            success: true,
            data: {
                header: headerRes.rows[0],
                details: detailRes.rows,
                payments: paymentsRes.rows
            }
        });

    } catch (error: any) {

        console.error("Fetch Sale Error:", error);

        return NextResponse.json(
            {
                success: false,
                error: error.message
            },
            { status: 500 }
        );

    } finally {

        client.release();

    }
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {

    const client = await pool.connect();

    try {

        const { schema } = await getTenantSchema(req);
        const { id: salesId } = await context.params;

        const body = await req.json();

        const { header, details, payments } = body;

        const {
            customer_id,
            sales_date,
            currency,
            warehouse_id,
            location_id,
            locator_id,
            subtotal,
            tax_amount,
            total_amount,
            return_change,
            user_name
        } = header;

        await client.query("BEGIN");
        // await ensurePaymentsTrackingColumns(client, schema);

        const normalizedWarehouseId = toPositiveInt(warehouse_id);
        if (!normalizedWarehouseId) {
            throw new Error("Warehouse is required");
        }
        const warehouseContext = await resolveWarehouseContext(client, schema, normalizedWarehouseId);
        const normalizedLocatorId = toPositiveInt(locator_id);
        const normalizedPayments = normalizePaymentRows(payments);
        await validatePaymentModes(
            client,
            schema,
            normalizedPayments.map((row) => row.payment_mode_id)
        );
        const totalTendered = roundMoney(
            normalizedPayments.reduce((sum, row) => sum + Number(row.paid_amount || row.amount || 0), 0)
        );
        const normalizedTotalAmount = roundMoney(total_amount);
        const calculatedPaymentStatus = calculatePaymentStatus(normalizedTotalAmount, totalTendered);

        // UPDATE HEADER
        await client.query(
            `
      UPDATE ${schema}.sales_header
      SET customer_id=$1,
          sales_date=$2,
          currency=$3,
          warehouse_id=$4,
          location_id=$5,
          locator_id=$6,
          subtotal=$7,
          tax_amount=$8,
          total_amount=$9,
          payment_status=$10,
          return_change=$11,
          updated_by=$12,
          updated_at=NOW()
      WHERE id=$13
      `,
            [
                customer_id,
                sales_date,
                currency,
                warehouseContext.warehouse_id,
                warehouseContext.location_id ?? toPositiveInt(location_id),
                normalizedLocatorId,
                subtotal,
                tax_amount,
                total_amount,
                calculatedPaymentStatus,
                return_change || 0.0,
                user_name,
                salesId
            ]
        );

        await replaceSalesPayments(
            client,
            schema,
            Number(salesId),
            normalizedPayments,
            user_name ?? null,
            warehouseContext.location_id,
            warehouseContext.warehouse_id
        );

        // FETCH existing detail ids from DB
        const existingRes = await client.query(
            `SELECT id FROM ${schema}.sales_detail WHERE sales_id=$1`,
            [salesId]
        );

        const existingIds = existingRes.rows.map((r) => r.id);

        const incomingIds = details
            .filter((d: any) => d.id)
            .map((d: any) => d.id);

        // FIND deleted rows
        const deletedIds = existingIds.filter(
            (id: number) => !incomingIds.includes(id)
        );

        if (deletedIds.length > 0) {
            await client.query(
                `DELETE FROM ${schema}.sales_detail
         WHERE id = ANY($1::int[])`,
                [deletedIds]
            );
        }

        // LOOP details
        for (const item of details) {
            const taxMasterId = item.tax_id && item.tax_id > 0 ? item.tax_id : null;
            const variantId = await resolveVariantId(client, schema, item.product_id);

            if (item.id) {

                // UPDATE EXISTING ROW
                await client.query(
                    `
          UPDATE ${schema}.sales_detail
          SET product_id=$1,
                UOM=$2,
                rate=$3,
                qty=$4,
                discount=$5,
                tax_master_id=$6,
                tax_amount=$7,
                line_total=$8,
                updated_by=$9,
                updated_at=NOW()
            WHERE id=$10
            `,
                    [
                        variantId,
                        item.uom,
                        item.rate,
                        item.qty,
                        item.discount,
                        taxMasterId,
                        item.tax_amount,
                        item.line_total,
                        user_name,
                        item.id
                    ]
                );

            } else {

                // INSERT NEW ROW
                await client.query(
                    `
          INSERT INTO ${schema}.sales_detail
          (
            sales_id,
            product_id,
            UOM,
            rate,
            qty,
            discount,
            tax_master_id,
            tax_amount,
            line_total,
            created_by,
            created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
          `,
                    [
                        salesId,
                        variantId,
                        item.uom,
                        item.rate,
                        item.qty,
                        item.discount,
                        taxMasterId,
                        item.tax_amount,
                        item.line_total,
                        user_name
                    ]
                );
            }
        }

        await client.query("COMMIT");

        return NextResponse.json({
            success: true,
            message: "Sale Updated Successfully",
            id: Number(salesId),
            payment_status: calculatedPaymentStatus
        });

    } catch (error: any) {

        await client.query("ROLLBACK");

        console.error("Sale Update Error:", error);

        return NextResponse.json(
            {
                success: false,
                error: error.message
            },
            { status: 500 }
        );

    } finally {

        client.release();

    }
}
