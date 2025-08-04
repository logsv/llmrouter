import { LLMRouter, RouterConfig, LLMRequest, LLMResponse } from '../src';

// Basic example showing how to use the LLM Router with OpenAI
async function basicExample() {
  // Define a simple handler for OpenAI
  const openaiHandler = async (request: LLMRequest): Promise<LLMResponse> => {
    // In a real implementation, you would call the OpenAI API here
    // For this example, we'll simulate a response
    return {
      content: `Mock response for: ${request.messages?.[0]?.content || request.prompt}`,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      },
      model: request.model,
      provider: 'openai-mock'
    };
  };

  const config: RouterConfig = {
    loadBalancingStrategy: 'round_robin',
    defaultModel: 'gpt-3.5-turbo',
    providers: [
      {
        name: 'openai-primary',
        type: 'custom',
        handler: openaiHandler,
        models: [
          {
            name: 'gpt-3.5-turbo',
            costPer1kTokens: 0.002,
            maxTokens: 4096,
            priority: 1
          }
        ],
        rateLimitRpm: 3000
      }
    ]
  };

  const router = new LLMRouter(config);

  try {
    const response = await router.execute({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: 'Hello, world!' }
      ]
    });

    console.log('Response:', response.content);
    console.log('Provider:', response.provider);
    console.log('Usage:', response.usage);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

if (require.main === module) {
  basicExample().catch(console.error);
}

export { basicExample };