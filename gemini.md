Below is a **step-by-step rollout plan** for ripping out your old, hand-rolled circuit-breaker & retry logic, plugging in Cockatiel-based policies, and keeping your existing load-balancing and rate-limiting exactly as-is.

Each step is additive—apply them in order.

---

## 1. Extend your router config

1. **Add a `resilience` section** to your `RouterConfig` (e.g. in `src/types.ts`):

   ```ts
   interface RetryConfig {
     enabled: boolean;
     attempts: number;
     initialBackoffMs: number;
     maxBackoffMs: number;
     multiplier: number;
   }
   interface CircuitBreakerConfig {
     enabled: boolean;
     threshold: number;
     samplingDurationMs: number;
     resetTimeoutMs: number;
   }
   interface ResilienceConfig {
     retry?: RetryConfig;
     circuitBreaker?: CircuitBreakerConfig;
   }
   interface RouterConfig {
     loadBalancingStrategy: 'round_robin' | 'least_loaded' | …;
     providers: ProviderConfig[];
     rateLimit?: RateLimitConfig;       // your existing rate-limit section
     resilience?: ResilienceConfig;     // NEW
   }
   ```
2. **Defaults**: Decide reasonable defaults (in docs or code) for when `resilience` is omitted.

---

## 2. Remove existing custom CB/retry

1. **Locate** wherever you implemented manual “retry n times” loops or your own “circuit breaker state.”
2. **Delete** those classes or utility functions—so that **no** code path uses them.
3. **Sanity-check**: run existing tests to confirm nothing breaks (load balancer and rate limiter still pass).

---

## 3. Install & import Cockatiel

```bash
npm install cockatiel
```

```ts
// src/policies.ts
import { Policy } from 'cockatiel';
import type { ResilienceConfig } from './types';
```

---

## 4. Build Cockatiel policies from config

In `src/policies.ts` add a factory that, given a `ResilienceConfig`, returns a “composed” policy (or a no-op):

```ts
const noOp = { execute: <T>(fn: () => Promise<T>) => fn() };

export function makeResiliencePolicy(cfg?: ResilienceConfig) {
  // Retry
  let retry: Policy<any> | undefined;
  if (cfg?.retry?.enabled) {
    retry = Policy.handleAll()
      .retry()
      .attempts(cfg.retry.attempts)
      .exponential({
        initial: cfg.retry.initialBackoffMs,
        max: cfg.retry.maxBackoffMs,
        multiplier: cfg.retry.multiplier,
      });
  }
  // Circuit Breaker
  let breaker: Policy<any> | undefined;
  if (cfg?.circuitBreaker?.enabled) {
    breaker = Policy.handleAll()
      .circuitBreaker(
        cfg.circuitBreaker.threshold,
        cfg.circuitBreaker.samplingDurationMs,
        {
          resetTimeout: cfg.circuitBreaker.resetTimeoutMs,
          onBreak: (e) => console.warn('CB open:', e),
          onReset: () => console.info('CB reset'),
          onHalfOpen: () => console.info('CB half-open'),
        }
      );
  }
  // Compose
  if (retry && breaker) return Policy.compose(retry, breaker);
  if (retry) return retry;
  if (breaker) return breaker;
  return noOp;
}
```

---

## 5. Wire the policy into your router

In your router implementation (e.g. `ResilientRouter extends LLMRouter`), replace the old CB/retry calls with the new policy:

```ts
// src/router-with-resilience.ts
import { makeResiliencePolicy } from './policies';

export class ResilientRouter extends LLMRouter {
  private policy = makeResiliencePolicy(this.config.resilience);

  static async create(handlers: any, cfgFactory: () => RouterConfig) {
    const inst = await super.create(handlers, cfgFactory);
    (inst as ResilientRouter).policy = makeResiliencePolicy(cfgFactory().resilience);
    return inst as ResilientRouter;
  }

  protected async callProvider(req, provider) {
    // ① load-balancer already picked the provider
    // ② rate-limiter already wrapped super.callProvider
    // ③ now run through Cockatiel
    return this.policy.execute(() => super.callProvider(req, provider));
  }
}
```

> **Note**
>
> * **Load-balancing** and **rate-limiting**: you did *not* touch any of the code that picks the next provider or enforces per-provider rate limits. Those wrappers still wrap `callProvider()`.
> * **Circuit/retry**: now happen *inside* that same wrapper.

---

## 6. Update your app’s config

Make sure your `makeRouterConfig()` (or whatever you call) populates `resilience`:

```ts
export function makeRouterConfig(): RouterConfig {
  return {
    loadBalancingStrategy: 'round_robin',
    providers: [ /* … */ ],
    rateLimit: { /* existing settings… */ },
    resilience: {
      retry: {
        enabled: true,
        attempts: 3,
        initialBackoffMs: 100,
        maxBackoffMs: 1000,
        multiplier: 2,
      },
      circuitBreaker: {
        enabled: true,
        threshold: 5,
        samplingDurationMs: 60_000,
        resetTimeoutMs: 30_000,
      },
    },
  };
}
```

Toggle either feature off by setting its `enabled: false` (or omit the entire section).

---

## 7. Verify with unit tests

1. **No-op when disabled**

   * If both toggles are `false`, a handler that throws once → `execute()` immediately throws (no retry).
2. **Retry only**

   * `retry.enabled=true`, `circuitBreaker.enabled=false`: verify it retries `attempts` times.
3. **Breaker only**

   * `retry.enabled=false`, `circuitBreaker.enabled=true`: verify it opens after `threshold` calls and subsequent calls immediately `CircuitBrokenError`.
4. **Combined behavior**

   * With both on, confirm retries happen *before* breaker counts a “failure.”
5. **Integration smoke**

   * End-to-end via `ResilientRouter.execute()`, using a flaky handler that fails then succeeds, and assert correct behavior.
6. **Edge cases**

   * Zero attempts, threshold of 1, reset behavior with fake timers.

Running these tests should prove you’ve cleanly removed the old logic in favor of Cockatiel, while preserving your load-balancing and rate-limiting exactly as before.