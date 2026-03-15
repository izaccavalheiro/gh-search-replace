import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const mockGitInstance = {
  status: vi.fn(),
  remote: vi.fn(),
  getRemotes: vi.fn(),
  addRemote: vi.fn(),
  fetch: vi.fn(),
  checkout: vi.fn(),
  pull: vi.fn(),
  clone: vi.fn(),
  addConfig: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGitInstance),
}));

vi.mock('../src/utils/spinner.js', () => ({
  withSpinner: vi.fn(async (_text: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), success: vi.fn(), error: vi.fn(), blank: vi.fn(), line: vi.fn() },
}));

import { getLocalPath, hasSSHKey, cloneOrPull } from '../src/git/cloneOrPull.js';

let tmpDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsr-clone-'));
  mockGitInstance.status.mockResolvedValue({ isClean: () => true });
  mockGitInstance.remote.mockResolvedValue('  HEAD branch: main\n');
  mockGitInstance.getRemotes.mockResolvedValue([]);
  mockGitInstance.addRemote.mockResolvedValue(undefined);
  mockGitInstance.fetch.mockResolvedValue(undefined);
  mockGitInstance.checkout.mockResolvedValue(undefined);
  mockGitInstance.pull.mockResolvedValue(undefined);
  mockGitInstance.clone.mockResolvedValue(undefined);
  mockGitInstance.addConfig.mockResolvedValue(undefined);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.GIT_ACCOUNT_NAME;
  delete process.env.GIT_ACCOUNT_EMAIL;
});

describe('getLocalPath', () => {
  it('returns a path under the cache base', () => {
    const p = getLocalPath('owner', 'repo');
    expect(p).toContain('owner');
    expect(p).toContain('repo');
  });
});

describe('hasSSHKey', () => {
  it('returns false when .ssh dir does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
    expect(hasSSHKey()).toBe(false);
    vi.restoreAllMocks();
  });

  it('returns false when .ssh dir exists but no key files are present', () => {
    // First call (sshDir check) → true; subsequent calls (key files) → false
    vi.spyOn(fs, 'existsSync').mockReturnValue(false).mockReturnValueOnce(true);
    expect(hasSSHKey()).toBe(false);
    vi.restoreAllMocks();
  });

  it('returns true when an SSH key exists', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(hasSSHKey()).toBe(true);
    vi.restoreAllMocks();
  });
});

describe('cloneOrPull', () => {
  it('clones when repo does not exist locally', async () => {
    const localPath = await cloneOrPull('owner', 'newrepo', {
      cloneUrl: 'https://github.com/owner/newrepo.git',
      label: 'owner/newrepo',
    });
    expect(mockGitInstance.clone).toHaveBeenCalled();
    expect(typeof localPath).toBe('string');
  });

  it('clones and adds upstream remote when upstreamUrl is provided', async () => {
    await cloneOrPull('owner', 'newrepo2', {
      cloneUrl: 'https://github.com/owner/newrepo2.git',
      upstreamUrl: 'https://github.com/upstream/newrepo2.git',
      label: 'owner/newrepo2 (fork)',
    });
    expect(mockGitInstance.addRemote).toHaveBeenCalledWith('upstream', 'https://github.com/upstream/newrepo2.git');
  });

  it('pulls when repo already exists locally', async () => {
    // Create .git directory to simulate existing repo
    const localPath = getLocalPath('owner', 'existingrepo');
    fs.mkdirSync(path.join(localPath, '.git'), { recursive: true });

    try {
      await cloneOrPull('owner', 'existingrepo', {
        cloneUrl: 'https://github.com/owner/existingrepo.git',
        label: 'owner/existingrepo',
      });
      expect(mockGitInstance.fetch).toHaveBeenCalled();
      expect(mockGitInstance.pull).toHaveBeenCalled();
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  });

  it('updates upstream remote when it already exists', async () => {
    const localPath = getLocalPath('owner', 'existingrepo2');
    fs.mkdirSync(path.join(localPath, '.git'), { recursive: true });
    mockGitInstance.getRemotes.mockResolvedValue([{ name: 'upstream' }]);

    try {
      await cloneOrPull('owner', 'existingrepo2', {
        cloneUrl: 'https://github.com/owner/existingrepo2.git',
        upstreamUrl: 'https://github.com/upstream/existingrepo2.git',
        label: 'owner/existingrepo2',
      });
      expect(mockGitInstance.remote).toHaveBeenCalledWith(
        expect.arrayContaining(['set-url', 'upstream', 'https://github.com/upstream/existingrepo2.git']),
      );
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  });

  it('throws when working tree is dirty', async () => {
    const localPath = getLocalPath('owner', 'dirtyrepo');
    fs.mkdirSync(path.join(localPath, '.git'), { recursive: true });
    mockGitInstance.status.mockResolvedValue({ isClean: () => false });

    try {
      await expect(
        cloneOrPull('owner', 'dirtyrepo', {
          cloneUrl: 'https://github.com/owner/dirtyrepo.git',
          label: 'owner/dirtyrepo',
        }),
      ).rejects.toThrow('dirty');
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  });

  it('applies git identity from env vars', async () => {
    process.env.GIT_ACCOUNT_NAME = 'Bot User';
    process.env.GIT_ACCOUNT_EMAIL = 'bot@example.com';

    await cloneOrPull('owner', 'identityrepo', {
      cloneUrl: 'https://github.com/owner/identityrepo.git',
      label: 'owner/identityrepo',
    });

    expect(mockGitInstance.addConfig).toHaveBeenCalledWith('user.name', 'Bot User', false, 'local');
    expect(mockGitInstance.addConfig).toHaveBeenCalledWith('user.email', 'bot@example.com', false, 'local');
  });

  it('applies only email when only GIT_ACCOUNT_EMAIL is set', async () => {
    process.env.GIT_ACCOUNT_EMAIL = 'bot@example.com';
    await cloneOrPull('owner', 'emailonlyrepo', {
      cloneUrl: 'https://github.com/owner/emailonlyrepo.git',
      label: 'owner/emailonlyrepo',
    });
    expect(mockGitInstance.addConfig).toHaveBeenCalledWith('user.email', 'bot@example.com', false, 'local');
    expect(mockGitInstance.addConfig).not.toHaveBeenCalledWith('user.name', expect.anything(), false, 'local');
  });

  it('adds upstream remote when it does not exist during pull', async () => {
    const localPath = getLocalPath('owner', 'addupstreamrepo');
    fs.mkdirSync(path.join(localPath, '.git'), { recursive: true });
    // No upstream remote exists
    mockGitInstance.getRemotes.mockResolvedValue([{ name: 'origin' }]);

    try {
      await cloneOrPull('owner', 'addupstreamrepo', {
        cloneUrl: 'https://github.com/owner/addupstreamrepo.git',
        upstreamUrl: 'https://github.com/upstream/addupstreamrepo.git',
        label: 'owner/addupstreamrepo',
      });
      expect(mockGitInstance.addRemote).toHaveBeenCalledWith('upstream', 'https://github.com/upstream/addupstreamrepo.git');
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  });

  it('uses "main" as default branch when remote show has no match', async () => {
    const localPath = getLocalPath('owner', 'nomatchio');
    fs.mkdirSync(path.join(localPath, '.git'), { recursive: true });
    mockGitInstance.remote.mockResolvedValue(null);

    try {
      await cloneOrPull('owner', 'nomatchio', {
        cloneUrl: 'https://github.com/owner/nomatchio.git',
        label: 'owner/nomatchio',
      });
      expect(mockGitInstance.checkout).toHaveBeenCalledWith('main');
    } finally {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  });
});
