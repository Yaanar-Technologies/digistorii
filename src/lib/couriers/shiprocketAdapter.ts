import crypto from "crypto";
import {
  CourierAdapter,
  CreateShipmentParams,
  CreateShipmentResult,
  NormalizedDeliveryStatus,
  WebhookEventResult,
} from "./types";

export class ShiprocketAdapter implements CourierAdapter {
  private readonly baseUrl = "https://apiv2.shiprocket.in/v1/external";

  /**
   * Authenticate with Shiprocket API using tenant's API credentials.
   * Shiprocket requires an email (deliveryApiKey) and password (deliveryApiSecret)
   * to generate a short-lived Bearer token.
   */
  private async getAuthToken(email?: string, password?: string): Promise<string> {
    if (!email || !password) {
      throw new Error(
        "Shiprocket credentials missing. Both delivery API key (email) and secret (password) are required."
      );
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

    return data.token;
  }

  /**
   * Create an ad-hoc custom order/shipment in Shiprocket.
   */
  public async createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult> {
    const token = await this.getAuthToken(params.deliveryApiKey, params.deliveryApiSecret);

    const dateStr = params.orderDate
      ? new Date(params.orderDate).toISOString().slice(0, 19).replace("T", " ")
      : new Date().toISOString().slice(0, 19).replace("T", " ");

    const isCod = typeof params.codAmount === "number" && params.codAmount > 0;

    const shiprocketOrderPayload = {
      order_id: params.orderNo,
      order_date: dateStr,
      pickup_location: params.pickupLocationCode || "Primary",
      channel_id: params.channelId || "",
      billing_customer_name: params.shippingAddress.name || "Customer",
      billing_last_name: "",
      billing_address: params.shippingAddress.address_line1,
      billing_address_2: params.shippingAddress.address_line2 || "",
      billing_city: params.shippingAddress.city,
      billing_pincode: params.shippingAddress.pincode,
      billing_state: params.shippingAddress.state,
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
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5,
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
      throw new Error(`Shiprocket create shipment failed (${response.status}): ${errorText}`);
    }

    const resData = await response.json();
    const shipmentId = resData.shipment_id || resData.order_id || resData.id;
    const awbCode = resData.awb_code || resData.awb || (shipmentId ? `SR-${shipmentId}` : params.orderNo);
    const trackingUrl = `https://shiprocket.co/tracking/${awbCode}`;

    let estimatedDeliveryAt: Date | null = null;
    if (resData.etd || resData.expected_delivery_date) {
      estimatedDeliveryAt = new Date(resData.etd || resData.expected_delivery_date);
    }

    return {
      awbNumber: String(awbCode),
      trackingUrl,
      estimatedDeliveryAt,
      shipmentId: shipmentId ? String(shipmentId) : undefined,
      courierName: resData.courier_name || "Shiprocket",
    };
  }

  /**
   * Verify Shiprocket Webhook signature / secret token.
   * Shiprocket supports x-api-key header or SHA256 HMAC header verification.
   */
  public verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string
  ): boolean {
    if (!secret) return false;

    // 1. Check direct x-api-key or authorization header configured in Shiprocket webhook settings
    const rawApiKey = headers["x-api-key"] || headers["x-api-secret"] || headers["authorization"];
    const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey;

    if (apiKey) {
      const cleanKey = apiKey.startsWith("Bearer ") ? apiKey.slice(7) : apiKey;
      if (cleanKey === secret) {
        return true;
      }
    }

    // 2. Check HMAC signature if Shiprocket sends custom HMAC header (x-shiprocket-signature)
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
   * Parse incoming Shiprocket webhook event payload into normalized delivery status.
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

    return {
      awbNumber,
      status: normalizedStatus,
      location,
      timestamp,
      rawStatus,
    };
  }
}
