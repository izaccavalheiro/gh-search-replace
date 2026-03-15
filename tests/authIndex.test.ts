import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    users: {
      getAuthenticated: vi.fn().mockResolvedValue({ data: { login: 'testuser' } }),
    },
  })),
}));

vi.mock('../src/auth/deviceFlow.js', () => ({
  startDeviceFlow: vi.fn().mockResolvedValue('ghp_device_token'),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    line: vi.fn(),
    blank: vi.fn(),
  },
}));

import { resolveToken, fetchLogin, loginCommand, logoutCommand } from '../src/auth/index.js';
import { tokenStore } from '../src/auth/tokenStore.js';

beforeEach(() => {
  tokenStore.clear();
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_CLIENT_ID;
});

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_CLIENT_ID;
});

describe('resolveToken', () => {
  it('returns explicit token from opts.token', async () => {
    const token = await resolveToken({ token: 'ghp_explicit' });
    expect(token).toBe('ghp_explicit');
  });

  it('returns token from GITHUB_TOKEN env var', async () => {
    process.env.GITHUB_TOKEN = 'ghp_env';
    const token = await resolveToken({});
    expect(token).toBe('ghp_env');
  });

  it('returns stored token when available', async () => {
    tokenStore.set('ghp_stored', 'octocat');
    const token = await resolveToken({});
    expect(token).toBe('ghp_stored');
  });

  it('skips stored token when force=true and triggers device flow', async () => {
    tokenStore.set('ghp_stored', 'octocat');
    process.env.GITHUB_CLIENT_ID = 'test_client_id';
    const token = await resolveToken({ force: true });
    expect(token).toBe('ghp_device_token');
  });

  it('throws when no token and GITHUB_CLIENT_ID is not set', async () => {
    await expect(resolveToken({})).rejects.toThrow('GITHUB_CLIENT_ID');
  });

  it('triggers device flow when no stored token and client ID is set', async () => {
    process.env.GITHUB_CLIENT_ID = 'test_client_id';
    const token = await resolveToken({});
    expect(token).toBe('ghp_device_token');
  });
});

describe('fetchLogin', () => {
  it('returns the authenticated user login', async () => {
    const login = await fetchLogin('ghp_any');
    expect(login).toBe('testuser');
  });
});

describe('loginCommand', () => {
  it('stores token and logs success', async () => {
    await loginCommand({ token: 'ghp_explicit' });
    expect(tokenStore.get()).toBe('ghp_explicit');
  });
});

describe('logoutCommand', () => {
  it('clears token and logs success when logged in', () => {
    tokenStore.set('ghp_any', 'octocat');
    logoutCommand();
    expect(tokenStore.get()).toBeUndefined();
  });

  it('logs info when no session exists', () => {
    logoutCommand();
    expect(tokenStore.get()).toBeUndefined();
  });
});
