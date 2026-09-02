"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  StorefrontHeader,
  StorefrontFooter,
  CustomerAuthModal,
  mockFooterSettings,
  useStorefrontTheme,
} from "@/components/storefront";
import { useCartStore } from "@/store/cartStore";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { formatPrice } from "@/lib/currency";

export default function CustomerAccountPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const company = (params.company as string) || "";
  const initialTab = searchParams.get("tab") || "orders";

  const theme = useStorefrontTheme();
  const [footerSettings] = useState(mockFooterSettings);

  const { customer, isAuthenticated, checkSession, logout } = useCustomerAuthStore();

  const [activeTab, setActiveTab] = useState<"orders" | "addresses" | "profile">("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const cartItems = useCartStore((state) => state.items);

  useEffect(() => {
    if (initialTab === "addresses") setActiveTab("addresses");
    else if (initialTab === "profile") setActiveTab("profile");
    else setActiveTab("orders");
  }, [initialTab]);

  useEffect(() => {
    checkSession(company);
  }, [company]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadAccountData = async () => {
      setLoadingData(true);
      try {
        // Load customer orders
        const ordersRes = await fetch(`/api/ecom/customer/orders?company=${company}`);
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          if (ordersData.success && Array.isArray(ordersData.orders)) {
            setOrders(ordersData.orders);
          }
        }

        // Load customer addresses
        const addrRes = await fetch(`/api/ecom/customer/addresses?company=${company}`);
        if (addrRes.ok) {
          const addrData = await addrRes.json();
          if (addrData.success && Array.isArray(addrData.addresses)) {
            setAddresses(addrData.addresses);
          }
        }
      } catch (err) {
        console.error("Failed to load account details:", err);
      } finally {
        setLoadingData(false);
      }
    };

    loadAccountData();
  }, [isAuthenticated, company]);

  const handleLogout = async () => {
    await logout(company);
    router.push(`/${company}/store`);
  };

  return (
    <div className="min-h-screen bg-gray-50/40 flex flex-col justify-between" style={{ fontFamily: theme.fontFamily }}>
      <div>
        <StorefrontHeader
          theme={theme}
          company={company}
          cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
          onOpenCart={() => router.push(`/${company}/store/cart`)}
          onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
          onOpenAuth={() => setIsAuthOpen(true)}
        />

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {!isAuthenticated ? (
            <div className="bg-white rounded-3xl border border-gray-100 p-8 sm:p-12 text-center max-w-md mx-auto my-12 space-y-4 shadow-sm">
              <div className="h-16 w-16 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mx-auto text-2xl">
                👤
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Sign in to View Account</h1>
              <p className="text-sm text-gray-500">
                Please sign in or register to access your order history, delivery addresses, and profile details.
              </p>
              <button
                onClick={() => setIsAuthOpen(true)}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-95 cursor-pointer"
                style={{ backgroundColor: theme.primaryColor }}
              >
                Sign In / Register
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Top Banner Card: Customer Info & Logout Action */}
              <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-sm"
                    style={{ backgroundColor: theme.primaryColor }}
                  >
                    {customer?.name?.[0]?.toUpperCase() || "C"}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{customer?.name}</h1>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                      {customer?.email && <span>📧 {customer.email}</span>}
                      {customer?.phone && <span>📱 +91 {customer.phone}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={handleLogout}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-red-600 border border-red-200 bg-red-50/50 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Log Out
                  </button>
                </div>
              </div>

              {/* Account Tabs */}
              <div className="flex border-b border-gray-200 gap-8 text-sm font-semibold">
                <button
                  onClick={() => setActiveTab("orders")}
                  className={`pb-3.5 border-b-2 transition-colors cursor-pointer ${
                    activeTab === "orders" ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  📦 Order History ({orders.length})
                </button>
                <button
                  onClick={() => setActiveTab("addresses")}
                  className={`pb-3.5 border-b-2 transition-colors cursor-pointer ${
                    activeTab === "addresses" ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  📍 Saved Addresses ({addresses.length})
                </button>
              </div>

              {/* TAB 1: ORDER HISTORY (ONLINE & POS IN-STORE PURCHASES) */}
              {activeTab === "orders" && (
                <div className="space-y-6">
                  {loadingData ? (
                    <div className="py-12 text-center text-sm text-gray-400">Loading your purchase history...</div>
                  ) : orders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-3">
                      <div className="text-3xl">🛍️</div>
                      <h3 className="text-base font-bold text-gray-900">No Orders Found</h3>
                      <p className="text-xs text-gray-500 max-w-sm mx-auto">
                        You haven't placed any storefront orders or made linked POS purchases yet.
                      </p>
                      <button
                        onClick={() => router.push(`/${company}/store`)}
                        className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        Explore Storefront Catalog
                      </button>
                    </div>
                  ) : (
                    orders.map((order) => (
                      <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
                        {/* Order Header Card */}
                        <div className="p-4 sm:p-6 bg-gray-50/70 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-900">{order.sales_no}</span>

                              {/* Channel Badge: Online Storefront vs POS In-Store */}
                              {order.channel_type === "online" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                                  🌐 Online Order
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                  🏬 In-Store POS Purchase
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              Placed on: {new Date(order.sales_date || order.created_at).toLocaleDateString()}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <div className="text-xs text-gray-400">Total Amount</div>
                              <div className="text-base font-bold text-gray-900">{formatPrice(order.total_amount)}</div>
                            </div>
                            <span className="rounded-lg bg-gray-200/80 px-2.5 py-1 text-xs font-semibold text-gray-700 capitalize">
                              {order.payment_status || "Completed"}
                            </span>
                          </div>
                        </div>

                        {/* Order Items Table */}
                        <div className="p-4 sm:p-6">
                          <div className="divide-y divide-gray-100">
                            {order.items?.map((item: any) => (
                              <div key={item.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={item.imageUrl}
                                    alt={item.productName}
                                    className="h-12 w-12 rounded-lg object-cover border border-gray-100"
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">{item.productName}</div>
                                    <div className="text-xs text-gray-500">Qty: {item.qty} × {formatPrice(item.rate)}</div>
                                  </div>
                                </div>
                                <div className="text-sm font-bold text-gray-900">{formatPrice(item.lineTotal)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: SAVED ADDRESSES */}
              {activeTab === "addresses" && (
                <div className="space-y-6">
                  {loadingData ? (
                    <div className="py-12 text-center text-sm text-gray-400">Loading saved addresses...</div>
                  ) : addresses.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-3">
                      <div className="text-3xl">📍</div>
                      <h3 className="text-base font-bold text-gray-900">No Saved Addresses</h3>
                      <p className="text-xs text-gray-500 max-w-sm mx-auto">
                        You don't have any saved delivery addresses yet. Add one during your next checkout!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {addresses.map((addr) => (
                        <div key={addr.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-xs space-y-2">
                          <div className="flex items-center justify-between text-sm font-bold text-gray-900">
                            <span>{addr.recipient_name}</span>
                            {addr.is_default && (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 space-y-0.5">
                            <div>{addr.address_line1}</div>
                            {addr.address_line2 && <div>{addr.address_line2}</div>}
                            <div>
                              {addr.city}, {addr.state} - <span className="font-semibold text-gray-900">{addr.pincode}</span>
                            </div>
                            <div>{addr.country || "India"}</div>
                          </div>
                          <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                            Phone: <span className="font-semibold text-gray-700">+91 {addr.recipient_phone}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <StorefrontFooter theme={theme} settings={footerSettings} />

      <CustomerAuthModal
        theme={theme}
        company={company}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccessAuth={() => checkSession(company)}
      />
    </div>
  );
}
