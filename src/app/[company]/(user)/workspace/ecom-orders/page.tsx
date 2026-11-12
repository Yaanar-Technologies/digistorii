"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import Badge from "@/components/ui/badge/Badge";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  XMarkIcon,
  CreditCardIcon,
  TruckIcon,
  ShoppingBagIcon,
  CurrencyRupeeIcon,
  PrinterIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface OrderSummaryItem {
  id: number;
  order_no: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  order_status: string;
  payment_status: string;
  delivery_status: string;
  payment_method: string | null;
  subtotal: number;
  tax_amount: number;
  shipping_fee: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  created_at: string;
  items_count: number;
}

interface StatusCountsSummary {
  total: number;
  placed: number;
  confirmed: number;
  packed: number;
  shipped: number;
  out_for_delivery: number;
  delivered: number;
  cancelled: number;
  payment_failed: number;
  returned: number;
  refunded: number;
  payment_pending: number;
  payment_paid: number;
}

interface BulkShipResultItem {
  orderId: number;
  orderNo: string;
  success: boolean;
  awbNumber?: string;
  trackingUrl?: string;
  shippingLabelUrl?: string;
  courierPartner?: string;
  error?: string;
}

export default function EcomOrdersListPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";
  const [, startTransition] = useTransition();

  const [orders, setOrders] = useState<OrderSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StatusCountsSummary | null>(null);

  // Selection states for bulk actions
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgressText, setBulkProgressText] = useState("");
  const [bulkResults, setBulkResults] = useState<{
    total: number;
    successful: number;
    failed: number;
    results: BulkShipResultItem[];
  } | null>(null);

  // Manifest modal state
  const [manifestData, setManifestData] = useState<any | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);

  // Filter states
  const [selectedStatusChip, setSelectedStatusChip] = useState<string>("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(20);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch orders list
  const fetchOrders = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    try {
      const qParams = new URLSearchParams();
      const activeStatus = selectedStatusChip || orderStatusFilter;
      if (activeStatus) qParams.set("status", activeStatus);
      if (paymentStatusFilter) qParams.set("payment_status", paymentStatusFilter);
      if (deliveryStatusFilter) qParams.set("delivery_status", deliveryStatusFilter);
      if (fromDate) qParams.set("from_date", fromDate);
      if (toDate) qParams.set("to_date", toDate);
      if (debouncedSearch) qParams.set("search", debouncedSearch);
      qParams.set("page", String(currentPage));
      qParams.set("pageSize", String(pageSize));

      const res = await apiFetch(`/api/${company}/ecom/orders?${qParams.toString()}`, company);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setOrders(data.orders || []);
          setTotalCount(data.total || 0);
          setTotalPages(data.totalPages || 1);
          if (data.summary) {
            setSummary(data.summary);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch online orders:", err);
    } finally {
      setLoading(false);
    }
  }, [
    company,
    selectedStatusChip,
    orderStatusFilter,
    paymentStatusFilter,
    deliveryStatusFilter,
    fromDate,
    toDate,
    debouncedSearch,
    currentPage,
    pageSize,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleChipClick = (statusKey: string) => {
    setSelectedStatusChip((prev) => (prev === statusKey ? "" : statusKey));
    setOrderStatusFilter("");
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  const handleClearFilters = () => {
    setSelectedStatusChip("");
    setOrderStatusFilter("");
    setPaymentStatusFilter("");
    setDeliveryStatusFilter("");
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setDebouncedSearch("");
    setCurrentPage(1);
    setSelectedOrderIds([]);
  };

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedOrderIds.length === orders.length && orders.length > 0) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map((o) => o.id));
    }
  };

  const handleToggleOrder = (orderId: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  // Bulk Ship Action
  const handleBulkShip = async (targetIds = selectedOrderIds) => {
    if (targetIds.length === 0) return;
    setBulkProcessing(true);
    setBulkProgressText(`Dispatching ${targetIds.length} orders...`);

    try {
      const res = await apiFetch(`/api/${company}/ecom/orders/bulk-ship`, company, {
        method: "POST",
        body: JSON.stringify({ orderIds: targetIds }),
      });

      const data = await res.json();
      if (data.success) {
        setBulkResults({
          total: data.total,
          successful: data.successful,
          failed: data.failed,
          results: data.results || [],
        });
        fetchOrders();
        // Clear selection of successful orders
        const failedIds = (data.results || [])
          .filter((r: BulkShipResultItem) => !r.success)
          .map((r: BulkShipResultItem) => r.orderId);
        setSelectedOrderIds(failedIds);
      } else {
        alert(data.error || "Failed to execute bulk shipment");
      }
    } catch (err: any) {
      alert(err.message || "Network error during bulk dispatch");
    } finally {
      setBulkProcessing(false);
      setBulkProgressText("");
    }
  };

  // Bulk Print Labels Action
  const handleBulkPrintLabels = async () => {
    if (selectedOrderIds.length === 0) return;

    try {
      const res = await apiFetch(`/api/${company}/ecom/orders/bulk-print`, company, {
        method: "POST",
        body: JSON.stringify({
          action: "print_labels",
          orderIds: selectedOrderIds,
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.labels)) {
        const validUrls = data.labels
          .map((l: any) => l.labelUrl)
          .filter((url: string) => url && url.startsWith("http"));

        if (validUrls.length === 0) {
          alert("No shipping label URLs found for the selected orders. Ensure AWBs are assigned first.");
          return;
        }

        // Open each label in printer tabs or printable popup
        if (validUrls.length === 1) {
          window.open(validUrls[0], "_blank");
        } else {
          // Open multiple or combined labels window
          validUrls.forEach((url: string) => window.open(url, "_blank"));
        }
      } else {
        alert(data.error || "Failed to fetch shipping labels");
      }
    } catch (err: any) {
      alert(err.message || "Error fetching shipping labels");
    }
  };

  // Bulk Manifest Action
  const handleGenerateManifest = async () => {
    if (selectedOrderIds.length === 0) return;
    setManifestLoading(true);

    try {
      const res = await apiFetch(`/api/${company}/ecom/orders/bulk-print`, company, {
        method: "POST",
        body: JSON.stringify({
          action: "generate_manifest",
          orderIds: selectedOrderIds,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setManifestData(data);
      } else {
        alert(data.error || "Failed to generate handover manifest");
      }
    } catch (err: any) {
      alert(err.message || "Error generating manifest");
    } finally {
      setManifestLoading(false);
    }
  };

  const hasActiveFilters =
    !!selectedStatusChip ||
    !!orderStatusFilter ||
    !!paymentStatusFilter ||
    !!deliveryStatusFilter ||
    !!fromDate ||
    !!toDate ||
    !!debouncedSearch;

  // Formatting helpers
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case "placed":
        return <Badge variant="light" color="light">Placed</Badge>;
      case "confirmed":
        return <Badge variant="light" color="info">Confirmed</Badge>;
      case "packed":
        return <Badge variant="light" color="primary">Packed</Badge>;
      case "shipped":
        return <Badge variant="light" color="primary">Shipped</Badge>;
      case "out_for_delivery":
        return <Badge variant="light" color="warning">Out for Delivery</Badge>;
      case "delivered":
        return <Badge variant="light" color="success">Delivered</Badge>;
      case "cancelled":
        return <Badge variant="light" color="error">Cancelled</Badge>;
      case "payment_failed":
        return <Badge variant="light" color="error">Payment Failed</Badge>;
      case "returned":
      case "refunded":
        return <Badge variant="light" color="warning">{status === "returned" ? "Returned" : "Refunded"}</Badge>;
      default:
        return <Badge variant="light" color="light">{status}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="light" color="success">Paid</Badge>;
      case "pending":
        return <Badge variant="light" color="warning">Pending</Badge>;
      case "authorized":
        return <Badge variant="light" color="info">Authorized</Badge>;
      case "failed":
        return <Badge variant="light" color="error">Failed</Badge>;
      case "refunded":
        return <Badge variant="light" color="warning">Refunded</Badge>;
      default:
        return <Badge variant="light" color="light">{status}</Badge>;
    }
  };

  const getDeliveryStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return <Badge variant="light" color="success">Delivered</Badge>;
      case "out_for_delivery":
        return <Badge variant="light" color="warning">Out For Delivery</Badge>;
      case "in_transit":
      case "picked_up":
        return <Badge variant="light" color="primary">{status.replace("_", " ")}</Badge>;
      case "failed_delivery":
      case "rto":
        return <Badge variant="light" color="error">{status === "rto" ? "RTO" : "Delivery Failed"}</Badge>;
      case "not_shipped":
      default:
        return <Badge variant="light" color="light">Not Shipped</Badge>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <ShoppingBagIcon className="w-7 h-7 text-brand-500" />
            Online Orders & Fulfillment
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track, fulfill, batch ship, and print manifests for customer orders.
          </p>
        </div>

        <button
          onClick={() => fetchOrders()}
          disabled={loading || bulkProcessing}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700/70 transition-colors"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin text-brand-500" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Top Status Summary Chips */}
      {summary && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <button
            onClick={() => handleChipClick("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              !selectedStatusChip
                ? "bg-brand-500 text-white border-brand-500 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            All Orders ({summary.total})
          </button>
          <button
            onClick={() => handleChipClick("placed")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              selectedStatusChip === "placed"
                ? "bg-gray-700 text-white border-gray-700 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            Placed ({summary.placed})
          </button>
          <button
            onClick={() => handleChipClick("confirmed")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              selectedStatusChip === "confirmed"
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            Confirmed ({summary.confirmed})
          </button>
          <button
            onClick={() => handleChipClick("packed")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              selectedStatusChip === "packed"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            Packed ({summary.packed})
          </button>
          <button
            onClick={() => handleChipClick("shipped")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              selectedStatusChip === "shipped"
                ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            Shipped ({summary.shipped})
          </button>
          <button
            onClick={() => handleChipClick("out_for_delivery")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              selectedStatusChip === "out_for_delivery"
                ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            Out for Delivery ({summary.out_for_delivery})
          </button>
          <button
            onClick={() => handleChipClick("delivered")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              selectedStatusChip === "delivered"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            Delivered ({summary.delivered})
          </button>
          <button
            onClick={() => handleChipClick("cancelled")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              selectedStatusChip === "cancelled"
                ? "bg-red-600 text-white border-red-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
            }`}
          >
            Cancelled ({summary.cancelled})
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by order #, customer, phone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          {/* Order Status */}
          <div>
            <select
              value={orderStatusFilter}
              onChange={(e) => {
                setOrderStatusFilter(e.target.value);
                setSelectedStatusChip("");
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">Order Status: All</option>
              <option value="placed">Placed</option>
              <option value="confirmed">Confirmed</option>
              <option value="packed">Packed</option>
              <option value="shipped">Shipped</option>
              <option value="out_for_delivery">Out For Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
              <option value="payment_failed">Payment Failed</option>
              <option value="returned">Returned</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Payment Status */}
          <div>
            <select
              value={paymentStatusFilter}
              onChange={(e) => {
                setPaymentStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">Payment: All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="authorized">Authorized</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="partial">Partial</option>
            </select>
          </div>

          {/* Delivery Status */}
          <div>
            <select
              value={deliveryStatusFilter}
              onChange={(e) => {
                setDeliveryStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">Delivery: All</option>
              <option value="not_shipped">Not Shipped</option>
              <option value="picked_up">Picked Up</option>
              <option value="in_transit">In Transit</option>
              <option value="out_for_delivery">Out For Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="failed_delivery">Failed Delivery</option>
              <option value="rto">RTO</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              title="From Date"
            />
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              title="To Date"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700/60 text-xs text-gray-500">
            <span>
              Showing filtered results ({totalCount} {totalCount === 1 ? "order" : "orders"})
            </span>
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-600 font-medium"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Orders Table Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/75 dark:bg-gray-900/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                    onChange={handleToggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-4">Order No</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4 text-center">Items</th>
                <th className="py-3.5 px-4 text-right">Total</th>
                <th className="py-3.5 px-4">Payment</th>
                <th className="py-3.5 px-4">Delivery</th>
                <th className="py-3.5 px-4">Order Status</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50 text-sm">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded mx-auto"></div></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28"></div></td>
                    <td className="py-4 px-4 text-center"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8 mx-auto"></div></td>
                    <td className="py-4 px-4 text-right"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 ml-auto"></div></td>
                    <td className="py-4 px-4"><div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-16"></div></td>
                    <td className="py-4 px-4"><div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-20"></div></td>
                    <td className="py-4 px-4"><div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-20"></div></td>
                    <td className="py-4 px-4 text-center"><div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-16 mx-auto"></div></td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500 dark:text-gray-400">
                    <ShoppingBagIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-base font-medium text-gray-900 dark:text-white">No online orders found</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {hasActiveFilters
                        ? "Try clearing some search filters to find what you're looking for."
                        : "Customer orders placed on your storefront will appear here."}
                    </p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isSelected = selectedOrderIds.includes(order.id);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/${company}/workspace/ecom-orders/${order.id}`)}
                      className={`hover:bg-gray-50/80 dark:hover:bg-gray-750 cursor-pointer transition-colors ${
                        isSelected ? "bg-brand-50/40 dark:bg-brand-900/10" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleOrder(order.id)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>

                      {/* Order No */}
                      <td className="py-3.5 px-4 font-semibold text-brand-600 dark:text-brand-400">
                        {order.order_no}
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {order.customer_name}
                        </div>
                        {order.customer_phone && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {order.customer_phone}
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {formatDateTime(order.created_at)}
                      </td>

                      {/* Items */}
                      <td className="py-3.5 px-4 text-center font-medium text-gray-700 dark:text-gray-300">
                        {order.items_count}
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(order.total_amount)}
                      </td>

                      {/* Payment */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {getPaymentStatusBadge(order.payment_status)}
                          {order.payment_method && (
                            <span className="text-[11px] font-medium uppercase text-gray-400">
                              {order.payment_method}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Delivery */}
                      <td className="py-3.5 px-4">
                        {getDeliveryStatusBadge(order.delivery_status)}
                      </td>

                      {/* Order Status */}
                      <td className="py-3.5 px-4">
                        {getOrderStatusBadge(order.order_status)}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/${company}/workspace/ecom-orders/${order.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100/80 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20 rounded-md transition-colors"
                        >
                          <EyeIcon className="w-3.5 h-3.5" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 text-xs text-gray-500 dark:text-gray-400">
          <div>
            Showing{" "}
            <span className="font-semibold text-gray-900 dark:text-white">
              {totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-gray-900 dark:text-white">
              {Math.min(currentPage * pageSize, totalCount)}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{totalCount}</span> orders
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
              Previous
            </button>

            <span className="text-xs px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700"
            >
              Next
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bottom Action Bar for Bulk Fulfillment */}
      {selectedOrderIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex flex-wrap items-center gap-3 border border-gray-700/80 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
            <span className="inline-flex items-center justify-center bg-brand-500 text-white font-bold text-xs h-6 px-2.5 rounded-full">
              {selectedOrderIds.length}
            </span>
            <span className="text-xs font-medium text-gray-200">Selected</span>
            <button
              onClick={() => setSelectedOrderIds([])}
              className="text-gray-400 hover:text-white ml-1 text-xs"
              title="Clear selection"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Action: Bulk Ship */}
          <button
            onClick={() => handleBulkShip()}
            disabled={bulkProcessing}
            className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            <TruckIcon className="w-4 h-4" />
            {bulkProcessing ? bulkProgressText : "Generate Shipments & AWBs"}
          </button>

          {/* Secondary Action: Print Labels */}
          <button
            onClick={handleBulkPrintLabels}
            disabled={bulkProcessing}
            className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold px-3.5 py-2 rounded-xl border border-gray-700 transition-colors"
          >
            <PrinterIcon className="w-4 h-4 text-gray-400" />
            Print Selected Labels
          </button>

          {/* Secondary Action: Handover Manifest */}
          <button
            onClick={handleGenerateManifest}
            disabled={bulkProcessing || manifestLoading}
            className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold px-3.5 py-2 rounded-xl border border-gray-700 transition-colors"
          >
            <DocumentTextIcon className="w-4 h-4 text-gray-400" />
            {manifestLoading ? "Generating..." : "Generate Courier Manifest"}
          </button>
        </div>
      )}

      {/* Bulk Results Summary Modal */}
      {bulkResults && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-3xl w-full shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <TruckIcon className="w-5 h-5 text-brand-500" />
                  Bulk Dispatch Results
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Processed {bulkResults.total} orders — {bulkResults.successful} succeeded, {bulkResults.failed} failed.
                </p>
              </div>
              <button
                onClick={() => setBulkResults(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-2 flex-1">
              {bulkResults.results.map((res) => (
                <div
                  key={res.orderId}
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                    res.success
                      ? "bg-green-50/70 dark:bg-green-950/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-300"
                      : "bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {res.success ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0" />
                    ) : (
                      <ExclamationTriangleIcon className="w-5 h-5 text-red-600 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold">{res.orderNo}</span>
                      {res.awbNumber && (
                        <span className="ml-2 px-2 py-0.5 bg-white dark:bg-gray-900 rounded font-mono text-[11px] border border-green-300 dark:border-green-700">
                          AWB: {res.awbNumber}
                        </span>
                      )}
                      {res.error && (
                        <p className="text-red-700 dark:text-red-400 mt-0.5 text-[11px]">{res.error}</p>
                      )}
                    </div>
                  </div>

                  {res.shippingLabelUrl && (
                    <a
                      href={res.shippingLabelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 bg-white dark:bg-gray-900 hover:bg-gray-50 text-gray-700 dark:text-gray-200 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-700 font-medium shrink-0"
                    >
                      <PrinterIcon className="w-3.5 h-3.5" />
                      Label
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 flex items-center justify-between">
              {bulkResults.failed > 0 ? (
                <button
                  onClick={() => {
                    const failedIds = bulkResults.results.filter((r) => !r.success).map((r) => r.orderId);
                    handleBulkShip(failedIds);
                  }}
                  disabled={bulkProcessing}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm"
                >
                  Retry {bulkResults.failed} Failed Orders
                </button>
              ) : (
                <span className="text-xs text-green-700 font-medium">All orders dispatched successfully!</span>
              )}

              <button
                onClick={() => setBulkResults(null)}
                className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 text-xs font-semibold px-4 py-2 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Courier Handover Manifest Modal */}
      {manifestData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5 text-brand-500" />
                  Courier Handover Manifest — {manifestData.manifestId}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Handover sheet for {manifestData.shipmentCount} packages ({manifestData.courierPartner?.toUpperCase()})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm"
                >
                  <PrinterIcon className="w-4 h-4" />
                  Print Sheet
                </button>
                <button
                  onClick={() => setManifestData(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 print:p-0">
              <div className="flex justify-between items-start text-xs border-b pb-3">
                <div>
                  <p className="font-bold text-sm text-gray-900 dark:text-white">{company.toUpperCase()} STORE</p>
                  <p className="text-gray-500">Manifest ID: <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{manifestData.manifestId}</span></p>
                  <p className="text-gray-500">Date: {new Date(manifestData.generatedAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500">Carrier Partner: <span className="font-bold text-gray-900 dark:text-white">{manifestData.courierPartner?.toUpperCase()}</span></p>
                  <p className="text-gray-500">Total Packages: <span className="font-bold text-brand-600">{manifestData.shipmentCount}</span></p>
                </div>
              </div>

              <table className="w-full text-xs text-left border border-gray-200 dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50 uppercase font-semibold text-gray-500">
                  <tr className="border-b">
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Order No</th>
                    <th className="p-2.5">AWB / Tracking Number</th>
                    <th className="p-2.5">Consignee Name</th>
                    <th className="p-2.5">Destination</th>
                    <th className="p-2.5 text-right">Weight (g)</th>
                    <th className="p-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {manifestData.orders?.map((ord: any, idx: number) => (
                    <tr key={ord.orderId}>
                      <td className="p-2.5 font-medium">{idx + 1}</td>
                      <td className="p-2.5 font-bold text-brand-600">{ord.orderNo}</td>
                      <td className="p-2.5 font-mono font-semibold">{ord.awbNumber}</td>
                      <td className="p-2.5">{ord.recipientName}</td>
                      <td className="p-2.5">{ord.destinationCity} ({ord.destinationPincode})</td>
                      <td className="p-2.5 text-right font-mono">{ord.weightGrams}g</td>
                      <td className="p-2.5 text-right font-medium">{formatCurrency(ord.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-8 pt-8 text-xs border-t mt-6">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Dispatched By (Warehouse Executive):</p>
                  <div className="h-14 border-b border-gray-300 dark:border-gray-600 mt-2"></div>
                  <p className="text-gray-400 mt-1">Signature & Date</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Received By (Courier Pickup Driver):</p>
                  <div className="h-14 border-b border-gray-300 dark:border-gray-600 mt-2"></div>
                  <p className="text-gray-400 mt-1">Signature, Driver Name & Contact</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
