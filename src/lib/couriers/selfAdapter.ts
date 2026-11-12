import {
  CourierAdapter,
  CourierCredentials,
  CreateShipmentParams,
  CreateShipmentResult,
  ManifestResult,
  ReturnPickupParams,
  ReturnPickupResult,
  WebhookEventResult,
} from "./types";

export class SelfAdapter implements CourierAdapter {
  public async testConnection(_credentials: CourierCredentials): Promise<{ success: boolean; message?: string }> {
    return {
      success: true,
      message: "Self delivery requires no external API credentials.",
    };
  }

  public async createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult> {
    const awbNumber = `SELF-${params.orderNo}-${Date.now().toString().slice(-4)}`;
    const estimatedDeliveryAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      awbNumber,
      trackingUrl: "",
      estimatedDeliveryAt,
      shipmentId: params.orderNo,
      courierName: "Self / In-House Driver",
      courierPartner: "Self Delivery",
      shippingLabelUrl: "",
    };
  }

  public async generateAwb(
    shipmentId: string | number
  ): Promise<{ awbNumber: string; courierPartner: string; trackingUrl?: string }> {
    return {
      awbNumber: `SELF-${shipmentId}-${Date.now().toString().slice(-4)}`,
      courierPartner: "Self / Store Driver",
      trackingUrl: "",
    };
  }

  public async generateLabel(
    _shipmentId: string | number
  ): Promise<{ labelUrl: string }> {
    return { labelUrl: "" };
  }

  public async requestPickup(
    _shipmentId: string | number
  ): Promise<{ pickupStatus: string; pickupScheduledAt?: Date }> {
    return {
      pickupStatus: "READY_FOR_STORE_PICKUP",
      pickupScheduledAt: new Date(),
    };
  }

  public async generateManifest(
    shipmentIds: (string | number)[],
    _credentials?: CourierCredentials
  ): Promise<ManifestResult> {
    const manifestId = `MAN-SELF-${Date.now().toString().slice(-6)}`;
    return {
      manifestId,
      manifestUrl: "",
      shipmentCount: shipmentIds.length,
      courierPartner: "Self Delivery",
      generatedAt: new Date(),
    };
  }

  public async printManifest(
    _manifestId: string,
    _credentials?: CourierCredentials
  ): Promise<{ manifestUrl: string }> {
    return { manifestUrl: "" };
  }

  public async cancelShipment(
    _awb: string,
    _credentials?: CourierCredentials
  ): Promise<boolean> {
    return true;
  }

  public async generateReturnPickup(params: ReturnPickupParams): Promise<ReturnPickupResult> {
    const returnAwb = `RET-SELF-${params.orderNo}-${Date.now().toString().slice(-6)}`;
    return {
      returnAwb,
      pickupScheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      courierName: "Self Delivery Return",
      trackingUrl: "",
    };
  }

  public verifyWebhookSignature(
    _rawBody: string,
    _headers: Record<string, string | string[] | undefined>,
    _secret: string
  ): boolean {
    return false;
  }

  public parseWebhookEvent(_payload: any): WebhookEventResult {
    throw new Error("Webhooks are not supported for self-delivery.");
  }
}
