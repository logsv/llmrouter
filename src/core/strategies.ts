
import { ProviderWrapper } from './router.js';

export function selectRoundRobin(providers: [string, ProviderWrapper][]): string {
  return providers.reduce((a, b) => 
    (a[1].lastUsed || 0) < (b[1].lastUsed || 0) ? a : b
  )[0];
}

export function selectByCostPriority(providers: [string, ProviderWrapper][]): string {
  const weightedProviders = providers.map(([name, wrapper]) => {
    const model = wrapper.config.models[0];
    const costWeight = 1 / (model?.costPer1kInputTokens || 0.01);
    const priorityWeight = wrapper.config.priority || 1;
    const weight = costWeight * priorityWeight;
    
    const timeSinceLastUse = Date.now() - (wrapper.lastUsed || 0);
    const timeWeight = Math.min(timeSinceLastUse / 60000, 10);
    
    return {
      name,
      weight: weight * timeWeight,
      lastUsed: wrapper.lastUsed || 0,
    };
  });
  
  const totalWeight = weightedProviders.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const provider of weightedProviders) {
    if (random < provider.weight) {
      return provider.name;
    }
    random -= provider.weight;
  }
  
  return weightedProviders.reduce((a, b) => 
    a.lastUsed < b.lastUsed ? a : b
  ).name;
}
