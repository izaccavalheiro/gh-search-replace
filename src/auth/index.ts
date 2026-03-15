import { Octokit } from '@octokit/rest';
import { tokenStore } from './tokenStore.js';
import { startDeviceFlow } from './deviceFlow.js';
import { logger } from '../utils/logger.js';

export interface AuthOptions {
  token?: string;
  force?: boolean;
}

/**
 * Resolves and validates a GitHub token.
 * Priority: --token flag > GITHUB_TOKEN env > stored config token.
 * Triggers Device Flow if no valid token is found.
 */
export async function resolveToken(opts: AuthOptions = {}): Promise<string> {
  // 1. Explicit token provided
  const explicitToken = opts.token ?? process.env.GITHUB_TOKEN;
  if (explicitToken) {
    logger.debug('Using token from flag or environment variable.');
    return explicitToken;
  }

  // 2. Stored token (unless --force)
  if (!opts.force) {
    const stored = tokenStore.get();
    if (stored) {
      logger.debug('Using stored token.');
      return stored;
    }
  }

  // 3. Device Flow
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'GITHUB_CLIENT_ID is not set. Set it in your environment or provide a --token flag.\n' +
        'See .env.example for details.',
    );
  }

  const token = await startDeviceFlow(clientId);
  const login = await fetchLogin(token);
  tokenStore.set(token, login);
  logger.success(`Logged in as ${login}`);
  logger.info(`Token stored at: ${tokenStore.configPath()}`);
  return token;
}

export async function fetchLogin(token: string): Promise<string> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.users.getAuthenticated();
  return data.login;
}

export async function loginCommand(opts: AuthOptions): Promise<void> {
  logger.info('Authenticating with GitHub…');

  const token = await resolveToken({ ...opts, force: opts.force ?? !opts.token });

  const login = await fetchLogin(token);
  tokenStore.set(token, login);

  logger.success(`Authenticated as ${login}`);
  logger.info(`Token stored at: ${tokenStore.configPath()}`);

  const masked = `****${token.slice(-4)}`;
  logger.debug(`Token (masked): ${masked}`);
}

export function logoutCommand(): void {
  const login = tokenStore.getLogin();
  tokenStore.clear();
  if (login) {
    logger.success(`Logged out (was: ${login})`);
  } else {
    logger.info('No stored session found.');
  }
}
