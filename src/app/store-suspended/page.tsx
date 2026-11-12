import React from "react";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store Unavailable | Maintenance",
  description: "This store is currently unavailable. Please check back later.",
  robots: { index: false, follow: false },
};

export default function StoreSuspendedPage() {
  return (
    <div className="min-h-screen bg-linear-to-b from-gray-50 to-gray-100 flex items-center justify-center p-6 text-gray-800">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-200/80 p-8 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Store Temporarily Unavailable
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            This online storefront is currently paused or undergoing scheduled
            maintenance. We apologize for the inconvenience.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-500 leading-relaxed">
          If you are the store owner, please sign in to your merchant dashboard
          to review your account status and reactivate your storefront.
        </div>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors shadow-sm"
          >
            Return to Homepage
          </Link>
        </div>

        <div className="text-[11px] text-gray-400">
          Powered by Digistori Platform
        </div>
      </div>
    </div>
  );
}
