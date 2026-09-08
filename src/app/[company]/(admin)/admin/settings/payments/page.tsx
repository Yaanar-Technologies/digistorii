"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CreditCardIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  InformationCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

export default function PaymentGatewaySettingsPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!company) return;
      setLoading(true);
      setFeedback(null);

      try {
        const res = await fetch(`/api/${company}/admin/settings/payment-gateways`, {
          headers: { "x-tenant": company },
        });

        const data = await res.json();
        if (res.ok && data.success && data.config) {
          setKeyId(data.config.key_id || "");
          setKeySecret(data.config.key_secret_masked || "");
          setHasExistingSecret(data.config.has_secret);
          setIsActive(data.config.is_active ?? true);
        }
      } catch (err: any) {
        console.error("Failed to load gateway config:", err);
        setFeedback({
          type: "error",
          message: "Failed to load payment gateway settings. Please try again.",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [company]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    if (!keyId.trim()) {
      setFeedback({
        type: "error",
        message: "Razorpay Key ID is required.",
      });
      setSaving(false);
      return;
    }

    if (!keySecret.trim() && !hasExistingSecret) {
      setFeedback({
        type: "error",
        message: "Razorpay Key Secret is required.",
      });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/${company}/admin/settings/payment-gateways`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant": company,
        },
        body: JSON.stringify({
          provider: "razorpay",
          key_id: keyId.trim(),
          key_secret: keySecret.trim(),
          webhook_secret: webhookSecret.trim() || undefined,
          is_active: isActive,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({
          type: "success",
          message: data.message || "Razorpay credentials saved successfully!",
        });
        setHasExistingSecret(true);
      } else {
        setFeedback({
          type: "error",
          message: data.error || "Failed to save payment gateway settings.",
        });
      }
    } catch (err: any) {
      console.error("Save gateway error:", err);
      setFeedback({
        type: "error",
        message: err.message || "An unexpected error occurred while saving.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/${company}/admin`)}
              className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition shadow-xs"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <CreditCardIcon className="w-7 h-7 text-blue-600" />
                Payment Gateway Configuration
              </h1>
              <p className="text-sm text-gray-500">
                Configure your tenant-specific Razorpay merchant account for e-commerce checkout.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                isActive && hasExistingSecret
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {isActive && hasExistingSecret ? "● Live / Active" : "○ Inactive / Incomplete"}
            </span>
          </div>
        </div>

        {/* Feedback Messages */}
        {feedback && (
          <div
            className={`p-4 rounded-xl flex items-start gap-3 border shadow-xs ${
              feedback.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="text-sm font-medium">{feedback.message}</div>
          </div>
        )}

        {/* Main Settings Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Informational Guidance Box */}
          <div className="bg-blue-50/70 border-b border-blue-100 p-5 sm:p-6 flex items-start gap-4">
            <InformationCircleIcon className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 space-y-1">
              <p className="font-semibold text-blue-950">Direct Merchant Account Settlement</p>
              <p className="text-blue-800/90 leading-relaxed">
                Enter your Razorpay API Keys from your Razorpay Dashboard (
                <span className="font-semibold text-blue-950">Settings ➔ API Keys</span>).
                Customer payments for your store will be credited directly to your connected Razorpay bank account.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
              <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Loading gateway settings...</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="p-6 sm:p-8 space-y-6">
              {/* Razorpay Key ID */}
              <div>
                <label
                  htmlFor="key_id"
                  className="block text-sm font-semibold text-gray-800 mb-1"
                >
                  Razorpay Key ID <span className="text-red-500">*</span>
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <input
                    type="text"
                    id="key_id"
                    value={keyId}
                    onChange={(e) => setKeyId(e.target.value)}
                    placeholder="rzp_live_xxxxxxxxxxxxxx or rzp_test_xxxxxxxxxxxxxx"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono text-gray-900 bg-white placeholder-gray-400 transition"
                    required
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Your public Key ID used on the storefront client to open the Razorpay payment modal.
                </p>
              </div>

              {/* Razorpay Key Secret */}
              <div>
                <label
                  htmlFor="key_secret"
                  className="block text-sm font-semibold text-gray-800 mb-1"
                >
                  Razorpay Key Secret <span className="text-red-500">*</span>
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <input
                    type={showSecret ? "text" : "password"}
                    id="key_secret"
                    value={keySecret}
                    onChange={(e) => setKeySecret(e.target.value)}
                    placeholder={hasExistingSecret ? "••••••••••••••••" : "Enter your Razorpay Secret Key"}
                    className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono text-gray-900 bg-white placeholder-gray-400 transition"
                    required={!hasExistingSecret}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showSecret ? (
                      <EyeSlashIcon className="w-5 h-5" />
                    ) : (
                      <EyeIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                  <ShieldCheckIcon className="w-4 h-4 text-green-600 shrink-0" />
                  <span>
                    Your key secret is encrypted with AES-256-GCM at rest and never exposed to the frontend browser.
                  </span>
                </div>
              </div>

              {/* Active Gateway Toggle */}
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Enable Razorpay Payments</h4>
                  <p className="text-xs text-gray-500">
                    When active, customers can pay online via UPI, Cards, and Net Banking at checkout.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/${company}/admin`)}
                  className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-sm flex items-center gap-2"
                >
                  {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving Changes..." : "Save Gateway Settings"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
