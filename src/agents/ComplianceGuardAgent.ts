/**
 * ComplianceGuardAgent
 *
 * Responsibility: Validate generated content against Negative Rules.
 * Critical severity → block (returns passed: false).
 * High severity → warn (returns passed: true but with issues listed).
 *
 * Input:  GenerationResultMessage
 * Output: ComplianceResultMessage
 */

import type {
  GenerationResultMessage,
  ComplianceResultMessage,
  Rule,
  NegativeCheckResult,
  ContentKey,
  SectionMetadataMap,
} from '@/types';

const CRITICAL_KEYWORDS: Record<string, string[]> = {
  'absolute superlatives': ['the best', '#1', 'no. 1', 'unbeatable', 'no more buffering', 'buy it today', 'buy now', '最好', '第一', '世界第一'],
  'call to action': ['buy now', 'buy it today', 'order now', 'click here', '立即购买', '马上下单'],
};

function detectKeywordViolations(content: string, rule: Rule): boolean {
  const lower = content.toLowerCase();

  // Check built-in keyword lists for known critical rules
  for (const keywords of Object.values(CRITICAL_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      // Only trigger if the rule is about superlatives/claims
      if (rule.name.includes('绝对化') || rule.name.includes('虚假') || rule.name.includes('absolute')) {
        return true;
      }
    }
  }

  return false;
}

function validateSection(
  content: string,
  negativeRules: Rule[],
  section: ContentKey
): NegativeCheckResult {
  const applicable = negativeRules.filter(
    (r) => r.active && (r.targetSection === 'all' || r.targetSection === section)
  );

  const violations = applicable.filter((r) => detectKeywordViolations(content, r));
  const criticalViolations = violations.filter((r) => r.severity === 'Critical');

  return {
    passed: criticalViolations.length === 0,
    issues: violations.map((r) => r.name),
  };
}

export class ComplianceGuardAgent {
  run(input: GenerationResultMessage): ComplianceResultMessage {
    const { taskId, generatedContent, sectionMetadata, negativeRules } = input;

    const sections: ContentKey[] = ['title', 'bullets', 'description'];
    const updatedMetadata: SectionMetadataMap = { ...sectionMetadata };
    const blockedSections: ContentKey[] = [];

    for (const section of sections) {
      const content = generatedContent[section] ?? '';
      const result = validateSection(content, negativeRules, section);
      updatedMetadata[section] = {
        ...updatedMetadata[section],
        negativeCheck: result,
      };
      if (!result.passed) {
        blockedSections.push(section);
      }
    }

    return {
      taskId,
      generatedContent,
      sectionMetadata: updatedMetadata,
      blockedSections,
    };
  }
}
