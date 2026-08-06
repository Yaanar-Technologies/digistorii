"use client";
// gstin format -33 AAAAA1111A1Z5
import { FormEvent, useEffect, useMemo, useState } from "react";
import { City, Country, State } from "country-state-city";
import Pricing from "@/components/landing/Pricing";
import { TrashIcon } from "@heroicons/react/24/outline";
import {
  persistSelectedPlan,
  readPersistedSelectedPlan,
  type PlanOption,
} from "@/components/landing/Pricing";
import { HiEye, HiEyeOff, HiMail, HiHome } from "react-icons/hi";
import Link from "next/link";
import {
  BillingInterval,
  ONBOARDING_STEPS,
  PLAN_CONFIG,
  SetupStage,
  getNextStepNumber,
  normalizeBillingInterval,
} from "@/lib/onboarding";
import {
  GSTIN_MAX_LENGTH,
  extractPanFromGstin,
  getDefaultCurrencyCodeForCountry,
  getGstStateCodeForState,
  isValidGstin,
  isValidPan,
  normalizeGstin,
  normalizePan,
} from "@/lib/onboardingBusiness";

type WizardProps = {
  company: string;
  initialPlanId?: number | null;
  initialBillingInterval?: BillingInterval;
};

type StaffMember = {
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  responsibility_id: string;
  location_id: string;
  warehouse_id: string;
};

type LocationOption = {
  id: number;
  name: string;
};

type WarehouseOption = {
  id: number;
  name: string;
  location_id: number;
};

type CurrencyOption = {
  id: number;
  currency_code: string;
  currency_name: string;
};

type ResponsibilityOption = {
  id: number;
  responsibility_name: string;
};

type LocationSetupForm = {
  name: string;
  type: "global" | "local";
  inactive_date: string;
  same_as_registered: boolean;
  same_as_bill_to: boolean;
  description: string;
  registered_address_line_1: string;
  registered_address_line_2: string;
  registered_country: string;
  registered_state: string;
  registered_city: string;
  registered_pincode: string;
  bill_address_line_1: string;
  bill_address_line_2: string;
  bill_country: string;
  bill_state: string;
  bill_city: string;
  bill_pincode: string;
  ship_address_line_1: string;
  ship_address_line_2: string;
  ship_country: string;
  ship_state: string;
  ship_city: string;
  ship_pincode: string;
  landline: string;
  mobile: string;
  fax: string;
  email: string;
  contact_person: string;
  is_default: boolean;
};

type WarehouseSetupForm = {
  code: string;
  name: string;
  location_id: string;
  type: "global" | "local";
  address: string;
  effective_from: string;
  effective_to: string;
  description: string;
  landline: string;
  mobile_no: string;
  fax: string;
  email: string;
  contact_person_name: string;
  contact_person_mobile: string;
  contact_person_email: string;
  pan: string;
  gstin: string;
  is_default: boolean;
};

type StatusResponse = {
  success: boolean;
  company?: {
    id: number;
    name: string;
    slug: string;
    setup_stage: SetupStage;
    next_step: number;
    owner_phone?: string | null;
    phone_verified?: boolean;
  };
  subscription?: {
    plan_code: string;
    plan_id?: number;
    plan_name?: string;
    ecommerce_access: boolean;
    max_users: number;
    max_locations: number;
    max_warehouses: number;
    status: string;
    billing_interval?: BillingInterval;
    amount?: number;
  } | null;
  business_settings?: {
    gst_number?: string | null;
    pan_number?: string | null;
    business_address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    currency?: string | null;
    timezone?: string | null;
    invoice_prefix?: string | null;
  } | null;
  counts?: {
    locations: number;
    warehouses: number;
    users: number;
  };
  message?: string;
};

type SaveResponse = {
  success: boolean;
  setup_stage?: SetupStage;
  next_step?: number;
  subscription?: {
    plan_code: string;
    plan_id?: number;
    plan_name?: string;
    ecommerce_access: boolean;
    max_users: number;
    max_locations: number;
    max_warehouses: number;
    status: string;
    billing_interval?: BillingInterval;
    amount?: number;
  } | null;
  message?: string;
};

type CreateOrderResponse = {
  success: boolean;
  order?: {
    id: string;
    amount: number;
    currency: string;
  };
  payment?: {
    id: number;
  };
  billing_interval?: BillingInterval;
  amount_inr?: number;
  message?: string;
};

type RazorpayHandlerResponse = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayHandlerResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
  theme?: {
    color: string;
  };
};

type RazorpayInstance = {
  open: () => void;
  on: (
    event: "payment.failed",
    handler: (response: { error?: { description?: string; reason?: string } }) => void
  ) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

const defaultBusinessSettings = {
  gst_number: "",
  pan_number: "",
  business_address: "",
  city: "",
  state: "",
  country: "India",
  currency: "INR",
  timezone: "Asia/Kolkata",
  invoice_prefix: "INV",
};

const defaultWarehouse: WarehouseSetupForm = {
  code: "",
  name: "",
  location_id: "",
  type: "global",
  address: "",
  effective_from: "",
  effective_to: "",
  description: "",
  landline: "",
  mobile_no: "",
  fax: "",
  email: "",
  contact_person_name: "",
  contact_person_mobile: "",
  contact_person_email: "",
  pan: "",
  gstin: "",
  is_default: true,
};

const defaultLocation: LocationSetupForm = {
  name: "",
  type: "global",
  inactive_date: "",
  same_as_registered: false,
  same_as_bill_to: false,
  description: "",
  registered_address_line_1: "",
  registered_address_line_2: "",
  registered_country: "India",
  registered_state: "",
  registered_city: "",
  registered_pincode: "",
  bill_address_line_1: "",
  bill_address_line_2: "",
  bill_country: "India",
  bill_state: "",
  bill_city: "",
  bill_pincode: "",
  ship_address_line_1: "",
  ship_address_line_2: "",
  ship_country: "India",
  ship_state: "",
  ship_city: "",
  ship_pincode: "",
  landline: "",
  mobile: "",
  fax: "",
  email: "",
  contact_person: "",
  is_default: true,
};

const loadRazorpayScript = () => {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;

    const timeout = setTimeout(() => resolve(false), 6000);
    script.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    script.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };

    document.body.appendChild(script);
  });
};

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="min-w-[900px] grid gap-3"
        style={{ gridTemplateColumns: `repeat(${ONBOARDING_STEPS.length}, minmax(0, 1fr))` }}
      >
        {ONBOARDING_STEPS.map((step) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          return (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${isCompleted
                  ? "bg-green-600 text-white"
                  : isCurrent
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-600"
                  }`}
              >
                {step.id}
              </div>
              <span
                className={`text-xs font-semibold ${isCurrent ? "text-blue-700" : isCompleted ? "text-green-700" : "text-gray-500"
                  }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDefaultResponsibilityId(options: ResponsibilityOption[]) {
  const preferred =
    options.find((option) => option.responsibility_name === "Sales Person") || options[0];
  return preferred ? String(preferred.id) : "";
}

export default function OnboardingWizard({
  company,
  initialPlanId = null,
  initialBillingInterval = "monthly",
}: WizardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // const [stage, setStage] = useState<SetupStage>("ACCOUNT_CREATED");
  const [currentStep, setCurrentStep] = useState(2);
  const persistedPlan = readPersistedSelectedPlan();
  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(
    persistedPlan && (!initialPlanId || persistedPlan.plan_id === initialPlanId) ? persistedPlan : null
  );
  const [selectedBillingInterval, setSelectedBillingInterval] =
    useState<BillingInterval>(initialBillingInterval);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [ownerPhone, setOwnerPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseOption[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [responsibilityOptions, setResponsibilityOptions] = useState<ResponsibilityOption[]>([]);
  const [subscription, setSubscription] = useState<StatusResponse["subscription"]>(null);
  const [businessSettings, setBusinessSettings] = useState(defaultBusinessSettings);
  const [gstAvailable, setGstAvailable] = useState(false);
  const [isPanManuallyEdited, setIsPanManuallyEdited] = useState(false);
  const [location, setLocation] = useState(defaultLocation);
  const [warehouse, setWarehouse] = useState(defaultWarehouse);
  const [modeInput, setModeInput] = useState("");
  const [staffUsers, setStaffUsers] = useState<StaffMember[]>([]);
  const [companyName, setCompanyName] = useState(company);
  const [stage, setStage] = useState("PENDING");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSentButNotVerifiedYet, setEmailSentButNotVerifiedYet] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const planLimits = useMemo(() => {
    if (subscription) {
      return {
        maxUsers: subscription.max_users,
        maxLocations: subscription.max_locations,
        maxWarehouses: subscription.max_warehouses,
        ecommerceAccess: subscription.ecommerce_access,
      };
    }
    return {
      maxUsers: PLAN_CONFIG.BASIC.max_users,
      maxLocations: PLAN_CONFIG.BASIC.max_locations,
      maxWarehouses: PLAN_CONFIG.BASIC.max_warehouses,
      ecommerceAccess: PLAN_CONFIG.BASIC.ecommerce_access,
    };
  }, [subscription]);

  const countryOptions = useMemo(() => Country.getAllCountries(), []);

  // 1. Fallback to an explicit 'IN' configuration object if the lookup fails
  const selectedBusinessCountry = useMemo(() => {
    const found = countryOptions.find((entry) => entry.name === businessSettings.country);
    return found || { isoCode: "IN", name: "India" };
  }, [countryOptions, businessSettings.country]);

  // 2. States will now accurately load using "IN" no matter what
  const businessStateOptions = useMemo(() => {
    return State.getStatesOfCountry(selectedBusinessCountry.isoCode || "IN");
  }, [selectedBusinessCountry]);

  const selectedBusinessState = useMemo(() => {
    return businessStateOptions.find((entry) => entry.name === businessSettings.state);
  }, [businessStateOptions, businessSettings.state]);

  // 3. Cities will populate smoothly
  const businessCityOptions = useMemo(() => {
    return selectedBusinessCountry && selectedBusinessState
      ? City.getCitiesOfState(selectedBusinessCountry.isoCode || "IN", selectedBusinessState.isoCode)
      : [];
  }, [selectedBusinessCountry, selectedBusinessState]);
  const businessGstStateCode = useMemo(
    () => getGstStateCodeForState(businessSettings.state),
    [businessSettings.state]
  );

  const formatGstinInput = (value: string, stateCode?: string | null) => {
    const rawValue = String(value || "").toUpperCase();
    if (!stateCode) return rawValue;

    const suffix = rawValue.startsWith(stateCode)
      ? rawValue.slice(2)
      : /^\d{2}/.test(rawValue)
        ? rawValue.slice(2)
        : rawValue;

    return `${stateCode}${suffix}`;
  };

  const businessGstSuffix = useMemo(() => {
    if (businessGstStateCode && businessSettings.gst_number.startsWith(businessGstStateCode)) {
      return businessSettings.gst_number.slice(2);
    }
    return businessSettings.gst_number;
  }, [businessGstStateCode, businessSettings.gst_number]);

  const isBusinessGstValid = useMemo(
    () => gstAvailable && isValidGstin(businessSettings.gst_number),
    [gstAvailable, businessSettings.gst_number]
  );

  const shouldShowBusinessGstError =
    gstAvailable && businessGstSuffix.length > 0 && !isBusinessGstValid;
  useEffect(() => {
    if (!gstAvailable) {
      setBusinessSettings((prev) => ({
        ...prev,
        gst_number: "",
        pan_number: "",
      }));
    }
  }, [gstAvailable]);

  const selectedRegisteredCountry = useMemo(
    () => countryOptions.find((entry) => entry.name === location.registered_country),
    [countryOptions, location.registered_country]
  );
  const registeredStateOptions = useMemo(
    () =>
      selectedRegisteredCountry
        ? State.getStatesOfCountry(selectedRegisteredCountry.isoCode)
        : [],
    [selectedRegisteredCountry]
  );
  const selectedRegisteredState = useMemo(
    () => registeredStateOptions.find((entry) => entry.name === location.registered_state),
    [registeredStateOptions, location.registered_state]
  );
  const registeredCityOptions = useMemo(
    () =>
      selectedRegisteredCountry && selectedRegisteredState
        ? City.getCitiesOfState(selectedRegisteredCountry.isoCode, selectedRegisteredState.isoCode)
        : [],
    [selectedRegisteredCountry, selectedRegisteredState]
  );
  const selectedBillCountry = useMemo(
    () => countryOptions.find((entry) => entry.name === location.bill_country),
    [countryOptions, location.bill_country]
  );
  const billStateOptions = useMemo(
    () => (selectedBillCountry ? State.getStatesOfCountry(selectedBillCountry.isoCode) : []),
    [selectedBillCountry]
  );
  const selectedBillState = useMemo(
    () => billStateOptions.find((entry) => entry.name === location.bill_state),
    [billStateOptions, location.bill_state]
  );
  const billCityOptions = useMemo(
    () =>
      selectedBillCountry && selectedBillState
        ? City.getCitiesOfState(selectedBillCountry.isoCode, selectedBillState.isoCode)
        : [],
    [selectedBillCountry, selectedBillState]
  );
  const selectedShipCountry = useMemo(
    () => countryOptions.find((entry) => entry.name === location.ship_country),
    [countryOptions, location.ship_country]
  );
  const shipStateOptions = useMemo(
    () => (selectedShipCountry ? State.getStatesOfCountry(selectedShipCountry.isoCode) : []),
    [selectedShipCountry]
  );
  const selectedShipState = useMemo(
    () => shipStateOptions.find((entry) => entry.name === location.ship_state),
    [shipStateOptions, location.ship_state]
  );
  const shipCityOptions = useMemo(
    () =>
      selectedShipCountry && selectedShipState
        ? City.getCitiesOfState(selectedShipCountry.isoCode, selectedShipState.isoCode)
        : [],
    [selectedShipCountry, selectedShipState]
  );

  const loadStatus = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/onboarding?company=${encodeURIComponent(company)}`, {
        headers: { "x-tenant": company },
      });
      const data = (await res.json()) as StatusResponse;
      if (!res.ok || !data.success || !data.company) {
        setError(data?.message || "Unable to load onboarding status");
        return;
      }

      setCompanyName(data.company.name || company);
      setCompanyId(data.company.id);
      setOwnerPhone(data.company.owner_phone || "");
      setPhoneVerified(Boolean(data.company.phone_verified));
      setStage(data.company.setup_stage);
      setCurrentStep(data.company.next_step || getNextStepNumber(data.company.setup_stage));
      setSubscription(data.subscription || null);
      if (data.subscription?.plan_id) {
        setSelectedPlan({
          plan_id: Number(data.subscription.plan_id),
          plan_name: data.subscription.plan_name || data.subscription.plan_code,
          amount: Number(data.subscription.amount || 0),
          price: Number(data.subscription.amount || 0),
          billing_cycle: normalizeBillingInterval(data.subscription.billing_interval),
          billing_period:
            normalizeBillingInterval(data.subscription.billing_interval) === "yearly"
              ? "Yearly"
              : "Monthly",
          features: [],
        });
      } else if (initialPlanId && !selectedPlan) {
        setSelectedPlan({
          plan_id: initialPlanId,
          plan_name: "",
          amount: 0,
          price: 0,
          billing_cycle: initialBillingInterval,
          billing_period: initialBillingInterval === "yearly" ? "Yearly" : "Monthly",
          features: [],
        });
      }
      if (data.subscription?.billing_interval) {
        setSelectedBillingInterval(normalizeBillingInterval(data.subscription.billing_interval));
      }
      if (data.business_settings) {
        const nextGstNumber = data.business_settings.gst_number || "";
        const nextPanNumber = data.business_settings.pan_number || "";
        const extractedPan = nextGstNumber.length === GSTIN_MAX_LENGTH ? extractPanFromGstin(nextGstNumber) : "";
        setBusinessSettings({
          gst_number: nextGstNumber,
          pan_number: nextPanNumber,
          business_address: data.business_settings.business_address || "",
          city: data.business_settings.city || "",
          state: data.business_settings.state || "",
          country: data.business_settings.country || "",
          currency: data.business_settings.currency || "INR",
          timezone: data.business_settings.timezone || "Asia/Kolkata",
          invoice_prefix: data.business_settings.invoice_prefix || "INV",
        });
        setGstAvailable(Boolean(nextGstNumber || nextPanNumber));
        setIsPanManuallyEdited(Boolean(nextPanNumber && extractedPan && nextPanNumber !== extractedPan));
      }
    } catch {
      setError("Unable to load onboarding status.");
    } finally {
      setLoading(false);
    }
  };

  const loadCurrencyOptions = async () => {
    try {
      const res = await fetch("/api/currencies", {
        headers: { "x-tenant": company },
      });
      const data = (await res.json()) as {
        success?: boolean;
        data?: Array<{ id: number; currency_code: string; currency_name: string }>;
      };
      if (!res.ok || !data?.success || !Array.isArray(data.data)) {
        return;
      }
      setCurrencyOptions(
        data.data.map((entry) => ({
          id: Number(entry.id),
          currency_code: String(entry.currency_code || ""),
          currency_name: String(entry.currency_name || ""),
        }))
      );
    } catch {
      return;
    }
  };

  const loadResponsibilityOptions = async () => {
    try {
      const res = await fetch("/api/user-responsibilities", {
        headers: { "x-tenant": company },
      });
      const data = (await res.json()) as {
        success?: boolean;
        data?: Array<{ id: number; responsibility_name: string }>;
      };
      if (!res.ok || !data?.success || !Array.isArray(data.data)) {
        return;
      }
      setResponsibilityOptions(
        data.data.map((entry) => ({
          id: Number(entry.id),
          responsibility_name: String(entry.responsibility_name || ""),
        }))
      );
    } catch {
      return;
    }
  };

  const loadLocationOptions = async () => {
    try {
      const res = await fetch("/api/locations", {
        headers: { "x-tenant": company },
      });
      const data = (await res.json()) as { success?: boolean; data?: Array<{ id: number; name: string }> };
      if (!res.ok || !data?.success || !Array.isArray(data.data)) {
        return;
      }
      const options = data.data.map((entry) => ({
        id: Number(entry.id),
        name: String(entry.name || ""),
      }));
      setLocationOptions(options);
    } catch {
      return;
    }
  };

  const loadWarehouseOptions = async () => {
    try {
      const res = await fetch("/api/warehouses", {
        headers: { "x-tenant": company },
      });
      const data = (await res.json()) as {
        success?: boolean;
        data?: Array<{ id: number; name: string; location_id: number }>;
      };
      if (!res.ok || !data?.success || !Array.isArray(data.data)) {
        return;
      }
      const options = data.data.map((entry) => ({
        id: Number(entry.id),
        name: String(entry.name || ""),
        location_id: Number(entry.location_id),
      }));
      setWarehouseOptions(options);
    } catch {
      return;
    }
  };

  useEffect(() => {
    loadStatus();
    loadLocationOptions();
    loadWarehouseOptions();
    loadCurrencyOptions();
    loadResponsibilityOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  useEffect(() => {
    if (!warehouse.location_id && locationOptions.length > 0) {
      setWarehouse((prev) => ({ ...prev, location_id: String(locationOptions[0].id) }));
    }
  }, [locationOptions, warehouse.location_id]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setOtpCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [otpCooldown]);


  useEffect(() => {
    const defaultLocationId = locationOptions[0] ? String(locationOptions[0].id) : "";
    const defaultWarehouseId = warehouseOptions[0] ? String(warehouseOptions[0].id) : "";
    const defaultResponsibilityId = getDefaultResponsibilityId(responsibilityOptions);
    if (!defaultLocationId && !defaultWarehouseId && !defaultResponsibilityId) return;

    setStaffUsers((prev) =>
      prev.map((member) => {
        const locationId = member.location_id || defaultLocationId;
        const warehouseForLocation = warehouseOptions.find(
          (warehouseOption) => String(warehouseOption.location_id) === String(locationId)
        );
        return {
          ...member,
          responsibility_id: member.responsibility_id || defaultResponsibilityId,
          location_id: locationId,
          warehouse_id:
            member.warehouse_id ||
            (warehouseForLocation ? String(warehouseForLocation.id) : defaultWarehouseId),
        };
      })
    );
  }, [locationOptions, warehouseOptions, responsibilityOptions]);

  const getNextPanValue = (gstNumber: string, currentPan: string, panEdited: boolean) => {
    if (panEdited) return currentPan;
    return gstNumber.length === GSTIN_MAX_LENGTH ? extractPanFromGstin(gstNumber) : "";
  };

  const copyRegisteredToBill = (form: LocationSetupForm): LocationSetupForm => ({
    ...form,
    bill_address_line_1: form.registered_address_line_1,
    bill_address_line_2: form.registered_address_line_2,
    bill_country: form.registered_country,
    bill_state: form.registered_state,
    bill_city: form.registered_city,
    bill_pincode: form.registered_pincode,
  });

  const copyBillToShip = (form: LocationSetupForm): LocationSetupForm => ({
    ...form,
    ship_address_line_1: form.bill_address_line_1,
    ship_address_line_2: form.bill_address_line_2,
    ship_country: form.bill_country,
    ship_state: form.bill_state,
    ship_city: form.bill_city,
    ship_pincode: form.bill_pincode,
  });

  const syncLocationDependents = (form: LocationSetupForm) => {
    const withBill = form.same_as_registered ? copyRegisteredToBill(form) : form;
    return withBill.same_as_bill_to ? copyBillToShip(withBill) : withBill;
  };

  const updateLocation = (recipe: (prev: LocationSetupForm) => LocationSetupForm) => {
    setLocation((prev) => syncLocationDependents(recipe(prev)));
  };



  const saveStep = async (step: string, data: Record<string, unknown> = {}) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant": company,
        },
        body: JSON.stringify({
          company,
          step,
          data,
        }),
      });
      const result = (await res.json()) as SaveResponse;
      if (!res.ok || !result.success) {
        setError(result?.message || "Unable to save this step.");
        return false;
      }

      if (result.setup_stage) setStage(result.setup_stage);
      if (typeof result.next_step === "number") {
        setCurrentStep(result.next_step);
      }
      if (result.subscription) {
        setSubscription(result.subscription);
        if (result.subscription.plan_id) {
          setSelectedPlan({
            plan_id: Number(result.subscription.plan_id),
            plan_name: result.subscription.plan_name || result.subscription.plan_code,
            amount: Number(result.subscription.amount || 0),
            price: Number(result.subscription.amount || 0),
            billing_cycle: normalizeBillingInterval(result.subscription.billing_interval),
            billing_period:
              normalizeBillingInterval(result.subscription.billing_interval) === "yearly"
                ? "Yearly"
                : "Monthly",
            features: [],
          });
        }
        if (result.subscription.billing_interval) {
          setSelectedBillingInterval(normalizeBillingInterval(result.subscription.billing_interval));
        }
      }
      return true;
    } catch {
      setError("Unable to save this step.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Place/replace these functions inside your component:

  const updateBusinessGst = (value: string, stateCode = businessGstStateCode) => {
    setBusinessSettings((prev) => {
      // Standardize input formatting
      const rawSuffix = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const fullGstNumber = stateCode ? `${stateCode}${rawSuffix}` : rawSuffix;

      return {
        ...prev,
        gst_number: fullGstNumber,
        pan_number: getNextPanValue(fullGstNumber, prev.pan_number, isPanManuallyEdited),
      };
    });
  };
  const handleBusinessSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const noSymbolsRegex = /^[a-zA-Z0-9\s,.\-\/]*$/;
    const validationErrors: Record<string, string> = {};

    if (businessSettings.business_address && !noSymbolsRegex.test(businessSettings.business_address)) {
      validationErrors.business_address = "Special characters/symbols are not allowed.";
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    if (!businessSettings.currency) {
      setError("Currency is required.");
      return;
    }

    // Only validate GST/PAN if GST Available is explicitly checked
    if (gstAvailable) {
      if (!businessSettings.gst_number || businessSettings.gst_number.length < GSTIN_MAX_LENGTH) {
        setError("Please complete the full 15-character GST number.");
        return;
      }
      if (!isValidGstin(businessSettings.gst_number)) {
        setError("GST number must match the valid format (e.g., 33AAAAA9999A1Z5).");
        return;
      }
      if (businessSettings.pan_number && !isValidPan(businessSettings.pan_number)) {
        setError("PAN number must match the format AAAAA9999A.");
        return;
      }
    }

    // FINAL SANITIZATION BEFORE API CALL:
    // If gstAvailable is false, explicitly set gst_number and pan_number to ""
    const payload = {
      ...businessSettings,
      gst_number: gstAvailable ? businessSettings.gst_number : "",
      pan_number: gstAvailable ? normalizePan(businessSettings.pan_number) : "",
      currency: businessSettings.currency.toUpperCase(),
    };

    await saveStep("BUSINESS_SETUP", payload);
  };
  const handleWarehouseSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const noSymbolsRegex = /^[a-zA-Z0-9\s,.\-\/]*$/;
    const validationErrors: Record<string, string> = {};

    if (warehouse.name && !noSymbolsRegex.test(warehouse.name)) {
      validationErrors.name = "Symbols are not allowed in the warehouse name.";
    }
    if (warehouse.description && !noSymbolsRegex.test(warehouse.description)) {
      validationErrors.description = "Symbols are not allowed in the description.";
    }

    const phoneRegex = /^\d{10}$/;
    if (warehouse.landline && !phoneRegex.test(warehouse.landline)) {
      validationErrors.landline = "Must be only 10 digit numbers";
    }
    if (warehouse.mobile_no && !phoneRegex.test(warehouse.mobile_no)) {
      validationErrors.mobile_no = "Must be only 10 digit numbers";
    }
    if (warehouse.contact_person_mobile && !phoneRegex.test(warehouse.contact_person_mobile)) {
      validationErrors.contact_person_mobile = "Must be only 10 digit numbers";
    }

    const faxInvalidRegex = /[^0-9\s()+-]/;
    if (warehouse.fax && faxInvalidRegex.test(warehouse.fax)) {
      validationErrors.fax = "Invalid characters. Only numbers, spaces, hyphens, (), and + are allowed.";
    }

    if (warehouse.contact_person_name && !noSymbolsRegex.test(warehouse.contact_person_name)) {
      validationErrors.contact_person_name = "Symbols are not allowed.";
    }


    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    const success = await saveStep("WAREHOUSE_SETUP", warehouse);
    if (success) {
      await loadWarehouseOptions();
    }
  };

  const handleLocationSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const noSymbolsRegex = /^[a-zA-Z0-9\s,.\-\/]*$/;
    const validationErrors: Record<string, string> = {};



    if (location.name && !noSymbolsRegex.test(location.name)) {
      validationErrors.name = "Symbols are not allowed in the location name.";
    }
    if (location.description && !noSymbolsRegex.test(location.description)) {
      validationErrors.description = "Symbols are not allowed in the description.";
    }
    if (location.registered_address_line_1 && !noSymbolsRegex.test(location.registered_address_line_1)) {
      validationErrors.registered_address_line1 = "Symbols are not allowed.";
    }
    if (location.registered_address_line_2 && !noSymbolsRegex.test(location.registered_address_line_2)) {
      validationErrors.registered_address_line2 = "Symbols are not allowed.";
    }
    if (location.bill_address_line_1 && !noSymbolsRegex.test(location.bill_address_line_1)) {
      validationErrors.bill_address_line1 = "Symbols are not allowed.";
    }
    if (location.bill_address_line_2 && !noSymbolsRegex.test(location.bill_address_line_2)) {
      validationErrors.bill_address_line2 = "Symbols are not allowed.";
    }
    if (location.ship_address_line_1 && !noSymbolsRegex.test(location.ship_address_line_1)) {
      validationErrors.ship_address_line1 = "Symbols are not allowed.";
    }
    if (location.ship_address_line_2 && !noSymbolsRegex.test(location.ship_address_line_2)) {
      validationErrors.ship_address_line2 = "Symbols are not allowed.";
    }


    const pincodeRegex = /^[0-9]{1,6}$/;
    if (location.registered_pincode && !pincodeRegex.test(location.registered_pincode)) {
      validationErrors.registered_pincode = "Pincode must be 6 digits.";
    }
    if (location.bill_pincode && !pincodeRegex.test(location.bill_pincode)) {
      validationErrors.bill_pincode = "Pincode must be 6 digits.";
    }
    if (location.ship_pincode && !pincodeRegex.test(location.ship_pincode)) {
      validationErrors.ship_pincode = "Pincode must be 6 digits.";
    }

    const phoneRegex = /^\d{10}$/;
    if (location.landline && !phoneRegex.test(location.landline)) {
      validationErrors.landline = "Must be only 10 digit numbers";
    }
    if (location.mobile && !phoneRegex.test(location.mobile)) {
      validationErrors.mobile = "Must be only 10 digit numbers";
    }

    const faxInvalidRegex = /[^0-9\s()+-]/;
    if (location.fax && faxInvalidRegex.test(location.fax)) {
      validationErrors.fax = "Invalid characters. Only numbers, spaces, hyphens, (), and + are allowed.";
    }

    if (location.contact_person && !noSymbolsRegex.test(location.contact_person)) {
      validationErrors.contact_person = "Symbols are not allowed.";
    }


    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return; // Stops execution and prevents saving
    }
    setErrors({});

    const success = await saveStep("LOCATION_SETUP", location);
    if (success) {
      setLocation(defaultLocation);
      await loadLocationOptions();
    }
  };

  const handleStaffSubmit = async () => {
    if (!validateStaffs()) return;
    await saveStep("STAFF_SETUP", { users: staffUsers });
  };

  const handleSendOtp = async () => {
    if (!companyId) {
      setOtpError("Unable to send OTP. Please refresh and try again.");
      return;
    }
    setSaving(true);
    setOtpError("");
    setOtpMessage("");
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setOtpError(data?.message || "Unable to send OTP.");
        return;
      }
      setOtpSent(true);
      setOtpCooldown(Number(data.cooldown_seconds || 45));
      setOtpMessage(data.sample_text || "OTP sent to the stored phone number.");
    } catch {
      setOtpError("Unable to send OTP.");
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!companyId) {
      setOtpError("Unable to verify OTP. Please refresh and try again.");
      return;
    }
    setSaving(true);
    setOtpError("");
    setOtpMessage("");
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setOtpError(data?.message || "Invalid OTP.");
        return;
      }
      setPhoneVerified(true);
      setOtpMessage("Phone number verified successfully.");
    } catch {
      setOtpError("Unable to verify OTP.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhoneVerifiedStep = async () => {
    if (!phoneVerified) {
      setOtpError("Verify the phone number before proceeding.");
      return;
    }
    await saveStep("PHONE_VERIFIED");
  };


  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (emailSent && stage !== "LIVE") {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch(`/api/onboarding?company=${company}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-tenant": company,
            }
          });
          const contentType = res.headers.get("content-type");
          if (!res.ok || !contentType || !contentType.includes("application/json")) {
            console.warn("Polling endpoint did not return valid JSON. Retrying...");
            return;
          }

          const data = await res.json();
          const currentStage = data?.company?.setup_stage || data?.setup_stage || data?.data?.setup_stage;
          if (currentStage === "LIVE") {
            setStage("LIVE");
            clearInterval(intervalId);
          }
        } catch (error) {
          console.error("Failed status verification fetch:", error);
        }
      }, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [emailSent, stage, company]);

  const handleSendLaunchEmail = async () => {
    if (emailSending) return;
    setEmailSending(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/send-launch-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant": company,
        },
        body: JSON.stringify({ company }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.message || "Unable to send activation email.");
        return;
      }
      setEmailSent(true);
      setEmailSentButNotVerifiedYet(true);
    } catch {
      setError("Unable to send activation email.");
    } finally {
      setEmailSending(false);
    }
  };

  const handlePlanContinue = async (plan: PlanOption) => {
    if (saving) return;
    if (!companyId) {
      setError("Unable to initiate payment. Please refresh and try again.");
      return;
    }
    if (!plan?.plan_id) {
      setError("Please choose a valid plan from pricing.");
      return;
    }

    setSaving(true);
    setError("");
    persistSelectedPlan(plan);

    try {
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: plan.plan_id,
          plan_name: plan.plan_name,
          billing_interval: plan.billing_cycle,
          company_id: companyId,
        }),
      });

      const orderData = (await orderRes.json()) as CreateOrderResponse;
      if (!orderRes.ok || !orderData.success || !orderData.order) {
        setError(orderData?.message || "Unable to initiate payment. Please try again.");
        setSaving(false);
        return;
      }

      const sdkLoaded = await loadRazorpayScript();
      if (!sdkLoaded || !window.Razorpay) {
        setError("Unable to load payment gateway. Please try again.");
        setSaving(false);
        return;
      }

      const options: RazorpayCheckoutOptions = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_SdIB9ZLZsIayDT",
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: companyName || company,
        description: `${plan.plan_name} Plan (${plan.billing_cycle === "yearly" ? "Yearly" : "Monthly"})`,
        order_id: orderData.order.id,
        handler: async (response) => {
          const paymentId = response.razorpay_payment_id;
          if (!paymentId) {
            setError("Payment failed. Please try again.");
            setSaving(false);
            return;
          }
          await saveStep("PLAN_SELECTED", {
            plan_id: plan.plan_id,
            plan: plan.plan_name,
            billing_interval: plan.billing_cycle,
            payment_status: "SUCCESS",
            payment_id: paymentId,
            razorpay_order_id: response.razorpay_order_id || orderData.order?.id || null,
            razorpay_signature: response.razorpay_signature || null,
          });
        },
        modal: {
          ondismiss: () => {
            setError("Payment was cancelled. Please complete payment to continue.");
            setSaving(false);
          },
        },
        theme: {
          color: "#2563eb",
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.on("payment.failed", (response) => {
        setError(
          response?.error?.description ||
          response?.error?.reason ||
          "Payment failed. Please try again."
        );
        setSaving(false);
      });
      paymentObject.open();
    } catch {
      setError("Unable to initiate payment. Please try again.");
      setSaving(false);
    }
  };


  const addStaffRow = () => {
    const defaultLocationId = locationOptions[0] ? String(locationOptions[0].id) : "";
    const defaultWarehouse =
      warehouseOptions.find((option) => String(option.location_id) === defaultLocationId) ||
      warehouseOptions[0];
    const defaultWarehouseId = defaultWarehouse ? String(defaultWarehouse.id) : "";
    const defaultResponsibilityId = getDefaultResponsibilityId(responsibilityOptions);
    setStaffUsers((prev) => [
      ...prev,
      {
        name: "",
        username: "",
        email: "",
        phone: "",
        password: "",
        responsibility_id: defaultResponsibilityId,
        location_id: defaultLocationId,
        warehouse_id: defaultWarehouseId,
      },
    ]);
  };

  const updateStaffRow = (index: number, patch: Partial<StaffMember>) => {
    setStaffUsers((prev) =>
      prev.map((member, i) => (i === index ? { ...member, ...patch } : member))
    );
  };
  const [showPasswords, setShowPasswords] = useState<boolean[]>([]);
  const togglePassword = (index: number) => {
    setShowPasswords((prev) => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };
  const removeStaffRow = (index: number) => {
    setStaffUsers((prev) => prev.filter((_, i) => i !== index));
  };
  const [staffErrors, setStaffErrors] = useState<Record<string, string>[]>([]);

  const validateStaffs = () => {
    const next: Record<string, string>[] = staffUsers.map(() => ({}));
    let valid = true;

    staffUsers.forEach((user, i) => {
      // required fields
      if (!String(user.name || "").trim()) {
        next[i].name = "Name is required";
        valid = false;
      }
      if (!String(user.username || "").trim()) {
        next[i].username = "Username is required";
        valid = false;
      }
      const email = String(user.email || "").trim();
      if (!email) {
        next[i].email = "Email is required";
        valid = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        next[i].email = "Invalid email";
        valid = false;
      }
      const password = String(user.password || "");
      if (!password) {
        next[i].password = "Password is required";
        valid = false;
      } else {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;

        if (!passwordRegex.test(password)) {
          next[i].password = "Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and symbols.";
          valid = false;
        }
      }
      const phone = String(user.phone || "").trim();
      if (!phone) {
        next[i].phone = "Phone is required";
        valid = false;
      } else if (!/^\d{10}$/.test(phone)) {
        next[i].phone = "Phone must be 10 digits";
        valid = false;
      }
      if (!String(user.responsibility_id || "").trim()) {
        next[i].responsibility_id = "Responsibility is required";
        valid = false;
      }
      if (!String(user.location_id || "").trim()) {
        next[i].location_id = "Location is required";
        valid = false;
      }
      if (!String(user.warehouse_id || "").trim()) {
        next[i].warehouse_id = "Warehouse is required";
        valid = false;
      }
    });

    setStaffErrors(next);
    return valid;
  };

  const formFieldClass =
    "w-full mt-2 border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500";
  const formLabelClass = "text-sm font-semibold mb-1 block";
  const checkboxClass = "h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500";

  if (loading) {
    return <div className="text-gray-600">Loading onboarding wizard...</div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-gray-900">Company Onboarding</h1>
          <p className="text-sm text-gray-600">
            Company: <span className="font-semibold">{companyName}</span> ({company})
          </p>
        </div>

        {/* Top-Right Redirect Icon */}
        <Link
          href="/"
          title="Return to Main Page"
          className="flex items-center justify-center p-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
        >
          <HiHome className="w-5 h-5" />
        </Link>
      </header>

      {/* Stepper underneath header */}
      <Stepper currentStep={currentStep} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {currentStep === 2 && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-gray-900">Step 2: Phone Verification</h2>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 space-y-4 text-sm">
              <div>
                <p className="font-semibold text-gray-900">Get OTP to your Phone Number</p>
                <p className="mt-1 text-gray-700">
                  Phone Number: <span className="font-semibold">+91 {ownerPhone || "-"}</span>
                </p>
              </div>
              {phoneVerified ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
                  Phone number verified successfully.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={saving || otpCooldown > 0}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-70"
                    >
                      {otpSent ? "Resend OTP" : "Send OTP"}
                    </button>
                    {/* <button
                      type="button"
                      disabled
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 font-semibold text-gray-400"
                    >
                      Change Number
                    </button> */}
                    {otpCooldown > 0 && (
                      <span className="self-center text-gray-600">Resend available in {otpCooldown}s</span>
                    )}
                  </div>
                  {otpSent && (
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Enter OTP"
                        className={formFieldClass}
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={saving || otp.trim().length < 4}
                        className="rounded-lg bg-green-600 px-5 py-3 text-white font-semibold hover:bg-green-700 disabled:opacity-70"
                      >
                        Verify OTP
                      </button>
                    </div>
                  )}
                  {otpMessage && (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
                      {otpMessage}
                    </div>
                  )}
                  {otpError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-600">
                      {otpError}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handlePhoneVerifiedStep}
              disabled={saving || !phoneVerified}
              className="rounded-lg bg-blue-600 px-5 py-3 text-white font-semibold hover:bg-blue-700 disabled:opacity-70"
            >
              {saving ? "Saving..." : "Continue to Payment →"}
            </button>
          </div>
        )}

        {currentStep === 3 && (
          <Pricing
            mode="onboarding"
            selectedPlanId={selectedPlan?.plan_id || initialPlanId || null}
            selectedBillingInterval={selectedBillingInterval}
            onlySelectedPlan={false}
            onSelectPlan={(plan) => {
              setSelectedPlan(plan);
              persistSelectedPlan(plan);
            }}
            onSelectBillingInterval={setSelectedBillingInterval}
            onContinue={handlePlanContinue}
            loading={saving}
          />
        )}
        {currentStep === 4 && (
          <form onSubmit={handleBusinessSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow">
            <h2 className="text-2xl font-bold text-gray-900">Step 4: Business Setup</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className={formLabelClass}>Country <span className="text-red-500">*</span></label>
                <select
                  value={businessSettings.country}
                  onChange={(e) =>
                    setBusinessSettings((prev) => {
                      const nextCountry = e.target.value;
                      const defaultCurrency = getDefaultCurrencyCodeForCountry(nextCountry);
                      return {
                        ...prev,
                        country: nextCountry,
                        state: "",
                        city: "",
                        currency: defaultCurrency || prev.currency,
                      };
                    })
                  }
                  className={formFieldClass}
                  required
                  disabled
                >
                  <option value="India">India</option>
                  {countryOptions.map((country) => (
                    <option key={country.isoCode} value={country.name}>
                      {country.name}
                    </option>
                  ))}
                </select>
                {errors.country && <p className="text-red-500 text-sm mt-1">{errors.country}</p>}
              </div>

              <div>
                <label className={formLabelClass}>State <span className="text-red-500">*</span></label>
                <select
                  data-field="state"
                  value={businessSettings.state}
                  onChange={(e) => {
                    const nextState = e.target.value;
                    const stateCode = getGstStateCodeForState(nextState);

                    setBusinessSettings((prev) => ({
                      ...prev,
                      state: nextState,
                      city: "",
                      // STRICT GUARD: If GST Available is false, force empty strings!
                      gst_number: gstAvailable ? formatGstinInput(prev.gst_number, stateCode) : "",
                      pan_number: gstAvailable ? getNextPanValue(prev.gst_number, prev.pan_number, isPanManuallyEdited) : "",
                    }));
                  }}
                  className={formFieldClass}
                  required
                >
                  <option value="">Select State</option>
                  {businessStateOptions.map((state) => (
                    <option key={state.isoCode} value={state.name}>
                      {state.name}
                    </option>
                  ))}
                </select>
                {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
              </div>
              <div>
                <label className={formLabelClass}>City</label>
                <select
                  data-field="city"
                  value={businessSettings.city}
                  onChange={(e) =>
                    setBusinessSettings((prev) => ({ ...prev, city: e.target.value }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select City</option>
                  {businessCityOptions.map((city) => (
                    <option
                      key={`${city.name}-${city.latitude}-${city.longitude}`}
                      value={city.name}
                    >
                      {city.name}
                    </option>
                  ))}
                </select>
                {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
              </div>

              <div className="md:col-span-2">
                <label className={formLabelClass}>Business Address</label>
                <textarea
                  data-field="business_address"
                  data-rules="no-symbols"
                  data-optional="true"
                  value={businessSettings.business_address}
                  onChange={(e) =>
                    setBusinessSettings((prev) => ({ ...prev, business_address: e.target.value }))
                  }
                  rows={3}
                  placeholder="Optional"
                  className={formFieldClass}
                />
                {errors.business_address && <p className="text-red-500 text-sm mt-1">{errors.business_address}</p>}
              </div>

              <div>
                <label className={formLabelClass}>Currency</label>
                <select
                  data-field="currency"
                  data-optional="true"
                  value={businessSettings.currency}
                  onChange={(e) =>
                    setBusinessSettings((prev) => ({ ...prev, currency: e.target.value }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select Currency</option>
                  {currencyOptions.map((currency) => (
                    <option key={currency.id} value={currency.currency_code}>
                      {currency.currency_code} - {currency.currency_name}
                    </option>
                  ))}
                </select>
                {errors.currency && <p className="text-red-500 text-sm mt-1">{errors.currency}</p>}
              </div>

              <div className="md:col-span-3 rounded-lg border border-gray-200 p-4 space-y-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gstAvailable}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setGstAvailable(checked);
                      setIsPanManuallyEdited(false);

                      setBusinessSettings((prev) => {
                        // If unchecked: purge GST and PAN entirely
                        if (!checked) {
                          return { ...prev, gst_number: "", pan_number: "" };
                        }

                        // If checked: rebuild state code digits automatically
                        const gst_number = formatGstinInput(prev.gst_number, businessGstStateCode);
                        return {
                          ...prev,
                          gst_number,
                          pan_number: getNextPanValue(gst_number, prev.pan_number, false),
                        };
                      });
                    }}
                    className={checkboxClass}
                  />
                  GST Available
                </label>

                {/* Render GST and PAN inputs ONLY when GST Available is checked */}
                {gstAvailable && (
                  <div className="grid md:grid-cols-2 gap-6 pt-2">
                    <div>
                      <label className={formLabelClass}>
                        GST Number <span className="text-red-500">*</span>
                      </label>
                      <div
                        className={`mt-2 flex overflow-hidden rounded-lg ${shouldShowBusinessGstError
                          ? "border border-red-500 focus-within:ring-2 focus-within:ring-red-500"
                          : isBusinessGstValid
                            ? "border border-green-500 focus-within:ring-2 focus-within:ring-green-500"
                            : "border border-gray-300 focus-within:ring-2 focus-within:ring-indigo-500"
                          }`}
                      >
                        <span className="flex items-center bg-gray-100 px-3 text-sm font-bold text-gray-700 border-r border-gray-300">
                          {businessGstStateCode || "--"}
                        </span>
                        <input
                          data-field="gst_number"
                          data-rules="code"
                          type="text"
                          required
                          value={businessGstSuffix}
                          onChange={(e) => updateBusinessGst(e.target.value)}
                          maxLength={13}
                          className="w-full p-3 outline-none uppercase font-mono tracking-wider"
                          placeholder="AAAAA1111A1Z5"
                        />
                      </div>
                      {shouldShowBusinessGstError && (
                        <p className="text-red-500 text-xs mt-1">
                          Please enter valid remaining 13 GSTIN characters.
                        </p>
                      )}
                      {errors.gst_number && <p className="text-red-500 text-sm mt-1">{errors.gst_number}</p>}
                    </div>

                    <div>
                      <label className={formLabelClass}>PAN Number</label>
                      <input
                        data-field="pan_number"
                        data-rules="code"
                        type="text"
                        value={businessSettings.pan_number}
                        onChange={(e) => {
                          setIsPanManuallyEdited(true);
                          setBusinessSettings((prev) => ({
                            ...prev,
                            pan_number: normalizePan(e.target.value),
                          }));
                        }}
                        maxLength={10}
                        className={`${formFieldClass} uppercase font-mono tracking-wider`}
                        placeholder="AAAAA1111A"
                      />
                      {errors.pan_number && <p className="text-red-500 text-sm mt-1">{errors.pan_number}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-white font-semibold hover:bg-blue-700 disabled:opacity-70 transition-colors"
            >
              {saving ? "Saving..." : "Save & Continue"}
            </button>
          </form>
        )}

        {currentStep === 5 && (
          <form onSubmit={handleLocationSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow">
            <h2 className="text-2xl font-bold text-gray-900">Step 5: Store Location Setup</h2>
            <p className="text-sm text-gray-600">
              Plan limit: {planLimits.maxLocations} location(s)
            </p>
            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <label className={formLabelClass}>
                  Store Location Name <span className="text-red-500">*</span>
                </label>
                <input
                  data-field="name"
                  data-rules="no-symbols"
                  type="text"
                  required
                  value={location.name}
                  onChange={(e) => updateLocation((prev) => ({ ...prev, name: e.target.value }))}
                  className={formFieldClass}
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Type</label>
                <select
                  data-field="type"
                  data-optional="true"
                  value={location.type}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      type: e.target.value as LocationSetupForm["type"],
                    }))
                  }
                  className={formFieldClass}
                >
                  <option value="global">Global</option>
                  <option value="local">Local</option>
                </select>
                {errors.type && <p className="text-red-500 text-sm mt-1">{errors.type}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Inactive Date</label>
                <input
                  data-field="inactive_date"
                  data-rules="date"
                  data-optional="true"
                  type="date"
                  value={location.inactive_date}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, inactive_date: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.inactive_date && <p className="text-red-500 text-sm mt-1">{errors.inactive_date}</p>}
              </div>
              <div className="md:col-span-3">
                <label className={formLabelClass}>Description</label>
                <textarea
                  data-field="description"
                  data-rules="no-symbols"
                  data-optional="true"
                  value={location.description}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Optional"
                  className={formFieldClass}
                />
                {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
              </div>
              <div className="md:col-span-4">
                <h3 className="text-base font-semibold text-gray-900">Registered Address</h3>
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass}>Address Line 1</label>
                <input
                  data-field="registered_address_line1"
                  data-rules="no-symbols"
                  data-optional="true"
                  type="text"
                  value={location.registered_address_line_1}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      registered_address_line_1: e.target.value,
                    }))
                  }
                  className={formFieldClass}
                />
                {errors.registered_address_line1 && <p className="text-red-500 text-sm mt-1">{errors.registered_address_line1}</p>}
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass}>Address Line 2</label>
                <input
                  data-field="registered_address_line2"
                  data-rules="no-symbols"
                  data-optional="true"
                  type="text"
                  value={location.registered_address_line_2}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      registered_address_line_2: e.target.value,
                    }))
                  }
                  className={formFieldClass}
                />
                {errors.registered_address_line2 && <p className="text-red-500 text-sm mt-1">{errors.registered_address_line2}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Country</label>
                <select
                  data-field="registered_country"
                  data-optional="true"
                  disabled
                  value={location.registered_country}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      registered_country: e.target.value,
                      registered_state: "",
                      registered_city: "",
                    }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select Country</option>
                  {countryOptions.map((country) => (
                    <option key={country.isoCode} value={country.name}>
                      {country.name}
                    </option>
                  ))}
                </select>
                {errors.registered_country && <p className="text-red-500 text-sm mt-1">{errors.registered_country}</p>}
              </div>
              <div>
                <label className={formLabelClass}>State</label>
                <select
                  data-field="registered_state"
                  data-optional="true"
                  value={location.registered_state}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      registered_state: e.target.value,
                      registered_city: "",
                    }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select State</option>
                  {registeredStateOptions.map((state) => (
                    <option key={state.isoCode} value={state.name}>
                      {state.name}
                    </option>
                  ))}
                </select>
                {errors.registered_state && <p className="text-red-500 text-sm mt-1">{errors.registered_state}</p>}
              </div>
              <div>
                <label className={formLabelClass}>City</label>
                <select
                  data-field="registered_city"
                  data-optional="true"
                  value={location.registered_city}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, registered_city: e.target.value }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select City</option>
                  {registeredCityOptions.map((city) => (
                    <option
                      key={`${city.name}-${city.latitude}-${city.longitude}`}
                      value={city.name}
                    >
                      {city.name}
                    </option>
                  ))}
                </select>
                {errors.registered_city && <p className="text-red-500 text-sm mt-1">{errors.registered_city}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Pincode</label>
                <input
                  data-field="registered_pincode"
                  data-rules="numeric-string"
                  data-optional="true"
                  type="text"
                  value={location.registered_pincode}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, registered_pincode: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.registered_pincode && <p className="text-red-500 text-sm mt-1">{errors.registered_pincode}</p>}
              </div>
              <div className="md:col-span-4 rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={location.same_as_registered}
                    onChange={(e) =>
                      updateLocation((prev) => ({
                        ...prev,
                        same_as_registered: e.target.checked,
                      }))
                    }
                    className={checkboxClass}
                  />
                  <label className="text-sm text-gray-700">Same As Registered Address</label>
                </div>
              </div>

              <div className="md:col-span-4">
                <h3 className="text-base font-semibold text-gray-900">Bill To Address</h3>
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass}>Address Line 1</label>
                <input
                  data-field="bill_address_line1"
                  data-rules="no-symbols"
                  data-optional="true"
                  type="text"
                  value={location.bill_address_line_1}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, bill_address_line_1: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.bill_address_line1 && <p className="text-red-500 text-sm mt-1">{errors.bill_address_line1}</p>}
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass}>Address Line 2</label>
                <input
                  data-field="bill_address_line2"
                  data-rules="no-symbols"
                  data-optional="true"
                  type="text"
                  value={location.bill_address_line_2}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, bill_address_line_2: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.bill_address_line2 && <p className="text-red-500 text-sm mt-1">{errors.bill_address_line2}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Country</label>
                <select
                  data-field="bill_country"
                  data-optional="true"
                  disabled
                  value={location.bill_country}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      bill_country: e.target.value,
                      bill_state: "",
                      bill_city: "",
                    }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select Country</option>
                  {countryOptions.map((country) => (
                    <option key={country.isoCode} value={country.name}>
                      {country.name}
                    </option>
                  ))}
                </select>
                {errors.bill_country && <p className="text-red-500 text-sm mt-1">{errors.bill_country}</p>}
              </div>
              <div>
                <label className={formLabelClass}>State</label>
                <select
                  data-field="bill_state"
                  data-optional="true"
                  value={location.bill_state}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      bill_state: e.target.value,
                      bill_city: "",
                    }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select State</option>
                  {billStateOptions.map((state) => (
                    <option key={state.isoCode} value={state.name}>
                      {state.name}
                    </option>
                  ))}
                </select>
                {errors.bill_state && <p className="text-red-500 text-sm mt-1">{errors.bill_state}</p>}
              </div>
              <div>
                <label className={formLabelClass}>City</label>
                <select
                  data-field="bill_city"
                  data-optional="true"
                  value={location.bill_city}
                  onChange={(e) => updateLocation((prev) => ({ ...prev, bill_city: e.target.value }))}
                  className={formFieldClass}
                >
                  <option value="">Select City</option>
                  {billCityOptions.map((city) => (
                    <option
                      key={`${city.name}-${city.latitude}-${city.longitude}`}
                      value={city.name}
                    >
                      {city.name}
                    </option>
                  ))}
                </select>
                {errors.bill_city && <p className="text-red-500 text-sm mt-1">{errors.bill_city}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Pincode</label>
                <input
                  data-field="bill_pincode"
                  data-rules="numeric-string"
                  data-optional="true"
                  type="text"
                  value={location.bill_pincode}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, bill_pincode: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.bill_pincode && <p className="text-red-500 text-sm mt-1">{errors.bill_pincode}</p>}
              </div>
              <div className="md:col-span-4 rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={location.same_as_bill_to}
                    onChange={(e) =>
                      updateLocation((prev) => ({
                        ...prev,
                        same_as_bill_to: e.target.checked,
                      }))
                    }
                    className={checkboxClass}
                  />
                  <label className="text-sm text-gray-700">Same As Bill To Address</label>
                </div>
              </div>

              <div className="md:col-span-4">
                <h3 className="text-base font-semibold text-gray-900">Ship To Address</h3>
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass}>Address Line 1</label>
                <input
                  data-field="ship_address_line1"
                  data-rules="no-symbols"
                  data-optional="true"
                  type="text"
                  value={location.ship_address_line_1}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, ship_address_line_1: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.ship_address_line1 && <p className="text-red-500 text-sm mt-1">{errors.ship_address_line1}</p>}
              </div>
              <div className="md:col-span-2">
                <label className={formLabelClass}>Address Line 2</label>
                <input
                  data-field="ship_address_line2"
                  data-rules="no-symbols"
                  data-optional="true"
                  type="text"
                  value={location.ship_address_line_2}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, ship_address_line_2: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.ship_address_line2 && <p className="text-red-500 text-sm mt-1">{errors.ship_address_line2}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Country</label>
                <select
                  data-field="ship_country"
                  data-optional="true"
                  disabled
                  value={location.ship_country}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      ship_country: e.target.value,
                      ship_state: "",
                      ship_city: "",
                    }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select Country</option>
                  {countryOptions.map((country) => (
                    <option key={country.isoCode} value={country.name}>
                      {country.name}
                    </option>
                  ))}
                </select>
                {errors.ship_country && <p className="text-red-500 text-sm mt-1">{errors.ship_country}</p>}
              </div>
              <div>
                <label className={formLabelClass}>State</label>
                <select
                  data-field="ship_state"
                  data-optional="true"
                  value={location.ship_state}
                  onChange={(e) =>
                    updateLocation((prev) => ({
                      ...prev,
                      ship_state: e.target.value,
                      ship_city: "",
                    }))
                  }
                  className={formFieldClass}
                >
                  <option value="">Select State</option>
                  {shipStateOptions.map((state) => (
                    <option key={state.isoCode} value={state.name}>
                      {state.name}
                    </option>
                  ))}
                </select>
                {errors.ship_state && <p className="text-red-500 text-sm mt-1">{errors.ship_state}</p>}
              </div>
              <div>
                <label className={formLabelClass}>City</label>
                <select
                  data-field="ship_city"
                  data-optional="true"
                  value={location.ship_city}
                  onChange={(e) => updateLocation((prev) => ({ ...prev, ship_city: e.target.value }))}
                  className={formFieldClass}
                >
                  <option value="">Select City</option>
                  {shipCityOptions.map((city) => (
                    <option
                      key={`${city.name}-${city.latitude}-${city.longitude}`}
                      value={city.name}
                    >
                      {city.name}
                    </option>
                  ))}
                </select>
                {errors.ship_city && <p className="text-red-500 text-sm mt-1">{errors.ship_city}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Pincode</label>
                <input
                  data-field="ship_pincode"
                  data-rules="numeric-string"
                  data-optional="true"
                  type="text"
                  value={location.ship_pincode}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, ship_pincode: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.ship_pincode && <p className="text-red-500 text-sm mt-1">{errors.ship_pincode}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Landline</label>
                <input
                  data-field="landline"
                  data-rules="phone"
                  data-optional="true"
                  type="text"
                  value={location.landline}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, landline: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.landline && <p className="text-red-500 text-sm mt-1">{errors.landline}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Mobile</label>
                <input
                  data-field="mobile"
                  data-rules="phone"
                  data-optional="true"
                  type="text"
                  value={location.mobile}
                  onChange={(e) => updateLocation((prev) => ({ ...prev, mobile: e.target.value }))}
                  className={formFieldClass}
                />
                {errors.mobile && <p className="text-red-500 text-sm mt-1">{errors.mobile}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Fax</label>
                <input
                  data-field="fax"
                  data-rules="phone"
                  data-optional="true"
                  type="text"
                  value={location.fax}
                  onChange={(e) => updateLocation((prev) => ({ ...prev, fax: e.target.value }))}
                  className={formFieldClass}
                />
                {errors.fax && <p className="text-red-500 text-sm mt-1">{errors.fax}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Email</label>
                <input
                  data-field="email"
                  data-rules="email"
                  data-optional="true"
                  type="email"
                  value={location.email}
                  onChange={(e) => updateLocation((prev) => ({ ...prev, email: e.target.value }))}
                  className={formFieldClass}
                />
                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Contact Person</label>
                <input
                  data-field="contact_person"
                  data-rules="alpha-name"
                  data-optional="true"
                  type="text"
                  value={location.contact_person}
                  onChange={(e) =>
                    updateLocation((prev) => ({ ...prev, contact_person: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.contact_person && <p className="text-red-500 text-sm mt-1">{errors.contact_person}</p>}
              </div>
              <div className="md:col-span-3 rounded-lg border border-gray-200 p-4">
                <div className="grid md:grid-cols-1 gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={location.is_default}
                      onChange={(e) =>
                        updateLocation((prev) => ({ ...prev, is_default: e.target.checked }))
                      }
                      className={checkboxClass}
                    />
                    Mark as default location
                  </label>
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save & Continue"}
            </button>
          </form>
        )}

        {currentStep === 6 && (
          <form onSubmit={handleWarehouseSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow">
            <h2 className="text-2xl font-bold text-gray-900">Step 6: Warehouse Setup</h2>
            <p className="text-sm text-gray-600">
              Plan limit: {planLimits.maxWarehouses} warehouse(s)
            </p>
            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <label className={formLabelClass}>
                  Warehouse Code <span className="text-red-500">*</span>
                </label>
                <input
                  data-field="code"
                  data-rules="code"
                  type="text"
                  required
                  value={warehouse.code}
                  onChange={(e) => setWarehouse((prev) => ({ ...prev, code: e.target.value }))}
                  className={formFieldClass}
                />
                {errors.code && <p className="text-red-500 text-sm mt-1">{errors.code}</p>}
              </div>
              <div>
                <label className={formLabelClass}>
                  Warehouse Name <span className="text-red-500">*</span>
                </label>
                <input
                  data-field="name"
                  data-rules="no-symbols"
                  type="text"
                  required
                  value={warehouse.name}
                  onChange={(e) => setWarehouse((prev) => ({ ...prev, name: e.target.value }))}
                  className={formFieldClass}
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className={formLabelClass}>
                  Location <span className="text-red-500">*</span>
                </label>
                <select
                  data-field="location_id"
                  value={warehouse.location_id}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, location_id: e.target.value }))
                  }
                  className={formFieldClass}
                  required
                >
                  <option value="">Select Location</option>
                  {locationOptions.map((loc) => (
                    <option key={loc.id} value={String(loc.id)}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                {errors.location_id && <p className="text-red-500 text-sm mt-1">{errors.location_id}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Type</label>
                <select
                  data-field="type"
                  data-optional="true"
                  value={warehouse.type}
                  onChange={(e) =>
                    setWarehouse((prev) => ({
                      ...prev,
                      type: e.target.value as WarehouseSetupForm["type"],
                    }))
                  }
                  className={formFieldClass}
                >
                  <option value="global">Global</option>
                  <option value="local">Local</option>
                </select>
                {errors.type && <p className="text-red-500 text-sm mt-1">{errors.type}</p>}
              </div>
              {/* <div className="md:col-span-2">
                <label className={formLabelClass}>Address</label>
                <input
                  type="text"
                  value={warehouse.address}
                  onChange={(e) => setWarehouse((prev) => ({ ...prev, address: e.target.value }))}
                  className={formFieldClass}
                />
              </div> */}
              <div>
                <label className={formLabelClass}>Effective From</label>
                <input
                  data-field="effective_from"
                  data-rules="date"
                  data-optional="true"
                  type="date"
                  value={warehouse.effective_from}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, effective_from: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.effective_from && <p className="text-red-500 text-sm mt-1">{errors.effective_from}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Effective To</label>
                <input
                  data-field="effective_to"
                  data-rules="date"
                  data-optional="true"
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={warehouse.effective_to}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, effective_to: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.effective_to && <p className="text-red-500 text-sm mt-1">{errors.effective_to}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Description</label>
                <input
                  data-field="description"
                  data-rules="no-symbols"
                  data-optional="true"
                  type="text"
                  value={warehouse.description}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Landline</label>
                <input
                  data-field="landline"
                  data-rules="phone"
                  data-optional="true"
                  type="text"
                  value={warehouse.landline}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, landline: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.landline && <p className="text-red-500 text-sm mt-1">{errors.landline}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Mobile</label>
                <input
                  data-field="mobile_no"
                  data-rules="phone"
                  data-optional="true"
                  type="text"
                  value={warehouse.mobile_no}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, mobile_no: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.mobile_no && <p className="text-red-500 text-sm mt-1">{errors.mobile_no}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Fax</label>
                <input
                  data-field="fax"
                  data-rules="phone"
                  data-optional="true"
                  type="text"
                  value={warehouse.fax}
                  onChange={(e) => setWarehouse((prev) => ({ ...prev, fax: e.target.value }))}
                  className={formFieldClass}
                />
                {errors.fax && <p className="text-red-500 text-sm mt-1">{errors.fax}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Email</label>
                <input
                  data-field="email"
                  data-rules="email"
                  data-optional="true"
                  type="email"
                  value={warehouse.email}
                  onChange={(e) => setWarehouse((prev) => ({ ...prev, email: e.target.value }))}
                  className={formFieldClass}
                />
                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Contact Person Name</label>
                <input
                  data-field="contact_person_name"
                  data-rules="alpha-name"
                  data-optional="true"
                  type="text"
                  value={warehouse.contact_person_name}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, contact_person_name: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.contact_person_name && <p className="text-red-500 text-sm mt-1">{errors.contact_person_name}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Contact Person Mobile</label>
                <input
                  data-field="contact_person_mobile"
                  data-rules="phone"
                  data-optional="true"
                  type="text"
                  value={warehouse.contact_person_mobile}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, contact_person_mobile: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.contact_person_mobile && <p className="text-red-500 text-sm mt-1">{errors.contact_person_mobile}</p>}
              </div>
              <div>
                <label className={formLabelClass}>Contact Person Email</label>
                <input
                  data-field="contact_person_email"
                  data-rules="email"
                  data-optional="true"
                  type="email"
                  value={warehouse.contact_person_email}
                  onChange={(e) =>
                    setWarehouse((prev) => ({ ...prev, contact_person_email: e.target.value }))
                  }
                  className={formFieldClass}
                />
                {errors.contact_person_email && <p className="text-red-500 text-sm mt-1">{errors.contact_person_email}</p>}
              </div>
              <div className="md:col-span-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={warehouse.is_default}
                    onChange={(e) =>
                      setWarehouse((prev) => ({ ...prev, is_default: e.target.checked }))
                    }
                    className={checkboxClass}
                  />
                  Mark as default warehouse
                </label>
              </div>

            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save & Continue"}
            </button>
          </form>
        )}

        {currentStep === 7 && (
          <div className="space-y-6 bg-white p-6 rounded-xl shadow">
            <h2 className="text-2xl font-bold text-gray-900">Step 7: Staff Setup</h2>
            <p className="text-sm text-gray-600">Plan user limit: {planLimits.maxUsers}</p>
            <button
              type="button"
              onClick={addStaffRow}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white"
            >
              Add Staff
            </button>
            <div className="space-y-4">
              {staffUsers.map((user, index) => (

                <div key={index} className="relative rounded-xl border border-gray-200 p-5 bg-gray-50/50">
                  <button
                    type="button"
                    onClick={() => removeStaffRow(index)}
                    className="absolute top-4 right-4 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200 z-10"
                    title="Remove Staff"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pr-0 md:pr-8">
                    <div>
                      <label className={formLabelClass}>
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        data-field={`staff_name_${index}`}
                        data-rules="alpha-name"
                        value={user.name}
                        onChange={(e) => updateStaffRow(index, { name: e.target.value })}
                        className={formFieldClass}
                      />
                      {(staffErrors[index]?.name || errors[`staff_name_${index}`]) && (
                        <p className="mt-2 text-sm text-red-600">{staffErrors[index]?.name || errors[`staff_name_${index}`]}</p>
                      )}
                    </div>
                    <div>
                      <label className={formLabelClass}>
                        Username <span className="text-red-500">*</span>
                      </label>
                      <input
                        data-field={`staff_username_${index}`}
                        data-rules="no-symbols"
                        value={user.username || ""}
                        onChange={(e) => updateStaffRow(index, { username: e.target.value })}
                        className={formFieldClass}
                      />
                      {(staffErrors[index]?.username || errors[`staff_username_${index}`]) && (
                        <p className="mt-2 text-sm text-red-600">{staffErrors[index]?.username || errors[`staff_username_${index}`]}</p>
                      )}
                    </div>
                    <div>
                      <label className={formLabelClass}>
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        data-field={`staff_email_${index}`}
                        data-rules="email"
                        value={user.email}
                        onChange={(e) => updateStaffRow(index, { email: e.target.value })}
                        className={formFieldClass}
                      />
                      {(staffErrors[index]?.email || errors[`staff_email_${index}`]) && (
                        <p className="mt-2 text-sm text-red-600">{staffErrors[index]?.email || errors[`staff_email_${index}`]}</p>
                      )}
                    </div>
                    <div>
                      <label className={formLabelClass}>
                        Password <span className="text-red-500">*</span>
                      </label>

                      <div className="relative">
                        <input
                          data-field={`staff_password_${index}`}
                          type={showPasswords[index] ? "text" : "password"}
                          value={user.password || ""}
                          onChange={(e) =>
                            updateStaffRow(index, { password: e.target.value })
                          }
                          className={`${formFieldClass} pr-10`}
                        />

                        <button
                          type="button"
                          onClick={() => togglePassword(index)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showPasswords[index] ? (
                            <HiEyeOff size={18} />
                          ) : (
                            <HiEye size={18} />
                          )}
                        </button>
                      </div>
                      {(staffErrors[index]?.password || errors[`staff_password_${index}`]) && (
                        <p className="mt-2 text-sm text-red-600">{staffErrors[index]?.password || errors[`staff_password_${index}`]}</p>
                      )}
                    </div>
                    <div>
                      <label className={formLabelClass}>
                        Phone <span className="text-red-500">*</span>
                      </label>
                      <input
                        data-field={`staff_phone_${index}`}
                        data-rules="phone"
                        value={user.phone}
                        onChange={(e) => updateStaffRow(index, { phone: e.target.value })}
                        className={formFieldClass}
                      />
                      {(staffErrors[index]?.phone || errors[`staff_phone_${index}`]) && (
                        <p className="mt-2 text-sm text-red-600">{staffErrors[index]?.phone || errors[`staff_phone_${index}`]}</p>
                      )}
                    </div>
                    <div>
                      <label className={formLabelClass}>
                        Responsibility <span className="text-red-500">*</span>
                      </label>
                      <select
                        data-field={`staff_responsibility_id_${index}`}
                        value={user.responsibility_id}
                        onChange={(e) =>
                          updateStaffRow(index, {
                            responsibility_id: e.target.value,
                          })
                        }
                        className={formFieldClass}
                      >
                        <option value="">Select Responsibility</option>
                        {responsibilityOptions.map((responsibility) => (
                          <option key={responsibility.id} value={String(responsibility.id)}>
                            {responsibility.responsibility_name}
                          </option>
                        ))}
                      </select>
                      {(staffErrors[index]?.responsibility_id || errors[`staff_responsibility_id_${index}`]) && (
                        <p className="mt-2 text-sm text-red-600">{staffErrors[index]?.responsibility_id || errors[`staff_responsibility_id_${index}`]}</p>
                      )}
                    </div>
                    <div>
                      <label className={formLabelClass}>
                        Location <span className="text-red-500">*</span>
                      </label>
                      <select
                        data-field={`staff_location_id_${index}`}
                        value={user.location_id}
                        onChange={(e) => {
                          const nextLocationId = e.target.value;
                          const selectedWarehouseMatchesLocation = warehouseOptions.some(
                            (wh) =>
                              String(wh.id) === user.warehouse_id &&
                              String(wh.location_id) === nextLocationId
                          );
                          updateStaffRow(index, {
                            location_id: nextLocationId,
                            warehouse_id: selectedWarehouseMatchesLocation ? user.warehouse_id : "",
                          });
                        }}
                        className={formFieldClass}
                        required
                      >
                        <option value="">Select Location</option>
                        {locationOptions.map((loc) => (
                          <option key={loc.id} value={String(loc.id)}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                      {(staffErrors[index]?.location_id || errors[`staff_location_id_${index}`]) && (
                        <p className="mt-2 text-sm text-red-600">{staffErrors[index]?.location_id || errors[`staff_location_id_${index}`]}</p>
                      )}
                    </div>
                    <div>
                      <label className={formLabelClass}>
                        Warehouse <span className="text-red-500">*</span>
                      </label>
                      <select
                        data-field={`staff_warehouse_id_${index}`}
                        value={user.warehouse_id}
                        onChange={(e) => updateStaffRow(index, { warehouse_id: e.target.value })}
                        className={formFieldClass}
                        required
                      >
                        <option value="">Select Warehouse</option>
                        {warehouseOptions
                          .filter(
                            (wh) =>
                              !user.location_id ||
                              String(wh.location_id) === String(user.location_id)
                          )
                          .map((wh) => (
                            <option key={wh.id} value={String(wh.id)}>
                              {wh.name}
                            </option>
                          ))}
                      </select>
                      {(staffErrors[index]?.warehouse_id || errors[`staff_warehouse_id_${index}`]) && (
                        <p className="mt-2 text-sm text-red-600">{staffErrors[index]?.warehouse_id || errors[`staff_warehouse_id_${index}`]}</p>
                      )}
                    </div>

                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={handleStaffSubmit}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        )}

        {currentStep === 8 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Step 8: Email Activation &amp; Launch</h2>
            {/* Workspace Summary Panel (Always Visible on Step 8) */}
            <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-slate-50 to-blue-50 p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">🚀 Your Workspace Summary</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="rounded-xl bg-white border border-gray-100 p-4 text-center shadow-sm">
                  <p className="text-3xl font-bold text-blue-600">{planLimits.maxUsers}</p>
                  <p className="text-xs text-gray-500 mt-1">System Users</p>
                </div>
                <div className="rounded-xl bg-white border border-gray-100 p-4 text-center shadow-sm">
                  <p className="text-3xl font-bold text-blue-600">{planLimits.maxLocations}</p>
                  <p className="text-xs text-gray-500 mt-1">Locations</p>
                </div>
                <div className="rounded-xl bg-white border border-gray-100 p-4 text-center shadow-sm">
                  <p className="text-3xl font-bold text-blue-600">{planLimits.maxWarehouses}</p>
                  <p className="text-xs text-gray-500 mt-1">Warehouses</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-white border border-gray-100 px-4 py-3">
                  <span className="text-gray-500">Admin Console</span>
                  <p className="font-semibold text-blue-700 mt-0.5">{`digistorii/${company}/admin`}</p>
                </div>
                <div className="rounded-lg bg-white border border-gray-100 px-4 py-3">
                  <span className="text-gray-500">Operations Portal URL</span>
                  <p className="font-semibold text-blue-700 mt-0.5">{`digistorii/${company}/workspace`}</p>
                </div>
              </div>
            </div>

            {/* Dynamic Status Logic Container */}
            {stage === "LIVE" ? (
              /* ── STATE C: Verified & Celebration View ── */
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-green-50 to-emerald-50 p-8 text-center space-y-4 shadow-md animate-fade-in">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-green-800">🎉 Onboarding Completed!</h3>
                <p className="text-green-700 max-w-md mx-auto leading-relaxed">
                  Your tenant setup is complete and your workspace is now <strong>LIVE</strong>.
                </p>
                <div className="pt-2">
                  <a
                    href={`${company}/workspace/login`}
                    className="inline-block rounded-xl bg-green-600 px-6 py-3 text-white font-semibold shadow hover:bg-green-700 transition-all"
                  >
                    Go to My Dashboard →
                  </a>
                </div>
              </div>
            ) : emailSent ? (
              /* ── STATE B: Waiting on Inbox Link Verification ── */
              <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-8 text-center space-y-5 shadow-sm">
                <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
                  <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-blue-900">Activation Email Sent!</h3>
                <p className="text-slate-600 max-w-md mx-auto leading-relaxed text-sm">
                  We have sent a secure confirmation link to your email address.
                  Please <strong>check your inbox and click the button</strong> to activate this workspace.
                </p>

                <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-medium bg-white/80 border border-indigo-100 rounded-lg px-4 py-2 inline-flex">
                  <svg className="animate-spin h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Waiting for verification... This page will update automatically.
                </div>
              </div>
            ) : (
              /* ── STATE A: Initial Form State (Hasn't clicked button yet) ── */
              <button
                type="button"
                onClick={handleSendLaunchEmail}
                disabled={emailSending}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white font-bold text-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-70 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {emailSending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending Activation Email…
                  </span>
                ) : (
                  "Verify Email & Launch Workspace"
                )}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
