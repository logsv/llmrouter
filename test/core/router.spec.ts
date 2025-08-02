import sinon from 'sinon';
import { LLMRouter, type LLMRequest, type LLMResponse } from '../../src/index';
import type { RouterConfig } from '../../src/types/config';

describe('LLMRouter', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('create', () => {
    it('should create LLMRouter instance with valid configuration', async () => {
      const mockConfig: RouterConfig = {
        providers: [
          {
            name: 'test-provider',
            type: 'openai',
            models: [{ name: 'gpt-3.5-turbo', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
          },
        ],
      };
      const router = await LLMRouter.create(undefined, async () => mockConfig);
      expect(router).toBeInstanceOf(LLMRouter);
    });
  });

  describe('execute', () => {
    it('should select the correct provider', async () => {
      const mockConfig: RouterConfig = {
        defaultModel: 'gpt-3.5-turbo',
        providers: [
          {
            name: 'provider-1',
            type: 'openai',
            models: [{ name: 'gpt-3.5-turbo', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
          },
          {
            name: 'provider-2',
            type: 'ollama',
            models: [{ name: 'llama2', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
          },
        ],
      };
      const router = await LLMRouter.create(undefined, async () => mockConfig);
      const request: LLMRequest = { prompt: 'test' };
      const response = await router.execute(request);
      expect(response.provider).toBe('provider-1');
    });
  });
});