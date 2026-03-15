import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { simpleGit } from 'simple-git';
import { withSpinner } from '../utils/spinner.js';
import { logger } from '../utils/logger.js';

const CACHE_BASE = path.join(os.homedir(), '.cache', 'gh-search-replace');

export function getLocalPath(owner: string, repo: string): string {
  return path.join(CACHE_BASE, owner, repo);
}

export function hasSSHKey(): boolean {
  const sshDir = path.join(os.homedir(), '.ssh');
  if (!fs.existsSync(sshDir)) return false;
  const keyFiles = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa'];
  return keyFiles.some((k) => fs.existsSync(path.join(sshDir, k)));
}

export interface CloneOrPullOptions {
  /** URL to clone from (the fork's clone URL) */
  cloneUrl: string;
  /** URL of the upstream (original) repo — added as the `upstream` remote */
  upstreamUrl?: string;
  /** Label used for log messages, e.g. "izaccavalheiro/reworm (fork)" */
  label: string;
}

/**
 * Clones a repo (or fetches + pulls if already present).
 * The cache key is always based on owner/repo so the same local directory is
 * reused regardless of which remote was used to clone.
 */
export async function cloneOrPull(
  owner: string,
  repo: string,
  opts: CloneOrPullOptions,
): Promise<string> {
  const localPath = getLocalPath(owner, repo);

  if (fs.existsSync(path.join(localPath, '.git'))) {
    await withSpinner(
      `Updating ${opts.label}…`,
      async () => {
        const git = simpleGit(localPath);
        const status = await git.status();

        if (!status.isClean()) {
          throw new Error(
            `Working tree is dirty in ${localPath}. Stash or commit changes before proceeding.`,
          );
        }

        // Ensure origin points to the fork (may have changed if re-forked)
        await git.remote(['set-url', 'origin', opts.cloneUrl]);

        // Ensure upstream remote exists
        if (opts.upstreamUrl) {
          const remotes = await git.getRemotes();
          if (remotes.some((r) => r.name === 'upstream')) {
            await git.remote(['set-url', 'upstream', opts.upstreamUrl]);
          } else {
            await git.addRemote('upstream', opts.upstreamUrl);
          }
        }

        await git.fetch('origin');
        const defaultBranch = await getDefaultBranch(git);
        await git.checkout(defaultBranch);
        await git.pull('origin', defaultBranch);
      },
      `Updated ${opts.label}`,
    );
  } else {
    await withSpinner(
      `Cloning ${opts.label}…`,
      async () => {
        fs.mkdirSync(localPath, { recursive: true });
        await simpleGit().clone(opts.cloneUrl, localPath);

        // Add upstream remote pointing to the original repo
        if (opts.upstreamUrl) {
          const git = simpleGit(localPath);
          await git.addRemote('upstream', opts.upstreamUrl);
        }
      },
      `Cloned ${opts.label}`,
    );
  }

  await applyLocalGitIdentity(localPath);

  logger.info(`Local path: ${localPath}`);
  return localPath;
}

/**
 * Sets user.name and user.email in the repo's local git config using
 * GIT_ACCOUNT_NAME and GIT_ACCOUNT_EMAIL env vars.
 * Local config takes precedence over global and does not affect other repos.
 */
async function applyLocalGitIdentity(localPath: string): Promise<void> {
  const name = process.env.GIT_ACCOUNT_NAME;
  const email = process.env.GIT_ACCOUNT_EMAIL;

  if (!name && !email) return;

  const git = simpleGit(localPath);

  if (name) {
    await git.addConfig('user.name', name, false, 'local');
    logger.debug(`git config user.name = ${name}`);
  }
  if (email) {
    await git.addConfig('user.email', email, false, 'local');
    logger.debug(`git config user.email = ${email}`);
  }

  /* v8 ignore next 3 */
  if (name || email) {
    logger.info(`Git identity set — name: ${name ?? '(unchanged)'}, email: ${email ?? '(unchanged)'}`);
  }
}

async function getDefaultBranch(git: ReturnType<typeof simpleGit>): Promise<string> {
  const remoteInfo = await git.remote(['show', 'origin']);
  const match = (remoteInfo ?? '').match(/HEAD branch: (\S+)/);
  return match?.[1] ?? 'main';
}
