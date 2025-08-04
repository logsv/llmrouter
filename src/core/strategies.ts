
type ProviderWrapper = {
  provider: any;
  config: any;
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
};

export function selectRoundRobin(providers: [string, ProviderWrapper][]): string {
  return providers.reduce((a, b) => 
    (a[1].lastUsed || 0) < (b[1].lastUsed || 0) ? a : b
  )[0];
}

export function selectByCostPriority(providers: [string, ProviderWrapper][]): string {
  // Sort providers by cost (cheapest first) and return the cheapest one
  const sortedProviders = providers
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
    .sort((a, b) => a.cost - b.cost);
  
  // Return the cheapest provider
  return sortedProviders[0]?.name || providers[0][0];
}
