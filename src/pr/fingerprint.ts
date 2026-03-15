import { createHash } from 'node:crypto';

export interface FingerprintInput {
  term: string;
  owner: string;
  repo: string;
  replacement: string;
  /** Sorted list of { path, lines[] } — order must be canonical */
  files: { path: string; lines: number[] }[];
}

/**
 * Produces a deterministic, stateless fingerprint for a search-replace PR.
 *
 * Algorithm:
 *   1. Canonicalise the input (sort files by path, sort lines within each file)
 *   2. Serialize to compact JSON
 *   3. SHA-256 hash → base64url (URL-safe, no padding)
 *
 * The result is embedded as an HTML comment in the PR body so it is invisible
 * in the rendered markdown but searchable via the GitHub search API.
 */
export function computeFingerprint(input: FingerprintInput): string {
  const canonical = {
    term: input.term,
    owner: input.owner,
    repo: input.repo,
    replacement: input.replacement,
    files: [...input.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => ({ path: f.path, lines: [...f.lines].sort((a, b) => a - b) })),
  };

  const json = JSON.stringify(canonical);
  const digest = createHash('sha256').update(json).digest('base64url');
  return digest;
}

/** The marker string used when embedding / searching for the fingerprint. */
export const FINGERPRINT_MARKER = 'gh-sr-fp';

/**
 * Returns the HTML comment to embed at the end of a PR body.
 * Example: `<!-- gh-sr-fp:dGVzdA== -->`
 */
export function fingerprintComment(fingerprint: string): string {
  return `<!-- ${FINGERPRINT_MARKER}:${fingerprint} -->`;
}

/**
 * Extracts the fingerprint from a PR body, or returns null if absent.
 */
export function extractFingerprint(body: string): string | null {
  const match = body.match(new RegExp(`<!-- ${FINGERPRINT_MARKER}:([A-Za-z0-9_-]+) -->`));
  return match?.[1] ?? null;
}
