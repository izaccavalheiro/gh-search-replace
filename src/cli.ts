#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import os from 'node:os';

import { loginCommand, logoutCommand, resolveToken } from './auth/index.js';
import { searchCode, printResults, selectResults } from './search/index.js';
import { cloneOrPull, hasSSHKey } from './git/cloneOrPull.js';
import { ensureFork, hasPushAccess } from './git/fork.js';
import { createAndCheckoutBranch, commitAndPush, getDefaultBranch } from './git/branch.js';
import { editFile } from './editor/index.js';
import { createPR, loadUserTemplate } from './pr/index.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('gh-search-replace')
  .description('Search GitHub code, edit files, and open Pull Requests from the terminal')
  .version('1.0.2');

// ── auth ──────────────────────────────────────────────────────────────────────

const auth = program.command('auth').description('Manage GitHub authentication');

auth
  .command('login')
  .description('Authenticate with GitHub via browser OAuth or PAT')
  .option('--token <PAT>', 'Provide a Personal Access Token directly (skips browser flow)')
  .option('--force', 'Force re-authentication even if a token is already stored')
  .action(async (opts: { token?: string; force?: boolean }) => {
    try {
      await loginCommand(opts);
    } catch (err) {
      handleError(err);
    }
  });

auth
  .command('logout')
  .description('Clear stored GitHub token')
  .action(() => {
    logoutCommand();
  });

// ── search ────────────────────────────────────────────────────────────────────

program
  .command('search <term>')
  .description('Search GitHub code and display results (no edits)')
  .option('--language <lang>', 'Filter by programming language')
  .option('--org <org>', 'Limit search to a specific organisation')
  .option('--repo <owner/repo>', 'Limit search to a single repository')
  .option('--max-results <n>', 'Maximum number of results to return', '20')
  .option('--token <PAT>', 'Override stored token for this run')
  .action(
    async (
      term: string,
      opts: { language?: string; org?: string; repo?: string; maxResults?: string; token?: string },
    ) => {
      try {
        const token = await resolveToken({ token: opts.token });
        const spinner = (await import('./utils/spinner.js')).createSpinner(`Searching for "${term}"…`);
        spinner.start();

        const results = await searchCode(token, term, {
          language: opts.language,
          org: opts.org,
          repo: opts.repo,
          maxResults: opts.maxResults ? parseInt(opts.maxResults, 10) : 20,
        });

        spinner.succeed(`Found ${results.length} result(s)`);
        printResults(results);
      } catch (err) {
        handleError(err);
      }
    },
  );

// ── run (full workflow) ───────────────────────────────────────────────────────

program
  .command('run <term>')
  .description('Full workflow: search → select → edit → branch → PR')
  .option('--language <lang>', 'Filter by programming language')
  .option('--org <org>', 'Limit search to a specific organisation')
  .option('--repo <owner/repo>', 'Limit search to a single repository')
  .option('--max-results <n>', 'Maximum number of results to return', '20')
  .option('--token <PAT>', 'Override stored token for this run')
  .option('--branch <name>', 'Branch name to use (defaults to a slug derived from the search term)')
  .option('--draft', 'Open Pull Request as draft', false)
  .option('-y, --yes', 'Non-interactive: auto-select all results, skip all prompts, do not open browser')
  .option('--replace <string>', 'Replacement string used with --yes (omit to delete matched lines)')
  .option('--template <path>', 'Path to a PR template file (.json, .yaml, or .yml)')
  .action(
    async (
      term: string,
      opts: {
        language?: string;
        org?: string;
        repo?: string;
        maxResults?: string;
        token?: string;
        branch?: string;
        draft: boolean;
        yes: boolean;
        replace?: string;
        template?: string;
      },
    ) => {
      try {
        logger.blank();
        console.log(chalk.bold.cyan('gh-search-replace') + chalk.gray(' — full workflow'));
        logger.line();

        // 1. Auth
        const token = await resolveToken({ token: opts.token });

        // Load PR template if provided
        const userTemplate = opts.template
          ? await loadUserTemplate(path.resolve(opts.template))
          : undefined;

        // 2. Search
        const { createSpinner } = await import('./utils/spinner.js');
        const searchSpinner = createSpinner(`Searching GitHub for "${term}"…`).start();
        const results = await searchCode(token, term, {
          language: opts.language,
          org: opts.org,
          repo: opts.repo,
          maxResults: opts.maxResults ? parseInt(opts.maxResults, 10) : 20,
        });
        searchSpinner.succeed(`Found ${results.length} result(s)`);

        if (results.length === 0) {
          logger.warn('No results found. Try a different search term or filters.');
          process.exit(0);
        }

        printResults(results);

        // 3. Select — auto-select all when --yes
        const selected = opts.yes
          ? results
          : await selectResults(results);

        if (selected.length === 0) {
          logger.warn('No results selected. Exiting.');
          process.exit(0);
        }

        if (opts.yes) {
          logger.info(`--yes: auto-selected all ${selected.length} result(s)`);
        }

        // Group by repository
        const byRepo = new Map<string, typeof selected>();
        for (const r of selected) {
          const key = r.repoFullName;
          if (!byRepo.has(key)) byRepo.set(key, []);
          byRepo.get(key)!.push(r);
        }

        const prUrls: string[] = [];
        const cacheBase = path.join(os.homedir(), '.cache', 'gh-search-replace');

        for (const [repoFullName, repoResults] of byRepo) {
          const [owner, repoName] = repoFullName.split('/');
          logger.blank();
          logger.line();
          console.log(chalk.bold(`Processing: ${chalk.cyan(repoFullName)}`));
          logger.line();

          // 4. Check push access; fork only if the user cannot push to the original repo
          const useSSH = hasSSHKey();
          const repoUrl = useSSH
            ? `git@github.com:${owner}/${repoName}.git`
            : `https://github.com/${owner}/${repoName}.git`;

          const canPush = await hasPushAccess(token, owner, repoName);

          let localPath: string;
          let prHeadPrefix: string;

          if (canPush) {
            logger.info(`Push access confirmed for ${repoFullName} — working directly on the repo`);
            localPath = await cloneOrPull(owner, repoName, {
              cloneUrl: repoUrl,
              label: repoFullName,
            });
            prHeadPrefix = '';
          } else {
            const fork = await ensureFork(token, owner, repoName, useSSH);
            localPath = await cloneOrPull(owner, repoName, {
              cloneUrl: fork.cloneUrl,
              upstreamUrl: repoUrl,
              label: `${fork.forkOwner}/${repoName} (fork of ${repoFullName})`,
            });
            prHeadPrefix = `${fork.forkOwner}:`;
          }

          // 5. Create branch
          const branchName = await createAndCheckoutBranch(localPath, term, opts.branch);

          // 6. Edit each file
          const editResults = [];
          for (const result of repoResults) {
            const absoluteFilePath = path.join(localPath, result.filePath);
            const editResult = await editFile(absoluteFilePath, term, {
              replacement: opts.yes ? (opts.replace ?? '') : undefined,
            });
            if (editResult) {
              editResults.push(editResult);
            }
          }

          if (editResults.length === 0) {
            logger.warn(`No edits made for ${repoFullName}. Skipping PR.`);
            continue;
          }

          // 7. Commit and push to the fork
          const filePaths = editResults.map((r) => r.filePath);
          await commitAndPush(localPath, filePaths, term, branchName);

          // 8. Open PR — cross-fork PRs use "forkOwner:branchName"; direct pushes use just "branchName"
          const baseBranch = await getDefaultBranch(localPath);
          const prUrl = await createPR({
            token,
            owner,
            repo: repoName,
            head: `${prHeadPrefix}${branchName}`,
            base: baseBranch,
            term,
            editResults,
            draft: opts.draft,
            localPath,
            yes: opts.yes,
            userTemplate,
          });

          prUrls.push(prUrl);
        }

        // Summary
        logger.blank();
        logger.line();
        logger.success(`Done! ${prUrls.length} PR(s) created.`);
        for (const url of prUrls) {
          console.log(`  ${chalk.cyan(url)}`);
        }
        logger.blank();
        logger.info(`Cloned repositories are stored in: ${cacheBase}`);
        logger.blank();
      } catch (err) {
        handleError(err);
      }
    },
  );

function handleError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(message);

  if (message.includes('token') || message.includes('auth') || message.includes('401')) {
    logger.info('Run `gh-search-replace auth login` to refresh your credentials.');
  }

  process.exit(1);
}

program.parseAsync(process.argv);
