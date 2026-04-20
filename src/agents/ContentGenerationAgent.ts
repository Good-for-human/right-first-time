/**
 * ContentGenerationAgent
 *
 * Responsibility: Drive the configured LLM to generate / rewrite
 * Title, Bullet Points, and Description for each task.
 *
 * Input:  PromptContextMessage
 * Output: GenerationResultMessage
 */

import type {
  PromptContextMessage,
  GenerationResultMessage,
  GeneratedContent,
  SectionMetadataMap,
  ContentKey,
  LLMModel,
  LanguageCode,
} from '@/types';
import { callLLM } from '@/services/llm';

// Mock translations used when no API key is set
const MOCK_TRANSLATIONS: Record<LanguageCode, GeneratedContent> = {
  en: {
    title: 'TP-Link Archer AX73 AX5400 Dual Band Gigabit WiFi 6 Router, Long Range Coverage, OneMesh & Alexa Compatible',
    bullets: '• ULTRA-FAST WIFI 6: Dual-band speeds up to 5400 Mbps (4804 Mbps on 5 GHz + 574 Mbps on 2.4 GHz) for seamless 8K streaming.\n• CONNECT 200+ DEVICES: MU-MIMO and OFDMA technologies minimize network congestion.\n• EXTENSIVE COVERAGE: 6 high-performance antennas equipped with Beamforming ensure stable connections throughout large homes.',
    description: 'The TP-Link Archer AX73 is a high-performance AX5400 dual-band WiFi 6 router designed to handle demanding home networks. Equipped with MU-MIMO and OFDMA technologies, it supports over 200 concurrent connections. Compatible with TP-Link OneMesh.',
  },
  de: {
    title: 'TP-Link Archer AX73 AX5400 Dualband-Gigabit-WLAN-6-Router, große Reichweite, OneMesh- & Alexa-kompatibel',
    bullets: '• ULTRASCHNELLES WIFI 6: Dualband-Geschwindigkeiten bis zu 5400 Mbps (4804 Mbps auf 5 GHz + 574 Mbps auf 2,4 GHz) für nahtloses 8K-Streaming.\n• 200+ GERÄTE VERBINDEN: MU-MIMO- und OFDMA-Technologien minimieren Netzwerküberlastungen.\n• WEITREICHENDE ABDECKUNG: 6 Hochleistungsantennen mit Beamforming gewährleisten stabile Verbindungen im ganzen Haus.',
    description: 'Der TP-Link Archer AX73 ist ein leistungsstarker AX5400-Dualband-WiFi-6-Router für anspruchsvolle Heimnetzwerke. Mit MU-MIMO und OFDMA unterstützt er über 200 gleichzeitige Verbindungen und ist mit TP-Link OneMesh kompatibel.',
  },
  fr: {
    title: 'Routeur TP-Link Archer AX73 AX5400 WiFi 6 Gigabit double bande, longue portée, compatible OneMesh et Alexa',
    bullets: '• WIFI 6 ULTRA-RAPIDE : Vitesses bi-bande jusqu\'à 5400 Mbps pour un streaming 8K fluide.\n• CONNECTEZ 200+ APPAREILS : Les technologies MU-MIMO et OFDMA minimisent la congestion.\n• COUVERTURE ÉTENDUE : 6 antennes haute performance avec Beamforming pour une connexion stable.',
    description: 'Le TP-Link Archer AX73 est un routeur WiFi 6 AX5400 double bande conçu pour les réseaux domestiques exigeants. Compatible OneMesh TP-Link.',
  },
  it: {
    title: 'Router TP-Link Archer AX73 AX5400 WiFi 6 Gigabit Dual Band, Ampia Copertura, Compatibile con OneMesh e Alexa',
    bullets: '• WIFI 6 ULTRA-VELOCE: Velocità dual-band fino a 5400 Mbps per streaming 8K senza interruzioni.\n• COLLEGA 200+ DISPOSITIVI: MU-MIMO e OFDMA riducono la congestione della rete.\n• COPERTURA ESTESA: 6 antenne ad alte prestazioni con Beamforming garantiscono connessioni stabili.',
    description: 'Il TP-Link Archer AX73 è un router WiFi 6 AX5400 dual-band progettato per reti domestiche impegnative. Compatibile con TP-Link OneMesh.',
  },
  es: {
    title: 'Router TP-Link Archer AX73 AX5400 WiFi 6 Gigabit de doble banda, amplia cobertura, compatible con OneMesh y Alexa',
    bullets: '• WIFI 6 ULTRARRÁPIDO: Velocidades de doble banda de hasta 5400 Mbps para streaming 8K sin interrupciones.\n• CONECTA 200+ DISPOSITIVOS: MU-MIMO y OFDMA minimizan la congestión de la red.\n• COBERTURA EXTENSA: 6 antenas de alto rendimiento con Beamforming garantizan conexiones estables.',
    description: 'El TP-Link Archer AX73 es un router WiFi 6 AX5400 de doble banda diseñado para redes domésticas exigentes. Compatible con TP-Link OneMesh.',
  },
  zh: {
    title: 'TP-Link Archer AX73 AX5400 双频千兆 WiFi 6 路由器，广覆盖，支持 OneMesh 与 Alexa',
    bullets: '• 极速 WIFI 6: 双频速度高达 5400 Mbps（5 GHz 上 4804 Mbps + 2.4 GHz 上 574 Mbps），实现无缝 8K 流媒体播放。\n• 连接200+设备: MU-MIMO 和 OFDMA 技术可大幅减少网络拥塞。\n• 广阔覆盖范围: 6 根高性能天线配备波束成形技术，确保整个大户型的稳定连接。',
    description: 'TP-Link Archer AX73 是一款专为高需求家庭网络设计的高性能 AX5400 双频 WiFi 6 路由器。配备 MU-MIMO 和 OFDMA 技术，支持超 200 个并发连接。兼容 TP-Link OneMesh 扩展器。',
  },
};

const SECTION_PROMPTS: Record<ContentKey, (rawContent: string, specs: string) => string> = {
  title: (rawContent) =>
    `Rewrite the following Amazon product TITLE.\nOriginal: "${rawContent}"\nOutput only the rewritten title.`,
  bullets: (rawContent, specs) =>
    `Rewrite the following Amazon BULLET POINTS (5-point description).\nOriginal:\n${rawContent}\nProduct specs: ${specs}\nOutput only the bullet points, one per line with a "• PREFIX: content" format.`,
  description: (rawContent, specs) =>
    `Rewrite the following Amazon product DESCRIPTION.\nOriginal: "${rawContent}"\nProduct specs: ${specs}\nOutput only the rewritten description.`,
};

const MOCK_METADATA = {
  title: { rulesApplied: ['[规则] 必须以 TP-Link [产品型号] 开头', '[画像] 强化发烧友参数'], negativeCheck: { passed: true }, explanation: '已按照亚马逊规范前置品牌和型号，移除堆砌的搜索词。' },
  bullets: { rulesApplied: ['[规则] 使用全大写特征词前缀', '[规则] 提取明确技术指标'], negativeCheck: { passed: true }, explanation: '根据COSMO算法偏好，重构为带前缀的语义化分类，凸显 4804Mbps 等具体指标。' },
  description: { rulesApplied: ['[规则] 提升可读性', '[规则] 保持客观专业语气'], negativeCheck: { passed: false, issues: ['仍包含轻微的夸大词 (\'high-performance\')'] }, explanation: '已拦截绝对化用语 (如 \'best router\', \'Buy it today\')，重写为专业客观陈述。' },
};

export class ContentGenerationAgent {
  constructor(
    private readonly model: LLMModel,
    private readonly apiKey: string
  ) {}

  async run(
    context: PromptContextMessage,
    sectionFilter?: ContentKey
  ): Promise<GenerationResultMessage> {
    const sections: ContentKey[] = sectionFilter ? [sectionFilter] : ['title', 'bullets', 'description'];
    const { rawListing, targetLanguage } = context;
    const specsStr = JSON.stringify(rawListing.specs);
    const rawBullets = rawListing.bullets.join('\n');

    const rawMap: Record<ContentKey, string> = {
      title: rawListing.title,
      bullets: rawBullets,
      description: rawListing.description,
    };

    let generatedContent: GeneratedContent;

    if (!this.apiKey) {
      // Use mock data when no API key is configured
      console.warn('[ContentGenerationAgent] No LLM API key — using mock data');
      const mockForLang = MOCK_TRANSLATIONS[targetLanguage] ?? MOCK_TRANSLATIONS.en;
      generatedContent = sectionFilter
        ? { ...mockForLang, [sectionFilter]: mockForLang[sectionFilter] }
        : mockForLang;
    } else {
      const results = await Promise.all(
        sections.map(async (section) => {
          const userPrompt = SECTION_PROMPTS[section](rawMap[section], specsStr);
          const response = await callLLM(
            [
              { role: 'system', content: context.systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            this.model,
            this.apiKey
          );
          return [section, response.content] as [ContentKey, string];
        })
      );

      generatedContent = Object.fromEntries(results) as GeneratedContent;
    }

    return {
      taskId: context.taskId,
      generatedContent,
      sectionMetadata: MOCK_METADATA as SectionMetadataMap,
      negativeRules: context.negativeRules,
    };
  }
}
