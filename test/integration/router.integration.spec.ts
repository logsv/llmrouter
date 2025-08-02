import { LLMRouter, type LLMRequest, type LLMResponse } from '../../src/index';
import type { RouterConfig } from '../../src/types/config';

describe('LLMRouter Integration Tests', () => {
  it('should select the correct provider based on cost', async () => {
    const mockConfig: RouterConfig = {
      loadBalancingStrategy: 'cost_priority_round_robin',
      defaultModel: 'gpt-3.5-turbo',
      providers: [
        {
          name: 'expensive-provider',
          type: 'openai',
          models: [
            {
              name: 'gpt-3.5-turbo',
              costPer1kInputTokens: 0.01,
              costPer1kOutputTokens: 0.03,
              maxTokens: 4096,
            },
          ],
        },
        {
          name: 'cheap-provider',
          type: 'ollama',
          models: [
            {
              name: 'gpt-3.5-turbo',
              costPer1kInputTokens: 0.001,
              costPer1kOutputTokens: 0.002,
              maxTokens: 4096,
            },
          ],
        },
      ],
    };
    const router = await LLMRouter.create(undefined, async () => mockConfig);
    const request: LLMRequest = { prompt: 'test' };
    const response = await router.execute(request);
    expect(response.provider).toBe('cheap-provider');
  });
});