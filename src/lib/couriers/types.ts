export interface ShipmentItem {
  name: string;
  sku?: string;
  units: number;
  selling_price: number;
  discount?: number;
  tax?: number;
  hsn?: string;
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
}

export interface CreateShipmentResult {
  awbNumber: string;
  trackingUrl?: string;
  estimatedDeliveryAt?: Date | null;
  shipmentId?: string | number;
  courierName?: string;
}

export type NormalizedDeliveryStatus =
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
}

export interface CourierAdapter {
  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult>;
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string
  ): boolean;
  parseWebhookEvent(payload: any): WebhookEventResult;
}
