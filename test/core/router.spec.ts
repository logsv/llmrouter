import { ResilientRouter } from '../../src/router-with-resilience';
import type { LLMRequest, LLMResponse, RouterConfig } from '../../src/index';

describe('ResilientRouter', () => {

  describe('create', () => {
    it('should create ResilientRouter instance with valid configuration', async () => {
      const mockConfig: RouterConfig = {
        providers: [
          {
            name: 'test-provider',
            type: 'openai',
            models: [{ name: 'gpt-3.5-turbo', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
          },
        ],
      };
      const router = await ResilientRouter.create({}, () => mockConfig);
      expect(router).toBeInstanceOf(ResilientRouter);
    });
  });

  describe('execute', () => {
    it('should use custom handler when provided', async () => {
      const handler = jest.fn().mockResolvedValue({ text: 'custom response', provider: 'custom-provider', model: 'test-model' });
      const mockConfig: RouterConfig = {
        defaultModel: 'test-model',
        providers: [
          {
            name: 'custom-provider',
            type: 'custom',
            models: [{ name: 'test-model', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
            handler: handler,
          },
        ],
      };
      const router = await ResilientRouter.create({}, () => mockConfig);
      const request: LLMRequest = { prompt: 'test' };
      const response = await router.execute(request);
      expect(response.text).toBe('custom response');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const handler = jest.fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValue({ text: 'custom response', provider: 'custom-provider', model: 'test-model' });

      const mockConfig: RouterConfig = {
        defaultModel: 'test-model',
        providers: [
          {
            name: 'custom-provider',
            type: 'custom',
            models: [{ name: 'test-model', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
            handler: handler,
          },
        ],
        resilience: {
          retry: {
            enabled: true,
            attempts: 2,
            initialBackoffMs: 1,
            maxBackoffMs: 1,
            multiplier: 1,
          },
        },
      };

      const router = await ResilientRouter.create({}, () => mockConfig);
      const request: LLMRequest = { prompt: 'test' };
      const response = await router.execute(request);

      expect(response.text).toBe('custom response');
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});