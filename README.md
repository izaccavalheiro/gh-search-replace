# gh-search-replace

A production-grade CLI tool that searches GitHub code, edits matched files, and opens Pull Requests — all from your terminal.

## Features

- **GitHub OAuth Device Flow** — authenticate via browser in seconds
- **Code Search** — full GitHub Code Search API with language, org, and repo filters
- **Interactive selection** — checkbox UI to pick exactly which results to act on
- **Surgical edits** — replace only matched content; preview context + unified diff before saving; empty replacement deletes matched lines
- **Smart fork/direct-push workflow** — if you have push access to the target repo, works directly on it; otherwise automatically forks (or reuses an existing fork) and opens cross-fork PRs
- **Duplicate PR detection** — computes a stateless SHA-256 fingerprint from the search term, replacement, and changed files; embeds it as an invisible HTML comment in the PR body and searches for it before creating a new PR, so re-runs never open duplicates
- **Open in browser** — after creating (or finding) a PR, prompts you to open it in the default browser
- **Custom branch name** — `--branch` overrides the auto-generated branch slug
- **Non-interactive mode** — `-y/--yes` auto-selects all results; `--replace` supplies the replacement string for fully scripted runs
- **SSH / HTTPS auto-detection** — prefers SSH if `~/.ssh/id_*` is present, falls back to HTTPS
- **Rate limit handling** — automatic retries with back-off on GitHub API rate limits
- **Smart caching** — repos cloned to `~/.cache/gh-search-replace/` and updated on subsequent runs

## Requirements

- Node.js ≥ 20
- A GitHub account and (optionally) a registered [OAuth App](https://github.com/settings/developers)

## Installation

```bash
# From source
git clone https://github.com/your-org/gh-search-replace.git
cd gh-search-replace
npm install
npm run build
npm link
```

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | No* | Personal Access Token (skips OAuth flow) |
| `GITHUB_CLIENT_ID` | Yes* | OAuth App client ID (required for Device Flow) |

\* Either `GITHUB_TOKEN` or `GITHUB_CLIENT_ID` must be set.

## Usage

### Authenticate

```bash
# Browser OAuth Device Flow (requires GITHUB_CLIENT_ID)
gh-search-replace auth login

# Supply a PAT directly
gh-search-replace auth login --token ghp_xxxxxxxxxxxx

# Re-authenticate (discard stored token)
gh-search-replace auth login --force

# Log out
gh-search-replace auth logout
```

### Search only

```bash
# Basic search
gh-search-replace search "deprecated-api"

# With filters
gh-search-replace search "TODO" --language typescript --org my-org --max-results 10
```

### Full workflow (search → edit → PR)

```bash
# Search, pick results interactively, edit, commit, push, open PR
gh-search-replace run "old-function-name"

# Filter to a specific repo and open as draft PR
gh-search-replace run "config.apiKey" --repo my-org/backend --draft

# Use a custom branch name
gh-search-replace run "old-function-name" --branch fix/rename-old-function

# Limit language and org
gh-search-replace run "legacyAuth" --language go --org my-company

# Non-interactive: auto-select all results, replace without prompts
gh-search-replace run "old-api-url" --yes --replace "new-api-url"

# Non-interactive: delete all matched lines
gh-search-replace run "debugLog(" --yes --replace ""

# Override stored token for a single run
gh-search-replace run "term" --token ghp_xxxxxxxxxxxx
```

## Real-world use cases

### Dependency upgrades across an organization

Bump a deprecated import path to its new package name across every repo in your org — one command, one PR per repo.

```bash
# Rename a moved Go package across all repos in your org
gh-search-replace run "github.com/old-org/pkg/v1" \
  --replace "github.com/new-org/pkg/v2" \
  --language go --org my-company --yes

# Migrate from a deprecated Node.js package to its successor
gh-search-replace run "require('request')" \
  --replace "require('got')" \
  --language javascript --org my-company --yes

# Update a pinned Docker base image digest in all Dockerfiles
gh-search-replace run "node:18.12.0-alpine" \
  --replace "node:20.11.0-alpine" --yes
```

### Rotating leaked or expiring secrets and API URLs

If a base URL, endpoint, or non-secret config string needs to change across dozens of repos, automate the sweep instead of filing tickets.

```bash
# Replace a retired internal API endpoint
gh-search-replace run "https://api-v1.internal.example.com" \
  --replace "https://api-v2.internal.example.com" \
  --org my-company --yes

# Rotate a hardcoded staging bucket name
gh-search-replace run "s3://my-company-staging-old" \
  --replace "s3://my-company-staging-new" \
  --org my-company --yes
```

### Security remediation — removing obfuscated strings used by malware

Threat researchers and incident responders can use `gh-search-replace` to scan an organization's repos for known IOCs (indicators of compromise) — hardcoded C2 domains, encoded payload strings, or known backdoor function signatures — and either delete or replace them in bulk.

```bash
# Search for a known malicious domain that was embedded as a hardcoded string
gh-search-replace search "evil-c2.example.com" --org my-company

# Remove lines containing a known obfuscated payload marker (empty replacement deletes the line)
gh-search-replace run "eval(base64_decode(" \
  --replace "" --language php --org my-company --yes

# Replace a typosquatted package name with the legitimate one
gh-search-replace run "from colourama import" \
  --replace "from colorama import" \
  --language python --org my-company --yes

# Find and neutralize a hardcoded backdoor URL left by a supply-chain compromise
gh-search-replace run "https://update.malicious-cdn.net/payload" \
  --replace "" --org my-company --yes
```

> **Note:** This tool performs search-and-replace at the source level. For full incident response, complement it with a proper forensic review — a string replacement alone does not guarantee a clean bill of health.

### Enforcing code style or API standards at scale

```bash
# Replace a banned logging call with the approved internal logger
gh-search-replace run "console.log(" \
  --replace "logger.debug(" \
  --language typescript --org my-company

# Rename a renamed internal SDK method across all consumers
gh-search-replace run "client.sendRequest(" \
  --replace "client.dispatch(" \
  --org my-company --yes

# Remove leftover debug flags before a release freeze
gh-search-replace run "DEBUG=true" \
  --replace "DEBUG=false" \
  --org my-company --yes
```

### License and copyright header updates

```bash
# Update a year in copyright headers across all repos
gh-search-replace run "Copyright 2023 Acme Corp" \
  --replace "Copyright 2024 Acme Corp" \
  --org my-company --yes
```

## Project structure

```
gh-search-replace/
├── src/
│   ├── cli.ts                      — Commander entry point
│   ├── auth/
│   │   ├── deviceFlow.ts           — GitHub OAuth Device Flow implementation
│   │   ├── tokenStore.ts           — token persistence (read/write/delete)
│   │   └── index.ts                — auth module exports
│   ├── search/
│   │   ├── githubSearch.ts         — GitHub Code Search API client
│   │   ├── resultSelector.ts       — interactive checkbox UI for result selection
│   │   └── index.ts                — search module exports
│   ├── git/
│   │   ├── cloneOrPull.ts          — clone or update a local mirror; SSH/HTTPS detection
│   │   ├── fork.ts                 — auto-fork repos via Octokit; reuse existing forks
│   │   ├── branch.ts               — branch creation, commit, push, default-branch lookup
│   │   └── index.ts                — git module exports
│   ├── editor/
│   │   ├── fileEditor.ts           — file editing with atomic write via .tmp rename
│   │   ├── diffPrinter.ts          — unified diff preview
│   │   └── index.ts                — editor module exports
│   ├── pr/
│   │   ├── createPR.ts             — PR creation with duplicate detection
│   │   ├── fingerprint.ts          — SHA-256 fingerprint generation and extraction
│   │   ├── prTemplate.ts           — auto-generated PR title and body
│   │   ├── userTemplate.ts         — user-supplied PR template (YAML) loading
│   │   └── index.ts                — pr module exports
│   └── utils/
│       ├── logger.ts               — structured logger
│       ├── spinner.ts              — CLI spinner wrapper
│       └── slugify.ts              — string → URL-safe slug
├── tests/
│   ├── auth.test.ts
│   ├── editor.test.ts
│   ├── pr.test.ts
│   └── search.test.ts
├── examples/
│   ├── pr-template-minimal.yaml
│   ├── pr-template-full.yaml
│   ├── pr-template-dependency-upgrade.yaml
│   ├── pr-template-deprecation.yaml
│   └── pr-template-security-fix.yaml
├── .env.example
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

## Development

```bash
npm run dev -- run "search term"   # run without building
npm run build                       # compile TypeScript → dist/
npm test                            # run vitest suite
```

## How it works

1. **Auth** — token resolved from `--token` flag → `GITHUB_TOKEN` env → stored config → Device Flow.
2. **Search** — calls `GET /search/code` with `Accept: application/vnd.github.text-match+json`; retries automatically on rate limits.
3. **Select** — interactive checkbox UI (skipped with `--yes`).
4. **Fork or direct push** — checks push access via `GET /repos/{owner}/{repo}`. If the authenticated user has write access, works directly on the repo. Otherwise calls `POST /repos/{owner}/{repo}/forks` (reuses an existing fork if one already exists) and opens a cross-fork PR.
5. **Clone** — clones the repo (or fork); prefers SSH (`git@github.com`) if `~/.ssh/id_*` exists, falls back to HTTPS. Subsequent runs `git pull` instead of re-cloning.
6. **Edit** — finds lines containing the term, shows a 3-line context preview, prompts for replacement (or uses `--replace`), writes atomically via `.tmp` rename. Empty replacement deletes matched lines.
7. **Branch** — `gh-search-replace/<slug>/<timestamp>`; appends a random suffix if it already exists remotely.
8. **PR** — before creating, searches open PRs for an embedded fingerprint (`gh-sr-fp:<sha256>`) to skip duplicates. Opens a new PR via Octokit `pulls.create` with an auto-generated title and markdown body. Prompts to open the URL in the browser (skipped with `--yes`).

## Cache

All cloned repositories are stored under `~/.cache/gh-search-replace/<owner>/<repo>/` and are never automatically deleted. The path is printed at the end of each `run` invocation.

## License

MIT
