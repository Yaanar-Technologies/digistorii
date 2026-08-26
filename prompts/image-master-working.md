### Task: Implement Unified File Upload & Storage Strategy for Local Dev + Vercel Deployment

#### Background & The Problem
1. **Local Workflow:** Images are currently stored locally under `public/uploads/${company}/...` and referenced in Postgres (`image_master` and `product_images`).
2. **Vercel Limitation:** Vercel functions run in a read-only, ephemeral serverless filesystem. Writing to `public/uploads/` at runtime fails or gets wiped on deployment/instance restart.
3. **Requirement:** 
   - Add inline file upload buttons inside form fields in `workspace/ecom-config/theme/page.tsx` (replacing/augmenting plain URL inputs).
   - Ensure image uploads work seamlessly in **both Local Development** (saving to disk) and **Vercel Production** (using external/cloud blob storage like Vercel Blob or Cloudinary/S3).
   - Support theme assets (store logos, banners, icons) distinct from product inventory images.

---

### Key Deliverables

#### 1. Schema / Organization for Theme & Brand Assets
* For store assets (logos, headers, theme media), determine whether to:
  - Add a separate table `"${schema}".store_theme_assets` (with fields: `id`, `asset_type` (e.g., `'logo'`, `'banner'`), `url`, `file_name`, `created_at`), add this in createEcomSchema function in schema.ts file
* Standardize asset paths:
  - Product images: `public/uploads/${company}/image-master/`
  - Theme/Store assets: `public/uploads/${company}/ecom/`

#### 2. Environment-Aware Upload Handler (Local Disk vs. Vercel Blob)
Create an upload API route (`/api/[company]/upload`) that determines the storage target using standard environment variables:

install `npm install @vercel/blob`
* **Detection Logic:**
  ```ts
  const isVercel = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";



#### 3. UI Updates in `page.tsx` (Theme Settings)
* Locate all input fields currently accepting raw image URLs (e.g., logo, banner, favicon).
* Add an inline file upload trigger button inside or right beside the input field.
* On file select:
  1. Trigger the upload API for the current `[company]`.
  2. Set field value automatically to the returned image URL upon successful upload.
  3. Provide an instant preview thumbnail and a clear/remove option.
  4. Preserve the option for manual URL pasting as a fallback.

---

### Implementation Instructions
1. Provide the complete code for the `/api/[company]/upload` route handling multipart/form-data and driver switching.
2. Provide the reusable UI component (e.g., `<ImageUploadInput />`) to drop into `page.tsx`.
3. Provide the migration script for any new theme/asset tables or columns needed.
4. Ensure zero breaking changes to existing product image paths in `image_master` and `product_images`.