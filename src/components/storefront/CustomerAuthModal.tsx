"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { StorefrontTheme } from "./types";
import { useCustomerAuthStore, CustomerProfile } from "@/store/customerAuthStore";

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
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"signin" | "register" | "forgot">("signin");
  const [signinMethod, setSigninMethod] = useState<"password" | "otp">("password");
  const [otpStep, setOtpStep] = useState<"send" | "verify">("send");

  // Forgot password sub-flow state
  const [forgotStep, setForgotStep] = useState<"send" | "verify">("send");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState(["", "", "", "", "", ""]);
  const [forgotNewPassword, setForgotNewPassword] = useState("");

  // Eye icon toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

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
    if ((otpStep === "verify" || forgotStep === "verify") && resendTimer > 0) {
      interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [otpStep, forgotStep, resendTimer]);

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
    const activeCompany = getActiveCompany();
    const normalized: CustomerProfile = {
      id: customerData.id || customerData.customerId,
      name: customerData.name || customerData.cust_name || "Customer",
      email: customerData.email || "",
      phone: customerData.phone || "",
      cust_code: customerData.cust_code || "",
      cust_name: customerData.cust_name || customerData.name || "Customer",
      channel: customerData.channel || "ecom",
      addresses: customerData.addresses || [],
    };

    // Immediately update auth context & Zustand state
    setStoreCustomer(normalized);

    // Trigger instant router refresh for header / server components
    router.refresh();

    if (onSuccessAuth) {
      onSuccessAuth(normalized.name || normalized.email || normalized.phone || "Customer", normalized);
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
    const compSlug = getActiveCompany();
    const loginUrl = compSlug ? `/api/${compSlug}/storefront/auth/login` : "/api/ecom/auth/login";

    try {
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: compSlug,
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
    const compSlug = getActiveCompany();
    const registerUrl = compSlug ? `/api/${compSlug}/storefront/auth/register` : "/api/ecom/auth/register";

    try {
      const res = await fetch(registerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: compSlug,
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

  // 3. Send Login Phone/Email OTP Handler
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!identifier.trim()) {
      setErrorMessage("Please enter your phone number or email");
      return;
    }

    setLoading(true);
    const compSlug = getActiveCompany();
    const sendOtpUrl = compSlug ? `/api/${compSlug}/storefront/auth/send-otp` : "/api/storefront/auth/send-otp";

    try {
      const res = await fetch(sendOtpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: compSlug,
          identifier: identifier.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setOtpStep("verify");
        setResendTimer(30);
        setSuccessMessage(data.message || `OTP sent to ${identifier}`);
      } else {
        setErrorMessage(data.message || "Failed to send OTP.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Verify Login OTP Handler
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const code = otp.join("");
    if (code.length < 6) {
      setErrorMessage("Please enter the 6-digit verification code");
      return;
    }

    setLoading(true);
    const compSlug = getActiveCompany();
    const verifyOtpUrl = compSlug ? `/api/${compSlug}/storefront/auth/verify-otp` : "/api/storefront/auth/verify-otp";

    try {
      const res = await fetch(verifyOtpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: compSlug,
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

  // 5. Send Email OTP for Forgot Password
  const handleSendForgotEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!forgotEmail.trim() || !validateEmailFormat(forgotEmail.trim())) {
      setErrorMessage("Please enter a valid registered email address");
      return;
    }

    setLoading(true);
    const compSlug = getActiveCompany();
    const forgotUrl = `/api/${compSlug}/storefront/auth/forgot-password`;

    try {
      const res = await fetch(forgotUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        setForgotStep("verify");
        setResendTimer(60);
        setSuccessMessage(data.message || "A 6-digit verification code has been sent to your email.");
      } else {
        setErrorMessage(data.message || "Failed to dispatch password reset code.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to dispatch code.");
    } finally {
      setLoading(false);
    }
  };

  // 6. Verify Email OTP & Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const code = forgotOtp.join("");
    if (code.length < 6) {
      setErrorMessage("Please enter the complete 6-digit code received on your email");
      return;
    }

    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters long");
      return;
    }

    setLoading(true);
    const compSlug = getActiveCompany();
    const resetUrl = `/api/${compSlug}/storefront/auth/reset-password`;

    try {
      const res = await fetch(resetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          otp: code,
          password: forgotNewPassword,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMessage("Password reset successfully! Please sign in with your new password.");
        setTimeout(() => {
          setViewMode("signin");
          setSigninMethod("password");
          setIdentifier(forgotEmail);
          setPassword("");
          setForgotOtp(["", "", "", "", "", ""]);
          setForgotNewPassword("");
          setErrorMessage("");
        }, 1500);
      } else {
        setErrorMessage(data.message || "Invalid or expired verification code.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to reset password.");
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

  const handleForgotOtpChange = (index: number, val: string) => {
    if (val.length > 1) val = val[0];
    const newOtp = [...forgotOtp];
    newOtp[index] = val;
    setForgotOtp(newOtp);

    if (val && index < 5) {
      const nextInput = document.getElementById(`modal-forgot-otp-input-${index + 1}`);
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
              : viewMode === "register"
                ? "Create Customer Account"
                : forgotStep === "send"
                  ? "Reset Password"
                  : "Verify Email & New Password"}
          </h2>
          <p className="text-xs text-gray-500">
            {viewMode === "signin"
              ? otpStep === "verify" && signinMethod === "otp"
                ? `We sent a 6-digit verification code to ${identifier}`
                : "Access saved addresses, track orders, and view purchases."
              : viewMode === "register"
                ? "Register to save addresses and track your orders online."
                : forgotStep === "send"
                  ? "Enter your registered email address to receive a 6-digit reset code."
                  : `Enter the 6-digit code sent to ${forgotEmail}`}
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
            {/* <div className="flex justify-end">
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
            </div> */}

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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-700">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode("forgot");
                        setForgotStep("send");
                        setErrorMessage("");
                        setSuccessMessage("");
                        setForgotEmail(identifier.includes("@") ? identifier : "");
                      }}
                      className="text-2xs font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full rounded-xl border border-gray-200 pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  </div>
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
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password (min 6 characters) *</label>
                <div className="relative">
                  <input
                    type={showRegisterPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 pl-3.5 pr-10 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                    aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                  >
                    {showRegisterPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
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

        {/* ========================================================= */}
        {/* VIEW 3: FORGOT PASSWORD (EMAIL OTP) */}
        {/* ========================================================= */}
        {viewMode === "forgot" && (
          <div className="space-y-4">
            {forgotStep === "send" ? (
              <form onSubmit={handleSendForgotEmailOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Registered Email Address</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="your-registered-email@domain.com"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  />
                  <p className="text-2xs text-gray-400 mt-1">
                    We will send a secure 6-digit verification code to this email.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || !forgotEmail.trim()}
                  className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {loading ? "Sending Code..." : "Send Verification Code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2 text-center">
                    Enter 6-Digit Email Code
                  </label>
                  <div className="flex justify-center gap-2">
                    {forgotOtp.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`modal-forgot-otp-input-${idx}`}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleForgotOtpChange(idx, e.target.value)}
                        className="h-12 w-11 rounded-xl border border-gray-200 text-center text-lg font-bold text-gray-900 focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">New Password (min 6 characters)</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      required
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-gray-200 pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || forgotOtp.join("").length < 6 || forgotNewPassword.length < 6}
                  className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {loading ? "Updating Password..." : "Reset Password & Continue"}
                </button>

                <div className="flex justify-between items-center text-xs text-gray-500 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep("send")}
                    className="hover:underline cursor-pointer"
                  >
                    ← Change Email
                  </button>
                  {resendTimer > 0 ? (
                    <span>Resend in {resendTimer}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendForgotEmailOtp}
                      className="font-semibold hover:underline cursor-pointer"
                      style={{ color: theme.primaryColor }}
                    >
                      Resend Code
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* Back to Sign In */}
            <div className="text-center pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setViewMode("signin");
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                className="text-xs font-semibold text-gray-700 hover:underline cursor-pointer"
              >
                ← Return to Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerAuthModal;
