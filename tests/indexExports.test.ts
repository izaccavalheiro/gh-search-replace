/**
 * Imports the re-export barrel files so they register as covered.
 * No meaningful assertions needed — execution alone provides coverage.
 */
import { describe, it, expect } from 'vitest';

// Mock heavy deps so the index files can be imported without side-effects
import { vi } from 'vitest';

vi.mock('@octokit/rest', () => ({ Octokit: vi.fn() }));
vi.mock('simple-git', () => ({ simpleGit: vi.fn() }));
vi.mock('@inquirer/prompts', () => ({ checkbox: vi.fn(), input: vi.fn(), confirm: vi.fn() }));
vi.mock('conf', () => ({
  default: class { path = ''; get() { return ''; } set() {} delete() {} },
}));

describe('barrel index re-exports', () => {
  it('editor index', async () => {
    const m = await import('../src/editor/index.js');
    expect(m.editFile).toBeDefined();
    expect(m.buildDiff).toBeDefined();
  });

  it('git index', async () => {
    const m = await import('../src/git/index.js');
    expect(m.cloneOrPull).toBeDefined();
    expect(m.ensureFork).toBeDefined();
  });

  it('pr index', async () => {
    const m = await import('../src/pr/index.js');
    expect(m.createPR).toBeDefined();
    expect(m.generatePRBody).toBeDefined();
  });

  it('search index', async () => {
    const m = await import('../src/search/index.js');
    expect(m.searchCode).toBeDefined();
    expect(m.printResults).toBeDefined();
  });
});
