import { ResilientRouter, RouterConfig, LLMRequest, LLMResponse } from '../src';

// Example showing resilient router with multiple providers and failover
async function resilientExample() {
  // Simulate different providers with varying reliability
  const primaryHandler = async (request: LLMRequest): Promise<LLMResponse> => {
    // Simulate 90% success rate
    if (Math.random() < 0.1) {
      throw new Error('Primary provider temporarily unavailable');
    }
    
    return {
      content: `Primary response: ${request.messages?.[0]?.content || request.prompt}`,
      usage: {
        promptTokens: 12,
        completionTokens: 25,
        totalTokens: 37
      },
      model: request.model,
      provider: 'primary-openai'
    };
  };

  const fallbackHandler = async (request: LLMRequest): Promise<LLMResponse> => {
    // Simulate 95% success rate for fallback
    if (Math.random() < 0.05) {
      throw new Error('Fallback provider error');
    }

    return {
      content: `Fallback response: ${request.messages?.[0]?.content || request.prompt}`,
      usage: {
        promptTokens: 15,
        completionTokens: 30,
        totalTokens: 45
      },
      model: request.model,
      provider: 'fallback-anthropic'
    };
  };

  const config: RouterConfig = {
    loadBalancingStrategy: 'cost_priority_round_robin',
    defaultModel: 'gpt-3.5-turbo',
    providers: [
      {
        name: 'primary-openai',
        type: 'custom',
        handler: primaryHandler,
        models: [
          {
            name: 'gpt-3.5-turbo',
            costPer1kTokens: 0.002,
            maxTokens: 4096,
            priority: 1
          }
        ],
        rateLimitRpm: 3000
      },
      {
        name: 'fallback-anthropic',
        type: 'custom',
        handler: fallbackHandler,
        models: [
          {
            name: 'gpt-3.5-turbo',
            costPer1kTokens: 0.008,
            maxTokens: 4096,
            priority: 2
          }
        ],
        rateLimitRpm: 1000
      }
    ],
    resilience: {
      retry: {
        enabled: true,
        attempts: 3,
        initialBackoffMs: 1000,
        maxBackoffMs: 5000,
        multiplier: 2
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        monitoringPeriodMs: 60000
      }
    }
  };

  const router = new ResilientRouter(config);

  console.log('Testing resilient router with multiple requests...\n');

  // Send multiple requests to test load balancing and resilience
  for (let i = 1; i <= 10; i++) {
    try {
      const response = await router.execute({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: `Test request ${i}` }
        ]
      });

      console.log(`Request ${i}:`);
      console.log(`  Provider: ${response.provider}`);
      console.log(`  Response: ${response.content}`);
      console.log(`  Tokens: ${response.usage?.totalTokens}`);
      console.log('');
    } catch (error) {
      console.error(`Request ${i} failed:`, error.message);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Display final metrics
  console.log('\n=== Final Metrics ===');
  const metrics = router.getMetrics();
  for (const [providerName, metric] of Object.entries(metrics)) {
    console.log(`${providerName}:`);
    console.log(`  Total Requests: ${metric.totalRequests}`);
    console.log(`  Successful: ${metric.successfulRequests}`);
    console.log(`  Failed: ${metric.failedRequests}`);
    console.log(`  Success Rate: ${((metric.successfulRequests / metric.totalRequests) * 100).toFixed(1)}%`);
    console.log(`  Avg Response Time: ${metric.averageResponseTime}ms`);
    console.log(`  Circuit Breaker Open: ${metric.circuitBreakerOpen}`);
    console.log('');
  }
}

if (require.main === module) {
  resilientExample().catch(console.error);
}

export { resilientExample };