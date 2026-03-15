import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), debug: vi.fn(), line: vi.fn(), blank: vi.fn() },
}));

const { mockSearchCode, MockOctokit } = vi.hoisted(() => {
  const mockSearchCode = vi.fn();
  const MockOctokit = vi.fn(() => ({ search: { code: mockSearchCode } }));
  return { mockSearchCode, MockOctokit };
});
vi.mock('@octokit/rest', () => ({ Octokit: MockOctokit }));

import { searchCode } from '../src/search/githubSearch.js';

beforeEach(() => vi.clearAllMocks());

function makeItem(overrides: object = {}) {
  return {
    repository: { full_name: 'owner/repo' },
    path: 'src/file.ts',
    html_url: 'https://github.com/owner/repo/blob/main/src/file.ts',
    ...overrides,
  };
}

describe('searchCode', () => {
  it('returns mapped search results', async () => {
    mockSearchCode.mockResolvedValueOnce({
      data: { items: [makeItem()] },
    });
    const results = await searchCode('ghp_token', 'myterm');
    expect(results).toHaveLength(1);
    expect(results[0].repoFullName).toBe('owner/repo');
    expect(results[0].owner).toBe('owner');
    expect(results[0].repoName).toBe('repo');
    expect(results[0].filePath).toBe('src/file.ts');
    expect(results[0].index).toBe(1);
  });

  it('applies language, org, and repo filters to the query', async () => {
    mockSearchCode.mockResolvedValueOnce({ data: { items: [] } });
    await searchCode('token', 'term', { language: 'typescript', org: 'myorg', repo: 'myorg/myrepo' });
    const call = mockSearchCode.mock.calls[0][0];
    expect(call.q).toContain('language:typescript');
    expect(call.q).toContain('org:myorg');
    expect(call.q).toContain('repo:myorg/myrepo');
  });

  it('caps perPage at 100', async () => {
    mockSearchCode.mockResolvedValueOnce({ data: { items: [] } });
    await searchCode('token', 'term', { maxResults: 200 });
    expect(mockSearchCode.mock.calls[0][0].per_page).toBe(100);
  });

  it('parses text_matches when present', async () => {
    const item = makeItem({
      text_matches: [
        { fragment: 'line with term', matches: [{ text: 'term', indices: [10, 14] as [number, number] }] },
      ],
    });
    mockSearchCode.mockResolvedValueOnce({ data: { items: [item] } });
    const results = await searchCode('token', 'term');
    expect(results[0].textMatches[0].fragment).toBe('line with term');
  });

  it('returns empty textMatches when text_matches is absent', async () => {
    mockSearchCode.mockResolvedValueOnce({ data: { items: [makeItem()] } });
    const results = await searchCode('token', 'term');
    expect(results[0].textMatches).toEqual([]);
  });

  it('returns empty textMatches when text_matches is empty array', async () => {
    const item = makeItem({ text_matches: [] });
    mockSearchCode.mockResolvedValueOnce({ data: { items: [item] } });
    const results = await searchCode('token', 'term');
    expect(results[0].textMatches).toEqual([]);
  });

  it('handles text_match with undefined fragment gracefully', async () => {
    const item = makeItem({ text_matches: [{ fragment: undefined, matches: [] }] });
    mockSearchCode.mockResolvedValueOnce({ data: { items: [item] } });
    const results = await searchCode('token', 'term');
    expect(results[0].textMatches[0].fragment).toBe('');
  });

  it('throttle onRateLimit callback warns and returns true/false based on retryCount', async () => {
    mockSearchCode.mockResolvedValueOnce({ data: { items: [] } });
    await searchCode('token', 'term');
    const config = MockOctokit.mock.calls[0][0] as {
      throttle: {
        onRateLimit: (r: number, o: object, ok: object, c: number) => boolean;
        onSecondaryRateLimit: (r: number, o: object, ok: object, c: number) => boolean;
      };
    };
    expect(config.throttle.onRateLimit(5, { method: 'GET', url: '/search' }, {}, 0)).toBe(true);
    expect(config.throttle.onRateLimit(5, { method: 'GET', url: '/search' }, {}, 3)).toBe(false);
    expect(config.throttle.onSecondaryRateLimit(5, { method: 'GET', url: '/search' }, {}, 0)).toBe(true);
    expect(config.throttle.onSecondaryRateLimit(5, { method: 'GET', url: '/search' }, {}, 3)).toBe(false);
  });
});
