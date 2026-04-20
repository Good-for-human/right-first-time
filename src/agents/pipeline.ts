/**
 * pipeline.ts
 *
 * Orchestrates the full 5-agent SOP pipeline:
 * DataFetch → ContextBuilder → ContentGeneration → ComplianceGuard → Evaluation
 */

import type { Task, Persona, Rule, GeneratedContent, ContentKey, EvaluationResultMessage, LLMModel } from '@/types';
import { DataFetchAgent } from './DataFetchAgent';
import { ContextBuilderAgent } from './ContextBuilderAgent';
import { ContentGenerationAgent } from './ContentGenerationAgent';
import { ComplianceGuardAgent } from './ComplianceGuardAgent';
import { EvaluationAgent } from './EvaluationAgent';

export interface PipelineConfig {
  tinyfishApiKey: string;
  llmApiKey: string;
  llmModel: LLMModel;
}

export interface PipelineInput {
  task: Task;
  personas: Persona[];
  instructionRules: Rule[];
  negativeRules: Rule[];
  archivedTaskContent: Record<string, GeneratedContent>;
  config: {
    tinyfishApiKey: string;
    llmApiKey: string;
    llmModel: LLMModel;
  };
  sectionFilter?: ContentKey;
}

export async function runPipeline(input: PipelineInput): Promise<EvaluationResultMessage> {
  const {
    task,
    personas,
    instructionRules,
    negativeRules,
    archivedTaskContent,
    config,
    sectionFilter,
  } = input;

  // Step 1: Fetch raw data
  const dataAgent = new DataFetchAgent(config.tinyfishApiKey);
  const fetchResult = await dataAgent.run(task);

  // Step 2: Build prompt context
  const contextAgent = new ContextBuilderAgent();
  const context = contextAgent.run({
    fetchResult,
    task,
    personas,
    instructionRules,
    negativeRules,
    archivedTaskContent,
  });

  // Step 3: Generate content
  const contentAgent = new ContentGenerationAgent(config.llmModel, config.llmApiKey);
  const generationResult = await contentAgent.run(context, sectionFilter);

  // Step 4: Compliance guard
  const complianceAgent = new ComplianceGuardAgent();
  const complianceResult = complianceAgent.run(generationResult);

  // Step 5: Evaluate
  const evaluationAgent = new EvaluationAgent();
  return evaluationAgent.run(complianceResult);
}

/** Partial pipeline: skip DataFetch, re-run from ContentGeneration */
export async function regenerateSection(
  sectionFilter: ContentKey,
  task: Task,
  personas: Persona[],
  instructionRules: Rule[],
  negativeRules: Rule[],
  archivedTaskContent: Record<string, GeneratedContent>,
  config: PipelineInput['config']
): Promise<EvaluationResultMessage> {
  return runPipeline({
    task,
    personas,
    instructionRules,
    negativeRules,
    archivedTaskContent,
    config,
    sectionFilter,
  });
}
