import { retry, handleAll, ExponentialBackoff, circuitBreaker, ConsecutiveBreaker, wrap } from 'cockatiel';
import type { ResilienceConfig } from './types/config';

export function makeResiliencePolicy(cfg?: ResilienceConfig) {
  const policies: any[] = [];

  if (cfg?.retry?.enabled) {
    policies.push(retry(handleAll, {
      maxAttempts: cfg.retry.attempts,
      backoff: new ExponentialBackoff({
        initialDelay: cfg.retry.initialBackoffMs,
        maxDelay: cfg.retry.maxBackoffMs,
      }),
    }));
  }

  if (cfg?.circuitBreaker?.enabled) {
    policies.push(circuitBreaker(handleAll, {
      halfOpenAfter: cfg.circuitBreaker.resetTimeoutMs,
      breaker: new ConsecutiveBreaker(cfg.circuitBreaker.threshold),
    }));
  }

  if (policies.length === 0) {
    // Return a no-op policy that just executes the function
    return {
      execute: async <T>(fn: () => Promise<T>): Promise<T> => fn()
    } as any;
  }

  return wrap(...policies);
}