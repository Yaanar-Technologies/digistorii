"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { companySlugSchema } from "@/lib/reservedSlugs";

/* ===============================
   FLOATING INPUT COMPONENT (UNCHANGED)
================================ */
const FloatingInput = ({
  label,
  name,
  type = "text",
  value,
  error,
  required = false,
  onChange,
}: any) => {
  return (
    <div className="w-full">
      <div className="relative">
        <input
          type={type}
          name={name}
          value={value}
          placeholder=" "
          onChange={onChange}
          className={`floating-input peer ${
            error
              ? "border-red-500 focus:ring-red-500 focus:border-red-500"
              : ""
          }`}
        />
        <label
          className="
            floating-label
            peer-placeholder-shown:top-4
            peer-placeholder-shown:text-sm
            peer-placeholder-shown:text-gray-400
            peer-focus:top-2
            peer-focus:text-xs
            peer-focus:text-blue-600
          "
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      </div>

      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
};

/* ===============================
   MAIN COMPONENT
================================ */
export default function SetupForm() {
  const [form, setForm] = useState({
    company_name: "",
    email: "",
    phone: "",
    subdomain_url: "",
    schema_name: "",
    full_name: "",
    username: "",
    password: "",
    confirm_password: "",
  });

  const [errors, setErrors]: any = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  /* ===============================
     HANDLE CHANGE
  ================================*/
  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /* ===============================
     VALIDATION (UNCHANGED)
  ================================*/
  const validate = () => {
    let newErrors: any = {};

    if (!form.company_name.trim())
      newErrors.company_name = "Company name is required";

    if (!form.full_name.trim())
      newErrors.full_name = "Full name is required";

    if (!form.email)
      newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = "Invalid email format";

    if (!form.phone)
      newErrors.phone = "Phone number is required";
    else if (!/^[0-9]{10}$/.test(form.phone))
      newErrors.phone = "Phone must be 10 digits";

    if (!form.subdomain_url.trim()) {
      newErrors.subdomain_url = "Company URL (Subdomain) is required";
    } else {
      const slugRes = companySlugSchema.safeParse(form.subdomain_url);
      if (!slugRes.success) {
        newErrors.subdomain_url = slugRes.error.issues[0]?.message || "Invalid Company URL";
      }
    }

    if (!form.schema_name.trim())
      newErrors.schema_name = "Database Schema name is required";

    if (!form.password)
      newErrors.password = "Password is required";
    else if (form.password.length < 6)
      newErrors.password = "Password must be at least 6 characters";

    if (!form.confirm_password)
      newErrors.confirm_password = "Confirm password is required";
    else if (form.password !== form.confirm_password)
      newErrors.confirm_password = "Passwords do not match";

    return newErrors;
  };

  /* ===============================
     HANDLE SUBMIT (UNCHANGED LOGIC)
  ================================*/
  const handleSubmit = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    setSuccess("");

    if (Object.keys(validationErrors).length > 0) return;

    try {
      setLoading(true);
      const company = form.subdomain_url;

      const res = await apiFetch("/api/setup", company, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ api: data.message || "Something went wrong" });
      } else {
        setSuccess("🎉 Your Finance SaaS company has been created!");

        setForm({
          company_name: "",
          email: "",
          phone: "",
          subdomain_url: "",
          schema_name: "",
          full_name: "",
          username: "",
          password: "",
          confirm_password: "",
        });
      }
    } catch (err: any) {
      setErrors({ api: "Server error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  /* ===============================
     UI
  ================================*/
  return (
    <section className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 py-20 px-6">
      <div className="max-w-4xl mx-auto">

        {/* Hero Header */}
        <div className="text-center mb-14">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
            Launch Your Finance SaaS Platform
          </h1>
          <p className="text-gray-600 mt-4 text-lg">
            Set up your company, configure your SaaS instance,
            and get your financial platform running in minutes.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-10 md:p-14">

          {/* API ERROR */}
          {errors.api && (
            <div className="bg-red-100 text-red-700 p-4 rounded-xl mb-8 text-center">
              {errors.api}
            </div>
          )}

          {/* SUCCESS */}
          {success && (
            <div className="bg-green-100 text-green-700 p-4 rounded-xl mb-8 text-center">
              {success}
            </div>
          )}

          {/* Company Details */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
              Company Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FloatingInput
                label="Company Name"
                name="company_name"
                value={form.company_name}
                error={errors.company_name}
                required
                onChange={handleChange}
              />
              <FloatingInput
                label="Business Email"
                name="email"
                value={form.email}
                error={errors.email}
                required
                onChange={handleChange}
              />
              <FloatingInput
                label="Phone Number"
                name="phone"
                value={form.phone}
                error={errors.phone}
                required
                onChange={handleChange}
              />
            </div>
          </section>

          {/* SaaS Setup */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
              SaaS Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FloatingInput
                label="Company URL (Subdomain)"
                name="subdomain_url"
                value={form.subdomain_url}
                error={errors.subdomain_url}
                required
                onChange={handleChange}
              />
              <FloatingInput
                label="Database Schema Name"
                name="schema_name"
                value={form.schema_name}
                error={errors.schema_name}
                required
                onChange={handleChange}
              />
            </div>
          </section>

          {/* Admin Setup */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
              Admin Account Setup
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FloatingInput
                label="Full Name"
                name="full_name"
                value={form.full_name}
                error={errors.full_name}
                required
                onChange={handleChange}
              />
              <FloatingInput
                label="Username"
                name="username"
                value={form.username}
                onChange={handleChange}
              />
              <FloatingInput
                label="Password"
                name="password"
                type="password"
                value={form.password}
                error={errors.password}
                required
                onChange={handleChange}
              />
              <FloatingInput
                label="Confirm Password"
                name="confirm_password"
                type="password"
                value={form.confirm_password}
                error={errors.confirm_password}
                required
                onChange={handleChange}
              />
            </div>
          </section>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full flex justify-center items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-4 rounded-2xl transition-all text-lg shadow-xl hover:shadow-2xl disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading && (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            )}
            {loading ? "Setting Up Your Platform..." : "Create Finance SaaS Company"}
          </button>

          <p className="text-center text-sm text-gray-500 mt-6">
            Your data is securely isolated with multi-tenant architecture.
          </p>
        </div>
      </div>
    </section>
  );
}
