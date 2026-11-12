"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

export default function WorkspacePaymentSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isTestMode, setIsTestMode] = useState(true);
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [hasExistingWebhook, setHasExistingWebhook] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/${company}/ecom/webhooks/razorpay`);
    }

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
          setWebhookSecret(data.config.webhook_secret_masked || "");
          setHasExistingSecret(Boolean(data.config.has_secret));
          setHasExistingWebhook(Boolean(data.config.has_webhook_secret));
          setIsActive(data.config.is_active ?? true);
          setIsTestMode(data.config.is_test_mode ?? true);
          if (data.webhook_url) {
            setWebhookUrl(data.webhook_url);
          }
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

  const handleCopyWebhookUrl = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

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
          is_test_mode: isTestMode,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({
          type: "success",
          message: data.message || "Payment gateway credentials saved and encrypted successfully.",
        });
        setHasExistingSecret(true);
        if (webhookSecret.trim()) {
          setHasExistingWebhook(true);
        }
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
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/${company}/workspace`)}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition shadow-xs"
              title="Back to Workspace"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <CreditCardIcon className="w-7 h-7 text-indigo-600" />
                Payment Gateway & Webhooks
              </h1>
              <p className="text-xs text-slate-500">
                Configure your store's Razorpay credentials for online payments and real-time webhook status automation.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                isActive && hasExistingSecret
                  ? isTestMode
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}
            >
              {isActive && hasExistingSecret
                ? isTestMode
                  ? "Test Mode (Sandbox)"
                  : "Live Mode (Production)"
                : "Not Configured"}
            </span>
          </div>
        </div>

        {/* Feedback Messages */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl flex items-start gap-3 border shadow-xs ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="text-sm font-medium">{feedback.message}</div>
          </div>
        )}

        {/* Webhook Endpoint Destination Box */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <GlobeAltIcon className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Webhook Destination URL
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Copy this unique endpoint into your{" "}
            <span className="font-semibold text-slate-800">Razorpay Dashboard &gt; Settings &gt; Webhooks</span>.
            Subscribe to <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono text-2xs">payment.captured</code> and{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono text-2xs">payment.failed</code> to automate order confirmations and inventory management.
          </p>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-700 select-all"
            />
            <button
              type="button"
              onClick={handleCopyWebhookUrl}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-indigo-200"
            >
              {copiedUrl ? (
                <>
                  <ClipboardDocumentCheckIcon className="w-4 h-4 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <ClipboardDocumentIcon className="w-4 h-4" />
                  Copy URL
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Settings Card */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="bg-indigo-50/70 border-b border-indigo-100 p-5 flex items-start gap-4">
            <InformationCircleIcon className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-900 space-y-1">
              <p className="font-semibold text-indigo-950">Direct Merchant Bank Settlement</p>
              <p className="text-indigo-800/90 leading-relaxed">
                Customer payments will be processed directly into your connected Razorpay merchant account.
                All secrets are encrypted with AES-256-GCM using platform encryption keys before persisting to the database.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm font-medium">Loading gateway settings...</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="p-6 sm:p-8 space-y-6">
              {/* Environment Toggle: Test vs Live */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Gateway Environment</h4>
                  <p className="text-xs text-slate-500">
                    Switch between Razorpay Test Sandbox and Live Production mode.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsTestMode(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      isTestMode
                        ? "bg-amber-100 text-amber-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Test Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTestMode(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      !isTestMode
                        ? "bg-emerald-100 text-emerald-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Live Mode
                  </button>
                </div>
              </div>

              {/* Razorpay Key ID */}
              <div>
                <label
                  htmlFor="key_id"
                  className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1"
                >
                  Razorpay Key ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="key_id"
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                  placeholder="rzp_test_... or rzp_live_..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono text-slate-900 bg-white placeholder-slate-400 transition"
                  required
                />
                <p className="mt-1 text-2xs text-slate-500">
                  Public identifier passed to the storefront Razorpay Checkout SDK.
                </p>
              </div>

              {/* Razorpay Key Secret */}
              <div>
                <label
                  htmlFor="key_secret"
                  className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1"
                >
                  Razorpay Key Secret <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    id="key_secret"
                    value={keySecret}
                    onChange={(e) => setKeySecret(e.target.value)}
                    placeholder={hasExistingSecret ? "••••••••••••••••" : "Enter your Razorpay Key Secret"}
                    className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono text-slate-900 bg-white placeholder-slate-400 transition"
                    required={!hasExistingSecret}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showSecret ? (
                      <EyeSlashIcon className="w-5 h-5" />
                    ) : (
                      <EyeIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-slate-500">
                  <ShieldCheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Encrypted with AES-256-GCM. Never exposed in API responses or browser code.
                  </span>
                </div>
              </div>

              {/* Razorpay Webhook Secret */}
              <div>
                <label
                  htmlFor="webhook_secret"
                  className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1"
                >
                  Razorpay Webhook Secret
                </label>
                <div className="relative">
                  <input
                    type={showWebhookSecret ? "text" : "password"}
                    id="webhook_secret"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder={hasExistingWebhook ? "••••••••••••••••" : "Enter webhook secret entered in Razorpay"}
                    className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono text-slate-900 bg-white placeholder-slate-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showWebhookSecret ? (
                      <EyeSlashIcon className="w-5 h-5" />
                    ) : (
                      <EyeIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-2xs text-slate-500">
                  Used by our server to verify the cryptographic HMAC signature of inbound webhooks.
                </p>
              </div>

              {/* Active Gateway Toggle */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Enable Online Payments</h4>
                  <p className="text-xs text-slate-500">
                    When active, customers can select Razorpay (UPI, Cards, Net Banking) during checkout.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/${company}/workspace`)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs flex items-center gap-2"
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

