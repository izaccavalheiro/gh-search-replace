import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyPlaceholders, loadUserTemplate } from '../src/pr/userTemplate.js';
import type { TemplatePlaceholders } from '../src/pr/userTemplate.js';

const vars: TemplatePlaceholders = {
  term: 'oldTerm',
  replacement: 'newTerm',
  filesTable: '| file.ts | 1, 2 |',
  timestamp: '2024-01-01T00:00:00.000Z',
};

describe('applyPlaceholders', () => {
  it('replaces {term}', () => {
    expect(applyPlaceholders('search {term}', vars)).toBe('search oldTerm');
  });

  it('replaces {replacement}', () => {
    expect(applyPlaceholders('replace with {replacement}', vars)).toBe('replace with newTerm');
  });

  it('replaces {files_table}', () => {
    expect(applyPlaceholders('{files_table}', vars)).toBe('| file.ts | 1, 2 |');
  });

  it('replaces {timestamp}', () => {
    expect(applyPlaceholders('at {timestamp}', vars)).toBe('at 2024-01-01T00:00:00.000Z');
  });

  it('replaces all placeholders together', () => {
    const text = '{term} → {replacement} at {timestamp}';
    expect(applyPlaceholders(text, vars)).toBe('oldTerm → newTerm at 2024-01-01T00:00:00.000Z');
  });
});

describe('loadUserTemplate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsr-tpl-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a JSON template', async () => {
    const tplPath = path.join(tmpDir, 'tpl.json');
    fs.writeFileSync(tplPath, JSON.stringify({ title: 'fix: {term}', labels: ['bug'] }));
    const tpl = await loadUserTemplate(tplPath);
    expect(tpl.title).toBe('fix: {term}');
    expect(tpl.labels).toEqual(['bug']);
  });

  it('loads a YAML template (.yaml)', async () => {
    const tplPath = path.join(tmpDir, 'tpl.yaml');
    fs.writeFileSync(tplPath, 'title: "fix: {term}"\ndraft: true\n');
    const tpl = await loadUserTemplate(tplPath);
    expect(tpl.title).toBe('fix: {term}');
    expect(tpl.draft).toBe(true);
  });

  it('loads a YAML template (.yml)', async () => {
    const tplPath = path.join(tmpDir, 'tpl.yml');
    fs.writeFileSync(tplPath, 'title: "my title"\n');
    const tpl = await loadUserTemplate(tplPath);
    expect(tpl.title).toBe('my title');
  });

  it('throws on unsupported extension', async () => {
    const tplPath = path.join(tmpDir, 'tpl.toml');
    fs.writeFileSync(tplPath, 'title = "foo"');
    await expect(loadUserTemplate(tplPath)).rejects.toThrow('Unsupported');
  });

  it('resolves descriptionFile relative to template dir', async () => {
    const descPath = path.join(tmpDir, 'desc.md');
    fs.writeFileSync(descPath, '# PR Description');
    const tplPath = path.join(tmpDir, 'tpl.json');
    fs.writeFileSync(tplPath, JSON.stringify({ descriptionFile: 'desc.md' }));
    const tpl = await loadUserTemplate(tplPath);
    expect(tpl.description).toBe('# PR Description');
    expect(tpl.descriptionFile).toBeUndefined();
  });
});
