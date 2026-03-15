export interface PRTemplateData {
  term: string;
  files: { path: string; lines: number[] }[];
  originalContent: string;
  replacement: string;
  timestamp: string;
  /** Stateless fingerprint to embed as an invisible HTML comment */
  fingerprint?: string;
}

export function generatePRBody(data: PRTemplateData): string {
  const fileTable = data.files
    .map((f) => `| \`${f.path}\` | ${f.lines.join(', ')} |`)
    .join('\n');

  const replacementText =
    data.replacement === ''
      ? '*(line removed)*'
      : `\`${data.replacement}\``;

  const fingerprintLine = data.fingerprint
    ? `\n<!-- gh-sr-fp:${data.fingerprint} -->`
    : '';

  return `## Summary

This PR was generated automatically by \`gh-search-replace\`.

### Search term
\`${data.term}\`

### Files modified
| File | Lines changed |
|---|---|
${fileTable}

### Replacement
- **From:** \`${data.term}\`
- **To:** ${replacementText}

---
*Generated on ${data.timestamp} by [gh-search-replace](https://github.com/your-org/gh-search-replace)*
${fingerprintLine}`;
}

export function generatePRTitle(term: string): string {
  return `fix: replace "${term}" occurrences`;
}
