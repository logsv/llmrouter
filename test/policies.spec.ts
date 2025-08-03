import { makeResiliencePolicy } from '../src/policies';
import { Policy, CircuitBrokenError } from 'cockatiel';

describe('Resilience Policies', () => {
  it('should return a no-op policy when no config is provided', async () => {
    const policy = makeResiliencePolicy();
    expect(policy).toBe(Policy.noop);
  });

  it('should retry the specified number of times', async () => {
    const policy = makeResiliencePolicy({ retry: { enabled: true, attempts: 2, initialBackoffMs: 1, maxBackoffMs: 1, multiplier: 1 } });
    const fn = jest.fn().mockRejectedValue(new Error('error'));
    await expect(policy.execute(fn)).rejects.toThrow('error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should open the circuit breaker after the specified number of failures', async () => {
    const policy = makeResiliencePolicy({ circuitBreaker: { enabled: true, threshold: 2, samplingDurationMs: 10000, resetTimeoutMs: 10000 } });
    const fn = jest.fn().mockRejectedValue(new Error('error'));

    await expect(policy.execute(fn)).rejects.toThrow('error');
    await expect(policy.execute(fn)).rejects.toThrow('error');

    await expect(policy.execute(fn)).rejects.toThrow(CircuitBrokenError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});