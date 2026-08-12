"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import type { SalesHeaderRef } from "@/components/sales/SalesHeader";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useNotify } from "@/hooks/useNotify";
import { useReactToPrint } from "react-to-print";
import {
    ArrowPathIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    PrinterIcon, PauseIcon,
} from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";
import { useUser } from "@/context/CurrentUserContext";
import SalesHeader from "@/components/sales/SalesHeader";
import SalesTable from "@/components/sales/SalesTable";
import {
    buildProductMaps,
    calculatePaymentStatus,
    createPaymentEntry,
    generateSalesNo,
    getCustomerAddress,
    getCustomerDisplayName,
    mapCustomerToSelectOption,
    roundMoney,
} from "@/components/sales/salesUtils";
import { useResolvedWarehouseContext } from "@/components/sales/useResolvedWarehouseContext";
import { useSalesCustomer } from "@/components/sales/useSalesCustomer";
import { useProductLookup } from "@/hooks/useProductLookup";
import ThermalInvoice from "@/components/ThermalInvoice";
import {
    applySalesRowCalculation,
    calculateSalesTotals,
} from "@/lib/pricing/salesCalculations";
import type {
    ActiveTodayDiscount,
    Customer,
    MonthlySpendRow,
    PaymentMode,
    Product,
    ProductRow,
    PurchaseHistoryRow,
    SalesDetail,
    SalesHeader as SalesHeaderType,
    SalesPayment,
    SalesIndexRow,
    Warehouse,
} from "@/types/sales";

const ProductLookupModal = dynamic(
    () => import("@/components/product/ProductLookupModal"),
    { ssr: false }
);
const PrintBillingInvoice = dynamic(
    () => import("@/components/PrintBillingInvoice"),
    { ssr: false }
);

const formatDateLabel = (value?: string) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const formatTimeLabel = (value?: string) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
    });
};

const getPaymentModeName = (mode: any) => {
    return String(mode?.payment_mode_name || mode?.name || mode?.payment_mode || "").trim();
};

type ThermalPrintHeader = {
    sales_no: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    customer_address?: string;
    sales_date: string;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    return_change: number;
};

type ThermalPrintDetail = {
    product_name?: string;
    qty: number;
    rate: number;
    discount: number;
    tax_percent: number;
    tax_amount: number;
    line_total: number;
    tax_components?: Array<{ component_name: string; component_percentage: number }>;
};

export default function SalesForm() {
    const router = useRouter();
    const notify = useNotify();
    const searchParams = useSearchParams();
    const salesId = searchParams.get("id");
    const isEdit = Boolean(salesId);
    const { company } = useTenant();
    const { user } = useUser();

    const [returnSelectionBill, setReturnSelectionBill] = useState<SalesIndexRow | null>(null);
    const [returnItems, setReturnItems] = useState<any[]>([]);
    const [returnLoading, setReturnLoading] = useState(false);
    const [returnError, setReturnError] = useState("");
    const [isReturnSelectionView, setIsReturnSelectionView] = useState(false);
    const [returnedItemsList, setReturnedItemsList] = useState<any[]>([]);
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
    } = useProductLookup({ enabled: Boolean(company), module: "sales" });

    const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");

    const initialHeader: SalesHeaderType = {
        sales_no: "",
        customer_id: "",
        invoice_date: "",
        sales_date: new Date().toISOString().split("T")[0],
        status: "Entered",
        payment_status: "unpaid",
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        user_name: "",
        currency: "",
    };

    const [formState, setFormState] = useState(() => ({
        header: initialHeader,
        details: [] as SalesDetail[],
        payments: [] as SalesPayment[],
        couponCode: "",
        barcodeValue: "",
        barcodeMessage: "",
    }));
    const [masterData, setMasterData] = useState(() => ({
        products: [] as Product[],
        taxes: [] as any[],
        customers: [] as Customer[],
        uoms: [] as any[],
        warehouses: [] as Warehouse[],
        paymentModes: [] as PaymentMode[],
        activeDiscountsForToday: [] as ActiveTodayDiscount[],
    }));
    const [uiState, setUiState] = useState(() => ({
        errors: {} as Record<string, string>,
        loading: false,
        pageLoading: false,
        errorMessage: "",
        showProductPopup: false,
        selectedProducts: [] as number[],
        popupError: "",
        showBillsPanel: false,
        billsList: [] as SalesIndexRow[],
        billsLoading: false,
        billsError: "",
        showQuickCustomerPopup: false,
        customerLookupInput: "",
        newCustomerName: "",
        newCustomerPhone: "",
        customerQuickAddLoading: false,
        customerQuickAddError: "",
        purchaseHistory: [] as PurchaseHistoryRow[],
        purchaseMonthly: [] as MonthlySpendRow[],
        printSnapshot: null as { header: any; details: SalesDetail[] } | null,
    }));
    const [printData, setPrintData] = useState<{
        header: ThermalPrintHeader;
        details: ThermalPrintDetail[];
    } | null>(null);
    const [paymentPanelOpen, setPaymentPanelOpen] = useState(false);
    const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
    const [billsSearch, setBillsSearch] = useState("");

    const { header, details, payments, couponCode, barcodeValue, barcodeMessage } = formState;
    const {
        products: allProducts,
        taxes: allTaxes,
        customers: allCustomers,
        uoms: allUoms,
        paymentModes,
        activeDiscountsForToday,
    } = masterData;
    const {
        errors,
        loading,
        pageLoading,
        errorMessage,
        showProductPopup,
        selectedProducts,
        popupError,
        showBillsPanel,
        billsList,
        billsLoading,
        billsError,
        showQuickCustomerPopup,
        customerLookupInput,
        newCustomerName,
        newCustomerPhone,
        customerQuickAddLoading,
        customerQuickAddError,
        purchaseHistory,
        purchaseMonthly,
        printSnapshot,
    } = uiState;

    const barcodeInputRef = useRef<HTMLInputElement>(null);
    const qtyInputRef = useRef<HTMLInputElement>(null);
    const barcodeHandlerRef = useRef<(value: string) => void>(() => { });
    const printRef = useRef<HTMLDivElement>(null);
    const thermalRef = useRef<HTMLDivElement>(null);
    const salesHeaderRef = useRef<SalesHeaderRef>(null);
    const firstPaymentModeRef = useRef<HTMLInputElement>(null);
    const thermalDataReadyRef = useRef<(() => void) | null>(null);

    const salesIndexRef = useRef<SalesIndexRow[] | null>(null);
    const salesIndexLoadingRef = useRef<Promise<SalesIndexRow[]> | null>(null);
    const billsLoadedRef = useRef(false);
    const discountCacheLoadedRef = useRef(false);
    const hasLoadedMasterRef = useRef(false);
    const pricingCacheRef = useRef<Map<number, any>>(new Map());
    const customerAnalyticsCache = useRef<
        Map<string, { history: PurchaseHistoryRow[]; monthly: MonthlySpendRow[] }>
    >(new Map());
    const salesDetailCountCache = useRef<Map<number, number>>(new Map());

    const updateMasterData = useCallback(
        (patch: Partial<typeof masterData>) => {
            setMasterData((prev) => ({ ...prev, ...patch }));
        },
        []
    );
    const updateUiState = useCallback(
        (patch: Partial<typeof uiState>) => {
            setUiState((prev) => ({ ...prev, ...patch }));
        },
        []
    );

    const setHeader = useCallback(
        (updater: SalesHeaderType | ((prev: SalesHeaderType) => SalesHeaderType)) => {
            setFormState((prev) => ({
                ...prev,
                header: typeof updater === "function" ? (updater as any)(prev.header) : updater,
            }));
        },
        []
    );
    const setDetails = useCallback(
        (updater: SalesDetail[] | ((prev: SalesDetail[]) => SalesDetail[])) => {
            setFormState((prev) => ({
                ...prev,
                details: typeof updater === "function" ? (updater as any)(prev.details) : updater,
            }));
        },
        []
    );
    const setPayments = useCallback(
        (updater: SalesPayment[] | ((prev: SalesPayment[]) => SalesPayment[])) => {
            setFormState((prev) => ({
                ...prev,
                payments: typeof updater === "function" ? (updater as any)(prev.payments) : updater,
            }));
        },
        []
    );

    const setErrors = useCallback(
        (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
            setUiState((prev) => ({
                ...prev,
                errors: typeof updater === "function" ? (updater as any)(prev.errors) : updater,
            }));
        },
        []
    );

    const setSelectedProducts = useCallback(
        (updater: number[] | ((prev: number[]) => number[])) => {
            setUiState((prev) => ({
                ...prev,
                selectedProducts: typeof updater === "function" ? (updater as any)(prev.selectedProducts) : updater,
            }));
        },
        []
    );

    const { productById, productByBarcode } = useMemo(
        () => buildProductMaps(allProducts),
        [allProducts]
    );

    const uomById = useMemo(() => {
        const map = new Map<string, any>();
        allUoms.forEach((uom) => {
            map.set(String(uom.id), uom);
        });
        return map;
    }, [allUoms]);

    const taxById = useMemo(() => {
        const map = new Map<number, any>();
        allTaxes.forEach((tax) => {
            if (tax?.id !== undefined && tax?.id !== null) {
                map.set(Number(tax.id), tax);
            }
        });
        return map;
    }, [allTaxes]);

    const discountMap = useMemo(() => {
        const map = new Map<number, ActiveTodayDiscount>();
        activeDiscountsForToday.forEach((discount) => {
            const variantId = Number(discount.variant_id);
            if (!Number.isFinite(variantId)) return;
            const priority = Number.isFinite(discount.priority)
                ? Number(discount.priority)
                : Number.MAX_SAFE_INTEGER;
            const existing = map.get(variantId);
            if (!existing || priority < Number(existing.priority)) {
                map.set(variantId, {
                    ...discount,
                    variant_id: variantId,
                    priority,
                    value: Number(discount.value || 0),
                });
            }
        });
        return map;
    }, [activeDiscountsForToday]);

    useEffect(() => {
        const mapped = lookupItems.map((item) => ({
            id: item.id,
            variant_id: item.variant_id,
            product_id: item.product_id,
            product_code: item.product_code || item.code,
            product_name: item.name,
            description: item.description || "",
            sku: item.sku,
            barcode: item.barcode || "",
            base_price: 0,
            selling_price: Number(item.selling_price || 0),
            tax_rate: 0,
            uom: item.uom || "",
            hsn_code: item.hsn_code || "",
            uom_code: item.uom_code || "",
            uom_name: item.uom_name || "",
            category: item.category_name,
            color: item.color,
            type: item.type,
            source: item.source,
        }));
        updateMasterData({ products: mapped });
    }, [lookupItems, updateMasterData]);

    const getCurrencyCode = useCallback(() => {
        const raw = String(header.currency || "");
        if (!raw) return "INR";
        return raw.split("-")[0]?.trim() || "INR";
    }, [header.currency]);

    const getSalesIndex = useCallback(async (): Promise<SalesIndexRow[]> => {
        if (!company) return [];
        if (salesIndexRef.current) return salesIndexRef.current;
        if (salesIndexLoadingRef.current) return salesIndexLoadingRef.current;

        const load = (async () => {
            const res = await fetch("/api/sales", {
                headers: { "x-tenant": company },
            });
            const data = await res.json();
            const rows: SalesIndexRow[] = Array.isArray(data?.data) ? data.data : [];
            salesIndexRef.current = rows;
            return rows;
        })();

        salesIndexLoadingRef.current = load;
        const result = await load;
        salesIndexLoadingRef.current = null;
        return result;
    }, [company]);

    const buildPrintHeader = useCallback(
        (baseHeader: SalesHeaderType) => {
            const customer = allCustomers.find(
                (c) => String(c.id) === String(baseHeader.customer_id)
            );
            return {
                ...baseHeader,
                customer_name: getCustomerDisplayName(customer),
                customer_email: customer?.email || "",
                customer_phone: customer?.phone || "",
                customer_address: getCustomerAddress(customer),
                payment_status: "",
                currency_code: getCurrencyCode(),
                conversion_rate: 1,
                return_change: balanceAmountstore,
            };
        },
        [allCustomers, getCurrencyCode]
    );

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        onAfterPrint: () => updateUiState({ printSnapshot: null }),
    });

    const openBillsPanel = useCallback(async () => {
        updateUiState({ showBillsPanel: true });
        if (billsLoadedRef.current || !company) return;

        updateUiState({ billsLoading: true, billsError: "" });
        try {
            const rows = await getSalesIndex();
            updateUiState({ billsList: rows });
            billsLoadedRef.current = true;
        } catch (err) {
            console.error("Failed to load bills list", err);
            updateUiState({ billsError: "Failed to load bills." });
        } finally {
            updateUiState({ billsLoading: false });
        }
    }, [company, getSalesIndex]);

    const sortedBills = useMemo(() => {
        const query = billsSearch.trim().toLowerCase();
        const filtered = query
            ? billsList.filter((bill) => {
                const billNo = String(bill.sales_no || "").toLowerCase();
                const customer = String(bill.customer_name || bill.customer_id || "").toLowerCase();
                const date = formatDateLabel(bill.sales_date || bill.created_at).toLowerCase();
                const amount = Number(bill.total_amount || 0).toFixed(2);
                return (
                    billNo.includes(query) ||
                    customer.includes(query) ||
                    date.includes(query) ||
                    amount.includes(query)
                );
            })
            : billsList;

        return [...filtered].sort((a, b) => {
            const ad = new Date(a.created_at || a.sales_date || 0).getTime();
            const bd = new Date(b.created_at || b.sales_date || 0).getTime();
            return bd - ad;
        });
    }, [billsList, billsSearch]);

    const billingTotals = useMemo(() => calculateSalesTotals(details), [details]);

    const returnedCreditValue = useMemo(() => {
        return returnedItemsList.reduce(
            (sum, item) => sum + Number(item.return_qty || 0) * Number(item.unit_price || 0),
            0
        );
    }, [returnedItemsList]);

    const netTotalAmount = useMemo(() => {
        return roundMoney(billingTotals.total - returnedCreditValue);
    }, [billingTotals.total, returnedCreditValue]);

    const {
        activeWarehouseId,
        activeLocationId,
        selectedWarehouse,
        selectedWarehouseName,
        selectedLocationName,
    } = useResolvedWarehouseContext(user, header, company);

    const totalPaidAmount = useMemo(
        () => roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
        [payments]
    );

    const balanceAmount = useMemo(
        () => roundMoney(Math.max(Number(netTotalAmount || 0) - totalPaidAmount, 0)),
        [netTotalAmount, totalPaidAmount]
    );
    const balanceAmountstore = useMemo(
        () => roundMoney(Math.max(Number(totalPaidAmount) - (netTotalAmount || 0), 0)),
        [totalPaidAmount, netTotalAmount]
    );
    const resolvedActiveLineIndex = useMemo(() => {
        if (details.length === 0) return null;
        if (activeLineIndex === null) return details.length - 1;
        return Math.min(activeLineIndex, details.length - 1);
    }, [activeLineIndex, details.length]);

    const activeLine = useMemo(
        () => (resolvedActiveLineIndex === null ? null : details[resolvedActiveLineIndex] || null),
        [details, resolvedActiveLineIndex]
    );

    const {
        filteredCustomerOptions,
        selectedCustomerOption,
        setCustomerOptions,
        setSelectedCustomerOption,
        syncCustomers,
        handleCustomerSelect,
        handleCustomerSearchInputChange,
        handleOpenQuickCustomerPopup,
        closeQuickCustomerPopup,
        handleCreateCustomer,
        handleNewCustomerNameChange,
        handleNewCustomerPhoneChange,
    } = useSalesCustomer({
        company,
        customerId: header.customer_id,
        customerLookupInput,
        newCustomerName,
        newCustomerPhone,
        setHeader,
        setErrors,
        updateUiState,
        setUiState,
        setMasterData,
    });

    const toggleProduct = (id: number) => {
        setSelectedProducts((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
        );
    };

    const applyBillingCalculation = useCallback(
        (row: SalesDetail) => {
            const normalizedDiscountType: "percentage" | "fixed" | undefined =
                row.discount_type === "percent" || row.discount_type === "percentage"
                    ? "percentage"
                    : row.discount_type === "amount" || row.discount_type === "fixed"
                        ? "fixed"
                        : undefined;

            const normalizedRow: Parameters<typeof applySalesRowCalculation>[0] = {
                ...row,
                discount_type: normalizedDiscountType,
                discount_value: row.discount_value === "" ? undefined : row.discount_value,
            };

            return applySalesRowCalculation(normalizedRow, discountMode) as SalesDetail;
        },
        [discountMode]
    );

    useEffect(() => {
        setDetails((prev) => prev.map((row) => applyBillingCalculation(row)) as SalesDetail[]);
    }, [applyBillingCalculation, setDetails]);

    const fetchPricingByVariantIds = useCallback(
        async (variantIds: number[]) => {
            if (!company || !variantIds.length) return {};

            const uniqueIds = Array.from(
                new Set(variantIds.filter((id) => Number.isFinite(id)))
            );
            const cache = pricingCacheRef.current;
            const missing = uniqueIds.filter((id) => !cache.has(id));
            let fetched: Record<string, any> = {};

            if (missing.length) {
                try {
                    const res = await fetch("/api/pricing/active", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-tenant": company,
                        },
                        body: JSON.stringify({ variant_ids: missing }),
                    });
                    const data = await res.json();
                    if (res.ok && data?.success) {
                        fetched = data.data || {};
                    }
                } catch (err) {
                    console.error("Failed to fetch pricing", err);
                }
            }

            Object.entries(fetched).forEach(([id, value]) => {
                const numericId = Number(id);
                if (Number.isFinite(numericId)) {
                    cache.set(numericId, value);
                }
            });

            const result: Record<string, any> = {};
            uniqueIds.forEach((id) => {
                const cached = cache.get(id);
                if (cached) result[String(id)] = cached;
            });

            return result;
        },
        [company]
    );

    const fetchActiveDiscountsForToday = useCallback(
        async (force = false) => {
            if (!company) return;
            if (discountCacheLoadedRef.current && !force) return;
            try {
                const res = await fetch("/api/discounts/active-today", {
                    headers: { "x-tenant": company },
                });
                const data = await res.json();
                const rows = Array.isArray(data) ? data : data?.data || [];
                updateMasterData({ activeDiscountsForToday: rows });
                discountCacheLoadedRef.current = true;
            } catch (err) {
                console.error("Failed to load active discounts", err);
            }
        },
        [company, updateMasterData]
    );

    const addSelectedProducts = async () => {
        if (selectedProducts.length === 0) {
            updateUiState({ popupError: "Please select at least one product to add." });
            return;
        }

        const ids = selectedProducts.filter((id) => Number.isFinite(id));
        const pricingByVariant = await fetchPricingByVariantIds(ids);
        setDetails((prev) => {
            const updated = [...prev];
            for (const id of ids) {
                const p = productById.get(id);
                if (!p) continue;
                const existingIndex = updated.findIndex(
                    (row) => String(row.product_id) === String(p.id)
                );
                if (existingIndex >= 0) {
                    const nextQty = Number(updated[existingIndex].qty || 0) + 1;
                    const rowToUpdate = {
                        ...updated[existingIndex],
                        qty: nextQty,
                    };
                    updated[existingIndex] = applyBillingCalculation(rowToUpdate) as SalesDetail;
                    continue;
                }
                const uomObj = uomById.get(String(p.uom));
                const pricing = pricingByVariant[String(p.id)] || {};
                const newRow: ProductRow = {
                    product_id: String(p.id),
                    product_code: p.product_code,
                    product_name: p.product_name,
                    description: p.description,
                    uom: String(p.uom || ""),
                    uom_code: uomObj?.uom_code || "",
                    uom_name: uomObj?.uom_name || "",
                    hsn_no: p.hsn_code,
                    rate: Number(pricing.unit_price || 0),
                    qty: 1,
                    amount: 0,
                    discount: 0,
                    discount_value: 0,
                    discount_auto: true,
                    tax_percent: Number(pricing.tax_percent || 0),
                    tax_amount: 0,
                    line_total: 0,
                    tax_id: pricing.tax_id ?? null,
                    tax_name: pricing.tax_name || "",
                };
                const discount = discountMap.get(Number(p.id));
                const applied = discount
                    ? {
                        ...newRow,
                        discount_type: discount.discount_type,
                        discount_value: Number(discount.value || 0),
                        discount_auto: true,
                    }
                    : newRow;
                updated.push({
                    ...applied,
                    ...applyBillingCalculation(applied),
                } as SalesDetail);
            }
            return updated;
        });

        updateUiState({ popupError: "" });

        setErrors((prev) => ({
            ...prev,
            details: "",
        }));

        updateUiState({ showProductPopup: false });
        setSelectedProducts([]);
        resetLookupFilters();
    };

    const addOrIncrementByBarcode = useCallback(
        async (barcode: string) => {
            const normalized = String(barcode || "").trim();
            if (!normalized) return false;
            const match = productByBarcode.get(normalized);
            if (!match) return false;

            let pricingForVariant: any = {};

            if (!details.find((row) => String(row.product_id) === String(match.id))) {
                pricingForVariant = await fetchPricingByVariantIds([Number(match.id)]);
            }

            setDetails((prev) => {
                const updated = [...prev];
                const existingIndex = updated.findIndex(
                    (row) => String(row.product_id) === String(match.id)
                );
                if (existingIndex >= 0) {
                    const nextQty = Number(updated[existingIndex].qty || 0) + 1;
                    const rowToUpdate = {
                        ...updated[existingIndex],
                        qty: nextQty,
                    };
                    updated[existingIndex] = applyBillingCalculation(rowToUpdate) as SalesDetail;
                    return updated;
                }

                const uomObj = uomById.get(String(match.uom));
                const pricing = pricingForVariant[String(match.id)] || {};
                const newRow: ProductRow = {
                    product_id: String(match.id),
                    product_code: match.product_code,
                    product_name: match.product_name,
                    description: match.description,
                    uom: String(match.uom || ""),
                    uom_code: uomObj?.uom_code || "",
                    uom_name: uomObj?.uom_name || "",
                    hsn_no: match.hsn_code,
                    rate: Number(pricing.unit_price || 0),
                    qty: 1,
                    amount: 0,
                    discount: 0,
                    discount_value: 0,
                    discount_auto: true,
                    tax_percent: Number(pricing.tax_percent || 0),
                    tax_amount: 0,
                    line_total: 0,
                    tax_id: pricing.tax_id ?? null,
                    tax_name: pricing.tax_name || "",
                };
                const discountForVariant = discountMap.get(Number(match.id));
                const applied = discountForVariant
                    ? {
                        ...newRow,
                        discount_type: discountForVariant.discount_type,
                        discount_value: Number(discountForVariant.value || 0),
                        discount_auto: true,
                    }
                    : newRow;
                return [...updated, {
                    ...applied,
                    ...applyBillingCalculation(applied),
                } as SalesDetail];
            });

            setErrors((prev) => ({
                ...prev,
                details: "",
            }));

            return true;
        },
        [
            details,
            discountMap,
            fetchPricingByVariantIds,
            productByBarcode,
            applyBillingCalculation,
            setDetails,
            setErrors,
            uomById,
        ]
    );

    const handleBarcodeSubmit = useCallback(
        async (value?: string) => {
            const input = String(value ?? barcodeValue).trim();
            if (!input) return;
            const found = await addOrIncrementByBarcode(input);
            setFormState((prev) => ({
                ...prev,
                barcodeMessage: found ? "" : `Barcode "${input}" not found.`,
                barcodeValue: "",
            }));
            setTimeout(() => {
                qtyInputRef.current?.focus();
                qtyInputRef.current?.select();
            }, 50);
        },
        [addOrIncrementByBarcode, barcodeValue]
    );

    useEffect(() => {
        barcodeHandlerRef.current = (value: string) => {
            handleBarcodeSubmit(value);
        };
    }, [handleBarcodeSubmit]);

    const closePopup = () => {
        updateUiState({ showProductPopup: false });
        resetLookupFilters();
        setSelectedProducts([]);
    };

    const lastFetchedIdRef = useRef<string | null>(null);
    useEffect(() => {
        const fetchSales = async () => {
            if (!salesId || !company) return;
            if (lastFetchedIdRef.current === salesId) return;
            lastFetchedIdRef.current = salesId;
            try {
                updateUiState({ pageLoading: true });
                const res = await fetch(`/api/sales/${salesId}`, {
                    headers: {
                        "x-tenant": company,
                    },
                });
                const data = await res.json();
                if (data.success) {
                    setHeader((prev) => ({
                        ...prev,
                        ...data.data.header,
                        payment_status: data.data.header?.payment_status || "unpaid",
                    }));
                    const rawDetails = Array.isArray(data.data.details) ? data.data.details : [];
                    const detectedType = rawDetails.find((row: any) => row?.discount_type);
                    const nextMode =
                        detectedType?.discount_type === "percent" ||
                            detectedType?.discount_type === "percentage"
                            ? "percent"
                            : detectedType?.discount_type === "amount" ||
                                detectedType?.discount_type === "fixed"
                                ? "amount"
                                : rawDetails.some((row: any) => Number(row.discount || 0) > 0)
                                    ? "amount"
                                    : discountMode;
                    setDiscountMode(nextMode);
                    const fetchedDetails = rawDetails.map((row: any) => {
                        const discountValue =
                            row.discount_value !== undefined && row.discount_value !== null
                                ? Number(row.discount_value)
                                : Number(row.discount || 0);
                        const baseRow: SalesDetail = {
                            ...row,
                            qty: Number(row.qty),
                            rate: Number(row.rate),
                            discount: Number(row.discount || 0),
                            discount_value: Number.isFinite(discountValue) ? discountValue : 0,
                            discount_type: row.discount_type,
                            tax_percent: Number(row.tax_percent),
                            tax_amount: Number(row.tax_amount),
                            line_total: Number(row.line_total),
                            discount_auto: false,
                        };
                        return applyBillingCalculation(baseRow);
                    });
                    setDetails(fetchedDetails);
                    const fetchedPayments = Array.isArray(data.data.payments)
                        ? data.data.payments.map((payment: any) => ({
                            id: Number(payment.id),
                            payment_mode_id: Number(payment.payment_mode_id),
                            payment_mode_name: String(payment.payment_mode_name || ""),
                            amount: Number(payment.amount || 0),
                            location_id: payment.location_id != null ? Number(payment.location_id) : null,
                            warehouse_id: payment.warehouse_id != null ? Number(payment.warehouse_id) : null,
                        }))
                        : [];
                    setPayments(fetchedPayments);
                }
            } catch (err) {
                console.error(err);
            } finally {
                updateUiState({ pageLoading: false });
            }
        };
        if (!salesId) {
            lastFetchedIdRef.current = null;
            return;
        }
        fetchSales();
    }, [
        salesId,
        company,
        applyBillingCalculation,
        discountMode,
        setDetails,
        setPayments,
        setHeader,
        setDiscountMode,
    ]);

    useEffect(() => {
        if (!user?.name) return;
        setHeader((prev) => {
            if (prev.user_name === user.name) return prev;
            return {
                ...prev,
                user_name: user.name,
            };
        });
    }, [user?.name, setHeader]);

    useEffect(() => {
        salesIndexRef.current = null;
        salesIndexLoadingRef.current = null;
        billsLoadedRef.current = false;
        customerAnalyticsCache.current.clear();
        salesDetailCountCache.current.clear();
        discountCacheLoadedRef.current = false;
        pricingCacheRef.current.clear();
        hasLoadedMasterRef.current = false;
        updateMasterData({
            activeDiscountsForToday: [],
            customers: [],
            uoms: [],
            taxes: [],
            paymentModes: [],
        });
        updateUiState({
            billsList: [],
            purchaseHistory: [],
            purchaseMonthly: [],
        });
        setCustomerOptions([]);
        setSelectedCustomerOption(null);
    }, [company, updateMasterData, updateUiState]);

    useEffect(() => {
        if (!company || hasLoadedMasterRef.current) return;
        hasLoadedMasterRef.current = true;
        const loadMasterData = async () => {
            try {
                updateUiState({ pageLoading: true });

                const res = await fetch("/api/sales/master-data", {
                    headers: { "x-tenant": company },
                });
                const data = await res.json();
                const payload = data?.data || {};

                const normalizedTaxes = (payload.taxes || []).map((tax: any) => ({
                    ...tax,
                    id: Number(tax.id),
                    total_percentage: Number(tax.total_percentage || 0),
                    tax_name: tax.tax_name || tax.name || tax.taxName || tax.gst_name || "",
                }));

                const normalizedPaymentModes = (payload.payment_modes || [])
                    .filter((mode: any) => mode?.is_active !== false)
                    .map((mode: any) => ({
                        ...mode,
                        id: Number(mode.id),
                        payment_mode_name: getPaymentModeName(mode),
                    }));

                updateMasterData({
                    uoms: Array.isArray(payload.uoms) ? payload.uoms : [],
                    taxes: normalizedTaxes,
                    paymentModes: normalizedPaymentModes,
                });

                if (Array.isArray(payload.customers)) {
                    syncCustomers(payload.customers);
                }

                if (!isEdit && payload.sales_no) {
                    setHeader((prev) => ({
                        ...prev,
                        sales_no: prev.sales_no || payload.sales_no,
                    }));
                }
            } catch (err) {
                console.error("Master data load failed:", err);
            } finally {
                updateUiState({ pageLoading: false });
            }
        };

        loadMasterData();
    }, [company, isEdit, setHeader, syncCustomers, updateMasterData, updateUiState]);

    useEffect(() => {
        if (isEdit || header.sales_no) return;

        let cancelled = false;
        const ensureSalesNo = async () => {
            if (company) {
                try {
                    const res = await fetch("/api/sales/generateNo", {
                        headers: { "x-tenant": company },
                    });
                    const data = await res.json();
                    if (!cancelled && data?.success && data.sales_no) {
                        setHeader((prev) => ({ ...prev, sales_no: data.sales_no }));
                        return;
                    }
                } catch (err) {
                    console.error("Failed to generate sales number", err);
                }
            }

            if (!cancelled) {
                setHeader((prev) =>
                    prev.sales_no ? prev : { ...prev, sales_no: generateSalesNo() }
                );
            }
        };

        ensureSalesNo();
        return () => {
            cancelled = true;
        };
    }, [company, header.sales_no, isEdit, setHeader]);

    useEffect(() => {
        const customerId = header.customer_id;
        if (!customerId || !company) {
            updateUiState({ purchaseHistory: [], purchaseMonthly: [] });
            return;
        }

        const cached = customerAnalyticsCache.current.get(customerId);
        if (cached) {
            updateUiState({
                purchaseHistory: cached.history,
                purchaseMonthly: cached.monthly,
            });
            return;
        }

        let cancelled = false;

        const loadCustomerAnalytics = async () => {
            try {
                const rows = await getSalesIndex();
                const customerRows = rows.filter(
                    (row: SalesIndexRow) => String(row.customer_id) === String(customerId)
                );

                const sorted = [...customerRows].sort((a, b) => {
                    const ad = new Date(a.sales_date || a.created_at || 0).getTime();
                    const bd = new Date(b.sales_date || b.created_at || 0).getTime();
                    return bd - ad;
                });

                const recent = sorted.slice(0, 10);
                const history = await Promise.all(
                    recent.map(async (row) => {
                        let count = salesDetailCountCache.current.get(row.id);
                        const rowCount =
                            typeof row.items_count === "number" ? Number(row.items_count) : undefined;

                        if (rowCount !== undefined && !Number.isNaN(rowCount)) {
                            count = rowCount;
                            salesDetailCountCache.current.set(row.id, rowCount);
                        }

                        if (count === undefined) {
                            try {
                                const detailRes = await fetch(`/api/sales/${row.id}`, {
                                    headers: { "x-tenant": company },
                                });
                                const detailData = await detailRes.json();
                                const countValue = Array.isArray(detailData?.data?.details)
                                    ? detailData.data.details.length
                                    : 0;
                                count = countValue;
                                salesDetailCountCache.current.set(row.id, countValue);
                            } catch {
                                count = 0;
                            }
                        }

                        return {
                            id: row.id,
                            sales_no: row.sales_no,
                            dateLabel: formatDateLabel(row.sales_date || row.created_at),
                            items_count: count || 0,
                            amount: Number(row.total_amount || 0),
                        };
                    })
                );

                const monthlyMap = new Map<string, number>();
                customerRows.forEach((row: SalesIndexRow) => {
                    const rawDate = row.sales_date || row.created_at;
                    if (!rawDate) return;
                    const d = new Date(rawDate);
                    if (Number.isNaN(d.getTime())) return;
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                    monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(row.total_amount || 0));
                });

                const monthly = Array.from(monthlyMap.entries())
                    .sort(([a], [b]) => (a > b ? 1 : -1))
                    .map(([key, total]) => {
                        const [y, m] = key.split("-");
                        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(
                            "en-IN",
                            {
                                month: "short",
                                year: "2-digit",
                            }
                        );
                        return { month: label, total };
                    });

                if (cancelled) return;
                updateUiState({
                    purchaseHistory: history,
                    purchaseMonthly: monthly,
                });
                customerAnalyticsCache.current.set(customerId, { history, monthly });
            } catch (err) {
                console.error("Failed to load customer analytics", err);
            }
        };

        loadCustomerAnalytics();

        return () => {
            cancelled = true;
        };
    }, [company, getSalesIndex, header.customer_id]);

    useEffect(() => {
        fetchActiveDiscountsForToday();
    }, [fetchActiveDiscountsForToday]);

    useEffect(() => {
        if (!company) return;
        const source = new EventSource(
            `/api/barcode-scan?tenant=${encodeURIComponent(company)}`
        );
        source.onmessage = (event) => {
            const payload = String(event.data || "").trim();
            if (payload) barcodeHandlerRef.current(payload);
        };
        return () => {
            source.close();
        };
    }, [company]);

    useEffect(() => {
        const nextPaymentStatus = calculatePaymentStatus(netTotalAmount, totalPaidAmount);
        setHeader((prev) => ({
            ...prev,
            warehouse_id: activeWarehouseId ?? prev.warehouse_id ?? "",
            location_id: selectedWarehouse?.location_id ?? activeLocationId ?? prev.location_id ?? "",
            warehouse_name: selectedWarehouseName || prev.warehouse_name || "",
            location_name: selectedLocationName || prev.location_name || "",
            subtotal: Number(billingTotals.taxable.toFixed(2)),
            tax_amount: Number(billingTotals.tax.toFixed(2)),
            total_amount: Number(netTotalAmount.toFixed(2)),
            payment_status: nextPaymentStatus,
        }));
    }, [
        activeLocationId,
        activeWarehouseId,
        billingTotals,
        selectedLocationName,
        selectedWarehouse,
        selectedWarehouseName,
        setHeader,
        totalPaidAmount,
        netTotalAmount,
    ]);

    useEffect(() => {
        if (details.length === 0) {
            setActiveLineIndex(null);
            return;
        }
        setActiveLineIndex((prev) => {
            if (prev === null) return details.length - 1;
            return Math.min(prev, details.length - 1);
        });
    }, [details.length]);

    const updateRow = useCallback(
        (index: number, field: string, value: any) => {
            setDetails((prev) => {
                const updated = [...prev];
                const nextRow: SalesDetail = {
                    ...updated[index],
                    [field]: value,
                };
                if (field === "discount_value") {
                    nextRow.discount_auto = false;
                    nextRow.discount_type = undefined;
                    nextRow.discount_name = undefined;
                }
                updated[index] = applyBillingCalculation(nextRow) as SalesDetail;
                return updated;
            });
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[`${String(field)}_${index}`];
                return newErrors;
            });
        },
        [applyBillingCalculation, setDetails, setErrors]
    );

    const handleRateChange = (index: number, value: number | "") => updateRow(index, "rate", value);

    const handleQtyChange = (index: number, value: number | "") => updateRow(index, "qty", value);

    const handleDiscountChange = (index: number, value: number | "") =>
        updateRow(index, "discount_value", value);

    const handleTaxChange = useCallback(
        (index: number, taxId: number | null) => {
            setDetails((prev) => {
                const updated = [...prev];
                const tax = taxId ? taxById.get(Number(taxId)) : undefined;
                if (tax) {
                    updated[index] = {
                        ...updated[index],
                        tax_id: tax.id,
                        tax_name: tax.tax_name || tax.name || tax.taxName || tax.gst_name || "",
                        tax_percent: Number(tax.total_percentage || 0),
                    };
                } else {
                    updated[index] = {
                        ...updated[index],
                        tax_id: 0,
                        tax_name: "",
                        tax_percent: 0,
                    };
                }
                updated[index] = {
                    ...updated[index],
                    ...applyBillingCalculation(updated[index]),
                } as SalesDetail;
                return updated;
            });
        },
        [applyBillingCalculation, setDetails, taxById]
    );

    const removeRow = (index: number) =>
        setDetails((prev) => prev.filter((_, i) => i !== index));

    const togglePaymentMode = useCallback(
        (mode: PaymentMode, checked: boolean) => {
            setPayments((prev) => {
                if (checked) {
                    if (prev.some((payment) => payment.payment_mode_id === mode.id)) return prev;
                    return [
                        ...prev,
                        createPaymentEntry(mode, prev, netTotalAmount, selectedWarehouse),
                    ];
                }
                return prev.filter((payment) => payment.payment_mode_id !== mode.id);
            });
            setErrors((prev) => {
                const next = { ...prev };
                delete next[`payment_mode_${mode.id}`];
                delete next.payments;
                return next;
            });
        },
        [netTotalAmount, selectedWarehouse, setErrors, setPayments]
    );

    const updatePaymentAmount = useCallback(
        (paymentModeId: number, value: string) => {
            const parsedValue = value === "" ? "" : Number(value);
            setPayments((prev) =>
                prev.map((payment) =>
                    payment.payment_mode_id === paymentModeId
                        ? {
                            ...payment,
                            amount:
                                parsedValue === "" || Number.isFinite(parsedValue)
                                    ? parsedValue
                                    : payment.amount,
                        }
                        : payment
                )
            );
            setErrors((prev) => {
                const next = { ...prev };
                delete next[`payment_mode_${paymentModeId}`];
                delete next.payments;
                return next;
            });
        },
        [setErrors, setPayments]
    );
    const paymentCheckboxRefs = useRef<Array<HTMLInputElement | null>>([]);
    const paymentAmountRefs = useRef<Array<HTMLInputElement | null>>([]);
    const handlePaymentItemKeyDown = (
        currentIndex: number,
        isAmountInput: boolean,
        mode: PaymentMode,
        e: React.KeyboardEvent<HTMLInputElement>
    ) => {
        const totalModes = paymentModes.length;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const nextIndex = Math.min(currentIndex + 1, totalModes - 1);
            // Focus next checkbox or next amount field if available
            const target = paymentCheckboxRefs.current[nextIndex];
            target?.focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prevIndex = Math.max(currentIndex - 1, 0);
            const target = paymentCheckboxRefs.current[prevIndex];
            target?.focus();
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (!isAmountInput) {
                // If on a checkbox, toggle it on Enter
                const selectedPayment = payments.find((p) => p.payment_mode_id === mode.id);
                const willSelect = !selectedPayment;
                togglePaymentMode(mode, willSelect);

                if (willSelect) {
                    const currentPaid = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
                    const remaining = Math.max(0, netTotalAmount - currentPaid);
                    updatePaymentAmount(mode.id, remaining === 0 ? "" : String(remaining));

                    // Jump to amount input after toggling on
                    setTimeout(() => {
                        paymentAmountRefs.current[currentIndex]?.focus();
                        paymentAmountRefs.current[currentIndex]?.select();
                    }, 50);
                }
            } else {
                // If already on an amount input, move to the next mode or close
                if (currentIndex < totalModes - 1) {
                    paymentCheckboxRefs.current[currentIndex + 1]?.focus();
                } else {
                    setPaymentPanelOpen(false);
                    barcodeInputRef.current?.focus();
                }
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            setPaymentPanelOpen(false);
            barcodeInputRef.current?.focus();
        }
    };

    const handleSelectBill = (bill: SalesIndexRow) => {
        updateUiState({ showBillsPanel: false });
        if (!bill?.id) return;
        router.push(`/${company}/workspace/transactions/sales/add?id=${bill.id}`);
    };

    const handleOpenReturnSelection = async (bill: SalesIndexRow) => {
        setReturnSelectionBill(bill);
        setIsReturnSelectionView(true);
        setReturnLoading(true);
        setReturnError("");
        setReturnItems([]);

        try {
            const detailsRes = await fetch(`/api/sales/${bill.id}`, {
                headers: { "x-tenant": company || "" },
            });
            const detailsData = await detailsRes.json();
            if (!detailsData.success) {
                throw new Error(detailsData.error || "Failed to load invoice items");
            }

            const returnsRes = await fetch(`/api/sales-returns/previous-returns?sales_invoice_id=${bill.id}`, {
                headers: { "x-tenant": company || "" },
            });
            const returnsData = await returnsRes.json();
            if (!returnsData.success) {
                throw new Error(returnsData.error || "Failed to load previous returns");
            }

            const returnedQtyMap = new Map<number, number>();
            if (returnsData.data) {
                returnsData.data.forEach((r: any) => {
                    returnedQtyMap.set(Number(r.sales_invoice_line_id), Number(r.total_returned_qty));
                });
            }

            const origHeader = detailsData.data.header || {};
            const billAny = bill as any;
            const mappedReturnItems = detailsData.data.details.map((d: any) => {
                const soldQty = Number(d.qty || 0);
                const returnedQty = returnedQtyMap.get(Number(d.id)) || 0;
                const availableQty = Math.max(soldQty - returnedQty, 0);

                return {
                    id: d.id,
                    product_id: d.product_id,
                    product_name: d.product_name,
                    sku: d.sku,
                    sold_qty: soldQty,
                    already_returned_qty: returnedQty,
                    available_qty: availableQty,
                    unit_price: Number(d.rate || 0),
                    warehouse_id: d.warehouse_id || origHeader.warehouse_id || billAny.warehouse_id,
                    locator_id: d.locator_id || origHeader.locator_id || billAny.locator_id,
                    return_qty: 0,
                };
            });

            setReturnItems(mappedReturnItems);
        } catch (err: any) {
            setReturnError(err.message || "Failed to load items");
        } finally {
            setReturnLoading(false);
        }
    };

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!header.sales_no.trim()) newErrors.sales_no = "Bill No required";
        if (!header.customer_id) newErrors.customer_id = "Customer required";
        if (!header.sales_date) newErrors.sales_date = "Bill date required";

        const hasReturns = returnedItemsList.length > 0;
        if (!hasReturns) {
            if (header.total_amount <= 0)
                newErrors.total_amount = "Total amount must be greater than 0";

            if (details.length === 0) {
                newErrors.details = "At least one service row is required";
            } else {
                details.forEach((d, index) => {
                    if (!d.product_id) newErrors[`product_${index}`] = "Service Id required";
                    if (Number(d.rate || 0) <= 0) newErrors[`rate_${index}`] = "Unit Price must be > 0";
                    if (Number(d.qty || 0) <= 0) newErrors[`qty_${index}`] = "Qty must be > 0";
                });
            }
        } else {
            details.forEach((d, index) => {
                if (!d.product_id) newErrors[`product_${index}`] = "Service Id required";
                if (Number(d.rate || 0) <= 0) newErrors[`rate_${index}`] = "Unit Price must be > 0";
                if (Number(d.qty || 0) <= 0) newErrors[`qty_${index}`] = "Qty must be > 0";
            });
        }

        // Allow payment amounts >= net total (excess will be calculated as Return Change)
        payments.forEach((payment) => {
            if (Number(payment.amount || 0) <= 0) {
                newErrors[`payment_mode_${payment.payment_mode_id}`] = "Enter payment amount";
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const resetFormAfterSave = async () => {
        setDiscountMode("percent");
        setPrintData(null);
        setReturnSelectionBill(null);
        setReturnItems([]);
        setReturnedItemsList([]);
        setIsReturnSelectionView(false);
        setFormState((prev) => ({
            ...prev,
            header: {
                ...initialHeader,
                sales_date: new Date().toISOString().split("T")[0],
                user_name: user?.name || prev.header.user_name || "",
                warehouse_id: selectedWarehouse?.id ?? activeWarehouseId ?? "",
                location_id: selectedWarehouse?.location_id ?? activeLocationId ?? "",
                warehouse_name: selectedWarehouseName,
                location_name: selectedLocationName,
            },
            details: [],
            payments: [],
            couponCode: "",
            barcodeValue: "",
            barcodeMessage: "",
        }));
        setUiState((prev) => ({
            ...prev,
            errors: {},
            errorMessage: "",
            selectedProducts: [],
        }));
        resetLookupFilters();
        setLookupPage(1);

        if (company) {
            try {
                const res = await fetch("/api/sales/generateNo", {
                    headers: { "x-tenant": company },
                });
                const data = await res.json();
                if (data?.success && data.sales_no) {
                    setHeader((prev) => ({ ...prev, sales_no: data.sales_no }));
                } else {
                    setHeader((prev) => ({ ...prev, sales_no: generateSalesNo() }));
                }
            } catch (err) {
                console.error("Failed to refresh sales number", err);
                setHeader((prev) => ({ ...prev, sales_no: generateSalesNo() }));
            }
        } else {
            setHeader((prev) => ({ ...prev, sales_no: generateSalesNo() }));
        }

        lastFetchedIdRef.current = null;
        billsLoadedRef.current = false;
        salesIndexRef.current = null;
        salesIndexLoadingRef.current = null;
        setTimeout(() => barcodeInputRef.current?.focus(), 0);
    };

    type SaveOptions = {
        redirect?: boolean;
        reset?: boolean;
        overrideStatus?: string;
    };

    const saveSales = async (printAfterSave: boolean, options: SaveOptions = {}) => {
        const { redirect = true, reset = true, overrideStatus } = options;
        updateUiState({ errorMessage: "" });
        if (!activeWarehouseId) {
            updateUiState({ errorMessage: "Warehouse not assigned for this user. Contact administrator." });
            return null;
        }
        if (!validate()) return null;

        updateUiState({ loading: true });
        try {
            if (details && details.length > 0) {
                const stockCheckRes = await fetch("/api/pricing", {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "x-tenant": company,
                        "x-warehouse-id": String(activeWarehouseId),
                    },
                    body: JSON.stringify({
                        items: details.map((d) => ({
                            product_id: d.product_id,
                            qty: Number(d.qty),
                        })),
                    }),
                });
                const stockCheckData = await stockCheckRes.json();
                if (!stockCheckData.success) {
                    console.error("Stock check failed:", stockCheckData);
                    const stockErrors: Record<string, string> = {};
                    (stockCheckData.errors ?? []).forEach((e: any) => {
                        const idx = details.findIndex((d) => String(d.product_id) === String(e.product_id));
                        if (idx >= 0) {
                            stockErrors[`qty_${idx}`] = `Only ${e.available} available (requested ${e.requested})`;
                        }
                    });
                    setErrors((prev) => ({ ...prev, ...stockErrors }));
                    updateUiState({
                        errorMessage: "Insufficient stock for one or more items. See highlighted rows.",
                        loading: false,
                    });
                    return;
                }
            }
            const url = salesId ? `/api/sales/${salesId}` : "/api/sales";
            const method = salesId ? "PUT" : "POST";
            const payloadDetails = details.map((row) => ({
                ...row,
                discount_value: Number(row.discount_value || 0),
                discount_type: discountMode,
                discount_amount: Number(row.discount || 0),
            }));
            // Inside saveSales() in SalesForm.tsx:
            const payloadPayments = payments.map((payment) => {
                const rawAmt = Number(payment.amount || 0);
                return {
                    ...payment,
                    paid_amount: rawAmt,
                    actual_amount: Math.min(rawAmt, netTotalAmount),
                    return_change: balanceAmountstore,
                    amount: rawAmt,
                };
            });

            const finalHeader = {
                ...header,
                user_name: user?.name,
                warehouse_id: selectedWarehouse?.id ?? activeWarehouseId ?? header.warehouse_id,
                location_id: selectedWarehouse?.location_id ?? activeLocationId ?? header.location_id,
                status: overrideStatus || (header.status === "Hold" ? "Entered" : header.status || "Entered"),
                payment_status: calculatePaymentStatus(netTotalAmount, totalPaidAmount),
                total_amount: Number(netTotalAmount.toFixed(2)),
                return_change: balanceAmountstore,
            };
            if (overrideStatus) {
                finalHeader.status = overrideStatus;
            }

            const res = await fetch(url, {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    "x-tenant": company,
                },
                body: JSON.stringify({
                    header: finalHeader,
                    details: payloadDetails,
                    payments: payloadPayments,
                    returns: returnedItemsList.length > 0 ? {
                        sales_invoice_id: returnSelectionBill?.id,
                        refund_amount: returnedCreditValue,
                        items: returnedItemsList.map((item) => ({
                            sales_invoice_line_id: item.id,
                            product_id: item.product_id,
                            warehouse_id: item.warehouse_id,
                            locator_id: item.locator_id,
                            returned_qty: item.return_qty,
                            unit_price: item.unit_price,
                        })),
                    } : null,
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Failed to save sales");

            const mergedHeader: SalesHeaderType = {
                ...finalHeader,
                sales_no: data.sales_no || finalHeader.sales_no,
                payment_status:
                    data.payment_status || calculatePaymentStatus(billingTotals.total, totalPaidAmount),
            };

            if (printAfterSave) {
                updateUiState({
                    printSnapshot: {
                        header: buildPrintHeader(mergedHeader),
                        details,
                    },
                });
                setTimeout(() => handlePrint(), 0);
            }
            const savedBill = {
                id: data.id ?? data.sales_id ?? (salesId ? Number(salesId) : null),
                sales_no: data.sales_no || mergedHeader.sales_no,
            };

            if (redirect && company) {
                router.replace(`/${company}/workspace/transactions/sales/add`);
            }

            if (reset) {
                await resetFormAfterSave();
            }
            return savedBill;
        } catch (err: any) {
            console.error("Save Sales Error:", err);
            updateUiState({ errorMessage: err.message });
            return null;
        } finally {
            updateUiState({ loading: false });
        }
    };

    // 1. Normal Save button handler
    const handleSave = async (options: SaveOptions = {}) =>
        saveSales(false, { overrideStatus: "Entered", ...options });

    // 2. Save & Print button handler
    const handleSaveAndPrint = async () => {
        const savedBill = await handleSave({ redirect: false, reset: false, overrideStatus: "Entered" });
        if (savedBill?.id) {
            await printBill(savedBill.id);
            if (company) {
                router.replace(`/${company}/workspace/transactions/sales/add`);
            }
            await resetFormAfterSave();
        }
    };

    // 3. Hold Bill button handler
    const handleHoldBill = async () => {
        const savedBill = await saveSales(false, { redirect: false, reset: true, overrideStatus: "Hold" });
        if (savedBill?.id) {
            notify(`Bill ${savedBill.sales_no} placed on Hold!`);
        }
    };

    const printBill = useCallback(
        async (billId: number) => {
            if (!billId) return;
            try {
                const res = await fetch(`/api/bills/${billId}`, {
                    headers: { "x-tenant": company },
                });
                const payload = await res.json();
                if (!res.ok) {
                    throw new Error(payload?.error || "Failed to load bill for printing");
                }

                const bill = payload?.data ?? payload;
                const header = bill?.header ?? bill ?? {};
                const details = Array.isArray(bill?.details) ? bill.details : [];

                setPrintData({
                    header: {
                        sales_no: header.sales_no,
                        customer_name: header.customer_name,
                        customer_email: header.customer_email,
                        customer_phone: header.customer_phone,
                        customer_address: header.customer_address,
                        sales_date: header.sales_date,
                        subtotal: Number(header.subtotal || 0),
                        tax_amount: Number(header.tax_amount || 0),
                        total_amount: Number(header.total_amount || 0),
                        return_change: roundMoney(header.return_change || 0),
                    },
                    details: details.map((d: any) => ({
                        product_name: d.product_name,
                        qty: Number(d.qty || 0),
                        rate: Number(d.rate || 0),
                        discount: Number(d.discount_amount ?? d.discount ?? 0),
                        tax_percent: Number(d.tax_percent || 0),
                        tax_amount: Number(d.tax_amount || 0),
                        line_total: Number(d.line_total || 0),
                        tax_components: d.tax_components ?? [],
                    })),
                });
                // Wait for ThermalInvoice to fetch and render its API data
                // Inside printBill():
                await new Promise<void>((resolve) => {
                    thermalDataReadyRef.current = resolve;
                    setTimeout(resolve, 5000); // Fallback timeout
                });
                window.print();
            } catch (err: any) {
                console.error("Print bill failed:", err);
                updateUiState({ errorMessage: err?.message || "Failed to print bill" });
            }
        },
        [company, updateUiState]
    );



    const handleSalesDateChange = (e: ChangeEvent<HTMLInputElement>) => {
        setHeader((prev) => ({
            ...prev,
            sales_date: e.target.value,
        }));
    };

    const handleCouponChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormState((prev) => ({ ...prev, couponCode: e.target.value }));
    };

    const handleBarcodeChange = (e: ChangeEvent<HTMLInputElement>) => {
        const nextValue = e.target.value;
        setFormState((prev) => ({
            ...prev,
            barcodeValue: nextValue,
            barcodeMessage: prev.barcodeMessage ? "" : prev.barcodeMessage,
        }));
    };

    const handleBarcodeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleBarcodeSubmit();
        }
    };

    const handleOpenProductPopup = () => {
        updateUiState({ showProductPopup: true });
    };

    const handleQuickRateChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (resolvedActiveLineIndex === null) return;
        const value = e.target.value === "" ? "" : Number(e.target.value);
        handleRateChange(resolvedActiveLineIndex, value);
    };

    const handleQuickQtyChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (resolvedActiveLineIndex === null) return;
        const value = e.target.value === "" ? "" : Number(e.target.value);
        handleQtyChange(resolvedActiveLineIndex, value);
    };

    const handleQuickDiscountChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (resolvedActiveLineIndex === null) return;
        const value = e.target.value === "" ? "" : Number(e.target.value);
        handleDiscountChange(resolvedActiveLineIndex, value);
    };

    // --- KEYBOARD SHORTCUTS & ARROW KEY NAVIGATION ---
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            // Ctrl + P: Save and Print
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
                e.preventDefault();
                handleSaveAndPrint();
                return;
            }

            // Ctrl + S: Hold Bill
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                handleHoldBill();
                return;
            }

            // F8 / Esc: Quick Focus Barcode/Search Field
            if (e.key === "F8" || e.key === "Escape") {
                e.preventDefault();
                barcodeInputRef.current?.focus();
                return;
            }

            // F2: Focus Customer Select
            if (e.key === "F2") {
                e.preventDefault();
                salesHeaderRef.current?.focusCustomerSelect();
                return;
            }

            if (e.key === "F4") {
                e.preventDefault();
                setPaymentPanelOpen((prev) => {
                    const nextState = !prev;
                    if (nextState) {
                        // Auto-focus the first checkbox when panel opens
                        setTimeout(() => {
                            paymentCheckboxRefs.current[0]?.focus();
                        }, 50);
                    } else {
                        barcodeInputRef.current?.focus();
                    }
                    return nextState;
                });
                return;
            }
            // Alt + N: Reset Form / New Sale
            if (e.altKey && e.key.toLowerCase() === "n") {
                e.preventDefault();
                resetFormAfterSave();
                return;
            }

            // Arrow Key Items Navigation (when not typing inside inputs, or when on rate/qty/barcode)
            const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
            const isInput = targetTag === "input" || targetTag === "select" || targetTag === "textarea";

            if (e.key === "ArrowDown") {
                if (!isInput || e.target === barcodeInputRef.current) {
                    e.preventDefault();
                    setActiveLineIndex((prev) => {
                        if (prev === null) return 0;
                        return Math.min(prev + 1, details.length - 1);
                    });
                }
            } else if (e.key === "ArrowUp") {
                if (!isInput || e.target === barcodeInputRef.current) {
                    e.preventDefault();
                    setActiveLineIndex((prev) => {
                        if (prev === null || prev <= 0) return 0;
                        return prev - 1;
                    });
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [details.length, handleSave, handleSaveAndPrint, salesHeaderRef, setPaymentPanelOpen]);



    return (
        <div className="w-full px-6 py-8">
            <style>{`
        @media print {
          body > * { display: none !important; }
          #thermal-print-root { display: block !important; }
        }
      `}</style>



            {pageLoading &&
                createPortal(
                    <div className="fixed inset-0 z-[99999] bg-white/70 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-700 font-semibold text-lg">Loading Billing...</p>
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
                                {isEdit ? "Updating Billing..." : "Saving Billing..."}
                            </p>
                        </div>
                    </div>,
                    document.body
                )}
            {errorMessage ? (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                    {errorMessage}
                </div>
            ) : null}

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">{isEdit ? "Edit Billing" : "Fast Billing"}</span>
                    {errors.details ? <span className="font-medium text-red-500">{errors.details}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => router.push(`/${company}/workspace/transactions/sales`)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        Back
                    </button>
                    <button
                        type="button"
                        onClick={openBillsPanel}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                    >
                        View Bills
                    </button>
                </div>
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSave();
                }}
                className="space-y-3"
            >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-3">
                        <SalesHeader
                            ref={salesHeaderRef}
                            header={header}
                            warehouseName={selectedWarehouseName}
                            locationName={selectedLocationName}
                            couponCode={couponCode}
                            discountMode={discountMode}
                            selectedCustomerOption={selectedCustomerOption}
                            customerOptions={filteredCustomerOptions}
                            customerSearchInput={customerLookupInput}
                            salesNoError={errors.sales_no}
                            customerError={errors.customer_id}
                            salesDateError={errors.sales_date}
                            onCustomerSelect={handleCustomerSelect}
                            onCustomerSearchInputChange={handleCustomerSearchInputChange}
                            onOpenQuickCustomerPopup={handleOpenQuickCustomerPopup}
                            onSalesDateChange={handleSalesDateChange}
                            onCouponChange={handleCouponChange}
                            onDiscountModeChange={(e) =>
                                setDiscountMode(e.target.value as "percent" | "amount")
                            }
                        />

                        <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                            <div className="grid gap-3 md:grid-cols-12">
                                <div className="md:col-span-5">
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        Scan Item / Search Product (F8)
                                    </label>
                                    <div className="relative">
                                        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            ref={barcodeInputRef}
                                            type="text"
                                            value={barcodeValue}
                                            onChange={handleBarcodeChange}
                                            onKeyDown={handleBarcodeKeyDown}
                                            placeholder="Scan Barcode"
                                            className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        />
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        Rate
                                    </label>
                                    <input
                                        type="number"
                                        value={activeLine ? activeLine.rate : ""}
                                        onChange={handleQuickRateChange}
                                        disabled={!activeLine}
                                        className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                                        placeholder="Rate"
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        Qty
                                    </label>
                                    <input
                                        ref={qtyInputRef}
                                        type="number"
                                        value={activeLine ? activeLine.qty : ""}
                                        onChange={handleQuickQtyChange}
                                        disabled={!activeLine}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                barcodeInputRef.current?.focus();
                                            }
                                        }}
                                        className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                                        placeholder="Qty"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        Discount
                                    </label>
                                    <input
                                        type="number"
                                        value={activeLine ? activeLine.discount_value ?? "" : ""}
                                        onChange={handleQuickDiscountChange}
                                        disabled={!activeLine}
                                        className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                                        placeholder="Discount"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        Add
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleOpenProductPopup}
                                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                                    >
                                        <PlusIcon className="h-4 w-4" />
                                        Add Item
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                                <span>
                                    Active line: {activeLine ? `${activeLine.product_name} x ${activeLine.qty}` : "No item selected yet"}
                                </span>
                            </div>

                            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                                <div className="text-sm font-semibold text-slate-800">Billing Items</div>
                                <div className="text-xs text-slate-500">
                                    {details.length} item{details.length === 1 ? "" : "s"} in bill
                                </div>
                            </div>
                            <SalesTable
                                details={details}
                                errors={errors}
                                taxes={allTaxes}
                                activeIndex={resolvedActiveLineIndex}
                                onRateChange={handleRateChange}
                                onQtyChange={handleQtyChange}
                                onDiscountChange={handleDiscountChange}
                                onTaxChange={handleTaxChange}
                                onRemove={removeRow}
                                onSelectRow={setActiveLineIndex}
                            />
                            {returnedItemsList.length > 0 && (
                                <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                                        <span className="text-sm font-bold text-indigo-900">Returned Items (Credit Note)</span>
                                        <button
                                            type="button"
                                            onClick={() => setReturnedItemsList([])}
                                            className="text-xs font-semibold text-red-600 hover:text-red-800"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                    <div className="mt-2 divide-y divide-indigo-100/50 text-xs text-indigo-950">
                                        {returnedItemsList.map((item, idx) => (
                                            <div key={idx} className="flex justify-between py-1.5">
                                                <div>
                                                    <span className="font-semibold">{item.product_name}</span>
                                                    <span className="ml-2 font-mono text-gray-500">({item.sku})</span>
                                                </div>
                                                <div>
                                                    <span>{item.return_qty} &times; {item.unit_price.toFixed(2)}</span>
                                                    <span className="ml-4 font-bold">{(item.return_qty * item.unit_price).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 flex justify-between border-t border-indigo-100 pt-2 text-sm font-bold text-indigo-900">
                                        <span>Total Return Credit</span>
                                        <span>{returnedCreditValue.toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>

                    <aside className="space-y-3 xl:sticky xl:top-3 xl:self-start">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Billing Summary
                            </div>
                            <div className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span>Item Count</span>
                                    <span className="font-medium">{details.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Total Qty</span>
                                    <span className="text-gray-500">Subtotal</span>
                                    <span>{billingTotals.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="mt-1 flex justify-between">
                                    <span className="text-gray-500">Discount</span>
                                    <span>-{billingTotals.discount.toFixed(2)}</span>
                                </div>
                                <div className="mt-1 flex justify-between">
                                    <span className="text-gray-500">Tax</span>
                                    <span>{billingTotals.tax.toFixed(2)}</span>
                                </div>
                                <div className="mt-1 flex justify-between">
                                    <span className="text-gray-500">Rounding</span>
                                    <span>{(billingTotals.total - billingTotals.taxable - billingTotals.tax).toFixed(2)}</span>
                                </div>
                                {returnedCreditValue > 0 && (
                                    <div className="mt-1 flex justify-between text-indigo-600 font-semibold">
                                        <span>Return Credit</span>
                                        <span>-{returnedCreditValue.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="mt-2 border-t border-gray-200 pt-2">
                                    <div className="flex justify-between text-base font-bold text-gray-900">
                                        <span>Total Payable</span>
                                        <span>{netTotalAmount.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-xl border border-gray-200 p-3 mt-3">
                                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                    Payment Mode (F4)
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentPanelOpen((prev) => !prev)}
                                        className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-200 px-3 text-sm text-slate-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    >
                                        <span className="truncate font-medium">
                                            {payments.length
                                                ? payments
                                                    .map(
                                                        (p) => `${p.payment_mode_name || "Payment"}: ₹${p.amount || 0}`
                                                    )
                                                    .join(" | ")
                                                : "Select payment mode"}
                                        </span>
                                        <span className="text-xs font-semibold text-blue-600">
                                            {paymentPanelOpen ? "Close ▲" : "Open ▼"}
                                        </span>
                                    </button>

                                    {paymentPanelOpen && (
                                        <div className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
                                            <div className="max-h-72 space-y-2 overflow-auto pr-1">
                                                {paymentModes.map((mode, idx) => {
                                                    const selectedPayment = payments.find(
                                                        (p) => p.payment_mode_id === mode.id
                                                    );
                                                    const isSelected = Boolean(selectedPayment);

                                                    return (
                                                        <div
                                                            key={mode.id}
                                                            className={`flex items-center gap-3 rounded-lg border p-2 text-sm transition-colors ${isSelected
                                                                ? "border-blue-200 bg-blue-50/40"
                                                                : "border-gray-100 bg-white"
                                                                }`}
                                                        >
                                                            <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    ref={(el) => {
                                                                        paymentCheckboxRefs.current[idx] = el;
                                                                    }}
                                                                    onChange={(e) => {
                                                                        togglePaymentMode(mode, e.target.checked);
                                                                        if (e.target.checked) {
                                                                            const currentPaid = payments.reduce(
                                                                                (acc, p) => acc + (Number(p.amount) || 0),
                                                                                0
                                                                            );
                                                                            const remaining = Math.max(
                                                                                0,
                                                                                billingTotals.total - currentPaid
                                                                            );
                                                                            updatePaymentAmount(
                                                                                mode.id,
                                                                                remaining === 0 ? "" : String(remaining)
                                                                            );
                                                                            setTimeout(() => {
                                                                                paymentAmountRefs.current[idx]?.focus();
                                                                            }, 0);
                                                                        }
                                                                    }}
                                                                    onKeyDown={(e) =>
                                                                        handlePaymentItemKeyDown(idx, false, mode, e)
                                                                    }
                                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                />
                                                                <span>{getPaymentModeName(mode)}</span>
                                                            </label>

                                                            {isSelected && (
                                                                <div className="ml-auto flex items-center gap-1">
                                                                    <span className="text-xs text-gray-400">₹</span>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        ref={(el) => {
                                                                            paymentAmountRefs.current[idx] = el;
                                                                        }}
                                                                        placeholder="Amount"
                                                                        value={selectedPayment?.amount ?? ""}
                                                                        onChange={(e) =>
                                                                            updatePaymentAmount(mode.id, e.target.value)
                                                                        }
                                                                        onKeyDown={(e) =>
                                                                            handlePaymentItemKeyDown(idx, true, mode, e)
                                                                        }
                                                                        className="h-8 w-28 rounded-md border border-gray-300 px-2 text-right text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {errors.payments ? (
                                    <p className="mt-2 text-xs text-red-500">{errors.payments}</p>
                                ) : null}
                            </div>
                            <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
                                <div className="flex justify-between">
                                    <span>Paid</span>
                                    <span>{totalPaidAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Balance Due</span>
                                    <span>{balanceAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-semibold text-emerald-600">
                                    <span>Change</span>
                                    <span>{balanceAmountstore.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-dashed border-gray-100">
                                    <span>Payment Status</span>
                                    {(() => {
                                        const stat = calculatePaymentStatus(netTotalAmount, totalPaidAmount);
                                        console.log("--- Billing Summary Variables ---");
                                        console.log("Total Payable (netTotalAmount):", netTotalAmount);
                                        console.log("Paid (totalPaidAmount):", totalPaidAmount);
                                        console.log("Balance Due (balanceAmount):", balanceAmount);
                                        console.log("Change (balanceAmountstore):", balanceAmountstore);
                                        console.log("Payment Status (stat):", stat);
                                        return (
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${stat === "paid"
                                                ? "bg-emerald-100 text-emerald-800"
                                                : stat === "partial"
                                                    ? "bg-amber-100 text-amber-800"
                                                    : "bg-rose-100 text-rose-800"
                                                }`}>
                                                {stat.toUpperCase()}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

                            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                    Actions
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={handleHoldBill}
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 text-sm font-medium text-white hover:bg-amber-600"
                                    >
                                        <PauseIcon className="h-3 w-3 shrink-0" />
                                        <span>Hold (Ctrl+S)</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleSaveAndPrint}
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
                                    >
                                        <PrinterIcon className="h-3 w-3 shrink-0" />
                                        <span>Print (Ctrl+P)</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={resetFormAfterSave}
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                        <ArrowPathIcon className="h-3 w-3 shrink-0" />
                                        <span>Reset (Alt+N)</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </form>

            <ProductLookupModal
                open={showProductPopup}
                onClose={closePopup}
                onAddSelected={addSelectedProducts}
                errorMessage={popupError}
                items={lookupPaginatedItems}
                loading={lookupLoading}
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
                isSelected={(item) => selectedProducts.includes(item.id)}
                onToggle={(item) => toggleProduct(item.id)}
                onToggleAll={(checked, pageItems) => {
                    if (checked) {
                        setSelectedProducts(pageItems.map((p) => p.id));
                    } else {
                        setSelectedProducts([]);
                    }
                }}
            />

            {showQuickCustomerPopup && (
                <div className="fixed inset-0 z-[99998] flex items-center justify-center p-4">
                    <button
                        type="button"
                        onClick={closeQuickCustomerPopup}
                        className="absolute inset-0 bg-black/30"
                        aria-label="Close customer popup"
                    />
                    <div className="relative w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-base font-semibold text-gray-900">Add Customer</h2>
                            <button
                                type="button"
                                onClick={closeQuickCustomerPopup}
                                className="text-sm text-gray-500 hover:text-gray-800"
                            >
                                Close
                            </button>
                        </div>
                        <div className="mt-3 space-y-3">
                            <div>
                                <label className="mb-1 block text-sm font-semibold">
                                    Customer Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newCustomerName}
                                    onChange={handleNewCustomerNameChange}
                                    className="w-full rounded border p-2"
                                    placeholder="Enter customer name"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-semibold">Phone Number</label>
                                <input
                                    type="text"
                                    value={newCustomerPhone}
                                    onChange={handleNewCustomerPhoneChange}
                                    className="w-full rounded border p-2"
                                    placeholder="Phone number"
                                />
                            </div>
                            {customerQuickAddError && (
                                <p className="text-sm text-red-500">{customerQuickAddError}</p>
                            )}
                            <button
                                type="button"
                                onClick={handleCreateCustomer}
                                disabled={customerQuickAddLoading}
                                className="w-full rounded bg-blue-600 py-2.5 text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {customerQuickAddLoading ? "Saving..." : "Save Customer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBillsPanel &&
                createPortal(
                    <div className="fixed inset-0 z-[99999]">
                        <div
                            className="absolute inset-0 bg-black/40"
                            onClick={() => updateUiState({ showBillsPanel: false })}
                        />
                        <div className="absolute right-0 top-0 h-full w-[600px] bg-white shadow-2xl flex flex-col">
                            <div className="flex items-center justify-between px-5 py-4 border-b gap-4">
                                <div className="text-lg font-semibold whitespace-nowrap">Previous Bills</div>
                                <input
                                    type="text"
                                    placeholder="Search by amt, name, date, no..."
                                    value={billsSearch}
                                    onChange={(e) => setBillsSearch(e.target.value)}
                                    className="flex-1 max-w-xs rounded-md border border-gray-300 px-3 py-1 text-sm outline-none focus:border-blue-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => updateUiState({ showBillsPanel: false })}
                                    className="text-gray-500 hover:text-gray-800 text-sm font-medium"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto flex flex-col">
                                {isReturnSelectionView && returnSelectionBill ? (
                                    <div className="flex-1 p-5 flex flex-col space-y-4">
                                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                                            <button
                                                type="button"
                                                onClick={() => setIsReturnSelectionView(false)}
                                                className="text-indigo-600 hover:underline"
                                            >
                                                &larr; Back to Bills
                                            </button>
                                            <span>/</span>
                                            <span>Return Selection</span>
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-gray-900">
                                                Return for Bill: {returnSelectionBill.sales_no}
                                            </h3>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                Customer: {returnSelectionBill.customer_name || returnSelectionBill.customer_id}
                                            </p>
                                        </div>

                                        {returnLoading && (
                                            <div className="text-sm text-gray-500 py-4 text-center">Loading items...</div>
                                        )}
                                        {returnError && (
                                            <div className="text-sm text-red-500 py-4 text-center">{returnError}</div>
                                        )}

                                        {!returnLoading && !returnError && (
                                            <div className="flex-1 overflow-auto max-h-[60vh] border rounded-lg">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-slate-50 text-gray-600 sticky top-0 border-b">
                                                        <tr>
                                                            <th className="p-2.5 text-left font-semibold">Item</th>
                                                            <th className="p-2.5 text-center font-semibold">Sold</th>
                                                            <th className="p-2.5 text-center font-semibold">Returned</th>
                                                            <th className="p-2.5 text-center font-semibold">Available</th>
                                                            <th className="p-2.5 text-center font-semibold w-20">Return Qty</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {returnItems.map((item, index) => (
                                                            <tr key={item.id} className="hover:bg-slate-50/50">
                                                                <td className="p-2.5">
                                                                    <span className="font-semibold block text-gray-800">{item.product_name}</span>
                                                                    <span className="text-[10px] text-gray-400 font-mono block">SKU: {item.sku}</span>
                                                                </td>
                                                                <td className="p-2.5 text-center text-gray-600">{item.sold_qty}</td>
                                                                <td className="p-2.5 text-center text-gray-600">{item.already_returned_qty}</td>
                                                                <td className="p-2.5 text-center font-semibold text-gray-700">{item.available_qty}</td>
                                                                <td className="p-2.5 text-center">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        max={item.available_qty}
                                                                        value={item.return_qty || ""}
                                                                        onChange={(e) => {
                                                                            const val = Math.min(
                                                                                Math.max(Number(e.target.value || 0), 0),
                                                                                item.available_qty
                                                                            );
                                                                            setReturnItems((prev) =>
                                                                                prev.map((it, idx) =>
                                                                                    idx === index
                                                                                        ? { ...it, return_qty: val }
                                                                                        : it
                                                                                )
                                                                            );
                                                                        }}
                                                                        className="w-16 border rounded p-1 text-center font-bold"
                                                                    />
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        <div className="pt-4 border-t flex gap-3 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setIsReturnSelectionView(false)}
                                                className="px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!returnItems.some((item) => item.return_qty > 0)}
                                                onClick={() => {
                                                    const selected = returnItems.filter((item) => item.return_qty > 0);
                                                    setReturnedItemsList(selected);
                                                    updateUiState({ showBillsPanel: false });
                                                    setIsReturnSelectionView(false);

                                                    if (returnSelectionBill?.customer_id) {
                                                        setHeader((prev) => ({
                                                            ...prev,
                                                            customer_id: String(returnSelectionBill.customer_id),
                                                        }));
                                                        const cust = allCustomers.find((c) => String(c.id) === String(returnSelectionBill.customer_id));
                                                        if (cust) {
                                                            setSelectedCustomerOption(mapCustomerToSelectOption(cust));
                                                        }
                                                    }
                                                }}
                                                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                                            >
                                                Exchange (Load Credit)
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {billsLoading && (
                                            <div className="p-5 text-sm text-gray-500">Loading bills...</div>
                                        )}
                                        {billsError && <div className="p-5 text-sm text-red-500">{billsError}</div>}
                                        {!billsLoading && !billsError && (
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-600 sticky top-0 border-b z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                                                    <tr>
                                                        <th className="p-3 text-left font-semibold">Bill No</th>
                                                        <th className="p-3 text-left font-semibold">Customer</th>
                                                        <th className="p-3 text-left font-semibold">Date</th>
                                                        <th className="p-3 text-center font-semibold">Payment Status</th>
                                                        <th className="p-3 text-right font-semibold">Total</th>
                                                        <th className="p-3 text-center font-semibold">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedBills.length === 0 && (
                                                        <tr>
                                                            <td className="p-4 text-sm text-gray-400" colSpan={6}>
                                                                No bills available.
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {sortedBills.map((bill) => {
                                                        const isHold = bill.status === "Hold";
                                                        const paymentStatus = bill.payment_status || "unpaid";

                                                        return (
                                                            <tr
                                                                key={bill.id}
                                                                className="border-t hover:bg-blue-50 transition"
                                                            >
                                                                <td
                                                                    onClick={() => handleSelectBill(bill)}
                                                                    className="p-3 font-medium text-gray-700 cursor-pointer"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        {isHold && (
                                                                            <span className="relative flex h-2.5 w-2.5" title="Payment Due / Bill on Hold">
                                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                                                            </span>
                                                                        )}
                                                                        <span>{bill.sales_no}</span>
                                                                    </div>
                                                                </td>
                                                                <td
                                                                    onClick={() => handleSelectBill(bill)}
                                                                    className="p-3 text-gray-600 cursor-pointer"
                                                                >
                                                                    {bill.customer_name || bill.customer_id}
                                                                </td>
                                                                <td
                                                                    onClick={() => handleSelectBill(bill)}
                                                                    className="p-3 text-gray-600 cursor-pointer"
                                                                >
                                                                    {formatDateLabel(bill.sales_date || bill.created_at)}
                                                                </td>
                                                                {/* Status Badge */}
                                                                <td className="p-3 text-center">
                                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${paymentStatus === "paid"
                                                                        ? "bg-emerald-100 text-emerald-800"
                                                                        : paymentStatus === "partial"
                                                                            ? "bg-amber-100 text-amber-800"
                                                                            : "bg-rose-100 text-rose-800"
                                                                        }`}>
                                                                        {paymentStatus.toUpperCase()}
                                                                    </span>
                                                                </td>
                                                                <td
                                                                    onClick={() => handleSelectBill(bill)}
                                                                    className="p-3 text-right font-semibold text-gray-700 cursor-pointer"
                                                                >
                                                                    {Number(bill.total_amount || 0).toFixed(2)}
                                                                </td>
                                                                <td className="p-3 text-center">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            void handleOpenReturnSelection(bill);
                                                                        }}
                                                                        className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition"
                                                                    >
                                                                        Return/Exch
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            {/* Standard Print Container */}
            <div className="absolute left-[-10000px] top-0">
                <div ref={printRef}>
                    {printSnapshot && (
                        <PrintBillingInvoice
                            header={printSnapshot.header}
                            details={printSnapshot.details as any}
                        />
                    )}
                </div>
            </div>

            {/* Keyboard Shortcut Indicator Bar (Fixed Sticky Footer) */}
            <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-slate-200 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 shadow-lg">
                <span className="flex items-center gap-1">
                    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-xs text-white">F2</kbd> Customer
                </span>
                <span className="flex items-center gap-1">
                    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-xs text-white">F8 / Esc</kbd> Scan Barcode
                </span>
                <span className="flex items-center gap-1">
                    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-xs text-white">F4</kbd> Payment Modes
                </span>
                <span className="flex items-center gap-1">
                    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-xs text-white">Ctrl + P</kbd> Save & Print
                </span>
                <span className="flex items-center gap-1">
                    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-xs text-white">Ctrl + S</kbd> Hold Bill
                </span>
                <span className="flex items-center gap-1">
                    <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-xs text-white">↑ / ↓</kbd> Navigate Items
                </span>
            </div>

            {/* Thermal Print Portal (MUST be inside the main container div) */}
            {typeof document !== "undefined" &&
                createPortal(
                    <div id="thermal-print-root" style={{ display: "none" }}>
                        {printData && (
                            <ThermalInvoice
                                ref={thermalRef}
                                header={printData.header}
                                details={printData.details}
                                onDataReady={() => {
                                    if (thermalDataReadyRef.current) {
                                        thermalDataReadyRef.current();
                                        thermalDataReadyRef.current = null;
                                    }
                                }}
                            />
                        )}
                    </div>,
                    document.body
                )}
        </div>
    );
}