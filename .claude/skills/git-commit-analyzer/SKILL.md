---
name: git-commit-analyzer
description: Guides implementation of Git commit collection, diff analysis, and AI-powered task extraction pipelines using GitHub REST API (Octokit) and Gemini. Use this skill whenever you are working on commit fetching logic, building commit-to-task analysis pipelines, writing Gemini prompts for code analysis, grouping commits by date/project, or handling ambiguous commit messages. Also use when implementing the CommitRecord/DailyTask types, the commit-grouper, task-extractor, or any code that transforms raw Git data into structured work logs.
---

# Git Commit Analyzer

This skill guides building a pipeline that collects Git commits via GitHub API, analyzes them with Gemini AI, and produces structured daily task records.

## Architecture Overview

The pipeline has 3 stages, each with clear input/output boundaries:

```
Stage 1: Collect          Stage 2: Analyze           Stage 3: Extract
GitHub API → CommitRecord → Gemini AI → JSON → DailyTask[]
```

- **Stage 1** lives in `src/infra/github/` — Octokit wrapper, pure I/O
- **Stage 2** lives in `src/infra/gemini/` — Gemini API wrapper, prompt construction
- **Stage 3** lives in `src/core/analyzer/` — pure functions, no external dependencies

## Core Types

Always use these exact types. They are defined in `src/core/types.ts` and shared across all layers.

```typescript
interface CommitRecord {
  sha: string;
  message: string;
  author: string;
  date: string;           // ISO 8601
  repoOwner: string;
  repoName: string;
  branch: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

interface DailyTask {
  title: string;           // Korean, one-line summary
  description: string;     // Korean, 2-3 sentences
  date: string;            // YYYY-MM-DD
  project: string;         // repo name
  complexity: "Low" | "Medium" | "High" | "Critical";
  commitShas: string[];
}
```

## Stage 1: Commit Collection (GitHub API)

Use `@octokit/rest` to fetch commits. Key patterns:

### Incremental Fetching

Only fetch commits newer than the last processed SHA. The `since` parameter on GitHub's commits API is time-based, so instead use `listCommits` and filter by SHA position:

```typescript
const { data: commits } = await octokit.rest.repos.listCommits({
  owner, repo, sha: branch, per_page: 100,
});
// Find the index of lastSyncedSha and take everything before it
const idx = commits.findIndex(c => c.sha === lastSyncedSha);
const newCommits = idx === -1 ? commits : commits.slice(0, idx);
```

### Getting File Details

The list endpoint doesn't include file details. Fetch each commit individually to get the `files` array:

```typescript
const { data } = await octokit.rest.repos.getCommit({ owner, repo, ref: sha });
// data.files contains { filename, additions, deletions, patch }
```

### Getting Diffs for Ambiguous Commits

When a commit message is ambiguous and Gemini needs to analyze the actual code change:

```typescript
const { data } = await octokit.rest.repos.getCommit({
  owner, repo, ref: sha,
  mediaType: { format: "diff" },
});
// Returns raw diff as string
```

## Stage 2: Gemini Analysis

Use `@google/genai` (NOT the deprecated `@google/generative-ai`).

### Prompt Design Principles

The prompt must:
1. Provide the full list of commits for a single date + project combination
2. Ask for JSON output with a strict schema
3. Request Korean language output
4. Include complexity estimation guidelines

### Ambiguity Detection

A commit message is "ambiguous" when it doesn't clearly describe what was done. Detect these before sending to Gemini:

```typescript
function isAmbiguous(message: string): boolean {
  if (message.trim().length < 10) return true;
  const patterns = [
    /^(fix|update|wip|test|refactor|change|modify)$/i,
    /^\.+$/,
    /^(minor|small|quick)\s*(changes?|fix)?$/i,
  ];
  return patterns.some(p => p.test(message.trim()));
}
```

For ambiguous commits: fetch the diff and ask Gemini to summarize the code change in one line. Replace the original message with this summary before grouping.

### Response Parsing

Gemini may wrap JSON in markdown code fences. Always strip them:

```typescript
let cleaned = response.trim();
if (cleaned.startsWith("```")) {
  cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
}
const parsed = JSON.parse(cleaned);
```

Validate that `complexity` is one of the four allowed values. Default to "Medium" if invalid.

## Stage 3: Commit Grouping and Task Extraction

This is pure logic in `src/core/` — no external API calls.

### Grouping Rule

Group commits by `(repoName, date)` tuple. Extract date as `YYYY-MM-DD` from the ISO timestamp:

```typescript
const date = commit.date.split("T")[0];
const key = `${commit.repoName}::${date}`;
```

One group = one Gemini analysis call = one or more DailyTask records.

### Complexity Estimation Guidelines (for Gemini prompt)

Include these in the Gemini prompt so it can estimate complexity:

- **Low**: < 50 lines changed, single file, straightforward change (typo, config update, simple addition)
- **Medium**: 50-200 lines, 2-5 files, feature addition or meaningful bugfix
- **High**: 200+ lines, 5+ files, architectural change, new subsystem, complex logic
- **Critical**: Core infrastructure change, security-related, database migration, breaking change

## Testing Strategy

- `core/analyzer/` tests are pure unit tests — no mocks needed, just pass data in and verify output
- `infra/github/` and `infra/gemini/` tests should test the data transformation functions (like `buildCommitRecords`, `parseAnalysisResponse`) with mock data, not the API calls themselves
- The pipeline integration is tested through `src/scheduler/polling-manager.ts`

## Common Mistakes to Avoid

1. Don't call Gemini for every individual commit — batch by date+project first
2. Don't forget to strip markdown code fences from Gemini responses
3. Don't use `@google/generative-ai` — it's deprecated since Nov 2025. Use `@google/genai`
4. Don't skip incremental fetching — always use lastSyncedSha to avoid reprocessing
5. The `files` array is only available from `getCommit`, not `listCommits` — fetch details separately
