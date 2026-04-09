---
name: notion-db-sync
description: Guides implementation of Notion API database synchronization — creating pages, querying for duplicates, updating existing records, and mapping internal data models to Notion property schemas. Use this skill whenever you are writing Notion API calls, building property mappers for CommitRecord or DailyTask types, implementing duplicate detection by SHA or date+project, setting up Notion database schemas, or troubleshooting Notion API errors. Also use when configuring Notion calendar or board views from code.
---

# Notion DB Sync

This skill guides building the Notion synchronization layer that writes commit logs and daily tasks to Notion databases. Uses `@notionhq/client` v5.

## Two-Database Design

This project uses two separate Notion databases:

### DB 1: Commit Log (raw data archive)

| Property | Notion Type | Maps From |
|----------|-------------|-----------|
| Title | title | `commit.message` (truncated to 100 chars) |
| Project | select | `commit.repoName` |
| Date | date | `commit.date` (ISO 8601) |
| Author | rich_text | `commit.author` |
| Commit SHA | rich_text | `commit.sha` (used as dedup key) |
| Files Changed | rich_text | `commit.filesChanged.join("\n")` (max 2000 chars) |
| Branch | select | `commit.branch` |

### DB 2: Daily Tasks (core DB, the one that matters)

| Property | Notion Type | Maps From |
|----------|-------------|-----------|
| 제목 | title | `task.title` |
| 작업 설명 | rich_text | `task.description` (max 2000 chars) |
| 작업일 | date | `task.date` (YYYY-MM-DD) |
| 프로젝트 | select | `task.project` |
| 작업 복잡도 | select | `task.complexity` (Low/Medium/High/Critical) |

Note: Daily Tasks uses Korean property names because it's user-facing in Notion. Commit Log uses English because it's a technical reference.

## Property Building Pattern

Notion's API requires a specific nested structure for each property type. Here's the exact pattern to follow:

```typescript
// title type
{ title: [{ text: { content: "value" } }] }

// rich_text type
{ rich_text: [{ text: { content: "value" } }] }

// select type
{ select: { name: "value" } }

// date type
{ date: { start: "2026-04-09" } }          // date only
{ date: { start: "2026-04-09T10:00:00Z" } } // datetime
```

Important: Notion rich_text has a 2000 character limit per block. Always truncate with `.slice(0, 2000)`.

## Duplicate Prevention

### For Commits: Check by SHA

Before creating a commit log page, query the database to see if that SHA already exists:

```typescript
const response = await notion.databases.query({
  database_id: COMMIT_DB_ID,
  filter: {
    property: "Commit SHA",
    rich_text: { equals: sha },
  },
});
const exists = response.results.length > 0;
```

### For Daily Tasks: Check by Project + Date

A daily task is unique by (project, date). If one already exists, update it instead of creating a duplicate:

```typescript
const response = await notion.databases.query({
  database_id: TASK_DB_ID,
  filter: {
    and: [
      { property: "프로젝트", select: { equals: project } },
      { property: "작업일", date: { equals: date } },
    ],
  },
});

if (response.results.length > 0) {
  // Update existing page
  await notion.pages.update({
    page_id: response.results[0].id,
    properties: buildDailyTaskProperties(task),
  });
} else {
  // Create new page
  await notion.pages.create({
    parent: { database_id: TASK_DB_ID },
    properties: buildDailyTaskProperties(task),
  });
}
```

## Creating Pages

```typescript
const notion = new Client({ auth: process.env.NOTION_API_KEY });

await notion.pages.create({
  parent: { database_id: process.env.NOTION_COMMIT_DB_ID! },
  properties: buildCommitLogProperties(commit) as any,
});
```

The `as any` cast is needed because TypeScript's strict typing for Notion properties is cumbersome. The property builder functions ensure correct structure at runtime.

## Notion Database Setup

The user needs to manually create two databases in Notion and share them with the integration. The database IDs go in `.env.local`:

```
NOTION_COMMIT_DB_ID=<32-char hex from database URL>
NOTION_TASK_DB_ID=<32-char hex from database URL>
```

To get the database ID: open the database as a full page in Notion, copy the URL, extract the 32-character hex string before the `?v=` parameter.

The integration must have "Insert content", "Update content", and "Read content" capabilities enabled.

## Notion Views for the User

Once data is in the Daily Tasks DB, the user sets up views in Notion:

- **Calendar View**: Group by 작업일 → shows tasks on a calendar
- **Board View**: Group by 프로젝트 → shows tasks as cards per project
- **Table View**: Default view with all properties visible

These views are configured in Notion's UI, not through the API.

## Error Handling

Notion API has rate limits (3 requests/second for the free tier). The sync pipeline should handle:

- **409 Conflict**: Page already exists — skip or update
- **429 Rate Limited**: Back off and retry after the `Retry-After` header value
- **400 Validation Error**: Usually means a property name doesn't match the database schema. Log the full error — the `message` field tells you exactly which property is wrong.

Don't add retry logic everywhere — handle it at the sync pipeline level in `polling-manager.ts` by catching errors per-repository and logging them to the sync_logs table.

## Testing

Test the property builder functions (`buildCommitLogProperties`, `buildDailyTaskProperties`) with unit tests — they're pure functions that take domain types and return Notion property objects. No mocking needed.

Don't unit test the actual API calls. Those are verified through E2E testing (register a repo → sync → check Notion).
