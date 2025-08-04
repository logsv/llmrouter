import { ResilientRouter, RouterConfig, LLMRequest, LLMResponse } from '../src';

// Example showing integration with multiple real providers
async function multiProviderExample() {
  // OpenAI handler (you would use the actual OpenAI SDK here)
  const openaiHandler = async (request: LLMRequest): Promise<LLMResponse> => {
    // Simulate OpenAI API call
    console.log(`[OpenAI] Processing request for model: ${request.model}`);
    
    // In a real implementation:
    // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // const completion = await openai.chat.completions.create({
    //   model: request.model,
    //   messages: request.messages
    // });
    // return {
    //   content: completion.choices[0].message.content,
    //   usage: completion.usage,
    //   model: request.model,
    //   provider: 'openai'
    // };

    return {
      content: `[OpenAI ${request.model}] ${request.messages?.[0]?.content || request.prompt}`,
      usage: {
        promptTokens: 20,
        completionTokens: 50,
        totalTokens: 70
      },
      model: request.model,
      provider: 'openai'
    };
  };

  // Anthropic handler (you would use the actual Anthropic SDK here)
  const anthropicHandler = async (request: LLMRequest): Promise<LLMResponse> => {
    console.log(`[Anthropic] Processing request for model: ${request.model}`);
    
    // In a real implementation:
    // const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // const message = await anthropic.messages.create({
    //   model: request.model,
    //   messages: request.messages,
    //   max_tokens: 1000
    // });
    // return {
    //   content: message.content[0].text,
    //   usage: message.usage,
    //   model: request.model,
    //   provider: 'anthropic'
    // };

    return {
      content: `[Anthropic ${request.model}] ${request.messages?.[0]?.content || request.prompt}`,
      usage: {
        promptTokens: 18,
        completionTokens: 45,
        totalTokens: 63
      },
      model: request.model,
      provider: 'anthropic'
    };
  };

  // Local Ollama handler
  const ollamaHandler = async (request: LLMRequest): Promise<LLMResponse> => {
    console.log(`[Ollama] Processing request for model: ${request.model}`);
    
    // In a real implementation:
    // const ollama = new Ollama({ host: 'http://localhost:11434' });
    // const response = await ollama.chat({
    //   model: request.model,
    //   messages: request.messages
    // });
    // return {
    //   content: response.message.content,
    //   model: request.model,
    //   provider: 'ollama'
    // };

    return {
      content: `[Ollama ${request.model}] ${request.messages?.[0]?.content || request.prompt}`,
      usage: {
        promptTokens: 25,
        completionTokens: 40,
        totalTokens: 65
      },
      model: request.model,
      provider: 'ollama'
    };
  };

  const config: RouterConfig = {
    loadBalancingStrategy: 'cost_priority_round_robin',
    providers: [
      // OpenAI - Higher cost but generally reliable
      {
        name: 'openai-gpt4',
        type: 'custom',
        handler: openaiHandler,
        models: [
          {
            name: 'gpt-4',
            costPer1kTokens: 0.03,
            maxTokens: 8192,
            priority: 2
          },
          {
            name: 'gpt-3.5-turbo',
            costPer1kTokens: 0.002,
            maxTokens: 4096,
            priority: 1
          }
        ],
        rateLimitRpm: 3000
      },
      
      // Anthropic - Mid-range cost
      {
        name: 'anthropic-claude',
        type: 'custom',
        handler: anthropicHandler,
        models: [
          {
            name: 'claude-3-opus-20240229',
            costPer1kTokens: 0.015,
            maxTokens: 200000,
            priority: 1
          },
          {
            name: 'claude-3-sonnet-20240229',
            costPer1kTokens: 0.003,
            maxTokens: 200000,
            priority: 1
          }
        ],
        rateLimitRpm: 1000
      },
      
      // Ollama - Free local model (fallback)
      {
        name: 'ollama-local',
        type: 'custom',
        handler: ollamaHandler,
        models: [
          {
            name: 'llama2',
            costPer1kTokens: 0, // Free
            maxTokens: 4096,
            priority: 3 // Lower priority (higher number)
          },
          {
            name: 'mistral',
            costPer1kTokens: 0,
            maxTokens: 8192,
            priority: 3
          }
        ],
        rateLimitRpm: 60 // Local model, lower throughput
      }
    ],
    resilience: {
      retry: {
        enabled: true,
        attempts: 2,
        initialBackoffMs: 500,
        maxBackoffMs: 2000,
        multiplier: 2
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 3,
        resetTimeoutMs: 15000,
        monitoringPeriodMs: 30000
      }
    }
  };

  const router = new ResilientRouter(config);

  console.log('Testing multi-provider setup...\n');

  // Test different models to see routing behavior
  const testRequests = [
    { model: 'gpt-3.5-turbo', content: 'What is machine learning?' },
    { model: 'claude-3-sonnet-20240229', content: 'Explain quantum computing' },
    { model: 'gpt-4', content: 'Write a haiku about AI' },
    { model: 'llama2', content: 'What is the capital of France?' },
    { model: 'mistral', content: 'Describe the solar system' }
  ];

  for (const testRequest of testRequests) {
    try {
      console.log(`\n--- Testing ${testRequest.model} ---`);
      
      const response = await router.execute({
        model: testRequest.model,
        messages: [
          { role: 'user', content: testRequest.content }
        ]
      });

      console.log(`✅ Success - Provider: ${response.provider}`);
      console.log(`Response: ${response.content}`);
      console.log(`Tokens: ${response.usage?.totalTokens || 'N/A'}`);
      
    } catch (error) {
      console.error(`❌ Failed for ${testRequest.model}:`, error.message);
    }
  }

  // Show routing statistics
  console.log('\n=== Routing Statistics ===');
  const metrics = router.getMetrics();
  for (const [providerName, metric] of Object.entries(metrics)) {
    if (metric.totalRequests > 0) {
      console.log(`\n${providerName}:`);
      console.log(`  Requests: ${metric.totalRequests}`);
      console.log(`  Success Rate: ${((metric.successfulRequests / metric.totalRequests) * 100).toFixed(1)}%`);
      console.log(`  Avg Response Time: ${metric.averageResponseTime}ms`);
    }
  }
}

if (require.main === module) {
  multiProviderExample().catch(console.error);
}

export { multiProviderExample };