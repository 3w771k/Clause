import type { ZodSchema } from 'zod';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmGateway {
  complete(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResponse>;
  completeStructured<T>(
    messages: LlmMessage[],
    schema: ZodSchema<T>,
    options?: LlmOptions,
  ): Promise<T>;
}
