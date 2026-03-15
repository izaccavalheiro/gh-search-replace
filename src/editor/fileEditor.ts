import fs from 'node:fs';
import path from 'node:path';
import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { printContextPreview, buildDiff, printDiff } from './diffPrinter.js';
import { logger } from '../utils/logger.js';

export interface EditResult {
  filePath: string;
  changedLines: number[];
  originalContent: string;
  modifiedContent: string;
  replacement: string;
}

/**
 * Finds all line numbers (1-based) in the file that contain the search term.
 */
export function findMatchingLines(content: string, term: string): number[] {
  const lines = content.split('\n');
  const matched: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(term)) {
      matched.push(i + 1);
    }
  }
  return matched;
}

export interface EditFileOptions {
  /** When set, skips the interactive prompt and uses this value as the replacement. */
  replacement?: string;
}

/**
 * Edits a file by replacing occurrences of `term`.
 * When `opts.replacement` is provided the prompt is skipped (non-interactive / --yes mode).
 * Writes atomically via a .tmp file.
 */
export async function editFile(
  absoluteFilePath: string,
  term: string,
  opts: EditFileOptions = {},
): Promise<EditResult | null> {
  if (!fs.existsSync(absoluteFilePath)) {
    logger.error(`File not found: ${absoluteFilePath}`);
    return null;
  }

  const originalContent = fs.readFileSync(absoluteFilePath, 'utf-8');
  const lines = originalContent.split('\n');
  const matchedLines = findMatchingLines(originalContent, term);

  if (matchedLines.length === 0) {
    logger.warn(`No occurrences of "${term}" found in ${absoluteFilePath}`);
    return null;
  }

  logger.blank();
  logger.info(`Found ${matchedLines.length} match(es) on line(s): ${matchedLines.join(', ')}`);
  logger.info(`File: ${chalk.cyan(absoluteFilePath)}`);

  printContextPreview(lines, matchedLines, term);

  let replacement: string;
  if (opts.replacement !== undefined) {
    replacement = opts.replacement;
    logger.info(`Replacement (--replace): ${replacement === '' ? '(delete lines)' : chalk.green(replacement)}`);
  } else {
    replacement = await input({
      message: `Replace "${term}" with (leave empty to delete matched lines):`,
    });
  }

  // Apply edits
  const modifiedLines = lines.map((line, idx) => {
    const lineNum = idx + 1;
    if (!matchedLines.includes(lineNum)) return line;

    if (replacement === '') {
      return null; // mark for deletion
    }
    return line.replace(new RegExp(escapeRegex(term), 'g'), replacement);
  });

  const filteredLines = modifiedLines.filter((l): l is string => l !== null);
  const modifiedContent = filteredLines.join('\n');

  // Build and print diff
  const changedSet = new Set(matchedLines);
  const originalForDiff = originalContent.split('\n');
  const modifiedForDiff = modifiedContent.split('\n');
  const diff = buildDiff(originalForDiff, modifiedForDiff, changedSet);
  printDiff(diff);

  // Atomic write
  const tmpPath = `${absoluteFilePath}.tmp`;
  fs.writeFileSync(tmpPath, modifiedContent, 'utf-8');
  fs.renameSync(tmpPath, absoluteFilePath);

  logger.success(`Saved: ${absoluteFilePath}`);

  return {
    filePath: absoluteFilePath,
    changedLines: matchedLines,
    originalContent,
    modifiedContent,
    replacement,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
