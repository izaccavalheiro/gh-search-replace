import { describe, it, expect } from 'vitest';
import { generatePRBody, generatePRTitle } from '../src/pr/prTemplate.js';
import { computeFingerprint, extractFingerprint, fingerprintComment } from '../src/pr/fingerprint.js';

describe('generatePRTitle', () => {
  it('produces the expected title format', () => {
    const title = generatePRTitle('deprecated-api');
    expect(title).toBe('fix: replace "deprecated-api" occurrences');
  });
});

describe('generatePRBody', () => {
  it('includes the search term', () => {
    const body = generatePRBody({
      term: 'oldFunction',
      files: [{ path: 'src/utils.ts', lines: [42, 87] }],
      originalContent: 'oldFunction()',
      replacement: 'newFunction()',
      timestamp: '2025-03-14T15:30:00.000Z',
    });

    expect(body).toContain('`oldFunction`');
    expect(body).toContain('gh-search-replace');
  });

  it('includes file paths and line numbers', () => {
    const body = generatePRBody({
      term: 'foo',
      files: [
        { path: 'a/b.ts', lines: [1, 2] },
        { path: 'c/d.ts', lines: [99] },
      ],
      originalContent: '',
      replacement: 'bar',
      timestamp: '2025-03-14T00:00:00.000Z',
    });

    expect(body).toContain('`a/b.ts`');
    expect(body).toContain('`c/d.ts`');
    expect(body).toContain('1, 2');
    expect(body).toContain('99');
  });

  it('shows line removed note when replacement is empty', () => {
    const body = generatePRBody({
      term: 'removable',
      files: [{ path: 'file.ts', lines: [5] }],
      originalContent: 'removable line',
      replacement: '',
      timestamp: '2025-03-14T00:00:00.000Z',
    });

    expect(body).toContain('*(line removed)*');
  });

  it('includes the timestamp', () => {
    const ts = '2025-03-14T12:00:00.000Z';
    const body = generatePRBody({
      term: 't',
      files: [],
      originalContent: '',
      replacement: 'x',
      timestamp: ts,
    });

    expect(body).toContain(ts);
  });

  it('embeds fingerprint as an HTML comment when provided', () => {
    const body = generatePRBody({
      term: 'foo',
      files: [{ path: 'a.ts', lines: [1] }],
      originalContent: '',
      replacement: 'bar',
      timestamp: '2025-01-01T00:00:00.000Z',
      fingerprint: 'abc123',
    });

    expect(body).toContain('<!-- gh-sr-fp:abc123 -->');
  });

  it('omits fingerprint comment when fingerprint is not provided', () => {
    const body = generatePRBody({
      term: 'foo',
      files: [],
      originalContent: '',
      replacement: 'bar',
      timestamp: '2025-01-01T00:00:00.000Z',
    });

    expect(body).not.toContain('gh-sr-fp');
  });
});

describe('computeFingerprint', () => {
  const base = {
    term: 'oldFn',
    owner: 'acme',
    repo: 'api',
    replacement: 'newFn',
    files: [
      { path: 'src/a.ts', lines: [10, 20] },
      { path: 'src/b.ts', lines: [5] },
    ],
  };

  it('returns a non-empty base64url string', () => {
    const fp = computeFingerprint(base);
    expect(fp).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fp.length).toBeGreaterThan(0);
  });

  it('is deterministic — same input always yields same fingerprint', () => {
    expect(computeFingerprint(base)).toBe(computeFingerprint(base));
  });

  it('is canonical — file order does not change the fingerprint', () => {
    const reversed = { ...base, files: [...base.files].reverse() };
    expect(computeFingerprint(base)).toBe(computeFingerprint(reversed));
  });

  it('is canonical — line order within a file does not change the fingerprint', () => {
    const shuffled = {
      ...base,
      files: [{ path: 'src/a.ts', lines: [20, 10] }, { path: 'src/b.ts', lines: [5] }],
    };
    expect(computeFingerprint(base)).toBe(computeFingerprint(shuffled));
  });

  it('changes when the term changes', () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, term: 'different' }));
  });

  it('changes when the replacement changes', () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, replacement: 'other' }));
  });

  it('changes when the repo changes', () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, repo: 'other-repo' }));
  });
});

describe('extractFingerprint', () => {
  it('extracts a fingerprint embedded by fingerprintComment', () => {
    const fp = computeFingerprint({
      term: 'x', owner: 'o', repo: 'r', replacement: 'y', files: [],
    });
    const body = `Some PR body text\n${fingerprintComment(fp)}`;
    expect(extractFingerprint(body)).toBe(fp);
  });

  it('returns null when no fingerprint is present', () => {
    expect(extractFingerprint('No fingerprint here')).toBeNull();
  });
});
