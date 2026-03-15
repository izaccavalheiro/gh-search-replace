import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
  fail: vi.fn().mockReturnThis(),
};

vi.mock('ora', () => ({ default: vi.fn(() => mockSpinner) }));
vi.mock('open', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), blank: vi.fn(), success: vi.fn(), error: vi.fn(), debug: vi.fn(), line: vi.fn() },
}));

import { startDeviceFlow } from '../src/auth/deviceFlow.js';

const deviceCodeResponse = {
  device_code: 'dev_code',
  user_code: 'USER-CODE',
  verification_uri: 'https://github.com/activate',
  expires_in: 900,
  interval: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Make sleep() resolve immediately by firing setTimeout callbacks as microtasks
  vi.stubGlobal('setTimeout', (fn: () => void) => {
    queueMicrotask(fn);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(tokenResponses: object[]) {
  let tokenCallCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if ((url as string).includes('device/code')) {
      return { ok: true, json: async () => deviceCodeResponse };
    }
    const resp = tokenResponses[tokenCallCount] ?? tokenResponses[tokenResponses.length - 1];
    tokenCallCount++;
    return { ok: true, json: async () => resp };
  }));
}

describe('startDeviceFlow', () => {
  it('returns access token on success', async () => {
    mockFetch([{ access_token: 'ghp_flow_token' }]);
    const token = await startDeviceFlow('client123');
    expect(token).toBe('ghp_flow_token');
  });

  it('retries on authorization_pending then succeeds', async () => {
    mockFetch([
      { error: 'authorization_pending' },
      { access_token: 'ghp_after_pending' },
    ]);
    const token = await startDeviceFlow('client123');
    expect(token).toBe('ghp_after_pending');
  });

  it('retries on slow_down with interval then succeeds', async () => {
    mockFetch([
      { error: 'slow_down', interval: 1 },
      { access_token: 'ghp_after_slow' },
    ]);
    const token = await startDeviceFlow('client123');
    expect(token).toBe('ghp_after_slow');
  });

  it('retries on slow_down without interval then succeeds', async () => {
    mockFetch([
      { error: 'slow_down' },
      { access_token: 'ghp_after_slow_no_interval' },
    ]);
    const token = await startDeviceFlow('client123');
    expect(token).toBe('ghp_after_slow_no_interval');
  });

  it('throws on expired_token', async () => {
    mockFetch([{ error: 'expired_token' }]);
    await expect(startDeviceFlow('client123')).rejects.toThrow('expired');
  });

  it('throws on generic OAuth error with description', async () => {
    mockFetch([{ error: 'access_denied', error_description: 'User denied access' }]);
    await expect(startDeviceFlow('client123')).rejects.toThrow('User denied access');
  });

  it('throws on OAuth error without description', async () => {
    mockFetch([{ error: 'access_denied' }]);
    await expect(startDeviceFlow('client123')).rejects.toThrow('access_denied');
  });

  it('throws when device code request fails (non-400)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'server error',
    })));
    await expect(startDeviceFlow('client123')).rejects.toThrow('500');
  });

  it('throws with helpful message on HTTP 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Device Flow not enabled',
    })));
    await expect(startDeviceFlow('client123')).rejects.toThrow('Device Flow');
  });

  it('warns when open throws and continues polling', async () => {
    const { default: open } = await import('open');
    vi.mocked(open).mockRejectedValueOnce(new Error('no browser'));
    mockFetch([{ access_token: 'ghp_no_browser' }]);
    const token = await startDeviceFlow('client123');
    expect(token).toBe('ghp_no_browser');
  });

  it('uses default interval of 5 when device code response omits interval', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if ((url as string).includes('device/code')) {
        // No interval field → should default to 5 (still clamped to POLL_INTERVAL_MS)
        return { ok: true, json: async () => ({ ...deviceCodeResponse, interval: undefined }) };
      }
      return { ok: true, json: async () => ({ access_token: 'ghp_default_interval' }) };
    }));
    const token = await startDeviceFlow('client123');
    expect(token).toBe('ghp_default_interval');
  });

  it('times out after max retries', async () => {
    mockFetch([{ error: 'authorization_pending' }]);
    await expect(startDeviceFlow('client123')).rejects.toThrow(/timed out/i);
  });
});
