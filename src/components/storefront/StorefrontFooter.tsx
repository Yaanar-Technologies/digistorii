"use client";

import React, { useState } from "react";
import { StorefrontTheme, FooterSettings } from "./types";

export interface StorefrontFooterProps {
  theme: StorefrontTheme;
  settings?: FooterSettings;
}

export const StorefrontFooter: React.FC<StorefrontFooterProps> = ({
  theme,
  settings,
}) => {
  const [modalPolicy, setModalPolicy] = useState<{ title: string; content: string } | null>(null);

  return (
    <footer className="bg-gray-900 text-gray-300 border-t border-gray-800" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          
          {/* Col 1: Brand Info & Socials */}
          <div className="space-y-4 md:col-span-1">
            {theme.logoUrl ? (
              <img src={theme.logoUrl} alt="Store Logo" className="h-8 w-auto object-contain brightness-200" />
            ) : (
              <span className="text-xl font-bold tracking-tight text-white">Store</span>
            )}
            <p className="text-xs text-gray-400 leading-relaxed">
              Elevating modern shopping with curated products and effortless service.
            </p>

            {/* Social Links */}
            {theme.socialLinks && (
              <div className="flex gap-3 pt-2">
                {theme.socialLinks.facebook && (
                  <a
                    href={theme.socialLinks.facebook}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    aria-label="Facebook"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.891h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                    </svg>
                  </a>
                )}
                {theme.socialLinks.instagram && (
                  <a
                    href={theme.socialLinks.instagram}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    aria-label="Instagram"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </a>
                )}
                {theme.socialLinks.whatsapp && (
                  <a
                    href={theme.socialLinks.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    aria-label="WhatsApp"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Col 2: Customer Support */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Customer Support</h3>
            <ul className="space-y-2 text-xs text-gray-400">
              {settings?.supportEmail && (
                <li className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>{settings.supportEmail}</span>
                </li>
              )}
              {settings?.supportPhone && (
                <li className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{settings.supportPhone}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Col 3: Legal & Store Policies */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Store Policies</h3>
            <ul className="space-y-2 text-xs">
              {settings?.termsAndConditions && (
                <li>
                  <button
                    onClick={() =>
                      setModalPolicy({
                        title: "Terms & Conditions",
                        content: settings.termsAndConditions!,
                      })
                    }
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    Terms & Conditions
                  </button>
                </li>
              )}
              {settings?.returnRefundPolicy && (
                <li>
                  <button
                    onClick={() =>
                      setModalPolicy({
                        title: "Return & Refund Policy",
                        content: settings.returnRefundPolicy!,
                      })
                    }
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    Return & Refund Policy
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Col 4: Payment Badges */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Secure Payment</h3>
            <p className="text-xs text-gray-400">
              We accept all major credit cards, UPI, and cash payments on delivery.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-800 text-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Merchant Storefront. All rights reserved.</p>
        </div>
      </div>

      {/* Policy View Modal */}
      {modalPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setModalPolicy(null)} />
          <div className="relative w-full max-w-lg bg-white p-6 rounded-2xl text-gray-900 shadow-2xl z-10 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold">{modalPolicy.title}</h3>
              <button
                onClick={() => setModalPolicy(null)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto pr-2">
              {modalPolicy.content}
            </p>
          </div>
        </div>
      )}
    </footer>
  );
};

export default StorefrontFooter;
