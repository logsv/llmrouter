import { Policy, retry, handleAll, ExponentialBackoff, circuitBreaker, ConsecutiveBreaker, wrap } from 'cockatiel';
import type { ResilienceConfig } from './types/config';

const noOp = Policy.noop;

export function makeResiliencePolicy(cfg?: ResilienceConfig) {
  const policies: Policy[] = [];

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
    return Policy.noop;
  }

  return wrap(...policies);
}