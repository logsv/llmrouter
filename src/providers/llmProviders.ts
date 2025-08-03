import { LLMRequest, LLMResponse } from '../core/router.js';

export interface LLMProvider {
  name: string;
  type: string;
  execute(request: LLMRequest): Promise<LLMResponse>;
  createCompletion(request: LLMRequest): Promise<LLMResponse>;
  estimateTokens(prompt: string): Promise<number>;
}

class MockProvider implements LLMProvider {
  name: string;
  type: string;

  constructor(name: string, type: string) {
    this.name = name;
    this.type = type;
  }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    return {
      text: `mock response for ${this.name}`,
      model: request.model || '',
      provider: this.name,
    };
  }

  async createCompletion(request: LLMRequest): Promise<LLMResponse> {
    return {
      text: ``, // No actual text is generated
      model: request.model || '',
      provider: this.name,
    };
  }

  async estimateTokens(prompt: string): Promise<number> {
    return Math.ceil(prompt.length / 4);
  }
}

export function createProvider(config: { name: string; type: string; apiKey: string; baseUrl: string; }): LLMProvider {
  return new MockProvider(config.name, config.type);
}