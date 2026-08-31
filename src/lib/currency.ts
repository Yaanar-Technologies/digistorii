/**
 * Formats numeric price into Indian Rupee (INR) currency representation.
 * Example: 4765 -> "₹4,765", 4765.50 -> "₹4,765.50"
 */
export function formatPrice(amount: number | string | null | undefined): string {
  const numericAmount = Number(amount) || 0;
  
  // Format using Indian locale rules (en-IN)
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: numericAmount % 1 === 0 ? 0 : 2,
    minimumFractionDigits: numericAmount % 1 === 0 ? 0 : 2,
  }).format(numericAmount);

  return `₹ ${formatted}`;
}
