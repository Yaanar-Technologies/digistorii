"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import Badge from "@/components/ui/badge/Badge";

// Indian states list for serviceable region
const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry", "Chandigarh"
];

export default function StoreSettingsPage() {
  const params = useParams();
  const company = params.company as string || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form states
  const [customDomain, setCustomDomain] = useState("");
  const [domainStatus, setDomainStatus] = useState("not_configured");
  const [paymentMode, setPaymentMode] = useState("cod_only");
  const [gatewayProvider, setGatewayProvider] = useState("");
  const [gatewayKeyId, setGatewayKeyId] = useState("");
  const [gatewayKeySecret, setGatewayKeySecret] = useState("");
  const [serviceableCountries, setServiceableCountries] = useState<string[]>(["India"]);
  const [serviceableStates, setServiceableStates] = useState<string[]>([]);
  const [pincodesInput, setPincodesInput] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [returnRefundPolicy, setReturnRefundPolicy] = useState("");
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [shippingFreeThreshold, setShippingFreeThreshold] = useState<number | string>(500);
  const [shippingFee, setShippingFee] = useState<number | string>(49);
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [useCustomPricing, setUseCustomPricing] = useState(false);
  const [useCustomDiscounts, setUseCustomDiscounts] = useState(false);
  const [setupStatus, setSetupStatus] = useState("incomplete");

  // Logistics & Courier States
  const [deliveryPartner, setDeliveryPartner] = useState("self");
  const [deliveryApiKey, setDeliveryApiKey] = useState("");
  const [deliveryApiSecret, setDeliveryApiSecret] = useState("");
  const [deliveryWebhookSecret, setDeliveryWebhookSecret] = useState("");
  const [pickupLocationCode, setPickupLocationCode] = useState("");
  const [defaultLengthCm, setDefaultLengthCm] = useState<number | string>(10);
  const [defaultWidthCm, setDefaultWidthCm] = useState<number | string>(10);
  const [defaultHeightCm, setDefaultHeightCm] = useState<number | string>(10);
  const [defaultWeightGrams, setDefaultWeightGrams] = useState<number | string>(500);

  // Masked/Credential state flags from server
  const [hasDeliveryApiKey, setHasDeliveryApiKey] = useState(false);
  const [hasDeliveryApiSecret, setHasDeliveryApiSecret] = useState(false);
  const [hasDeliveryWebhookSecret, setHasDeliveryWebhookSecret] = useState(false);

  // UI password visibility toggles
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  // Test Connection States
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!company) return;

    const fetchSettings = async () => {
      try {
        const res = await apiFetch("/api/company/ecom-settings", company);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.settings) {
            const s = data.settings;
            setCustomDomain(s.custom_domain || "");
            setDomainStatus(s.custom_domain_status || "not_configured");
            setPaymentMode(s.payment_mode || "cod_only");
            setGatewayProvider(s.gateway_provider || "");
            setGatewayKeyId(s.gateway_key_id || "");
            setGatewayKeySecret(s.gateway_key_secret_enc || "");
            setServiceableCountries(s.serviceable_countries || ["India"]);
            setServiceableStates(s.serviceable_states || []);
            setPincodesInput(s.serviceable_pincodes ? s.serviceable_pincodes.join(", ") : "");
            setTermsAndConditions(s.terms_and_conditions || "");
            setReturnRefundPolicy(s.return_refund_policy || "");
            setPrivacyPolicy(s.privacy_policy || "");
            setDeliveryNote(s.delivery_note || "");
            setShippingFreeThreshold(s.shipping_free_threshold !== undefined && s.shipping_free_threshold !== null ? s.shipping_free_threshold : 500);
            setShippingFee(s.shipping_fee !== undefined && s.shipping_fee !== null ? s.shipping_fee : 49);
            setSupportEmail(s.support_email || "");
            setSupportPhone(s.support_phone || "");
            setUseCustomPricing(s.use_custom_pricing === true);
            setUseCustomDiscounts(s.use_custom_discounts === true);
            setSetupStatus(s.setup_status || "incomplete");

            // Courier / Logistics settings
            setDeliveryPartner(s.delivery_partner || "self");
            setPickupLocationCode(s.pickup_location_code || "");
            setDefaultLengthCm(s.default_length_cm != null ? s.default_length_cm : 10);
            setDefaultWidthCm(s.default_width_cm != null ? s.default_width_cm : 10);
            setDefaultHeightCm(s.default_height_cm != null ? s.default_height_cm : 10);
            setDefaultWeightGrams(s.default_weight_grams != null ? s.default_weight_grams : 500);

            setHasDeliveryApiKey(s.has_delivery_api_key === true);
            setHasDeliveryApiSecret(s.has_delivery_api_secret === true);
            setHasDeliveryWebhookSecret(s.has_delivery_webhook_secret === true);
          }
        }
      } catch (err) {
        console.error("Failed to load storefront settings", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [company]);

  const handleStateToggle = (stateName: string) => {
    setServiceableStates(prev =>
      prev.includes(stateName)
        ? prev.filter(s => s !== stateName)
        : [...prev, stateName]
    );
  };

  const handleSelectAllStates = () => {
    if (serviceableStates.length === INDIAN_STATES.length) {
      setServiceableStates([]);
    } else {
      setServiceableStates([...INDIAN_STATES]);
    }
  };

  const handleVerifyDomain = async () => {
    if (!customDomain) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/company/ecom-settings", company, {
        method: "POST",
        body: JSON.stringify({
          custom_domain: customDomain,
          custom_domain_status: "verified"
        })
      });
      if (res.ok) {
        setDomainStatus("verified");
        setMessage({ type: "success", text: "Domain verified successfully!" });
      } else {
        setMessage({ type: "error", text: "Domain verification failed. Check your DNS records." });
      }
    } catch {
      setMessage({ type: "error", text: "An error occurred during domain verification." });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/api/company/ecom-settings/test-connection", company, {
        method: "POST",
        body: JSON.stringify({
          partner: deliveryPartner,
          delivery_api_key: deliveryApiKey || undefined,
          delivery_api_secret: deliveryApiSecret || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: data.message || "Connected to courier API successfully!",
        });
      } else {
        setTestResult({
          success: false,
          message: data.message || "Failed to authenticate with courier service.",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Network error while testing connection.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    // Parse pincodes
    const pincodes = pincodesInput
      ? pincodesInput.split(",").map(p => p.trim()).filter(p => p.length > 0)
      : null;

    const numThreshold = Math.max(0, parseFloat(String(shippingFreeThreshold)) || 0);
    const numFee = Math.max(0, parseFloat(String(shippingFee)) || 0);

    const numLength = Math.max(0.1, parseFloat(String(defaultLengthCm)) || 10);
    const numWidth = Math.max(0.1, parseFloat(String(defaultWidthCm)) || 10);
    const numHeight = Math.max(0.1, parseFloat(String(defaultHeightCm)) || 10);
    const numWeight = Math.max(1, parseFloat(String(defaultWeightGrams)) || 500);

    try {
      const res = await apiFetch("/api/company/ecom-settings", company, {
        method: "POST",
        body: JSON.stringify({
          payment_mode: paymentMode,
          gateway_provider: gatewayProvider,
          gateway_key_id: gatewayKeyId,
          gateway_key_secret_enc: gatewayKeySecret,
          serviceable_countries: serviceableCountries,
          serviceable_states: serviceableStates.length > 0 ? serviceableStates : null,
          serviceable_pincodes: pincodes,
          terms_and_conditions: termsAndConditions,
          return_refund_policy: returnRefundPolicy,
          privacy_policy: privacyPolicy,
          delivery_note: deliveryNote,
          shipping_free_threshold: numThreshold,
          shipping_fee: numFee,
          support_email: supportEmail,
          support_phone: supportPhone,
          use_custom_pricing: useCustomPricing,
          use_custom_discounts: useCustomDiscounts,
          custom_domain: customDomain,
          // Logistics Fields
          delivery_partner: deliveryPartner,
          delivery_api_key: deliveryApiKey ? deliveryApiKey.trim() : undefined,
          delivery_api_secret: deliveryApiSecret ? deliveryApiSecret.trim() : undefined,
          delivery_webhook_secret: deliveryWebhookSecret ? deliveryWebhookSecret.trim() : undefined,
          pickup_location_code: pickupLocationCode ? pickupLocationCode.trim() : null,
          default_length_cm: numLength,
          default_width_cm: numWidth,
          default_height_cm: numHeight,
          default_weight_grams: numWeight,
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSetupStatus(data.setup_status);
        setMessage({ type: "success", text: "Storefront and shipping settings saved successfully!" });
        if (deliveryApiKey) setHasDeliveryApiKey(true);
        if (deliveryApiSecret) setHasDeliveryApiSecret(true);
        if (deliveryWebhookSecret) setHasDeliveryWebhookSecret(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const errorData = await res.json();
        setMessage({ type: "error", text: errorData.message || "Failed to save settings." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Badge variant="light" color={setupStatus === "complete" ? "success" : "warning"}>
            Setup Status: {setupStatus.toUpperCase()}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">E-Commerce Storefront Settings</h1>
          <p className="text-sm text-gray-600">Configure domain, payments, regions, 3PL logistics, policies, and overrides for your storefront.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Storefront URL & Optional Custom Domain */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Storefront URL &amp; Custom Domain</h2>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Primary Storefront URL</p>
              <p className="text-sm font-mono font-semibold text-gray-900">
                {(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/{company}
              </p>
            </div>
            <a
              href={`/${company}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Open Storefront ↗
            </a>
          </div>
          <div className="grid gap-4 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <label className="block text-sm font-semibold text-gray-700">Custom Domain Name (Optional)</label>
              <input
                type="text"
                value={customDomain}
                onChange={e => setCustomDomain(e.target.value)}
                placeholder="e.g. pothys.com"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Optional custom domain (e.g. pothys.com). Leave empty to use your primary storefront URL.
              </p>
            </div>
            <div className="sm:col-span-4 flex items-end">
              {customDomain && domainStatus === "pending_dns" && (
                <button
                  type="button"
                  onClick={handleVerifyDomain}
                  className="w-full rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                >
                  Verify Domain DNS
                </button>
              )}
              {customDomain && domainStatus === "verified" && (
                <div className="w-full flex items-center justify-center bg-green-50 text-green-700 border border-green-200 rounded-md py-2 text-sm font-semibold">
                  Verified & Active
                </div>
              )}
              {customDomain && domainStatus === "failed" && (
                <div className="w-full flex items-center justify-center bg-red-50 text-red-700 border border-red-200 rounded-md py-2 text-sm font-semibold">
                  DNS Check Failed
                </div>
              )}
            </div>
          </div>

          {customDomain && domainStatus === "pending_dns" && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800 space-y-2">
              <p className="font-semibold">Required DNS configuration:</p>
              <p>Please log in to your DNS provider and add a <strong>CNAME</strong> record mapping your domain to the platform:</p>
              <div className="grid grid-cols-3 gap-2 bg-white p-3 border rounded text-xs font-mono">
                <div><strong>Host/Name</strong>: store</div>
                <div><strong>Type</strong>: CNAME</div>
                <div><strong>Target/Value</strong>: cname.digistorii.com</div>
              </div>
            </div>
          )}
        </div>

        {/* Payment Gateway Configurations */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Payment Configuration</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700">Payment Modes Accepted</label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="cod_only">Cash on Delivery (COD) Only</option>
                <option value="prepaid_only">Prepaid Online Only</option>
                <option value="both">Both (COD & Prepaid Online)</option>
              </select>
            </div>

            {paymentMode !== "cod_only" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700">Payment Gateway Provider</label>
                <input
                  type="text"
                  value={gatewayProvider}
                  onChange={e => setGatewayProvider(e.target.value)}
                  placeholder="e.g. Razorpay, Stripe"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {paymentMode !== "cod_only" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Gateway Key ID</label>
                <input
                  type="text"
                  value={gatewayKeyId}
                  onChange={e => setGatewayKeyId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">Gateway Key Secret (Encrypted)</label>
                <input
                  type="password"
                  value={gatewayKeySecret}
                  onChange={e => setGatewayKeySecret(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Logistics & Shipping Integration Section */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-3 gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Logistics & Courier Integration</h2>
              <p className="text-xs text-gray-500">Connect carrier API credentials to automatically generate AWBs, fetch labels, and receive real-time webhook updates.</p>
            </div>
            {deliveryPartner !== "self" && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {testingConnection ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Testing Connection...
                  </>
                ) : (
                  "Test Connection"
                )}
              </button>
            )}
          </div>

          {testResult && (
            <div
              className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
                testResult.success
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {testResult.success ? (
                <svg className="h-5 w-5 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Provider Selection */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700">Fulfillment Partner</label>
              <select
                value={deliveryPartner}
                onChange={e => {
                  setDeliveryPartner(e.target.value);
                  setTestResult(null);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="self">Self Delivery / In-House Fleet</option>
                <option value="shiprocket">Shiprocket (Multi-Courier Aggregator)</option>
                <option value="delhivery">Delhivery Direct Express API</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {deliveryPartner === "self" && "Orders are fulfilled manually by store drivers without carrier API calls."}
                {deliveryPartner === "shiprocket" && "Auto-books shipments, assigns AWBs, and generates shipping labels via Shiprocket external API."}
                {deliveryPartner === "delhivery" && "Dispatches directly via Delhivery surface & express logistics network."}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700">Pickup Location Code</label>
              <input
                type="text"
                value={pickupLocationCode}
                onChange={e => setPickupLocationCode(e.target.value)}
                placeholder={deliveryPartner === "shiprocket" ? "e.g. Primary (Registered Warehouse Name)" : "e.g. Main Warehouse"}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">Must match the registered pickup warehouse location code in your courier portal.</p>
            </div>
          </div>

          {/* Courier Credentials (Only for Shiprocket / Delhivery) */}
          {deliveryPartner !== "self" && (
            <div className="space-y-4 rounded-lg bg-gray-50 p-4 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-800">
                {deliveryPartner === "shiprocket" ? "Shiprocket Credentials" : "Delhivery Credentials"}
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">
                    {deliveryPartner === "shiprocket" ? "Shiprocket Account Email (API Key)" : "Delhivery API Token"}
                    {hasDeliveryApiKey && !deliveryApiKey && (
                      <span className="ml-2 text-xs font-normal text-green-600">✓ Stored Encrypted</span>
                    )}
                  </label>
                  <div className="relative mt-1">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={deliveryApiKey}
                      onChange={e => setDeliveryApiKey(e.target.value)}
                      placeholder={hasDeliveryApiKey ? "•••••••••••• (Leave blank to keep current)" : deliveryPartner === "shiprocket" ? "email@domain.com" : "Token string"}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-500 hover:text-gray-700"
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {deliveryPartner === "shiprocket" && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700">
                      Shiprocket Password (API Secret)
                      {hasDeliveryApiSecret && !deliveryApiSecret && (
                        <span className="ml-2 text-xs font-normal text-green-600">✓ Stored Encrypted</span>
                      )}
                    </label>
                    <div className="relative mt-1">
                      <input
                        type={showApiSecret ? "text" : "password"}
                        value={deliveryApiSecret}
                        onChange={e => setDeliveryApiSecret(e.target.value)}
                        placeholder={hasDeliveryApiSecret ? "•••••••••••• (Leave blank to keep current)" : "Account Password"}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiSecret(!showApiSecret)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-500 hover:text-gray-700"
                      >
                        {showApiSecret ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">
                  Webhook Secret Token
                  {hasDeliveryWebhookSecret && !deliveryWebhookSecret && (
                    <span className="ml-2 text-xs font-normal text-green-600">✓ Stored Encrypted</span>
                  )}
                </label>
                <div className="relative mt-1">
                  <input
                    type={showWebhookSecret ? "text" : "password"}
                    value={deliveryWebhookSecret}
                    onChange={e => setDeliveryWebhookSecret(e.target.value)}
                    placeholder={hasDeliveryWebhookSecret ? "•••••••••••• (Leave blank to keep current)" : "Secret token for signature verification"}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-500 hover:text-gray-700"
                  >
                    {showWebhookSecret ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Configure this secret in your courier webhook settings alongside webhook URL: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">/api/{company}/ecom/webhooks/delivery</code>
                </p>
              </div>
            </div>
          )}

          {/* Default Package Dimensions & Weight */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">Default Package Dimensions & Dead Weight</h3>
            <p className="text-xs text-gray-500 mb-3">Applied automatically as baseline fallback for items missing physical dimensions to compute volumetric shipping rates.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600">Length (cm)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={defaultLengthCm}
                  onChange={e => setDefaultLengthCm(e.target.value)}
                  placeholder="10.0"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600">Width (cm)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={defaultWidthCm}
                  onChange={e => setDefaultWidthCm(e.target.value)}
                  placeholder="10.0"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600">Height (cm)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={defaultHeightCm}
                  onChange={e => setDefaultHeightCm(e.target.value)}
                  placeholder="10.0"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600">Dead Weight (grams)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={defaultWeightGrams}
                  onChange={e => setDefaultWeightGrams(e.target.value)}
                  placeholder="500"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Serviceable Regions */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Serviceable Regions</h2>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Serviceable Countries</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
                India
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-gray-700">Serviceable States (India)</label>
              <button
                type="button"
                onClick={handleSelectAllStates}
                className="text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                {serviceableStates.length === INDIAN_STATES.length ? "Deselect All" : "Select All States"}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
              {INDIAN_STATES.map(state => {
                const isSelected = serviceableStates.includes(state);
                return (
                  <label key={state} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleStateToggle(state)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    {state}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">Serviceable Pincodes</label>
            <textarea
              rows={3}
              value={pincodesInput}
              onChange={e => setPincodesInput(e.target.value)}
              placeholder="e.g. 560001, 560002, 560003 (Comma-separated values)"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">Provide specific pincodes you deliver to. Leave blank to deliver to all selected states.</p>
          </div>
        </div>

        {/* Storefront Override Options */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Pricing & Discount Config</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomPricing}
                onChange={e => setUseCustomPricing(e.target.checked)}
                className="mt-1 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span className="block text-sm font-semibold text-gray-900">Enable Custom E-Commerce Pricing overrides</span>
                <span className="block text-xs text-gray-500">When enabled, you can override variants selling prices on the storefront separately from POS.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomDiscounts}
                onChange={e => setUseCustomDiscounts(e.target.checked)}
                className="mt-1 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span className="block text-sm font-semibold text-gray-900">Enable E-Commerce Discount tagging overrides</span>
                <span className="block text-xs text-gray-500">When enabled, you can customize which discounts apply to the storefront vs. POS.</span>
              </div>
            </label>
          </div>
        </div>

        {/* Support & Policies */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Support & Legal Policies</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700">Support Email Address</label>
              <input
                type="email"
                value={supportEmail}
                onChange={e => setSupportEmail(e.target.value)}
                placeholder="support@mydomain.com"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Support Phone Number</label>
              <input
                type="text"
                value={supportPhone}
                onChange={e => setSupportPhone(e.target.value)}
                placeholder="+91 99999 99999"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">Terms & Conditions</label>
            <textarea
              rows={4}
              value={termsAndConditions}
              onChange={e => setTermsAndConditions(e.target.value)}
              placeholder="Provide store terms and conditions"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">Return & Refund Policy</label>
            <textarea
              rows={4}
              value={returnRefundPolicy}
              onChange={e => setReturnRefundPolicy(e.target.value)}
              placeholder="Provide refund policy details"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">Privacy Policy</label>
            <textarea
              rows={4}
              value={privacyPolicy}
              onChange={e => setPrivacyPolicy(e.target.value)}
              placeholder="Provide privacy policy details"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">Delivery Instructions</label>
            <textarea
              rows={4}
              value={deliveryNote}
              onChange={e => setDeliveryNote(e.target.value)}
              placeholder="Provide Delivery Instructions"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Shipping & Delivery Configuration */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Shipping & Delivery Charges</h2>
          <p className="text-xs text-gray-500">Configure free shipping thresholds and standard base shipping rates. Negative values are not permitted.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700">
                Free Shipping Threshold (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={shippingFreeThreshold}
                onChange={e => {
                  const val = e.target.value === "" ? "" : Math.max(0, parseFloat(e.target.value) || 0);
                  setShippingFreeThreshold(val);
                }}
                placeholder="500.00"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">Cart subtotal amount required for customers to qualify for free delivery.</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">
                Shipping Cost / Base Fee (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={shippingFee}
                onChange={e => {
                  const val = e.target.value === "" ? "" : Math.max(0, parseFloat(e.target.value) || 0);
                  setShippingFee(val);
                }}
                placeholder="49.00"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">Standard base shipping charge applied when the cart is below the free shipping threshold.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-600 focus:outline-none disabled:opacity-50"
          >
            {saving ? "Saving Settings..." : "Save E-Commerce Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
