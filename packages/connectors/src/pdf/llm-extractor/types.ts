import type { ExtractedCostRecord } from '@cost-watchdog/connector-sdk';

export interface LLMExtractionConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMExtractionAudit {
  model: string;
  promptVersion: string;
  temperature: number;
  inputHash: string;
  outputHash: string;
}

export interface LLMExtractionResult {
  success: boolean;
  records: Partial<ExtractedCostRecord>[];
  confidence: number;
  warnings: string[];
  audit: LLMExtractionAudit;
  error?: string;
}

export interface LLMTransformResult {
  record: Partial<ExtractedCostRecord>;
  warnings: string[];
}
