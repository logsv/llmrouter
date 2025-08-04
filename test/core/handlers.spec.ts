import { LLMRouter } from '../../src/core/router';
import { LLMRequest, LLMResponse } from '../../src/core/router';

const handlerA = jest.fn(async (req: LLMRequest): Promise<LLMResponse> => {
  return { text: 'response from A', provider: 'handlerA', model: req.model || '' };
});

const handlerB = jest.fn(async (req: LLMRequest): Promise<LLMResponse> => {
  return { text: 'response from B', provider: 'handlerB', model: req.model || '' };
});

const failingHandler = jest.fn(async (req: LLMRequest): Promise<LLMResponse> => {
  throw new Error('handler failed');
});

const config = {
  loadBalancingStrategy: 'round_robin' as const,
  providers: [
    {
      name: 'handlerA',
      type: 'custom' as const,
      models: [{ name: 'model-a', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
      handler: handlerA,
    },
    {
      name: 'handlerB',
      type: 'custom' as const,
      models: [{ name: 'model-b', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
      handler: handlerB,
    },
    {
      name: 'openai-provider',
      type: 'openai' as const,
      models: [{ name: 'gpt-4', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
    },
    {
      name: 'failing-provider',
      type: 'custom' as const,
      models: [{ name: 'failing-model', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
      handler: failingHandler,
    },
  ],
};

describe('LLMRouter with custom handlers', () => {

  it('should alternate between handlers using round-robin', async () => {
    const router = await LLMRouter.create({}, () => config);

    const res1 = await router.execute({ model: 'model-a', prompt: 'test' });
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(res1.text).toBe('response from A');

    const res2 = await router.execute({ model: 'model-b', prompt: 'test' });
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(res2.text).toBe('response from B');
  });

  it('should use the built-in OpenAI provider when no handler is provided', async () => {
    const router = await LLMRouter.create({}, () => config);
    const response = await router.execute({ model: 'gpt-4', prompt: 'test' });
    expect(response.provider).toBe('openai-provider');
  });

  it('should propagate errors from a failing handler', async () => {
    const router = await LLMRouter.create({}, () => config);
    await expect(router.execute({ model: 'failing-model', prompt: 'test' })).rejects.toThrow('handler failed');
  });
});