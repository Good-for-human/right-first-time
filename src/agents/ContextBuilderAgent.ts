/**
 * ContextBuilderAgent
 *
 * Responsibility: Assemble the structured system prompt context by combining
 * Persona descriptions, Category instruction rules, and Negative rules.
 *
 * Input:  FetchResultMessage + Task metadata + rules/personas from store
 * Output: PromptContextMessage
 */

import type {
  FetchResultMessage,
  PromptContextMessage,
  Rule,
  Persona,
  GeneratedContent,
  FewShotExample,
  Task,
} from '@/types';

interface ContextBuilderInput {
  fetchResult: FetchResultMessage;
  task: Task;
  personas: Persona[];
  instructionRules: Rule[];
  negativeRules: Rule[];
  archivedTaskContent: Record<string, GeneratedContent>;
}

export class ContextBuilderAgent {
  run(input: ContextBuilderInput): PromptContextMessage {
    const { fetchResult, task, personas, instructionRules, negativeRules, archivedTaskContent } = input;

    const taskPersonas = personas.filter((p) => task.personaIds.includes(p.id));
    const fewShotExamples = this.buildFewShotExamples(instructionRules, archivedTaskContent);
    const systemPrompt = this.buildSystemPrompt(taskPersonas, instructionRules, negativeRules, task.language);

    return {
      taskId: task.id,
      rawListing: fetchResult.rawListing,
      systemPrompt,
      instructionRules,
      negativeRules,
      fewShotExamples,
      targetLanguage: task.language,
    };
  }

  private buildSystemPrompt(
    personas: Persona[],
    instructionRules: Rule[],
    negativeRules: Rule[],
    targetLanguage: string
  ): string {
    const personaBlock = personas.length
      ? `[PERSONA CONTEXT]\nTarget audiences for this content:\n${personas.map((p) => `- ${p.name}: ${p.description}`).join('\n')}`
      : '';

    const requiredRules = instructionRules.filter((r) => r.priority === 'Required');
    const suggestedRules = instructionRules.filter((r) => r.priority === 'Suggested');

    const ruleBlock = [
      requiredRules.length ? `Required rules (must follow):\n${requiredRules.map((r, i) => `${i + 1}. ${r.name} [scope: ${r.targetSection}]`).join('\n')}` : '',
      suggestedRules.length ? `Suggested rules (best effort):\n${suggestedRules.map((r, i) => `${i + 1}. ${r.name}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    const criticalNeg = negativeRules.filter((r) => r.severity === 'Critical');
    const constraintBlock = criticalNeg.length
      ? `[HARD CONSTRAINTS — NEVER violate]\n${criticalNeg.map((r) => `- ${r.name}`).join('\n')}`
      : '';

    return [
      'You are an expert Amazon marketplace copywriter for TP-Link products.',
      personaBlock,
      ruleBlock ? `[GENERATION RULES]\n${ruleBlock}` : '',
      constraintBlock,
      `[OUTPUT]\nWrite content in language: ${targetLanguage}. Output only the requested section, no preamble or commentary.`,
    ].filter(Boolean).join('\n\n');
  }

  private buildFewShotExamples(
    rules: Rule[],
    archivedContent: Record<string, GeneratedContent>
  ): FewShotExample[] {
    const asins = new Set<string>();
    rules.forEach((r) => r.referenceAsins?.forEach((a) => asins.add(a)));

    return [...asins]
      .filter((asin) => archivedContent[asin])
      .map((asin) => ({ asin, content: archivedContent[asin] }));
  }
}
