//C:\Users\yanna\digistorii\src\app\[company]\(user)\inventory\products\add-products\ProductForm.tsx
"use client";

import Link from "next/link";
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Select } from "antd";
import { PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { useTenant } from "@/context/TenantContext";
import { useNotify } from "@/hooks/useNotify";
import { apiFetch } from "@/lib/apiFetch";
import { normalizeBarcode, validateBarcodeOrThrow } from "@/lib/product-barcode";
import { attachRuleValidationListeners, getRuleValidationError } from "@/lib/formValidationRules";
import '@ant-design/v5-patch-for-react-19';
// import CategoryModal from "../components/CategoryModal";
const CategoryModal = dynamic(() => import("../components/CategoryModal"));
const MaterialModal = dynamic(() => import("../components/MaterialModal"));
const UomModal = dynamic(() => import("../components/UomModal"));
const FittingModal = dynamic(() => import("../components/FittingModal"));
const ColorModal = dynamic(() => import("../components/ColorModal"));
const CategorySelect = dynamic(() => import("../components/CategorySelect"));
const VariantBarcodePrintModal = dynamic(
  () => import("../components/VariantBarcodePrintModal")
);

// import CategorySelect from "../components/CategorySelect";
type Variant = {
  id: number;
  color: string;
  size: string;
  sku: string;
  qty: string;
  low_stock_threshold: string;
  backorders_allowed: boolean | null;
  status: VariantStatus;
  barcode?: string;
};

type ProductImage = {
  id: number;
  image_url: string;
  alt_text: string;
  level: "product" | "variant";
  variantIndex: string;
  is_primary: boolean;
};

type CategoryNode = {
  id: number;
  name: string;
  parent_id?: number | null;
  level: number;
  children?: CategoryNode[];
};

type FlatCategory = {
  id: number;
  label: string;
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

type FittingOption = {
  id: number;
  fitting_name: string;
};

type ColorOption = {
  id: number;
  color_name: string;
  hex_code: string;
};

type ImageMasterItem = {
  name?: string;
  filename?: string;
  file_path?: string;
  size?: number;
  updatedAt?: string;
};

type ProductType = "finished_good" | "raw_material" | "other";

type VariantStatus = "draft" | "active" | "inactive";

export type ProductVariantSummary = {
  variant_id: number;
  color: string;
  sku: string;
  product_id: number;
  product_name: string;
  product_code: string;
};

export type ProductSavedPayload = {
  product_id: number;
  product_code: string;
  product_name: string;
  type: ProductType;
  category: string;
  source: "own" | "vendor";
  status: number;
  description: string;
  uom: string;
  uom_code: string;
  uom_name: string;
  hsn_code: string;
  variants: ProductVariantSummary[];
};

type ProductFormProps = {
  embedded?: boolean;
  embeddedMode?: boolean;
  onSaved?: (product: ProductSavedPayload, options?: { action: "save" | "save_add_new" }) => void;
  productId?: string | null;
  mode?: "add" | "edit" | "view";
  saveMode?: "api" | "local";
  onLocalSave?: (
    payload: { product: any; variants: any[] },
    options?: { action: "save" | "save_add_new" }
  ) => void;
  buttonLabel?: string;
};

const EMPTY_VARIANT: Variant = {
  id: 0,
  color: "",
  size: "",
  sku: "",
  qty: "0",
  low_stock_threshold: "",
  backorders_allowed: null,
  status: "draft",
  barcode: "",
};
const EMPTY_IMAGE: ProductImage = {
  id: 0,
  image_url: "",
  alt_text: "",
  level: "product",
  variantIndex: "0",
  is_primary: false,
};

export function ProductForm({
  embedded = false,
  embeddedMode,
  onSaved,
  productId: productIdOverride,
  mode: modeOverride,
  saveMode = "api",
  onLocalSave,
  buttonLabel,
}: ProductFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notify = useNotify();
  const { company } = useTenant();
  const productId = productIdOverride ?? searchParams.get("id");
  const initialBarcode = searchParams.get("barcode") || "";
  // const mode = modeOverride ?? searchParams.get("mode") || "add";
  // const mode = (modeOverride ?? searchParams.get("mode")) || "add";
  const mode = modeOverride ?? (searchParams.get("mode") || "add");
  const readOnly = mode === "view";
  const isEdit = mode === "edit" && Boolean(productId);

  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productType, setProductType] = useState<ProductType>("finished_good");
  const [category, setCategory] = useState("");
  const [material, setMaterial] = useState("");
  const [uom, setUom] = useState("");
  const [gender, setGender] = useState("");
  const [fittingId, setFittingId] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<"own" | "vendor">("own");
  const [status, setStatus] = useState("1");
  const [variants, setVariants] = useState<Variant[]>([{ ...EMPTY_VARIANT }]);
  const [images, setImages] = useState<ProductImage[]>([{ ...EMPTY_IMAGE, is_primary: true }]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!formRef.current) return;
    const cleanup = attachRuleValidationListeners(formRef.current, (fieldName, message) => {
      setErrors((prev) => {
        if (message) {
          return { ...prev, [fieldName]: message };
        }
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    });
    return cleanup;
  }, []);

  const [categoriesTree, setCategoriesTree] = useState<CategoryNode[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [uomModalOpen, setUomModalOpen] = useState(false);
  const [fittings, setFittings] = useState<FittingOption[]>([]);
  const [fittingModalOpen, setFittingModalOpen] = useState(false);
  const [colors, setColors] = useState<ColorOption[]>([]);
  const [colorModalOpen, setColorModalOpen] = useState(false);
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);
  const [activeColorSearch, setActiveColorSearch] = useState("");
  const [imageMasterFiles, setImageMasterFiles] = useState<ImageMasterItem[]>([]);
  const [categoryRefreshKey, setCategoryRefreshKey] = useState(0);
  const hasLoadedRef = useRef(false);
  const lastProductCodeTypeRef = useRef<ProductType | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printTitle, setPrintTitle] = useState("Barcode Labels");
  const [printVariants, setPrintVariants] = useState<Variant[]>([]);
  const [variantBarcodeErrors, setVariantBarcodeErrors] = useState<Record<number, string>>({});

  const variantStatusOptions: { value: VariantStatus; label: string }[] = [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];

  const variantStatusClass: Record<VariantStatus, string> = {
    draft: "text-gray-600",
    active: "text-green-600",
    inactive: "text-red-600",
  };

  function normalizeVariantStatus(value: any): VariantStatus {
    if (value === "active" || value === "inactive" || value === "draft") {
      return value;
    }
    if (Number(value) === 2) return "inactive";
    if (Number(value) === 1) return "draft";
    return "draft";
  }

  function normalizeImageUrl(url: string) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("/uploads/")) return trimmed;
    if (trimmed.startsWith("uploads/")) return `/${trimmed}`;
    if (!trimmed.includes("/")) {
      const tenantKey = (company || "").trim().toLowerCase();
      if (!tenantKey) return trimmed;
      return `/uploads/${encodeURIComponent(tenantKey)}/image-master/${encodeURIComponent(
        trimmed
      )}`;
    }
    if (trimmed.startsWith("/")) return trimmed;
    return `/uploads/${trimmed}`;
  }

  async function loadProductById(targetId?: string | number) {
    const resolvedId = targetId ?? productId;
    if (!resolvedId) return;
    setMessage("");
    try {
      const res = await apiFetch(`/api/products/${resolvedId}`, company);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch product");

      setName(data.product.name || "");
      setProductCode(data.product.product_code || "");
      const loadedType =
        data.product.type === "raw_material" || data.product.type === "other"
          ? data.product.type
          : "finished_good";
      setProductType(loadedType);
      setCategory(data.product.category || "");
      setMaterial(data.product.material || "");
      setUom(data.product.uom || "");
      const firstVariant = data.variants?.[0];
      setGender(firstVariant?.gender || "");
      setFittingId(firstVariant?.fitting_id ? String(firstVariant.fitting_id) : "");
      setHsnCode(data.product.hsn_code || "");
      setWeight(
        data.product.weight === null || data.product.weight === undefined
          ? ""
          : String(data.product.weight)
      );
      setLength(
        data.product.length === null || data.product.length === undefined
          ? ""
          : String(data.product.length)
      );
      setWidth(
        data.product.width === null || data.product.width === undefined
          ? ""
          : String(data.product.width)
      );
      setHeight(
        data.product.height === null || data.product.height === undefined
          ? ""
          : String(data.product.height)
      );
      setDescription(data.product.description || "");
      setSource(data.product.source === "vendor" ? "vendor" : "own");
      setStatus(String(data.product.status || 1));
      console.log("data variants", data.variants)
      const loadedVariants = (data.variants || []).map((v: any) => ({
        id: v.id,
        color: v.color_id ? String(v.color_id) : "",
        size: v.size || "",
        sku: v.sku || "",
        qty: String(v.qty ?? 0),
        low_stock_threshold: v.low_stock_threshold === null || v.low_stock_threshold === undefined ? "" : String(v.low_stock_threshold),
        backorders_allowed: v.backorders_allowed === null || v.backorders_allowed === undefined ? null : Boolean(v.backorders_allowed),
        status: normalizeVariantStatus(v.status),
        barcode: v.barcode || "",
      }));
      setVariants(
        loadedVariants.length
          ? loadedVariants
          : loadedType === "finished_good"
            ? [{ ...EMPTY_VARIANT }]
            : []
      );

      const variantIdToIndex = new Map<number, number>();
      (data.variants || []).forEach((v: any, index: number) => variantIdToIndex.set(v.id, index));
      console.log("data images", data.images);
      const loadedImages = (data.images || []).map((img: any) => ({
        id: img.id,
        image_url: normalizeImageUrl(img.image_url || ""),
        alt_text: img.alt_text || "",
        level: img.variant_id ? "variant" : "product",
        variantIndex: img.variant_id ? String(variantIdToIndex.get(img.variant_id) ?? 0) : "0",
        is_primary: Boolean(img.is_primary),
      }));
      setImages(loadedImages.length ? loadedImages : [{ ...EMPTY_IMAGE, is_primary: true }]);
    } catch (error: any) {
      notify(error.message || "Failed to load product", { severity: "error" });
    }
  }
  async function loadProduct() {
    await loadProductById();
  }

  async function loadCategories() {
    if (!company) return;
    try {
      const res = await apiFetch("/api/categories?format=tree", company);
      const data = await res.json();
      setCategoriesTree(data.success ? data.data || [] : []);
    } catch {
      setCategoriesTree([]);
    }
  }

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

  async function loadUoms() {
    if (!company) return;
    try {
      const res = await apiFetch("/api/uom", company);
      const data = await res.json();
      setUoms(data.success ? data.data || [] : []);
    } catch {
      setUoms([]);
    }
  }

  async function loadFittings() {
    if (!company) return;
    try {
      const res = await apiFetch("/api/fittings", company);
      const data = await res.json();
      setFittings(data.success ? data.data || [] : []);
    } catch {
      setFittings([]);
    }
  }

  async function loadColors() {
    if (!company) return;
    try {
      const res = await apiFetch("/api/colors", company);
      const data = await res.json();
      setColors(data.success ? data.data || [] : []);
    } catch {
      setColors([]);
    }
  }

  async function loadImageMaster() {
    if (!company) return;
    try {
      const res = await apiFetch("/api/image-master", company);
      const data = await res.json();
      const rows = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.files)
          ? data.files
          : [];
      setImageMasterFiles(res.ok ? rows : []);
    } catch {
      setImageMasterFiles([]);
    }
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleImageUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) {
    if (!company) return;

    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("files", file);

    try {
      const res = await apiFetch("/api/image-master-v2/upload", company, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Upload failed");
      }

      const uploaded = data.data?.[0];
      if (!uploaded) return;

      // 🔥 update master list (so dropdown refreshes)
      await loadImageMaster();

      // 🔥 auto-select uploaded image
      const imageUrl = normalizeImageUrl(`${uploaded.file_path}` || "");
      console.log("uploaded image url", imageUrl);
      updateImage(index, "image_url", imageUrl);
      console.log("updated image url", imageUrl);

      // notify("Image uploaded successfully", { severity: "success" });

    } catch (err: any) {
      notify(err.message || "Upload failed", { severity: "error" });
    } finally {
      e.target.value = ""; // reset input
    }
  }

  useEffect(() => {
    hasLoadedRef.current = false;
    lastProductCodeTypeRef.current = null;
  }, [company]);

  useEffect(() => {
    hasLoadedRef.current = false;
  }, [productId]);

  useEffect(() => {
    if (!company || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    const loadAllData = async () => {
      setPageLoading(true);
      try {
        const tasks = [loadCategories(), loadMaterials(), loadUoms(), loadFittings(), loadColors(), loadImageMaster()];
        if (productId) {
          tasks.push(loadProduct());
        } else {
          await fetchNextProductCode(productType);
          lastProductCodeTypeRef.current = productType;
        }
        await Promise.all(tasks);
      } finally {
        setPageLoading(false);
      }
    };
    loadAllData();
  }, [company, productId, productType]);

  useEffect(() => {
    if (productId || !initialBarcode) return;
    setVariants((prev) =>
      prev.map((variant, index) =>
        index === 0 ? { ...variant, barcode: initialBarcode } : variant
      )
    );
  }, [initialBarcode, productId]);

  function flattenCategories(nodes: CategoryNode[], parentPath: string[] = []): FlatCategory[] {
    const rows: FlatCategory[] = [];
    nodes.forEach((node) => {
      const pathParts = [...parentPath, node.name];
      rows.push({ id: node.id, label: pathParts.join(" > ") });
      if (node.children && node.children.length) {
        rows.push(...flattenCategories(node.children, pathParts));
      }
    });
    return rows;
  }

  const categoryOptions = useMemo(() => {
    return flattenCategories(categoriesTree)
      .map((item) => ({ value: String(item.id), label: item.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [categoriesTree]);

  const materialOptions = useMemo(() => {
    return materials
      .map((item) => {
        const label = `${item.material_code} - ${item.material_name}`;
        return { value: String(item.id), label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [materials]);

  const fittingOptions = useMemo(() => {
    return fittings
      .map((item) => ({ value: String(item.id), label: item.fitting_name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [fittings]);

  const colorOptions = useMemo(() => {
    return colors
      .map((item) => ({ value: String(item.id), label: item.color_name, hex: item.hex_code }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [colors]);

  const uomOptions = useMemo(() => {
    return uoms
      .map((item) => ({
        value: String(item.id),
        label: `${item.uom_code} - ${item.uom_name}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [uoms]);

  const imageMasterOptions = useMemo(() => {
    return imageMasterFiles.map((file) => ({
      value: file.file_path
        ? (() => {
          const rawPath = String(file.file_path || "").trim();
          if (!rawPath) return "";
          if (/^https?:\/\//i.test(rawPath)) return rawPath;
          if (rawPath.startsWith("/uploads/")) return encodeURI(rawPath);
          if (rawPath.startsWith("uploads/")) return encodeURI(`/${rawPath}`);
          return encodeURI(`/uploads/${rawPath.replace(/^\/+/, "")}`);
        })()
        : normalizeImageUrl(file.name || file.filename || ""),
      label: file.name || file.filename || "",
    }));
  }, [company, imageMasterFiles]);

  function addVariant() {
    setVariants((prev) => [...prev, { ...EMPTY_VARIANT }]);
  }

  function removeVariant(index: number) {
    setVariants((prev) => {
      if (productType === "finished_good" && prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function updateVariant(index: number, key: keyof Variant, value: string | boolean | null) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [key]: value } : v)));
  }

  useEffect(() => {
    const next: Record<number, string> = {};
    const seen = new Map<string, number>();
    variants.forEach((variant, index) => {
      const barcode = normalizeBarcode(variant.barcode);
      if (!barcode) return;
      try {
        validateBarcodeOrThrow(barcode);
      } catch (error: any) {
        next[index] = error.message;
        return;
      }
      const duplicateIndex = seen.get(barcode);
      if (duplicateIndex !== undefined) {
        next[index] = "Barcode is duplicated in this form";
        next[duplicateIndex] = "Barcode is duplicated in this form";
        return;
      }
      seen.set(barcode, index);
    });
    setVariantBarcodeErrors(next);
  }, [variants]);

  function addImage() {
    setImages((prev) => [...prev, { ...EMPTY_IMAGE }]);
  }

  function removeImage(index: number) {
    setImages((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateImage(index: number, key: keyof ProductImage, value: string | boolean) {
    setImages((prev) =>
      prev.map((img, i) => {
        if (i !== index) return img;
        if (key === "is_primary" && value === true) {
          return { ...img, is_primary: true };
        }
        return { ...img, [key]: value };
      })
    );
    if (key === "is_primary" && value === true) {
      setImages((prev) => prev.map((img, i) => ({ ...img, is_primary: i === index })));
    }
  }

  async function fetchNextProductCode(nextType: ProductType) {
    if (!company) return;
    try {
      const res = await apiFetch(
        `/api/products?next_code=1&type=${encodeURIComponent(nextType)}`,
        company
      );
      const data = await res.json();
      if (res.ok) {
        setProductCode(String(data.product_code || ""));
      }
    } catch {
      setProductCode("");
    }
  }

  function handleProductTypeChange(nextType: ProductType) {
    setProductType(nextType);
    if (nextType === "finished_good") {
      setVariants((prev) => (prev.length ? prev : [{ ...EMPTY_VARIANT }]));
      setImages((prev) => (prev.length ? prev : [{ ...EMPTY_IMAGE, is_primary: true }]));
    }
  }

  useEffect(() => {
    if (!company || productId) return;
    if (lastProductCodeTypeRef.current === productType) return;
    const loadNextCode = async () => {
      setPageLoading(true);
      try {
        await fetchNextProductCode(productType);
        lastProductCodeTypeRef.current = productType;
      } finally {
        setPageLoading(false);
      }
    };
    loadNextCode();
  }, [company, productId, productType]);

  function resetFormToDefaults() {
    const defaultType: ProductType = "finished_good";
    setName("");
    setProductCode("");
    setProductType(defaultType);
    setCategory("");
    setMaterial("");
    setUom("");
    setHsnCode("");
    setWeight("");
    setLength("");
    setWidth("");
    setHeight("");
    setDescription("");
    setSource("own");
    setStatus("1");
    setVariants([{ ...EMPTY_VARIANT }]);
    setImages([{ ...EMPTY_IMAGE, is_primary: true }]);
    setMessage("");
    if (company) {
      fetchNextProductCode(defaultType);
    }
  }

  async function handleSave(action: "save" | "save_add_new") {
    if (readOnly) return;
    if (!name.trim()) {
      notify("Product name is required", { severity: "warning" });
      return;
    }


    const currentErrors: Record<string, string> = {};
    if (name) {
      const err = getRuleValidationError("alphanumeric-spaces-hyphens", name);
      if (err) currentErrors.name = err;
    }

    if (description) {
      const err = getRuleValidationError("alphanumeric-spaces-hyphens", description);
      if (err) currentErrors.description = err;
    }
    if (hsnCode) {
      const err = getRuleValidationError("numeric-string", hsnCode);
      if (err) currentErrors.hsn_code = err;
    }
    if (weight) {
      const err = getRuleValidationError("decimal-number", weight);
      if (err) currentErrors.weight = err;
    }
    if (length) {
      const err = getRuleValidationError("decimal-number", length);
      if (err) currentErrors.length = err;
    }
    if (width) {
      const err = getRuleValidationError("decimal-number", width);
      if (err) currentErrors.width = err;
    }
    if (height) {
      const err = getRuleValidationError("decimal-number", height);
      if (err) currentErrors.height = err;
    }
    variants.forEach((v, idx) => {
      if (v.color) {
        const err = getRuleValidationError("alphanumeric", v.color);
        if (err) currentErrors[`variant_color_${idx}`] = err;
      }
      if (v.size) {
        const err = getRuleValidationError("alphanumeric", v.size);
        if (err) currentErrors[`variant_size_${idx}`] = err;
      }
    });
    images.forEach((i, idx) => {
      if (i.alt_text) {
        const err = getRuleValidationError("alphanumeric-spaces-hyphens", i.alt_text);
        if (err) currentErrors[`image_alt_text_${idx}`] = err;
      }
    });

    if (Object.keys(currentErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...currentErrors }));
      notify("Please fix validation errors before saving", { severity: "warning" });
      return;
    }


    const cleanedVariants = variants
      .map((v) => ({
        id: v.id,
        color_id: v.color ? Number(v.color) : null,
        gender: gender || null,
        fitting_id: fittingId ? Number(fittingId) : null,
        size: v.size.trim(),
        sku: v.sku.trim(),
        barcode: normalizeBarcode(v.barcode),
        qty: Number(v.qty),
        low_stock_threshold: v.low_stock_threshold === "" || v.low_stock_threshold === null || v.low_stock_threshold === undefined ? null : Number(v.low_stock_threshold),
        backorders_allowed: v.backorders_allowed,
        status: v.status,
      }))
      .filter((v) => v.color_id || v.size || v.sku);

    if (productType === "finished_good" && !cleanedVariants.length) {
      notify("At least one variant is required", { severity: "warning" });
      return;
    }
    if (Object.keys(variantBarcodeErrors).length > 0) {
      notify("Please fix variant barcode errors before saving", { severity: "warning" });
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const productPayload: any = {
        company,
        name,
        type: productType,
        category,
        material,
        description,
        uom,
        hsn_code: hsnCode,
        weight: weight ? Number(weight) : null,
        length: length ? Number(length) : null,
        width: width ? Number(width) : null,
        height: height ? Number(height) : null,
        source,
        status: Number(status),
      };

      if (productType === "finished_good") {
        productPayload.images = images
          .filter((img) => img.image_url.trim())
          .map((img) => ({
            id: img.id,
            image_url: img.image_url.trim(),
            alt_text: img.alt_text.trim(),
            level: img.level,
            variantIndex: img.level === "variant" ? Number(img.variantIndex || 0) : undefined,
            is_primary: img.is_primary,
          }));
      }

      const selectedUom = uoms.find((item) => String(item.id) === String(uom));
      const payload = {
        product: {
          ...productPayload,
          product_code: productCode,
          uom_code: selectedUom?.uom_code || "",
          uom_name: selectedUom?.uom_name || "",
        },
        variants: cleanedVariants,
      };

      if (saveMode === "local") {
        onLocalSave?.(payload, { action });
        if (action === "save_add_new") {
          resetFormToDefaults();
        }
        return;
      }

      const isUpdating = Boolean(productId);
      const endpoint = isUpdating ? `/api/products/${productId}` : "/api/products";
      const method = isUpdating ? "PUT" : "POST";

      const res = await apiFetch(endpoint, company, {
        method,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save product");

      const savedProductId = isUpdating ? Number(productId) : Number(data.product?.id);
      const savedProductCode = isUpdating
        ? productCode
        : String(data.product?.product_code || productCode || "");

      const responseVariants = Array.isArray(data?.variants) ? data.variants : [];
      const variantsPayload: ProductVariantSummary[] = responseVariants
        .map((variant: any) => ({
          variant_id: Number(variant.variant_id ?? variant.id),
          sku: String(variant.sku || ""),
          product_id: Number(variant.product_id ?? savedProductId),
          product_name: String(variant.product_name || name),
          product_code: String(variant.product_code || savedProductCode),
        }))
        .filter((variant: any) => Number.isFinite(variant.variant_id) && variant.variant_id > 0);

      const savedPayload: ProductSavedPayload = {
        product_id: savedProductId,
        product_code: savedProductCode,
        product_name: name,
        type: productType,
        category,
        source,
        status: Number(status),
        description,
        uom,
        uom_code: selectedUom?.uom_code || "",
        uom_name: selectedUom?.uom_name || "",
        hsn_code: hsnCode,
        variants: variantsPayload,
      };

      if (action !== "save_add_new") {
        await loadProductById(savedProductId);
      }

      if (isUpdating) {
        // setMessage("Product updated successfully");
        notify("Product updated successfully", { severity: "success" });
        if (embedded && productId) {
          onSaved?.(savedPayload, { action });
        }
        if (!embedded) {
          router.push(`/${company}/workspace/inventory/products`);
        }
      } else {
        notify("Product saved successfully", { severity: "success" });
        if (embedded) {
          onSaved?.(savedPayload, { action });
        } else if (action === "save") {
          if (!embedded) {
            router.push(`/${company}/workspace/inventory/products`);
          }
        }
      }

      if (!isUpdating && action === "save_add_new") {
        resetFormToDefaults();
      }
    } catch (error: any) {
      notify(error.message || "Failed to save product", { severity: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await handleSave("save");
  }

  return (
    <div className="space-y-5">
      {(pageLoading || loading) &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-white/70 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Loading product...</p>
            </div>
          </div>,
          document.body
        )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {readOnly ? "View Product" : isEdit ? "Edit Product" : "Add Product"}
          </h1>
          <p className="text-sm text-gray-500">
            Create product details, variants, and image mappings.
          </p>
        </div>
        {!embedded ? (
          <Link
            href={`/${company}/workspace/inventory/products`}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Back to Products
          </Link>
        ) : null}
      </div>

      {message ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          {message}
        </div>
      ) : null}

      <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Section 1 - Basic Info</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">Product Code</label>
              <input
                value={productCode}
                readOnly
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Product Name <span className="text-red-500">*</span></label>
              <input
                data-rules="alphanumeric-spaces-hyphens"
                data-field="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
              />{errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select
                value={productType}
                onChange={(e) =>
                  handleProductTypeChange(
                    e.target.value === "raw_material" || e.target.value === "other"
                      ? e.target.value
                      : "finished_good"
                  )
                }
                disabled={readOnly}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
              >
                <option value="finished_good">Finished Good</option>
                <option value="raw_material">Raw Material</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
              <div className="flex items-center gap-2">
                <CategorySelect
                  value={category || undefined}
                  onChange={(value) => setCategory(String(value))}
                  disabled={readOnly}
                  className="w-full font-sans"
                  reloadKey={categoryRefreshKey}

                />
                <Button
                  icon={<PlusOutlined />}
                  type="default"
                  onClick={() => setCategoryModalOpen(true)}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Material</label>
              <div className="flex items-center gap-2">
                <Select
                  showSearch
                  placeholder="Select Material"
                  value={material || undefined}
                  onChange={(value) => setMaterial(String(value))}
                  options={materialOptions}
                  disabled={readOnly}
                  filterOption={(input, option) =>
                    String(option?.label ?? "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  className="w-full font-sans"
                  getPopupContainer={(triggerNode) => triggerNode.parentNode}
                />
                <Button
                  icon={<PlusOutlined />}
                  type="default"
                  onClick={() => setMaterialModalOpen(true)}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">UOM</label>
              <div className="flex items-center gap-2">
                <Select
                  showSearch
                  placeholder="Select UOM"
                  value={uom || undefined}
                  onChange={(value) => setUom(String(value))}
                  options={uomOptions}
                  disabled={readOnly}
                  filterOption={(input, option) =>
                    String(option?.label ?? "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  className="w-full font-sans"
                  getPopupContainer={(triggerNode) => triggerNode.parentNode}
                />
                <Button
                  icon={<PlusOutlined />}
                  type="default"
                  onClick={() => setUomModalOpen(true)}
                  disabled={readOnly}
                />
              </div>
            </div>
            {productType === "finished_good" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    disabled={readOnly}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Transgender">Transgender</option>
                    <option value="Not Specified">Not Specified</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Fitting</label>
                  <div className="flex items-center gap-2">
                    <Select
                      showSearch
                      placeholder="Select Fitting"
                      value={fittingId || undefined}
                      onChange={(value) => setFittingId(String(value))}
                      options={fittingOptions}
                      disabled={readOnly}
                      filterOption={(input, option) =>
                        String(option?.label ?? "")
                          .toLowerCase()
                          .includes(input.toLowerCase())
                      }
                      className="w-full font-sans"
                      getPopupContainer={(triggerNode) => triggerNode.parentNode}
                    />
                    <Button
                      icon={<PlusOutlined />}
                      type="default"
                      onClick={() => setFittingModalOpen(true)}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value === "vendor" ? "vendor" : "own")}
                disabled={readOnly}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
              >
                <option value="own">Own</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">HSN Code</label>
              <input
                data-rules="numeric-string"
                data-field="hsn_code"
                data-optional="true"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                disabled={readOnly}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:bg-gray-100 ${errors.hsn_code ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-blue-500"}`}
              />
              {errors.hsn_code && <p className="text-red-500 text-xs mt-1">{errors.hsn_code}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                data-rules="alphanumeric-spaces-hyphens"
                data-field="description"
                data-optional="true"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
              />{errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Weight</label>
              <input
                type="number"
                data-rules="decimal-number"
                data-field="weight"
                data-optional="true"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                disabled={readOnly}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:bg-gray-100 ${errors.weight ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-blue-500"}`}
              />
              {errors.weight && <p className="text-red-500 text-xs mt-1">{errors.weight}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Length</label>
              <input
                type="number"
                data-rules="decimal-number"
                data-field="length"
                data-optional="true"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                disabled={readOnly}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:bg-gray-100 ${errors.length ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-blue-500"}`}
              />
              {errors.length && <p className="text-red-500 text-xs mt-1">{errors.length}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Width</label>
              <input
                type="number"
                data-rules="decimal-number"
                data-field="width"
                data-optional="true"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                disabled={readOnly}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:bg-gray-100 ${errors.width ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-blue-500"}`}
              />
              {errors.width && <p className="text-red-500 text-xs mt-1">{errors.width}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Height</label>
              <input
                type="number"
                data-rules="decimal-number"
                data-field="height"
                data-optional="true"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                disabled={readOnly}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:bg-gray-100 ${errors.height ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-blue-500"}`}
              />
              {errors.height && <p className="text-red-500 text-xs mt-1">{errors.height}</p>}
            </div>
            {isEdit ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={readOnly}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
                >
                  <option value="1">Active</option>
                  <option value="2">Archived</option>
                </select>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Section 2 - Variants</h2>
            <div className="flex items-center gap-2">
              {variants.some((variant) => Boolean(variant.id)) ? (
                <button
                  type="button"
                  onClick={() => {
                    setPrintTitle("All Variant Barcodes");
                    setPrintVariants(variants.filter((variant) => Boolean(variant.id)));
                    setPrintModalOpen(true);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Print All Barcodes
                </button>
              ) : null}
              {!readOnly ? (
                <button
                  type="button"
                  onClick={addVariant}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  + Add Variant
                </button>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2">Color</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">SKU (optional)</th>
                  <th className="px-3 py-2">Barcode</th>
                  <th className="px-3 py-2">Low Stock Threshold</th>
                  <th className="px-3 py-2">Backorders Allowed</th>
                  <th className="px-3 py-2">Status</th>
                  {!readOnly ? <th className="px-3 py-2">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {variants.length === 0 ? (
                  <tr className="border-t border-gray-100">
                    <td
                      colSpan={readOnly ? 7 : 8}
                      className="px-3 py-3 text-sm text-gray-500"
                    >
                      No variants added yet.
                    </td>
                  </tr>
                ) : (
                  variants.map((variant, index) => (
                    <tr key={index} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        {variant.id ? (
                          <span className="block text-sm text-gray-800">
                            {colorOptions.find((c) => c.value === String(variant.color))?.label || variant.color || "-"}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Select
                              showSearch
                              placeholder="Select Color"
                              value={variant.color || undefined}
                              onChange={(val) => updateVariant(index, "color", String(val))}
                              options={colorOptions}
                              disabled={readOnly}
                              filterOption={(input, option) =>
                                String(option?.label ?? "")
                                  .toLowerCase()
                                  .includes(input.toLowerCase())
                              }
                              className={`w-full font-sans ${errors[`variant_color_${index}`] ? "border-red-500 rounded" : ""}`}
                              getPopupContainer={(triggerNode) => triggerNode.parentNode}
                            />
                            <Button
                              icon={<PlusOutlined />}
                              type="default"
                              size="small"
                              onClick={() => {
                                setActiveColorIndex(index);
                                setColorModalOpen(true);
                              }}
                              disabled={readOnly}
                            />
                          </div>
                        )}
                        {errors[`variant_color_${index}`] && <span className="block text-[11px] text-red-500 mt-1">{errors[`variant_color_${index}`]}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {variant.id ? (
                          <span className="block text-sm text-gray-800">
                            {variant.size || "-"}
                          </span>
                        ) : (
                          <>
                            <input
                              data-rules="alphanumeric"
                              data-field={`variant_size_${index}`}
                              data-optional="true"
                              value={variant.size}
                              onChange={(e) => updateVariant(index, "size", e.target.value)}
                              disabled={readOnly}
                              className={`w-full rounded border px-2 py-1 disabled:bg-gray-100 ${errors[`variant_size_${index}`] ? "border-red-500" : "border-gray-300"}`}
                            />
                            {errors[`variant_size_${index}`] && <span className="block text-[11px] text-red-500 mt-1">{errors[`variant_size_${index}`]}</span>}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {variant.id ? (
                          <span className="block text-sm text-gray-800">
                            {variant.sku || "-"}
                          </span>
                        ) : (
                          <input
                            value={variant.sku}
                            onChange={(e) => updateVariant(index, "sku", e.target.value)}
                            disabled={readOnly}
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={variant.barcode || ""}
                          onChange={(e) => updateVariant(index, "barcode", e.target.value)}
                          disabled={readOnly}
                          placeholder="Scan or enter barcode"
                          className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs disabled:bg-gray-100"
                        />
                        <span className="mt-1 block text-[11px] italic text-gray-400">
                          Leave blank to auto-generate internal barcode
                        </span>
                        {variantBarcodeErrors[index] ? (
                          <span className="mt-1 block text-[11px] text-red-500">
                            {variantBarcodeErrors[index]}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={variant.low_stock_threshold}
                          onChange={(e) =>
                            updateVariant(index, "low_stock_threshold", e.target.value)
                          }
                          disabled={readOnly}
                          className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={variant.backorders_allowed === null ? "inherit" : (variant.backorders_allowed ? "allow" : "deny")}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateVariant(
                              index,
                              "backorders_allowed",
                              val === "inherit" ? null : (val === "allow" ? true : false)
                            );
                          }}
                          disabled={readOnly}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none disabled:bg-gray-100"
                        >
                          <option value="inherit">Inherit</option>
                          <option value="allow">Allow</option>
                          <option value="deny">Deny</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={variant.status}
                          onChange={(e) =>
                            updateVariant(
                              index,
                              "status",
                              normalizeVariantStatus(e.target.value)
                            )
                          }
                          disabled={readOnly}
                          className={`w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none disabled:bg-gray-100 ${variantStatusClass[variant.status]}`}
                        >
                          {variantStatusOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              className={variantStatusClass[option.value]}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      {!readOnly ? (
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => removeVariant(index)}
                              disabled={Boolean(variant.id)}
                              title={variant.id ? "Cannot delete a saved variant" : undefined}
                              className={`rounded border px-2 py-1 text-xs ${variant.id
                                ? "cursor-not-allowed border-gray-200 text-gray-400"
                                : "border-red-200 text-red-600 hover:bg-red-50"
                                }`}
                            >
                              Remove
                            </button>
                            {variant.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPrintTitle("Variant Barcode");
                                  setPrintVariants([variant]);
                                  setPrintModalOpen(true);
                                }}
                                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                title="Print barcode"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <PrinterOutlined />
                                  Print
                                </span>
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <VariantBarcodePrintModal
          open={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          variants={printVariants}
          productName={name}
          title={printTitle}
        />

        {productType === "finished_good" ? (
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Section 3 - Images</h2>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={addImage}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  + Add Image
                </button>
              ) : null}
            </div>
            <div className="space-y-3">
              {images.map((image, index) => (
                <div key={index} className="rounded-lg border border-gray-200 p-3">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="md:col-span-2 space-y-1">
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Image From Master
                      </label>
                      <div className="flex items-center gap-2">
                        <Select
                          showSearch
                          allowClear
                          placeholder="Select image"
                          value={image.image_url || undefined}
                          onChange={(value) =>
                            updateImage(index, "image_url", String(value || ""))
                          }
                          options={imageMasterOptions}
                          optionLabelProp="label"
                          disabled={readOnly}
                          filterOption={(input, option) =>
                            String(option?.label ?? "")
                              .toLowerCase()
                              .includes(input.toLowerCase())
                          }
                          className="w-full font-sans"
                          getPopupContainer={(triggerNode) => triggerNode.parentNode}
                        />
                        <Button icon={<PlusOutlined />} type="default" onClick={() => fileInputRef.current?.click()} />
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        hidden
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, index)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Alt Text
                      </label>
                      <input
                        data-rules="alphanumeric-spaces-hyphens"
                        data-field="alt_text"
                        data-optional="true"
                        value={image.alt_text}
                        onChange={(e) => updateImage(index, "alt_text", e.target.value)}
                        disabled={readOnly}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                      />              {errors.alt_text && <p className="text-red-500 text-xs mt-1">{errors.alt_text}</p>}

                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Tag As
                      </label>
                      <select
                        value={image.level}
                        onChange={(e) =>
                          updateImage(
                            index,
                            "level",
                            e.target.value === "variant" ? "variant" : "product"
                          )
                        }
                        disabled={readOnly}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                      >
                        <option value="product">Product-level</option>
                        <option value="variant">Variant-specific</option>
                      </select>
                    </div>
                    {image.level === "variant" ? (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Variant Row
                        </label>
                        <select
                          value={image.variantIndex}
                          onChange={(e) => updateImage(index, "variantIndex", e.target.value)}
                          disabled={readOnly}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                        >
                          {variants.map((_, vIndex) => (
                            <option key={vIndex} value={String(vIndex)}>
                              Variant {vIndex + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div className="flex items-end gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={image.is_primary}
                          onChange={(e) => updateImage(index, "is_primary", e.target.checked)}
                          disabled={readOnly}
                        />
                        Primary Image
                      </label>
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!readOnly ? (
          <div className="flex justify-between pt-6 border-t border-gray-100">
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Saving..." : buttonLabel || (isEdit ? "Update Product" : "Save Product")}
              </button>
              {!isEdit ? (
                <button
                  type="button"
                  onClick={() => handleSave("save_add_new")}
                  disabled={loading}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {buttonLabel ? `${buttonLabel} & Add Another` : "Save & Add New"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      <CategoryModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onSaved={async (id) => {
          await loadCategories();
          if (id) {
            setCategory(String(id));
            setCategoryRefreshKey((prev) => prev + 1);
          }
          setCategoryModalOpen(false);
        }}
        categoryOptions={categoryOptions}
      />
      <MaterialModal
        open={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        onSaved={async (id) => {
          await loadMaterials();
          if (id) setMaterial(String(id));
          setMaterialModalOpen(false);
        }}
      />
      <UomModal
        open={uomModalOpen}
        onClose={() => setUomModalOpen(false)}
        onSaved={async (id) => {
          await loadUoms();
          if (id) setUom(String(id));
          setUomModalOpen(false);
        }}
      />
      <FittingModal
        open={fittingModalOpen}
        onClose={() => setFittingModalOpen(false)}
        onSaved={async (id) => {
          await loadFittings();
          if (id) setFittingId(String(id));
          setFittingModalOpen(false);
        }}
      />
      <ColorModal
        open={colorModalOpen}
        onClose={() => {
          setColorModalOpen(false);
          setActiveColorIndex(null);
        }}
        onSaved={async (id) => {
          await loadColors();
          if (id && activeColorIndex !== null) {
            updateVariant(activeColorIndex, "color", String(id));
          }
          setColorModalOpen(false);
          setActiveColorIndex(null);
        }}
      />
      <VariantBarcodePrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title={printTitle}
        variants={printVariants}
      />
    </div>
  );
}
