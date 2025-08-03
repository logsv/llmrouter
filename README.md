
# LLM Router

[![CI](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/actions/workflows/ci.yml)

A simple, lightweight, and dependency-free LLM router that allows you to define a set of LLM providers and route requests to them based on a defined strategy.

## Installation

```bash
npm install llm-router
```

## Usage

For a complete, runnable example, see the files in the `/examples` directory.

**1. Define Your Handlers**

Create a file to define your provider handlers. These are the functions that will contain the logic for interacting with each of your LLM providers.

```typescript
// examples/handlers.ts

import { LLMRequest, LLMResponse } from '../src/core/router';
import OpenAI from 'openai';
import axios from 'axios';

export const providerHandlers: Record<string, (req: LLMRequest) => Promise<LLMResponse>> = {
  'provider-1': async ({ prompt, model, ...options }) => {
    const client = new OpenAI();
    const resp = await client.chat.completions.create({
      model: model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      ...options,
    });
    return { text: resp.choices[0].message.content || '', provider: 'provider-1', model: model || 'gpt-3.5-turbo' };
  },

  'provider-2': async ({ prompt, model }) => {
    const { data } = await axios.post('http://localhost:11434/api/generate', {
      model,
      prompt,
    });
    return { text: data.response, provider: 'provider-2', model: model || 'llama2' };
  },
};
```

**2. Configure the Router**

Create a configuration file that dynamically builds the router's provider list from your handlers.

```typescript
// examples/config.ts

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
```

**3. Create and Use the Router**

Finally, create the router instance and use it to execute requests.

```typescript
// examples/app.ts

import { LLMRouter } from '../src';
import { providerHandlers } from './handlers';
import { makeRouterConfig } from './config';

async function main() {
  const router = await LLMRouter.create(providerHandlers, makeRouterConfig);

  const res = await router.execute({
    prompt: 'Tell me a joke about llamas',
    model: 'gpt-3.5-turbo',
  });

  console.log(`Used provider: ${res.provider}`);
  console.log(`Answer: ${res.text}`);
}

main();
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)
