# LLM Router

[![CI](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/actions/workflows/ci.yml)

A production-ready LLM router with intelligent load balancing, rate limiting, circuit breaker patterns, and comprehensive metrics tracking. This library provides a wrapper/proxy layer for LLM providers without implementing any LLM integrations directly - it's designed to route requests to your own LLM API integrations.

## ✨ Features

- **🔄 Smart Load Balancing**: Cost-priority and round-robin strategies
- **⚡ Rate Limiting**: Token bucket algorithm with per-provider limits
- **🛡️ Circuit Breaker**: Per-provider circuit breaker with automatic recovery
- **🔁 Retry Logic**: Exponential backoff with configurable attempts
- **📊 Metrics Tracking**: Comprehensive request/response metrics
- **⚙️ Configurable**: Enable/disable features per provider
- **🎯 No LLM Lock-in**: Bring your own LLM API integrations
- **💪 TypeScript**: Full type safety and IntelliSense support

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   LLM Request   │────▶│   LLM Router     │────▶│  Your Handler   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          │
                    ┌──────────────────┐                 │
                    │ Load Balancer    │                 │
                    │ • Cost Priority  │                 │
                    │ • Round Robin    │                 │
                    └──────────────────┘                 │
                              │                          │
                              ▼                          │
                    ┌──────────────────┐                 │
                    │ Rate Limiter     │                 │
                    │ • Token Bucket   │                 │
                    │ • Per Provider   │                 │
                    └──────────────────┘                 │
                              │                          │
                              ▼                          │
                    ┌──────────────────┐                 │
                    │ Circuit Breaker  │                 │
                    │ • Per Provider   │                 │
                    │ • Auto Recovery  │                 │
                    └──────────────────┘                 │
                              │                          │
                              ▼                          │
                    ┌──────────────────┐                 │
                    │ Retry Logic      │                 │
                    │ • Exponential    │                 │
                    │ • Backoff        │                 │
                    └──────────────────┘                 │
                              │                          │
                              ▼                          ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │ Metrics Tracking │    │   OpenAI API    │
                    │ • Success/Fail   │    │   Anthropic     │
                    │ • Rate Limits    │    │   Custom APIs   │
                    │ • Response Time  │    │   Ollama        │
                    └──────────────────┘    └─────────────────┘
```

### Request Flow

1. **Load Balancer**: Selects providers based on cost-priority or round-robin
2. **Rate Limit Check**: Verifies provider has available token capacity  
3. **Circuit Breaker Check**: Skips providers with open circuit breakers
4. **Execute**: Runs request through rate limiter with retry logic
5. **Update Metrics**: Tracks success/failure and updates circuit breaker state

## Installation

```bash
npm install llm-router
```

## Quick Start

```typescript
import { ResilientRouter, type LLMRequest, type LLMResponse } from 'llm-router';

// 1. Define your LLM provider handlers
const handlers = {
  'openai-provider': async (req: LLMRequest): Promise<LLMResponse> => {
    // Your OpenAI integration logic
    const response = await openaiClient.chat.completions.create({
      model: req.model,
      messages: [{ role: 'user', content: req.prompt }]
    });
    return { 
      text: response.choices[0].message.content,
      provider: 'openai-provider',
      model: req.model 
    };
  },
  'anthropic-provider': async (req: LLMRequest): Promise<LLMResponse> => {
    // Your Anthropic integration logic
    const response = await anthropicClient.messages.create({
      model: req.model,
      messages: [{ role: 'user', content: req.prompt }]
    });
    return { 
      text: response.content[0].text,
      provider: 'anthropic-provider',
      model: req.model 
    };
  }
};

// 2. Configure the router
const config = {
  loadBalancingStrategy: 'cost_priority_round_robin',
  providers: [
    {
      name: 'openai-provider',
      type: 'custom',
      handler: handlers['openai-provider'],
      models: [{
        name: 'gpt-4',
        costPer1kInputTokens: 0.03,
        costPer1kOutputTokens: 0.06,
        maxTokens: 8192
      }],
      rateLimit: {
        tokensPerSecond: 10,
        maxConcurrent: 5
      },
      priority: 2
    },
    {
      name: 'anthropic-provider', 
      type: 'custom',
      handler: handlers['anthropic-provider'],
      models: [{
        name: 'claude-3-sonnet',
        costPer1kInputTokens: 0.015,
        costPer1kOutputTokens: 0.075,
        maxTokens: 4096
      }],
      rateLimit: {
        tokensPerSecond: 20,
        maxConcurrent: 10
      },
      priority: 1
    }
  ],
  resilience: {
    retry: {
      enabled: true,
      attempts: 3,
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
      multiplier: 2
    },
    circuitBreaker: {
      enabled: true,
      threshold: 5,
      samplingDurationMs: 60000,
      resetTimeoutMs: 30000
    }
  }
};

// 3. Create and use the router
const router = await ResilientRouter.create(handlers, () => config);

const response = await router.execute({
  prompt: 'Explain quantum computing',
  model: 'claude-3-sonnet'
});

console.log(`Provider: ${response.provider}`);
console.log(`Response: ${response.text}`);
```

## Configuration Options

### Router Configuration

```typescript
interface RouterConfig {
  loadBalancingStrategy?: 'round_robin' | 'cost_priority_round_robin';
  defaultModel?: string;
  providers: LLMProviderConfig[];
  resilience?: ResilienceConfig;
}
```

### Provider Configuration

```typescript
interface LLMProviderConfig {
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';
  enabled?: boolean;
  priority?: number;  // Lower number = higher priority
  handler: (req: LLMRequest) => Promise<LLMResponse>;
  models: ModelConfig[];
  rateLimit?: {
    maxConcurrent?: number;
    tokensPerSecond?: number;
  };
}
```

### Model Configuration

```typescript
interface ModelConfig {
  name: string;
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;
  maxTokens: number;
}
```

### Resilience Configuration

```typescript
interface ResilienceConfig {
  retry?: {
    enabled: boolean;
    attempts: number;
    initialBackoffMs: number;
    maxBackoffMs: number;
    multiplier: number;
  };
  circuitBreaker?: {
    enabled: boolean;
    threshold: number;          // Failures before opening
    samplingDurationMs: number; // Time window for failures
    resetTimeoutMs: number;     // Time before trying half-open
  };
}
```

## Load Balancing Strategies

### Cost Priority Round Robin
Selects providers based on cost efficiency, factoring in both token costs and provider priority:

```typescript
// Lower cost providers are preferred
// Priority acts as a multiplier (lower number = higher priority)
finalScore = avgCost / priorityWeight
```

### Round Robin
Distributes requests evenly across available providers based on least recently used:

```typescript
// Selects provider with oldest lastUsed timestamp
```

## Rate Limiting

Uses token bucket algorithm with configurable refill rates:

```typescript
rateLimit: {
  tokensPerSecond: 10,    // Bucket refill rate
  maxConcurrent: 5        // Maximum concurrent requests
}
```

- Providers without available tokens are skipped during selection
- Rate-limited requests are tracked in metrics
- Uses Bottleneck library for precise rate limiting

## Circuit Breaker

Per-provider circuit breaker with three states:

- **Closed**: Normal operation
- **Open**: Provider is failing, requests are blocked
- **Half-Open**: Testing if provider has recovered

```typescript
circuitBreaker: {
  enabled: true,
  threshold: 5,          // Failures before opening
  resetTimeoutMs: 30000  // Time before trying half-open
}
```

## Metrics Tracking

Each provider tracks comprehensive metrics:

```typescript
interface Metrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  circuitBreakerTrips: number;
  lastRequestTime: number;
  averageResponseTime: number;
}
```

Access metrics via:
```typescript
const providers = router.providers;
const metrics = providers.get('provider-name').metrics;
```

## Advanced Usage

### Custom Error Handling

```typescript
const handler = async (req: LLMRequest): Promise<LLMResponse> => {
  try {
    // Your LLM API call
    return await callLLMAPI(req);
  } catch (error) {
    // Custom error handling
    if (error.status === 429) {
      // Rate limit error - let circuit breaker handle it
      throw error;
    }
    // Transform other errors as needed
    throw new Error(`LLM API Error: ${error.message}`);
  }
};
```

### Provider Health Monitoring

```typescript
// Check provider health
const provider = router.providers.get('my-provider');
console.log(`Circuit breaker state: ${provider.circuitBreakerState}`);
console.log(`Success rate: ${provider.metrics.successfulRequests / provider.metrics.totalRequests}`);
console.log(`Avg response time: ${provider.metrics.averageResponseTime}ms`);
```

### Dynamic Configuration

```typescript
// Disable a failing provider
const config = getCurrentConfig();
config.providers.find(p => p.name === 'failing-provider').enabled = false;

// Create new router with updated config
const newRouter = await ResilientRouter.create(handlers, () => config);
```

## Examples

### Multi-Provider Setup with Fallbacks

```typescript
const config = {
  loadBalancingStrategy: 'cost_priority_round_robin',
  providers: [
    {
      name: 'primary-cheap',
      handler: cheapProviderHandler,
      models: [{ name: 'gpt-3.5-turbo', costPer1kInputTokens: 0.001, costPer1kOutputTokens: 0.002 }],
      priority: 1,
      rateLimit: { tokensPerSecond: 50 }
    },
    {
      name: 'secondary-expensive', 
      handler: expensiveProviderHandler,
      models: [{ name: 'gpt-4', costPer1kInputTokens: 0.03, costPer1kOutputTokens: 0.06 }],
      priority: 2,
      rateLimit: { tokensPerSecond: 10 }
    },
    {
      name: 'backup-local',
      handler: localProviderHandler,
      models: [{ name: 'llama2', costPer1kInputTokens: 0, costPer1kOutputTokens: 0 }],
      priority: 3,
      rateLimit: { tokensPerSecond: 5 }
    }
  ]
};
```

### Testing Circuit Breaker

```typescript
// Simulate failures to test circuit breaker
const flakyHandler = async (req: LLMRequest): Promise<LLMResponse> => {
  if (Math.random() < 0.7) { // 70% failure rate
    throw new Error('Simulated failure');
  }
  return { text: 'Success!', provider: 'flaky', model: req.model };
};
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run single test
npm test -- --testNamePattern="test name"
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)