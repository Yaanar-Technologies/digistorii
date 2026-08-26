"use client";

import React, { useState, useEffect } from "react";
import { StorefrontTheme } from "./types";

export interface CustomerAuthModalProps {
  theme: StorefrontTheme;
  isOpen: boolean;
  onClose: () => void;
  onSuccessAuth?: (customerIdentifier: string) => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({
  theme,
  isOpen,
  onClose,
  onSuccessAuth,
}) => {
  const [step, setStep] = useState<"identifier" | "otp">("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resendTimer, setResendTimer] = useState(30);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === "otp" && resendTimer > 0) {
      interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  if (!isOpen) return null;

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setStep("otp");
    setResendTimer(30);
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) val = val[0];
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);

    // Auto focus next input
    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length === 6 && onSuccessAuth) {
      onSuccessAuth(identifier);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: theme.fontFamily }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-2xl z-10 space-y-6">
        {/* Close Icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2">
          {theme.logoUrl && (
            <img src={theme.logoUrl} alt="Store Logo" className="h-8 mx-auto object-contain mb-2" />
          )}
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {step === "identifier" ? "Customer Sign In" : "Enter Verification Code"}
          </h2>
          <p className="text-xs text-gray-500">
            {step === "identifier"
              ? "Sign in with your phone or email to track orders and save your wishlist."
              : `We sent a 6-digit code to ${identifier}`}
          </p>
        </div>

        {/* Step 1: Identifier Form */}
        {step === "identifier" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Phone Number or Email
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="+1 (555) 000-0000 or customer@email.com"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-white shadow-md transition-all hover:opacity-95"
              style={{ backgroundColor: theme.primaryColor }}
            >
              Get One-Time Code (OTP)
            </button>
          </form>
        ) : (
          /* Step 2: 6-Digit OTP Form */
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
              disabled={otp.join("").length < 6}
              className="w-full rounded-xl py-3 px-4 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50"
              style={{ backgroundColor: theme.primaryColor }}
            >
              Verify & Sign In
            </button>

            <div className="flex justify-between items-center text-xs text-gray-500 pt-2">
              <button
                type="button"
                onClick={() => setStep("identifier")}
                className="hover:underline"
              >
                Change Phone/Email
              </button>
              {resendTimer > 0 ? (
                <span>Resend in {resendTimer}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setResendTimer(30)}
                  className="font-semibold hover:underline"
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
