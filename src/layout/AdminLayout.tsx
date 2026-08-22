"use client";

import React from "react";
import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]";
  console.log("--- AdminLayout Diagnostic ---", {
    AppSidebar: typeof AppSidebar,
    Backdrop: typeof Backdrop,
    AppHeader: typeof AppHeader,
  });
  return (
    <div className="min-h-screen xl:flex">
      {/* Sidebar */}
      <AppSidebar />
      <Backdrop />

      {/* Main content */}
      <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
        <AppHeader />
        <div className="p-4 mx-auto max-w-screen-2xl md:p-6">{children}</div>
      </div>
    </div>
  );
};


export default AdminLayout;