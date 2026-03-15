import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import type { SearchResult } from './githubSearch.js';
import { logger } from '../utils/logger.js';

export function printResults(results: SearchResult[]): void {
  logger.blank();
  logger.line();
  console.log(
    chalk.bold(
      `  ${'#'.padEnd(4)} ${'Repository'.padEnd(35)} ${'File path'.padEnd(45)} ${'Snippet'}`,
    ),
  );
  logger.line();

  for (const r of results) {
    const idx = String(r.index).padEnd(4);
    const repo = r.repoFullName.slice(0, 33).padEnd(35);
    const file = r.filePath.slice(0, 43).padEnd(45);
    const snippet =
      r.textMatches[0]?.fragment
        ?.split('\n')
        .find((l) => l.trim())
        ?.trim()
        .slice(0, 60) ?? '';

    console.log(`  ${chalk.cyan(idx)} ${chalk.white(repo)} ${chalk.gray(file)} ${chalk.yellow(snippet)}`);
  }

  logger.line();
  logger.blank();
}

export async function selectResults(results: SearchResult[]): Promise<SearchResult[]> {
  if (results.length === 0) {
    logger.warn('No results to select from.');
    return [];
  }

  const choices = results.map((r) => ({
    name: `${chalk.cyan(`[${r.index}]`)} ${chalk.white(r.repoFullName)} — ${chalk.gray(r.filePath)}`,
    value: r,
    short: `${r.repoFullName}:${r.filePath}`,
  }));

  const selected = await checkbox({
    message: 'Select results to edit (space to select, enter to confirm):',
    choices,
    pageSize: 15,
    validate: (items) => (items.length > 0 ? true : 'Select at least one result.'),
  });

  return selected;
}
