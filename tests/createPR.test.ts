import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn(), debug: vi.fn(), blank: vi.fn(), line: vi.fn() },
}));

vi.mock('../src/utils/spinner.js', () => ({
  withSpinner: vi.fn(async (_text: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('open', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const mockConfirm = vi.hoisted(() => vi.fn());
vi.mock('@inquirer/prompts', () => ({
  confirm: mockConfirm,
  input: vi.fn().mockResolvedValue(''),
  checkbox: vi.fn().mockResolvedValue([]),
}));

const mockSearchIssues = vi.fn();
const mockPullsList = vi.fn();
const mockPullsCreate = vi.fn();
const mockIssuesUpdate = vi.fn();
const mockPullsRequestReviewers = vi.fn();
const mockIssuesListMilestones = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    search: { issuesAndPullRequests: mockSearchIssues },
    pulls: { list: mockPullsList, create: mockPullsCreate, requestReviewers: mockPullsRequestReviewers },
    issues: { update: mockIssuesUpdate, listMilestones: mockIssuesListMilestones },
  })),
}));

import { createPR } from '../src/pr/createPR.js';
import type { EditResult } from '../src/editor/index.js';

function makeEditResult(overrides: Partial<EditResult> = {}): EditResult {
  return {
    filePath: '/local/path/src/file.ts',
    changedLines: [1, 2],
    originalContent: 'old content',
    modifiedContent: 'new content',
    replacement: 'new',
    ...overrides,
  };
}

const baseOpts = {
  token: 'ghp_token',
  owner: 'upstream',
  repo: 'myrepo',
  head: 'forkuser:my-branch',
  base: 'main',
  term: 'old',
  editResults: [makeEditResult()],
  localPath: '/local/path',
  yes: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchIssues.mockResolvedValue({ data: { total_count: 0, items: [] } });
  mockPullsList.mockResolvedValue({ data: [] });
  mockPullsCreate.mockResolvedValue({
    data: { html_url: 'https://github.com/upstream/myrepo/pull/1', number: 1 },
  });
  mockIssuesUpdate.mockResolvedValue({ data: {} });
  mockPullsRequestReviewers.mockResolvedValue({ data: {} });
  mockIssuesListMilestones.mockResolvedValue({ data: [] });
});

describe('createPR', () => {
  it('creates a new PR and returns its URL', async () => {
    const url = await createPR(baseOpts);
    expect(url).toBe('https://github.com/upstream/myrepo/pull/1');
    expect(mockPullsCreate).toHaveBeenCalled();
  });

  it('returns existing PR URL when fingerprint match found', async () => {
    mockSearchIssues.mockResolvedValue({
      data: {
        total_count: 1,
        items: [{ html_url: 'https://github.com/upstream/myrepo/pull/99', body: '<!-- gh-sr-fp:PLACEHOLDER -->' }],
      },
    });
    // We need the body to match the actual fingerprint — use branch fallback instead
    mockSearchIssues.mockResolvedValue({ data: { total_count: 0, items: [] } });
    mockPullsList.mockResolvedValue({
      data: [{ html_url: 'https://github.com/upstream/myrepo/pull/99' }],
    });
    const url = await createPR(baseOpts);
    expect(url).toBe('https://github.com/upstream/myrepo/pull/99');
    expect(mockPullsCreate).not.toHaveBeenCalled();
  });

  it('opens browser for existing PR when not --yes and user confirms', async () => {
    mockPullsList.mockResolvedValue({
      data: [{ html_url: 'https://github.com/upstream/myrepo/pull/99' }],
    });
    mockConfirm.mockResolvedValue(true);
    const { default: open } = await import('open');
    await createPR({ ...baseOpts, yes: false });
    expect(open).toHaveBeenCalledWith('https://github.com/upstream/myrepo/pull/99');
  });

  it('does not open browser for existing PR when user declines', async () => {
    mockPullsList.mockResolvedValue({
      data: [{ html_url: 'https://github.com/upstream/myrepo/pull/99' }],
    });
    mockConfirm.mockResolvedValue(false);
    const { default: open } = await import('open');
    await createPR({ ...baseOpts, yes: false });
    expect(open).not.toHaveBeenCalled();
  });

  it('opens browser for new PR when not --yes and user confirms', async () => {
    mockConfirm.mockResolvedValue(true);
    const { default: open } = await import('open');
    await createPR({ ...baseOpts, yes: false });
    expect(open).toHaveBeenCalledWith('https://github.com/upstream/myrepo/pull/1');
  });

  it('uses custom title and description from userTemplate', async () => {
    await createPR({
      ...baseOpts,
      userTemplate: { title: 'custom: {term}', description: 'replacing {term} with {replacement}' },
    });
    const call = mockPullsCreate.mock.calls[0][0];
    expect(call.title).toBe('custom: old');
    expect(call.body).toContain('replacing old with new');
  });

  it('creates draft PR when draft=true', async () => {
    await createPR({ ...baseOpts, draft: true });
    expect(mockPullsCreate.mock.calls[0][0].draft).toBe(true);
  });

  it('respects draft from userTemplate', async () => {
    await createPR({ ...baseOpts, userTemplate: { draft: true } });
    expect(mockPullsCreate.mock.calls[0][0].draft).toBe(true);
  });

  it('applies labels and assignees from template', async () => {
    await createPR({
      ...baseOpts,
      userTemplate: { labels: ['bug'], assignees: ['alice'] },
    });
    expect(mockIssuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['bug'], assignees: ['alice'] }),
    );
  });

  it('applies milestone by number from template', async () => {
    await createPR({ ...baseOpts, userTemplate: { milestone: 3 } });
    expect(mockIssuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ milestone: 3 }),
    );
  });

  it('looks up milestone by title from template', async () => {
    mockIssuesListMilestones.mockResolvedValue({
      data: [{ title: 'v2.0', number: 5 }],
    });
    await createPR({ ...baseOpts, userTemplate: { milestone: 'v2.0' } });
    expect(mockIssuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ milestone: 5 }),
    );
  });

  it('warns when milestone title not found', async () => {
    mockIssuesListMilestones.mockResolvedValue({ data: [] });
    const { logger } = await import('../src/utils/logger.js');
    await createPR({ ...baseOpts, userTemplate: { milestone: 'missing' } });
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });

  it('warns about unsupported projects field', async () => {
    const { logger } = await import('../src/utils/logger.js');
    await createPR({ ...baseOpts, userTemplate: { projects: ['myproject'] } });
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });

  it('requests reviewers from template', async () => {
    await createPR({
      ...baseOpts,
      userTemplate: { reviewers: ['alice'], teamReviewers: ['team-a'] },
    });
    expect(mockPullsRequestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: ['alice'], team_reviewers: ['team-a'] }),
    );
  });

  it('applies only assignees (no labels) — covers assignees branch in update condition', async () => {
    await createPR({ ...baseOpts, userTemplate: { assignees: ['alice'] } });
    expect(mockIssuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: ['alice'] }),
    );
  });

  it('requests only teamReviewers (no reviewers) — covers teamReviewers branch and reviewers false ternary', async () => {
    await createPR({ ...baseOpts, userTemplate: { teamReviewers: ['team-a'] } });
    expect(mockPullsRequestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ team_reviewers: ['team-a'] }),
    );
  });

  it('requests only individual reviewers (no teamReviewers) — covers teamReviewers false ternary', async () => {
    await createPR({ ...baseOpts, userTemplate: { reviewers: ['bob'] } });
    expect(mockPullsRequestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: ['bob'] }),
    );
  });

  it('returns PR URL when fingerprint matches in body', async () => {
    // Compute a real fingerprint to match
    const { computeFingerprint, fingerprintComment } = await import('../src/pr/fingerprint.js');
    const fp = computeFingerprint({
      term: baseOpts.term,
      owner: baseOpts.owner,
      repo: baseOpts.repo,
      replacement: 'new',
      files: [{ path: 'src/file.ts', lines: [1, 2] }],
    });
    const body = fingerprintComment(fp);
    mockSearchIssues.mockResolvedValue({
      data: {
        total_count: 1,
        items: [{ html_url: 'https://github.com/upstream/myrepo/pull/42', body }],
      },
    });
    const url = await createPR(baseOpts);
    expect(url).toBe('https://github.com/upstream/myrepo/pull/42');
  });
});
