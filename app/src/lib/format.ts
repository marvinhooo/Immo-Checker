/**
 * Helper functions for German locale formatting (EUR, %, numbers) and parsing.
 */

const locale = 'de-DE';

export function formatEUR(value: number, fractionDigits: number = 0): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits: number = 2): string {
  // We assume the percentage is input as e.g. 3.5 for 3.5%, not 0.035
  const normalizedValue = value / 100;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(normalizedValue);
}

export function formatNumber(value: number, fractionDigits: number = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function parseNumber(value: string): number {
  if (typeof value !== 'string') return typeof value === 'number' ? value : 0;
  
  let cleaned = value.trim();
  if (!cleaned) return 0;

  // Check if it has a currency suffix or percent sign, and remove it
  cleaned = cleaned.replace(/[€%]/g, '').trim();

  // If it has both dot and comma, dot is thousand-separator, comma is decimal-separator
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
  } else if (cleaned.includes(',')) {
    // If only comma, it acts as the decimal separator
    cleaned = cleaned.replace(/,/g, '.');
  } else if (
    cleaned.includes('.') &&
    (cleaned.split('.').length > 2 || /^-?\d{1,3}\.\d{3}$/.test(cleaned))
  ) {
    // German thousands separators: "1.000.000" or "1.234".
    // Keep non-grouped decimals such as "3.5" usable for quick input.
    cleaned = cleaned.replace(/\./g, '');
  }

  // Remove any remaining characters that are not digits, dot, or minus sign
  cleaned = cleaned.replace(/[^\d.-]/g, '');

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}
