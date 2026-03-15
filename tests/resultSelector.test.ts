import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), blank: vi.fn(), line: vi.fn(), success: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockCheckbox = vi.hoisted(() => vi.fn());
vi.mock('@inquirer/prompts', () => ({
  checkbox: mockCheckbox,
  input: vi.fn().mockResolvedValue(''),
}));

import { printResults, selectResults } from '../src/search/resultSelector.js';
import type { SearchResult } from '../src/search/githubSearch.js';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    index: 1,
    repoFullName: 'owner/repo',
    owner: 'owner',
    repoName: 'repo',
    filePath: 'src/file.ts',
    htmlUrl: 'https://github.com/owner/repo/blob/main/src/file.ts',
    textMatches: [],
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('printResults', () => {
  it('prints a table of results without throwing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printResults([makeResult(), makeResult({ index: 2, filePath: 'src/other.ts' })]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('prints results with a text snippet when textMatches exist', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = makeResult({ textMatches: [{ fragment: 'const foo = bar', lineNumbers: [] }] });
    printResults([r]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('prints results with multiline fragment (uses first non-empty line)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = makeResult({ textMatches: [{ fragment: '\nconst foo = bar\n', lineNumbers: [] }] });
    printResults([r]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('selectResults', () => {
  it('returns empty array and warns when results is empty', async () => {
    const selected = await selectResults([]);
    expect(selected).toEqual([]);
  });

  it('returns user-selected results', async () => {
    const r = makeResult();
    mockCheckbox.mockResolvedValueOnce([r]);
    const selected = await selectResults([r]);
    expect(selected).toEqual([r]);
  });

  it('passes a validate function to checkbox', async () => {
    const r = makeResult();
    mockCheckbox.mockImplementationOnce(async (opts: { validate: (items: unknown[]) => unknown }) => {
      expect(opts.validate([])).not.toBe(true);
      expect(opts.validate([r])).toBe(true);
      return [r];
    });
    await selectResults([r]);
  });
});
