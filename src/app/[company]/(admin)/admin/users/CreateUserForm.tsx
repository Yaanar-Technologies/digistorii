"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  UserCircleIcon,
  ArrowLeftIcon, EyeIcon, EyeSlashIcon
} from "@heroicons/react/24/outline";
import { useNotify } from "@/hooks/useNotify";
import { BuySeatsModal } from "@/components/admin/BuySeatsModal";


const FormField = ({
  label,
  name,
  type = "text",
  value,
  error,
  required = false,
  onChange,
  readOnly = false,
  isSelect = false,
  children
}: any) => {
  // Local state to toggle showing the password text string
  const [showPassword, setShowPassword] = useState(false);

  const baseInputStyles = `w-full px-3 py-2 border rounded-md text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${error ? "border-red-500 focus:ring-red-500/20 focus:border-red-500" : "border-gray-300"
    } ${readOnly ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "bg-white text-gray-900"}`;

  const isPassword = type === "password";
  const computedType = isPassword && showPassword ? "text" : type;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-gray-700 tracking-wide uppercase">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {isSelect ? (
        <select
          value={value ?? ""}
          onChange={readOnly ? undefined : onChange}
          disabled={readOnly}
          className={baseInputStyles}
        >
          {children}
        </select>
      ) : (
        <div className="relative w-full">
          <input
            type={computedType}
            name={name}
            value={value ?? ""}
            onChange={readOnly ? undefined : onChange}
            readOnly={readOnly}
            className={`${baseInputStyles} ${isPassword ? "pr-10" : ""}`}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
              )}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500 font-medium mt-0.5">{error}</p>}
    </div>
  );
};

type User = {
  id?: string;
  full_name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  status: boolean;
  responsibility_id: string;
  location_id: string;
  warehouse_id: string;
};

type WarehouseOption = {
  id: number;
  name: string;
  location_id: number;
};

type LocationOption = {
  id: number;
  name: string;
};

type ResponsibilityOption = {
  id: number;
  responsibility_name: string;
};

interface Props {
  company?: string | string[];
  userId?: string;
}

function getDefaultResponsibilityId(options: ResponsibilityOption[]) {
  const preferred =
    options.find((option) => option.responsibility_name === "Sales Person") || options[0];
  return preferred ? String(preferred.id) : "";
}

export default function CreateUserForm({ company, userId }: Props) {
  const router = useRouter();
  const tenant = Array.isArray(company) ? company[0] : company;
  const [errors, setErrors]: any = useState([]);
  const [apiError, setApiError] = useState("");
  const [maxUsers, setMaxUsers] = useState<number>(0);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [responsibilities, setResponsibilities] = useState<ResponsibilityOption[]>([]);
  const hasFetched = useRef(false);
  const notify = useNotify();

  const [users, setUsers] = useState<User[]>([
    {
      id: "",
      full_name: "",
      username: "",
      email: "",
      phone: "",
      password: "",
      status: true,
      responsibility_id: "",
      location_id: "",
      warehouse_id: "",
    },
  ]);

  const addRow = () => {
    const defaultLocationId = locations[0] ? String(locations[0].id) : "";
    const defaultWarehouse =
      warehouses.find((warehouse) => String(warehouse.location_id) === defaultLocationId) ||
      warehouses[0];
    const defaultWarehouseId = defaultWarehouse ? String(defaultWarehouse.id) : "";
    const defaultResponsibilityId = getDefaultResponsibilityId(responsibilities);

    setUsers([
      ...users,
      {
        id: "",
        full_name: "",
        username: "",
        email: "",
        phone: "",
        password: "",
        status: true,
        responsibility_id: defaultResponsibilityId,
        location_id: defaultLocationId,
        warehouse_id: defaultWarehouseId,
      },
    ]);
    setErrors([]);
  };

  const removeRow = (index: number) => {
    if (users.length === 1) return;
    const updated = users.filter((_, i) => i !== index);
    setUsers(updated);
    const updatedErrors = errors.filter((_: any, i: number) => i !== index);
    setErrors(updatedErrors);
  };

  // Fetch user data for edit
  useEffect(() => {
    if (!tenant || !userId) return;
    const fetchUser = async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          headers: { "x-tenant": tenant },
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setUsers([
            {
              id: data.user.id,
              full_name: data.user.full_name,
              username: data.user.username,
              email: data.user.email,
              phone: data.user.phone,
              password: "",
              status: !!data.user.is_active,
              responsibility_id: data.user.responsibility_id ? String(data.user.responsibility_id) : "",
              location_id: data.user.location_id ? String(data.user.location_id) : "",
              warehouse_id: data.user.warehouse_id ? String(data.user.warehouse_id) : "",
            },
          ]);
        } else {
          setApiError(data.message || "Failed to fetch user");
        }
      } catch (err) {
        console.error(err);
        setApiError("Server error. Please try again.");
      }
    };

    fetchUser();
  }, [tenant, userId]);

  useEffect(() => {
    if (!tenant) return;
    const loadMasterOptions = async () => {
      try {
        const [locationRes, warehouseRes, responsibilityRes, usersRes] = await Promise.all([
          fetch("/api/locations", { headers: { "x-tenant": tenant } }),
          fetch("/api/warehouses", { headers: { "x-tenant": tenant } }),
          fetch("/api/user-responsibilities", { headers: { "x-tenant": tenant } }),
          fetch("/api/admin/users", { headers: { "x-tenant": tenant } }),
        ]);
        const locationData = await locationRes.json();
        const warehouseData = await warehouseRes.json();
        const responsibilityData = await responsibilityRes.json();
        const usersData = await usersRes.json();

        if (locationRes.ok && locationData?.success) setLocations(locationData.data || []);
        if (warehouseRes.ok && warehouseData?.success) setWarehouses(warehouseData.data || []);
        if (responsibilityData?.success) setResponsibilities(responsibilityData.data || []);
        if (usersRes.ok && usersData?.success) setMaxUsers(usersData.maxUsers || 0);
      } catch (err) {
        console.error("Failed to load options", err);
      }
    };
    loadMasterOptions();
  }, [tenant]);

  useEffect(() => {
    const defaultLocationId = locations[0] ? String(locations[0].id) : "";
    const defaultWarehouseId = warehouses[0] ? String(warehouses[0].id) : "";
    const defaultResponsibilityId = getDefaultResponsibilityId(responsibilities);
    if (!defaultLocationId && !defaultWarehouseId && !defaultResponsibilityId) return;

    setUsers((prev) =>
      prev.map((user) => {
        const currentLocation = user.location_id || defaultLocationId;
        const matchingWarehouse = warehouses.find(
          (warehouse) => String(warehouse.location_id) === currentLocation
        );
        const selectedWarehouse = warehouses.find(
          (warehouse) => String(warehouse.id) === String(user.warehouse_id)
        );
        const selectedWarehouseMatchesLocation =
          !!selectedWarehouse &&
          String(selectedWarehouse.location_id) === String(currentLocation);
        const nextWarehouseId = selectedWarehouseMatchesLocation
          ? String(selectedWarehouse.id)
          : matchingWarehouse
            ? String(matchingWarehouse.id)
            : defaultWarehouseId;

        return {
          ...user,
          responsibility_id: user.responsibility_id || defaultResponsibilityId,
          location_id: currentLocation,
          warehouse_id: nextWarehouseId,
        };
      })
    );
  }, [locations, warehouses, responsibilities]);

  const handleChange = (index: number, field: keyof User, value: any) => {
    const updated = [...users];
    (updated[index] as any)[field] = value;
    setUsers(updated);

    const updatedErrors = [...errors];
    if (updatedErrors[index]) {
      updatedErrors[index][field] = "";
    }
    setErrors(updatedErrors);
  };

  const validate = () => {
    let newErrors = users.map(() => ({}));
    const emailCount: any = {};
    const usernameCount: any = {};
    const phoneCount: any = {};
    const nameCount: any = {};

    users.forEach((user) => {
      if (user.full_name) nameCount[user.full_name] = (nameCount[user.full_name] || 0) + 1;
      if (user.username) usernameCount[user.username] = (usernameCount[user.username] || 0) + 1;
      if (user.email) emailCount[user.email] = (emailCount[user.email] || 0) + 1;
      if (user.phone) phoneCount[user.phone] = (phoneCount[user.phone] || 0) + 1;
    });

    users.forEach((user, index) => {
      let err: any = {};

      const explicitSymbolsRegex = /^[a-zA-Z\s,.'_\-]*$/;

      if (!user.full_name) {
        err.full_name = "Required";
      } else if (nameCount[user.full_name] > 1) {
        err.full_name = "Duplicate name";
      } else if (!explicitSymbolsRegex.test(user.full_name)) {
        err.full_name = "Special characters are not allowed except , . ' -";
      }

      if (!user.username) {
        err.username = "Required";
      } else if (usernameCount[user.username] > 1) {
        err.username = "Duplicate username";
      } else if (!explicitSymbolsRegex.test(user.username)) {
        err.username = "Special characters are not allowed except , . ' -";
      }
      if (!user.email) err.email = "Required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) err.email = "Invalid format";
      else if (emailCount[user.email] > 1) err.email = "Duplicate email";

      if (!user.phone) err.phone = "Required";
      else if (!/^[0-9]{10}$/.test(user.phone)) err.phone = "Must be 10 digits";
      else if (phoneCount[user.phone] > 1) err.phone = "Duplicate phone";

      if (!user.responsibility_id) err.responsibility_id = "Required";
      if (!user.location_id) err.location_id = "Required";

      if (!user.warehouse_id) {
        err.warehouse_id = "Required";
      } else if (user.location_id) {
        const warehouse = warehouses.find((w) => String(w.id) === String(user.warehouse_id));
        if (!warehouse || String(warehouse.location_id) !== String(user.location_id)) {
          err.warehouse_id = "Mismatch";
        }
      }

      if (!userId) {
        if (!user.password) {
          err.password = "Required";
        } else {
          const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
          if (!passwordRegex.test(user.password)) {
            err.password = "Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and symbols.";
          }
        }
      } else {
        if (user.password) {
          const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
          if (!passwordRegex.test(user.password)) {
            err.password = "Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and symbols.";
          }
        }
      }

      newErrors[index] = err;
    });

    return newErrors;
  };

  const handleSubmit = async () => {
    if (!tenant) {
      setApiError("Tenant/company is required");
      return;
    }

    const validationErrors = validate();
    setErrors(validationErrors);
    setApiError("");
    setSuccess("");

    const hasError = validationErrors.some((e) => Object.keys(e).length > 0);
    if (hasError) return;

    try {
      setLoading(true);
      const url = users[0].id ? `/api/admin/users/${users[0].id}` : "/api/admin/users";
      const method = users[0].id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-tenant": tenant,
        },
        body: JSON.stringify({ users }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.index !== undefined && data.field) {
          const newErrors = [...validationErrors];
          newErrors[data.index] = {
            ...newErrors[data.index],
            [data.field]: data.message,
          };
          setErrors(newErrors);
        } else {
          setApiError(data.message);
        }
        return;
      }

      setSuccess(userId ? "User updated successfully!" : "Users created successfully!");
      router.push(`/${tenant}/admin`);
    } catch (err: any) {
      console.error(err);
      console.log("error here")
      notify(err?.message || "Save  failed", { severity: "warning" });
      setApiError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full transition-all duration-300">

      {/* Header Topbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 mb-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            {userId ? (
              <PencilSquareIcon className="w-6 h-6" />
            ) : (
              <UserCircleIcon className="w-6 h-6" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {userId ? "Edit System User" : "Create Enterprise Users"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Tenant Organization: <span className="font-semibold text-gray-700">{tenant}</span></p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/${tenant}/admin`)}
          className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 bg-white shadow-sm font-medium self-start md:self-auto"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to Directory
        </button>
      </div>

      {/* Messages */}
      {apiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-6 rounded-md text-sm font-medium shadow-sm animate-fade-in flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <span>{apiError}</span>
          {apiError.toLowerCase().includes("cannot create more than") && (
            <button
              type="button"
              onClick={() => setIsBuyModalOpen(true)}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition whitespace-nowrap cursor-pointer"
            >
              Buy More Seats
            </button>
          )}
        </div>
      )}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 mb-6 rounded-md text-sm font-medium shadow-sm animate-fade-in">{success}</div>}

      {/* Dynamic Grid Layout Wrapper */}
      <div className="flex flex-col gap-6">
        {users.map((user, index) => (
          <div key={index} className="relative border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">

            {/* Inner Block Title Bar */}
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {userId ? "Configuration Profile" : `User Identity Entry #${index + 1}`}
              </span>

              {!userId && users.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="flex items-center gap-1.5 text-red-600 text-xs font-semibold hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-all"
                >
                  <TrashIcon className="w-3.5 h-3.5" /> Remove Record
                </button>
              )}
            </div>

            {/* Fully Uniform Fields Grid Layout */}
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-5 items-start">

              <FormField
                label="Full Name"
                value={user.full_name}
                readOnly={false}
                required
                error={errors[index]?.full_name}
                onChange={(e: any) => handleChange(index, "full_name", e.target.value)}
              />

              <FormField
                label="Username"
                value={user.username}
                readOnly={false}
                required
                error={errors[index]?.username}
                onChange={(e: any) => handleChange(index, "username", e.target.value)}
              />

              <FormField
                label="Email Address"
                value={user.email}
                readOnly={false}
                required
                error={errors[index]?.email}
                onChange={(e: any) => handleChange(index, "email", e.target.value)}
              />

              <FormField
                label="Phone Number"
                value={user.phone}
                readOnly={false}
                required
                error={errors[index]?.phone}
                onChange={(e: any) => handleChange(index, "phone", e.target.value)}
              />

              <FormField
                label="Responsibility"
                value={user.responsibility_id}
                isSelect
                required
                error={errors[index]?.responsibility_id}
                onChange={(e: any) => handleChange(index, "responsibility_id", e.target.value)}
              >
                <option value="">Select...</option>
                {responsibilities.map((r) => (
                  <option key={r.id} value={String(r.id)}>{r.responsibility_name}</option>
                ))}
              </FormField>

              <FormField
                label="Assigned Location"
                value={user.location_id}
                isSelect
                required
                error={errors[index]?.location_id}
                onChange={(e: any) => {
                  const nextLoc = e.target.value;
                  const filteredWh = warehouses.filter((w) => String(w.location_id) === nextLoc);
                  const match = filteredWh.some((w) => String(w.id) === user.warehouse_id);
                  const nextWhId = match ? user.warehouse_id : filteredWh[0] ? String(filteredWh[0].id) : "";

                  const updated = [...users];
                  updated[index] = { ...updated[index], location_id: nextLoc, warehouse_id: nextWhId };
                  setUsers(updated);
                }}
              >
                <option value="">Select...</option>
                {locations.map((l) => (
                  <option key={l.id} value={String(l.id)}>{l.name}</option>
                ))}
              </FormField>

              <FormField
                label="Inventory Warehouse"
                value={user.warehouse_id}
                isSelect
                required
                error={errors[index]?.warehouse_id}
                onChange={(e: any) => handleChange(index, "warehouse_id", e.target.value)}
              >
                <option value="">Select...</option>
                {warehouses
                  .filter((w) => !user.location_id || String(w.location_id) === String(user.location_id))
                  .map((w) => (
                    <option key={w.id} value={String(w.id)}>{w.name}</option>
                  ))}
              </FormField>

              <FormField
                label={userId ? "Change Password" : "Account Password"}
                type="password"
                placeholder="Leave blank to keep current"
                value={user.password}
                required={!userId}
                error={errors[index]?.password}
                onChange={(e: any) => handleChange(index, "password", e.target.value)}
              />

              {/* Status Toggles aligned in uniform grid blocks */}
              <div className="flex flex-col gap-2 pt-5">
                <label className="inline-flex items-center gap-2.5 cursor-pointer mt-1 select-none">
                  <input
                    type="checkbox"
                    checked={user.status}
                    onChange={(e) => handleChange(index, "status", e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500/40 focus:outline-none accent-blue-600"
                  />
                  <span className="text-sm font-semibold text-gray-700">Account Active</span>
                </label>
              </div>

            </div>
          </div>
        ))}
      </div>

      {/* Global Control Button Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mt-8 pt-5 border-t border-gray-200">
        {!userId && (
          <button
            type="button"
            onClick={addRow}
            className="w-full sm:w-auto bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <PlusIcon className="w-4 h-4 text-gray-500" /> Add Another Row
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-6 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Processing...</span>
            </>
          ) : userId ? (
            "Save Changes"
          ) : (
            "Register Users"
          )}
        </button>
      </div>

      {/* Global Processing Loader Mask */}
      {loading && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-xs z-50 flex items-center justify-center transition-all duration-200">
          <div className="bg-white px-6 py-4 rounded-xl shadow-xl border border-gray-100 flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm font-bold text-gray-700 tracking-wide">Syncing entries...</span>
          </div>
        </div>
      )}

      <BuySeatsModal
        isOpen={isBuyModalOpen}
        onClose={() => setIsBuyModalOpen(false)}
        maxUsers={maxUsers}
        onSuccess={(newMax) => {
          setMaxUsers(newMax);
          setApiError("");
        }}
        tenant={tenant || ""}
      />
    </div>
  );
}