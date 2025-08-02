
# LLM Router

[![CI](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/actions/workflows/ci.yml)

A simple, lightweight, and dependency-free LLM router that allows you to define a set of LLM providers and route requests to them based on a defined strategy.

## Installation

```bash
npm install llm-router
```

## Usage

```typescript
import { LLMRouter } from 'llm-router';

const config = {
  loadBalancingStrategy: 'round_robin',
  providers: [
    {
      name: 'provider-1',
      type: 'openai',
      models: [{ name: 'gpt-3.5-turbo', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
    },
    {
      name: 'provider-2',
      type: 'ollama',
      models: [{ name: 'llama2', costPer1kInputTokens: 0, costPer1kOutputTokens: 0, maxTokens: 4096 }],
    },
  ],
};

const router = await LLMRouter.create(undefined, async () => config);

const response = await router.execute({ prompt: 'Hello, world!', model: 'gpt-3.5-turbo' });

console.log(response.provider); // provider-1
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)
