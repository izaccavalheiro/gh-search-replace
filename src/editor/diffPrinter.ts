import chalk from 'chalk';

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  lineNumber: number;
  content: string;
}

export function buildDiff(
  originalLines: string[],
  modifiedLines: string[],
  changedLineNumbers: Set<number>,
  context = 3,
): DiffLine[] {
  const diff: DiffLine[] = [];
  const allChanged = [...changedLineNumbers].sort((a, b) => a - b);

  // Collect line ranges to show (changed ± context)
  const toShow = new Set<number>();
  for (const ln of allChanged) {
    for (let i = Math.max(0, ln - context - 1); i <= Math.min(originalLines.length - 1, ln + context - 1); i++) {
      toShow.add(i);
    }
  }

  for (const idx of [...toShow].sort((a, b) => a - b)) {
    const lineNum = idx + 1;
    if (changedLineNumbers.has(lineNum)) {
      if (originalLines[idx] !== undefined) {
        diff.push({ type: 'removed', lineNumber: lineNum, content: originalLines[idx] });
      }
      if (modifiedLines[idx] !== undefined) {
        diff.push({ type: 'added', lineNumber: lineNum, content: modifiedLines[idx] });
      }
    } else {
      /* v8 ignore next */
      diff.push({ type: 'context', lineNumber: lineNum, content: originalLines[idx] ?? '' });
    }
  }

  return diff;
}

export function printDiff(diff: DiffLine[]): void {
  console.log();
  for (const line of diff) {
    const num = String(line.lineNumber).padStart(4);
    if (line.type === 'added') {
      console.log(chalk.green(`+ ${num} | ${line.content}`));
    } else if (line.type === 'removed') {
      console.log(chalk.red(`- ${num} | ${line.content}`));
    } else {
      console.log(chalk.gray(`  ${num} | ${line.content}`));
    }
  }
  console.log();
}

export function printContextPreview(
  lines: string[],
  matchedLineNumbers: number[],
  term: string,
  context = 3,
): void {
  const toShow = new Set<number>();
  for (const ln of matchedLineNumbers) {
    for (let i = Math.max(1, ln - context); i <= Math.min(lines.length, ln + context); i++) {
      toShow.add(i);
    }
  }

  console.log();
  for (const ln of [...toShow].sort((a, b) => a - b)) {
    const lineStr = String(ln).padStart(4);
    /* v8 ignore next */
    const content = lines[ln - 1] ?? '';
    const isMatch = matchedLineNumbers.includes(ln);
    if (isMatch) {
      // Highlight the search term within the line
      const highlighted = content.replace(
        new RegExp(escapeRegex(term), 'g'),
        (m) => chalk.bgYellow.black(m),
      );
      console.log(chalk.bold(`> ${lineStr} | ${highlighted}`));
    } else {
      console.log(chalk.gray(`  ${lineStr} | ${content}`));
    }
  }
  console.log();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
