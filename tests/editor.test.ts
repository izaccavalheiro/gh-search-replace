import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findMatchingLines, editFile } from '../src/editor/fileEditor.js';
import { buildDiff, printDiff, printContextPreview } from '../src/editor/diffPrinter.js';
import type { DiffLine } from '../src/editor/diffPrinter.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn().mockResolvedValue('prompted_replacement'),
}));

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

// ── editFile (non-interactive) ─────────────────────────────────────────────────

describe('editFile', () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsr-editfile-'));
    testFile = path.join(tmpDir, 'file.ts');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when the file does not exist', async () => {
    const result = await editFile('/nonexistent/path/file.ts', 'term', { replacement: 'x' });
    expect(result).toBeNull();
  });

  it('returns null when the term is not found in the file', async () => {
    fs.writeFileSync(testFile, 'no match here\n');
    const result = await editFile(testFile, 'missing', { replacement: 'x' });
    expect(result).toBeNull();
  });

  it('replaces all occurrences and returns an EditResult', async () => {
    fs.writeFileSync(testFile, 'foo bar\nbaz foo\n');
    const result = await editFile(testFile, 'foo', { replacement: 'qux' });

    expect(result).not.toBeNull();
    expect(result!.replacement).toBe('qux');
    expect(result!.changedLines).toEqual([1, 2]);
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('qux bar\nbaz qux\n');
  });

  it('deletes matched lines when replacement is empty', async () => {
    fs.writeFileSync(testFile, 'keep this\ndelete me\nkeep this too\n');
    const result = await editFile(testFile, 'delete me', { replacement: '' });

    expect(result).not.toBeNull();
    const written = fs.readFileSync(testFile, 'utf-8');
    expect(written).not.toContain('delete me');
    expect(written).toContain('keep this');
  });

  it('writes atomically — no .tmp file remains after success', async () => {
    fs.writeFileSync(testFile, 'old value\n');
    await editFile(testFile, 'old', { replacement: 'new' });

    expect(fs.existsSync(`${testFile}.tmp`)).toBe(false);
    expect(fs.readFileSync(testFile, 'utf-8')).toContain('new');
  });
});

// ── printDiff ─────────────────────────────────────────────────────────────────

describe('printDiff', () => {
  it('logs added, removed, and context lines', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const diff: DiffLine[] = [
      { type: 'added', lineNumber: 1, content: 'new line' },
      { type: 'removed', lineNumber: 1, content: 'old line' },
      { type: 'context', lineNumber: 2, content: 'ctx line' },
    ];
    printDiff(diff);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── printContextPreview ────────────────────────────────────────────────────────

describe('printContextPreview', () => {
  it('logs matched and context lines', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printContextPreview(['match here', 'other line'], [1], 'match');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles a context-only line (non-match)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printContextPreview(['match here', 'other line'], [1], 'match', 1);
    // line 2 is context
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── editFile interactive ───────────────────────────────────────────────────────

describe('editFile (interactive)', () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsr-interactive-'));
    testFile = path.join(tmpDir, 'file.ts');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('uses prompted replacement when opts.replacement is not provided', async () => {
    fs.writeFileSync(testFile, 'foo bar\n');
    const result = await editFile(testFile, 'foo');
    expect(result).not.toBeNull();
    expect(result!.replacement).toBe('prompted_replacement');
    expect(fs.readFileSync(testFile, 'utf-8')).toContain('prompted_replacement');
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
