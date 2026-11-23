#### 1 & 2. Fix Image Upload Limit (7-File Cap) & Audit Vercel Blob Storage

 **Context:** In DigiStorii (Next.js App Router + TypeScript), product image uploads fail or cap out when uploading more than 7 images, and image URLs are currently resolving to Vercel Blob.
 **Task:**
 1. Locate the image upload API route, frontend dropzone/file-input component, and `next.config.js` / server action body size limits. 
 2. Audit all references to `@vercel/blob` across the codebase. Remove that only save through /uploads no ned of vercel blob use just `/public/uploads/{company}/img.jpg`
 3. Remove the 7-image cap (or raise it to our target limit) with proper batched/sequential upload handling and progress states, and confirm whether we can migrate the storage adapter to local/Hostinger.
 
 

#### 3. Bulk Image & SKU Mapping via Excel (with OPS Quantity)

 **Context:** In DigiStorii's bulk upload(`image-master-v2`) and image-tagging workflow (using ExcelJS and PostgreSQL), the exported/imported image mapping Excel sheet is missing `Parent SKU`, `SKU` (variant mapping), and `QTY`,`warehouse`,`locator` updates via OPS (Opening Stock). Limalr to product excel upload
 **Task:**
 1. Update the ExcelJS template generator to include columns for `Parent SKU`, ` SKU`, `Image URL / Tag`, and `Opening Stock (OPS) `-`warehouse`,`locator`,Qty`.
 2. Update the Excel import parser and validation layer to:
 * Map images accurately to either the parent product or specific variant SKU in PostgreSQL.
 * Validate SKU existence against the tenant's catalog before committing.
 * Route the `OPS Qty` value through the existing inventory/OPS stock-ledger transaction logic rather than overwriting raw stock counts directly.
 * visble on excel that are for only new products not existing one (option b)in excel template
 
 3. Return row-level validation errors in the UI if a SKU doesn't exist or an image URL is malformed.
 
 


#### 5. Implement 3-Day Grace Period Logic & Sync Banner Display

 **Context:** In DigiStorii's multi-tenant subscription lifecycle, there is currently no actual grace period stored or enforced in the backend/database—only a static or misleading banner message shown in the UI. Tenants are getting locked out immediately after `subscription_end_date`.
 **Task:**
 1. Inspect the subscription schema in PostgreSQL, the billing cron job, and the Next.js middleware/API auth guards where `subscription_end_date` and tenant access (`is_active` / `subscription_status`) are evaluated.
 2. Implement a real **3-day grace period** calculated as `subscription_end_date + 3 days` ( by adding/populating a `grace_period_end_date` column in PostgreSQL).
 3. Update the route guards, middleware, and billing cron job so that **no access restrictions or lockouts are applied** while `NOW() <= subscription_end_date + 3 days`. Only lock/suspend the tenant once those 3 grace days have passed.
 4. Update the frontend warning banner to dynamically calculate and display the real remaining grace period days/date from `subscription_end_date + 3 days` (showing the banner only during the 3-day window after `subscription_end_date`).
 
