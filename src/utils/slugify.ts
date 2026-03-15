/**
 * Sanitises a string for use as a Git branch name segment.
 * Replaces non-alphanumeric characters with hyphens, collapses runs, trims edges.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Generates a branch name for a search-replace operation.
 * Format: gh-search-replace/<slug>/<YYYYMMDD-HHmmss>
 */
export function generateBranchName(term: string): string {
  const slug = slugify(term);
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `gh-search-replace/${slug}/${ts}`;
}
