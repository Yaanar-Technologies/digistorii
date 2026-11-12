export interface ShipmentItem {
  name: string;
  sku?: string;
  units: number;
  selling_price: number;
  discount?: number;
  tax?: number;
  hsn?: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  weightGrams?: number;
}

export interface ShipmentShippingAddress {
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  phone: string;
  email?: string;
}

export interface CourierCredentials {
  apiKey?: string;
  apiSecret?: string;
}

export interface CreateShipmentParams {
  orderNo: string;
  orderDate?: string | Date;
  channelId?: string;
  items: ShipmentItem[];
  shippingAddress: ShipmentShippingAddress;
  pickupLocationCode?: string;
  codAmount?: number;
  subtotal?: number;
  totalAmount?: number;
  deliveryApiKey?: string;
  deliveryApiSecret?: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  weightGrams?: number;
  volumetricWeightGrams?: number;
}

export interface CreateShipmentResult {
  awbNumber: string;
  trackingUrl?: string;
  estimatedDeliveryAt?: Date | null;
  shipmentId?: string | number;
  courierName?: string;
  courierPartner?: string;
  shippingLabelUrl?: string;
}

export interface ManifestResult {
  manifestId: string;
  manifestUrl?: string;
  shipmentCount?: number;
  courierPartner?: string;
  generatedAt?: Date;
}

export interface ReturnPickupParams {
  orderNo: string;
  returnId: number | string;
  pickupAddress: ShipmentShippingAddress;
  deliveryApiKey?: string;
  deliveryApiSecret?: string;
  items: ShipmentItem[];
  reason?: string;
}

export interface ReturnPickupResult {
  returnAwb: string;
  pickupScheduledDate?: Date | null;
  trackingUrl?: string;
  courierName?: string;
}

export type NormalizedDeliveryStatus =
  | "not_shipped"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "rto";

export interface WebhookEventResult {
  awbNumber: string;
  status: NormalizedDeliveryStatus;
  location?: string;
  timestamp: Date;
  rawStatus?: string;
  failureReason?: string;
  nextRetryDate?: Date;
  podType?: "SIGNATURE" | "PHOTO" | "OTP";
  podResourceUrl?: string;
  deliveredToPersonName?: string;
  deliveryCoordinates?: { latitude: number; longitude: number };
}

export interface CourierAdapter {
  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult>;
  testConnection(credentials: CourierCredentials): Promise<{ success: boolean; message?: string }>;
  generateAwb?(
    shipmentId: string | number,
    credentials?: CourierCredentials
  ): Promise<{ awbNumber: string; courierPartner: string; trackingUrl?: string }>;
  generateLabel?(
    shipmentId: string | number,
    credentials?: CourierCredentials
  ): Promise<{ labelUrl: string }>;
  requestPickup?(
    shipmentId: string | number,
    credentials?: CourierCredentials
  ): Promise<{ pickupStatus: string; pickupScheduledAt?: Date }>;
  generateManifest?(
    shipmentIds: (string | number)[],
    credentials?: CourierCredentials
  ): Promise<ManifestResult>;
  printManifest?(
    manifestId: string,
    credentials?: CourierCredentials
  ): Promise<{ manifestUrl: string }>;
  cancelShipment(
    awb: string,
    credentials?: CourierCredentials
  ): Promise<boolean>;
  generateReturnPickup(params: ReturnPickupParams): Promise<ReturnPickupResult>;
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string
  ): boolean;
  parseWebhookEvent(payload: any): WebhookEventResult;
}
