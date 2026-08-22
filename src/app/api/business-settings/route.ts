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

        const res = await pool.query(`
            SELECT 
                c.company_name, c.subdomain_url, c.year_type,
                bs.gst_number, bs.pan_number, bs.business_address as address, 
                bs.city, bs.state, bs.country, bs.currency,
                bs.default_low_stock_threshold, bs.default_backorders_allowed, 
                bs.low_stock_notifications_enabled, bs.low_stock_email_notifications_enabled
            FROM public.companies c
            LEFT JOIN "${schema}".business_settings bs ON 1=1
            WHERE c.id = $1
            LIMIT 1
        `, [companyId]);

        const settings = res.rows[0] || null;

        let subscribedUserIds: number[] = [];
        if (settings) {
            const subsRes = await pool.query(`
                SELECT user_id 
                FROM "${schema}".notification_subscriptions 
                WHERE event_type = 'low_stock' AND enabled = true
            `);
            subscribedUserIds = subsRes.rows.map(row => row.user_id);
        }

        return NextResponse.json({
            success: true,
            data: settings ? { ...settings, subscribed_users: subscribedUserIds } : null,
        });

    } catch (err: any) {
        console.error("GET Business Settings Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const client = await pool.connect();
    try {
        const tenant = req.headers.get("x-tenant") || "";
        const { companyId, schema } = await getCompanyIdAndSchema(tenant);

        const body = await req.json();
        const {
            address,
            city,
            state,
            country,
            currency,
            gst_number,
            pan_number,
            year_type,
            default_low_stock_threshold,
            default_backorders_allowed,
            low_stock_notifications_enabled,
            low_stock_email_notifications_enabled,
            subscribed_users // Array of user IDs (integers)
        } = body;

        // validate year_type
        const validYearType = (year_type === 'calendar') ? 'calendar' : 'fiscal';

        await client.query("BEGIN");

        // Update public.companies
        await client.query(`
            UPDATE public.companies
            SET 
                address = $1,
                city = $2,
                state = $3,
                country = $4,
                currency = $5,
                gst_number = $6,
                pan_number = $7,
                year_type = $8,
                updated_at = NOW()
            WHERE id = $9
        `, [
            address || null,
            city || null,
            state || null,
            country || null,
            currency || null,
            gst_number || null,
            pan_number || null,
            validYearType,
            companyId
        ]);

        // Update schema.business_settings
        const bsCheck = await client.query(`SELECT id FROM "${schema}".business_settings LIMIT 1`);
        if (bsCheck.rows.length > 0) {
            await client.query(`
                UPDATE "${schema}".business_settings
                SET 
                    gst_number = $1,
                    pan_number = $2,
                    business_address = $3,
                    city = $4,
                    state = $5,
                    country = $6,
                    currency = $7,
                    default_low_stock_threshold = $8,
                    default_backorders_allowed = $9,
                    low_stock_notifications_enabled = $10,
                    low_stock_email_notifications_enabled = $11,
                    updated_at = NOW()
                WHERE id = $12
            `, [
                gst_number || null,
                pan_number || null,
                address || null,
                city || null,
                state || null,
                country || null,
                currency || null,
                default_low_stock_threshold !== undefined ? Number(default_low_stock_threshold) : 5,
                default_backorders_allowed ?? false,
                low_stock_notifications_enabled ?? true,
                low_stock_email_notifications_enabled ?? false,
                bsCheck.rows[0].id
            ]);
        } else {
            await client.query(`
                INSERT INTO "${schema}".business_settings (
                    gst_number, pan_number, business_address, city, state, country, currency,
                    default_low_stock_threshold, default_backorders_allowed, 
                    low_stock_notifications_enabled, low_stock_email_notifications_enabled
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                gst_number || null,
                pan_number || null,
                address || null,
                city || null,
                state || null,
                country || null,
                currency || null,
                default_low_stock_threshold !== undefined ? Number(default_low_stock_threshold) : 5,
                default_backorders_allowed ?? false,
                low_stock_notifications_enabled ?? true,
                low_stock_email_notifications_enabled ?? false
            ]);
        }

        // Handle notification subscriptions
        // Delete current event_type = 'low_stock'
        await client.query(`
            DELETE FROM "${schema}".notification_subscriptions
            WHERE event_type = 'low_stock'
        `);

        // Insert new ones
        if (Array.isArray(subscribed_users) && subscribed_users.length > 0) {
            for (const userId of subscribed_users) {
                await client.query(`
                    INSERT INTO "${schema}".notification_subscriptions (event_type, user_id, enabled)
                    VALUES ('low_stock', $1, true)
                    ON CONFLICT (event_type, user_id) DO UPDATE SET enabled = true
                `, [userId]);
            }
        }

        await client.query("COMMIT");

        return NextResponse.json({ success: true, message: "Business settings saved successfully" });
    } catch (err: any) {
        await client.query("ROLLBACK");
        console.error("PUT Business Settings Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
        client.release();
    }
}
