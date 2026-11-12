"use client";

import React from "react";
import Link from "next/link";
import { useUser } from "@/context/CurrentUserContext";
import { useTenant } from "@/context/TenantContext";

export default function SalesTransactionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const { company } = useTenant();

  if (user && user.pos_access === false) {
    return (
      <div className="mx-auto my-12 max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Upgrade to POS Plan</h2>
        <p className="mt-2 text-sm text-gray-600">
          In-store POS and Sales Billing are not included in your current
          E-Commerce-only subscription plan. Upgrade to a plan with POS access
          to create and manage store billing transactions.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={company ? `/${company}/workspace` : "/"}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Back to Workspace
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
