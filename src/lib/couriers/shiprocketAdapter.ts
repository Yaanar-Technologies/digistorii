import crypto from "crypto";
import {
  CourierAdapter,
  CourierCredentials,
  CreateShipmentParams,
  CreateShipmentResult,
  ManifestResult,
  NormalizedDeliveryStatus,
  ReturnPickupParams,
  ReturnPickupResult,
  WebhookEventResult,
} from "./types";

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

export class ShiprocketAdapter implements CourierAdapter {
  private readonly baseUrl = "https://apiv2.shiprocket.in/v1/external";
  private static tokenCache = new Map<string, TokenCacheEntry>();

  private isLocalDev(): boolean {
    return (
      process.env.NODE_ENV !== "production" ||
      (process.env.NEXT_PUBLIC_APP_URL || "").includes("localhost")
    );
  }

  /**
   * Validate Shiprocket credentials by attempting authentication.
   */
  public async testConnection(credentials: CourierCredentials): Promise<{ success: boolean; message?: string }> {
    try {
      const token = await this.getAuthToken(credentials.apiKey, credentials.apiSecret);
      return {
        success: !!token,
        message: "Shiprocket authenticated successfully.",
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Failed to authenticate with Shiprocket.",
      };
    }
  }

  /**
   * Authenticate with Shiprocket API with in-memory token caching to eliminate redundant roundtrips.
   * Shiprocket requires email (deliveryApiKey) and password (deliveryApiSecret).
   */
  private async getAuthToken(email?: string, password?: string): Promise<string> {
    if (!email || !password) {
      throw new Error(
        "Shiprocket credentials missing. Both delivery API key (email) and secret (password) are required."
      );
    }

    const cacheKey = `${email}:${password}`;
    const cached = ShiprocketAdapter.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60000) {
      return cached.token;
    }

    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shiprocket authentication failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data?.token) {
      throw new Error("Shiprocket authentication did not return a valid auth token.");
    }

    // Cache token for 8 days (Shiprocket tokens expire in 10 days)
    ShiprocketAdapter.tokenCache.set(cacheKey, {
      token: data.token,
      expiresAt: Date.now() + 8 * 24 * 60 * 60 * 1000,
    });

    return data.token;
  }

  /**
   * Create an ad-hoc custom order/shipment in Shiprocket using dynamic weight and dimensions.
   */
  public async createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult> {
    const token = await this.getAuthToken(params.deliveryApiKey, params.deliveryApiSecret);

    const dateStr = params.orderDate
      ? new Date(params.orderDate).toISOString().slice(0, 19).replace("T", " ")
      : new Date().toISOString().slice(0, 19).replace("T", " ");

    const isCod = typeof params.codAmount === "number" && params.codAmount > 0;

    // Normalize City, State, and Pincode for Chennai / Tamil Nadu
    let city = (params.shippingAddress.city || "").trim();
    let state = (params.shippingAddress.state || "").trim();
    const cleanPin = (params.shippingAddress.pincode || "").replace(/\D/g, "").trim();

    const cleanStateLower = state.toLowerCase().replace(/[\s_-]+/g, "");
    const cleanCityLower = city.toLowerCase().replace(/[\s_-]+/g, "");

    if (cleanCityLower === "chennai" || cleanCityLower === "madras" || cleanPin.startsWith("600")) {
      city = "Chennai";
      state = "Tamil Nadu";
    } else if (cleanStateLower === "tamilnadu" || cleanStateLower === "tn") {
      state = "Tamil Nadu";
    }

    // Calculate dynamic dimensions and dead/volumetric weight
    const length = Math.max(0.5, Number(params.lengthCm || 10));
    const breadth = Math.max(0.5, Number(params.widthCm || 10));
    const height = Math.max(0.5, Number(params.heightCm || 10));

    // Shiprocket requires dead weight in kg
    const deadWeightKg = (params.weightGrams ? Number(params.weightGrams) / 1000 : 0.5);
    const volWeightKg = (params.volumetricWeightGrams
      ? Number(params.volumetricWeightGrams) / 1000
      : (length * breadth * height) / 5000);

    const finalWeightKg = Math.max(0.1, Number(Math.max(deadWeightKg, volWeightKg).toFixed(2)));

    const shiprocketOrderPayload = {
      order_id: params.orderNo,
      order_date: dateStr,
      pickup_location: (params.pickupLocationCode || "").trim() || "Primary",
      channel_id: params.channelId || "",
      billing_customer_name: params.shippingAddress.name || "Customer",
      billing_last_name: "",
      billing_address: params.shippingAddress.address_line1,
      billing_address_2: params.shippingAddress.address_line2 || "",
      billing_city: city,
      billing_pincode: cleanPin || params.shippingAddress.pincode,
      billing_state: state,
      billing_country: params.shippingAddress.country || "India",
      billing_email: params.shippingAddress.email || "order@storefront.local",
      billing_phone: params.shippingAddress.phone || "0000000000",
      shipping_is_billing: true,
      order_items: params.items.map((item) => ({
        name: item.name,
        sku: item.sku || item.name,
        units: item.units,
        selling_price: item.selling_price,
        discount: item.discount || 0,
        tax: item.tax || 0,
        hsn: item.hsn || "",
      })),
      payment_method: isCod ? "COD" : "Prepaid",
      sub_total: params.subtotal || params.totalAmount || 0,
      length,
      breadth,
      height,
      weight: finalWeightKg,
    };

    const response = await fetch(`${this.baseUrl}/orders/create/adhoc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(shiprocketOrderPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (this.isLocalDev() && (response.status === 400 || errorText.toLowerCase().includes("kyc"))) {
        console.warn("[Dev Mode] Bypassing Shiprocket KYC check with simulated test shipment");
        const simAwb = `SR-TEST-${Date.now()}`;
        return {
          awbNumber: simAwb,
          trackingUrl: "https://shiprocket.co/tracking/sample",
          estimatedDeliveryAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
          shipmentId: String(Date.now()),
          courierName: "Shiprocket Test Mode",
          courierPartner: "Shiprocket Test Mode",
          shippingLabelUrl: `https://shiprocket.co/shipping-label/${simAwb}`,
        };
      }
      throw new Error(`Shiprocket create shipment failed (${response.status}): ${errorText}`);
    }

    const resData = await response.json();
    const shipmentId = resData.shipment_id || resData.order_id || resData.id;

    let awbCode = resData.awb_code || resData.awb || null;
    let courierName = resData.courier_name || resData.courier_partner || "Shiprocket";
    let shippingLabelUrl = resData.label_url || resData.label_created_url || null;
    let awbTrackingUrl: string | undefined;

    // If AWB code is missing and shipmentId exists, auto-assign AWB & label
    if (!awbCode && shipmentId) {
      try {
        const awbData = await this.generateAwb(shipmentId, {
          apiKey: params.deliveryApiKey,
          apiSecret: params.deliveryApiSecret,
        });
        if (awbData.awbNumber && !awbData.awbNumber.startsWith("SR-AWB-")) {
          awbCode = awbData.awbNumber;
        } else if (awbData.awbNumber) {
          awbCode = awbData.awbNumber;
        }
        if (awbData.courierPartner) {
          courierName = awbData.courierPartner;
        }
        if (awbData.trackingUrl) {
          awbTrackingUrl = awbData.trackingUrl;
        }
      } catch (awbErr: any) {
        console.warn(`[ShiprocketAdapter] Failed to auto-generate AWB for shipment #${shipmentId}:`, awbErr?.message || awbErr);
      }

      try {
        const labelData = await this.generateLabel(shipmentId, {
          apiKey: params.deliveryApiKey,
          apiSecret: params.deliveryApiSecret,
        });
        if (labelData.labelUrl) {
          shippingLabelUrl = labelData.labelUrl;
        }
      } catch (labelErr: any) {
        console.warn(`[ShiprocketAdapter] Failed to auto-generate label for shipment #${shipmentId}:`, labelErr?.message || labelErr);
      }
    }

    const finalAwb = awbCode || (shipmentId ? `SR-${shipmentId}` : params.orderNo);
    const trackingUrl = awbTrackingUrl || `https://shiprocket.co/tracking/${finalAwb}`;
    if (!shippingLabelUrl && shipmentId) {
      shippingLabelUrl = `https://shiprocket.co/shipping-label/${shipmentId}`;
    }

    let estimatedDeliveryAt: Date | null = null;
    if (resData.etd || resData.expected_delivery_date) {
      estimatedDeliveryAt = new Date(resData.etd || resData.expected_delivery_date);
    }

    return {
      awbNumber: String(finalAwb),
      trackingUrl,
      estimatedDeliveryAt,
      shipmentId: shipmentId ? String(shipmentId) : undefined,
      courierName,
      courierPartner: courierName,
      shippingLabelUrl: shippingLabelUrl || undefined,
    };
  }

  /**
   * Request / Generate AWB for an existing Shiprocket shipment.
   */
  public async generateAwb(
    shipmentId: string | number,
    credentials?: CourierCredentials
  ): Promise<{ awbNumber: string; courierPartner: string; trackingUrl?: string }> {
    const token = await this.getAuthToken(credentials?.apiKey, credentials?.apiSecret);
    const awbResponse = await fetch(`${this.baseUrl}/courier/assign/awb`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ shipment_id: Number(shipmentId) }),
    });

    // If Shiprocket blocks with 400 KYC required or running locally in development:
    if (this.isLocalDev() && !awbResponse.ok) {
      console.warn("[Dev Mode] Bypassing Shiprocket KYC check with simulated test AWB");
      return {
        awbNumber: `SR-TEST-${Date.now()}`,
        courierPartner: "Shiprocket Test Mode",
        trackingUrl: "https://shiprocket.co/tracking/sample",
      };
    }

    if (!awbResponse.ok) {
      const errText = await awbResponse.text();
      throw new Error(`Shiprocket generate AWB failed: ${errText}`);
    }

    const data = await awbResponse.json();
    const awb = data?.response?.data?.awb_code || data?.awb_code || `SR-AWB-${shipmentId}`;
    const courierPartner = data?.response?.data?.courier_name || "Shiprocket Express";

    return {
      awbNumber: String(awb),
      courierPartner,
      trackingUrl: `https://shiprocket.co/tracking/${awb}`,
    };
  }

  /**
   * Generate printable shipping label for a shipment.
   */
  public async generateLabel(
    shipmentId: string | number,
    credentials?: CourierCredentials
  ): Promise<{ labelUrl: string }> {
    const token = await this.getAuthToken(credentials?.apiKey, credentials?.apiSecret);
    const response = await fetch(`${this.baseUrl}/courier/generate/label`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Shiprocket generate label failed: ${errText}`);
    }

    const data = await response.json();
    const labelUrl = data?.label_url || data?.label_created_url || `https://shiprocket.co/shipping-label/${shipmentId}`;

    return { labelUrl };
  }

  /**
   * Request carrier pickup slot for a shipment.
   */
  public async requestPickup(
    shipmentId: string | number,
    credentials?: CourierCredentials
  ): Promise<{ pickupStatus: string; pickupScheduledAt?: Date }> {
    const token = await this.getAuthToken(credentials?.apiKey, credentials?.apiSecret);
    const response = await fetch(`${this.baseUrl}/courier/generate/pickup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Shiprocket request pickup failed: ${errText}`);
    }

    const data = await response.json();
    const scheduledDate = data?.response?.pickup_scheduled_date
      ? new Date(data.response.pickup_scheduled_date)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      pickupStatus: data?.response?.pickup_status || "SCHEDULED",
      pickupScheduledAt: scheduledDate,
    };
  }

  /**
   * Generate Bulk Manifest for courier handover sign-off.
   */
  public async generateManifest(
    shipmentIds: (string | number)[],
    credentials?: CourierCredentials
  ): Promise<ManifestResult> {
    const token = await this.getAuthToken(credentials?.apiKey, credentials?.apiSecret);
    const numericIds = shipmentIds.map(Number).filter((id) => !isNaN(id));

    const response = await fetch(`${this.baseUrl}/manifests/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ shipment_id: numericIds }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Shiprocket generate manifest failed: ${errText}`);
    }

    const data = await response.json();
    const manifestUrl = data?.manifest_url || "";
    const manifestId = String(data?.manifest_id || data?.id || `SR-MAN-${Date.now()}`);

    return {
      manifestId,
      manifestUrl,
      shipmentCount: numericIds.length,
      courierPartner: "Shiprocket",
      generatedAt: new Date(),
    };
  }

  /**
   * Print / Fetch Manifest URL.
   */
  public async printManifest(
    manifestId: string,
    credentials?: CourierCredentials
  ): Promise<{ manifestUrl: string }> {
    const token = await this.getAuthToken(credentials?.apiKey, credentials?.apiSecret);
    try {
      const response = await fetch(`${this.baseUrl}/manifests/print`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_ids: [manifestId] }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.manifest_url) {
          return { manifestUrl: data.manifest_url };
        }
      }
    } catch {}

    return { manifestUrl: `https://shiprocket.co/manifest/${manifestId}` };
  }

  /**
   * Cancel shipment in Shiprocket by AWB.
   */
  public async cancelShipment(
    awb: string,
    credentials?: CourierCredentials
  ): Promise<boolean> {
    if (!credentials?.apiKey || !credentials?.apiSecret) {
      return false;
    }

    try {
      const token = await this.getAuthToken(credentials.apiKey, credentials.apiSecret);
      const response = await fetch(`${this.baseUrl}/orders/cancel/shipment/awbs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ awbs: [awb] }),
      });

      return response.ok;
    } catch (err) {
      console.error("[ShiprocketAdapter.cancelShipment] Failed:", err);
      return false;
    }
  }

  /**
   * Generate Reverse Return Pickup in Shiprocket.
   */
  public async generateReturnPickup(params: ReturnPickupParams): Promise<ReturnPickupResult> {
    const token = await this.getAuthToken(params.deliveryApiKey, params.deliveryApiSecret);

    const payload = {
      order_id: `RET-${params.orderNo}-${params.returnId}`,
      order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      channel_id: "",
      pickup_customer_name: params.pickupAddress.name || "Customer",
      pickup_last_name: "",
      pickup_address: params.pickupAddress.address_line1,
      pickup_address_2: params.pickupAddress.address_line2 || "",
      pickup_city: params.pickupAddress.city,
      pickup_state: params.pickupAddress.state,
      pickup_country: params.pickupAddress.country || "India",
      pickup_pincode: params.pickupAddress.pincode,
      pickup_email: params.pickupAddress.email || "order@storefront.local",
      pickup_phone: params.pickupAddress.phone || "0000000000",
      order_items: params.items.map((item) => ({
        name: item.name,
        sku: item.sku || item.name,
        units: item.units,
        selling_price: item.selling_price,
        discount: 0,
        tax: 0,
        hsn: item.hsn || "",
      })),
      sub_total: params.items.reduce((acc, i) => acc + i.selling_price * i.units, 0),
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5,
    };

    const response = await fetch(`${this.baseUrl}/orders/create/return`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Shiprocket return pickup failed (${response.status}): ${errText}`);
    }

    const resData = await response.json();
    const returnShipmentId = resData.shipment_id || resData.order_id || resData.id;
    const returnAwb = resData.awb_code || resData.awb || `RET-AWB-${returnShipmentId || Date.now()}`;
    const pickupScheduledDate = resData.pickup_scheduled_date
      ? new Date(resData.pickup_scheduled_date)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      returnAwb: String(returnAwb),
      pickupScheduledDate,
      trackingUrl: `https://shiprocket.co/tracking/${returnAwb}`,
      courierName: resData.courier_name || "Shiprocket Return",
    };
  }

  /**
   * Verify Shiprocket Webhook signature / secret token.
   */
  public verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string
  ): boolean {
    if (!secret) return false;

    const rawApiKey = headers["x-api-key"] || headers["x-api-secret"] || headers["authorization"];
    const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey;

    if (apiKey) {
      const cleanKey = apiKey.startsWith("Bearer ") ? apiKey.slice(7) : apiKey;
      if (cleanKey === secret) {
        return true;
      }
    }

    const rawSig = headers["x-shiprocket-signature"] || headers["x-signature"];
    const sig = Array.isArray(rawSig) ? rawSig[0] : rawSig;

    if (sig) {
      try {
        const expectedSig = crypto
          .createHmac("sha256", secret)
          .update(rawBody)
          .digest("hex");

        if (
          sig.length === expectedSig.length &&
          crypto.timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expectedSig, "utf8"))
        ) {
          return true;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Parse incoming Shiprocket webhook event payload into normalized delivery status with POD and NDR details.
   */
  public parseWebhookEvent(payload: any): WebhookEventResult {
    const awbNumber = String(
      payload?.awb ||
      payload?.awb_code ||
      payload?.shipment_id ||
      payload?.order_id ||
      ""
    ).trim();

    const rawStatus = String(
      payload?.current_status ||
      payload?.status ||
      payload?.event ||
      payload?.current_status_name ||
      ""
    ).toUpperCase();

    const location =
      payload?.location ||
      payload?.current_location ||
      payload?.scans?.[0]?.location ||
      undefined;

    const timestamp = payload?.updated_at || payload?.current_timestamp
      ? new Date(payload.updated_at || payload.current_timestamp)
      : new Date();

    let normalizedStatus: NormalizedDeliveryStatus = "in_transit";

    if (
      rawStatus.includes("DELIVERED") &&
      !rawStatus.includes("RTO") &&
      !rawStatus.includes("UNDELIVERED")
    ) {
      normalizedStatus = "delivered";
    } else if (
      rawStatus.includes("OUT FOR DELIVERY") ||
      rawStatus.includes("OUT_FOR_DELIVERY") ||
      rawStatus.includes("REACHED DESTINATION")
    ) {
      normalizedStatus = "out_for_delivery";
    } else if (
      rawStatus.includes("PICKED UP") ||
      rawStatus.includes("PICKED_UP") ||
      rawStatus.includes("PICKUP DONE")
    ) {
      normalizedStatus = "picked_up";
    } else if (
      rawStatus.includes("UNDELIVERED") ||
      rawStatus.includes("FAILED") ||
      rawStatus.includes("CANCELLED")
    ) {
      normalizedStatus = "failed_delivery";
    } else if (rawStatus.includes("RTO")) {
      normalizedStatus = "rto";
    } else if (
      rawStatus.includes("IN TRANSIT") ||
      rawStatus.includes("IN_TRANSIT") ||
      rawStatus.includes("SHIPPED") ||
      rawStatus.includes("AWB ASSIGNED") ||
      rawStatus.includes("LABEL GENERATED")
    ) {
      normalizedStatus = "in_transit";
    }

    const failureReason =
      payload?.reason ||
      payload?.comment ||
      payload?.remark ||
      payload?.failure_reason ||
      payload?.ndr_reason ||
      undefined;

    let nextRetryDate: Date | undefined = undefined;
    if (payload?.next_attempt_date || payload?.edd || payload?.retry_date) {
      try {
        nextRetryDate = new Date(payload.next_attempt_date || payload.edd || payload.retry_date);
      } catch {
        nextRetryDate = undefined;
      }
    }

    const podResourceUrl =
      payload?.pod ||
      payload?.pod_image ||
      payload?.pod_url ||
      payload?.signature_image ||
      payload?.proof_of_delivery ||
      undefined;

    let podType: "SIGNATURE" | "PHOTO" | "OTP" | undefined = undefined;
    if (payload?.pod_type) {
      const pt = String(payload.pod_type).toUpperCase();
      if (pt === "SIGNATURE" || pt === "PHOTO" || pt === "OTP") {
        podType = pt;
      }
    } else if (podResourceUrl) {
      podType = "PHOTO";
    }

    const deliveredToPersonName =
      payload?.delivered_to ||
      payload?.received_by ||
      payload?.recipient_name ||
      undefined;

    let deliveryCoordinates: { latitude: number; longitude: number } | undefined = undefined;
    if (payload?.lat && payload?.lng) {
      const lat = parseFloat(payload.lat);
      const lng = parseFloat(payload.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        deliveryCoordinates = { latitude: lat, longitude: lng };
      }
    }

    return {
      awbNumber,
      status: normalizedStatus,
      location,
      timestamp,
      rawStatus,
      failureReason,
      nextRetryDate,
      podType,
      podResourceUrl,
      deliveredToPersonName,
      deliveryCoordinates,
    };
  }
}
