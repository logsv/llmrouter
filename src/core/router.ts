import type { LLMProvider } from '../providers/llmProviders';
import { createProvider } from '../providers/llmProviders';
import Bottleneck from 'bottleneck';
import { selectRoundRobin, selectByCostPriority } from './strategies';
import { loadConfig } from '../config/loadConfig';
import { DEFAULT_CIRCUIT_BREAKER, DEFAULT_RETRY, type RouterConfig, type LoadedProviderConfig, type LLMProviderConfig, type CircuitBreakerConfig, type RetryConfig } from '../types/config';
import { IPolicy } from 'cockatiel';

// Define LLM request and response interfaces
export interface LLMRequest {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  [key: string]: unknown;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

export type ProviderHandlers = Record<string, (req: LLMRequest) => Promise<LLMResponse>>;

export type HandlerFn = (req: LLMRequest) => Promise<LLMResponse>;

interface ProviderWrapper {
  provider: LLMProvider;
  config: LoadedProviderConfig;
  limiter: any;
  lastUsed: number;
  failureCount: number;
  successCount: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  circuitBreakerOpenedAt?: number;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rateLimitedRequests: number;
    circuitBreakerTrips: number;
    lastRequestTime: number;
    averageResponseTime: number;
  };
}

export class LLMRouter {
  protected providers: Map<string, ProviderWrapper>;
  protected circuitBreakers: Map<string, IPolicy>;
  protected strategy: 'round_robin' | 'cost_priority_round_robin';
  protected config: RouterConfig;
  protected defaultModel: string;
  protected handlersMap?: ProviderHandlers;

  /**
   * Create a new LLM router instance
   * @param config Optional configuration to use. If not provided, will load from default location
   */
  static async create(handlers?: ProviderHandlers, configPath?: string | (() => RouterConfig), loadConfigFn = loadConfig): Promise<LLMRouter> {
    const config = typeof configPath === 'function' ? configPath() : await loadConfigFn(configPath);
    const router = new LLMRouter(config, handlers);
    await router.initializeProviders(config);
    return router;
  }

  protected constructor(config: RouterConfig, handlers?: ProviderHandlers) {
    this.providers = new Map();
    this.circuitBreakers = new Map();
    this.strategy = config.loadBalancingStrategy || 'round_robin';
    this.defaultModel = config.defaultModel || '';
    this.config = config;
    this.handlersMap = handlers;
  }

  protected async initializeProviders(config: RouterConfig) {
    if (!config.providers || config.providers.length === 0) {
      throw new Error('No LLM providers configured');
    }

    // Initialize each provider
    for (const providerConfig of config.providers) {
      if (providerConfig.enabled === false) continue;

      // Ensure required fields are present
      if (!providerConfig.name || !providerConfig.type) {
        console.warn(`Skipping provider with missing name or type`);
        continue;
      }

      // Create rate limiter
      const limiter = new Bottleneck({
        maxConcurrent: providerConfig.rateLimit?.maxConcurrent || 10,
        minTime: providerConfig.rateLimit?.minTimeMs ? 
          1000 / (providerConfig.rateLimit.tokensPerSecond || 1) : 100,
      });

      

      try {
        // Create provider instance with required fields
        const provider = createProvider({
          name: providerConfig.name,
          type: providerConfig.type,
          apiKey: providerConfig.apiKey || '',
          baseUrl: providerConfig.baseUrl || '',
        });

        // Store provider with its configuration


        // Store provider with its configuration
        const loadedProviderConfig: LoadedProviderConfig = {
          name: providerConfig.name!,
          type: providerConfig.type!,
          enabled: providerConfig.enabled ?? true,
          priority: providerConfig.priority ?? 1,
          apiKey: providerConfig.apiKey || '',
          baseUrl: providerConfig.baseUrl || '',
          models: providerConfig.models ?? [],
          
        };
        // Copy any other properties from providerConfig that are not explicitly handled
        Object.keys(providerConfig).forEach(key => {
            if (!(key in loadedProviderConfig)) {
                (loadedProviderConfig as any)[key] = (providerConfig as any)[key];
            }
        });

        this.providers.set(providerConfig.name, {
          provider,
          config: loadedProviderConfig,
          limiter,
          lastUsed: 0,
          failureCount: 0,
          successCount: 0,
          circuitBreakerState: 'closed',
          circuitBreakerOpenedAt: undefined,
          metrics: {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rateLimitedRequests: 0,
            circuitBreakerTrips: 0,
            lastRequestTime: 0,
            averageResponseTime: 0,
          },
        });
        
        console.log(`Initialized provider: ${providerConfig.name} (${providerConfig.type})`);
      } catch (error) {
        console.error(`Failed to initialize provider ${providerConfig.name}:`, error);
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No LLM providers could be initialized');
    }
  }

  /**
   * Check if provider's circuit breaker is open
   */
  protected isCircuitBreakerOpen(providerName: string): boolean {
    const wrapper = this.providers.get(providerName);
    if (!wrapper) return true;

    const resilience = this.config.resilience?.circuitBreaker;
    if (!resilience?.enabled) return false;

    if (wrapper.circuitBreakerState === 'open') {
      // Check if circuit breaker should transition to half-open
      const timeSinceOpened = Date.now() - (wrapper.circuitBreakerOpenedAt || 0);
      if (timeSinceOpened >= resilience.resetTimeoutMs) {
        wrapper.circuitBreakerState = 'half-open';
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Update circuit breaker state based on success/failure
   */
  protected updateCircuitBreakerState(providerName: string, success: boolean): void {
    const wrapper = this.providers.get(providerName);
    if (!wrapper) return;

    const resilience = this.config.resilience?.circuitBreaker;
    if (!resilience?.enabled) return;

    if (success) {
      if (wrapper.circuitBreakerState === 'half-open') {
        wrapper.circuitBreakerState = 'closed';
      }
      wrapper.successCount++;
    } else {
      wrapper.failureCount++;
      
      // Check if we should open the circuit breaker
      const recentFailures = wrapper.failureCount;
      if (recentFailures >= resilience.threshold && wrapper.circuitBreakerState === 'closed') {
        wrapper.circuitBreakerState = 'open';
        wrapper.circuitBreakerOpenedAt = Date.now();
        wrapper.metrics.circuitBreakerTrips++;
      }
    }
  }

  /**
   * Check if provider has available rate limit capacity
   */
  protected async checkRateLimit(providerName: string): Promise<boolean> {
    const wrapper = this.providers.get(providerName);
    if (!wrapper) return false;

    // Check if rate limiting is configured
    if (!wrapper.config.rateLimit?.tokensPerSecond) return true;

    try {
      // Use bottleneck's check method to see if we can schedule immediately
      const currentCapacity = wrapper.limiter.counts();
      return currentCapacity.RECEIVED < (wrapper.config.rateLimit.maxConcurrent || 10);
    } catch (error) {
      // If we can't check, assume rate limit is hit
      return false;
    }
  }

  /**
   * Update provider metrics
   */
  protected updateMetrics(providerName: string, success: boolean, responseTime: number, rateLimited: boolean = false): void {
    const wrapper = this.providers.get(providerName);
    if (!wrapper) return;

    wrapper.metrics.totalRequests++;
    wrapper.metrics.lastRequestTime = Date.now();
    wrapper.lastUsed = Date.now();

    if (rateLimited) {
      wrapper.metrics.rateLimitedRequests++;
    } else if (success) {
      wrapper.metrics.successfulRequests++;
    } else {
      wrapper.metrics.failedRequests++;
    }

    // Update running average response time
    const totalSuccessful = wrapper.metrics.successfulRequests;
    if (totalSuccessful > 0) {
      wrapper.metrics.averageResponseTime = 
        ((wrapper.metrics.averageResponseTime * (totalSuccessful - 1)) + responseTime) / totalSuccessful;
    }
  }

  private getProviderWeights(): Array<{ name: string; weight: number }> {
    const weights: Array<{ name: string; weight: number }> = [];
    
    for (const [name, provider] of this.providers.entries()) {
      if (!provider.config.enabled) continue;
      
      if (this.strategy === 'round_robin') {
        weights.push({ name, weight: 1 });
      } else {
        // cost_priority_round_robin strategy
        const model = provider.config.models[0];
        if (!model) continue;
        
        const cost = model.costPer1kInputTokens * 0.5 + model.costPer1kOutputTokens * 0.5;
        const weight = 1 / (cost * provider.config.priority);
        weights.push({ name, weight });
      }
    }
    
    return weights;
  }

  

  /**
   * Get a list of provider names that support the specified model
   */
  protected getProvidersForModel(model: string): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, wrapper]) => 
        wrapper.config.enabled &&
        wrapper.config.models.some(m => m.name === model)
      )
      .map(([name]) => name);
  }

  /**
   * Select the most appropriate provider based on the current strategy
   * Implements the correct flow: Load balancer → Rate limit check → Circuit breaker check
   */
  protected async selectProvider(providers: string[]): Promise<string | null> {
    if (providers.length === 0) return null;
    
    // Get all available and enabled providers that match the filter
    const availableProviders = Array.from(this.providers.entries())
      .filter(([name, wrapper]) => 
        providers.includes(name) && 
        wrapper.config.enabled
      );
      
    if (availableProviders.length === 0) return null;

    // Apply load balancing strategy to get ordered list of candidates
    let orderedCandidates: string[];
    if (this.strategy === 'cost_priority_round_robin') {
      orderedCandidates = this.getCostPriorityOrderedProviders(availableProviders);
    } else {
      orderedCandidates = this.getRoundRobinOrderedProviders(availableProviders);
    }

    // Try each provider in order until we find one that passes all checks
    for (const providerName of orderedCandidates) {
      // Check circuit breaker state first
      if (this.isCircuitBreakerOpen(providerName)) {
        continue; // Skip this provider, circuit breaker is open
      }

      // Check rate limiting
      const hasRateCapacity = await this.checkRateLimit(providerName);
      if (!hasRateCapacity) {
        // Record rate limit hit in metrics
        this.updateMetrics(providerName, false, 0, true);
        continue; // Skip this provider, rate limited
      }

      // This provider passes all checks
      return providerName;
    }

    // No provider available - all are either circuit broken or rate limited
    return null;
  }

  /**
   * Get providers ordered by cost priority
   */
  private getCostPriorityOrderedProviders(providers: [string, ProviderWrapper][]): string[] {
    return providers
      .map(([name, wrapper]) => {
        const model = wrapper.config.models[0];
        if (!model) {
          return { name, cost: Infinity };
        }
        
        // Calculate average cost per 1k tokens (assuming 50/50 input/output ratio)
        const avgCost = (model.costPer1kInputTokens + model.costPer1kOutputTokens) / 2;
        // Factor in priority (lower priority number = higher priority)
        const priorityWeight = 1 / (wrapper.config.priority || 1);
        const finalScore = avgCost / priorityWeight;
        
        return { name, cost: finalScore };
      })
      .sort((a, b) => a.cost - b.cost)
      .map(item => item.name);
  }

  /**
   * Get providers ordered by round robin (least recently used first)
   */
  private getRoundRobinOrderedProviders(providers: [string, ProviderWrapper][]): string[] {
    return providers
      .sort(([, a], [, b]) => (a.lastUsed || 0) - (b.lastUsed || 0))
      .map(([name]) => name);
  }
  
  

  public async execute(request: LLMRequest, preferredProviders: string[] = []): Promise<LLMResponse> {
    // Ensure we have a model specified
    const model = request.model || this.defaultModel;
    if (!model) {
      throw new Error('No model specified in request and no default model configured');
    }

    // Get providers that support the requested model
    const availableProviders = this.getProvidersForModel(model);
    if (availableProviders.length === 0) {
      throw new Error(`No providers available for model: ${model}`);
    }

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

    const providerWrapper = this.providers.get(providerName);
    if (!providerWrapper) {
        throw new Error(`Provider ${providerName} not found`);
    }

    // Execute the request through the rate limiter
    return await this.executeWithRateLimit(providerName, request);
  }

  /**
   * Execute request through provider's rate limiter with proper metrics tracking
   */
  protected async executeWithRateLimit(providerName: string, request: LLMRequest): Promise<LLMResponse> {
    const providerWrapper = this.providers.get(providerName);
    if (!providerWrapper) {
      throw new Error(`Provider ${providerName} not found`);
    }

    const startTime = Date.now();
    let success = false;
    let response: LLMResponse;

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
      this.updateCircuitBreakerState(providerName, true);
      
    } catch (error) {
      success = false;
      this.updateCircuitBreakerState(providerName, false);
      throw error;
    } finally {
      // Update metrics regardless of success/failure
      const responseTime = Date.now() - startTime;
      this.updateMetrics(providerName, success, responseTime);
    }

    return response;
  }

  
}

// Example usage:
/*
const router = new LLMRouter([
  {
    name: 'openai',
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    models: [{
      name: 'gpt-4',
      costPer1kInputTokens: 0.03,
      costPer1kOutputTokens: 0.06,
      maxTokens: 8192,
      rateLimit: {
        tokensPerMinute: 40000,
        requestsPerMinute: 200,
      },
    }],
    priority: 1,
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000,
    },
    retry: {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2,
    },
    enabled: true,
  },
  // Add other providers...
], 'cost_priority_round_robin');

// Make a request
const response = await router.routeRequest({
  prompt: 'Hello, world!',
  model: 'gpt-4',
  maxTokens: 100,
  temperature: 0.7,
});
*/

export default LLMRouter;
