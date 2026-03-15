import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Token store tests use an in-memory mock so we don't touch the real filesystem
vi.mock('conf', () => {
  const store = new Map<string, string>();
  return {
    default: class MockConf {
      path = '/mock/config.json';
      get(key: string) { return store.get(key) ?? ''; }
      set(key: string, value: string) { store.set(key, value); }
      delete(key: string) { store.delete(key); }
    },
  };
});

describe('tokenStore', () => {
  let tokenStore: typeof import('../src/auth/tokenStore.js').tokenStore;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../src/auth/tokenStore.js');
    tokenStore = mod.tokenStore;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns undefined when no token is stored', () => {
    expect(tokenStore.get()).toBeUndefined();
  });

  it('stores and retrieves a token', () => {
    tokenStore.set('ghp_testtoken', 'octocat');
    expect(tokenStore.get()).toBe('ghp_testtoken');
    expect(tokenStore.getLogin()).toBe('octocat');
  });

  it('clears the stored token on logout', () => {
    tokenStore.set('ghp_testtoken', 'octocat');
    tokenStore.clear();
    expect(tokenStore.get()).toBeUndefined();
    expect(tokenStore.getLogin()).toBeUndefined();
  });

  it('exposes a config file path', () => {
    expect(typeof tokenStore.configPath()).toBe('string');
  });
});
