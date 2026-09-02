"use client";

import React, { useState, useEffect } from "react";
import { StorefrontTheme } from "./types";
import { useCustomerAuthStore } from "@/store/customerAuthStore";

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
  const [viewMode, setViewMode] = useState<"signin" | "register">("signin");
  const [signinMethod, setSigninMethod] = useState<"password" | "otp">("password");
  const [otpStep, setOtpStep] = useState<"send" | "verify">("send");

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

  const setStoreCustomer = useCustomerAuthStore((state) => state.setCustomer);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (otpStep === "verify" && resendTimer > 0) {
      interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [otpStep, resendTimer]);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage("");
      setSuccessMessage("");
      setLoading(false);
    }
  }, [isOpen, viewMode, signinMethod]);

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

  const handleAuthSuccess = (customerData: any) => {
    setStoreCustomer(customerData);
    if (onSuccessAuth) {
      onSuccessAuth(customerData.name || customerData.email || customerData.phone, customerData);
    }
    onClose();
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
        handleAuthSuccess(data.customer);
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
        handleAuthSuccess(data.customer);
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
        setOtpStep("verify");
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
        handleAuthSuccess(data.customer);
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
      const nextInput = document.getElementById(`modal-otp-input-${index + 1}`);
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
            {viewMode === "signin"
              ? signinMethod === "password"
                ? "Customer Sign In"
                : otpStep === "send"
                ? "Sign In with One-Time Code"
                : "Enter Verification Code"
              : "Create Customer Account"}
          </h2>
          <p className="text-xs text-gray-500">
            {viewMode === "signin"
              ? otpStep === "verify" && signinMethod === "otp"
                ? `We sent a 6-digit verification code to ${identifier}`
                : "Access saved addresses, track orders, and view purchases."
              : "Register to save addresses and track your orders online."}
          </p>
        </div>

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

        {/* ========================================================= */}
        {/* VIEW 1: SIGN IN (PASSWORD or OTP) */}
        {/* ========================================================= */}
        {viewMode === "signin" && (
          <div className="space-y-4">
            {/* Method Toggle inside Card */}
            <div className="flex justify-end">
              {signinMethod === "password" ? (
                <button
                  type="button"
                  onClick={() => {
                    setSigninMethod("otp");
                    setOtpStep("send");
                    setErrorMessage("");
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Use OTP Code instead →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSigninMethod("password");
                    setErrorMessage("");
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Use Password instead →
                </button>
              )}
            </div>

            {/* Sub-method A: Password Login Form */}
            {signinMethod === "password" && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
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

            {/* Sub-method B: OTP Flow */}
            {signinMethod === "otp" && (
              <>
                {otpStep === "send" ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number or Email</label>
                      <input
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="9876543210 or customer@domain.com"
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
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-5">
                    <div className="flex justify-center gap-2">
                      {otp.map((digit, idx) => (
                        <input
                          key={idx}
                          id={`modal-otp-input-${idx}`}
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
                        onClick={() => setOtpStep("send")}
                        className="hover:underline cursor-pointer"
                      >
                        ← Change Phone/Email
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
              </>
            )}

            {/* Footer Action Switch to Register */}
            <div className="text-center pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Don't have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setViewMode("register");
                  setErrorMessage("");
                }}
                className="text-xs font-bold text-gray-900 hover:underline cursor-pointer"
              >
                Create an account
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: REGISTER / CREATE ACCOUNT */}
        {/* ========================================================= */}
        {viewMode === "register" && (
          <div className="space-y-4">
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Indian Phone Number (10 digits) *</label>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Email Address *</label>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Password (min 6 characters) *</label>
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
                {loading ? "Creating Account..." : "Create Account"}
              </button>
            </form>

            {/* Footer Action Switch to Sign In */}
            <div className="text-center pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Already have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setViewMode("signin");
                  setErrorMessage("");
                }}
                className="text-xs font-bold text-gray-900 hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerAuthModal;
