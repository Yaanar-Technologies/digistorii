"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { BuySeatsModal } from "@/components/admin/BuySeatsModal";
import { PlanStatusCard } from "@/components/admin/RenewalBannerAndModal";

type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
  created_at: string;
};


export default function AdminPage() {
  const router = useRouter();
  const params = useParams();

  const company = Array.isArray(params.company)
    ? params.company[0]
    : params.company;

  const [users, setUsers] = useState<User[]>([]);
  const [maxUsers, setMaxUsers] = useState<number>(0);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);

  const hasFetched = useRef(false);

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!company) return;
      try {
        const res = await fetch(`/api/onboarding?company=${encodeURIComponent(company)}`);
        const data = await res.json();
        if (data.success && data.subscription) {
          setSubscription(data.subscription);
        }
      } catch (err) {
        console.error("Failed to load subscription info", err);
      }
    };
    fetchSubscription();
  }, [company]);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!company || hasFetched.current) return;
      hasFetched.current = true;
      try {
        const res = await fetch("/api/admin/users", {
          headers: { "x-tenant": company || "" },
        });
        const data = await res.json();
        if (data.success) {
          setUsers(data.users);
          setMaxUsers(data.maxUsers || 0);
        }
      } catch (err) {
        console.error("Failed to load users", err);
      } finally {
        setLoading(false);
      }
    };
    if (company) fetchUsers();
  }, [company]);

  // Derived metrics
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.is_active).length;
  const newUsers = users.filter(u => {
    const createdDate = new Date(u.created_at);
    const now = new Date();
    return (
      createdDate.getFullYear() === now.getFullYear() &&
      createdDate.getMonth() === now.getMonth() &&
      createdDate.getDate() === now.getDate()
    );
  }).length;

  const formatDate = (date: string) => {
    if (!date) return "";
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    return `${day}-${month}-${year}`;
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Admin Console
          </h1>
          <p className="text-sm text-gray-500">Manage user access permissions and company system configurations.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/${company}/admin/user-responsibilities`)}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 transition shadow"
          >
            Edit Responsibility
          </button>
          <button
            onClick={() => router.push(`/${company}/admin/users`)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition shadow"
          >
            + Create User
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow p-4 hover:shadow-lg transition flex justify-between items-center">
          <div>
            <p className="text-gray-500 text-sm">Total Users</p>
            <p className="text-2xl font-bold">{totalUsers} / {maxUsers || "N/A"}</p>
          </div>
          <button
            onClick={() => setIsBuyModalOpen(true)}
            className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold px-3 py-1.5 rounded-lg transition"
          >
            Buy More
          </button>
        </div>
        <div className="bg-white rounded-xl shadow p-4 hover:shadow-lg transition">
          <p className="text-gray-500 text-sm">Active Users</p>
          <p className="text-2xl font-bold">{activeUsers}</p>
        </div>
        <PlanStatusCard subscription={subscription} />
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="p-6 text-gray-500">No users found</p>
        ) : (
          <table className="w-full table-auto text-sm">
            <thead className="bg-indigo-50 text-gray-600 sticky top-0">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">User Resp</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Created On</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <tr
                  key={u.id}
                  className={`border-t hover:bg-blue-50 transition ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                >
                  <td className="p-3 font-medium">{u.name}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.phone}</td>
                  <td className="p-3">{u.role}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${u.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                        }`}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-3">{formatDate(u.created_at)}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => router.push(`/${company}/admin/users?userId=${u.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 text-gray-700 rounded-md text-xs font-medium bg-white hover:bg-gray-50 hover:text-blue-600 transition shadow-xs"
                    >
                      <PencilSquareIcon className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <BuySeatsModal
        isOpen={isBuyModalOpen}
        onClose={() => setIsBuyModalOpen(false)}
        maxUsers={maxUsers}
        onSuccess={(newMax) => setMaxUsers(newMax)}
        tenant={company || ""}
      />
    </div>
  );
}