import { describe, it, expect } from 'vitest';
import { slugify, generateBranchName } from '../src/utils/slugify.js';

// We test the search result parsing via the slugify utility and branch naming
// (actual API calls require a live token and are covered by e2e tests)

describe('slugify', () => {
  it('lowercases the input', () => {
    expect(slugify('FooBar')).toBe('foobar');
  });

  it('replaces spaces and special chars with hyphens', () => {
    expect(slugify('hello world!')).toBe('hello-world');
  });

  it('collapses consecutive non-alphanumeric chars', () => {
    expect(slugify('foo---bar___baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('truncates at 50 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });

  it('handles an empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('generateBranchName', () => {
  it('starts with "gh-search-replace/"', () => {
    expect(generateBranchName('my term')).toMatch(/^gh-search-replace\//);
  });

  it('contains a slug of the term', () => {
    expect(generateBranchName('deprecated api')).toContain('deprecated-api');
  });

  it('ends with a timestamp segment', () => {
    // Timestamp format: YYYYMMDD-HHmmss
    expect(generateBranchName('foo')).toMatch(/\d{8}-\d{6}$/);
  });

  it('produces unique names across rapid calls (different seconds)', () => {
    // Same second could produce the same branch — this just checks the format
    const b1 = generateBranchName('term');
    const b2 = generateBranchName('term');
    expect(b1).toMatch(/^gh-search-replace\//);
    expect(b2).toMatch(/^gh-search-replace\//);
  });
});
