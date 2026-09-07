import {
  CourierAdapter,
  CreateShipmentParams,
  CreateShipmentResult,
  WebhookEventResult,
} from "./types";

export class SelfAdapter implements CourierAdapter {
  public async createShipment(_params: CreateShipmentParams): Promise<CreateShipmentResult> {
    throw new Error(
      "Manual fulfillment only. Courier API is not applicable for self-delivery."
    );
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
