import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';

export interface SearchOptions {
  language?: string;
  org?: string;
  repo?: string;
  maxResults?: number;
}

export interface SearchResult {
  index: number;
  repoFullName: string;
  owner: string;
  repoName: string;
  filePath: string;
  htmlUrl: string;
  textMatches: TextMatch[];
}

export interface TextMatch {
  fragment: string;
  lineNumbers: number[];
}

const MAX_RETRIES = 3;

export async function searchCode(
  token: string,
  term: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  const octokit = new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter: number, options: { method: string; url: string }, octokit: Octokit, retryCount: number) => {
        logger.warn(`Rate limit hit for ${options.method} ${options.url}. Retrying after ${retryAfter}s (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        return retryCount < MAX_RETRIES;
      },
      onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }, octokit: Octokit, retryCount: number) => {
        logger.warn(`Secondary rate limit for ${options.method} ${options.url}. Retrying after ${retryAfter}s`);
        return retryCount < MAX_RETRIES;
      },
    },
  });

  let query = term;
  if (opts.language) query += ` language:${opts.language}`;
  if (opts.org) query += ` org:${opts.org}`;
  if (opts.repo) query += ` repo:${opts.repo}`;

  const perPage = Math.min(opts.maxResults ?? 20, 100);

  const { data } = await octokit.search.code({
    q: query,
    per_page: perPage,
    headers: {
      Accept: 'application/vnd.github.text-match+json',
    },
  });

  return data.items.map((item, idx) => {
    const [owner, repoName] = item.repository.full_name.split('/');
    const textMatches = parseTextMatches(
      (item as unknown as { text_matches?: RawTextMatch[] }).text_matches,
    );
    return {
      index: idx + 1,
      repoFullName: item.repository.full_name,
      owner,
      repoName,
      filePath: item.path,
      htmlUrl: item.html_url,
      textMatches,
    };
  });
}

interface RawTextMatch {
  fragment?: string;
  matches?: { text: string; indices: [number, number] }[];
}

function parseTextMatches(raw?: RawTextMatch[]): TextMatch[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((m) => ({
    fragment: m.fragment ?? '',
    lineNumbers: extractLineNumbers(m.fragment ?? ''),
  }));
}

/**
 * GitHub's text match fragment doesn't include line numbers directly.
 * We store a placeholder; actual line resolution happens on the cloned file.
 */
function extractLineNumbers(_fragment: string): number[] {
  return [];
}
