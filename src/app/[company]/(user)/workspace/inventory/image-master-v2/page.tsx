"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeftIcon, ChevronRightIcon,MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { usePagination } from "@/hooks/usePagination";
import { useNotify } from "@/hooks/useNotify";
import { useProductLookup } from "@/hooks/useProductLookup";
import ProductLookupModal from "@/components/product/ProductLookupModal";
import type { ProductLookupItem } from "@/lib/product-lookup";
import { CategoryNode, flattenCategories } from "../products/components/category-utils";

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

type ImageRow = {
  id: number;
  filename: string;
  file_path: string;
  category_id: number | null;
  material_id: number | null;
  uom_id: number | null;
  source: "own" | "vendor" | null;
  category_label: string | null;
  material_label: string | null;
  uom_label: string | null;
  status: "linked" | "unlinked" | "untagged";
  is_linked?: boolean;
  linked_sku: string | null;
};

type AutoMatchItem = {
  image_id: number;
  filename: string;
  file_path: string;
  product_id: number;
  variant_id: number;
  sku: string;
  barcode: string | null;
  product_name: string;
  match_type: string;
  match_value: string;
};

type Summary = {
  total: number;
  linked: number;
  unlinked: number;
  untagged: number;
  unlinked_tagged?: number;
  unlinked_untagged?: number;
};

type TagPatch = {
  category_id?: number | null;
  material_id?: number | null;
  uom_id?: number | null;
  source?: "own" | "vendor" | null;
};

function LazyThumbnail({
  src,
  alt,
  rootRef,
}: {
  src: string;
  alt: string;
  rootRef: { current: HTMLDivElement | null };
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: rootRef.current, rootMargin: "100px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [rootRef]);

  return (
    <div ref={ref} className="h-12 w-12 rounded-md border border-gray-200 bg-gray-50">
      {visible ? (
        <img src={src} alt={alt} loading="lazy" className="h-12 w-12 rounded-md object-cover" />
      ) : null}
    </div>
  );
}

export default function ImageMasterV2Page() {
  const { company } = useTenant();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const notify = useNotify();
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    linked: 0,
    unlinked: 0,
    untagged: 0,
  });

  const [categoriesTree, setCategoriesTree] = useState<CategoryNode[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | "tagged" | "untagged">("all");
  const [stateFilter, setStateFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [templateReviewOpen, setTemplateReviewOpen] = useState(false);
  const [templateMode, setTemplateMode] = useState<"link" | "create">("link");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkTargetImageIds, setLinkTargetImageIds] = useState<number[]>([]);
  const [selectedProductItem, setSelectedProductItem] = useState<ProductLookupItem | null>(null);
  const [linking, setLinking] = useState(false);

  const [autoMatchOpen, setAutoMatchOpen] = useState(false);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [autoMatchConfirming, setAutoMatchConfirming] = useState(false);
  const [autoMatches, setAutoMatches] = useState<AutoMatchItem[]>([]);
  const [autoMatchUnmatched, setAutoMatchUnmatched] = useState(0);
  const [selectedAutoMatchIds, setSelectedAutoMatchIds] = useState<Set<number>>(new Set());

  const productLookup = useProductLookup({
    enabled: linkModalOpen,
    itemsPerPage: 10,
  });

  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkMaterial, setBulkMaterial] = useState("");
  const [bulkUom, setBulkUom] = useState("");
  const [bulkSource, setBulkSource] = useState("");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  const flatCategories = useMemo(() => flattenCategories(categoriesTree), [categoriesTree]);
  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    flatCategories.forEach((row) => map.set(String(row.id), row.path));
    return map;
  }, [flatCategories]);
  const materialLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    materials.forEach((item) =>
      map.set(String(item.id), `${item.material_code} - ${item.material_name}`)
    );
    return map;
  }, [materials]);
  const categoryOptions = useMemo(
    () => flatCategories.map((row) => ({ value: String(row.id), label: row.path })),
    [flatCategories]
  );
  const materialOptions = useMemo(
    () => materials.map((item) => ({ value: String(item.id), label: `${item.material_code} - ${item.material_name}` })),
    [materials]
  );
  const selectedCategoryLabel = useMemo(
    () => (categoryFilter !== "all" ? categoryLabelMap.get(categoryFilter) : null),
    [categoryFilter, categoryLabelMap]
  );
  const selectedMaterialLabel = useMemo(
    () => (materialFilter !== "all" ? materialLabelMap.get(materialFilter) : null),
    [materialFilter, materialLabelMap]
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = term
        ? row.filename.toLowerCase().includes(term) ||
          row.file_path.toLowerCase().includes(term)
        : true;

      if (!matchesSearch) return false;

      const isTagged =
        row.category_id != null &&
        row.material_id != null &&
        row.uom_id != null &&
        row.source != null;
      const isLinked = Boolean(row.is_linked ?? row.status === "linked");

      if (stageFilter === "tagged" && !isTagged) return false;
      if (stageFilter === "untagged" && isTagged) return false;

      if (stateFilter === "linked" && !isLinked) return false;
      if (stateFilter === "unlinked" && isLinked) return false;

    // Category filter
    if (categoryFilter !== "all") {
      const categoryMatch =
        String(row.category_id) === categoryFilter ||
        (selectedCategoryLabel != null && row.category_label === selectedCategoryLabel);
      if (!categoryMatch) return false;
    }
    if (materialFilter !== "all" && row.material_id !== Number(materialFilter)) {
      return false;
    }
      return true;
    });
  }, [rows, search, stageFilter, stateFilter, categoryFilter, materialFilter, selectedCategoryLabel, selectedMaterialLabel]);

  const sortedRows = useMemo(() => filteredRows, [filteredRows]);

  const {
    currentPage,
    itemsPerPage: rowsPerPage,
    setItemsPerPage: setRowsPerPage,
    totalItems,
    totalPages,
    pageNumbers,
    showingFrom,
    showingTo,
    paginatedData: paginatedRows,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  } = usePagination({
    data: sortedRows,
    initialItemsPerPage: 10,
    resetDeps: [search, stageFilter, stateFilter, categoryFilter, materialFilter],
  });

  useEffect(() => {
    if (!company) return;
    let active = true;
    setLoading(true);

    const loadAll = async () => {
      try {
        const [categoriesRes, materialsRes, uomsRes, imageRes] = await Promise.all([
          apiFetch("/api/categories?format=tree", company),
          apiFetch("/api/materials", company),
          apiFetch("/api/uom", company),
          apiFetch("/api/image-master-v2", company),
        ]);

        const [categoriesData, materialsData, uomsData, imageData] = await Promise.all([
          categoriesRes.json(),
          materialsRes.json(),
          uomsRes.json(),
          imageRes.json(),
        ]);

        if (!active) return;

        if (categoriesData?.success) setCategoriesTree(categoriesData.data || []);
        if (materialsData?.success) setMaterials(materialsData.data || []);
        if (uomsData?.success) setUoms(uomsData.data || []);

        if (imageData?.success) {
          setRows(imageData.data || []);
          setSummary((prev) => imageData.summary || prev);
        }
      } catch (error: any) {
        if (!active) return;
        notify(error.message || "Failed to load Image Master data.",{ severity: "error" });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAll();
    return () => {
      active = false;
    };
  }, [company]);

  async function refreshImageMaster() {
    if (!company) return;
    try {
      const res = await apiFetch("/api/image-master-v2", company);
      const data = await res.json();
      if (data?.success) {
        setRows(data.data || []);
        setSummary((prev) => data.summary || prev);
      }
    } catch (error: any) {
      notify(error.message || "Failed to refresh list.",{ severity: "error" });
    }
  }

  function toggleSelection(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      if (!checked) return new Set();
      const next = new Set(prev);
      paginatedRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  async function applyTagsToSelection() {
    if (!company) return;
    if (selectedIds.size === 0) {
      notify("Select at least one image to apply tags.",{severity: "warning"});
      return;
    }

    const patch: TagPatch = {};
    if (bulkCategory) patch.category_id = Number(bulkCategory);
    if (bulkMaterial) patch.material_id = Number(bulkMaterial);
    if (bulkUom) patch.uom_id = Number(bulkUom);
    if (bulkSource) patch.source = bulkSource === "vendor" ? "vendor" : "own";

    if (!Object.keys(patch).length) {
      notify("Choose at least one tag value to apply.",{severity: "warning"});
      return;
    }

    try {
      const res = await apiFetch("/api/image-master-v2/tags", company, {
        method: "PATCH",
        body: JSON.stringify({
          image_ids: Array.from(selectedIds),
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update tags");
      setTagModalOpen(false);
      setBulkCategory("");
      setBulkMaterial("");
      setBulkUom("");
      setBulkSource("");
      await refreshImageMaster();
      notify(`Updated ${data.updated || 0} image(s).`);
    } catch (error: any) {
      notify(error.message || "Failed to update tags.",{ severity: "error" });
    }
  }

  async function updateInlineTag(id: number, patch: TagPatch) {
    if (!company) return;
    const previous = rows;
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
    try {
      const res = await apiFetch("/api/image-master-v2/tags", company, {
        method: "PATCH",
        body: JSON.stringify({
          image_ids: [id],
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update tag");
      await refreshImageMaster();
    } catch (error: any) {
      setRows(previous);
      notify(error.message || "Failed to update tag.",{ severity: "error" });
    }
  }

  async function handleUpload() {
    if (!company || selectedFiles.length === 0) return;
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      selectedFiles.forEach((file) => form.append("files", file));
      const res = await apiFetch("/api/image-master-v2/upload", company, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      const uploadedIds = Array.isArray(data?.data)
        ? data.data.map((row: { id: number }) => Number(row.id)).filter((id: number) => Number.isFinite(id))
        : [];
      setSelectedFiles([]);
      setUploadOpen(false);
      await refreshImageMaster();
      if (uploadedIds.length) {
        setSelectedIds(new Set(uploadedIds));
        setTagModalOpen(true);
        notify(`Uploaded ${uploadedIds.length} image(s). Select tags for this batch.`);
      } else {
        notify(`Uploaded ${data.data?.length || 0} image(s).`);
      }
    } catch (error: any) {
      notify(error.message || "Upload failed.",{ severity: "error" });
    } finally {
      setUploading(false);
    }
  }

  function openLinkModal(imageIds: number[]) {
    if (!imageIds.length) {
      notify("Select at least one image to link.", { severity: "warning" });
      return;
    }
    setLinkTargetImageIds(imageIds);
    setSelectedProductItem(null);
    productLookup.resetFilters();
    setLinkModalOpen(true);
  }

  async function handleConfirmLink() {
    if (!company || !selectedProductItem || linkTargetImageIds.length === 0) {
      notify("Select a product variant to link.", { severity: "warning" });
      return;
    }
    setLinking(true);
    try {
      const res = await apiFetch("/api/image-master-v2/link", company, {
        method: "POST",
        body: JSON.stringify({
          image_ids: linkTargetImageIds,
          product_id: selectedProductItem.product_id,
          variant_id: selectedProductItem.variant_id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to link images");
      }
      setLinkModalOpen(false);
      setSelectedProductItem(null);
      setLinkTargetImageIds([]);
      setSelectedIds(new Set());
      await refreshImageMaster();
      notify(
        `Linked ${data.linked_count ?? linkTargetImageIds.length} image(s) to ${selectedProductItem.sku}.`,
        { severity: "success" }
      );
    } catch (error: any) {
      notify(error.message || "Failed to link images.", { severity: "error" });
    } finally {
      setLinking(false);
    }
  }

  async function handlePreviewAutoMatch() {
    if (!company) return;
    setAutoMatchLoading(true);
    try {
      const query =
        selectedIds.size > 0
          ? `?action=auto-match&image_ids=${Array.from(selectedIds).join(",")}`
          : "?action=auto-match";
      const res = await apiFetch(`/api/image-master-v2/link${query}`, company);
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to preview auto-matches");
      }
      const matches: AutoMatchItem[] = Array.isArray(data.matches) ? data.matches : [];
      setAutoMatches(matches);
      setAutoMatchUnmatched(Number(data.unmatched_count || 0));
      setSelectedAutoMatchIds(new Set(matches.map((m) => m.image_id)));
      setAutoMatchOpen(true);
    } catch (error: any) {
      notify(error.message || "Failed to auto-match images.", { severity: "error" });
    } finally {
      setAutoMatchLoading(false);
    }
  }

  async function handleConfirmAutoMatch() {
    if (!company) return;
    const chosen = autoMatches.filter((m) => selectedAutoMatchIds.has(m.image_id));
    if (!chosen.length) {
      notify("Select at least one match to link.", { severity: "warning" });
      return;
    }
    setAutoMatchConfirming(true);
    try {
      const res = await apiFetch("/api/image-master-v2/link", company, {
        method: "POST",
        body: JSON.stringify({
          matches: chosen.map((m) => ({
            image_id: m.image_id,
            product_id: m.product_id,
            variant_id: m.variant_id,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to link auto-matched images");
      }
      setAutoMatchOpen(false);
      setAutoMatches([]);
      setSelectedAutoMatchIds(new Set());
      setSelectedIds(new Set());
      await refreshImageMaster();
      notify(`Linked ${data.linked_count ?? chosen.length} image(s) to existing products.`, {
        severity: "success",
      });
    } catch (error: any) {
      notify(error.message || "Failed to link auto-matched images.", { severity: "error" });
    } finally {
      setAutoMatchConfirming(false);
    }
  }

  async function downloadTemplate(
    scope: "all" | "tagged" | "selected",
    mode: "create" | "link" = "create"
  ) {
    if (!company) return;
    setMessage("");
    try {
      if (scope === "selected" && selectedIds.size === 0) {
        notify("Select at least one image to generate template.", { severity: "warning" });
        return;
      }

      const res =
        scope === "selected"
          ? await apiFetch("/api/image-master-v2/template", company, {
              method: "POST",
              body: JSON.stringify({
                mode,
                image_ids: Array.from(selectedIds),
              }),
            })
          : await apiFetch(
              `/api/image-master-v2/template?scope=${scope}&mode=${mode}`,
              company
            );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        notify(data?.message || "Failed to download template",{ severity: "error" });
        return;
      }
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        mode === "link"
          ? "image-master-link-template.xlsx"
          : "image-master-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error: any) {
      notify(error.message || "Failed to download template.",{ severity: "error" });
    }
  }

  async function importTemplate() {
    if (!company || !importFile) return;
    setImportLoading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await apiFetch("/api/image-master-v2/import", company, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        const errorText = Array.isArray(data?.errors) ? data.errors.join(" ") : data.message;
        notify(errorText || "Import failed",{ severity: "error" });
      }

          if (!data?.success) {
      notify(data?.errors?.join(", ") || "Import failed", {
        severity: "error",
      });
      return;
    }
      const warningCount = Array.isArray(data?.warnings) ? data.warnings.length : 0;
      const linkedCount = Number(data?.linked_images || 0);
      const createdCount = Number(data?.inserted_products || 0);

      const message = `Linked ${linkedCount} image${linkedCount === 1 ? "" : "s"} to existing products and created ${createdCount} new product${createdCount === 1 ? "" : "s"}`;

      if (warningCount > 0) {
        notify(`${message} with ${warningCount} warning${warningCount > 1 ? "s" : ""}`, {
          severity: "warning",
        });
      } else {
        notify(message, { severity: "success" });
      }

      setImportOpen(false);
      setImportFile(null);
      await refreshImageMaster();
    } catch (error: any) {
      notify(error.message || "Import failed.",{ severity: "error" });
    } finally {
      setImportLoading(false);
    }
  }

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    paginatedRows.length > 0 && paginatedRows.every((row) => selectedIds.has(row.id));

  return (
    <div className="space-y-6">
      {loading &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Loading Images...</p>
            </div>
          </div>,
          document.body
        )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Image Master</h1>
          <p className="text-sm text-gray-500">
            Stage images before linking them to products and bulk import via Excel.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedCount > 0 ? (
            <button
              onClick={() => openLinkModal(Array.from(selectedIds))}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Link to Existing Product ({selectedCount})
            </button>
          ) : null}
          <button
            onClick={handlePreviewAutoMatch}
            disabled={autoMatchLoading}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            {autoMatchLoading ? "Matching..." : "Auto-Match by SKU"}
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Upload Images
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"          >
            Import Excel
          </button>
          <div className="relative">
    <button 
    onClick={() => setMenuOpen((prev) => !prev)}
    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
      ⋮
    </button>
           {menuOpen && (
    <div className="absolute right-0 mt-2 w-44 rounded-lg border bg-white shadow-lg z-50">
      <button
        onClick={() => {
          setTagModalOpen(true);
          setMenuOpen(false);
        }}
        className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
      >
        Manage Tags
      </button>

      <button
        onClick={() => {
          setTemplateReviewOpen(true);
          setMenuOpen(false);
        }}
        className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
      >
        Download Template
      </button>
    </div>
  )}
  </div>
  </div>
</div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Total Images</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.total}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Unlinked Images</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.unlinked}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Already Linked</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.linked}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Untagged</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.untagged}</div>
        </div>
      </div>
      {message ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          {message}
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
  <div className="grid gap-3 md:grid-cols-5">
    
    {/* Search */}
    <div className="relative">
                <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by image name..."
        className="w-full rounded-lg border border-gray-300 px-10 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>

    {/* Stage */}
    <select
      value={stageFilter}
      onChange={(e) => setStageFilter(e.target.value as "all" | "tagged" | "untagged")}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
    >
      <option value="all">All Stage</option>
      <option value="tagged">Tagged</option>
      <option value="untagged">Untagged</option>
    </select>

    {/* State */}
    <select
      value={stateFilter}
      onChange={(e) => setStateFilter(e.target.value as "all" | "linked" | "unlinked")}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
    >
      <option value="all">All State</option>
      <option value="linked">Linked</option>
      <option value="unlinked">Unlinked</option>
    </select>

    {/* Category */}
    <select
      value={categoryFilter}
      onChange={(e) => setCategoryFilter(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
    >
      <option value="all">All Categories</option>
      {categoryOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>

    {/* Material */}
    <select
      value={materialFilter}
      onChange={(e) => setMaterialFilter(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
    >
      <option value="all">All Materials</option>
      {materialOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>

  </div>
</div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div
          ref={listRef}
          className="max-h-[600px] overflow-y-auto"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Thumbnail</th>
                  <th className="px-4 py-3 font-medium">Filename</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">UOM</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Linked To (SKU)</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-gray-500">
                      No images found.
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={(e) => toggleSelection(row.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <LazyThumbnail
                          src={`/uploads/${row.file_path}`}
                          alt={row.filename}
                          rootRef={listRef}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.filename}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.category_id != null
                          ? categoryLabelMap.get(String(row.category_id)) ?? row.category_label ?? "-"
                          : row.category_label ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.material_id != null
                          ? materialLabelMap.get(String(row.material_id)) ?? row.material_label ?? "-"
                          : row.material_label ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.uom_label || "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{row.source || "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            row.status === "linked"
                              ? "bg-green-100 text-green-700"
                              : row.status === "untagged"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{row.linked_sku || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {!(row.is_linked ?? row.status === "linked") ? (
                          <button
                            type="button"
                            onClick={() => openLinkModal([row.id])}
                            className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Link
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Linked</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="border-t border-gray-200 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{showingFrom}</span> to{" "}
              <span className="font-medium">{showingTo}</span> of{" "}
              <span className="font-medium">{totalItems}</span> results
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="image-master-rows-per-page" className="text-sm text-gray-600">
                Rows per page
              </label>
              <select
                id="image-master-rows-per-page"
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                type="button"
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>

            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-end">
              <nav aria-label="Pagination" className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                <button
                  type="button"
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>

                {pageNumbers.map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${page}`}
                      type="button"
                      onClick={() => goToPage(page)}
                      aria-current={currentPage === page ? "page" : undefined}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${
                        currentPage === page
                          ? "z-10 bg-indigo-600 text-white"
                          : "text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {tagModalOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Manage Tags</h3>
                <p className="text-sm text-gray-500">
                  Apply category, material, UOM, and source to selected images.
                </p>
              </div>
              <button
                onClick={() => setTagModalOpen(false)}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Category</label>
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
                >
                  <option value="">No change</option>
                  {flatCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.path}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Material </label>
                <select
                  value={bulkMaterial}
                  onChange={(e) => setBulkMaterial(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
                >
                  <option value="">No change</option>
                  {materials.map((mat) => (
                    <option key={mat.id} value={mat.id}>
                      {mat.material_code} - {mat.material_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">UOM</label>
                <select
                  value={bulkUom}
                  onChange={(e) => setBulkUom(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
                >
                  <option value="">No change</option>
                  {uoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.uom_code} - {uom.uom_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Source</label>
                <select
                  value={bulkSource}
                  onChange={(e) => setBulkSource(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
                >
                  <option value="">No change</option>
                  <option value="own">Own</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between border-t px-6 py-4">
              <span className="text-sm text-gray-500">
                Selected: {selectedCount} image{selectedCount === 1 ? "" : "s"}
              </span>
              <button
                onClick={applyTagsToSelection}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Apply Tags
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {uploadOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Upload Images</h3>
                <p className="text-sm text-gray-500">
                  Select multiple images to stage. You can tag the batch after upload.
                </p>
              </div>
              <button
                onClick={() => setUploadOpen(false)}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                className="block w-full text-sm"
              />
              <div className="text-xs text-gray-500">
                Selected files: {selectedFiles.length || "None"}
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading || selectedFiles.length === 0}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {uploading ? "Uploading..." : "Upload Images"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Import Excel Template</h3>
                <p className="text-sm text-gray-500">
                  Upload a filled template to create products and link images.
                </p>
              </div>
              <button
                onClick={() => setImportOpen(false)}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="block w-full text-sm"
              />
              <div className="text-xs text-gray-500">
                Selected file: {importFile?.name || "None"}
              </div>
              <button
                onClick={importTemplate}
                disabled={!importFile || importLoading}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {importLoading ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {templateReviewOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Template Review</h3>
                <p className="text-sm text-gray-500">
                  Choose whether to link images to existing products or create new products.
                </p>
              </div>
              <button
                onClick={() => setTemplateReviewOpen(false)}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {summary.unlinked_tagged ?? 0} images tagged, {summary.unlinked_untagged ?? 0} untagged.
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setTemplateMode("link")}
                  className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                    templateMode === "link"
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Option A: Link Existing
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateMode("create")}
                  className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                    templateMode === "create"
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Option B: Create New
                </button>
              </div>

              {templateMode === "link" ? (
                <div className="grid gap-3">
                  <p className="text-xs text-gray-500">
                    Generates an Excel sheet with unlinked images and a Target SKU dropdown (SKU - Product Name &amp; Barcode).
                  </p>
                  <button
                    onClick={async () => {
                      await downloadTemplate("all", "link");
                      setTemplateReviewOpen(false);
                    }}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Download Link Template (All Unlinked)
                  </button>
                  <button
                    onClick={async () => {
                      await downloadTemplate("tagged", "link");
                      setTemplateReviewOpen(false);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Download Link Template (Tagged Only)
                  </button>
                  <button
                    onClick={async () => {
                      await downloadTemplate("selected", "link");
                      setTemplateReviewOpen(false);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Download Link Template (Selected Images)
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  <button
                    onClick={async () => {
                      await downloadTemplate("tagged", "create");
                      setTemplateReviewOpen(false);
                    }}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Generate template with tagged images only
                  </button>
                  <button
                    onClick={async () => {
                      await downloadTemplate("all", "create");
                      setTemplateReviewOpen(false);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Generate template with all unlinked images
                  </button>
                  <button
                    onClick={async () => {
                      await downloadTemplate("selected", "create");
                      setTemplateReviewOpen(false);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Generate template with selected images
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <ProductLookupModal
        open={linkModalOpen}
        onClose={() => {
          if (!linking) setLinkModalOpen(false);
        }}
        onAddSelected={handleConfirmLink}
        items={productLookup.paginatedItems}
        allItems={productLookup.items}
        loading={productLookup.loading || linking}
        filters={productLookup.filters}
        onFiltersChange={productLookup.setFilters}
        categoryOptions={productLookup.categoryOptions}
        page={productLookup.page}
        totalPages={productLookup.totalPages}
        itemsPerPage={productLookup.itemsPerPage}
        totalCount={productLookup.totalCount}
        onPageChange={productLookup.setPage}
        isSelected={(item) => selectedProductItem?.variant_id === item.variant_id}
        onToggle={(item) => {
          setSelectedProductItem((prev) =>
            prev?.variant_id === item.variant_id ? null : item
          );
        }}
        onToggleAll={() => {}}
        selectedCount={selectedProductItem ? 1 : 0}
        showBarcodeInput={true}
        maxSelection={1}
        title={`Link ${linkTargetImageIds.length} Image${linkTargetImageIds.length === 1 ? "" : "s"} to Existing Product`}
      />

      {autoMatchOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Auto-Match by SKU / Barcode</h3>
                <p className="text-sm text-gray-500">
                  Found {autoMatches.length} match{autoMatches.length === 1 ? "" : "es"}
                  {autoMatchUnmatched > 0 ? ` (${autoMatchUnmatched} unmatched)` : ""}.
                </p>
              </div>
              <button
                onClick={() => setAutoMatchOpen(false)}
                disabled={autoMatchConfirming}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {autoMatches.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
                  No unlinked image filenames matched any existing SKU or barcode.
                </div>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={
                            autoMatches.length > 0 &&
                            autoMatches.every((m) => selectedAutoMatchIds.has(m.image_id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAutoMatchIds(new Set(autoMatches.map((m) => m.image_id)));
                            } else {
                              setSelectedAutoMatchIds(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Filename</th>
                      <th className="px-3 py-2 font-medium">Matched SKU</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">Match Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoMatches.map((match) => (
                      <tr key={match.image_id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedAutoMatchIds.has(match.image_id)}
                            onChange={(e) => {
                              setSelectedAutoMatchIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(match.image_id);
                                else next.delete(match.image_id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-800">{match.filename}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">{match.sku}</td>
                        <td className="px-3 py-2 text-gray-700">{match.product_name}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            {match.match_type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between border-t px-6 py-4">
              <span className="text-sm text-gray-500">
                Selected: {selectedAutoMatchIds.size} of {autoMatches.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoMatchOpen(false)}
                  disabled={autoMatchConfirming}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAutoMatch}
                  disabled={autoMatchConfirming || selectedAutoMatchIds.size === 0}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {autoMatchConfirming
                    ? "Linking..."
                    : `Confirm & Link (${selectedAutoMatchIds.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
