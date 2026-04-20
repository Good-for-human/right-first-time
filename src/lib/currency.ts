/**
 * Detect currency symbol and code from a product URL (Amazon storefront or TP-Link).
 * Falls back to USD when no match is found.
 */
export interface CurrencyInfo {
  symbol: string;
  code: string;
}

const DOMAIN_MAP: Array<[string, CurrencyInfo]> = [
  // Euro zone
  ['amazon.de',     { symbol: '€', code: 'EUR' }],
  ['amazon.fr',     { symbol: '€', code: 'EUR' }],
  ['amazon.it',     { symbol: '€', code: 'EUR' }],
  ['amazon.es',     { symbol: '€', code: 'EUR' }],
  ['amazon.nl',     { symbol: '€', code: 'EUR' }],
  ['amazon.be',     { symbol: '€', code: 'EUR' }],
  ['amazon.at',     { symbol: '€', code: 'EUR' }],
  ['amazon.pl',     { symbol: 'zł', code: 'PLN' }],
  ['amazon.se',     { symbol: 'kr', code: 'SEK' }],
  // UK
  ['amazon.co.uk',  { symbol: '£', code: 'GBP' }],
  // Japan
  ['amazon.co.jp',  { symbol: '¥', code: 'JPY' }],
  // Canada
  ['amazon.ca',     { symbol: 'CA$', code: 'CAD' }],
  // Australia
  ['amazon.com.au', { symbol: 'A$', code: 'AUD' }],
  // Mexico
  ['amazon.com.mx', { symbol: 'MX$', code: 'MXN' }],
  // Brazil
  ['amazon.com.br', { symbol: 'R$', code: 'BRL' }],
  // Turkey
  ['amazon.com.tr', { symbol: '₺', code: 'TRY' }],
  // UAE
  ['amazon.ae',     { symbol: 'AED', code: 'AED' }],
  // Saudi Arabia
  ['amazon.sa',     { symbol: 'SAR', code: 'SAR' }],
  // India
  ['amazon.in',     { symbol: '₹', code: 'INR' }],
  // Singapore
  ['amazon.sg',     { symbol: 'S$', code: 'SGD' }],
  // US (default Amazon)
  ['amazon.com',    { symbol: '$', code: 'USD' }],
];

const DEFAULT_CURRENCY: CurrencyInfo = { symbol: '$', code: 'USD' };

/** Common ISO 4217 codes we may see appended by scrapers (e.g. "€259,60 USD"). */
const ISO_4217_CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NOK', 'DKK',
  'PLN', 'TRY', 'INR', 'BRL', 'MXN', 'SGD', 'HKD', 'NZD', 'AED', 'SAR', 'ZAR',
];

/**
 * Remove a trailing currency code that contradicts the detected currency
 * (e.g. strip " USD" when the amount already shows € / currency is EUR).
 */
export function stripConflictingCurrencyLabels(price: string, currency: CurrencyInfo): string {
  if (!price) return '';
  let s = price.trim();
  const others = ISO_4217_CODES.filter((c) => c !== currency.code);
  if (others.length === 0) return s;
  const re = new RegExp(`\\s+(?:${others.join('|')})\\s*$`, 'i');
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(re, '').trim();
  }
  return s;
}

export function detectCurrency(url?: string): CurrencyInfo {
  if (!url) return DEFAULT_CURRENCY;
  const lower = url.toLowerCase();
  for (const [domain, info] of DOMAIN_MAP) {
    if (lower.includes(domain)) return info;
  }
  return DEFAULT_CURRENCY;
}

/**
 * Detect currency from the price string itself (by symbol).
 * Returns null when no symbol is found.
 *
 * Priority: price symbol > URL domain.
 * Use this in SourceDataPanel so that "€259,60" always reads as EUR
 * regardless of what URL domain detection returns.
 */
export function detectCurrencyFromPrice(price?: string): CurrencyInfo | null {
  if (!price) return null;
  if (price.includes('€'))  return { symbol: '€',   code: 'EUR' };
  if (price.includes('£'))  return { symbol: '£',   code: 'GBP' };
  if (price.includes('¥'))  return { symbol: '¥',   code: 'JPY' };
  if (price.includes('₹'))  return { symbol: '₹',   code: 'INR' };
  if (price.includes('₺'))  return { symbol: '₺',   code: 'TRY' };
  if (price.includes('R$')) return { symbol: 'R$',  code: 'BRL' };
  if (price.includes('A$')) return { symbol: 'A$',  code: 'AUD' };
  if (price.includes('CA$'))return { symbol: 'CA$', code: 'CAD' };
  if (price.includes('S$')) return { symbol: 'S$',  code: 'SGD' };
  if (price.includes('$'))  return { symbol: '$',   code: 'USD' };
  return null;
}

/**
 * Format a raw price string with the correct currency symbol.
 * If the price already contains a symbol (€, £, $, ¥…), returns it as-is.
 * Otherwise prepends the detected symbol.
 */
export function formatPrice(price: string, currency: CurrencyInfo): string {
  if (!price) return '';
  const cleaned = stripConflictingCurrencyLabels(price, currency);
  if (/[€£¥₹₺$]/.test(cleaned) || /^[A-Z]{2,3}\$?\s/.test(cleaned)) return cleaned;
  return `${currency.symbol}${cleaned}`;
}
