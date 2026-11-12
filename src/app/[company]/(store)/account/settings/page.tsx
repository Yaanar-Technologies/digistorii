"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BellIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useCustomerAuthStore } from "@/store/customerAuthStore";

export default function AccountSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";
  const { customer, checkSession, logout } = useCustomerAuthStore();

  const [notifications, setNotifications] = useState({
    whatsapp: customer?.notification_preferences?.whatsapp ?? true,
    sms: customer?.notification_preferences?.sms ?? true,
    email: customer?.notification_preferences?.email ?? true,
  });

  const [savingPreferences, setSavingPreferences] = useState(false);
  const [prefMessage, setPrefMessage] = useState<string | null>(null);

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPreferences(true);
    setPrefMessage(null);
    try {
      const res = await fetch(`/api/${company}/ecom/customer/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: notifications }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update settings");
      setPrefMessage("Preferences saved successfully.");
      await checkSession(company);
      setTimeout(() => setPrefMessage(null), 3000);
    } catch (err: any) {
      setPrefMessage(err.message || "Failed to save preferences.");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/${company}/ecom/customer/delete`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete account");
      await logout(company);
      router.push(`/${company}/store`);
    } catch (err: any) {
      alert(err.message || "Unable to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <h1 className="text-lg font-bold text-slate-900">Privacy, Notifications & Data</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Control your communication channels, export your data, or manage your personal account lifecycle
        </p>
      </div>

      {/* 1. Notification Preferences */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellIcon className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Communication Channels</h2>
              <p className="text-2xs text-slate-400">Choose how you wish to receive order updates and offers</p>
            </div>
          </div>

          {prefMessage && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircleIcon className="h-4 w-4" />
              <span>{prefMessage}</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSaveNotifications} className="space-y-3">
          <label className="flex items-start justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer">
            <div>
              <div className="text-xs font-bold text-slate-800">WhatsApp Order Updates</div>
              <div className="text-2xs text-slate-500">
                Receive live order confirmation, dispatch AWB, and delivery OTP on WhatsApp
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifications.whatsapp}
              onChange={(e) => setNotifications({ ...notifications, whatsapp: e.target.checked })}
              className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 mt-1"
            />
          </label>

          <label className="flex items-start justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer">
            <div>
              <div className="text-xs font-bold text-slate-800">SMS Tracking & Delivery Alerts</div>
              <div className="text-2xs text-slate-500">
                Receive text SMS messages for shipment arrival and courier milestones
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifications.sms}
              onChange={(e) => setNotifications({ ...notifications, sms: e.target.checked })}
              className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 mt-1"
            />
          </label>

          <label className="flex items-start justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer">
            <div>
              <div className="text-xs font-bold text-slate-800">Email Invoices & Exclusive Saree Drops</div>
              <div className="text-2xs text-slate-500">
                Receive formal GST tax invoices, festive catalogue previews, and discount vouchers
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifications.email}
              onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })}
              className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 mt-1"
            />
          </label>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingPreferences}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {savingPreferences ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Data Export (GDPR / Indian DPDP Act) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <ArrowDownTrayIcon className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Personal Data Export</h2>
            <p className="text-2xs text-slate-400">Compliant with the Digital Personal Data Protection Act (DPDP)</p>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          You have the right to obtain a portable, machine-readable copy of your personal records.
          The download includes your registered profile, saved shipping and billing addresses, and complete online order records.
        </p>

        <div>
          <a
            href={`/api/${company}/ecom/customer/export`}
            download
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
          >
            <ArrowDownTrayIcon className="h-4 w-4 text-slate-500" />
            <span>Download My Data (JSON)</span>
          </a>
        </div>
      </div>

      {/* 3. Account Deletion (Danger Zone) */}
      <div className="bg-white rounded-2xl border border-rose-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-rose-100 text-rose-700">
          <ExclamationTriangleIcon className="h-5 w-5" />
          <div>
            <h2 className="text-sm font-bold text-rose-900">Deactivate Customer Account</h2>
            <p className="text-2xs text-rose-600">Permanently delete your profile and sign-in credentials</p>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Deactivating your account will anonymize your personal identifying information (PII) and revoke all active sessions.
          Statutory invoices and completed orders are retained anonymously as required under Indian GST statutory auditing guidelines.
        </p>

        <div>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-semibold transition-colors cursor-pointer"
          >
            <TrashIcon className="h-4 w-4" />
            <span>Delete My Account</span>
          </button>
        </div>
      </div>

      {/* Deletion Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-rose-900 flex items-center gap-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-rose-600" />
              <span>Are you absolutely sure?</span>
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              This action cannot be undone. You will lose access to your saved delivery addresses and self-service account history.
            </p>

            <div className="space-y-1">
              <label className="text-2xs font-bold text-slate-700">Type DELETE to confirm:</label>
              <input
                type="text"
                placeholder="DELETE"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-rose-200 text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setConfirmText("");
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={confirmText !== "DELETE" || deleting}
                onClick={handleDeleteAccount}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "Deactivating..." : "Permanently Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

