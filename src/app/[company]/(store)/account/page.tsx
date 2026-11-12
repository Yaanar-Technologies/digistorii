"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShoppingBagIcon,
  MapPinIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  ArrowRightIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { useCartStore } from "@/store/cartStore";
import { formatPrice } from "@/lib/currency";

export default function AccountOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";
  const { customer } = useCustomerAuthStore();
  const addItem = useCartStore((state) => state.addItem);

  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    if (company && customer) {
      fetch(`/api/${company}/ecom/orders?scope=customer_me&limit=3`)
        .then((r) => (r.ok ? r.json() : { orders: [] }))
        .then((data) => {
          if (Array.isArray(data.orders)) setOrders(data.orders.slice(0, 3));
          else if (Array.isArray(data)) setOrders(data.slice(0, 3));
        })
        .catch(() => { })
        .finally(() => setLoadingOrders(false));
    }
  }, [company, customer]);

  const defaultAddress = customer?.addresses?.find((a: any) => a.is_default) || customer?.addresses?.[0];

  const handleReorder = (order: any) => {
    if (Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        addItem({
          id: String(item.variant_id || item.id),
          name: item.product_name,
          price: Number(item.rate),
          quantity: Number(item.qty) || 1,
          image: item.image || "/images/placeholder-saree.png",
        });
      });
      router.push(`/${company}/store/cart`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Welcome back, {customer?.name || "Customer"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your purchases, download invoices, track packages and update your preferences.
          </p>
        </div>
        {/* <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircleIcon className="h-3.5 w-3.5" />
            Verified Customer
          </span>
        </div> */}
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <ShoppingBagIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Order History</div>
            <div className="text-base font-bold text-slate-900">{orders.length} Recent</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <MapPinIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Saved Addresses</div>
            <div className="text-base font-bold text-slate-900">
              {customer?.addresses?.length || 0} Registered
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <TruckIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Live Deliveries</div>
            <div className="text-base font-bold text-slate-900">
              {orders.filter((o) => ["confirmed", "packed", "shipped"].includes(o.order_status)).length} Active
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Orders</h2>
            <p className="text-xs text-slate-500">Track and manage your recent shopping orders</p>
          </div>
          <Link
            href={`/${company}/account/orders`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <span>View All</span>
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loadingOrders ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading order timeline...</div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-xs text-slate-500">No online orders placed yet.</p>
            <Link
              href={`/${company}/store`}
              className="inline-block text-xs font-semibold text-indigo-600 hover:underline"
            >
              Explore Saree Collection →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((order) => (
              <div key={order.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 font-mono">
                      #{order.order_no}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-2xs font-semibold uppercase bg-slate-100 text-slate-700">
                      {order.order_status}
                    </span>
                  </div>
                  <div className="text-2xs text-slate-400 mt-0.5">
                    Placed on {new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-900">
                    {formatPrice(Number(order.total_amount))}
                  </span>

                  <a
                    href={`/api/${company}/ecom/orders/${order.id}/invoice`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-2xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    title="Download Tax Invoice"
                  >
                    <DocumentArrowDownIcon className="h-3.5 w-3.5 text-slate-500" />
                    <span>Invoice</span>
                  </a>

                  <button
                    onClick={() => handleReorder(order)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-2xs font-semibold transition-colors cursor-pointer"
                  >
                    <ArrowPathIcon className="h-3 w-3" />
                    <span>Reorder</span>
                  </button>

                  <Link
                    href={`/${company}/account/orders/${order.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-2xs font-semibold transition-colors"
                  >
                    <span>Track</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Default Address & Account Snippet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Default Shipping Address */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Default Delivery Address</h3>
            <Link
              href={`/${company}/account/addresses`}
              className="text-2xs font-semibold text-indigo-600 hover:underline"
            >
              Manage
            </Link>
          </div>
          {defaultAddress ? (
            <div className="text-xs text-slate-600 leading-relaxed">
              <div className="font-semibold text-slate-900">{defaultAddress.recipient_name}</div>
              <div>{defaultAddress.address_line1}</div>
              {defaultAddress.address_line2 && <div>{defaultAddress.address_line2}</div>}
              <div>
                {defaultAddress.city}, {defaultAddress.state} - {defaultAddress.pincode}
              </div>
              <div className="text-2xs text-slate-400 mt-1 font-mono">Phone: {defaultAddress.recipient_phone}</div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-3">No default address specified yet.</div>
          )}
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Customer Details</h3>
            <Link
              href={`/${company}/account/settings`}
              className="text-2xs font-semibold text-indigo-600 hover:underline"
            >
              Edit
            </Link>
          </div>
          <div className="text-xs text-slate-600 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Customer Code:</span>
              <span className="font-mono font-semibold text-slate-900">{customer?.cust_code || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Mobile Phone:</span>
              <span className="font-mono font-semibold text-slate-900">{customer?.phone || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Registered Email:</span>
              <span className="font-mono font-semibold text-slate-900">{customer?.email || "N/A"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

