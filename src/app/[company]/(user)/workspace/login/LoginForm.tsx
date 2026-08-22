"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HiEye, HiEyeOff, HiMail, HiArrowLeft } from "react-icons/hi";
import {
  UserCircleIcon, LockClosedIcon
} from "@heroicons/react/24/outline";
import { useUser } from "@/context/CurrentUserContext";
import { ShoppingCartIcon, CubeIcon, DocumentTextIcon, CurrencyRupeeIcon } from "@heroicons/react/24/outline";

interface Props {
  company: string;
}

export default function LoginForm({ company }: Props) {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [year, setYear] = useState<number | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [realCompanyName, setRealCompanyName] = useState<string>("");
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  const { setUser } = useUser();

  useEffect(() => {
    setMounted(true);
    setYear(new Date().getFullYear());
  }, []);

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.toLowerCase());
  };
  useEffect(() => {
    setMounted(true);
    setYear(new Date().getFullYear());

    if (company) {
      fetch(`/api/company?company=${encodeURIComponent(company)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && data?.company_name) {
            setRealCompanyName(data.company_name);
          }
        })
        .catch((err) => console.error("Failed to fetch company name:", err));
    }
  }, [company]);
  const displayCompanyName = realCompanyName || "Company";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!company) {
      setError("Company not found");
      return;
    }

    if (!email || !validateEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (isForgotPassword) {
      setLoading(true);
      try {
        // In LoginForm.tsx or AdminLoginForm.tsx
        const res = await fetch(`/api/auth/forgot-password?company=${company}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();

        if (data.success) {
          setMessage(data.message);
        } else {
          setError(data.message);
        }
      } catch {
        setError("Something went wrong. Please try again later.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/auth/login?company=${company}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        setUser(data.user);
        try {
          const onboardingRes = await fetch(
            `/api/onboarding?company=${encodeURIComponent(company)}`
          );
          const onboardingData = await onboardingRes.json();
          if (
            onboardingRes.ok &&
            onboardingData?.success &&
            onboardingData?.company?.setup_stage !== "LIVE"
          ) {
            router.push(`/setup?company=${encodeURIComponent(company)}`);
            return;
          }
        } catch {
          // Fall back
        }
        router.push(`/${company}/workspace`);
      } else {
        setError(data.message || "Login failed");
      }
    } catch {
      setError("Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-gray-50 to-blue-50 px-4 relative overflow-hidden">
      <div className="absolute w-[450px] h-[450px] bg-blue-300/20 rounded-full blur-3xl top-[-120px] left-[-100px]" />
      <div className="absolute w-[400px] h-[400px] bg-indigo-300/20 rounded-full blur-3xl bottom-[-120px] right-[-100px]" />
      <div className="relative z-10 w-full max-w-5xl grid md:grid-cols-2 bg-white/60 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden border border-white/30">
        {/* Left Side Branding */}
        <div className="hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-600 text-white p-12 relative overflow-hidden">
          <div className="absolute w-[300px] h-[300px] bg-white/10 rounded-full blur-3xl top-[-80px] left-[-60px]" />
          <div className="absolute w-[300px] h-[300px] bg-purple-300/20 rounded-full blur-3xl bottom-[-100px] right-[-60px]" />

          <h1 className="text-4xl font-bold tracking-wide z-10 mb-4">{displayCompanyName}</h1>

          <p className="text-blue-100 text-center max-w-sm z-10 mb-10 leading-relaxed">
            Manage customers, suppliers, inventory, purchases, GRN, sales and complete business operations in one unified platform.
          </p>

          <div className="flex flex-col items-center gap-6 z-10">
            <div className="flex -space-x-3">
              <div className="w-10 h-10 rounded-full bg-white text-blue-600 flex items-center justify-center shadow-lg text-lg">
                <ShoppingCartIcon className="h-7 w-7 text-blue-600" />
              </div>
              <div className="w-10 h-10 rounded-full bg-white text-purple-600 flex items-center justify-center shadow-lg text-lg">
                <CubeIcon className="h-7 w-7 text-blue-600" />
              </div>
              <div className="w-10 h-10 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-lg text-lg">
                <DocumentTextIcon className="h-7 w-7 text-blue-600" />
              </div>
              <div className="w-10 h-10 rounded-full bg-white text-pink-600 flex items-center justify-center shadow-lg text-lg">
                <CurrencyRupeeIcon className="h-7 w-7 text-blue-600" />
              </div>
            </div>

            <span className="text-sm text-blue-100 tracking-wide text-center">
              Purchase • Inventory • Billing • Accounting
            </span>
          </div>
        </div>

        {/* Right Side Form */}
        <div className="p-10 space-y-6">
          <div className="flex justify-center">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 text-white w-12 h-12 flex items-center justify-center rounded-xl shadow-md">
              <LockClosedIcon className="w-6 h-6 text-white" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-gray-800">
            {isForgotPassword ? "Reset Password" : "Welcome Back"}
          </h2>

          <p className="text-center text-gray-500">
            {isForgotPassword
              ? "Enter your email to receive a password reset link"
              : "Login to manage your business"}
          </p>

          {error && (
            <div className="bg-red-100 text-red-600 px-4 py-2 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm text-center">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="peer w-full px-4 pr-12 pt-5 pb-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white/70"
                placeholder=" "
              />
              <label className="absolute left-4 top-2 text-gray-500 text-sm peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-sm transition-all">
                Email
              </label>
              <HiMail
                size={20}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 peer-focus:text-blue-500"
              />
            </div>

            {/* Password Input - Hidden during Forgot Password */}
            {!isForgotPassword && (
              <>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="peer w-full px-4 pr-12 pt-5 pb-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white/70"
                    placeholder=" "
                  />
                  <label className="absolute left-4 top-2 text-gray-500 text-sm peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-sm transition-all">
                    Password
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 peer-focus:text-blue-500"
                  >
                    {showPassword ? <HiEyeOff size={20} /> : <HiEye size={20} />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError("");
                      setMessage("");
                    }}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Forgot Password?
                  </button>
                </div>
              </>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition"
            >
              {loading
                ? isForgotPassword
                  ? "Sending..."
                  : "Logging in..."
                : isForgotPassword
                  ? "Send Reset Link"
                  : "Sign In"}
            </button>
          </form>

          {/* Toggle Back to Login */}
          {isForgotPassword && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(false);
                  setError("");
                  setMessage("");
                }}
                className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 transition"
              >
                <HiArrowLeft size={14} /> Back to Sign In
              </button>
            </div>
          )}

          <div className="text-center text-gray-500 text-sm">
            © {year} {displayCompanyName}. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}