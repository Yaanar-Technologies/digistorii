export type RuleDefinition = {
  key: string;
  regex?: RegExp;
  validate?: (value: string) => boolean;
  message: string;
};

export const ruleDefinitions: Record<string, RuleDefinition> = {
  code: {
    key: "code",
    regex: /[\s~`!@#$%^&*()+=\[\]{}|;:'",<>?/\\]/,
    message: "Only letters, numbers, hyphens and underscores are allowed.",
  },
  "no-symbols": {
    key: "no-symbols",
    regex: /[^a-zA-Z0-9\s]/,
    message: "Special symbols are not allowed.",
  },
  "tax-value": {
    key: "tax-value",
    regex: /[^a-zA-Z0-9\s%.()_,\'@-]/,
    message: "Only letters, numbers, spaces, %, commas, @, and apostrophes are allowed.",
  },
  "alpha-name": {
    key: "alpha-name",
    regex: /[^a-zA-Z\s.,'-]/,
    message: "Only letters, spaces, dots, hyphens and commas are allowed.",
  },
  "alpha-spaces-hyphens": {
    key: "alpha-spaces-hyphens",
    regex: /[^a-zA-Z\s.,'-]/,
    message: "Only letters, spaces, hyphens and commas are allowed.",
  },
  "alphanumeric-spaces-hyphens": {
    key: "alphanumeric-spaces-hyphens",
    regex: /[^a-zA-Z0-9\s.,'/-]/,
    message: "Only letters, numbers, spaces, hyphens and commas are allowed.",
  },
  "numeric-string": {
    key: "numeric-string",
    regex: /[^0-9]/,
    message: "Only numeric values are allowed.",
  },
  "positive-integer": {
    key: "positive-integer",
    validate: (value) => /^\d+$/.test(value) && Number(value) > 0,
    message: "Only positive whole numbers are allowed.",
  },
  "decimal-number": {
    key: "decimal-number",
    validate: (value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) >= 0,
    message: "Only positive decimal values are allowed.",
  },
  percentage: {
    key: "percentage",
    validate: (value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) >= 0 && Number(value) <= 100,
    message: "Percentage must be between 0 and 100.",
  },
  "range-1-30": {
    key: "range-1-30",
    validate: (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 30,
    message: "Value must be between 1 and 30.",
  },
  email: {
    key: "email",
    validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: "Please enter a valid email address.",
  },
  phone: {
    key: "phone",
    validate: (value) => /^\d{10}$/.test(value),
    message: "Must be only 10 digit numbers",
  },
  boolean: {
    key: "boolean",
    validate: (value) => ["true", "false", "1", "0", "yes", "no"].includes(value.toLowerCase()),
    message: "Only true or false values are allowed.",
  },
  date: {
    key: "date",
    validate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
    message: "Please select a valid date.",
  },
  "enum-global-local": {
    key: "enum-global-local",
    validate: (value) => ["global", "local"].includes(value.toLowerCase()),
    message: "Only global or local values are allowed.",
  },
  "enum-payment-type": {
    key: "enum-payment-type",
    validate: (value) => ["immediate", "days", "month"].includes(value.toLowerCase()),
    message: "Only immediate, days or month values are allowed.",
  },
  "enum-locator-type": {
    key: "enum-locator-type",
    validate: (value) =>
      ["receiving", "main_storage", "bulk_storage", "despatch", "return_area", "scrap"].includes(value),
    message: "Only the supported locator types are allowed.",
  },
  "no-script": {
    key: "no-script",
    regex: /<script|javascript:/i,
    message: "Script tags and JavaScript are not allowed.",
  },
  'fax-phone': {
    key: "fax-phone",
    regex: /[^0-9\s()+-]/g,
    message: "Invalid characters. Only numbers, spaces, hyphens, (), and + are allowed."
  },
  "alphanumeric": {
    key: "alphanumeric",
    regex: /[^a-zA-Z0-9]/,
    message: "Only letters and numbers are allowed.",
  },
  "pincode-6": {
    key: "pincode-6",
    validate: (value) => /^[0-9]{1,6}$/.test(value),
    message: "Pincode must be 6 digits.",
  },
  "india-only": {
    key: "india-only",
    validate: (value) => value.toLowerCase() === "india",
    message: "Service is currently only available in India.",
  },
  "min-10-digits": {
    key: "min-10-digits",
    validate: (value) => value.replace(/\D/g, '').length >= 10,
    message: "Must be at least 10 digits.",
  },
};

export function getRuleValidationError(rules: string | string[] | null | undefined, value: string) {
  if (!value || !value.trim()) return null;

  const ruleKeys = typeof rules === "string" ? rules.split(/\s+/).filter(Boolean) : rules || [];

  for (const ruleKey of ruleKeys) {
    const definition = ruleDefinitions[ruleKey];
    if (!definition) continue;

    const normalizedValue = value.trim();
    const invalid = definition.validate
      ? !definition.validate(normalizedValue)
      : Boolean(definition.regex && definition.regex.test(normalizedValue));

    if (invalid) {
      return definition.message;
    }
  }

  return null;
}

export function attachRuleValidationListeners(
  container: HTMLElement | null,
  onChange: (fieldName: string, message: string | null) => void
) {
  if (!container) return () => undefined;

  const handler = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target || !("value" in target)) return;

    const fieldName =
      target.getAttribute("data-field") ||
      target.getAttribute("name") ||
      target.getAttribute("id") ||
      "";
    const rules = target.getAttribute("data-rules") || "";

    // If there are no validation rules on this field, don't clear or set errors
    if (!rules) return;

    const value = (target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

    // Check required fields along with your rule checks
    let message = null;
    if (!value.trim()) {
      if (target.getAttribute("data-optional") !== "true") {
        message = `${fieldName.replace("_", " ").toUpperCase()} is required`;
      }
    } else {
      message = getRuleValidationError(rules, value);
    }

    onChange(fieldName, message);
  };

  // Use 'blur' with true (capturing phase) so it works on a parent form container
  container.addEventListener("blur", handler, true);

  return () => {
    container.removeEventListener("blur", handler, true);
  };
}