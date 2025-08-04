# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to JavaScript
- **Test**: `npm test` - Runs Jest test suite
- **Run single test**: `npm test -- --testNamePattern="test name"` or `npm test path/to/test.spec.ts`

## Architecture Overview

This is an LLM Router that provides load balancing, resilience, and provider management for multiple LLM services. The architecture consists of two main router implementations:

### Core Components

- **LLMRouter** (`src/core/router.ts`) - Base router with provider management and load balancing
- **ResilientRouter** (`src/router-with-resilience.ts`) - Extends LLMRouter with retry and circuit breaker policies using Cockatiel
- **Provider System** (`src/providers/llmProviders.ts`) - Factory for creating provider instances (OpenAI, Ollama, etc.)
- **Configuration** (`src/types/config.ts`) - TypeScript interfaces for router and provider configuration
- **Resilience Policies** (`src/policies.ts`) - Retry and circuit breaker policy creation using Cockatiel

### Key Patterns

1. **Two Router Types**:
   - Use `LLMRouter` for basic routing without resilience
   - Use `ResilientRouter` for production with retry and circuit breaker support

2. **Provider Configuration**:
   - Providers can use built-in integrations (`openai`, `ollama`) or custom handlers
   - Custom providers require a `handler` function in the provider config
   - Provider types: `'openai' | 'anthropic' | 'google' | 'ollama' | 'custom'`

3. **Load Balancing Strategies**:
   - `round_robin` - Equal distribution across providers
   - `cost_priority_round_robin` - Weighted by cost and priority

4. **Model Support**:
   - Each provider declares supported models with cost and token limits
   - Router automatically filters providers based on requested model

### Configuration Structure

Router configuration follows this pattern:
```typescript
RouterConfig {
  loadBalancingStrategy: 'round_robin' | 'cost_priority_round_robin'
  defaultModel?: string
  providers: LLMProviderConfig[]
  resilience?: ResilienceConfig
}
```

Provider configuration supports both built-in and custom handlers:
```typescript
LLMProviderConfig {
  name: string
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom'
  handler?: (req: LLMRequest) => Promise<LLMResponse>  // For custom providers
  models: ModelConfig[]
  // ... other config
}
```

### Test Structure

- Tests are organized in `/test` directory mirroring `/src` structure
- Uses Jest with TypeScript preset
- Integration tests in `/test/integration`
- Unit tests for core components in `/test/core`

### Example Usage Pattern

The typical usage follows this flow:
1. Define provider handlers (for custom providers)
2. Create router configuration with providers and resilience settings
3. Instantiate router using static `create()` method
4. Execute requests through router which handles provider selection and resilience