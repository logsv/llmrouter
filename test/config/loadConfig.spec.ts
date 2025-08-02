import mock from 'mock-fs';
import { loadConfig } from '../../src/config/loadConfig';

describe('loadConfig', () => {
  afterEach(() => {
    mock.restore();
  });

  it('should load and parse a valid YAML config file', async () => {
    const mockConfig = `
loadBalancingStrategy: round_robin
defaultModel: gpt-3.5-turbo
providers:
  - name: openai-test
    type: openai
    enabled: true
    priority: 1
    apiKey: test-key
    baseUrl: https://api.openai.com/v1
    models:
      - name: gpt-3.5-turbo
        costPer1kInputTokens: 0.0015
        costPer1kOutputTokens: 0.002
        maxTokens: 4096
`;
    mock({
      'llm-router.yaml': mockConfig,
    });

    const config = await loadConfig();

    expect(config).toBeDefined();
    expect(config.loadBalancingStrategy).toBe('round_robin');
    expect(config.defaultModel).toBe('gpt-3.5-turbo');
    expect(config.providers).toHaveLength(1);
    expect(config.providers[0].name).toBe('openai-test');
  });

  it('should throw an error for a non-existent config file', async () => {
    mock({});

    await expect(loadConfig()).rejects.toThrow('Configuration file not found');
  });

  it('should throw an error for an invalid config file', async () => {
    const mockConfig = `
loadBalancingStrategy: invalid_strategy
`;
    mock({
      'llm-router.yaml': mockConfig,
    });

    await expect(loadConfig()).rejects.toThrow(
      'Error loading or parsing configuration file'
    );
  });
});