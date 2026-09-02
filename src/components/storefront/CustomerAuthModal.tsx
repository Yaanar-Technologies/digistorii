"use client";

import React, { useState, useEffect } from "react";
import { StorefrontTheme } from "./types";

export interface CustomerAuthModalProps {
  theme: StorefrontTheme;
  company?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccessAuth?: (customerIdentifier: string, customerData?: any) => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({
  theme,
  company,
  isOpen,
  onClose,
  onSuccessAuth,
}) => {
  const [mode, setMode] = useState<"login" | "register" | "otp_send" | "otp_verify">("login");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Form Fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resendTimer, setResendTimer] = useState(30);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (mode === "otp_verify" && resendTimer > 0) {
      interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [mode, resendTimer]);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage("");
      setSuccessMessage("");
      setLoading(false);
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const getActiveCompany = () => {
    if (company && company.trim()) return company.trim();
    if (typeof window !== "undefined") {
      const parts = window.location.pathname.split("/").filter(Boolean);
      if (parts.length > 0 && parts[0] !== "store" && parts[0] !== "checkout" && parts[0] !== "api") {
        return parts[0];
      }
    }
    return "";
  };

  const validatePhone = (ph: string) => {
    const clean = ph.replace(/\s+|-|\+/g, "");
    const ten = clean.length === 12 && clean.startsWith("91") ? clean.slice(2) : clean;
    return /^[6-9]\d{9}$/.test(ten);
  };

  const validateEmailFormat = (em: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
  };

  // 1. Password Login Handler
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!identifier.trim()) {
      setErrorMessage("Please enter your Phone Number or Email");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ecom/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: getActiveCompany(),
          identifier: identifier.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (data.success && data.customer) {
        if (onSuccessAuth) {
          onSuccessAuth(data.customer.name || data.customer.email || data.customer.phone, data.customer);
        }
        onClose();
      } else {
        setErrorMessage(data.message || "Invalid credentials. Please try again.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Register Handler
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!name.trim()) {
      setErrorMessage("Please enter your Full Name");
      return;
    }

    if (!validatePhone(phone)) {
      setErrorMessage("Please enter a valid 10-digit Indian phone number starting with 6-9");
      return;
    }

    if (!validateEmailFormat(email)) {
      setErrorMessage("Please enter a valid email address");
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ecom/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: getActiveCompany(),
          cust_name: name.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();
      if (data.success && data.customer) {
        if (onSuccessAuth) {
          onSuccessAuth(data.customer.name || name, data.customer);
        }
        onClose();
      } else {
        setErrorMessage(data.message || "Failed to register. Please try again.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Send OTP Handler
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!identifier.trim()) {
      setErrorMessage("Please enter your phone number or email");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/storefront/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: getActiveCompany(),
          identifier: identifier.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMode("otp_verify");
        setResendTimer(30);
        setSuccessMessage(data.sample_text || data.message || `OTP sent to ${identifier}`);
      } else {
        setErrorMessage(data.message || "Failed to send OTP.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Verify OTP Handler
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const code = otp.join("");
    if (code.length < 6) {
      setErrorMessage("Please enter the 6-digit verification code");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/storefront/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: getActiveCompany(),
          identifier: identifier.trim(),
          otp: code,
        }),
      });

      const data = await res.json();
      if (data.success && data.customer) {
        if (onSuccessAuth) {
          onSuccessAuth(data.customer.name || identifier, data.customer);
        }
        onClose();
      } else {
        setErrorMessage(data.message || "Invalid OTP code");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to verify OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) val = val[0];
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: theme.fontFamily }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-2xl z-10 space-y-5">
        {/* Close Icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1">
          {theme.logoUrl && (
            <img src={theme.logoUrl} alt="Store Logo" className="h-8 mx-auto object-contain mb-2" />
          )}
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {mode === "login"
              ? "Customer Sign In"
              : mode === "register"
                ? "Create Account"
                : mode === "otp_send"
                  ? "Sign In via One-Time Code"
                  : "Enter Verification Code"}
          </h2>
          <p className="text-xs text-gray-500">
            {mode === "otp_verify"
              ? `We sent a 6-digit code to ${identifier}`
              : "Access saved addresses, track orders, and wishlist items."}
          </p>
        </div>

        {/* Navigation Mode Switcher Tabs */}
        {mode !== "otp_verify" && (
          <div className="flex border-b border-gray-100 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 pb-2.5 text-center border-b-2 transition-colors cursor-pointer ${mode === "login" ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 pb-2.5 text-center border-b-2 transition-colors cursor-pointer ${mode === "register" ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => setMode("otp_send")}
              className={`flex-1 pb-2.5 text-center border-b-2 transition-colors cursor-pointer ${mode === "otp_send" ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
            >
              OTP Code
            </button>
          </div>
        )}

        {/* Alert Messages */}
        {errorMessage && (
          <div className="rounded-xl bg-red-50 p-3 text-xs text-red-600 font-medium border border-red-100">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-medium border border-emerald-100">
            {successMessage}
          </div>
        )}

        {/* Form 1: Password Login */}
        {mode === "login" && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number or Email</label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Phone (10-digit) or email@domain.com"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {loading ? "Signing In..." : "Sign In with Password"}
            </button>
          </form>
        )}

        {/* Form 2: Register / Create Account */}
        {mode === "register" && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ravi Sharma"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Indian Phone Number (10 digits)</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ravi@example.com"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Create Password (min 6 chars)</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {loading ? "Creating Account..." : "Create Customer Account"}
            </button>
          </form>
        )}

        {/* Form 3: OTP Send */}
        {mode === "otp_send" && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number or Email</label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="9876543210 or email@domain.com"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {loading ? "Sending Code..." : "Get One-Time Code (OTP)"}
            </button>
          </form>
        )}

        {/* Form 4: OTP Verify */}
        {mode === "otp_verify" && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="flex justify-center gap-2">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-input-${idx}`}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  className="h-12 w-11 rounded-xl border border-gray-200 text-center text-lg font-bold text-gray-900 focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={otp.join("").length < 6 || loading}
              className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {loading ? "Verifying..." : "Verify & Sign In"}
            </button>

            <div className="flex justify-between items-center text-xs text-gray-500 pt-2">
              <button
                type="button"
                onClick={() => setMode("otp_send")}
                className="hover:underline cursor-pointer"
              >
                Change Phone/Email
              </button>
              {resendTimer > 0 ? (
                <span>Resend in {resendTimer}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  className="font-semibold hover:underline cursor-pointer"
                  style={{ color: theme.primaryColor }}
                >
                  Resend OTP
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CustomerAuthModal;
