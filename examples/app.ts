import { LLMRouter } from '../src/index';

async function main() {
  // Create a new router instance.
  // The router will automatically load the configuration from the `llm-router.yaml` file.
  const router = await LLMRouter.create();

  // Execute a request.
  const res = await router.execute({
    prompt: 'Tell me a joke about llamas',
    model: 'gpt-3.5-turbo',
  });

  // Print the response.
  console.log(`Used provider: ${res.provider}`);
  console.log(`Answer: ${res.text}`);
}

main();