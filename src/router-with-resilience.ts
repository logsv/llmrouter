import { LLMRouter } from './core/router';
import { makeResiliencePolicy } from './policies';
import type { RouterConfig } from './types/config';

export class ResilientRouter extends LLMRouter {
  private policy = makeResiliencePolicy(this['config'].resilience);

  static async create(handlers: any, cfgFactory: () => RouterConfig) {
    const inst = await super.create(handlers, cfgFactory);
    (inst as ResilientRouter).policy = makeResiliencePolicy(cfgFactory().resilience);
    return inst as ResilientRouter;
  }

  protected async callProvider(req, provider) {
    return this.policy.execute(() => super['callProvider'](req, provider));
  }
}