import { CourierAdapter } from "./types";
import { ShiprocketAdapter } from "./shiprocketAdapter";
import { DelhiveryAdapter } from "./delhiveryAdapter";
import { SelfAdapter } from "./selfAdapter";

export * from "./types";
export * from "./shiprocketAdapter";
export * from "./delhiveryAdapter";
export * from "./selfAdapter";

const shiprocketInstance = new ShiprocketAdapter();
const delhiveryInstance = new DelhiveryAdapter();
const selfInstance = new SelfAdapter();

/**
 * Factory function to retrieve the appropriate CourierAdapter instance.
 *
 * @param deliveryPartner - 'shiprocket' | 'delhivery' | 'self' | null | undefined
 */
export function getCourierAdapter(deliveryPartner?: string | null): CourierAdapter {
  const normalized = (deliveryPartner || "").trim().toLowerCase();

  switch (normalized) {
    case "shiprocket":
      return shiprocketInstance;
    case "delhivery":
      return delhiveryInstance;
    case "self":
    case "":
      return selfInstance;
    default:
      throw new Error(
        `Unsupported delivery partner: '${deliveryPartner}'. Valid options are 'shiprocket', 'delhivery', 'self', or null.`
      );
  }
}
