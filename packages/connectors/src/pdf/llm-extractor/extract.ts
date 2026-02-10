import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  MAX_CONTEXT_CHARS,
  PROMPT_VERSION,
} from './constants.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { EXTRACTION_TOOL } from './schema.js';
import { calculateRecordConfidence, transformLLMOutput } from './transform.js';
import type { LLMExtractionConfig, LLMExtractionResult } from './types.js';

function hashForAudit(value: string): string {
  return createHash('sha256').update(value).digest('hex').substring(0, 16);
}

function truncateForContext(text: string): string {
  if (text.length <= MAX_CONTEXT_CHARS) {
    return text;
  }

  return `${text.substring(0, MAX_CONTEXT_CHARS)}\n...[truncated]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getToolInput(response: unknown): Record<string, unknown> | null {
  if (!isRecord(response)) {
    return null;
  }

  const content = response['content'];
  if (!Array.isArray(content)) {
    return null;
  }

  for (const block of content) {
    if (!isRecord(block) || block['type'] !== 'tool_use') {
      continue;
    }

    const input = block['input'];
    if (isRecord(input)) {
      return input;
    }
  }

  return null;
}

function createFailureResult(params: {
  model: string;
  temperature: number;
  inputHash: string;
  error: string;
  warnings?: string[];
}): LLMExtractionResult {
  return {
    success: false,
    records: [],
    confidence: 0,
    warnings: params.warnings ?? [],
    audit: {
      model: params.model,
      promptVersion: PROMPT_VERSION,
      temperature: params.temperature,
      inputHash: params.inputHash,
      outputHash: '',
    },
    error: params.error,
  };
}

export async function extractWithLLM(
  text: string,
  config: LLMExtractionConfig,
): Promise<LLMExtractionResult> {
  const model = config.model ?? DEFAULT_LLM_MODEL;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const inputHash = hashForAudit(text);

  try {
    const client = new Anthropic({ apiKey: config.apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      stream: false,
      system: SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: 'extract_invoice_data' },
      messages: [
        {
          role: 'user',
          content: `Extrahiere die Rechnungsdaten aus folgendem Text:\n\n${truncateForContext(text)}`,
        },
      ],
    });

    const extracted = getToolInput(response);
    if (!extracted) {
      return createFailureResult({
        model,
        temperature,
        inputHash,
        error: 'No tool call in response',
        warnings: ['LLM did not return tool call'],
      });
    }

    const outputHash = hashForAudit(JSON.stringify(extracted));
    const { record, warnings } = transformLLMOutput(extracted);
    const confidence = calculateRecordConfidence(record);

    record.confidence = confidence;
    record.extractionMethod = 'llm';
    record.manuallyVerified = false;

    return {
      success: true,
      records: [record],
      confidence,
      warnings,
      audit: {
        model,
        promptVersion: PROMPT_VERSION,
        temperature,
        inputHash,
        outputHash,
      },
    };
  } catch (error) {
    return createFailureResult({
      model,
      temperature,
      inputHash,
      error: error instanceof Error ? error.message : 'Unknown LLM error',
    });
  }
}
