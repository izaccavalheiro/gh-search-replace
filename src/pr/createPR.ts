import { Octokit } from '@octokit/rest';
import { generatePRBody, generatePRTitle } from './prTemplate.js';
import { computeFingerprint, extractFingerprint } from './fingerprint.js';
import type { EditResult } from '../editor/index.js';
import { logger } from '../utils/logger.js';
import { withSpinner } from '../utils/spinner.js';
import { confirm } from '@inquirer/prompts';
import type { UserPRTemplate, TemplatePlaceholders } from './userTemplate.js';
import { applyPlaceholders } from './userTemplate.js';

export interface CreatePROptions {
  token: string;
  /** Owner of the ORIGINAL (upstream) repo — the PR target */
  owner: string;
  repo: string;
  /**
   * The head ref for the PR.
   * For cross-fork PRs this must be `"forkOwner:branchName"`.
   * For same-repo PRs this is just `"branchName"`.
   */
  head: string;
  base: string;
  term: string;
  editResults: EditResult[];
  draft?: boolean;
  localPath: string;
  /** When true, skips the "open in browser?" confirmation. */
  yes?: boolean;
  /** Optional user-supplied PR template. */
  userTemplate?: UserPRTemplate;
}

export async function createPR(opts: CreatePROptions): Promise<string> {
  const octokit = new Octokit({ auth: opts.token });

  const files = opts.editResults.map((r) => ({
    path: r.filePath.replace(opts.localPath + '/', ''),
    lines: r.changedLines,
  }));

  // Build a stateless fingerprint from the semantic content of this PR so we
  // can detect duplicates without persisting any local state.
  const fingerprint = computeFingerprint({
    term: opts.term,
    owner: opts.owner,
    repo: opts.repo,
    /* v8 ignore next */
    replacement: opts.editResults[0]?.replacement ?? '',
    files,
  });

  // Check for an existing open PR by:
  //   1. Fingerprint match — searches PR bodies for the embedded HTML comment.
  //      This catches re-runs with different branch names.
  //   2. Branch match fallback — same head → base as before.
  const existingUrl = await withSpinner(
    'Checking for existing Pull Request…',
    async () => {
      // 1. Search by fingerprint embedded in PR body
      const query = `is:pr is:open repo:${opts.owner}/${opts.repo} in:body gh-sr-fp:${fingerprint}`;
      const { data: searchData } = await octokit.search.issuesAndPullRequests({ q: query, per_page: 1 });
      if (searchData.total_count > 0) {
        const item = searchData.items[0];
        // Double-check the fingerprint is actually in the body (search can be fuzzy)
        if (item.body && extractFingerprint(item.body) === fingerprint) {
          return item.html_url;
        }
      }

      // 2. Fallback: match by branch head → base
      const { data: branchData } = await octokit.pulls.list({
        owner: opts.owner,
        repo: opts.repo,
        head: opts.head,
        base: opts.base,
        state: 'open',
      });
      return branchData[0]?.html_url ?? null;
    },
    'Checked for existing Pull Request',
  );

  if (existingUrl) {
    logger.blank();
    logger.warn(`An open PR already exists: ${existingUrl}`);
    logger.blank();

    if (!opts.yes) {
      const openInBrowser = await confirm({
        message: 'Open existing Pull Request in browser?',
        default: true,
      });
      if (openInBrowser) {
        const { default: open } = await import('open');
        await open(existingUrl);
      }
    }

    return existingUrl;
  }

  const timestamp = new Date().toISOString();
  /* v8 ignore next */
  const replacement = opts.editResults[0]?.replacement ?? '';

  const filesTable =
    '| File | Lines changed |\n|---|---|\n' +
    files.map((f) => `| \`${f.path}\` | ${f.lines.join(', ')} |`).join('\n');

  const placeholders: TemplatePlaceholders = {
    term: opts.term,
    replacement,
    filesTable,
    timestamp,
  };

  const tpl = opts.userTemplate;

  const body = tpl?.description
    ? applyPlaceholders(tpl.description, placeholders)
    : generatePRBody({
        term: opts.term,
        files,
        /* v8 ignore next */
        originalContent: opts.editResults[0]?.originalContent ?? '',
        replacement,
        timestamp,
        fingerprint,
      });

  const title = tpl?.title
    ? applyPlaceholders(tpl.title, placeholders)
    : generatePRTitle(opts.term);

  const isDraft = tpl?.draft ?? opts.draft ?? false;

  const prData = await withSpinner(
    'Opening Pull Request…',
    async () => {
      const { data } = await octokit.pulls.create({
        owner: opts.owner,
        repo: opts.repo,
        title,
        body,
        head: opts.head,
        base: opts.base,
        draft: isDraft,
      });
      return data;
    },
    'Pull Request created!',
  );

  const prUrl = prData.html_url;
  const prNumber = prData.number;

  // Apply template metadata (labels, assignees, milestone, reviewers)
  if (tpl) {
    await applyTemplateMetadata(octokit, opts.owner, opts.repo, prNumber, tpl);
  }

  logger.blank();
  logger.success(`PR URL: ${prUrl}`);
  logger.blank();

  if (!opts.yes) {
    const openInBrowser = await confirm({
      message: 'Open Pull Request in browser?',
      default: true,
    });

    if (openInBrowser) {
      const { default: open } = await import('open');
      await open(prUrl);
    }
  }

  return prUrl;
}

async function applyTemplateMetadata(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  tpl: UserPRTemplate,
): Promise<void> {
  // Warn about unsupported projects field
  if (tpl.projects && tpl.projects.length > 0) {
    logger.warn('Template field "projects" is not yet supported and will be ignored.');
  }

  // Resolve milestone title → number if needed
  let milestoneNumber: number | undefined;
  if (tpl.milestone !== undefined) {
    if (typeof tpl.milestone === 'number') {
      milestoneNumber = tpl.milestone;
    } else {
      // Look up by title
      const { data: milestones } = await octokit.issues.listMilestones({ owner, repo, per_page: 100 });
      const found = milestones.find((m) => m.title === tpl.milestone);
      if (found) {
        milestoneNumber = found.number;
      } else {
        logger.warn(`Milestone "${tpl.milestone}" not found in ${owner}/${repo} — skipping.`);
      }
    }
  }

  // Apply labels, assignees, milestone via the issues API
  if (
    (tpl.labels && tpl.labels.length > 0) ||
    (tpl.assignees && tpl.assignees.length > 0) ||
    milestoneNumber !== undefined
  ) {
    await withSpinner(
      'Applying labels, assignees, milestone…',
      () =>
        octokit.issues.update({
          owner,
          repo,
          issue_number: prNumber,
          ...(tpl.labels?.length ? { labels: tpl.labels } : {}),
          ...(tpl.assignees?.length ? { assignees: tpl.assignees } : {}),
          ...(milestoneNumber !== undefined ? { milestone: milestoneNumber } : {}),
        }),
      'Labels, assignees, milestone applied',
    );
  }

  // Request reviewers
  if (
    (tpl.reviewers && tpl.reviewers.length > 0) ||
    (tpl.teamReviewers && tpl.teamReviewers.length > 0)
  ) {
    await withSpinner(
      'Requesting reviewers…',
      () =>
        octokit.pulls.requestReviewers({
          owner,
          repo,
          pull_number: prNumber,
          ...(tpl.reviewers?.length ? { reviewers: tpl.reviewers } : {}),
          ...(tpl.teamReviewers?.length ? { team_reviewers: tpl.teamReviewers } : {}),
        }),
      'Reviewers requested',
    );
  }
}
