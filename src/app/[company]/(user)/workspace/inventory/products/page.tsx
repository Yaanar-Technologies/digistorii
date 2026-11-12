//C:\Users\yanna\template_tailwind\src\app\[company]\masters\products\page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeftIcon, ChevronRightIcon, EyeIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ArchiveBoxArrowDownIcon
} from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { usePagination } from "@/hooks/usePagination";
import ProductFilters from "./components/ProductFilters";

type ProductRow = {
  id: number;
  product_code: string;
  name: string;
  type: "finished_good" | "raw_material" | "other";
  category: string | null;
  material: string | null;
  source: "own" | "vendor";
  variants_count: number;
  status: number;
};

type CategoryRow = {
  id: number;
  path_string?: string | null;
  category_name?: string | null;
  level?: number;
};

type MaterialOption = {
  id: number;
  material_code: string;
  material_name: string;
};

type ImportSheet = {
  sheetName: string;
  headers: string[];
  previewRows: Record<string, unknown>[];
};

type MappingTemplate = {
  id: number;
  template_name: string;
  sheet_name: string;
  mapping_json: {
    templateName?: string;
    sheetName: string;
    fields: Record<string, string>;
  };
};

const PRODUCT_IMPORT_FIELDS = [
  "name",
  "description",
  "category",
  "material",
  "uom",
  "hsn_code",
  "weight",
  "length",
  "width",
  "height",
  "color",
  "size",
  "fitting",
  "gender",
  "parent_sku",
  "sku",
  "low_stock_threshold",
  "backorders_allowed",
  "barcode",
  "qty",
  "warehouse",
  "locator",
] as const;

const REQUIRED_IMPORT_FIELDS = new Set<string>([
  "name",
  "description",
  "hsn_code",
  "color",
  "size",
  "fitting",
  "gender",
]);

const IMPORT_FIELD_LABELS: Record<(typeof PRODUCT_IMPORT_FIELDS)[number], string> = {
  name: "Name",
  description: "Description",
  category: "Category",
  material: "Material",
  uom: "UOM",
  hsn_code: "HSN Code",
  weight: "Weight",
  length: "Length",
  width: "Width",
  height: "Height",
  color: "Color",
  size: "Size",
  fitting: "Fitting",
  gender: "Gender",
  parent_sku: "Parent SKU",
  sku: "SKU",
  low_stock_threshold: "Low Stock Threshold",
  backorders_allowed: "Backorders Allowed",
  barcode: "Barcode",
  qty: "Quantity",
  warehouse: "Warehouse",
  locator: "Locator",
};

export default function ProductsPage() {
  const { company } = useTenant();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);

  const [search, setSearch] = useState("");
  const [type, setItemType] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState<"select" | "mapping" | "preview">("select");
  const [importSheets, setImportSheets] = useState<ImportSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [mappingName, setMappingName] = useState("");
  const [importPreview, setImportPreview] = useState<any>(null);
  const [mappingTemplates, setMappingTemplates] = useState<MappingTemplate[]>([]);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("");
  const productTypeLabel: Record<string, string> = {
    finished_good: "Finished Good",
    raw_material: "Raw Material",
    other: "Other",
  };
  const sourceLabel: Record<string, string> = {
    own: "Own",
    vendor: "Vendor",
  };
  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((row) => {
      const label = String(row.path_string || row.category_name || "").trim();
      if (label) map.set(String(row.id), label);
    });
    return map;
  }, [categories]);
  const materialLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    materials.forEach((item) =>
      map.set(String(item.id), `${item.material_code} - ${item.material_name}`)
    );
    return map;
  }, [materials]);
  const categoryOptions = useMemo(
    () =>
      categories
        .map((row) => {
          const label = String(row.path_string || row.category_name || "").trim();
          return label ? { value: String(row.id), label } : null;
        })
        .filter((option): option is { value: string; label: string } => Boolean(option)),
    [categories]
  );
  const fallbackCategories = useMemo(() => {
    const items = new Set<string>();
    products.forEach((item) => {
      if (item.category && !categoryLabelMap.has(item.category)) items.add(item.category);
    });
    return Array.from(items);
  }, [products, categoryLabelMap]);
  const categoryFilterOptions = useMemo(() => {
    const opts = [...categoryOptions];
    fallbackCategories.forEach((value) => opts.push({ value, label: value }));
    return opts;
  }, [categoryOptions, fallbackCategories]);

  useEffect(() => {
    async function loadCategories() {
      if (!company) return;
      try {
        const res = await apiFetch("/api/categories?format=flat", company);
        const data = await res.json();
        setCategories(data.success ? data.data || [] : []);
      } catch {
        setCategories([]);
      }
    }
    loadCategories();
  }, [company]);

  useEffect(() => {
    async function loadMaterials() {
      if (!company) return;
      try {
        const res = await apiFetch("/api/materials", company);
        const data = await res.json();
        setMaterials(data.success ? data.data || [] : []);
      } catch {
        setMaterials([]);
      }
    }
    loadMaterials();
  }, [company]);

  async function fetchProducts() {
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams({
        search,
        category,
        source,
        status,
        type,
      });
      const res = await apiFetch(`/api/products?${query.toString()}`, company);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch products");
      setProducts(data.products || []);
    } catch (error: any) {
      setMessage(error.message || "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    if (!company) return;
    try {
      const res = await fetch("/api/products/template", {
        headers: { "x-tenant": company },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to download template");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "product-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setMessage(error.message || "Failed to download template");
    }
  }

  async function loadImportMeta() {
    if (!company) return;
    const res = await apiFetch("/api/products/import", company);
    const data = await res.json();
    if (res.ok) setMappingTemplates(data.templates || []);
  }

  useEffect(() => {
    if (!company) return;
    fetchProducts();
    loadImportMeta();
  }, [company, search, category, source, status, type]);

  async function archiveProduct(productId: number) {
    const ok = window.confirm("Archive this product?");
    if (!ok) return;

    setMessage("");
    try {
      const res = await apiFetch(`/api/products/${productId}`, company, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to archive");
      setMessage("Product archived successfully");
      fetchProducts();
    } catch (error: any) {
      setMessage(error.message || "Failed to archive product");
    }
  }

  async function parseWorkbook() {
    if (!importFile) return;
    setImportLoading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("action", "parse");
      form.append("file", importFile);
      const res = await apiFetch("/api/products/import", company, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to parse workbook");
      setImportSheets(data.sheets || []);
      setSelectedSheet(data.sheets?.[0]?.sheetName || "");
      const firstHeaders = data.sheets?.[0]?.headers || [];
      const nextMapping: Record<string, string> = {};
      PRODUCT_IMPORT_FIELDS.forEach((field) => {
        const normalizedField = field.replace(/[^a-z0-9]/g, "");
        const normalizedLabel = IMPORT_FIELD_LABELS[field].toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = firstHeaders.find((header: string) => {
          const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normalizedHeader === normalizedField || normalizedHeader === normalizedLabel;
        });
        if (match) nextMapping[field] = match;
      });
      setFieldMapping(nextMapping);
      setImportStep("mapping");
    } catch (error: any) {
      setMessage(error.message || "Failed to parse workbook");
    } finally {
      setImportLoading(false);
    }
  }

  async function previewImport() {
    if (!importFile || !selectedSheet) return;
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append("action", "preview");
      form.append("file", importFile);
      form.append("mapping", JSON.stringify({ templateName: mappingName, sheetName: selectedSheet, fields: fieldMapping }));
      const res = await apiFetch("/api/products/import", company, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to preview import");
      setImportPreview(data);
      setImportStep("preview");
    } catch (error: any) {
      setMessage(error.message || "Failed to preview import");
    } finally {
      setImportLoading(false);
    }
  }

  async function commitImport() {
    if (!importFile || !selectedSheet) return;
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append("action", "import");
      form.append("file", importFile);
      form.append("mapping", JSON.stringify({ templateName: mappingName, sheetName: selectedSheet, fields: fieldMapping }));
      const res = await apiFetch("/api/products/import", company, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      setMessage(
        data.message ||
        `Uploaded ${data.uploadedRows ?? data.variantCount ?? 0} rows as ${data.productCount ?? 0} products and ${data.variantCount ?? 0} variants.`
      );
      setImportOpen(false);
      setImportFile(null);
      setImportStep("select");
      setImportPreview(null);
      fetchProducts();
      loadImportMeta();
    } catch (error: any) {
      setMessage(error.message || "Import failed");
    } finally {
      setImportLoading(false);
    }
  }

  async function undoLastImport() {
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append("action", "undo");
      const res = await apiFetch("/api/products/import", company, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Undo failed");
      setMessage("Last import undone successfully.");
      fetchProducts();
      loadImportMeta();
    } catch (error: any) {
      setMessage(error.message || "Undo failed");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleBarcodeLookup() {
    const input = String(barcodeValue || "").trim();
    if (!input) return;
    setBarcodeMessage("");
    const res = await apiFetch(`/api/products?barcode_lookup=1&barcode=${encodeURIComponent(input)}`, company);
    const data = await res.json();
    if (!res.ok) {
      setBarcodeMessage(data.message || "Barcode lookup failed");
      return;
    }
    if (data.found && data.product?.id) {
      const params = new URLSearchParams({
        id: String(data.product.id),
        mode: "edit",
      });
      if (data.variant?.id) {
        params.set("variant_id", String(data.variant.id));
      }
      if (data.variant?.barcode) {
        params.set("barcode", String(data.variant.barcode));
      }
      window.location.href = `/${company}/workspace/inventory/products/add-products?${params.toString()}`;
      return;
    }
    window.location.href = `/${company}/workspace/inventory/products/add-products?mode=add&barcode=${encodeURIComponent(input)}`;
  }

  const filteredData = useMemo(() => products, [products]);
  const sortedData = useMemo(() => filteredData, [filteredData]);

  const {
    currentPage,
    itemsPerPage: rowsPerPage,
    setItemsPerPage: setRowsPerPage,
    totalItems,
    totalPages,
    pageNumbers,
    showingFrom,
    showingTo,
    paginatedData,
    goToPage,
    goToPreviousPage,
    goToNextPage,
  } = usePagination({
    data: sortedData,
    initialItemsPerPage: 10,
    resetDeps: [search, type, category, source, status],
  });

  return (
    <div className="space-y-5">
      {loading &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Loading products...</p>
            </div>
          </div>,
          document.body
        )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">Manage products and variants for your business.</p>
        </div>
        <div className="flex items-center gap-2">

          <Link
            href={`/${company}/workspace/inventory/products/add-products`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Add Product
          </Link>
          <button
            onClick={() => setImportOpen(true)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Bulk Import Excel
          </button>
          {/* <button
            onClick={undoLastImport}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Undo Last Import
          </button> */}
        </div>
      </div>

      <ProductFilters
        values={{ search, type, category, source, status }}
        onChange={(next) => {
          setSearch(next.search);
          setItemType(next.type);
          setCategory(next.category);
          setSource(next.source);
          setStatus(next.status || "");
        }}
        categoryOptions={categoryFilterOptions}
        showStatus
        barcodeValue={barcodeValue}
        barcodeMessage={barcodeMessage}
        onBarcodeChange={setBarcodeValue}
        onBarcodeSubmit={handleBarcodeLookup}
      />

      {message ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          {message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Product Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Material</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Variants Count</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && totalItems === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-500" colSpan={9}>
                    No products found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">{item.product_code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-3">
                      {productTypeLabel[item.type] ?? item.type}
                    </td>
                    <td className="px-4 py-3">
                      {item.category ? categoryLabelMap.get(item.category) || item.category : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {item.material
                        ? materialLabelMap.get(item.material) || item.material
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{sourceLabel[item.source] ?? item.source}</td>
                    <td className="px-4 py-3">{item.variants_count || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${item.status === 1
                          ? "bg-green-200 text-black"
                          : "bg-gray-300 text-black"
                          }`}
                      >
                        {item.status === 1 ? "Active" : "Archived"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/${company}/workspace/inventory/products/add-products?id=${item.id}&mode=view`}
                          className="text-indigo-600" title="View Details"    >
                          <EyeIcon className="w-5 h-5" />                        </Link>
                        <Link
                          href={
                            `/${company}/workspace/inventory/products/add-products?id=${item.id}&mode=edit`}
                          className="text-indigo-600" title="Edit Product"
                        >
                          <PencilSquareIcon className="w-5 h-5" />
                        </Link>
                        <button
                          onClick={() => archiveProduct(item.id)}
                          className="text-indigo-600" title="Archive Product"
                        >
                          <ArchiveBoxArrowDownIcon className="h-5 w-5" />

                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-200 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{showingFrom}</span> to{" "}
              <span className="font-medium">{showingTo}</span> of{" "}
              <span className="font-medium">{totalItems}</span> results
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="products-rows-per-page" className="text-sm text-gray-600">
                Rows per page
              </label>
              <select
                id="products-rows-per-page"
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
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
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${currentPage === page
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

      {importOpen ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <button
              onClick={() => {
                setImportOpen(false);
                setImportFile(null);
              }}
              className="absolute right-3 top-3 text-lg text-gray-500 hover:text-gray-700"
              aria-label="Close"
            >
              x
            </button>
            <div className="space-y-4">
              {importStep === "select" ? (
                <>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="inline-flex text-xs text-gray-600 underline hover:text-gray-800"
                  >
                    Download Template
                  </button>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm"
                  />
                  <div className="text-xs text-gray-600">
                    Selected file: {importFile?.name || "No file selected"}
                  </div>
                  {mappingTemplates.length ? (
                    <select
                      value={mappingName}
                      onChange={(e) => {
                        const next = e.target.value;
                        setMappingName(next);
                        const template = mappingTemplates.find((item) => item.template_name === next);
                        if (template) {
                          setSelectedSheet(template.mapping_json.sheetName || template.sheet_name);
                          setFieldMapping(template.mapping_json.fields || {});
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select saved mapping</option>
                      {mappingTemplates.map((item) => (
                        <option key={item.id} value={item.template_name}>
                          {item.template_name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    onClick={parseWorkbook}
                    disabled={!importFile || importLoading}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {importLoading ? "Parsing..." : "Parse Workbook"}
                  </button>
                </>
              ) : null}
              {importStep === "mapping" ? (
                <>
                  <input
                    value={mappingName}
                    onChange={(e) => setMappingName(e.target.value)}
                    placeholder="Mapping template name"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {importSheets.map((sheet) => (
                      <option key={sheet.sheetName} value={sheet.sheetName}>
                        {sheet.sheetName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium text-red-500">*</span> Mandatory fields.
                    SKU or Parent SKU: at least one is required.
                  </p>
                  <div className="grid max-h-72 gap-2 overflow-y-auto">
                    {PRODUCT_IMPORT_FIELDS.map((field) => (
                      <label key={field} className="grid grid-cols-2 items-center gap-2 text-sm">
                        <span>
                          {IMPORT_FIELD_LABELS[field]}
                          {REQUIRED_IMPORT_FIELDS.has(field) ? (
                            <span className="ml-0.5 font-semibold text-red-500">*</span>
                          ) : null}
                          {field === "sku" || field === "parent_sku" ? (
                            <span className="ml-1 text-xs text-amber-600">(one required)</span>
                          ) : null}
                        </span>
                        <select
                          value={fieldMapping[field] || ""}
                          onChange={(e) => setFieldMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          <option value="">Skip</option>
                          {(importSheets.find((sheet) => sheet.sheetName === selectedSheet)?.headers || []).map((header) => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={previewImport}
                    disabled={importLoading}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    Preview Import
                  </button>
                </>
              ) : null}
              {importStep === "preview" ? (
                <>
                  <div className="max-h-72 overflow-y-auto rounded border border-gray-200 p-3 text-xs">
                    <p>Total rows: {importPreview?.totalRows || 0}</p>
                    <p>Valid rows: {importPreview?.validRows || 0}</p>
                    <p>Failed rows: {importPreview?.failedRows || 0}</p>
                    <p>Errors: {importPreview?.rowErrors?.length || 0}</p>
                    {(importPreview?.rowErrors || []).slice(0, 10).map((row: any) => (
                      <p key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join(", ")}</p>
                    ))}
                  </div>
                  <button
                    onClick={commitImport}
                    disabled={importLoading}
                    className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    {importLoading ? "Importing..." : "Confirm Import"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
