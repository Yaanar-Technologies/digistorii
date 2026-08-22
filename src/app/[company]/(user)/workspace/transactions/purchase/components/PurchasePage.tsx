"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRuleValidationError } from "@/lib/formValidationRules";
import { createPortal } from "react-dom";
import { useTenant } from "@/context/TenantContext";
import { useUser } from "@/context/CurrentUserContext";
import { useNotify } from "@/hooks/useNotify";
import AddProductModal from "./AddProductModal";
import PurchaseHeaderForm from "./PurchaseHeaderForm";
import PurchaseItemsTable from "./PurchaseItemsTable";
import TotalsSection from "./TotalsSection";
import ProductLookupModal from "@/components/product/ProductLookupModal";
import { usePurchaseItems } from "./usePurchaseItems";
import { calculateLineItem, calculateTotals } from "./utils/purchaseCalculations";
import { useProductLookup } from "@/hooks/useProductLookup";
import type { ProductLookupItem } from "@/lib/product-lookup";
import type {
  Currency,
  DespatchTerm,
  PaymentTerm,
  ProductCatalogItem,
  PurchaseDetail,
  PurchaseHeader,
  Supplier,
  Warehouse,
  LocationOption,
} from "./types";

type LocalProductSavePayload = {
  product: {
    name?: string;
    type?: "finished_good" | "raw_material" | "other";
    category?: string;
    material?: string;
    source?: "own" | "vendor";
    description?: string;
    uom?: string;
    uom_code?: string;
    uom_name?: string;
    hsn_code?: string;
    product_code?: string;
  };
  variants: Array<{
    id?: number;
    color?: string;
    color_id?: number | null;
    gender?: string | null;
    fitting_id?: number | null;
    size?: string;
    sku?: string;
    barcode?: string;
    qty?: number;
    low_stock_threshold?: number;
    backorders_allowed?: boolean;
    status?: string;
  }>;
};

type TempProductCatalogItem = ProductCatalogItem & {
  temp_variant_id: string;
  newProduct: {
    name: string;
    sku: string;
    categoryId: string;
    materialId: string | null;
    source: "own" | "vendor";
  };
  rawVariant?: {
    color_id?: number | null;
    gender?: string | null;
    fitting_id?: number | null;
    size?: string;
    sku?: string;
    qty?: number;
    low_stock_threshold?: number;
    backorders_allowed?: boolean;
    status?: string;
    barcode?: string;
  };
};

export default function PurchasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const purchaseId = searchParams.get("id");
  const renewFromId = searchParams.get("renewFrom");
  const isRenewMode = !!renewFromId;
  const isEdit = !!purchaseId && !isRenewMode;
  const { company } = useTenant();
  const { user } = useUser();
  const notify = useNotify();
  const initialHeader: PurchaseHeader = {
    po_type: "standard",
    purchase_no: "", ref_no: "",
    bill_to: "",
    ship_to: "",
    despatch_terms: "",
    payment_terms: "",
    freight_charges: 0,
    freight_tax: 0,
    freight_tax_amount: 0,
    packaging_amount: 0,
    notes: "",
    attachment_url: "",
    supplier_id: "",
    purchase_date: new Date().toISOString().split("T")[0],
    req_date: "",
    status: "Awaiting for approval",
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    currency: "",
    conversion_rate: "",
    user_name: "",
  };

  const [header, setHeader] = useState<PurchaseHeader>(initialHeader);

  const {
    items: lookupItems,
    loading: lookupLoading,
    filters: lookupFilters,
    setFilters: setLookupFilters,
    page: lookupPage,
    setPage: setLookupPage,
    totalPages: lookupTotalPages,
    itemsPerPage: lookupItemsPerPage,
    paginatedItems: lookupPaginatedItems,
    totalCount: lookupTotalCount,
    categoryOptions: lookupCategoryOptions,
    resetFilters: resetLookupFilters,
  } = useProductLookup({
    enabled: Boolean(company) && Boolean(header.supplier_id),
    lookupType: "po_supplier_lookup",
    supplierId: header.supplier_id
  });
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [allDespatchTerms, setAllDespatchTerms] = useState<DespatchTerm[]>([]);
  const [allPaymentTerms, setAllPaymentTerms] = useState<PaymentTerm[]>([]);
  const [allCurrencies, setAllCurrencies] = useState<Currency[]>([]);
  const [allTaxes, setAllTaxes] = useState<any[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [allLocations, setAllLocations] = useState<LocationOption[]>([]);
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [showProductPopup, setShowProductPopup] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "additional">("items");
  const [productsList, setProductsList] = useState<ProductCatalogItem[]>([]);
  const [tempProducts, setTempProducts] = useState<TempProductCatalogItem[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductLookupItem[]>([]);
  const [popupError, setPopupError] = useState("");
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("");

  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeHandlerRef = useRef<(value: string) => void>(() => { });
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasLogged = useRef(false);
  const hasLoggedTenant = useRef(false);

  const isRejected =
    String(header.approval_status || "").toLowerCase() === "rejected" ||
    String(header.status || "").toLowerCase() === "rejected";
  const isEditable = !header.approval_status || header.approval_status === "Awaiting for approval";
  const combinedProducts = useMemo(
    () => [...productsList, ...tempProducts],
    [productsList, tempProducts]
  );

  const { items: details, setItems, updateRow, removeRow, handleTaxChange, applyBulkUpdates, totals } =
    usePurchaseItems({
      initialItems: [],
      productsList: combinedProducts,
      allTaxes,
      setErrors,
    });

  useEffect(() => {
    if (!user?.name || hasLogged.current) return;
    hasLogged.current = true;
    setHeader((prev) => {
      if (prev.user_name === user.name) return prev;
      return { ...prev, user_name: user.name };
    });
  }, [user?.name]);

  useEffect(() => {
    if (!company || hasLoggedTenant.current) return;
    hasLoggedTenant.current = true;
    console.log("Company:", company);
  }, [company]);

  const toTenantKey = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

  const productTypeLabel: Record<string, string> = {
    finished_good: "Finished Good",
    raw_material: "Raw Material",
    other: "Other",
  };

  useEffect(() => {
    const mapped = lookupItems.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_code: item.product_code || item.code,
      name: item.name,
      type: (item.type || "finished_good") as ProductCatalogItem["type"],
      category: item.category_name || null,
      source: (item.source || "own") as ProductCatalogItem["source"],
      status: 1,
      description: item.description || "",
      uom: item.uom || "",
      uom_code: item.uom_code || "",
      uom_name: item.uom_name || "",
      hsn_code: item.hsn_code || "",
      sku: item.sku || "",
      color: item.color || "",
      barcode: item.barcode || "",
    }));
    setProductsList(mapped);
  }, [lookupItems]);


  const getSupplierAddress = (supplier?: Supplier | null) => {
    if (!supplier) return "";
    return [
      supplier.address_line1,
      supplier.address_line2,
      supplier.address_line3,
      supplier.city,
      supplier.state,
      supplier.pincode,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const getCurrencyCode = (currencyId: string) => {
    if (!currencyId) return "";
    const item = allCurrencies.find((c) => String(c.id) === String(currencyId));
    return item?.currency_code || "";
  };

  const toggleProduct = (product: ProductLookupItem) => {
    setSelectedProducts((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) return prev.filter((p) => p.id !== product.id);
      return [...prev, product];
    });
  };

  const addSelectedProducts = () => {
    if (selectedProducts.length === 0) {
      setPopupError("Please select at least one product to add.");
      return;
    }

    setItems((prev) => {
      const updated = [...prev];
      for (const p of selectedProducts) {
        const existingIndex = updated.findIndex((row) => String(row.product_id) === String(p.id));
        if (existingIndex >= 0) {
          const nextQty = Number(updated[existingIndex].qty || 0) + 1;
          updated[existingIndex] = calculateLineItem({
            ...updated[existingIndex],
            qty: nextQty,
          });
          continue;
        }

        const newRow: PurchaseDetail = {
          product_id: String(p.id),
          product_code: p.product_code || p.code,
          product_name: p.name,
          description: p.description || "",
          uom: p.uom || "",
          uom_code: p.uom_code || "",
          uom_name: p.uom_name || "",
          hsn_no: p.hsn_code || "",
          rate: 0,
          qty: 0,
          amount: 0,
          tax_percent: 0,
          tax_amount: 0,
          line_total: 0,
          tax_id: null,
          tax_name: "",
          type: p.type,
        };
        updated.push(calculateLineItem(newRow));
      }
      return updated;
    });

    setPopupError("");
    setErrors((prev: any) => ({
      ...prev,
      details: "",
    }));

    setShowProductPopup(false);
    setSelectedProducts([]);
    resetLookupFilters();
  };

  const addOrIncrementByBarcode = useCallback(
    (barcode: string) => {
      const normalized = String(barcode || "").trim();
      if (!normalized) return false;
      const match = combinedProducts.find((p) => String(p.barcode || "") === normalized);
      if (!match) return false;
      const resolvedProductId = String((match as any).temp_variant_id || match.id);

      setItems((prev) => {
        const updated = [...prev];
        const existingIndex = updated.findIndex((row) => String(row.product_id) === resolvedProductId);
        if (existingIndex >= 0) {
          const nextQty = Number(updated[existingIndex].qty || 0) + 1;
          updated[existingIndex] = calculateLineItem({
            ...updated[existingIndex],
            qty: nextQty,
          });
          return updated;
        }

        const newRow: PurchaseDetail = {
          product_id: resolvedProductId,
          product_code: match.product_code,
          product_name: match.name,
          description: match.description || "",
          uom: match.uom || "",
          uom_code: match.uom_code || "",
          uom_name: match.uom_name || "",
          hsn_no: match.hsn_code || "",
          rate: 0,
          qty: 1,
          amount: 0,
          tax_percent: 0,
          tax_amount: 0,
          line_total: 0,
          tax_id: null,
          tax_name: "",
          type: match.type,
        };
        return [...updated, calculateLineItem(newRow)];
      });

      setErrors((prev: any) => ({
        ...prev,
        details: "",
      }));

      return true;
    },
    [combinedProducts, setItems, setErrors]
  );

  const handleBarcodeSubmit = useCallback(
    (value?: string) => {
      const input = String(value ?? barcodeValue).trim();
      if (!input) return;
      const found = addOrIncrementByBarcode(input);
      if (!found) {
        setBarcodeMessage(`Barcode "${input}" not found.`);
      } else {
        setBarcodeMessage("");
      }
      setBarcodeValue("");
      setTimeout(() => barcodeInputRef.current?.focus(), 0);
    },
    [addOrIncrementByBarcode, barcodeValue]
  );

  useEffect(() => {
    barcodeHandlerRef.current = (value: string) => {
      handleBarcodeSubmit(value);
    };
  }, [handleBarcodeSubmit]);

  const closePopup = () => {
    setShowProductPopup(false);
    resetLookupFilters();
    setSelectedProducts([]);
  };

  const handleLocalProductSaved = (
    localPayload: LocalProductSavePayload,
    meta?: { action: "save" | "save_add_new" }
  ) => {
    const productName = String(localPayload?.product?.name || "").trim();
    if (!productName) return;
    const baseTempId = `temp-${Date.now()}`;
    const productCode = String(localPayload?.product?.product_code || `TMP-${Date.now()}`).trim();
    const description = String(localPayload?.product?.description || "");
    const uom = String(localPayload?.product?.uom || "");
    const uomCode = String(localPayload?.product?.uom_code || "");
    const uomName = String(localPayload?.product?.uom_name || "");
    const hsnNo = String(localPayload?.product?.hsn_code || "");
    const categoryId = String(localPayload?.product?.category || "").trim();
    const materialId = String(localPayload?.product?.material || "").trim();
    const source = localPayload?.product?.source === "vendor" ? "vendor" : "own";
    const type =
      localPayload?.product?.type === "raw_material" || localPayload?.product?.type === "other"
        ? localPayload.product.type
        : "finished_good";

    const variants =
      Array.isArray(localPayload?.variants) && localPayload.variants.length
        ? localPayload.variants
        : [{ sku: "" }];

    const tempCatalogItems: TempProductCatalogItem[] = variants.map((variant, index) => {
      const tempVariantId = `${baseTempId}-v${index + 1}`;
      const sku = String(variant?.sku || "").trim();
      return {
        id: -(Date.now() + index),
        product_id: -(Date.now() + index),
        product_code: productCode,
        name: productName,
        type,
        category: categoryId || null,
        source,
        status: 1,
        description,
        uom,
        uom_code: uomCode,
        uom_name: uomName,
        hsn_code: hsnNo,
        sku,
        color: String(variant?.color || variant?.color_id || ""),
        barcode: String(variant?.barcode || ""),
        temp_variant_id: tempVariantId,
        newProduct: {
          name: productName,
          sku,
          categoryId,
          materialId: materialId || null,
          source,
        },
        rawVariant: {
          color_id: variant?.color_id || null,
          gender: variant?.gender || null,
          fitting_id: variant?.fitting_id || null,
          size: variant?.size || "NA",
          sku,
          qty: variant?.qty ?? 0,
          low_stock_threshold: variant?.low_stock_threshold ?? 5,
          backorders_allowed: variant?.backorders_allowed ?? false,
          status: variant?.status || "draft",
          barcode: variant?.barcode || "",
        },
      };
    });

    setTempProducts((prev) => [...prev, ...tempCatalogItems]);

    const newRows = tempCatalogItems.map((item) =>
      calculateLineItem({
        product_id: item.temp_variant_id,
        temp_id: item.temp_variant_id,
        is_new: true,
        product_code: item.product_code,
        product_name: item.name,
        description: item.description || "",
        uom: item.uom || "",
        uom_code: item.uom_code || "",
        uom_name: item.uom_name || "",
        hsn_no: item.hsn_code || "",
        rate: 0,
        qty: 1,
        amount: 0,
        tax_percent: 0,
        tax_amount: 0,
        line_total: 0,
        tax_id: null,
        tax_name: "",
        type: item.type,
      } as PurchaseDetail)
    );

    if (newRows.length) {
      setItems((prev) => [...prev, ...newRows]);
      setErrors((prev: any) => ({
        ...prev,
        details: "",
      }));
    }

    if (meta?.action !== "save_add_new") {
      setShowAddProductModal(false);
    }
  };


  useEffect(() => {
    if (!company) return;
    if (eventSourceRef.current) return;
    console.log("Loading barcode scan event source for company 352:", company);
    const source = new EventSource(`/api/barcode-scan?tenant=${encodeURIComponent(company)}`);
    eventSourceRef.current = source;
    source.onmessage = (event) => {
      const payload = String(event.data || "").trim();
      if (payload) barcodeHandlerRef.current(payload);
    };
    return () => {
      source.close();
      eventSourceRef.current = null;
    };
  }, [company]);

  // useEffect(() => {
  //   if (!company) return;
  //   let active = true;
  //   const loadData = async () => {
  //     setPageLoading(true);
  //     try {
  //       const [
  //         suppliersRes,
  //         taxesRes,
  //         despatchRes,
  //         paymentRes,
  //         currencyRes,
  //         purchaseNoRes,
  //       ] = await Promise.all([
  //         fetch("/api/suppliers", { headers: { "x-tenant": company } }),
  //         fetch("/api/tax-master", { headers: { "x-tenant": company } }),
  //         fetch("/api/despatch-terms", { headers: { "x-tenant": company } }),
  //         fetch("/api/payment-terms", { headers: { "x-tenant": company } }),
  //         fetch("/api/currencies", { headers: { "x-tenant": company } }),
  //         !isEdit && header.po_type === "standard"
  //           ? fetch("/api/purchase/generateNo", { headers: { "x-tenant": company } })
  //           : Promise.resolve(null),
  //       ]);

  //       const suppliersData = await suppliersRes.json();
  //       const taxesData = await taxesRes.json();
  //       const despatchData = await despatchRes.json();
  //       const paymentData = await paymentRes.json();
  //       const currencyData = await currencyRes.json();
  //       const purchaseNoData = purchaseNoRes ? await purchaseNoRes.json() : null;

  //       if (!active) return;

  //       setAllSuppliers(Array.isArray(suppliersData) ? suppliersData : suppliersData.data || []);
  //       setAllDespatchTerms(despatchData?.data || []);
  //       setAllPaymentTerms(paymentData?.data || []);
  //       setAllCurrencies(currencyData?.data || []);
  //       setAllTaxes(taxesData?.data || []);

  //       if (purchaseNoData?.purchase_no && header.po_type === "standard") {
  //         setHeader((prev) => ({ ...prev, purchase_no: purchaseNoData.purchase_no }));
  //       }
  //       console.log("Loaded initial data for purchase page 407:");
  //       console.log("Suppliers:", suppliersData);
  //       console.log("Despatch Terms:", despatchData);
  //       console.log("Payment Terms:", paymentData);
  //       console.log("Currencies:", currencyData);
  //       console.log("Taxes:", taxesData);
  //       console.log("Generated Purchase No:", purchaseNoData?.purchase_no);
  //     } catch (err) {
  //       console.error("Failed to load purchase data", err);
  //     } finally {
  //       if (active) setPageLoading(false);
  //     }
  //   };

  //   loadData();
  //   return () => {
  //     active = false;
  //   };
  // }, [company, isEdit, header.po_type]);


  useEffect(() => {
    if (!company) return;
    let active = true;
    const loadMasters = async () => {
      setPageLoading(true);
      try {
        const [
          suppliersRes,
          taxesRes,
          despatchRes,
          paymentRes,
          currencyRes,
          warehousesRes,
          locationsRes,
        ] = await Promise.all([
          fetch("/api/suppliers", { headers: { "x-tenant": company } }),
          fetch("/api/tax-master", { headers: { "x-tenant": company } }),
          fetch("/api/despatch-terms", { headers: { "x-tenant": company } }),
          fetch("/api/payment-terms", { headers: { "x-tenant": company } }),
          fetch("/api/currencies", { headers: { "x-tenant": company } }),
          fetch("/api/warehouses", { headers: { "x-tenant": company } }),
          fetch("/api/locations", { headers: { "x-tenant": company } }),
        ]);

        const suppliersData = await suppliersRes.json();
        const taxesData = await taxesRes.json();
        const despatchData = await despatchRes.json();
        const paymentData = await paymentRes.json();
        const currencyData = await currencyRes.json();
        const warehousesData = await warehousesRes.json();
        const locationsData = await locationsRes.json();
        if (!active) return;
        setAllSuppliers(Array.isArray(suppliersData) ? suppliersData : suppliersData.data || []);
        setAllDespatchTerms(despatchData?.data || []);
        setAllPaymentTerms(paymentData?.data || []);
        setAllCurrencies(currencyData?.data || []);
        setAllTaxes(taxesData?.data || []);
        setAllWarehouses(warehousesData?.data || []);
        setAllLocations(locationsData?.data || []);
        
        if (user?.warehouse_id) {
          setSelectedWarehouseId(String(user.warehouse_id));
        }
      } catch (err) {
        console.error("Failed to load purchase data", err);
      } finally {
        if (active) setPageLoading(false);
      }
    };
    console.log("Loading master data for purchase page:", company);
    loadMasters();
    return () => {
      active = false;
    };
  }, [company]);

  useEffect(() => {
    if (!company) return;
    if (isEdit || isRenewMode) return;
    if (header.po_type !== "standard") return;

    const generateNumber = async () => {
      const res = await fetch("/api/purchase/generateNo", {
        headers: { "x-tenant": company },
      });

      const data = await res.json();

      if (data?.purchase_no) {
        setHeader((prev) => ({
          ...prev,
          purchase_no: data.purchase_no,
        }));
      }
    };
    console.log("Generating purchase number for new purchase:", company);
    generateNumber();
  }, [company, isEdit, isRenewMode, header.po_type]);

  useEffect(() => {
    if (!company) return;
    if (!purchaseId && !renewFromId) return;
    let active = true;

    const loadPurchase = async () => {
      setPageLoading(true);
      try {
        const sourceId = purchaseId || renewFromId;
        const res = await fetch(`/api/purchase/${sourceId}`, {
          headers: { "x-tenant": company },
        });
        const result = await res.json();
        if (!active) return;

        if (result?.success && result?.data?.header) {
          const sourceHeader = result.data.header;
          const sourceStatus = String(sourceHeader?.status || "").toLowerCase();
          const sourceApprovalStatus = String(sourceHeader?.approval_status || "").toLowerCase();
          const sourceRejected = sourceStatus === "rejected" || sourceApprovalStatus === "rejected";

          let generatedPurchaseNo = "";
          if (isRenewMode && sourceHeader.po_type === "standard") {
            const purchaseNoRes = await fetch("/api/purchase/generateNo", {
              headers: { "x-tenant": company },
            });
            const purchaseNoData = await purchaseNoRes.json();
            generatedPurchaseNo = purchaseNoData?.purchase_no || "";
          }

          const headerData: PurchaseHeader = isRenewMode
            ? {
              ...initialHeader,
              ...sourceHeader,
              id: undefined,
              purchase_no: generatedPurchaseNo,
              ref_no: "",
              purchase_date: new Date().toISOString().split("T")[0],
              req_date: sourceHeader.req_date?.split("T")[0] || "",
              despatch_terms: sourceHeader.despatch_terms
                ? String(Number(sourceHeader.despatch_terms))
                : "",
              payment_terms: sourceHeader.payment_terms
                ? String(Number(sourceHeader.payment_terms))
                : "",
              approval_status: undefined,
              status: "",
              renewed_from_po_id: Number(sourceHeader.id),
              renewed_from_purchase_no: sourceHeader.purchase_no || null,
            }
            : {
              ...initialHeader,
              ...sourceHeader,
              purchase_date: sourceHeader.purchase_date?.split("T")[0] || initialHeader.purchase_date,
              req_date: sourceHeader.req_date?.split("T")[0] || "",
            };

          if (isRenewMode) {
            console.log("Renew mapped values", {
              despatch_terms: headerData.despatch_terms,
              payment_terms: headerData.payment_terms,
              purchase_no: headerData.purchase_no,
            });
          }

          if (isRenewMode && !sourceRejected) {
            notify("Only rejected purchase orders can be renewed", {
              severity: "error",
            });
            router.push(`/${company}/workspace/transactions/purchase`);
            return;
          }

          setHeader(headerData);
        }

        if (result?.success && Array.isArray(result?.data?.details)) {
          const mappedRows = result.data.details.map((row: PurchaseDetail) =>
            calculateLineItem(
              isRenewMode
                ? {
                  ...row,
                  id: undefined,
                }
                : row
            )
          );
          setItems(mappedRows);
        }
      } catch (err) {
        console.error("Failed to load purchase", err);
      } finally {
        if (active) setPageLoading(false);
      }
    };

    loadPurchase();
    return () => {
      active = false;
    };
  }, [company, purchaseId, renewFromId, isRenewMode, notify, router, setItems]);

  const freightTaxAmount = useMemo(() => {
    const freightCharges = Number(header.freight_charges || 0);
    const freightTaxPercent = Number(header.freight_tax || 0);
    return Number(((freightCharges * freightTaxPercent) / 100).toFixed(2));
  }, [header.freight_charges, header.freight_tax]);

  const totalsData = useMemo(
    () => calculateTotals(details, { ...header, freight_tax_amount: freightTaxAmount }),
    [details, header, freightTaxAmount]
  );

  const computedHeader = useMemo(
    () => ({
      ...header,
      freight_tax_amount: freightTaxAmount,
      subtotal: totalsData.subtotal,
      tax_amount: totalsData.productTax,
      total_amount: totalsData.grandTotal,
    }),
    [header, freightTaxAmount, totalsData]
  );

  const validate = () => {
    const newErrors: any = {};
    if (header.po_type === "manual" && !header.purchase_no.trim()) {
      newErrors.purchase_no = "PO number is required for manual type";
    } else if (!header.purchase_no.trim()) {
      newErrors.purchase_no = "Purchase No required";
    }
    if (!header.purchase_date) newErrors.purchase_date = "Purchase date required";
    if (!header.req_date) newErrors.req_date = "Req Date required";
    if (header.purchase_date && header.req_date) {
      const poDate = new Date(header.purchase_date);
      const reqDate = new Date(header.req_date);

      if (reqDate <= poDate) {
        newErrors.req_date = "Req Date must be greater than PO Date";
      }
    }
    if (!header.supplier_id) newErrors.supplier_id = "Supplier required";
    if (!header.currency) {
      newErrors.currency = "Currency is required";
    }

    const refNoError = getRuleValidationError("alphanumeric-spaces-hyphens", header.ref_no || "");
    if (refNoError) {
      newErrors.ref_no = refNoError;
    }

    const notesError = getRuleValidationError("alphanumeric-spaces-hyphens", header.notes || "");
    if (notesError) {
      newErrors.notes = notesError;
    }

    if (totalsData.grandTotal <= 0) newErrors.total_amount = "Total amount must be greater than 0";

    if (details.length === 0) {
      newErrors.details = "At least one product row is required";
    } else {
      details.forEach((d, index) => {
        if (!d.product_code) newErrors[`product_code_${index}`] = "Product Code required";
        if (!d.product_name) newErrors[`product_name_${index}`] = "Product Name required";

        if (Number(d.rate || 0) <= 0) newErrors[`rate_${index}`] = "Unit price must be > 0";
        if (Number(d.qty || 0) <= 0) newErrors[`qty_${index}`] = "Qty must be > 0";


        const isTempProduct = d.is_new === true || String(d.product_id).startsWith("temp-") || Boolean(d.temp_id);
        if (isTempProduct) {
          const tempItem = tempProducts.find(
            (t) => t.temp_variant_id === String(d.product_id) || t.temp_variant_id === d.temp_id
          );
          if (!tempItem?.newProduct?.name) {
            newErrors[`product_name_${index}`] = "Product name required";
          }
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checking = () => {
    console.log("to check button clicked");
  }

  const handleCreatePurchase = async (e: any) => {
    console.log("===== Create PO Started =====");
    console.log("Header:", header);
    console.log("Details:", details);
    console.log("Temp Products:", tempProducts);
    e.preventDefault();
    setErrorMessage("");
    const isValid = validate();
    console.log("Validation Result:", isValid);
    if (!isValid) {
      console.log("Exiting early due to failed validation!");
      return;
    }


    setLoading(true);
    try {
      let attachmentUrl = header.attachment_url;
      console.log("Uploading attachment...", attachmentFile);
      if (attachmentFile && company) {
        const formData = new FormData();
        formData.append("file", attachmentFile);
        const uploadRes = await fetch("/api/po-attachments", {
          method: "POST",
          headers: { "x-tenant": company },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.message || "Failed to upload attachment");
        }
        const filename = uploadData.file;
        if (filename) {
          const tenantKey = toTenantKey(company);
          attachmentUrl = `/uploads/${encodeURIComponent(tenantKey)}/po-attachments/${encodeURIComponent(
            filename
          )}`;
        }
        console.log("Attachment uploaded:", uploadData);
      }


      const tempProductMap = new Map<string, TempProductCatalogItem>(
        tempProducts.map((item) => [item.temp_variant_id, item])
      );
      const createdProductRefs: Array<{ temp_id: string; product_id: number; variant_id: number }> = [];

      // Helper function to extract base temp ID
      const getBaseTempId = (tempVariantId: string) => {
        const parts = tempVariantId.split("-v");
        if (parts.length > 1) {
          return parts.slice(0, -1).join("-v");
        }
        return tempVariantId;
      };

      // Gather unique base temp IDs for the new products in details
      const newProductBaseIds = new Set<string>();
      for (const detail of details) {
        const tempKey = String(detail.temp_id || detail.product_id || "");
        const tempItem = tempProductMap.get(tempKey);
        if (tempItem) {
          const baseId = getBaseTempId(tempItem.temp_variant_id);
          newProductBaseIds.add(baseId);
        }
      }

      for (const baseId of Array.from(newProductBaseIds)) {
        const productVariants = tempProducts.filter(
          (item) => getBaseTempId(item.temp_variant_id) === baseId
        );
        if (productVariants.length === 0) continue;

        const firstVariant = productVariants[0];

        const productPayload = {
          product: {
            name: firstVariant.newProduct.name,
            type: firstVariant.type,
            category: firstVariant.newProduct.categoryId,
            material: firstVariant.newProduct.materialId || null,
            source: firstVariant.newProduct.source,
            description: firstVariant.description || "",
            uom: firstVariant.uom || "",
            uom_code: firstVariant.uom_code || "",
            uom_name: firstVariant.uom_name || "",
            hsn_code: firstVariant.hsn_code || "",
            product_code: firstVariant.product_code,
          },
          variants: productVariants.map((v) => ({
            sku: v.sku || "",
            color_id: v.rawVariant?.color_id || null,
            gender: v.rawVariant?.gender || null,
            fitting_id: v.rawVariant?.fitting_id || null,
            size: v.rawVariant?.size || "NA",
            qty: v.rawVariant?.qty ?? 0,
            barcode: v.rawVariant?.barcode || "",
            status: v.rawVariant?.status || "draft",
            low_stock_threshold: v.rawVariant?.low_stock_threshold ?? 5,
            backorders_allowed: v.rawVariant?.backorders_allowed ?? false,
          })),
        };

        console.log("Creating product with multiple variants:", productPayload);

        const productRes = await fetch("/api/products", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant": company,
          },
          body: JSON.stringify(productPayload),
        });

        const productData = await productRes.json();
        if (!productRes.ok || !productData?.variants?.length) {
          throw new Error(productData?.message || "Failed to save new product");
        }

        productData.variants.forEach((createdVariant: any, index: number) => {
          const origVariant = productVariants[index];
          if (origVariant) {
            createdProductRefs.push({
              temp_id: String(origVariant.temp_variant_id),
              product_id: Number(productData?.product?.id || createdVariant?.product_id || 0),
              variant_id: Number(createdVariant?.variant_id || 0),
            });
          }
        });
        console.log("Created Product Refs for product:", createdProductRefs);
      }

      const persistedProductMap = new Map(createdProductRefs.map((item) => [item.temp_id, item]));
      console.log("Created Product Refs:", createdProductRefs);
      const payloadDetails = details.map((detail) => {
        const tempKey = String(detail.temp_id || detail.product_id || "");
        const createdRef = persistedProductMap.get(tempKey);
        if (!createdRef) {
          return {
            ...detail,
            is_new: false,
            product_id: Number(detail.product_id),
          };
        }

        return {
          ...detail,
          is_new: false,
          temp_id: createdRef.temp_id,
          product_id: createdRef.variant_id,
          product_name: detail.product_name,
        };
      });

      const payload = {
        header: { ...computedHeader, attachment_url: attachmentUrl, user_name: user?.name },
        details: payloadDetails,
        createdProducts: createdProductRefs,
      };
      console.log("final payload", payload);
      const url = isEdit ? `/api/purchase/${purchaseId}` : "/api/purchase";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-tenant": company,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Purchase Response:", data);
      if (!res.ok || !data.success) {
        const debugInfo = data?.debug ? ` | debug: ${JSON.stringify(data.debug)}` : "";
        notify(`${data.message || data.error || "Failed to save purchase"}${debugInfo}`, {
          severity: "error",
        });
        return;
      }

      if (!isEdit) {
        setHeader(initialHeader);
        setItems([]);
        setTempProducts([]);
        setSelectedProducts([]);
        setErrors({});
        setAttachmentFile(null);
        setBarcodeValue("");
        setBarcodeMessage("");
      }
      setShowAddProductModal(false);
      router.push(`/${company}/workspace/transactions/purchase`);
    } catch (err: any) {
      console.error("Save Purchase Error:", err);
      notify(err.message || "Something went wrong", {
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRenew = () => {
    if (!purchaseId || !company) return;
    router.push(`/${company}/workspace/transactions/purchase/add?renewFrom=${purchaseId}`);
  };


  const currencyCode = getCurrencyCode(computedHeader.currency);
  const formatMoney = (value: number) => Number(value || 0).toFixed(2);
  const itemsSubtotal = Number(computedHeader.subtotal || 0);
  const productTax = Number(computedHeader.tax_amount || 0);
  const freightBase = Number(computedHeader.freight_charges || 0);
  const freightTax = Number(computedHeader.freight_tax_amount || 0);
  const packagingAmount = Number(computedHeader.packaging_amount || 0);
  const extraChargesTotal = freightBase + freightTax + packagingAmount;
  const grandTotal = Number(computedHeader.total_amount || 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {pageLoading &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-white/70 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">Loading Purchase...</p>
            </div>
          </div>,
          document.body
        )}

      {loading &&
        createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/20 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-700 font-semibold text-lg">
                {isEdit ? "Updating Purchase..." : "Saving Purchase..."}
              </p>
            </div>
          </div>,
          document.body
        )}

      {errorMessage && <div className="text-red-600 font-semibold">{errorMessage}</div>}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">
            {isEdit ? "Edit Purchase" : isRenewMode ? "Renew Purchase" : "Create Purchase"}
          </h1>
          <p className="text-sm text-gray-500">Fill in supplier details, line items, and terms for your purchase order.</p>
        </div>

        <div className="flex items-center gap-3">
          {computedHeader.approval_status && (
            <span
              className={`px-3 py-1 text-xs rounded-full font-semibold
                ${computedHeader.approval_status === "Approved" ? "bg-blue-400 text-black" : ""}
                ${computedHeader.approval_status === "Awaiting for approval" ? "bg-yellow-400 text-black" : ""}
                ${computedHeader.approval_status === "Completed" ? "bg-gray-300 text-black" : ""}
                ${computedHeader.approval_status === "Partial" ? "bg-indigo-400 text-black" : ""}
                ${computedHeader.approval_status === "Rejected" ? "bg-red-400 text-black" : ""}
              `}
            >
              {computedHeader.approval_status}
            </span>
          )}
          {isEdit && isRejected && (
            <button
              type="button"
              onClick={handleRenew}
              className="bg-[var(--color-blue-600)] text-white px-4 py-2 rounded text-sm font-semibold hover:opacity-90"
            >
              Renew
            </button>
          )}
        </div>

        {errors.details && (
          <span className="text-red-500 text-sm font-medium whitespace-nowrap">{errors.details}</span>
        )}
      </div>
      {computedHeader.renewed_from_po_id && (
        <div className="mb-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 inline-block">
          Renewed from PO: {computedHeader.renewed_from_purchase_no || computedHeader.renewed_from_po_id}
        </div>
      )}

      <form onSubmit={handleCreatePurchase} className={`space-y-6 ${!isEditable ? "opacity-70" : ""}`}>
        <PurchaseHeaderForm
          header={computedHeader}
          setHeader={setHeader}
          errors={errors}
          setErrors={setErrors}
          isEditable={isEditable}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          allSuppliers={allSuppliers}
          allDespatchTerms={allDespatchTerms}
          allPaymentTerms={allPaymentTerms}
          currencyCode={currencyCode}
          allWarehouses={allWarehouses}
          allLocations={allLocations}
          selectedWarehouseId={selectedWarehouseId}
          setSelectedWarehouseId={setSelectedWarehouseId}
          setAttachmentFile={setAttachmentFile}
        />

        {activeTab === "items" ? (
          <PurchaseItemsTable
            details={details}
            errors={errors}
            isEditable={isEditable}
            allTaxes={allTaxes}
            updateRow={updateRow}
            removeRow={removeRow}
            totalQty={totals.totalQty}
            totalAmount={totals.totalAmount}
            onAddItems={() => {
              if (!header.supplier_id) {
                notify("Supplier is required before adding items.", { severity: "error" });
                return;
              }
              setShowProductPopup(true);
            }}
            showAddItems={true}
            onAddNewProduct={() => setShowAddProductModal(true)}
            barcodeValue={barcodeValue}
            onBarcodeChange={(value) => {
              setBarcodeValue(value);
              if (barcodeMessage) setBarcodeMessage("");
            }}
            onBarcodeSubmit={() => handleBarcodeSubmit()}
            barcodeMessage={barcodeMessage}
            barcodeInputRef={barcodeInputRef}
            onTaxChange={handleTaxChange}
            onBulkApply={applyBulkUpdates}
            productTypeLabel={productTypeLabel}
          />
        ) : (
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Purchase Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>Total Items: <span className="font-semibold">{details.length}</span></div>
              <div>Total Qty: <span className="font-semibold">{totals.totalQty}</span></div>
              <div>Items Amount: <span className="font-semibold">{totals.totalAmount.toFixed(2)}</span></div>
              <div>Grand Total: <span className="font-semibold">{grandTotal.toFixed(2)}</span></div>
            </div>
          </div>
        )}

        <TotalsSection
          formatMoney={formatMoney}
          itemsSubtotal={itemsSubtotal}
          productTax={productTax}
          freightBase={freightBase}
          freightTaxAmount={freightTax}
          packagingAmount={packagingAmount}
          extraChargesTotal={extraChargesTotal}
          grandTotal={grandTotal}
        />

        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => router.push(`/${company}/workspace/transactions/purchase`)}
            className="bg-gray-300 px-6 py-2 rounded hover:bg-gray-400"
          >
            Back
          </button>
          {isEditable && (
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--color-blue-600)] text-white px-6 py-2 rounded hover:opacity-90">
              {isEdit ? "Update Purchase" : "Create Purchase"}
            </button>
          )}
        </div>
      </form>

      <ProductLookupModal
        open={showProductPopup}
        onClose={closePopup}
        // onAddNew={() => setShowAddProductModal(true)}
        onAddSelected={addSelectedProducts}
        isEditable={isEditable}
        errorMessage={popupError}
        items={lookupPaginatedItems}
        loading={lookupLoading || pageLoading}
        filters={lookupFilters}
        onFiltersChange={(next) => {
          setLookupFilters(next);
          setLookupPage(1);
        }}
        categoryOptions={lookupCategoryOptions}
        page={lookupPage}
        totalPages={lookupTotalPages}
        itemsPerPage={lookupItemsPerPage}
        totalCount={lookupTotalCount}
        onPageChange={setLookupPage}
        isSelected={(item) => selectedProducts.some((p) => p.id === item.id)}
        onToggle={toggleProduct}
        onToggleAll={(checked, pageItems) => {
          if (checked) {
            setSelectedProducts((prev) => {
              const map = new Map(prev.map((p) => [p.id, p]));
              pageItems.forEach((p) => map.set(p.id, p));
              return Array.from(map.values());
            });
          } else {
            setSelectedProducts((prev) =>
              prev.filter((p) => !pageItems.some((pg) => pg.id === p.id))
            );
          }
        }}
      />

      <AddProductModal
        open={showAddProductModal}
        onClose={() => setShowAddProductModal(false)}
        saveMode="local"
        onLocalSave={handleLocalProductSaved}
        buttonLabel="Add to Purchase Order"
      />
    </div>
  );
}
