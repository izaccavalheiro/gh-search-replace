import { Octokit } from '@octokit/rest';
import { withSpinner } from '../utils/spinner.js';
import { logger } from '../utils/logger.js';

const FORK_READY_POLL_INTERVAL_MS = 3000;
const FORK_READY_MAX_ATTEMPTS = 20; // ~60 seconds

export interface ForkInfo {
  /** The fork owner (authenticated user's login) */
  forkOwner: string;
  /** The fork repo name (same as original) */
  forkRepo: string;
  /** SSH or HTTPS clone URL of the fork */
  cloneUrl: string;
  /** Whether the fork already existed before this run */
  alreadyExisted: boolean;
}

/**
 * Returns true if the authenticated user has push (write) access to `owner/repo`.
 */
export async function hasPushAccess(
  token: string,
  owner: string,
  repo: string,
): Promise<boolean> {
  const octokit = new Octokit({ auth: token });
  try {
    const { data } = await octokit.repos.get({ owner, repo });
    return data.permissions?.push === true;
  } catch {
    return false;
  }
}

/**
 * Ensures a fork of `owner/repo` exists under the authenticated user's account.
 * Creates one if it doesn't exist, then polls until it is ready.
 */
export async function ensureFork(
  token: string,
  owner: string,
  repo: string,
  preferSSH: boolean,
): Promise<ForkInfo> {
  const octokit = new Octokit({ auth: token });

  // Get the authenticated user's login
  const { data: user } = await octokit.users.getAuthenticated();
  const forkOwner = user.login;

  // Check if fork already exists
  let alreadyExisted = false;
  try {
    await octokit.repos.get({ owner: forkOwner, repo });
    alreadyExisted = true;
    logger.info(`Fork already exists: ${forkOwner}/${repo}`);
  } catch (err: unknown) {
    if ((err as { status?: number }).status !== 404) throw err;
    // Does not exist — create it
  }

  if (!alreadyExisted) {
    await withSpinner(
      `Forking ${owner}/${repo} to ${forkOwner}/${repo}…`,
      async () => {
        await octokit.repos.createFork({ owner, repo });
        await waitForFork(octokit, forkOwner, repo);
      },
      `Forked to ${forkOwner}/${repo}`,
    );
  }

  const cloneUrl = preferSSH
    ? `git@github.com:${forkOwner}/${repo}.git`
    : `https://github.com/${forkOwner}/${repo}.git`;

  return { forkOwner, forkRepo: repo, cloneUrl, alreadyExisted };
}

async function waitForFork(
  octokit: Octokit,
  forkOwner: string,
  repo: string,
): Promise<void> {
  for (let attempt = 0; attempt < FORK_READY_MAX_ATTEMPTS; attempt++) {
    await sleep(FORK_READY_POLL_INTERVAL_MS);
    try {
      const { data } = await octokit.repos.get({ owner: forkOwner, repo });
      if (data.fork) return; // ready
    } catch {
      // not ready yet
    }
  }
  throw new Error(`Timed out waiting for fork ${forkOwner}/${repo} to become available.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
