import type { LLMProvider } from '../providers/llmProviders';
import { createProvider } from '../providers/llmProviders';
import Bottleneck from 'bottleneck';
import { selectRoundRobin, selectByCostPriority } from './strategies';
import { loadConfig } from '../config/loadConfig';
import { DEFAULT_CIRCUIT_BREAKER, DEFAULT_RETRY, type RouterConfig, type LoadedProviderConfig, type LLMProviderConfig, type CircuitBreakerConfig, type RetryConfig } from '../types/config';

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

export class LLMRouter {
  private providers: Map<string, { provider: LLMProvider; config: LoadedProviderConfig; limiter: Bottleneck; lastUsed: number; failureCount: number; successCount: number; }>;
  private circuitBreakers: Map<string, IPolicy>;
  private strategy: 'round_robin' | 'cost_priority_round_robin';
  private config: RouterConfig;
  private defaultModel: string;
  private handlersMap?: ProviderHandlers;

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

  private constructor(config: RouterConfig, handlers?: ProviderHandlers) {
    this.providers = new Map();
    this.circuitBreakers = new Map();
    this.strategy = config.loadBalancingStrategy || 'round_robin';
    this.defaultModel = config.defaultModel || '';
    this.config = config;
    this.handlersMap = handlers;
  }

  private async initializeProviders(config: RouterConfig) {
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
  private getProvidersForModel(model: string): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, wrapper]) => 
        wrapper.config.enabled &&
        wrapper.config.models.some(m => m.name === model)
      )
      .map(([name]) => name);
  }

  /**
   * Select the most appropriate provider based on the current strategy
   */
  private selectProvider(providers: string[]): string | null {
    if (providers.length === 0) return null;
    
    // Get all available and enabled providers that match the filter
    const availableProviders = Array.from(this.providers.entries())
      .filter(([name, wrapper]) => 
        providers.includes(name) && 
        wrapper.config.enabled
      );
      
    if (availableProviders.length === 0) return null;

    // Get current timestamp for health calculations
    const now = Date.now();
    const oneMinute = 60000;
    
    const healthyProviders = availableProviders;
    
    // Use healthy providers if available, otherwise fall back to all available
    const candidates = healthyProviders.length > 0 ? healthyProviders : availableProviders;
    
    // Apply load balancing strategy
    if (this.strategy === 'cost_priority_round_robin') {
      return selectByCostPriority(candidates);
    }
    
    // Default to round-robin selection
    return selectRoundRobin(candidates);
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
    let providerName = this.selectProvider(
      preferredProviders.filter(p => availableProviders.includes(p))
    );
    
    // If no preferred providers are available, try any available provider
    if (!providerName) {
      providerName = this.selectProvider(availableProviders);
    }
    
    if (!providerName) {
      throw new Error('No available LLM providers');
    }

    const providerWrapper = this.providers.get(providerName);
    if (!providerWrapper) {
        throw new Error(`Provider ${providerName} not found`);
    }

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
