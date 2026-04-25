import Anthropic from '@anthropic-ai/sdk';
import type { ZodSchema } from 'zod';
import type { LlmGateway, LlmMessage, LlmOptions, LlmResponse } from './llm-gateway.js';

export class AnthropicProvider implements LlmGateway {
  private client: Anthropic;
  private defaultModel = 'claude-sonnet-4-6';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResponse> {
    const system = messages.find((m) => m.role === 'system')?.content;
    const userMessages = messages.filter((m) => m.role !== 'system');

    const response = await this.client.messages.create({
      model: options?.model ?? this.defaultModel,
      max_tokens: options?.maxTokens ?? 4096,
      ...(system && { system }),
      messages: userMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async completeStructured<T>(messages: LlmMessage[], schema: ZodSchema<T>, options?: LlmOptions): Promise<T> {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      const userMessages = messages.filter((m) => m.role !== 'system');
      const retryNote = attempt > 1 ? '\n\nATTENTION: La réponse précédente n\'était pas du JSON valide. Retourne UNIQUEMENT un objet JSON, rien d\'autre.' : '';

      const response = await this.client.messages.create({
        model: options?.model ?? this.defaultModel,
        max_tokens: options?.maxTokens ?? 16000,
        system: system + '\n\nIMPORTANT: Retourne uniquement du JSON valide, sans markdown, sans commentaires.' + retryNote,
        messages: userMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
      const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

      let parsed: unknown;
      try {
        try {
          parsed = JSON.parse(clean);
        } catch {
          const jsonMatch = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1]);
          } else {
            throw new Error(`non-JSON: ${clean.substring(0, 100)}`);
          }
        }

        if (typeof (schema as unknown as { parse?: unknown }).parse === 'function') {
          return schema.parse(parsed);
        }
        return parsed as T;
      } catch (err) {
        if (attempt === maxAttempts) {
          console.error(`[AnthropicProvider] JSON parse failed after ${maxAttempts} attempts:`, err instanceof Error ? err.message : String(err));
          throw new Error('Génération impossible : le modèle n\'a pas retourné du JSON valide.');
        }
        console.warn(`[AnthropicProvider] JSON parse attempt ${attempt} failed, retrying...`);
      }
    }
    throw new Error('Génération impossible.');
  }
}
