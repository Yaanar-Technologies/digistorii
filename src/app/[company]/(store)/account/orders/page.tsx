"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShoppingBagIcon,
  TruckIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  EyeIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { useCartStore } from "@/store/cartStore";
import { formatPrice } from "@/lib/currency";

export default function MyOrdersPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";
  const { customer } = useCustomerAuthStore();
  const addItem = useCartStore((state) => state.addItem);

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (company && customer) {
      fetch(`/api/${company}/ecom/customer/orders`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && Array.isArray(data.orders)) {
            setOrders(data.orders);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [company, customer]);

  const handleReorder = (order: any) => {
    if (Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        if (item.variant_id || item.id) {
          addItem({
            id: String(item.variant_id || item.id),
            name: item.product_name || "Product",
            price: Number(item.rate) || 0,
            quantity: Number(item.qty) || 1,
            image: item.image || "/images/placeholder-saree.png",
          });
        }
      });
      router.push(`/${company}/store/cart`);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "delivered":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "shipped":
      case "out_for_delivery":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "packed":
      case "confirmed":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "cancelled":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.order_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (Array.isArray(o.items) &&
        o.items.some((it: any) =>
          it.product_name?.toLowerCase().includes(searchQuery.toLowerCase())
        ));

    if (!matchesSearch) return false;

    if (statusFilter === "active") {
      return ["placed", "confirmed", "packed", "shipped", "out_for_delivery"].includes(
        o.order_status
      );
    }
    if (statusFilter === "delivered") return o.order_status === "delivered";
    if (statusFilter === "cancelled") return o.order_status === "cancelled";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">My Orders</h1>
            <p className="text-xs text-slate-500">
              Review your past purchases, track real-time delivery and download tax invoices
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Order # or item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          {[
            { id: "all", label: "All Orders" },
            { id: "active", label: "In Transit & Processing" },
            { id: "delivered", label: "Delivered" },
            { id: "cancelled", label: "Cancelled" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-xs text-slate-400">
          Loading your orders...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-3">
          <div className="h-12 w-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <ShoppingBagIcon className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-bold text-slate-800">No orders found</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== "all"
              ? "No orders match your selected filters."
              : "You have not placed any online orders yet."}
          </p>
          <Link
            href={`/${company}/store`}
            className="inline-block text-xs font-semibold text-indigo-600 hover:underline pt-2"
          >
            Start Shopping →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4 hover:border-slate-300 transition-colors"
            >
              {/* Top Meta Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-900 font-mono">
                    Order #{order.order_no}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-semibold uppercase border ${getStatusBadgeClass(
                      order.order_status
                    )}`}
                  >
                    {order.order_status}
                  </span>
                  <span className="text-2xs font-medium text-slate-500">
                    Payment: <strong className="uppercase text-slate-700">{order.payment_status}</strong>
                  </span>
                </div>

                <div className="text-2xs text-slate-400">
                  Placed on {new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {Array.isArray(order.items) &&
                  order.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-2xs text-slate-400 font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800">{item.product_name}</span>
                          <span className="text-2xs text-slate-400 ml-2">Qty: {item.qty}</span>
                        </div>
                      </div>
                      <div className="font-semibold text-slate-900">
                        {formatPrice(Number(item.line_total || item.rate * item.qty))}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Footer Actions & Summary */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Grand Total:</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    {formatPrice(Number(order.total_amount))}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/api/${company}/ecom/orders/${order.id}/invoice`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <DocumentArrowDownIcon className="h-3.5 w-3.5 text-slate-500" />
                    <span>Download Invoice</span>
                  </a>

                  <button
                    onClick={() => handleReorder(order)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    <span>Reorder</span>
                  </button>

                  <Link
                    href={`/${company}/account/orders/${order.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                    <span>Details & Tracking</span>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

