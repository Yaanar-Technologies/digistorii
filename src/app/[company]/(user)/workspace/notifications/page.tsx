"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ArrowLeftIcon from "@heroicons/react/24/outline/ArrowLeftIcon";
import CheckIcon from "@heroicons/react/24/outline/CheckIcon";
import EnvelopeIcon from "@heroicons/react/24/outline/EnvelopeIcon";
import EnvelopeOpenIcon from "@heroicons/react/24/outline/EnvelopeOpenIcon";
import Link from "next/link";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: {
    variant_id?: number;
    product_id?: number;
    sku?: string;
    current_qty?: number;
    threshold?: number;
  };
  created_at: string;
  is_read: boolean;
  read_at: string | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export default function NotificationsPage() {
  const pathname = usePathname();
  const company = pathname.split("/")[1] || "";

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchNotifications = async (pageNumber = 1) => {
    try {
      setLoading(true);
      let url = `/api/notifications?page=${pageNumber}&limit=20`;
      if (filter === "unread") url += "&read=false";
      if (filter === "read") url += "&read=true";

      const res = await fetch(url, {
        headers: {
          "x-tenant": company,
        },
      });
      const result = await res.json();
      if (result.success) {
        setNotifications(result.data || []);
        setPagination(result.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications(1);
  }, [filter]);

  const handleMarkAsRead = async (id: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: {
          "x-tenant": company,
        },
      });
      const result = await res.json();
      if (result.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
        );
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setActionLoading(true);
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "x-tenant": company,
        },
      });
      const result = await res.json();
      if (result.success) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
        );
      }
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Notifications Inbox</h1>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
            Monitor low stock alerts and store notifications in real-time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {notifications.some((n) => !n.is_read) && (
            <button
              onClick={handleMarkAllAsRead}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 disabled:opacity-50"
            >
              <CheckIcon className="w-4 h-4" />
              Mark All as Read
            </button>
          )}

          <Link
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            href={`/${company}/workspace`}
          >
            <ArrowLeftIcon className="w-4 h-4 text-gray-500" />
            Dashboard
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden dark:bg-gray-950 dark:border-gray-800">
        {/* Filters */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-6 py-4 bg-gray-50 dark:bg-gray-900/50 justify-between items-center">
          <div className="flex gap-2">
            {(["all", "unread", "read"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all ${filter === t
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-gray-500">
            Total: {pagination.total}
          </span>
        </div>

        {/* Notification List */}
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="p-16 text-center text-gray-500">
            <EnvelopeOpenIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-semibold">Inbox is empty</p>
            <p className="text-sm mt-1 text-gray-400">You don't have any notifications at the moment.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-150 dark:divide-gray-800">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-6 flex items-start gap-4 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-900/30 ${!n.is_read ? "bg-blue-50/20 dark:bg-blue-900/10" : ""
                  }`}
              >
                <div className="mt-1">
                  {!n.is_read ? (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                    </span>
                  ) : (
                    <EnvelopeOpenIcon className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                <div className="flex-grow space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className={`text-sm ${!n.is_read ? "font-bold text-gray-900 dark:text-white" : "font-semibold text-gray-700 dark:text-gray-300"}`}>
                      {n.title}
                    </h3>
                    <span className="text-xs text-gray-400 font-mono">
                      {formatDate(n.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{n.message}</p>

                  {n.metadata && n.metadata.sku && (
                    <div className="mt-2 text-xs flex gap-4 text-gray-500 bg-gray-100 dark:bg-gray-900 p-2 rounded-lg w-max font-mono">
                      <span>SKU: <strong className="text-gray-700 dark:text-gray-300">{n.metadata.sku}</strong></span>
                      <span>Stock: <strong className="text-red-500">{n.metadata.current_qty}</strong></span>
                      <span>Threshold: <strong className="text-gray-700 dark:text-gray-300">{n.metadata.threshold}</strong></span>
                    </div>
                  )}
                </div>

                {!n.is_read && (
                  <button
                    onClick={() => handleMarkAsRead(n.id)}
                    disabled={actionLoading}
                    className="p-1 hover:bg-gray-200 rounded-full transition-colors text-blue-600 dark:hover:bg-gray-800"
                    title="Mark as read"
                  >
                    <CheckIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-6 py-4 bg-gray-50 dark:bg-gray-900/50">
            <button
              onClick={() => fetchNotifications(pagination.page - 1)}
              disabled={pagination.page === 1 || loading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold bg-white hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-950 dark:border-gray-850 dark:text-white"
            >
              Previous
            </button>
            <span className="text-sm font-semibold text-gray-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => fetchNotifications(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages || loading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold bg-white hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-950 dark:border-gray-850 dark:text-white"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
