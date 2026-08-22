"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/context/CurrentUserContext";
import { io } from "socket.io-client";

export default function NotificationDropdown() {
  const { user } = useUser();
  const pathname = usePathname();
  const company = pathname.split("/")[1] || "";
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id && !user?.user_id) return;
    const userId = user?.id || user?.user_id;


    // Fetch initial unread count
    const fetchUnreadCount = async () => {
      try {
        const res = await fetch("/api/notifications/unread-count", {
          headers: {
            "x-tenant": company
          }
        });
        const result = await res.json();
        if (result.success) {
          setUnreadCount(result.unreadCount);
        }
      } catch (error) {
        console.error("Failed to fetch unread count:", error);
      }
    };
    fetchUnreadCount();

    // Connect to Socket.IO server
    const socket = io();

    socket.on("connect", () => {
      console.log("Connected to notification socket:", socket.id);
      socket.emit("join_user_room", userId);
    });

    socket.on("notification:new", (notification) => {
      console.log("New notification received:", notification);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  return (
    <div className="relative">
      <Link
        href={`/${company}/workspace/notifications`}
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        title="View Notifications"
      >
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0.5 z-10 flex h-5 w-5 -translate-y-1 translate-x-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-gray-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </Link>
    </div>
  );
}
