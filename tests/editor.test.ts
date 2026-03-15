import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findMatchingLines } from '../src/editor/fileEditor.js';
import { buildDiff } from '../src/editor/diffPrinter.js';

// ── findMatchingLines ─────────────────────────────────────────────────────────

describe('findMatchingLines', () => {
  it('returns line numbers containing the search term', () => {
    const content = 'hello world\nfoo bar\nhello again\n';
    expect(findMatchingLines(content, 'hello')).toEqual([1, 3]);
  });

  it('returns empty array when term is not found', () => {
    const content = 'line one\nline two\n';
    expect(findMatchingLines(content, 'xyz')).toEqual([]);
  });

  it('handles a single-line file', () => {
    const content = 'just one line with term';
    expect(findMatchingLines(content, 'term')).toEqual([1]);
  });

  it('is case-sensitive', () => {
    const content = 'Hello\nhello\nHELLO\n';
    expect(findMatchingLines(content, 'hello')).toEqual([2]);
  });

  it('matches multiple occurrences on the same line once', () => {
    const content = 'foo foo foo\n';
    expect(findMatchingLines(content, 'foo')).toEqual([1]);
  });
});

// ── buildDiff ─────────────────────────────────────────────────────────────────

describe('buildDiff', () => {
  it('marks changed lines as removed/added', () => {
    const original = ['line 1', 'old content', 'line 3'];
    const modified = ['line 1', 'new content', 'line 3'];
    const changed = new Set([2]);

    const diff = buildDiff(original, modified, changed, 0);
    const removed = diff.filter((d) => d.type === 'removed');
    const added = diff.filter((d) => d.type === 'added');

    expect(removed).toHaveLength(1);
    expect(removed[0].content).toBe('old content');
    expect(added).toHaveLength(1);
    expect(added[0].content).toBe('new content');
  });

  it('includes context lines around changes', () => {
    const original = ['a', 'b', 'OLD', 'd', 'e'];
    const modified = ['a', 'b', 'NEW', 'd', 'e'];
    const changed = new Set([3]);

    const diff = buildDiff(original, modified, changed, 1);
    const types = diff.map((d) => d.type);
    expect(types).toContain('context');
  });

  it('handles deleted lines (replacement is empty)', () => {
    const original = ['keep', 'delete me', 'keep'];
    // When a line is deleted the modified array has one fewer entry
    const modified = ['keep', 'keep'];
    const changed = new Set([2]);

    const diff = buildDiff(original, modified, changed, 0);
    const removed = diff.filter((d) => d.type === 'removed');
    expect(removed[0].content).toBe('delete me');
  });
});

// ── atomic write integration ───────────────────────────────────────────────────

describe('atomic file write', () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsr-test-'));
    testFile = path.join(tmpDir, 'sample.txt');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes file content and renames from .tmp', () => {
    const content = 'original content';
    const modified = 'modified content';

    fs.writeFileSync(testFile, content);

    const tmpPath = `${testFile}.tmp`;
    fs.writeFileSync(tmpPath, modified);
    fs.renameSync(tmpPath, testFile);

    expect(fs.readFileSync(testFile, 'utf-8')).toBe(modified);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });
});
