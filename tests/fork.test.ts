import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/spinner.js', () => ({
  withSpinner: vi.fn(async (_text: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn(), debug: vi.fn(), blank: vi.fn(), line: vi.fn() },
}));

const mockGetUser = vi.fn();
const mockGetRepo = vi.fn();
const mockCreateFork = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    users: { getAuthenticated: mockGetUser },
    repos: { get: mockGetRepo, createFork: mockCreateFork },
  })),
}));

import { hasPushAccess, ensureFork } from '../src/git/fork.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockGetUser.mockResolvedValue({ data: { login: 'forkuser' } });
  mockGetRepo.mockResolvedValue({ data: { fork: true, permissions: { push: true } } });
  mockCreateFork.mockResolvedValue({ data: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hasPushAccess', () => {
  it('returns true when user has push permissions', async () => {
    const result = await hasPushAccess('token', 'owner', 'repo');
    expect(result).toBe(true);
  });

  it('returns false when permissions.push is false', async () => {
    mockGetRepo.mockResolvedValue({ data: { permissions: { push: false } } });
    const result = await hasPushAccess('token', 'owner', 'repo');
    expect(result).toBe(false);
  });

  it('returns false on any API error', async () => {
    mockGetRepo.mockRejectedValue(new Error('not found'));
    const result = await hasPushAccess('token', 'owner', 'repo');
    expect(result).toBe(false);
  });
});

describe('ensureFork', () => {
  it('returns existing fork info without creating', async () => {
    const info = await ensureFork('token', 'upstream', 'repo', false);
    expect(info.alreadyExisted).toBe(true);
    expect(info.forkOwner).toBe('forkuser');
    expect(info.cloneUrl).toContain('https://');
  });

  it('uses SSH clone URL when preferSSH is true', async () => {
    const info = await ensureFork('token', 'upstream', 'repo', true);
    expect(info.cloneUrl).toContain('git@github.com');
  });

  it('creates a fork when it does not exist', async () => {
    // First call (check fork existence) returns 404, second call (polling) returns fork
    let getCallCount = 0;
    mockGetRepo.mockImplementation(async () => {
      getCallCount++;
      if (getCallCount === 1) {
        const err = Object.assign(new Error('Not Found'), { status: 404 });
        throw err;
      }
      return { data: { fork: true } };
    });

    const promise = ensureFork('token', 'upstream', 'repo', false);
    await vi.runAllTimersAsync();
    const info = await promise;
    expect(mockCreateFork).toHaveBeenCalled();
    expect(info.alreadyExisted).toBe(false);
  });

  it('rethrows non-404 errors when checking fork existence', async () => {
    const err = Object.assign(new Error('Server Error'), { status: 500 });
    mockGetRepo.mockRejectedValue(err);
    await expect(ensureFork('token', 'upstream', 'repo', false)).rejects.toThrow('Server Error');
  });

  it('ignores repos.get errors during fork readiness polling', async () => {
    let getCallCount = 0;
    mockGetRepo.mockImplementation(async () => {
      getCallCount++;
      if (getCallCount === 1) {
        const err = Object.assign(new Error('Not Found'), { status: 404 });
        throw err;
      }
      if (getCallCount === 2) {
        // Simulate a transient error during polling (covers the catch block)
        throw new Error('transient network error');
      }
      return { data: { fork: true } }; // succeeds on third call
    });

    const promise = ensureFork('token', 'upstream', 'repo', false);
    const assertion = expect(promise).resolves.toBeDefined();
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('times out waiting for fork if never ready', async () => {
    let getCallCount = 0;
    mockGetRepo.mockImplementation(async () => {
      getCallCount++;
      if (getCallCount === 1) {
        const err = Object.assign(new Error('Not Found'), { status: 404 });
        throw err;
      }
      // Never return fork: true
      return { data: { fork: false } };
    });

    const promise = ensureFork('token', 'upstream', 'repo', false);
    // Attach rejection handler before advancing timers to prevent unhandled rejection warning
    const assertion = expect(promise).rejects.toThrow('Timed out');
    await vi.runAllTimersAsync();
    await assertion;
  });
});
