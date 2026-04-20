/**
 * EvaluationAgent
 *
 * Responsibility: Score generated content across COSMO dimensions
 * (Clarity, Completeness, Searchability, Compliance) and produce
 * an EvaluationReport with risk level.
 *
 * Input:  ComplianceResultMessage
 * Output: EvaluationResultMessage
 */

import type {
  ComplianceResultMessage,
  EvaluationResultMessage,
  EvaluationReport,
  EvaluationScores,
  EvaluationIssue,
  TranslationMap,
  GeneratedContent,
  RiskLevel,
} from '@/types';

const MOCK_TRANSLATIONS: TranslationMap = {
  title: {
    en: 'TP-Link Archer AX73 AX5400 Dual Band Gigabit WiFi 6 Router, Long Range Coverage, OneMesh & Alexa Compatible',
    zh: 'TP-Link Archer AX73 AX5400 双频千兆 WiFi 6 路由器，广覆盖，支持 OneMesh 与 Alexa',
    de: 'TP-Link Archer AX73 AX5400 Dualband-Gigabit-WLAN-6-Router, große Reichweite, OneMesh- & Alexa-kompatibel',
    fr: 'Routeur TP-Link Archer AX73 AX5400 WiFi 6 Gigabit double bande, longue portée, compatible OneMesh et Alexa',
    it: 'Router TP-Link Archer AX73 AX5400 WiFi 6 Gigabit Dual Band, Ampia Copertura, Compatibile con OneMesh e Alexa',
    es: 'Router TP-Link Archer AX73 AX5400 WiFi 6 Gigabit de doble banda, amplia cobertura, compatible con OneMesh y Alexa',
  },
  bullets: {
    zh: '• 极速 WIFI 6: 双频速度高达 5400 Mbps（5 GHz 上 4804 Mbps + 2.4 GHz 上 574 Mbps），实现无缝 8K 流媒体播放。\n• 连接200+设备: MU-MIMO 和 OFDMA 技术可大幅减少网络拥塞。\n• 广阔覆盖范围: 6 根高性能天线配备波束成形技术，确保整个大户型的稳定连接。',
    en: '• ULTRA-FAST WIFI 6: Dual-band speeds up to 5400 Mbps (4804 Mbps on 5 GHz + 574 Mbps on 2.4 GHz) for seamless 8K streaming.\n• CONNECT 200+ DEVICES: MU-MIMO and OFDMA technologies minimize network congestion.\n• EXTENSIVE COVERAGE: 6 high-performance antennas equipped with Beamforming ensure stable connections throughout large homes.',
  },
  description: {
    zh: 'TP-Link Archer AX73 是一款专为高需求家庭网络设计的高性能 AX5400 双频 WiFi 6 路由器。配备 MU-MIMO 和 OFDMA 技术，支持超 200 个并发连接。兼容 TP-Link OneMesh 扩展器。',
    en: 'The TP-Link Archer AX73 is a high-performance AX5400 dual-band WiFi 6 router designed to handle demanding home networks. Equipped with MU-MIMO and OFDMA technologies, it supports over 200 concurrent connections. Compatible with TP-Link OneMesh.',
  },
};

function scoreClarity(content: GeneratedContent): number {
  const { title, bullets, description } = content;
  let score = 100;
  // Penalize very long sentences
  const avgLen = (title.length + description.length) / 2;
  if (avgLen > 300) score -= 10;
  // Penalize if bullet points are not formatted
  if (!bullets.includes('•') && !bullets.includes('-')) score -= 8;
  return Math.max(score, 50);
}

function scoreCompleteness(content: GeneratedContent): number {
  const combined = `${content.title} ${content.bullets} ${content.description}`.toLowerCase();
  let score = 70;
  const indicators = ['mbps', 'ghz', 'band', 'antenna', 'mu-mimo', 'ofdma', 'beamforming', 'onemesh', 'alexa', 'vpn'];
  indicators.forEach((kw) => { if (combined.includes(kw)) score += 3; });
  return Math.min(score, 100);
}

function scoreSearchability(content: GeneratedContent): number {
  let score = 80;
  // Check for uppercase prefix pattern in bullets
  if (/[A-Z]{2,}:/.test(content.bullets)) score += 10;
  // Check brand prefix in title
  if (content.title.startsWith('TP-Link')) score += 5;
  return Math.min(score, 100);
}

function scoreCompliance(sectionViolations: boolean[]): number {
  const passedCount = sectionViolations.filter(Boolean).length;
  return Math.round((passedCount / sectionViolations.length) * 100);
}

function deriveRiskLevel(scores: EvaluationScores, issues: EvaluationIssue[]): RiskLevel {
  const errorCount = issues.filter((i) => i.type === 'Error').length;
  const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / 4;
  if (errorCount > 0 || scores.compliance < 70) return 'High';
  if (avgScore < 80 || issues.length > 2) return 'Medium';
  return 'Low';
}

export class EvaluationAgent {
  run(input: ComplianceResultMessage): EvaluationResultMessage {
    const { taskId, generatedContent, sectionMetadata, blockedSections } = input;

    const issues: EvaluationIssue[] = [];

    // Collect compliance issues from section metadata
    (['title', 'bullets', 'description'] as const).forEach((section) => {
      const check = sectionMetadata[section]?.negativeCheck;
      if (check && !check.passed) {
        check.issues?.forEach((issue) => {
          issues.push({ type: 'Error', text: `[${section}] ${issue}` });
        });
      } else if (check?.issues?.length) {
        check.issues.forEach((issue) => {
          issues.push({ type: 'Warning', text: `[${section}] ${issue}` });
        });
      }
    });

    // Add warnings for blocked sections
    if (blockedSections.length > 0) {
      issues.push({
        type: 'Warning',
        text: `Description still contains slightly subjective term 'high-performance'.`,
      });
    }

    const sectionPassed = (['title', 'bullets', 'description'] as const).map(
      (s) => sectionMetadata[s]?.negativeCheck?.passed ?? true
    );

    const scores: EvaluationScores = {
      clarity: scoreClarity(generatedContent),
      completeness: scoreCompleteness(generatedContent),
      searchability: scoreSearchability(generatedContent),
      compliance: scoreCompliance(sectionPassed),
    };

    const report: EvaluationReport = {
      scores,
      issues,
      riskLevel: deriveRiskLevel(scores, issues),
    };

    return {
      taskId,
      generatedContent,
      sectionMetadata,
      evaluationReport: report,
      translations: MOCK_TRANSLATIONS,
    };
  }
}
