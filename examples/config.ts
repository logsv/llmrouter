import { RouterConfig } from '../src';
import { providerHandlers } from './handlers';

export function makeRouterConfig(): RouterConfig {
  return {
    loadBalancingStrategy: 'round_robin',
    providers: Object.entries(providerHandlers).map(([name, handler]) => ({
      name,
      type: 'custom',
      models: [{
        name: name === 'provider-1' ? 'gpt-3.5-turbo' : 'llama2',
        costPer1kInputTokens: 0,
        costPer1kOutputTokens: 0,
        maxTokens: 4096,
      }],
      handler,
    })),
  };
}