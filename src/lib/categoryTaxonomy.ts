export const CANONICAL_CATEGORIES: string[] = [
  'general',
  'Adapter & Accessories',
  'Aginet',
  'Consumer Electronics',
  'Door Security',
  'Enterprise Networking',
  'Extender',
  'Gateway & Hardwar Controller',
  'Managed Switch',
  'Mercusys-Home Networking',
  'Portable Wi-Fi',
  'Robot Cleaner',
  'Security Camera',
  'smart home IoT',
  'Unmanaged Switch & Others',
  'Whole-Home Wi-Fi System',
  'Wi-Fi',
  'Wi-Fi Gateway',
];

export const DEFAULT_CATEGORY = 'Wi-Fi';
export const GLOBAL_RULE_CATEGORY = 'general';

const LEGACY_TO_CANONICAL: Record<string, string> = {
  general: GLOBAL_RULE_CATEGORY,
  '通用': GLOBAL_RULE_CATEGORY,
  'deco mesh wi-fi': 'Whole-Home Wi-Fi System',
  'internet router': 'Wi-Fi Gateway',
  'mobile wlan router': 'Portable Wi-Fi',
  'router without dsl': 'Wi-Fi Gateway',
  'network extension': 'Extender',
  'network switches': 'Managed Switch',
  'network adapters': 'Adapter & Accessories',
  accessories: 'Adapter & Accessories',
  'surveillance cameras': 'Security Camera',
  'robot vacuum': 'Robot Cleaner',
  'video doorbell': 'Door Security',
  'smart electrical': 'smart home IoT',
  '智能电子': 'smart home IoT',
  'smart home iot': 'smart home IoT',
  'smart switches': 'smart home IoT',
  'smart plugs': 'smart home IoT',
  'smart lighting': 'smart home IoT',
  'smart sensors': 'smart home IoT',
  'smart thermostat': 'smart home IoT',
  'smart hub': 'smart home IoT',
};

const CANONICAL_BY_KEY = CANONICAL_CATEGORIES.reduce<Record<string, string>>((acc, category) => {
  acc[category.trim().toLowerCase()] = category;
  return acc;
}, {});

export function mapToCanonicalCategory(category: string | undefined | null): string {
  const normalized = (category ?? '').trim();
  if (!normalized) return DEFAULT_CATEGORY;

  const key = normalized.toLowerCase();
  if (CANONICAL_BY_KEY[key]) return CANONICAL_BY_KEY[key];
  if (LEGACY_TO_CANONICAL[key]) return LEGACY_TO_CANONICAL[key];
  return DEFAULT_CATEGORY;
}
