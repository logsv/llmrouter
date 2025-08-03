
import type { LLMRequest, LLMResponse } from '../core/router';

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

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
}

import { LLMRequest, LLMResponse } from "../core/router";

export interface LLMProviderConfig {
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom';
  enabled?: boolean;
  priority?: number;
  apiKey?: string;
  baseUrl?: string;
  models: ModelConfig[];
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  retry?: Partial<RetryConfig>;
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
}

export interface LoadedProviderConfig extends LLMProviderConfig {
  enabled: boolean;
  priority: number;
  apiKey: string;
  baseUrl: string;
  circuitBreaker: CircuitBreakerConfig;
  retry: RetryConfig;
}

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000,
};

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
};
