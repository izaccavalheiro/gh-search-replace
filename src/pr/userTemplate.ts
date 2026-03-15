import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * User-supplied PR template. All fields are optional.
 * Supports placeholders in `title` and `description`:
 *   {term}        – the search term
 *   {replacement} – the replacement string
 *   {files_table} – a Markdown table of modified files
 *   {timestamp}   – ISO 8601 timestamp
 */
export interface UserPRTemplate {
  /** PR title. Supports placeholders. */
  title?: string;
  /**
   * PR description as a Markdown string. Supports placeholders.
   * Mutually exclusive with `descriptionFile`.
   */
  description?: string;
  /**
   * Path to a Markdown file to use as the PR description.
   * Resolved relative to the template file. Supports placeholders.
   * Mutually exclusive with `description`.
   */
  descriptionFile?: string;
  /** Label names to add to the PR. */
  labels?: string[];
  /** GitHub usernames to assign. */
  assignees?: string[];
  /** GitHub usernames to request as individual reviewers. */
  reviewers?: string[];
  /** GitHub team slugs to request as team reviewers. */
  teamReviewers?: string[];
  /**
   * Milestone to set. Accepts a milestone title (string) or number (int).
   * When a title is provided it is looked up by name; unmatched titles are warned and skipped.
   */
  milestone?: string | number;
  /**
   * GitHub Projects (v2) to add the PR to.
   * Currently not supported — listed here for forward-compatibility.
   */
  projects?: string[];
  /** Open as a draft PR (overrides the --draft flag when set). */
  draft?: boolean;
}

export interface TemplatePlaceholders {
  term: string;
  replacement: string;
  filesTable: string;
  timestamp: string;
}

/** Replace {placeholder} tokens in a string. */
export function applyPlaceholders(text: string, vars: TemplatePlaceholders): string {
  return text
    .replace(/\{term\}/g, vars.term)
    .replace(/\{replacement\}/g, vars.replacement)
    .replace(/\{files_table\}/g, vars.filesTable)
    .replace(/\{timestamp\}/g, vars.timestamp);
}

/**
 * Load and parse a PR template from a `.json`, `.yaml`, or `.yml` file.
 * `descriptionFile` paths are resolved relative to the template file's directory.
 */
export async function loadUserTemplate(templatePath: string): Promise<UserPRTemplate> {
  const ext = path.extname(templatePath).toLowerCase();
  const raw = readFileSync(templatePath, 'utf-8');

  let parsed: UserPRTemplate;

  if (ext === '.json') {
    parsed = JSON.parse(raw) as UserPRTemplate;
  } else if (ext === '.yaml' || ext === '.yml') {
    const { load } = await import('js-yaml');
    parsed = load(raw) as UserPRTemplate;
  } else {
    throw new Error(
      `Unsupported template file format: "${ext}". Use .json, .yaml, or .yml`,
    );
  }

  // Resolve descriptionFile relative to the template's own directory
  if (parsed.descriptionFile) {
    const descPath = path.resolve(path.dirname(templatePath), parsed.descriptionFile);
    parsed.description = readFileSync(descPath, 'utf-8');
    delete parsed.descriptionFile;
  }

  return parsed;
}
