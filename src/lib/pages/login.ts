//C:\Users\yanna\digistorii\src\lib\pages\login.ts
import { pool } from "../db";
import { verifyPassword } from "../hash";
import { ensureCompanyResponsibilities } from "../userResponsibilities";

export async function loginUser(company: string, email: string, password: string) {
  if (!company) throw new Error("Company required");
  try {

    // Get schema for company
    const companyData = await pool.query(
      "SELECT id,schema_name,company_name FROM public.companies WHERE subdomain_url = $1",
      [company]
    );
    console.log("Company data:", companyData);
    if (!companyData.rows.length) throw new Error("Company not found");

    const schema = companyData.rows[0].schema_name;
    const realCompanyName = companyData.rows[0]?.company_name || "-";
    console.log("Company found:", company, "with schema:", schema, "Business name", realCompanyName);
    const companyId = companyData.rows[0].id;
    console.log("CompanyId : ", companyId);
    const client = await pool.connect();
    try {
      await ensureCompanyResponsibilities(client, companyId);
    } finally {
      client.release();
    }

    // Query user in company schema only
    const userResult = await pool.query(
      `SELECT * FROM public.users WHERE email = $1 AND company_id = $2 AND is_active=true`,
      [email, companyId]
    );
    if (!userResult.rows.length)
      return {
        success: false,
        message:
          "Incorrect email or password. Please try again."
      };
    const user = userResult.rows[0];
    if (!user.is_active) {
      return {
        success: false,
        message: "Your account is deactivated. Please contact your administrator."
      };
    }
    console.log("User found:", user);
    console.log("Verifying password for user:", email);
    const validPassword = await verifyPassword(password, user.password_hash);
    console.log("Password valid:", validPassword);
    if (!validPassword)
      return {
        success: false,
        message: "Incorrect email or password. Please try again."
      };

    // return { user: { id: user.id,name:user.name,username:user.username,email: user.email,phone:user.phone }, schema };
    // const settingsRes = await pool.query(
    //   `SELECT default_warehouse_id, default_locator_id, branch_name
    //    FROM "${schema}".user_settings
    //    WHERE user_id = $1
    //    LIMIT 1`,
    //   [user.id]
    // );
    // const settings = settingsRes.rows[0] || {};
    const userMapResult = await pool.query(
      `SELECT
       cum.location_id,
       cum.warehouse_id,
       COALESCE(cum.responsibility_id, u.responsibility_id) AS responsibility_id,
       r.responsibility_name,
       r.dashboard_access,
       r.purchase_access,
       r.inventory_access,
       r.sales_access,
       r.sales_billing_access,
       r.reports_access,
       r.settings_access
     FROM public.company_user_map cum
     LEFT JOIN public.users u
       ON u.id = cum.user_id
     LEFT JOIN public.user_responsibilities r
       ON r.id = COALESCE(cum.responsibility_id, u.responsibility_id)
     WHERE cum.user_id = $1 AND cum.company_id = $2
       AND cum.is_active = TRUE
     ORDER BY cum.id DESC
     LIMIT 1`,
      [user.id, companyId]
    );
    let mappedUser = userMapResult.rows[0] || {};
    if (!userMapResult.rowCount && user.responsibility_id) {
      const responsibilityResult = await pool.query(
        `SELECT
         id AS responsibility_id,
         responsibility_name,
         dashboard_access,
         purchase_access,
         inventory_access,
         sales_access,
         sales_billing_access,
         reports_access,
         settings_access
       FROM public.user_responsibilities
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
        [user.responsibility_id, companyId]
      );
      mappedUser = responsibilityResult.rows[0] || {};
    }

    const subscriptionResult = await pool.query(
      `SELECT
       cs.plan_id,
       cs.ecommerce_access,
       COALESCE(
         cs.max_warehouses,
         (
           SELECT pf.value_int
           FROM public.plan_features pf
           WHERE pf.plan_id = cs.plan_id
             AND pf.feature_key = 'max_warehouses'
           LIMIT 1
         ),
         1
       ) AS max_warehouses,
       COALESCE(
         cs.max_locations,
         (
           SELECT pf.value_int
           FROM public.plan_features pf
           WHERE pf.plan_id = cs.plan_id
             AND pf.feature_key = 'max_locations'
           LIMIT 1
         ),
         cs.max_warehouses,
         1
       ) AS max_locations
     FROM public.company_subscriptions cs
     WHERE cs.company_id = $1
     ORDER BY cs.updated_at DESC, cs.id DESC
     LIMIT 1`,
      [companyId]
    );
    const subscription = subscriptionResult.rows[0] || {};
    const maxWarehouse = Number(subscription.max_warehouses ?? 1);
    const maxLocation = Number(subscription.max_locations ?? maxWarehouse);

    console.log("Login successful for user:", email, "in company:", company);
    return {
      success: true,
      message: "Login successful!",
      user: {
        id: user.id,
        user_id: user.id,
        company_id: companyId,
        real_company_name: realCompanyName,
        company_name: company,
        subdomain_url: company,
        location_id: mappedUser.location_id ?? null,
        warehouse_id: mappedUser.warehouse_id ?? null,
        plan_id: subscription.plan_id ?? null,
        ecommerce_access: Boolean(subscription.ecommerce_access),
        max_warehouse: maxWarehouse,
        max_location: maxLocation,
        max_warehouses: maxWarehouse,
        max_locations: maxLocation,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        responsibility_id: mappedUser.responsibility_id ?? user.responsibility_id ?? null,
        responsibility_name: mappedUser.responsibility_name ?? null,
        permissions: {
          dashboard_access: Boolean(mappedUser.dashboard_access),
          purchase_access: Boolean(mappedUser.purchase_access),
          inventory_access: Boolean(mappedUser.inventory_access),
          sales_access: Boolean(mappedUser.sales_access),
          sales_billing_access: Boolean(mappedUser.sales_billing_access),
          reports_access: Boolean(mappedUser.reports_access),
          settings_access: Boolean(mappedUser.settings_access),
        },
        // default_warehouse_id: settings.default_warehouse_id ?? null,
        // default_locator_id: settings.default_locator_id ?? null,
        // branch_name: settings.branch_name ?? null
      },
      schema,
    };

  } catch (err) {
    console.error("Login error:", err);
    return { success: false, message: "Something went wrong during login. Please try again later." };
  }
}
