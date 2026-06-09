/**
 * Canonical initial data used both for Firestore seeding and as Zustand
 * store fallback. Keeping this in a standalone file avoids circular imports
 * between firestoreService ↔ rulesStore / taskStore.
 */
import type { AppSettings, Rule, Persona, Task } from '@/types';
import { CANONICAL_CATEGORIES, GLOBAL_RULE_CATEGORY } from '@/lib/categoryTaxonomy';

const nowIso = () => new Date().toISOString();
const enMap = (text: string) => ({ en: text });

// ── Settings ─────────────────────────────────────────────────
export const INITIAL_SETTINGS: AppSettings = {
  systemLanguage:  'cn',
  targetLanguage:  'de',
  translationLang: 'en',
  model:           'gpt-5.5',
  apiKey:          '',
  isSaved:         false,
  tinyfishApiKey:  'sk-tinyfish-8OQ6_m1WrQ3hFHqr7Wl9qikIAFaoynBk',
  isTinyfishSaved: true,
  selectedImageRuleKeys:   [],
  selectedListingRuleKeys: [],
};

// ── Categories (canonical list from provided screenshot) ──────
export const INITIAL_CATEGORIES: string[] = [...CANONICAL_CATEGORIES];

export const INITIAL_CATEGORY_LABELS = Object.fromEntries(
  INITIAL_CATEGORIES.map((category) => {
    if (category === GLOBAL_RULE_CATEGORY) {
      return [category, { en: 'general', cn: '通用' }];
    }
    if (category === 'smart home IoT') {
      return [category, { en: 'smart home IoT', cn: '智能电子' }];
    }
    return [category, { en: category }];
  }),
);

// ── Rules (English-first presets) ─────────────────────────────
const BASE_INITIAL_RULES: Rule[] = [
  {
    id: 1001,
    category: GLOBAL_RULE_CATEGORY,
    type: 'instruction',
    targetSection: 'title',
    name: 'Title guidance (baseline-first): keep official model/spec facts, add at most one short scenario cue (3-8 words), and keep the title easy to scan under local marketplace length norms. No keyword stacking.',
    nameI18n: enMap('Title guidance (baseline-first): keep official model/spec facts, add at most one short scenario cue (3-8 words), and keep the title easy to scan under local marketplace length norms. No keyword stacking.'),
    priority: 'Required',
    referenceAsins: [],
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1002,
    category: GLOBAL_RULE_CATEGORY,
    type: 'instruction',
    targetSection: 'bullets',
    name: 'Bullet guidance (baseline-first): keep existing factual points, add one brief scenario-to-outcome hint per bullet, and keep each bullet to one natural sentence for fast reading.',
    nameI18n: enMap('Bullet guidance (baseline-first): keep existing factual points, add one brief scenario-to-outcome hint per bullet, and keep each bullet to one natural sentence for fast reading.'),
    priority: 'Required',
    referenceAsins: [],
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1003,
    category: GLOBAL_RULE_CATEGORY,
    type: 'instruction',
    targetSection: 'description',
    name: 'Description guidance (baseline-first): keep source structure, add concise scene context and boundary notes, avoid long repetition, and prioritize natural reading flow.',
    nameI18n: enMap('Description guidance (baseline-first): keep source structure, add concise scene context and boundary notes, avoid long repetition, and prioritize natural reading flow.'),
    priority: 'Required',
    referenceAsins: [],
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1004,
    category: GLOBAL_RULE_CATEGORY,
    type: 'negative',
    targetSection: 'all',
    name: 'Never invent new facts beyond baseline BP/description. Forbidden: adding unprovided certifications, numeric specs, compatibility coverage, or capability statements that are not explicitly present in official source copy.',
    nameI18n: enMap('Never invent new facts beyond baseline BP/description. Forbidden: adding unprovided certifications, numeric specs, compatibility coverage, or capability statements that are not explicitly present in official source copy.'),
    severity: 'Critical',
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1005,
    category: GLOBAL_RULE_CATEGORY,
    type: 'negative',
    targetSection: 'all',
    name: 'Do not overwrite factual tone with marketing hype. Avoid urgency/promo language and avoid replacing concrete product facts with vague superlatives.',
    nameI18n: enMap('Do not overwrite factual tone with marketing hype. Avoid urgency/promo language and avoid replacing concrete product facts with vague superlatives.'),
    severity: 'Critical',
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },

  {
    id: 1006,
    category: GLOBAL_RULE_CATEGORY,
    type: 'negative',
    targetSection: 'all',
    name: 'If baseline text has conditions (region, firmware, wiring, plan, installation constraints), keep them. Do not simplify conditional statements into blanket compatibility claims.',
    nameI18n: enMap('If baseline text has conditions (region, firmware, wiring, plan, installation constraints), keep them. Do not simplify conditional statements into blanket compatibility claims.'),
    severity: 'High',
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1301,
    category: 'Portable Wi-Fi',
    type: 'instruction',
    targetSection: 'title',
    name: 'Portable Wi-Fi title hint: keep baseline model/network facts and add only one short mobility use cue (travel/backup/temporary network). Keep compact and readable.',
    nameI18n: enMap('Portable Wi-Fi title hint: keep baseline model/network facts and add only one short mobility use cue (travel/backup/temporary network). Keep compact and readable.'),
    priority: 'Required',
    referenceAsins: [],
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1302,
    category: 'Portable Wi-Fi',
    type: 'instruction',
    targetSection: 'bullets',
    name: 'Portable Wi-Fi bullet hint: keep baseline bullet facts unchanged, and lightly add on-the-go scene + user outcome wording. Keep each bullet short and scannable.',
    nameI18n: enMap('Portable Wi-Fi bullet hint: keep baseline bullet facts unchanged, and lightly add on-the-go scene + user outcome wording. Keep each bullet short and scannable.'),
    priority: 'Required',
    referenceAsins: [],
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1303,
    category: 'Portable Wi-Fi',
    type: 'instruction',
    targetSection: 'description',
    name: 'Portable Wi-Fi description enhancement: keep baseline description structure, and emphasize scenario flow (travel setup, temporary network usage, boundary reminders) without introducing unprovided technical details.',
    nameI18n: enMap('Portable Wi-Fi description enhancement: keep baseline description structure, and emphasize scenario flow (travel setup, temporary network usage, boundary reminders) without introducing unprovided technical details.'),
    priority: 'Required',
    referenceAsins: [],
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1304,
    category: 'Portable Wi-Fi',
    type: 'negative',
    targetSection: 'all',
    name: 'Portable Wi-Fi guardrail: never expand compatibility beyond baseline wording. Keep carrier/SIM/region conditions exactly as provided by source content.',
    nameI18n: enMap('Portable Wi-Fi guardrail: never expand compatibility beyond baseline wording. Keep carrier/SIM/region conditions exactly as provided by source content.'),
    severity: 'Critical',
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1305,
    category: 'Portable Wi-Fi',
    type: 'negative',
    targetSection: 'all',
    name: 'Portable Wi-Fi guardrail: do not convert peak or conditional performance statements into unconditional promises.',
    nameI18n: enMap('Portable Wi-Fi guardrail: do not convert peak or conditional performance statements into unconditional promises.'),
    severity: 'Critical',
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 1306,
    category: 'Portable Wi-Fi',
    type: 'negative',
    targetSection: 'all',
    name: 'Portable Wi-Fi guardrail: keep boundary information from baseline text (signal, congestion, battery mode, firmware, client load) and do not omit it.',
    nameI18n: enMap('Portable Wi-Fi guardrail: keep boundary information from baseline text (signal, congestion, battery mode, firmware, client load) and do not omit it.'),
    severity: 'High',
    active: true,
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

interface CosmoCategoryPreset {
  category: string;
  scenario: string;
  mechanism: string;
  evidence: string;
  boundary: string;
  compliance: string;
}

const COSMO_CATEGORY_PRESETS: CosmoCategoryPreset[] = [
  {
    category: 'Adapter & Accessories',
    scenario: 'multi-device desk and travel charger setup',
    mechanism: 'port mix, protocol compatibility, cable and thermal design',
    evidence: 'total output, per-port output, protocol list, safety standard',
    boundary: 'shared output allocation and cable quality dependence',
    compliance: 'universal fast-charge claims across all devices',
  },
  {
    category: 'Aginet',
    scenario: 'ISP-managed household rollout and remote maintenance',
    mechanism: 'TR-069/ACS workflow, remote diagnostics, policy provisioning',
    evidence: 'device onboarding path, fleet controls, maintenance cadence',
    boundary: 'operator backend dependencies and firmware policy limits',
    compliance: 'zero-touch setup claims without ISP-side prerequisites',
  },
  {
    category: 'Consumer Electronics',
    scenario: 'daily entertainment and cross-device lifestyle usage',
    mechanism: 'core user journey, interaction simplicity, ecosystem handoff',
    evidence: 'key function latency, supported app/platform matrix, durability data',
    boundary: 'feature availability by firmware/app version or region',
    compliance: 'all-in-one replacement claims without scope limitation',
  },
  {
    category: 'Door Security',
    scenario: 'front-door monitoring, visitor response, and deterrence',
    mechanism: 'detection pipeline, alert path, storage/privacy options',
    evidence: 'field of view, trigger conditions, recording mode, retention options',
    boundary: 'network quality, mounting position, and lighting dependency',
    compliance: 'crime-prevention guarantees and zero false-alert claims',
  },
  {
    category: 'Enterprise Networking',
    scenario: 'branch office stability and segmented traffic control',
    mechanism: 'policy enforcement, VLAN/QoS architecture, observability hooks',
    evidence: 'throughput class, management scope, failover/recovery behavior',
    boundary: 'topology complexity and controller/license prerequisites',
    compliance: 'carrier-grade or mission-critical guarantees without context',
  },
  {
    category: 'Extender',
    scenario: 'dead-zone remediation in multi-room homes',
    mechanism: 'backhaul strategy, placement guidance, roaming handoff behavior',
    evidence: 'coverage delta, backhaul mode, compatible router standards',
    boundary: 'distance/wall-loss impact and source-router quality dependence',
    compliance: 'full speed everywhere claims in all layouts',
  },
  {
    category: 'Gateway & Hardwar Controller',
    scenario: 'site gateway plus controller consolidation',
    mechanism: 'control-plane centralization, policy sync, and lifecycle ops',
    evidence: 'managed node count, policy domain scope, failover model',
    boundary: 'controller limits under high-scale or mixed-generation estates',
    compliance: 'single-box-for-any-scale statements without deployment limits',
  },
  {
    category: 'Managed Switch',
    scenario: 'SMB network segmentation with predictable operations',
    mechanism: 'VLAN, ACL, QoS, PoE budget orchestration',
    evidence: 'port profile, switching capacity, forwarding rate, PoE envelope',
    boundary: 'feature behavior by firmware and topology design choices',
    compliance: 'line-rate for all workloads at all times claims',
  },
  {
    category: 'Mercusys-Home Networking',
    scenario: 'value-focused family networking and easy onboarding',
    mechanism: 'simple setup flow, everyday stability tuning, parental controls',
    evidence: 'setup steps, device concurrency class, core protection features',
    boundary: 'advanced feature availability versus premium product lines',
    compliance: 'premium-equivalent performance claims without trade-off disclosure',
  },
  {
    category: 'Robot Cleaner',
    scenario: 'automated daily floor maintenance in mixed-room homes',
    mechanism: 'navigation logic, suction/water strategy, schedule automation',
    evidence: 'runtime, coverage cycle, mapping behavior, obstacle handling scope',
    boundary: 'surface type, clutter level, and maintenance frequency dependence',
    compliance: 'hands-free forever and zero-maintenance claims',
  },
  {
    category: 'Security Camera',
    scenario: 'continuous property monitoring and fast incident review',
    mechanism: 'sensor pipeline, night mode, event filtering, and alert routing',
    evidence: 'resolution/FOV, detection classes, notification latency context',
    boundary: 'installation angle, weather/light conditions, and network variability',
    compliance: 'always-accurate recognition and unconditional legal compliance claims',
  },
  {
    category: 'smart home IoT',
    scenario: 'home automation of lighting, outlets, and appliance schedules',
    mechanism: 'switch/relay behavior, automation triggers, and safety design',
    evidence: 'load rating, protocol compatibility, app/voice integration matrix',
    boundary: 'wiring type, neutral wire requirements, and regional standards',
    compliance: 'works with every home wiring and every ecosystem claims',
  },
  {
    category: 'Unmanaged Switch & Others',
    scenario: 'plug-and-play network expansion for low-complexity environments',
    mechanism: 'auto-negotiation, fanless thermal behavior, and basic reliability',
    evidence: 'port count/speed mix, power profile, housing/thermal characteristics',
    boundary: 'lack of policy controls and observability versus managed switching',
    compliance: 'enterprise management capability implications',
  },
  {
    category: 'Whole-Home Wi-Fi System',
    scenario: 'seamless room-to-room roaming in medium-large homes',
    mechanism: 'mesh backhaul, node coordination, and client steering',
    evidence: 'coverage envelope, node count guidance, roaming behavior conditions',
    boundary: 'building materials, node placement, and ISP bottleneck influence',
    compliance: 'single-speed guarantee for every corner and every workload',
  },
  {
    category: 'Wi-Fi',
    scenario: 'single-node household internet distribution',
    mechanism: 'band steering, airtime scheduling, and baseline security posture',
    evidence: 'band capability, concurrent client class, wired interface profile',
    boundary: 'performance sensitivity to interference and client chipset diversity',
    compliance: 'future-proof for all scenarios without lifecycle caveats',
  },
  {
    category: 'Wi-Fi Gateway',
    scenario: 'home or SMB WAN entry with internal routing stability',
    mechanism: 'NAT/firewall path, WAN/LAN role handling, and policy controls',
    evidence: 'WAN type support, routing throughput class, management interfaces',
    boundary: 'ISP mode/bridge constraints and advanced policy complexity',
    compliance: 'all-ISP and all-topology compatibility guarantees',
  },
];

const COSMO_CATEGORY_RULES: Rule[] = COSMO_CATEGORY_PRESETS.flatMap((preset, index) => {
  const idBase = 2000 + index * 10;
  const titleRule = `Hint for ${preset.category} title: preserve baseline facts, add only one short scenario cue for ${preset.scenario}, and keep title length natural for marketplace reading habits.`;
  const bulletRule = `Hint for ${preset.category} bullets: keep baseline facts/numbers, add light scenario + outcome wording for ${preset.scenario}, and keep each bullet concise (one natural sentence).`;
  const negativeRule = `Guardrail for ${preset.category}: do not invent new claims or stretch baseline statements; keep boundaries explicit (${preset.boundary}) and avoid verbose filler text.`;

  return [
    {
      id: idBase + 1,
      category: preset.category,
      type: 'instruction',
      targetSection: 'title',
      name: titleRule,
      nameI18n: enMap(titleRule),
      priority: 'Required',
      referenceAsins: [],
      active: true,
      createdByUid: 'system',
      createdByEmail: 'system@rightfirsttime.local',
      createdByCountry: 'GLOBAL',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: idBase + 2,
      category: preset.category,
      type: 'instruction',
      targetSection: 'bullets',
      name: bulletRule,
      nameI18n: enMap(bulletRule),
      priority: 'Required',
      referenceAsins: [],
      active: true,
      createdByUid: 'system',
      createdByEmail: 'system@rightfirsttime.local',
      createdByCountry: 'GLOBAL',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: idBase + 3,
      category: preset.category,
      type: 'negative',
      targetSection: 'all',
      name: negativeRule,
      nameI18n: enMap(negativeRule),
      severity: 'Critical',
      active: true,
      createdByUid: 'system',
      createdByEmail: 'system@rightfirsttime.local',
      createdByCountry: 'GLOBAL',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];
});

export const INITIAL_RULES: Rule[] = [
  ...BASE_INITIAL_RULES,
  ...COSMO_CATEGORY_RULES,
];

// ── Personas (English-first presets) ─────────────────────────
export const INITIAL_PERSONAS: Persona[] = [
  {
    id: 'p1001',
    name: 'First-time Home Network Buyer',
    description: 'Primary intent: choose a reliable setup with low installation anxiety. Writing preference: avoid protocol-heavy jargon in opening lines, explain practical value first, then provide key specs in plain words. Must explicitly answer three concerns: (1) how easy setup is, (2) whether whole-home coverage is stable in daily multi-device use, (3) what limitations or prerequisites exist before purchase.',
    nameI18n: enMap('First-time Home Network Buyer'),
    descriptionI18n: enMap('Primary intent: choose a reliable setup with low installation anxiety. Writing preference: avoid protocol-heavy jargon in opening lines, explain practical value first, then provide key specs in plain words. Must explicitly answer three concerns: (1) how easy setup is, (2) whether whole-home coverage is stable in daily multi-device use, (3) what limitations or prerequisites exist before purchase.'),
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'p1002',
    name: 'Hybrid Gamer + Home Office User',
    description: 'Primary intent: maintain low-latency gaming and stable video conferencing in parallel. Writing preference: prioritize measurable performance claims (port speed, latency stability context, channel/backhaul capability, concurrent device behavior) and avoid generic speed adjectives. Every section should map features to two scenarios: competitive sessions and workday reliability under shared household traffic.',
    nameI18n: enMap('Hybrid Gamer + Home Office User'),
    descriptionI18n: enMap('Primary intent: maintain low-latency gaming and stable video conferencing in parallel. Writing preference: prioritize measurable performance claims (port speed, latency stability context, channel/backhaul capability, concurrent device behavior) and avoid generic speed adjectives. Every section should map features to two scenarios: competitive sessions and workday reliability under shared household traffic.'),
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'p1003',
    name: 'SMB IT Decision Maker',
    description: 'Primary intent: reduce operational risk before deployment. Writing preference: concise and structured enterprise-style copy that surfaces management method, maintainability, security boundary, and rollout prerequisites. Must include concrete checklist-style information: topology fit, remote/local management scope, update/maintenance expectations, and where this model is not the right fit.',
    nameI18n: enMap('SMB IT Decision Maker'),
    descriptionI18n: enMap('Primary intent: reduce operational risk before deployment. Writing preference: concise and structured enterprise-style copy that surfaces management method, maintainability, security boundary, and rollout prerequisites. Must include concrete checklist-style information: topology fit, remote/local management scope, update/maintenance expectations, and where this model is not the right fit.'),
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'p1004',
    name: 'Security-first Smart Home Planner',
    description: 'Primary intent: build a dependable home safety and automation setup with clear privacy boundaries. Writing preference: lead with detection accuracy, notification timeliness, storage/privacy options, and ecosystem interoperability. Content should explicitly distinguish guaranteed capabilities vs conditional capabilities (network quality, subscription features, regional integrations).',
    nameI18n: enMap('Security-first Smart Home Planner'),
    descriptionI18n: enMap('Primary intent: build a dependable home safety and automation setup with clear privacy boundaries. Writing preference: lead with detection accuracy, notification timeliness, storage/privacy options, and ecosystem interoperability. Content should explicitly distinguish guaranteed capabilities vs conditional capabilities (network quality, subscription features, regional integrations).'),
    createdByUid: 'system',
    createdByEmail: 'system@rightfirsttime.local',
    createdByCountry: 'GLOBAL',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

// ── Tasks ────────────────────────────────────────────────────
export const INITIAL_TASKS: Task[] = [
  {
    id: '1',
    asin: 'B08TGPTQ14',
    name: 'TP-Link Deco X Series',
    category: 'Whole-Home Wi-Fi System',
    language: 'en',
    personaIds: ['p1001', 'p1002'],
    status: 'review',
    createdAt: nowIso(),
  },
  {
    id: '2',
    asin: 'B08WBGFTTV',
    name: 'TP-Link Smart Managed Switch',
    category: 'Managed Switch',
    language: 'en',
    personaIds: ['p1003'],
    status: 'archived',
    createdAt: nowIso(),
  },
  {
    id: '3',
    asin: 'B08P1X6LXC',
    name: 'TP-Link Home Security Camera',
    category: 'Security Camera',
    language: 'de',
    personaIds: ['p1004'],
    status: 'review',
    createdAt: nowIso(),
  },
];
