import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 60; // 5 minutes

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

export async function startDeviceFlow(clientId: string): Promise<string> {
  // Request device & user codes
  // GitHub OAuth endpoints require application/x-www-form-urlencoded (not JSON)
  const codeRes = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'repo read:user',
    }).toString(),
  });

  if (!codeRes.ok) {
    const body = await codeRes.text().catch(() => '');
    if (codeRes.status === 400) {
      throw new Error(
        `Bad Request from GitHub device flow (HTTP 400).\n\n` +
        `This usually means Device Flow is not enabled for your OAuth App.\n` +
        `Fix: go to https://github.com/settings/developers → your OAuth App → enable "Device Flow".\n\n` +
        `Alternatively, skip the browser flow entirely:\n` +
        `  gh-search-replace auth login --token <your-PAT>\n\n` +
        `GitHub response: ${body}`,
      );
    }
    throw new Error(`Failed to initiate device flow: ${codeRes.status} ${codeRes.statusText}. ${body}`);
  }

  const data = (await codeRes.json()) as DeviceCodeResponse;
  const { device_code, user_code, verification_uri, interval } = data;
  const pollInterval = Math.max((interval ?? 5) * 1000, POLL_INTERVAL_MS);

  logger.blank();
  logger.info('Open the following URL in your browser to authenticate:');
  console.log(`\n  ${verification_uri}\n`);
  logger.info(`Enter this code when prompted: \x1b[1;33m${user_code}\x1b[0m`);
  logger.blank();

  // Open browser
  try {
    const { default: open } = await import('open');
    await open(verification_uri);
    logger.info('Browser opened automatically.');
  } catch {
    logger.warn('Could not open browser automatically. Please visit the URL above.');
  }

  const spinner = createSpinner('Waiting for browser authentication…').start();

  let retries = 0;
  while (retries < MAX_RETRIES) {
    await sleep(pollInterval);
    retries++;

    const tokenRes = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
    });

    const tokenData = (await tokenRes.json()) as TokenResponse;

    if (tokenData.access_token) {
      spinner.succeed('Authentication successful!');
      return tokenData.access_token;
    }

    if (tokenData.error === 'authorization_pending') {
      continue;
    }

    if (tokenData.error === 'slow_down') {
      await sleep(tokenData.interval ? tokenData.interval * 1000 : 2000);
      continue;
    }

    if (tokenData.error === 'expired_token') {
      spinner.fail('Device code expired.');
      throw new Error('Device code expired. Please run `auth login` again.');
    }

    if (tokenData.error) {
      spinner.fail('Authentication failed.');
      throw new Error(`OAuth error: ${tokenData.error_description ?? tokenData.error}`);
    }
  }

  spinner.fail('Timed out waiting for authentication.');
  throw new Error('Authentication timed out. Please run `auth login` again.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
