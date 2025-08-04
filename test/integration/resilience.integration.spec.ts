import { ResilientRouter } from '../../src/router-with-resilience';
import type { LLMRequest, LLMResponse, RouterConfig } from '../../src/index';

describe('Resilience Integration Tests', () => {
  it('should implement correct flow: Load balancer → Rate limit → Circuit breaker → Execute', async () => {
    let callCount = 0;
    const mockHandler = jest.fn().mockImplementation(async (req: LLMRequest): Promise<LLMResponse> => {
      callCount++;
      // Fail first 2 calls to test circuit breaker
      if (callCount <= 2) {
        throw new Error('Simulated failure');
      }
      return { text: 'success', provider: 'test-provider', model: req.model || 'test-model' };
    });

    const mockConfig: RouterConfig = {
      loadBalancingStrategy: 'round_robin',
      defaultModel: 'test-model',
      providers: [
        {
          name: 'test-provider',
          type: 'custom',
          models: [{ name: 'test-model', costPer1kInputTokens: 0.001, costPer1kOutputTokens: 0.002, maxTokens: 4096 }],
          handler: mockHandler,
          rateLimit: {
            maxConcurrent: 2,
            tokensPerSecond: 10,
          },
        },
      ],
      resilience: {
        retry: {
          enabled: true,
          attempts: 3,
          initialBackoffMs: 10,
          maxBackoffMs: 100,
          multiplier: 2,
        },
        circuitBreaker: {
          enabled: true,
          threshold: 2,
          samplingDurationMs: 60000,
          resetTimeoutMs: 1000,
        },
      },
    };

    const router = await ResilientRouter.create({}, () => mockConfig);
    const request: LLMRequest = { prompt: 'test' };

    // First request should succeed after retries
    const response = await router.execute(request);
    expect(response.text).toBe('success');
    expect(mockHandler).toHaveBeenCalledTimes(3); // 2 failures + 1 success

    // Verify metrics were updated
    const providers = (router as any).providers;
    const providerWrapper = providers.get('test-provider');
    expect(providerWrapper.metrics.totalRequests).toBe(1);
    expect(providerWrapper.metrics.successfulRequests).toBe(1);
    expect(providerWrapper.metrics.failedRequests).toBe(0); // Final result was success
    expect(providerWrapper.circuitBreakerState).toBe('closed'); // Should be closed after success
  });

  it('should respect rate limits and circuit breaker states', async () => {
    const fastHandler = jest.fn().mockResolvedValue({ 
      text: 'fast response', 
      provider: 'cheap-provider', 
      model: 'test-model' 
    });
    
    const slowHandler = jest.fn().mockImplementation(async (req: LLMRequest): Promise<LLMResponse> => {
      // Simulate rate limiting by throwing error
      throw new Error('Rate limited');
    });

    const mockConfig: RouterConfig = {
      loadBalancingStrategy: 'cost_priority_round_robin',
      defaultModel: 'test-model',
      providers: [
        {
          name: 'expensive-provider',
          type: 'custom',
          models: [{ name: 'test-model', costPer1kInputTokens: 0.01, costPer1kOutputTokens: 0.03, maxTokens: 4096 }],
          handler: slowHandler,
          rateLimit: {
            maxConcurrent: 1,
            tokensPerSecond: 1, // Very low rate limit
          },
          priority: 2,
        },
        {
          name: 'cheap-provider',
          type: 'custom',
          models: [{ name: 'test-model', costPer1kInputTokens: 0.001, costPer1kOutputTokens: 0.002, maxTokens: 4096 }],
          handler: fastHandler,
          rateLimit: {
            maxConcurrent: 10,
            tokensPerSecond: 100,
          },
          priority: 1,
        },
      ],
      resilience: {
        retry: {
          enabled: true,
          attempts: 2,
          initialBackoffMs: 10,
          maxBackoffMs: 50,
          multiplier: 2,
        },
        circuitBreaker: {
          enabled: true,
          threshold: 3,
          samplingDurationMs: 60000,
          resetTimeoutMs: 1000,
        },
      },
    };

    const router = await ResilientRouter.create({}, () => mockConfig);
    const request: LLMRequest = { prompt: 'test' };

    // Should select cheap provider (lowest cost)
    const response = await router.execute(request);
    expect(response.text).toBe('fast response');
    expect(response.provider).toBe('cheap-provider');
    
    // Cheap provider should have been called, expensive provider should not
    expect(fastHandler).toHaveBeenCalledTimes(1);
    expect(slowHandler).toHaveBeenCalledTimes(0);
  });

  it('should track metrics correctly', async () => {
    const handler = jest.fn().mockResolvedValue({
      text: 'test response',
      provider: 'metrics-provider',
      model: 'test-model'
    });

    const mockConfig: RouterConfig = {
      defaultModel: 'test-model',
      providers: [
        {
          name: 'metrics-provider',
          type: 'custom',
          models: [{ name: 'test-model', costPer1kInputTokens: 0.001, costPer1kOutputTokens: 0.002, maxTokens: 4096 }],
          handler: handler,
        },
      ],
    };

    const router = await ResilientRouter.create({}, () => mockConfig);
    const request: LLMRequest = { prompt: 'test' };

    // Make several requests
    await router.execute(request);
    await router.execute(request);
    await router.execute(request);

    // Check metrics
    const providers = (router as any).providers;
    const providerWrapper = providers.get('metrics-provider');
    
    expect(providerWrapper.metrics.totalRequests).toBe(3);
    expect(providerWrapper.metrics.successfulRequests).toBe(3);
    expect(providerWrapper.metrics.failedRequests).toBe(0);
    expect(providerWrapper.metrics.rateLimitedRequests).toBe(0);
    expect(providerWrapper.lastUsed).toBeGreaterThan(0);
    expect(handler).toHaveBeenCalledTimes(3);
  });
});