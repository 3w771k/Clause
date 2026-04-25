import { MockLlmProvider } from './mock-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import type { LlmGateway } from './llm-gateway.js';

function createLlmProvider(): LlmGateway {
  if (process.env.USE_MOCK_LLM === 'false' && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
  }
  return new MockLlmProvider();
}

export const llm: LlmGateway = createLlmProvider();
