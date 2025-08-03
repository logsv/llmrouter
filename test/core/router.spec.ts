import sinon from 'sinon';
import { LLMRouter, type LLMRequest, type LLMResponse, type ProviderHandlers } from '../../src/index';
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
      const router = await LLMRouter.create({}, () => mockConfig);
      expect(router).toBeInstanceOf(LLMRouter);
    });
  });

  describe('execute', () => {
    it('should use custom handler when provided', async () => {
      const handler = sinon.stub().resolves({ text: 'custom response', provider: 'custom-provider', model: 'test-model' });
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
      const router = await LLMRouter.create({}, () => mockConfig);
      const request: LLMRequest = { prompt: 'test' };
      const response = await router.execute(request);
      expect(response.text).toBe('custom response');
      expect(handler.calledOnce).toBe(true);
    });
  });
});