"use client";

import { useEffect, useState, useRef } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiFetch } from "@/lib/apiFetch";
import { useRouter } from "next/navigation";

type Responsibility = {
  id?: number;
  responsibility_name: string;
  dashboard_access: boolean;
  purchase_access: boolean;
  inventory_access: boolean;
  sales_access: boolean;
  sales_billing_access: boolean;
  reports_access: boolean;
  settings_access: boolean;
  ecommerce_access: boolean;
  is_system?: boolean;
};

const accessFields: Array<{ key: keyof Responsibility; label: string }> = [
  { key: "dashboard_access", label: "Dashboard" },
  { key: "purchase_access", label: "Purchase" },
  { key: "inventory_access", label: "Inventory" },
  { key: "sales_access", label: "Sales" },
  { key: "sales_billing_access", label: "Sales Billing" },
  { key: "reports_access", label: "Reports" },
  { key: "ecommerce_access", label: "E-Commerce" },
  { key: "settings_access", label: "Settings" },

];

function getDefaultForm(): Responsibility {
  return {
    responsibility_name: "",
    dashboard_access: true,
    purchase_access: false,
    inventory_access: false,
    sales_access: false,
    sales_billing_access: false,
    reports_access: false,
    ecommerce_access: false,
    settings_access: false,
    is_system: false,
  };
}

export default function UserResponsibilitiesPage() {
  const { company } = useTenant();
  const router = useRouter();
  const [items, setItems] = useState<Responsibility[]>([]);
  const [form, setForm] = useState<Responsibility>(getDefaultForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectAllRef = useRef<HTMLInputElement>(null);

  const allChecked = accessFields.every((field) => form[field.key]);
  const someChecked = accessFields.some((field) => form[field.key]) && !allChecked;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  const handleSelectAll = () => {
    const nextValue = !allChecked;
    const updates: Partial<Responsibility> = {};
    accessFields.forEach((field) => {
      updates[field.key as keyof Responsibility] = nextValue as any;
    });
    setForm((prev) => ({ ...prev, ...updates }));
  };

  async function loadData() {
    if (!company) return;
    try {
      setLoading(true);
      setError("");
      const res = await apiFetch("/api/user-responsibilities", company);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load responsibilities");
      }
      setItems(Array.isArray(data.data) ? data.data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load responsibilities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [company]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;

    if (!form.responsibility_name.trim()) {
      setError("Responsibility name is required.");
      return;
    }

    const noSymbolsRegex = /^[a-zA-Z0-9\s]+$/;
    if (!noSymbolsRegex.test(form.responsibility_name)) {
      setError("Symbols are not allowed in responsibility name.");
      return;
    }

    const hasAtLeastOnePermission = accessFields.some((field) => form[field.key]);
    if (!hasAtLeastOnePermission) {
      setError("At least one permission must be selected.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const url = form.id ? `/api/user-responsibilities/${form.id}` : "/api/user-responsibilities";
      const method = form.id ? "PUT" : "POST";
      const res = await apiFetch(url, company, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          responsibility_name: form.responsibility_name.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Unable to save responsibility");
      }
      setForm(getDefaultForm());
      await loadData();
    } catch (err: any) {
      setError(err.message || "Unable to save responsibility");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(`/${company}/admin`)}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
          title="Go Back"
        >
          <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Responsibilities</h1>
          <p className="text-sm text-gray-600">
            Create or update responsibility-based access profiles for this company.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[400px,1fr]">
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-5 h-fit">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Responsibility Name
            </label>
            <input
              value={form.responsibility_name}
              onChange={(e) => setForm((prev) => ({ ...prev, responsibility_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Area Manager"
            />
          </div>

          <div className="space-y-4">
            <label className="inline-flex items-center gap-3 text-sm font-semibold text-gray-900 pb-3 border-b border-gray-100 w-full cursor-pointer">
              <input
                type="checkbox"
                ref={selectAllRef}
                checked={allChecked}
                onChange={handleSelectAll}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Select All Permissions
            </label>

            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              {accessFields.map((field) => (
                <label key={String(field.key)} className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form[field.key])}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [field.key]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-70"
            >
              {saving ? "Saving..." : form.id ? "Update Profile" : "Create Profile"}
            </button>
            <button
              type="button"
              onClick={() => setForm(getDefaultForm())}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {loading ? (
            <div className="text-sm text-gray-500 flex justify-center py-8">Loading responsibilities...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="px-3 py-3 font-semibold">Profile Name</th>
                    {accessFields.map((field) => (
                      <th key={field.label} className="px-2 py-3 font-semibold text-center whitespace-nowrap">
                        {field.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{item.responsibility_name}</td>
                      {accessFields.map((field) => (
                        <td key={`${item.id}-${field.label}`} className="px-2 py-3 text-center">
                          {item[field.key] ? (
                            <svg className="h-5 w-5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5 text-gray-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                            </svg>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setForm(item)}
                          className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!items.length && (
                    <tr>
                      <td colSpan={accessFields.length + 2} className="px-3 py-8 text-center text-gray-500">
                        No responsibilities found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
