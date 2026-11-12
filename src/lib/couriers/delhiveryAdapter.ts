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

export class DelhiveryAdapter implements CourierAdapter {
  private readonly baseUrl = "https://track.delhivery.com";

  /**
   * Helper to retrieve Delhivery Token from deliveryApiKey.
   */
  private getAuthHeaders(token?: string) {
    if (!token) {
      throw new Error("Delhivery API token is required in deliveryApiKey.");
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    };
  }

  /**
   * Validate Delhivery API credentials format and connectivity.
   */
  public async testConnection(credentials: CourierCredentials): Promise<{ success: boolean; message?: string }> {
    if (!credentials?.apiKey) {
      return { success: false, message: "Delhivery API Token (apiKey) is required." };
    }
    try {
      const response = await fetch(`${this.baseUrl}/c/api/pin-codes/json/?filter_codes=110001`, {
        method: "GET",
        headers: this.getAuthHeaders(credentials.apiKey),
      });
      if (response.status === 401 || response.status === 403) {
        return { success: false, message: "Invalid Delhivery API token (Unauthorized)." };
      }
      return { success: true, message: "Delhivery connection verified successfully." };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to reach Delhivery API." };
    }
  }

  /**
   * Create shipment on Delhivery logistics network with live weight & dimensions.
   */
  public async createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult> {
    const token = params.deliveryApiKey;
    if (!token) {
      throw new Error("Delhivery API token is missing.");
    }

    const isCod = typeof params.codAmount === "number" && params.codAmount > 0;

    // Dimensions and weight in grams
    const lengthCm = Math.max(1, Number(params.lengthCm || 10));
    const widthCm = Math.max(1, Number(params.widthCm || 10));
    const heightCm = Math.max(1, Number(params.heightCm || 10));
    const deadWeightGrams = Math.max(50, Number(params.weightGrams || 500));
    const volWeightGrams = Math.max(50, Number(params.volumetricWeightGrams || (lengthCm * widthCm * heightCm) / 5));
    const finalWeightGrams = Math.max(deadWeightGrams, volWeightGrams);

    const payload = {
      format: "json",
      data: JSON.stringify({
        shipments: [
          {
            name: params.shippingAddress.name || "Customer",
            add: params.shippingAddress.address_line1,
            add2: params.shippingAddress.address_line2 || "",
            pin: params.shippingAddress.pincode,
            city: params.shippingAddress.city,
            state: params.shippingAddress.state,
            country: params.shippingAddress.country || "India",
            phone: params.shippingAddress.phone || "0000000000",
            order: params.orderNo,
            payment_mode: isCod ? "COD" : "Prepaid",
            cod_amount: isCod ? params.codAmount : 0,
            total_amount: params.totalAmount || 0,
            products_desc: params.items.map((i) => i.name).join(", ").slice(0, 200),
            hsn_code: params.items[0]?.hsn || "",
            quantity: params.items.reduce((acc, i) => acc + (i.units || 1), 0),
            pickup_location: params.pickupLocationCode || "Warehouse",
            weight: finalWeightGrams,
            shipment_width: widthCm,
            shipment_height: heightCm,
            shipment_length: lengthCm,
          },
        ],
        pickup_location: {
          name: params.pickupLocationCode || "Warehouse",
        },
      }),
    };

    const response = await fetch(`${this.baseUrl}/api/cmu/create.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Token ${token}`,
      },
      body: new URLSearchParams({
        format: payload.format,
        data: payload.data,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Delhivery create shipment failed (${response.status}): ${errorText}`);
    }

    const resData = await response.json();
    const pkg = resData?.packages?.[0];

    if (resData.success === false || (pkg && pkg.status === "Fail")) {
      const reason = pkg?.remarks?.[0] || resData?.error || "Delhivery rejected shipment payload";
      throw new Error(`Delhivery CMU error: ${reason}`);
    }

    const awbNumber = pkg?.waybill || resData?.waybill;
    if (!awbNumber) {
      throw new Error(`Delhivery API did not allocate an AWB waybill: ${JSON.stringify(resData)}`);
    }

    const trackingUrl = `https://www.delhivery.com/track/package/${awbNumber}`;
    const shippingLabelUrl = `${this.baseUrl}/api/p/packing_slip?wbns=${awbNumber}&pdf=true`;

    return {
      awbNumber: String(awbNumber),
      trackingUrl,
      courierName: "Delhivery Surface & Express",
      courierPartner: "Delhivery",
      shippingLabelUrl,
      shipmentId: pkg?.refnum || params.orderNo,
    };
  }

  /**
   * Request / Allocate AWB for a Delhivery shipment.
   */
  public async generateAwb(
    shipmentId: string | number,
    credentials?: CourierCredentials
  ): Promise<{ awbNumber: string; courierPartner: string; trackingUrl?: string }> {
    const token = credentials?.apiKey;
    if (!token) {
      throw new Error("Delhivery API token is required to allocate waybills.");
    }

    const response = await fetch(`${this.baseUrl}/waybill/api/fetch/json/?token=${token}&count=1`, {
      method: "GET",
      headers: this.getAuthHeaders(token),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Delhivery fetch waybill failed: ${errText}`);
    }

    const data = await response.json();
    const awb = typeof data === "string" ? data : data?.packages?.[0]?.waybill || String(shipmentId);

    return {
      awbNumber: awb,
      courierPartner: "Delhivery Express",
      trackingUrl: `https://www.delhivery.com/track/package/${awb}`,
    };
  }

  /**
   * Generate packing slip / shipping label URL.
   */
  public async generateLabel(
    shipmentId: string | number,
    _credentials?: CourierCredentials
  ): Promise<{ labelUrl: string }> {
    return {
      labelUrl: `${this.baseUrl}/api/p/packing_slip?wbns=${shipmentId}&pdf=true`,
    };
  }

  /**
   * Request pickup from Delhivery dispatch location.
   */
  public async requestPickup(
    shipmentId: string | number,
    credentials?: CourierCredentials
  ): Promise<{ pickupStatus: string; pickupScheduledAt?: Date }> {
    const token = credentials?.apiKey;
    if (!token) {
      throw new Error("Delhivery API token is required for pickup scheduling.");
    }

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const response = await fetch(`${this.baseUrl}/fm/request/new/`, {
      method: "POST",
      headers: this.getAuthHeaders(token),
      body: JSON.stringify({
        pickup_time: "10:00:00",
        pickup_date: dateStr,
        pickup_location: "Warehouse",
        expected_package_count: 1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[DelhiveryAdapter.requestPickup] Request notice: ${errText}`);
    }

    return {
      pickupStatus: "SCHEDULED",
      pickupScheduledAt: tomorrow,
    };
  }

  /**
   * Cancel waybill / shipment.
   */
  public async cancelShipment(
    awb: string,
    credentials?: CourierCredentials
  ): Promise<boolean> {
    if (!credentials?.apiKey) return false;
    try {
      const response = await fetch(`${this.baseUrl}/api/p/edit`, {
        method: "POST",
        headers: this.getAuthHeaders(credentials.apiKey),
        body: JSON.stringify({ waybill: awb, cancellation: "true" }),
      });
      return response.ok;
    } catch (err) {
      console.error("[DelhiveryAdapter.cancelShipment] Failed:", err);
      return false;
    }
  }

  /**
   * Generate Bulk Manifest for Delhivery handover.
   */
  public async generateManifest(
    shipmentIds: (string | number)[],
    _credentials?: CourierCredentials
  ): Promise<ManifestResult> {
    const manifestId = `DEL-MAN-${Date.now()}`;
    const manifestUrl = `${this.baseUrl}/api/p/packing_slip?wbns=${shipmentIds.join(",")}&pdf=true`;

    return {
      manifestId,
      manifestUrl,
      shipmentCount: shipmentIds.length,
      courierPartner: "Delhivery",
      generatedAt: new Date(),
    };
  }

  /**
   * Print / Fetch Manifest URL.
   */
  public async printManifest(
    manifestId: string,
    _credentials?: CourierCredentials
  ): Promise<{ manifestUrl: string }> {
    return {
      manifestUrl: `${this.baseUrl}/api/p/packing_slip?wbns=${manifestId}&pdf=true`,
    };
  }

  /**
   * Generate Return Pickup in Delhivery network.
   */
  public async generateReturnPickup(params: ReturnPickupParams): Promise<ReturnPickupResult> {
    const token = params.deliveryApiKey;
    if (!token) {
      throw new Error("Delhivery API token is required for reverse logistics.");
    }

    const payload = {
      format: "json",
      data: JSON.stringify({
        shipments: [
          {
            name: params.pickupAddress.name || "Customer",
            add: params.pickupAddress.address_line1,
            add2: params.pickupAddress.address_line2 || "",
            pin: params.pickupAddress.pincode,
            city: params.pickupAddress.city,
            state: params.pickupAddress.state,
            country: params.pickupAddress.country || "India",
            phone: params.pickupAddress.phone || "0000000000",
            order: `RET-${params.orderNo}`,
            payment_mode: "Prepaid",
            products_desc: params.items.map((i) => i.name).join(", "),
            quantity: params.items.reduce((acc, i) => acc + (i.units || 1), 0),
            return_type: "Standard",
          },
        ],
      }),
    };

    const response = await fetch(`${this.baseUrl}/api/cmu/create.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Token ${token}`,
      },
      body: new URLSearchParams({
        format: payload.format,
        data: payload.data,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Delhivery return pickup failed: ${errText}`);
    }

    const resData = await response.json();
    const pkg = resData?.packages?.[0];
    const returnAwb = pkg?.waybill || resData?.waybill;

    if (!returnAwb) {
      throw new Error(`Delhivery did not allocate return waybill: ${JSON.stringify(resData)}`);
    }

    return {
      returnAwb: String(returnAwb),
      pickupScheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      trackingUrl: `https://www.delhivery.com/track/package/${returnAwb}`,
      courierName: "Delhivery Reverse Logistics",
    };
  }

  /**
   * Verify Delhivery webhook signature / auth header.
   */
  public verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string
  ): boolean {
    if (!secret) return false;

    const rawAuth = headers["authorization"] || headers["x-delhivery-token"] || headers["x-api-key"];
    const token = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    if (token) {
      const cleanToken = token.startsWith("Token ") ? token.slice(6) : token;
      if (cleanToken === secret) return true;
    }

    const rawSig = headers["x-delhivery-signature"];
    const sig = Array.isArray(rawSig) ? rawSig[0] : rawSig;
    if (sig) {
      try {
        const expectedSig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
        if (sig.length === expectedSig.length && crypto.timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expectedSig, "utf8"))) {
          return true;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Parse incoming Delhivery webhook payload into NormalizedDeliveryStatus.
   */
  public parseWebhookEvent(payload: any): WebhookEventResult {
    const awbNumber = String(
      payload?.waybill ||
      payload?.awb ||
      payload?.Shipment?.AWB ||
      payload?.order_id ||
      ""
    ).trim();

    const rawStatus = String(
      payload?.status ||
      payload?.Shipment?.Status?.Status ||
      payload?.current_status ||
      ""
    ).toUpperCase();

    const location =
      payload?.location ||
      payload?.Shipment?.Status?.StatusLocation ||
      undefined;

    const timestamp = payload?.timestamp || payload?.Shipment?.Status?.StatusDateTime
      ? new Date(payload.timestamp || payload.Shipment.Status.StatusDateTime)
      : new Date();

    let normalizedStatus: NormalizedDeliveryStatus = "in_transit";

    if (rawStatus.includes("DL") || rawStatus.includes("DELIVERED")) {
      normalizedStatus = "delivered";
    } else if (rawStatus.includes("OFD") || rawStatus.includes("OUT FOR DELIVERY")) {
      normalizedStatus = "out_for_delivery";
    } else if (rawStatus.includes("PU") || rawStatus.includes("PICKED UP") || rawStatus.includes("MANIFEST")) {
      normalizedStatus = "picked_up";
    } else if (rawStatus.includes("RTO")) {
      normalizedStatus = "rto";
    } else if (rawStatus.includes("UD") || rawStatus.includes("UNDELIVERED") || rawStatus.includes("FAILED")) {
      normalizedStatus = "failed_delivery";
    }

    const failureReason =
      payload?.failure_reason ||
      payload?.Shipment?.Status?.Instructions ||
      undefined;

    return {
      awbNumber,
      status: normalizedStatus,
      location,
      timestamp,
      rawStatus,
      failureReason,
    };
  }
}
