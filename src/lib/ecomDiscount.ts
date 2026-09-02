export type EcomDiscountInfo = {
  id?: number | string;
  name?: string;
  discount_type: "percentage" | "fixed";
  value: number;
  priority?: number;
};

export type CalculatedEcomPricing = {
  originalPrice: number;
  effectivePrice: number;
  isOnSale: boolean;
  discountValue: number;
  discountType?: "percentage" | "fixed";
  discountBadgeText?: string;
  savingsAmount: number;
};

const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;

/**
 * Computes e-commerce effective pricing matching POS billing line calculation.
 * 
 * POS Billing Math for 1 unit:
 *   unit_price (pre-tax)
 *   perUnitDiscount = percentage ? (unit_price * val / 100) : val
 *   taxable = unit_price - perUnitDiscount
 *   tax_amount = taxable * tax_percent / 100
 *   effective_price = taxable + tax_amount
 */
export function calculateEcomPricing(
  rawOriginalPrice: number,
  rawUnitPrice: number | null | undefined,
  rawTaxPercent: number | null | undefined,
  discount?: EcomDiscountInfo | null
): CalculatedEcomPricing {
  const originalPrice = round2(Math.max(0, Number(rawOriginalPrice || 0)));
  const taxPercent = Math.max(0, Number(rawTaxPercent || 0));

  let unitPrice = rawUnitPrice != null ? Number(rawUnitPrice) : 0;
  if (!unitPrice || unitPrice <= 0) {
    unitPrice = taxPercent > 0 ? originalPrice / (1 + taxPercent / 100) : originalPrice;
  }
  unitPrice = Math.max(0, unitPrice);

  if (!discount || !discount.discount_type || Number(discount.value) <= 0) {
    return {
      originalPrice,
      effectivePrice: originalPrice,
      isOnSale: false,
      discountValue: 0,
      savingsAmount: 0,
    };
  }

  const discountValue = Number(discount.value);
  let perUnitDiscount = 0;

  if (discount.discount_type === "percentage") {
    perUnitDiscount = (unitPrice * discountValue) / 100;
  } else if (discount.discount_type === "fixed") {
    perUnitDiscount = discountValue;
  }

  perUnitDiscount = Math.min(perUnitDiscount, unitPrice);
  const taxableAmount = Math.max(0, unitPrice - perUnitDiscount);
  const taxAmount = (taxableAmount * taxPercent) / 100;
  const calculatedEffectivePrice = round2(taxableAmount + taxAmount);

  if (calculatedEffectivePrice < originalPrice) {
    const savingsAmount = round2(originalPrice - calculatedEffectivePrice);
    const discountBadgeText =
      discount.discount_type === "percentage"
        ? `${discountValue}% OFF`
        : `${discountValue} OFF`;

    return {
      originalPrice,
      effectivePrice: calculatedEffectivePrice,
      isOnSale: true,
      discountValue,
      discountType: discount.discount_type,
      discountBadgeText,
      savingsAmount,
    };
  }

  return {
    originalPrice,
    effectivePrice: originalPrice,
    isOnSale: false,
    discountValue: 0,
    savingsAmount: 0,
  };
}
