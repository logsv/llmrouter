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