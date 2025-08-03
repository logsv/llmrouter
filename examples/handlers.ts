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