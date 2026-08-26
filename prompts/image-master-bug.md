### Task: Fix Upload Route Errors in Next.js (Product Images & Logo)

We are encountering two specific errors in our Next.js upload handlers:
1. `ENOENT: no such file or directory, mkdir '/var/task/public/uploads/...'` during product uploads on Vercel.
2. `TypeError: Body is unusable: Body has already been read` during logo/asset uploads.

---

### Root Cause Analysis & Requirements

#### Issue 1: Serverless Read-Only Filesystem
- On Vercel (`process.env.VERCEL === '1'`), serverless functions run in a read-only environment (`/var/task/`). Local file system operations (`fs.mkdir`, `fs.writeFile`) to `public/uploads/` fail.
- **Requirement:** Update all upload routes (product images & theme/logo assets) to branch dynamically:
  - If `process.env.VERCEL === '1'`: Use `@vercel/blob` (`put`) with `{ access: 'public' }`.
  - If local development (`!process.env.VERCEL`): Save directly to `public/uploads/${company}/...` using Node `fs/promises`.

#### Issue 2: Stream Consumption (`Body has already been read`)
- The Next.js `Request` body stream can only be read once.
- **Requirement:** In all upload routes and middleware:
  - Remove duplicate calls like `await req.formData()` or calling `await req.json()` before `req.formData()`.
  - Call `const formData = await req.formData();` exactly once at the top of the handler.

---

### Implementation Details
1. **Image for product**
edit product image related files to in insert or update of image master of product , edit file to upload image to allow both local uploads and vercel blob upload on both local dev and vercel production env
2. **Standardize the Upload API Handler (`/api/[company]/upload`):**
```ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import fs from 'fs/promises';
import path from 'path';

export async function POST(
  req: Request,
  { params }: { params: { company: string } }
) {
  try {
    const { company } = params;

    // Read the formData stream ONLY ONCE
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const subfolder = (formData.get('folder') as string) || 'ecom'; // 'ecom' or 'image-master'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isVercel = process.env.VERCEL === '1';

    let fileUrl: string;

    if (isVercel) {
      // 1. Production (Vercel Blob)
      const blob = await put(`${company}/${subfolder}/${file.name}`, buffer, {
        access: 'public',
      });
      fileUrl = blob.url;
    } else {
      // 2. Local Development (Disk)
      const targetDir = path.join(process.cwd(), 'public', 'uploads', company, subfolder);
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, file.name), buffer);
      fileUrl = `/uploads/${company}/${subfolder}/${file.name}`;
    }

    return NextResponse.json({
      success: true,
      url: fileUrl,
      fileName: file.name,
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}