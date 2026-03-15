import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGit = {
  branch: vi.fn(),
  checkoutLocalBranch: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  getRemotes: vi.fn(),
  remote: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit),
}));

vi.mock('../src/utils/spinner.js', () => ({
  withSpinner: vi.fn(async (_text: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { success: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), blank: vi.fn(), line: vi.fn() },
}));

vi.mock('../src/utils/slugify.js', () => ({
  generateBranchName: vi.fn(() => 'gh-search-replace/term/20240101-000000'),
}));

import { createAndCheckoutBranch, commitAndPush, getDefaultBranch } from '../src/git/branch.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockGit.branch.mockResolvedValue({ all: [] });
  mockGit.checkoutLocalBranch.mockResolvedValue(undefined);
  mockGit.add.mockResolvedValue(undefined);
  mockGit.commit.mockResolvedValue(undefined);
  mockGit.push.mockResolvedValue(undefined);
  mockGit.getRemotes.mockResolvedValue([{ name: 'origin' }]);
  mockGit.remote.mockResolvedValue('  HEAD branch: main\n');
});

describe('createAndCheckoutBranch', () => {
  it('creates branch with generated name', async () => {
    const name = await createAndCheckoutBranch('/some/path', 'my term');
    expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('gh-search-replace/term/20240101-000000');
    expect(name).toBe('gh-search-replace/term/20240101-000000');
  });

  it('uses branchNameOverride when provided', async () => {
    const name = await createAndCheckoutBranch('/some/path', 'my term', 'custom-branch');
    expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith('custom-branch');
    expect(name).toBe('custom-branch');
  });

  it('appends a suffix when branch already exists remotely', async () => {
    mockGit.branch.mockResolvedValue({ all: ['origin/gh-search-replace/term/20240101-000000'] });
    const name = await createAndCheckoutBranch('/some/path', 'my term');
    expect(name).toMatch(/gh-search-replace\/term\/20240101-000000-[a-z0-9]{4}/);
  });
});

describe('commitAndPush', () => {
  it('stages files, commits, and pushes', async () => {
    await commitAndPush('/some/path', ['src/file.ts'], 'old term', 'my-branch');
    expect(mockGit.add).toHaveBeenCalledWith(['src/file.ts']);
    expect(mockGit.commit).toHaveBeenCalledWith(expect.stringContaining('old term'));
    expect(mockGit.push).toHaveBeenCalledWith('origin', 'my-branch', ['--set-upstream']);
  });
});

describe('getDefaultBranch', () => {
  it('returns branch name from upstream remote when it exists', async () => {
    mockGit.getRemotes.mockResolvedValue([{ name: 'upstream' }, { name: 'origin' }]);
    mockGit.remote.mockResolvedValue('  HEAD branch: develop\n');
    const branch = await getDefaultBranch('/some/path');
    expect(branch).toBe('develop');
  });

  it('falls back to origin when no upstream', async () => {
    const branch = await getDefaultBranch('/some/path');
    expect(branch).toBe('main');
  });

  it('returns "main" when remote show output does not match', async () => {
    mockGit.remote.mockResolvedValue(null);
    const branch = await getDefaultBranch('/some/path');
    expect(branch).toBe('main');
  });
});
