import { simpleGit } from 'simple-git';
import { withSpinner } from '../utils/spinner.js';
import { logger } from '../utils/logger.js';
import { generateBranchName } from '../utils/slugify.js';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export async function createAndCheckoutBranch(
  localPath: string,
  term: string,
  branchNameOverride?: string,
): Promise<string> {
  const git = simpleGit(localPath);
  let branchName = branchNameOverride ?? generateBranchName(term);

  // Check if branch already exists remotely; append suffix if so
  const remoteBranches = await git.branch(['-r']);
  const existsRemotely = remoteBranches.all.some((b) =>
    b.includes(branchName),
  );
  if (existsRemotely) {
    branchName = `${branchName}-${randomSuffix()}`;
    logger.warn(`Branch already exists remotely. Using: ${branchName}`);
  }

  await git.checkoutLocalBranch(branchName);
  logger.success(`Created branch: ${branchName}`);
  return branchName;
}

export async function commitAndPush(
  localPath: string,
  files: string[],
  term: string,
  branchName: string,
): Promise<void> {
  const git = simpleGit(localPath);

  await withSpinner(
    'Staging and committing…',
    async () => {
      await git.add(files);
      await git.commit(`fix: replace "${term}" occurrences via gh-search-replace`);
    },
    'Committed changes',
  );

  await withSpinner(
    `Pushing branch ${branchName}…`,
    async () => {
      await git.push('origin', branchName, ['--set-upstream']);
    },
    `Pushed branch ${branchName}`,
  );
}

/**
 * Returns the default branch of the upstream (original) remote.
 * Falls back to `origin` if no `upstream` remote is configured.
 */
export async function getDefaultBranch(localPath: string): Promise<string> {
  const git = simpleGit(localPath);
  const remotes = await git.getRemotes();
  const remote = remotes.some((r) => r.name === 'upstream') ? 'upstream' : 'origin';
  const remoteInfo = await git.remote(['show', remote]);
  const match = (remoteInfo ?? '').match(/HEAD branch: (\S+)/);
  return match?.[1] ?? 'main';
}
