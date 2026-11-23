"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import {
  CategoryNode,
  flattenCategories,
} from "../products/components/category-utils";

type StagedImage = {
  id: string;
  filename: string;
  file_path: string;
  category_id: string;
  material_id: string;
  uom_id: string;
  source: string;
  selected: boolean;
};

type MaterialOption = {
  id: number;
  material_code: string;
  material_name: string;
};

type UomOption = {
  id: number;
  uom_code: string;
  uom_name: string;
};

type SavedImage = {
  id: number;
  filename: string;
  file_path: string;
  category_name: string | null;
  material_name: string | null;
  uom_name: string | null;
  source: string | null;
  created_at: string;
};

type UploadResponse = { filename: string; file_path: string };

type RowErrors = Record<string, string[]>;

export default function ImageMasterPage() {
  const { company } = useTenant();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [saved, setSaved] = useState<SavedImage[]>([]);
  const [categoriesTree, setCategoriesTree] = useState<CategoryNode[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    currentBatch: number;
    totalBatches: number;
    uploadedCount: number;
    totalFiles: number;
    percent: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [rowErrors, setRowErrors] = useState<RowErrors>({});
  const [templateOpen, setTemplateOpen] = useState(false);
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterMaterials, setFilterMaterials] = useState<string[]>([]);
  const [filterUoms, setFilterUoms] = useState<string[]>([]);
  const [filterSources, setFilterSources] = useState<string[]>([]);

  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkMaterial, setBulkMaterial] = useState("");
  const [bulkUom, setBulkUom] = useState("");
  const [bulkSource, setBulkSource] = useState("");

  const hasLoadedRef = useRef(false);

  const flatCategories = useMemo(
    () => flattenCategories(categoriesTree),
    [categoriesTree]
  );

  useEffect(() => {
    if (!company || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadAll = async () => {
      setLoading(true);
      setMessage("");
      try {
        const [categoriesRes, materialsRes, uomsRes, savedRes] = await Promise.all([
          apiFetch("/api/categories?format=tree", company),
          apiFetch("/api/materials", company),
          apiFetch("/api/uom", company),
          apiFetch("/api/image-master", company),
        ]);

        const categoriesData = await categoriesRes.json();
        const materialsData = await materialsRes.json();
        const uomsData = await uomsRes.json();
        const savedData = await savedRes.json();

        if (categoriesData?.success) setCategoriesTree(categoriesData.data || []);
        if (materialsData?.success) setMaterials(materialsData.data || []);
        if (uomsData?.success) setUoms(uomsData.data || []);
        if (savedData?.success) setSaved(savedData.data || []);
      } catch (error: any) {
        setMessage(error.message || "Failed to load lookups");
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [company]);

  async function refreshSaved() {
    if (!company) return;
    try {
      const res = await apiFetch("/api/image-master", company);
      const data = await res.json();
      if (data?.success) setSaved(data.data || []);
    } catch (error: any) {
      setMessage(error.message || "Failed to refresh list");
    }
  }

  async function uploadImages() {
    if (!company || !selectedFiles.length) return;
    setUploading(true);
    setMessage("");
    const BATCH_SIZE = 4;
    const totalFiles = selectedFiles.length;
    const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);
    const allStagedRows: StagedImage[] = [];
    const errors: string[] = [];

    try {
      for (let b = 0; b < totalBatches; b++) {
        const batchFiles = selectedFiles.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        setUploadProgress({
          currentBatch: b + 1,
          totalBatches,
          uploadedCount: allStagedRows.length,
          totalFiles,
          percent: Math.round((b / totalBatches) * 100),
        });

        const form = new FormData();
        batchFiles.forEach((file) => form.append("files", file));

        const res = await apiFetch("/api/image-master/upload", company, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) {
          errors.push(data.message || `Batch ${b + 1} failed`);
          continue;
        }

        const uploaded: UploadResponse[] = Array.isArray(data) ? data : data.files || [];
        const stagedRows: StagedImage[] = uploaded.map((item) => ({
          id: item.file_path,
          filename: item.filename,
          file_path: item.file_path,
          category_id: "",
          material_id: "",
          uom_id: "",
          source: "",
          selected: true,
        }));
        allStagedRows.push(...stagedRows);
      }

      setUploadProgress({
        currentBatch: totalBatches,
        totalBatches,
        uploadedCount: allStagedRows.length,
        totalFiles,
        percent: 100,
      });

      setStaged((prev) => [...prev, ...allStagedRows]);
      setSelectedFiles([]);
      if (errors.length > 0) {
        setMessage(`Uploaded ${allStagedRows.length} image(s) with errors: ${errors.join("; ")}`);
      } else {
        setMessage(`Uploaded ${allStagedRows.length} image(s) to staging.`);
      }
    } catch (error: any) {
      setMessage(error.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  function toggleAllSelected(value: boolean) {
    setStaged((prev) => prev.map((row) => ({ ...row, selected: value })));
  }

  function updateRow(id: string, patch: Partial<StagedImage>) {
    setStaged((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
    setRowErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function applyBulk() {
    const hasAny = bulkCategory || bulkMaterial || bulkUom || bulkSource;
    if (!hasAny) {
      setMessage("Select at least one bulk value to apply.");
      return;
    }

    setStaged((prev) =>
      prev.map((row) => {
        if (!row.selected) return row;
        return {
          ...row,
          category_id: bulkCategory || row.category_id,
          material_id: bulkMaterial || row.material_id,
          uom_id: bulkUom || row.uom_id,
          source: bulkSource || row.source,
        };
      })
    );
    setRowErrors({});
  }

  function validateRows(rows: StagedImage[]) {
    const errors: RowErrors = {};
    rows.forEach((row) => {
      const missing: string[] = [];
      if (!row.category_id) missing.push("category");
      if (!row.material_id) missing.push("material");
      if (!row.uom_id) missing.push("uom");
      if (!row.source) missing.push("source");
      if (missing.length) errors[row.id] = missing;
    });
    setRowErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveImages() {
    if (!company || !staged.length) return;
    setMessage("");

    if (!validateRows(staged)) {
      setMessage("Please fill Category, Material, UOM, and Source for all staged images.");
      return;
    }

    setSaving(true);
    try {
      const payload = staged.map((row) => ({
        filename: row.filename,
        file_path: row.file_path,
        category_id: Number(row.category_id),
        material_id: Number(row.material_id),
        uom_id: Number(row.uom_id),
        source: row.source,
      }));

      const res = await apiFetch("/api/image-master/save", company, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data.error || "Failed to save images");
      }

      setStaged([]);
      setRowErrors({});
      setMessage(`Saved ${data.count || payload.length} image(s).`);
      await refreshSaved();
    } catch (error: any) {
      setMessage(error.message || "Failed to save images");
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = staged.filter((row) => row.selected).length;

  const handleMultiSelect = (
    event: ChangeEvent<HTMLSelectElement>,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setter(values);
  };

  const downloadTemplate = async () => {
    if (!company) return;
    setMessage("");
    const params = new URLSearchParams();
    filterCategories.forEach((value) => params.append("category", value));
    filterMaterials.forEach((value) => params.append("material", value));
    filterUoms.forEach((value) => params.append("uom", value));
    filterSources.forEach((value) => params.append("source", value));
    const query = params.toString();
    const url = query ? `/api/products/template?${query}` : "/api/products/template";

    try {
      const res = await apiFetch(url, company);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to download template");
      }
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "product-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      setTemplateOpen(false);
    } catch (error: any) {
      setMessage(error.message || "Failed to download template");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Image Master</h1>
          <p className="text-sm text-gray-500">
            Upload images, bulk tag metadata, and save them into the Image Master list.
          </p>
        </div>
        <button
          onClick={() => setTemplateOpen(true)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Download Product Template
        </button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-5 mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Upload Images</h3>
            <p className="text-sm text-gray-500">
              Add multiple images. Drag and drop is also supported.
            </p>
          </div>

          {selectedFiles.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                {selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"}
              </span>

              <button
                onClick={() => setSelectedFiles([])}
                className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div
            className={`relative group rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-6 text-center hover:border-blue-400 hover:bg-blue-50/20 transition-all ${
              uploading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []);
                setSelectedFiles((prev) => [...prev, ...newFiles]);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />

            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </div>

              <div className="flex text-sm text-gray-600">
                <span className="font-semibold text-blue-600 hover:text-blue-700">
                  Click to upload
                </span>
                <p className="pl-1">or drag and drop</p>
              </div>

              <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB each</p>
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50">
              <div className="max-h-56 overflow-y-auto divide-y divide-gray-200">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span className="text-gray-700 truncate">{file.name}</span>

                    <button
                      onClick={() =>
                        setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="text-red-500 hover:text-red-700 text-xs font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-6 space-y-3">
            {uploadProgress ? (
              <div className="space-y-1.5 rounded-lg border border-blue-100 bg-blue-50/50 p-3 max-w-md">
                <div className="flex justify-between text-xs text-blue-900 font-medium">
                  <span>
                    Batch {uploadProgress.currentBatch} of {uploadProgress.totalBatches} ({uploadProgress.uploadedCount}/{uploadProgress.totalFiles} images uploaded)
                  </span>
                  <span>{uploadProgress.percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            ) : null}
            <button
              onClick={uploadImages}
              disabled={!selectedFiles.length || uploading}
              className="flex items-center justify-center gap-2.5 w-full sm:w-auto rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 disabled:opacity-80"
            >
              {uploading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Upload {selectedFiles.length > 0 ? `${selectedFiles.length} ` : ""}Images
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          {message}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-700">Bulk Assign</div>

          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm"
          >
            <option value="">Category</option>
            {flatCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.path}
              </option>
            ))}
          </select>

          <select
            value={bulkMaterial}
            onChange={(e) => setBulkMaterial(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm"
          >
            <option value="">Material</option>
            {materials.map((mat) => (
              <option key={mat.id} value={mat.id}>
                {mat.material_code} - {mat.material_name}
              </option>
            ))}
          </select>

          <select
            value={bulkUom}
            onChange={(e) => setBulkUom(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm"
          >
            <option value="">UOM</option>
            {uoms.map((uom) => (
              <option key={uom.id} value={uom.id}>
                {uom.uom_code} - {uom.uom_name}
              </option>
            ))}
          </select>

          <select
            value={bulkSource}
            onChange={(e) => setBulkSource(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm"
          >
            <option value="">Source</option>
            <option value="vendor">Vendor</option>
            <option value="own">Own</option>
          </select>

          <button
            onClick={applyBulk}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Apply to Selected ({selectedCount})
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <input
                      type="checkbox"
                      checked={staged.length > 0 && selectedCount === staged.length}
                      onChange={(e) => toggleAllSelected(e.target.checked)}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Image</th>
                  <th className="px-4 py-3 font-medium">Filename</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">UOM</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-500" colSpan={7}>
                      Loading...
                    </td>
                  </tr>
                ) : staged.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-500" colSpan={7}>
                      No staged images yet. Upload to start tagging.
                    </td>
                  </tr>
                ) : (
                  staged.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => updateRow(row.id, { selected: e.target.checked })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <img
                          src={`/uploads/${row.file_path}`}
                          alt={row.filename}
                          className="h-12 w-12 rounded-md object-cover border"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.filename}</td>
                      <td className="px-4 py-3">
                        <select
                          value={row.category_id}
                          onChange={(e) => updateRow(row.id, { category_id: e.target.value })}
                          className={`border rounded-md px-2 py-1 text-sm ${
                            rowErrors[row.id]?.includes("category")
                              ? "border-red-500"
                              : "border-gray-200"
                          }`}
                        >
                          <option value="">Select</option>
                          {flatCategories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.path}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.material_id}
                          onChange={(e) => updateRow(row.id, { material_id: e.target.value })}
                          className={`border rounded-md px-2 py-1 text-sm ${
                            rowErrors[row.id]?.includes("material")
                              ? "border-red-500"
                              : "border-gray-200"
                          }`}
                        >
                          <option value="">Select</option>
                          {materials.map((mat) => (
                            <option key={mat.id} value={mat.id}>
                              {mat.material_code} - {mat.material_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.uom_id}
                          onChange={(e) => updateRow(row.id, { uom_id: e.target.value })}
                          className={`border rounded-md px-2 py-1 text-sm ${
                            rowErrors[row.id]?.includes("uom")
                              ? "border-red-500"
                              : "border-gray-200"
                          }`}
                        >
                          <option value="">Select</option>
                          {uoms.map((uom) => (
                            <option key={uom.id} value={uom.id}>
                              {uom.uom_code} - {uom.uom_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.source}
                          onChange={(e) => updateRow(row.id, { source: e.target.value })}
                          className={`border rounded-md px-2 py-1 text-sm ${
                            rowErrors[row.id]?.includes("source")
                              ? "border-red-500"
                              : "border-gray-200"
                          }`}
                        >
                          <option value="">Select</option>
                          <option value="vendor">Vendor</option>
                          <option value="own">Own</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={saveImages}
            disabled={saving || staged.length === 0}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {saving ? "Saving..." : "Save Images"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Image Master List</h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Image</th>
                  <th className="px-4 py-3 font-medium">Filename</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">UOM</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-500" colSpan={7}>
                      Loading...
                    </td>
                  </tr>
                ) : saved.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-500" colSpan={7}>
                      No images saved yet.
                    </td>
                  </tr>
                ) : (
                  saved.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <img
                          src={`/uploads/${row.file_path}`}
                          alt={row.filename}
                          className="h-12 w-12 rounded-md object-cover border"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.filename}</td>
                      <td className="px-4 py-3">{row.category_name || "-"}</td>
                      <td className="px-4 py-3">{row.material_name || "-"}</td>
                      <td className="px-4 py-3">{row.uom_name || "-"}</td>
                      <td className="px-4 py-3">{row.source || "-"}</td>
                      <td className="px-4 py-3">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {templateOpen ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-xl bg-white p-5 shadow-lg">
            <button
              onClick={() => setTemplateOpen(false)}
              className="absolute right-3 top-3 text-lg text-gray-500 hover:text-gray-700"
              aria-label="Close"
            >
              x
            </button>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Download Product Template</h3>
                <p className="text-xs text-gray-600">Filter image master rows for template prefill.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Category</label>
                  <select
                    multiple
                    value={filterCategories}
                    onChange={(e) => handleMultiSelect(e, setFilterCategories)}
                    className="h-32 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {flatCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.path}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Material</label>
                  <select
                    multiple
                    value={filterMaterials}
                    onChange={(e) => handleMultiSelect(e, setFilterMaterials)}
                    className="h-32 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {materials.map((mat) => (
                      <option key={mat.id} value={mat.id}>
                        {mat.material_code} - {mat.material_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-gray-500">UOM</label>
                  <select
                    multiple
                    value={filterUoms}
                    onChange={(e) => handleMultiSelect(e, setFilterUoms)}
                    className="h-32 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {uoms.map((uom) => (
                      <option key={uom.id} value={uom.id}>
                        {uom.uom_code} - {uom.uom_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Source</label>
                  <select
                    multiple
                    value={filterSources}
                    onChange={(e) => handleMultiSelect(e, setFilterSources)}
                    className="h-32 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="vendor">Vendor</option>
                    <option value="own">Own</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setFilterCategories([]);
                    setFilterMaterials([]);
                    setFilterUoms([]);
                    setFilterSources([]);
                  }}
                  className="inline-flex text-xs text-gray-600 underline hover:text-gray-800"
                >
                  Clear Filters
                </button>
              </div>

              <button
                type="button"
                onClick={downloadTemplate}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Download Template
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
