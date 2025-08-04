
import type { LLMRequest, LLMResponse, ProviderHandlers } from '../core/router';

// Re-export types for convenience
export type { LLMRequest, LLMResponse, ProviderHandlers };

export interface ModelConfig {
  name: string;
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;
  maxTokens: number;
  rateLimit?: {
    maxConcurrent?: number;
    minTimeMs?: number;
    tokensPerSecond?: number;
  };
}

export interface RetryConfig {
  enabled: boolean;
  attempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  multiplier: number;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  threshold: number;
  samplingDurationMs: number;
  resetTimeoutMs: number;
}

export interface ResilienceConfig {
  retry?: RetryConfig;
  circuitBreaker?: CircuitBreakerConfig;
}

export interface LLMProviderConfig {
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';
  enabled?: boolean;
  priority?: number;
  apiKey?: string;
  baseUrl?: string;
  models: ModelConfig[];
  rateLimit?: {
    maxConcurrent?: number;
    minTimeMs?: number;
    tokensPerSecond?: number;
  };
  handler?: (req: LLMRequest) => Promise<LLMResponse>;
}

export interface RouterConfig {
  loadBalancingStrategy?: 'round_robin' | 'cost_priority_round_robin';
  defaultModel?: string;
  providers: LLMProviderConfig[];
  resilience?: ResilienceConfig;
}

export interface LoadedProviderConfig extends LLMProviderConfig {
  enabled: boolean;
  priority: number;
  apiKey: string;
  baseUrl: string;
}

export const DEFAULT_RETRY: RetryConfig = {
  enabled: true,
  attempts: 3,
  initialBackoffMs: 100,
  maxBackoffMs: 1000,
  multiplier: 2,
};

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  enabled: true,
  threshold: 5,
  samplingDurationMs: 60000,
  resetTimeoutMs: 30000,
};
