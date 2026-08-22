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
  same_as_ship_to: boolean;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
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
  same_as_ship_to: true,
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  country: "India",
  pincode: "",
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

// Removed horizontal Stepper in favor of vertical stepper inside OnboardingWizard

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
  const [currentStep, setCurrentStep] = useState(1);
  const [viewingStepSummary, setViewingStepSummary] = useState<number | null>(null);
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


    const payload = {
      ...businessSettings,
      country: "India",
      gst_available: gstAvailable,
      gst_number: gstAvailable
        ? businessSettings.gst_number
        : "",
      pan_number: gstAvailable
        ? normalizePan(businessSettings.pan_number)
        : "",
      currency: businessSettings.currency.toUpperCase(),
    };

    await saveStep("BUSINESS_SETUP", payload);
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
    return <div className="text-gray-600 p-8">Loading onboarding wizard...</div>;
  }

  const activeViewStep = viewingStepSummary ?? currentStep;

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col md:flex-row font-sans">
      {/* Left Sidebar Stepper */}
      <aside className="w-full md:w-80 lg:w-96 bg-gradient-to-b from-slate-900 to-indigo-950 text-white p-6 md:p-8 flex flex-col justify-between shrink-0">
        <div>
          <div className="mb-10">
            <h1 className="text-2xl font-bold mb-2">Company Onboarding</h1>
            <p className="text-sm text-indigo-200">
              Company: <span className="font-semibold text-white">{companyName}</span> ({company})
            </p>
          </div>

          <div className="space-y-6">
            {ONBOARDING_STEPS.map((step, index) => {
              const isCompleted = step.id < currentStep;
              const isCurrent = step.id === currentStep;
              const isUpcoming = step.id > currentStep;
              const isViewing = step.id === activeViewStep;

              return (
                <div key={step.id} className="relative flex gap-4 cursor-pointer group"
                  onClick={() => {
                    if (isCompleted || isCurrent) {
                      setViewingStepSummary(isCurrent ? null : step.id);
                    }
                  }}
                >
                  {/* Connecting Line */}
                  {index < ONBOARDING_STEPS.length - 1 && (
                    <div className={`absolute left-4 top-10 bottom-[-24px] w-0.5 z-0 ${isCompleted ? "bg-emerald-500" : "bg-slate-700"}`} />
                  )}

                  {/* Step Circle */}
                  <div className={`relative z-10 shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-colors ${isCompleted ? "bg-emerald-500 text-white" :
                    isCurrent ? "bg-blue-600 ring-4 ring-blue-500/30 text-white" :
                      "border-2 border-slate-700 bg-slate-900 text-slate-500"
                    }`}>
                    {isCompleted ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-sm font-bold">{step.id}</span>
                    )}
                  </div>

                  {/* Step Label */}
                  <div className={`pt-1.5 ${isViewing ? "opacity-100" : isUpcoming ? "opacity-50" : "opacity-90"} group-hover:opacity-100 transition-opacity`}>
                    <p className={`text-sm font-bold ${isCurrent ? "text-blue-400" : isCompleted ? "text-emerald-400" : "text-slate-300"}`}>
                      {step.label}
                    </p>
                    {isCompleted && !isCurrent && (
                      <p className="text-xs text-slate-400 mt-0.5">Click to view summary</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contact Us Box */}
        <div className="mt-12 rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold">?</div>
          <div>
            <p className="text-xs text-slate-400">Having troubles!</p>
            <a href="mailto:workpro@yaanartech.com" className="text-sm font-semibold text-white hover:underline transition-all">Contact Us</a>
          </div>
        </div>
      </aside>

      {/* Right Canvas */}
      <main className="flex-1 p-6 md:p-10 lg:p-14 overflow-y-auto max-h-screen">
        <header className="flex justify-end mb-8">
          <Link
            href="/"
            title="Return to Main Page"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm font-semibold text-sm"
          >
            <HiHome className="w-4 h-4" />
            Home
          </Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm animate-fade-in">
            {error}
          </div>
        )}

        <div className="max-w-4xl">
          {viewingStepSummary && viewingStepSummary !== currentStep ? (
            <div className="space-y-6 animate-fade-in">
              <button
                onClick={() => setViewingStepSummary(null)}
                className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4 transition-colors"
              >
                &larr; Back to Current Step
              </button>

              <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Step {viewingStepSummary} Summary
                  </h2>
                  <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full uppercase tracking-wider">
                    Completed
                  </span>
                </div>

                {viewingStepSummary === 1 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Owner Phone</p>
                      <p className="text-lg font-semibold text-gray-900">{ownerPhone || "Verified"}</p>
                    </div>
                  </div>
                )}

                {viewingStepSummary === 2 && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Selected Plan</p>
                      <p className="text-lg font-semibold text-gray-900">{subscription?.plan_name || subscription?.plan_code || "Unknown"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Status</p>
                      <p className="text-lg font-semibold text-gray-900 capitalize">{subscription?.status || "Active"}</p>
                    </div>
                  </div>
                )}

                {viewingStepSummary === 3 && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Country</p>
                      <p className="text-lg font-semibold text-gray-900">India</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">State / City</p>
                      <p className="text-lg font-semibold text-gray-900">{businessSettings.state} / {businessSettings.city}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Currency</p>
                      <p className="text-lg font-semibold text-gray-900">{businessSettings.currency}</p>
                    </div>
                    {gstAvailable && (
                      <>
                        <div>
                          <p className="text-sm text-gray-500 font-medium">GSTIN</p>
                          <p className="text-lg font-semibold text-gray-900 font-mono">{businessSettings.gst_number}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 font-medium">PAN Number</p>
                          <p className="text-lg font-semibold text-gray-900 font-mono">{businessSettings.pan_number}</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {currentStep === 1 && (
                <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm animate-fade-in">
                  <h2 className="text-3xl font-bold text-gray-900">Step 1: Phone Verification</h2>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-6 space-y-5 text-sm">
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

              {currentStep === 2 && (
                <Pricing
                  mode="onboarding"
                  selectedPlanId={selectedPlan?.plan_id || initialPlanId || null}
                  selectedBillingInterval={selectedBillingInterval}
                  onlySelectedPlan
                  onSelectPlan={(plan) => {
                    setSelectedPlan(plan);
                    persistSelectedPlan(plan);
                  }}
                  onSelectBillingInterval={setSelectedBillingInterval}
                  onContinue={handlePlanContinue}
                  loading={saving}
                />
              )}
              {currentStep === 3 && (
                <form onSubmit={handleBusinessSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow">
                  {/* Context Card for Step 3 */}
                  {subscription && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 mb-4 flex justify-between items-center shadow-sm">
                      <div>
                        <p className="text-sm text-indigo-700 font-semibold">Active Plan</p>
                        <p className="text-lg font-bold text-gray-900">{subscription.plan_name || subscription.plan_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-indigo-700 font-semibold">Status</p>
                        <p className="text-lg font-bold text-green-600">{subscription.status}</p>
                      </div>
                    </div>
                  )}
                  <h2 className="text-2xl font-bold text-gray-900">Step 3: Business Setup</h2>
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

              {currentStep === 4 && (
                <div className="max-w-xl mx-auto space-y-6 py-4 animate-fade-in">
                  {subscription && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 mb-4 flex justify-between items-center shadow-sm">
                      <div>
                        <p className="text-sm text-indigo-700 font-semibold">Active Plan</p>
                        <p className="text-lg font-bold text-gray-900">{subscription.plan_name || subscription.plan_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-indigo-700 font-semibold">Status</p>
                        <p className="text-lg font-bold text-green-600">{subscription.status}</p>
                      </div>
                    </div>
                  )}

                  {/* Center Hero Information Card */}
                  <div className="rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/60 to-white p-8 text-center shadow-sm space-y-4">
                    {/* Information Center Icon */}
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 shadow-inner">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>

                    {/* Few Words Title & Subtitle */}
                    <div className="space-y-1">
                      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Email Verification Required</h2>
                      <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                        Almost ready! Click below to send a secure activation link to your registered business inbox.
                      </p>
                    </div>

                    {/* Target Email Indicator */}
                    <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200/80 shadow-xs">
                      <span className="text-slate-400">Sending to:</span>
                      <span className="text-blue-600 font-mono">{"owner@yourdomain.com"}</span>
                    </div>
                  </div>

                  {/* Dynamic Status Action States */}
                  {stage === "LIVE" ? (
                    /* STATE C: Verified & Celebration View */
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3 shadow-xs">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-emerald-900">Workspace is Live!</h3>
                      <p className="text-xs text-emerald-700">Your email has been verified successfully.</p>
                      <a
                        href={`/${company}/workspace/login`}
                        className="inline-block w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition-all"
                      >
                        Launch My Dashboard →
                      </a>
                    </div>
                  ) : emailSent ? (
                    /* STATE B: Waiting on Inbox Link Verification */
                    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-6 text-center space-y-4 shadow-xs">
                      <div className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-700">
                        <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Activation Link Sent — Checking Inbox...
                      </div>
                      <p className="text-xs text-slate-500">
                        Click the verification button in your email to instantly unlock your workspace dashboard.
                      </p>
                    </div>
                  ) : (
                    /* STATE A: Initial Trigger Button */
                    <button
                      type="button"
                      onClick={handleSendLaunchEmail}
                      disabled={emailSending}
                      className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 active:scale-[0.99] disabled:opacity-70 transition-all cursor-pointer"
                    >
                      {emailSending ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}
