import { LLMRouter, type LLMRequest, type LLMResponse, type ProviderHandlers } from './core/router';
import { makeResiliencePolicy } from './policies';
import type { RouterConfig } from './types/config';
import { IPolicy } from 'cockatiel';

export class ResilientRouter extends LLMRouter {
  private policy: IPolicy;

  constructor(config: RouterConfig, handlers?: ProviderHandlers) {
    super(config, handlers);
    this.policy = makeResiliencePolicy(this.config.resilience);
  }

  static async create(handlers: any, cfgFactory: () => RouterConfig): Promise<ResilientRouter> {
    const config = cfgFactory();
    const router = new ResilientRouter(config, handlers);
    await router.initializeProviders(config);
    return router;
  }

  public async execute(request: LLMRequest, preferredProviders: string[] = []): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    if (!model) {
      throw new Error('No model specified in request and no default model configured');
    }

    const availableProviders = this.getProvidersForModel(model);
    if (availableProviders.length === 0) {
      throw new Error(`No providers available for model: ${model}`);
    }

    // Execute with retry policy - this will handle retries with exponential backoff
    // If one provider fails, the retry policy will retry the same provider
    // If all retries fail, we'll try the next provider
    return await this.policy.execute(async () => {
      // First try preferred providers that support the model
      let providerName = await this.selectProvider(
        preferredProviders.filter(p => availableProviders.includes(p))
      );
      
      // If no preferred providers are available, try any available provider
      if (!providerName) {
        providerName = await this.selectProvider(availableProviders);
      }
      
      if (!providerName) {
        throw new Error('No available LLM providers - all are either rate limited or circuit breaker is open');
      }

      // Execute the request through the rate limiter with per-provider circuit breaker
      return await this.executeWithRateLimit(providerName, request);
    });
  }

  /**
   * Override executeWithRateLimit to use per-provider retry policy instead of global policy
   */
  protected async executeWithRateLimit(providerName: string, request: LLMRequest): Promise<LLMResponse> {
    const providerWrapper = this.providers.get(providerName);
    if (!providerWrapper) {
      throw new Error(`Provider ${providerName} not found`);
    }

    const startTime = Date.now();
    let success = false;
    let response: LLMResponse;

    // Create per-provider retry policy if retry is enabled
    const retryConfig = this.config.resilience?.retry;
    let retryAttempts = 0;
    const maxRetries = retryConfig?.enabled ? retryConfig.attempts : 1;

    while (retryAttempts < maxRetries) {
      try {
        // Execute through rate limiter using bottleneck
        response = await providerWrapper.limiter.schedule(async () => {
          if (providerWrapper.config.handler) {
            return await providerWrapper.config.handler(request);
          }

          // otherwise fall back to built-in logic
          switch (providerWrapper.config.type) {
            case 'openai':
            case 'ollama':
              return await providerWrapper.provider.execute(request);
            default:
              throw new Error(`No integration for ${providerWrapper.config.type}`);
          }
        });

        success = true;
        break; // Success, exit retry loop
        
      } catch (error) {
        retryAttempts++;
        success = false;
        
        // If this was the last retry or retry is not enabled, throw the error
        if (retryAttempts >= maxRetries) {
          success = false;
          throw error;
        }

        // Wait before retrying (exponential backoff)
        if (retryConfig?.enabled) {
          const delay = Math.min(
            retryConfig.initialBackoffMs * Math.pow(retryConfig.multiplier, retryAttempts - 1),
            retryConfig.maxBackoffMs
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Update circuit breaker and metrics after all retries are complete
    const responseTime = Date.now() - startTime;
    this.updateCircuitBreakerState(providerName, success);
    this.updateMetrics(providerName, success, responseTime);

    return response!;
  }
}