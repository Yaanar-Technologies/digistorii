"use client";

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useState } from "react";
import { useUser } from "@/context/CurrentUserContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { City, Country, State } from "country-state-city";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { useTenant } from "@/context/TenantContext";

type SubscriptionStats = {
  plan_name: string;
  billing_interval: string;
  status: string;
  max_users: number;
  max_locations: number;
  max_warehouses: number;
  used_users: number;
  used_locations: number;
  used_warehouses: number;
};

type BusinessSettings = {
  gst_number: string;
  pan_number: string;
  address: string;
  city: string;
  state: string;
  country: string;
  currency: string;
  year_type: "fiscal" | "calendar";
  default_low_stock_threshold: number;
  default_backorders_allowed: boolean;
  low_stock_notifications_enabled: boolean;
  low_stock_email_notifications_enabled: boolean;
  subscribed_users: number[];
};

type UserData = {
  id: number;
  name: string;
  email: string;
  phone: string;
  responsibility_name: string;
  is_active: boolean;
};

type Location = {
  id: number;
  name: string;
  is_default: boolean;
  type: string;
};

type Warehouse = {
  id: number;
  name: string;
  code: string;
  location_id: number;
  location_name: string;
  contact_person_name: string;
  landline: string;
};

export default function BusinessConfigurationPage() {
  const { user, setUser } = useUser();

  const router = useRouter();
  const { company } = useTenant();
  const tenant = company || user?.subdomain_url || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>({
    gst_number: "",
    pan_number: "",
    address: "",
    city: "",
    state: "",
    country: "India",
    currency: "INR",
    year_type: "fiscal",
    default_low_stock_threshold: 5,
    default_backorders_allowed: false,
    low_stock_notifications_enabled: true,
    low_stock_email_notifications_enabled: false,
    subscribed_users: [],
  });

  const [locations, setLocations] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [message, setMessage] = useState("");
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [isEditingBiz, setIsEditingBiz] = useState(false);
  const [isEditingInventoryAlerts, setIsEditingInventoryAlerts] = useState(false);

  const countryOptions = Country.getAllCountries();
  const selectedCountry = countryOptions.find(c => c.name === businessSettings.country) || countryOptions.find(c => c.isoCode === "IN");
  const stateOptions = State.getStatesOfCountry(selectedCountry?.isoCode || "IN");
  const selectedState = stateOptions.find(s => s.name === businessSettings.state);
  const cityOptions = selectedCountry && selectedState ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode) : [];

  useEffect(() => {
    if (!tenant) return;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        // Fetch stats (reuse onboarding endpoint for counts and subscription)
        const statRes = await fetch(`/api/onboarding?company=${tenant}`);
        if (statRes.ok) {
          const statData = await statRes.json();
          if (statData.success) {
            setStats({
              plan_name: statData.subscription?.plan_name || statData.subscription?.plan_code || "Unknown",
              billing_interval: statData.subscription?.billing_interval || "monthly",
              status: statData.subscription?.status || "Active",
              max_users: statData.subscription?.max_users || 1,
              max_locations: statData.subscription?.max_locations || 1,
              max_warehouses: statData.subscription?.max_warehouses || 1,
              used_users: statData.counts?.users || 0,
              used_locations: statData.counts?.locations || 0,
              used_warehouses: statData.counts?.warehouses || 0,
            });
          }
        }

        // Fetch Business Settings
        const bizRes = await fetch(`/api/business-settings`, {
          headers: { "x-tenant": tenant }
        });
        if (bizRes.ok) {
          const bizData = await bizRes.json();
          if (bizData.success && bizData.data) {
            setBusinessSettings({
              gst_number: bizData.data.gst_number || "",
              pan_number: bizData.data.pan_number || "",
              address: bizData.data.address || "",
              city: bizData.data.city || "",
              state: bizData.data.state || "",
              country: bizData.data.country || "India",
              currency: bizData.data.currency || "INR",
              year_type: bizData.data.year_type || "fiscal",
              default_low_stock_threshold: bizData.data.default_low_stock_threshold !== undefined ? Number(bizData.data.default_low_stock_threshold) : 5,
              default_backorders_allowed: bizData.data.default_backorders_allowed ?? false,
              low_stock_notifications_enabled: bizData.data.low_stock_notifications_enabled ?? true,
              low_stock_email_notifications_enabled: bizData.data.low_stock_email_notifications_enabled ?? false,
              subscribed_users: bizData.data.subscribed_users || [],
            });
          }
        }

        // Fetch Locations
        const locRes = await fetch(`/api/locations`, { headers: { "x-tenant": tenant } });
        if (locRes.ok) {
          const locData = await locRes.json();
          if (locData.success) setLocations(locData.data || []);
        }

        // Fetch Warehouses
        const whRes = await fetch(`/api/warehouses`, { headers: { "x-tenant": tenant } });
        if (whRes.ok) {
          const whData = await whRes.json();
          if (whData.success) setWarehouses(whData.data || []);
        }

        // Fetch Users
        const usersRes = await fetch(`/api/tenant-users`, { headers: { "x-tenant": tenant } });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          if (usersData.success) setUsersList(usersData.data || []);
        }

      } catch (err) {
        console.error("Error fetching business config", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [tenant]);


  const handleSaveOrAcknowledge = async () => {
    try {
      const res = await fetch(`/api/guided-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: user?.subdomain_url || user?.company_name }),
      });

      if (res.ok) {
        if (user) {
          setUser({ ...user, has_completed_guided_setup: true });
        }
        router.push(`/${user?.company_name}/workspace/dashboard`);
      }
    } catch (error) {
      console.error("Failed to complete setup", error);
    }
  };
  const handleSaveBusinessSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/business-settings`, {
        method: "PUT",
        headers: { "x-tenant": tenant, "Content-Type": "application/json" },
        body: JSON.stringify(businessSettings),
      });
      if (res.ok) {
        setMessage("Business settings saved successfully.");
        setIsEditingBiz(false);
      } else {
        setMessage("Failed to save business settings.");
      }
    } catch (err) {
      console.error(err);
      setMessage("An error occurred.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const handleSaveInventoryAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/business-settings`, {
        method: "PUT",
        headers: { "x-tenant": tenant, "Content-Type": "application/json" },
        body: JSON.stringify(businessSettings),
      });
      if (res.ok) {
        setMessage("Inventory alert settings saved successfully.");
        setIsEditingInventoryAlerts(false);
      } else {
        setMessage("Failed to save settings.");
      }
    } catch (err) {
      console.error(err);
      setMessage("An error occurred.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  if (loading) {
    return <div className="p-8 text-gray-500">Loading Business Configuration...</div>;
  }

  const fieldClass = "w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm";
  const labelClass = "block text-sm font-semibold text-gray-700 mb-1";

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8 font-sans">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Business Configuration</h1>

        <Link
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          href={`/${company}/workspace/administration/masters`}
        >
          <ArrowLeftIcon className="w-4 h-4 text-gray-500" />
          Back to Masters
        </Link>
      </div>
      {/* Section 1: Subscription & Plan Status */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Subscription & Plan Quotas</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="col-span-1 border-r border-gray-100 pr-4">
            <p className="text-sm text-gray-500 font-medium">Active Plan</p>
            <p className="text-2xl font-bold text-blue-600 mb-1">{stats?.plan_name}</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 capitalize">
              {stats?.status} - {stats?.billing_interval}
            </span>
          </div>

          <div className="col-span-3 grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 font-medium flex justify-between">
                <span>System Users</span>
                <span>{stats?.used_users} / {stats?.max_users}</span>
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min(((stats?.used_users || 0) / (stats?.max_users || 1)) * 100, 100)}%` }}></div>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium flex justify-between">
                <span>Locations</span>
                <span>{stats?.used_locations} / {stats?.max_locations}</span>
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${Math.min(((stats?.used_locations || 0) / (stats?.max_locations || 1)) * 100, 100)}%` }}></div>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium flex justify-between">
                <span>Warehouses</span>
                <span>{stats?.used_warehouses} / {stats?.max_warehouses}</span>
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${Math.min(((stats?.used_warehouses || 0) / (stats?.max_warehouses || 1)) * 100, 100)}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Business & Tax Configuration */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Business  Details</h2>
          {message && <span className="text-sm text-green-600 font-medium">{message}</span>}
        </div>
        {!isEditingBiz ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Address</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Currency</th>
                  <th className="px-4 py-3">Year Type</th>
                  <th className="px-4 py-3">GST Number</th>
                  <th className="px-4 py-3">PAN Number</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">{businessSettings.address || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{businessSettings.country || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{businessSettings.state || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{businessSettings.city || "-"}</td>
                  <td className="px-4 py-3 text-gray-600 uppercase">{businessSettings.currency || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{businessSettings.year_type === 'calendar' ? 'Calendar Year (Jan–Dec)' : 'Financial Year (Apr–Mar)'}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{businessSettings.gst_number || "-"}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{businessSettings.pan_number || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setIsEditingBiz(true)}
                      className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <form onSubmit={handleSaveBusinessSettings} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>GSTIN</label>
                <input
                  type="text"
                  value={businessSettings.gst_number}
                  onChange={e => setBusinessSettings({ ...businessSettings, gst_number: e.target.value.toUpperCase() })}
                  className={`${fieldClass} font-mono uppercase`}
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>
              <div>
                <label className={labelClass}>PAN Number</label>
                <input
                  type="text"
                  value={businessSettings.pan_number}
                  onChange={e => setBusinessSettings({ ...businessSettings, pan_number: e.target.value.toUpperCase() })}
                  className={`${fieldClass} font-mono uppercase`}
                  maxLength={10}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Business Address</label>
                <input
                  type="text"
                  value={businessSettings.address}
                  onChange={e => setBusinessSettings({ ...businessSettings, address: e.target.value })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Country</label>
                <select
                  value={businessSettings.country}
                  onChange={e => setBusinessSettings({ ...businessSettings, country: e.target.value, state: "", city: "" })}
                  className={fieldClass}
                >
                  <option value="">Select Country</option>
                  {countryOptions.map(c => <option key={c.isoCode} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>State</label>
                <select
                  value={businessSettings.state}
                  onChange={e => setBusinessSettings({ ...businessSettings, state: e.target.value, city: "" })}
                  className={fieldClass}
                >
                  <option value="">Select State</option>
                  {stateOptions.map(s => <option key={s.isoCode} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>City</label>
                <select
                  value={businessSettings.city}
                  onChange={e => setBusinessSettings({ ...businessSettings, city: e.target.value })}
                  className={fieldClass}
                >
                  <option value="">Select City</option>
                  {cityOptions.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Currency</label>
                <input
                  type="text"
                  value={businessSettings.currency}
                  onChange={e => setBusinessSettings({ ...businessSettings, currency: e.target.value })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Year Type</label>
                <select
                  value={businessSettings.year_type || "fiscal"}
                  onChange={e => setBusinessSettings({ ...businessSettings, year_type: e.target.value as "fiscal" | "calendar" })}
                  className={fieldClass}
                >
                  <option value="fiscal">Financial Year (Apr - Mar)</option>
                  <option value="calendar">Calendar Year (Jan - Dec)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditingBiz(false)}
                className="px-5 py-2.5 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-70 transition-all">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </section>
 
      {/* Section 2.5: Inventory Alerts */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Inventory Alerts & Notifications</h2>
          {!isEditingInventoryAlerts && (
            <button
              onClick={() => setIsEditingInventoryAlerts(true)}
              className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
            >
              Edit Alerts
            </button>
          )}
        </div>

        {!isEditingInventoryAlerts ? (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-500">Default Low Stock Threshold</p>
                <p className="text-lg font-medium text-gray-900">{businessSettings.default_low_stock_threshold}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500">Allow Backorders by Default</p>
                <p className="text-lg font-medium text-gray-900">
                  {businessSettings.default_backorders_allowed ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500">In-App Notifications</p>
                <p className="text-lg font-medium text-gray-900">
                  {businessSettings.low_stock_notifications_enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500">Email Notifications</p>
                <p className="text-lg font-medium text-gray-900">
                  {businessSettings.low_stock_email_notifications_enabled ? "Enabled" : "Disabled"}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-500">Subscribed Users</p>
              <p className="text-sm text-gray-900 mt-1">
                {usersList
                  .filter(u => businessSettings.subscribed_users?.includes(u.id))
                  .map(u => u.name)
                  .join(", ") || "No users subscribed to low stock alerts"}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveInventoryAlerts} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Default Low Stock Threshold</label>
                <input
                  type="number"
                  min="0"
                  value={businessSettings.default_low_stock_threshold}
                  onChange={e => setBusinessSettings({ ...businessSettings, default_low_stock_threshold: Number(e.target.value) })}
                  className={fieldClass}
                />
              </div>
              <div className="flex items-center pt-6">
                <input
                  type="checkbox"
                  id="default_backorders_allowed"
                  checked={businessSettings.default_backorders_allowed}
                  onChange={e => setBusinessSettings({ ...businessSettings, default_backorders_allowed: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="default_backorders_allowed" className="ml-2 block text-sm text-gray-900 font-semibold">
                  Allow Backorders by Default
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="low_stock_notifications_enabled"
                  checked={businessSettings.low_stock_notifications_enabled}
                  onChange={e => setBusinessSettings({ ...businessSettings, low_stock_notifications_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="low_stock_notifications_enabled" className="ml-2 block text-sm text-gray-900 font-semibold">
                  Enable In-App Low Stock Notifications
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="low_stock_email_notifications_enabled"
                  checked={businessSettings.low_stock_email_notifications_enabled}
                  onChange={e => setBusinessSettings({ ...businessSettings, low_stock_email_notifications_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="low_stock_email_notifications_enabled" className="ml-2 block text-sm text-gray-900 font-semibold">
                  Enable Email Low Stock Notifications
                </label>
              </div>
            </div>

            <div>
              <label className={labelClass}>Subscribed Users</label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-4 border border-gray-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                {usersList.length > 0 ? (
                  usersList.map(u => {
                    const isChecked = businessSettings.subscribed_users?.includes(u.id);
                    return (
                      <div key={u.id} className="flex items-center">
                        <input
                          type="checkbox"
                          id={`user-sub-${u.id}`}
                          checked={isChecked}
                          onChange={() => {
                            const updated = isChecked
                              ? businessSettings.subscribed_users.filter(id => id !== u.id)
                              : [...(businessSettings.subscribed_users || []), u.id];
                            setBusinessSettings({ ...businessSettings, subscribed_users: updated });
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`user-sub-${u.id}`} className="ml-2 block text-sm text-gray-700">
                          {u.name} <span className="text-gray-400 text-xs">({u.email})</span>
                        </label>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-500 col-span-full">No active users to subscribe.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditingInventoryAlerts(false)}
                className="px-5 py-2.5 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-70 transition-all">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Section Users: No. of Users */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-bold text-gray-900">User Management</h2>
          <div className="relative group flex items-center">
            <InformationCircleIcon className="w-5 h-5 text-gray-400 cursor-pointer" />
            <div className="absolute left-7 top-1/2 -translate-y-1/2 hidden group-hover:block z-20 w-72 rounded-md bg-gray-900 text-white text-xs p-3 shadow-lg">
              User management and editing are restricted to administrators via{" "}
              <Link href={`/${tenant}/admin/login`} className="text-blue-300 hover:underline">
                /{tenant}/admin/login
              </Link>
              .
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">User Resp</th>
                <th className="px-4 py-3 rounded-tr-lg">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usersList.length > 0 ? usersList.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{u.phone || "-"}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{u.responsibility_name || "-"}</td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-md">Active</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded-md">Inactive</span>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Locations Management */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Locations Management</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right rounded-tr-lg">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {locations.length > 0 ? locations.map(loc => (
                <tr key={loc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                    {loc.name}
                    {loc.is_default && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-md">Default</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{loc.type}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/${tenant}/workspace/inventory/location`} className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
                      Edit Location
                    </Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-500">No locations found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4: Warehouses Management */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Warehouses Management</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Contact Person</th>
                <th className="px-4 py-3">Landline</th>
                <th className="px-4 py-3 text-right rounded-tr-lg">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {warehouses.length > 0 ? warehouses.map(wh => (
                <tr key={wh.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-600">{wh.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{wh.name}</td>
                  <td className="px-4 py-3 text-gray-600">{wh.location_name || `ID: ${wh.location_id}`}</td>
                  <td className="px-4 py-3 text-gray-600">{wh.contact_person_name || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{wh.landline || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/${tenant}/workspace/inventory/warehouse`} className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
                      Edit Warehouse
                    </Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No warehouses found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
