/**
 * Utility functions for Google Fonts dynamic URL construction and CSS font-family styling.
 */

export function getGoogleFontUrl(fontFamily?: string): string | null {
  if (!fontFamily) return null;
  const cleaned = fontFamily.trim();
  const lower = cleaned.toLowerCase();

  // System fonts that do not require Google Fonts stylesheet loading
  if (
    lower === "serif" ||
    lower === "sans-serif" ||
    lower === "monospace" ||
    lower === "georgia" ||
    lower === "arial" ||
    lower === "times new roman" ||
    lower === "system-ui"
  ) {
    return null;
  }

  // Construct Google Fonts CSS2 API URL with display=swap
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleaned)}:wght@400;500;600;700&display=swap`;
}

export function getFontFamilyCss(fontFamily?: string): string {
  if (!fontFamily) return "Inter, sans-serif";
  const cleaned = fontFamily.trim();
  const lower = cleaned.toLowerCase();
  if (lower === "serif" || lower === "georgia") {
    return "Georgia, serif";
  }
  return `"${cleaned}", sans-serif`;
}
