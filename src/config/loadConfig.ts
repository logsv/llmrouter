
import fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';
import { RouterConfig } from './types/config';
import { z } from 'zod';

const modelConfigSchema = z.object({
  name: z.string(),
  costPer1kInputTokens: z.number(),
  costPer1kOutputTokens: z.number(),
  maxTokens: z.number(),
  rateLimit: z.object({
    maxConcurrent: z.number().optional(),
    minTimeMs: z.number().optional(),
    tokensPerSecond: z.number().optional(),
  }).optional(),
});

const circuitBreakerConfigSchema = z.object({
  failureThreshold: z.number(),
  successThreshold: z.number(),
  timeout: z.number(),
});

const retryConfigSchema = z.object({
  maxAttempts: z.number(),
  initialDelay: z.number(),
  maxDelay: z.number(),
  factor: z.number(),
});

const llmProviderConfigSchema = z.object({
  name: z.string(),
  type: z.enum(['openai', 'anthropic', 'google', 'ollama']),
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  models: z.array(modelConfigSchema),
  circuitBreaker: circuitBreakerConfigSchema.partial().optional(),
  retry: retryConfigSchema.partial().optional(),
  rateLimit: z.object({
    maxConcurrent: z.number().optional(),
    minTimeMs: z.number().optional(),
    tokensPerSecond: z.number().optional(),
  }).optional(),
});

const routerConfigSchema = z.object({
  loadBalancingStrategy: z.enum(['round_robin', 'cost_priority_round_robin']).optional(),
  defaultModel: z.string().optional(),
  providers: z.array(llmProviderConfigSchema),
});

export async function loadConfig(configPath?: string): Promise<RouterConfig> {
  const fullPath = configPath 
    ? path.resolve(configPath) 
    : path.resolve(process.cwd(), 'llm-router.yaml');

  try {
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    const config = yaml.load(fileContent);
    return routerConfigSchema.parse(config);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Configuration file not found at ${fullPath}`);
    }
    throw new Error(`Error loading or parsing configuration file: ${error.message}`);
  }
}
