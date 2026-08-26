import path from "path";
import { access, mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import { constants as fsConstants } from "fs";

const TENANT_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function toTenantKey(value: string): string {
  const tenant = value.trim().toLowerCase();
  if (!TENANT_KEY_REGEX.test(tenant)) {
    throw new Error("Invalid tenant key");
  }
  return tenant;
}

export function sanitizeFilename(value: string): string {
  const name = path.basename(value.trim());
  if (!name || name === "." || name === "..") {
    throw new Error("Invalid filename");
  }
  return name;
}

export function sanitizeSkuFolder(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-") || "unknown";
}

export function getTenantUploadsRoot(tenant: string): string {
  return path.join(process.cwd(), "public", "uploads", tenant);
}

export function getImageMasterDir(tenant: string): string {
  return path.join(getTenantUploadsRoot(tenant), "image-master");
}

export function getProductImagesDir(tenant: string, parentSku: string): string {
  return path.join(getTenantUploadsRoot(tenant), "products", sanitizeSkuFolder(parentSku));
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function listImageMasterFiles(tenant: string): Promise<Array<{ name: string; size: number; updatedAt: string }>> {
  const dir = getImageMasterDir(tenant);
  await ensureDir(dir);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(dir, entry.name);
        const details = await stat(filePath);
        return {
          name: entry.name,
          size: details.size,
          updatedAt: details.mtime.toISOString(),
        };
      })
  );
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export type ImageMasterUpload = {
  filename: string;
  file_path: string;
};

export async function saveImageMasterFiles(
  tenant: string,
  files: File[]
): Promise<ImageMasterUpload[]> {
  const isVercel = process.env.VERCEL === "1" || Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const saved: ImageMasterUpload[] = [];

  if (isVercel) {
    const { put } = await import("@vercel/blob");
    for (const file of files) {
      const original = sanitizeFilename(file.name);
      const timestamp = Math.floor(Date.now() / 1000);
      const parsed = path.parse(original);
      const finalName = `${parsed.name}_${timestamp}${parsed.ext}`;
      const content = Buffer.from(await file.arrayBuffer());

      const blob = await put(`${tenant}/image-master/${finalName}`, content, {
        access: "public",
      });

      saved.push({
        filename: finalName,
        file_path: blob.url,
      });
    }
    return saved;
  }

  const dir = getImageMasterDir(tenant);
  await ensureDir(dir);

  for (const file of files) {
    const original = sanitizeFilename(file.name);
    const finalName = await resolveFilenameWithTimestamp(dir, original);

    const targetPath = path.join(dir, finalName);
    const content = Buffer.from(await file.arrayBuffer());
    await writeFile(targetPath, content);

    saved.push({
      filename: finalName,
      file_path: `${tenant}/image-master/${finalName}`,
    });
  }

  return saved;
}

function buildTimestampedName(original: string, unixSeconds: number): string {
  const parsed = path.parse(original);
  return `${parsed.name}_${unixSeconds}${parsed.ext}`;
}

async function resolveFilenameWithTimestamp(dir: string, original: string): Promise<string> {
  if (!(await fileExists(path.join(dir, original)))) {
    return original;
  }
  let unixSeconds = Math.floor(Date.now() / 1000);
  let candidate = buildTimestampedName(original, unixSeconds);
  while (await fileExists(path.join(dir, candidate))) {
    unixSeconds += 1;
    candidate = buildTimestampedName(original, unixSeconds);
  }
  return candidate;
}

export async function deleteImageMasterFile(tenant: string, filename: string): Promise<void> {
  const dir = getImageMasterDir(tenant);
  const safeName = sanitizeFilename(filename);
  const targetPath = path.join(dir, safeName);
  await unlink(targetPath);
}

export async function resolveAndCopyImageFromMaster(options: {
  tenant: string;
  parentSku: string;
  filename: string;
  origin: string;
}): Promise<string | null> {
  const safeName = sanitizeFilename(options.filename);
  const sourcePath = path.join(getImageMasterDir(options.tenant), safeName);
  if (!(await fileExists(sourcePath))) {
    return null;
  }
  return `/uploads/${encodeURIComponent(options.tenant)}/image-master/${encodeURIComponent(
    safeName
  )}`;
}
