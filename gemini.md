This document outlines the step-by-step code changes required to allow users to inject their own provider-handler functions while preserving all existing load-balancing, circuit-breaker, retry, and rate-limit logic.

1.  **Extend the `ProviderConfig` type**
    -   Add an optional `handler` property of type `(req: ExecuteRequest) => Promise<ExecuteResponse>` to `src/types.ts` (or wherever `ProviderConfig` is defined).

2.  **Update the router factory signature**
    -   Change `LLMRouter.create()` in `src/index.ts` (or equivalent) to accept an optional first argument `handlersMap: Record<string, HandlerFn>`.
    -   Wire that map through so each `ProviderConfig` picked up by the router can carry its `handler`.

3.  **Modify `makeRouterConfig()` example**
    -   In the user’s `config.ts`, show how to turn a `providerHandlers: Record<string, HandlerFn>` into the `providers: ProviderConfig[]` array by mapping each entry to `{ name, type, models, handler }`.

4.  **Patch the `execute()` logic**
    -   In `LLMRouter.prototype.execute()` (or `callProvider()`), before the `switch(provider.type)`, insert:
        ```ts
        if (provider.handler) {
          return await provider.handler(request);
        }
        ```
    -   Ensure that for providers without a `handler`, the existing `openai`/`ollama` branches remain unchanged.

5.  **Export the new `HandlerFn` type**
    -   Add `export type HandlerFn = (req: ExecuteRequest) => Promise<ExecuteResponse>;` to the public API surface (`src/types.ts` or `index.ts`).

6.  **Add a minimal end-to-end example**
    -   In `examples/app.ts`, demonstrate:
        ```ts
        import { LLMRouter } from 'llm-router';
        import { providerHandlers } from './handlers';
        import { makeRouterConfig } from './config';

        async function main() {
          const router = await LLMRouter.create(providerHandlers, makeRouterConfig);
          const res = await router.execute({ prompt: 'Hello', model: 'gpt-3.5-turbo' });
          console.log(res.provider, res.text);
        }
        main();
        ```

7.  **Add unit tests**
    -   Under `tests/`:
        1.  Mocks two simple handler functions (`handlerA`, `handlerB`) that return distinct results.
        2.  Builds a router with those handlers and a round-robin strategy.
        3.  Verifies that calling `router.execute()` alternates between `handlerA` and `handlerB`.
        4.  Verifies that if a provider config has no handler but `type: 'openai'`, the built-in OpenAI stub is invoked (mocking that code).
        5.  Covers error propagation from a failing handler.
