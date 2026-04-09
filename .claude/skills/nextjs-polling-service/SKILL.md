---
name: nextjs-polling-service
description: Guides implementation of background polling services in Next.js App Router using node-cron and instrumentation.ts. Use this skill whenever you are setting up periodic background tasks, configuring the instrumentation hook for server startup initialization, managing polling state with SQLite, implementing manual sync triggers via API routes, or debugging issues where the scheduler doesn't start or stops unexpectedly. Also use when working on the sync pipeline orchestration in polling-manager.ts.
---

# Next.js Polling Service

This skill guides building a background polling service that runs inside a Next.js App Router application. It uses `node-cron` for scheduling and `instrumentation.ts` for startup initialization.

## How It Works

Next.js provides an `instrumentation.ts` hook that runs once when the server starts. We use this to initialize a `node-cron` scheduler that periodically executes the sync pipeline.

```
Server starts → instrumentation.ts register() → startScheduler() → cron job runs every N minutes
```

This only works on **serverful deployments** (Node.js process running continuously). It does NOT work on serverless platforms like Vercel.

## instrumentation.ts

This file goes in the project root (not inside `src/`). It must export a `register` function:

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/scheduler/polling-manager");
    startScheduler(15); // 15 minutes
  }
}
```

Key points:
- The `NEXT_RUNTIME === "nodejs"` check ensures the scheduler only starts on the Node.js runtime, not on the Edge runtime
- Use dynamic `import()` — static imports would fail on Edge runtime where `better-sqlite3` and `node-cron` aren't available
- The `register` function is called once per server start, not per request

### Next.js Configuration

Enable the instrumentation hook in `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  serverExternalPackages: ["better-sqlite3"],
};
```

`serverExternalPackages` tells Next.js not to bundle `better-sqlite3` — it's a native module that must be loaded at runtime.

## Polling Manager Pattern

The polling manager in `src/scheduler/polling-manager.ts` orchestrates the full sync pipeline. It has three responsibilities:

1. **Schedule management**: Start/stop the cron job, track state
2. **Pipeline orchestration**: Run the collect → analyze → sync stages in order
3. **Concurrency guard**: Prevent overlapping sync cycles

### Concurrency Guard

A sync cycle may take longer than the polling interval. Use a simple boolean flag:

```typescript
let isRunning = false;

async function runSyncCycle() {
  if (isRunning) {
    console.log("[Scheduler] Sync already in progress, skipping");
    return;
  }
  isRunning = true;
  try {
    // ... sync logic
  } finally {
    isRunning = false;
  }
}
```

### Pipeline Execution Order

For each active repository:

```
1. Fetch new commits since lastSyncedSha     (infra/github)
2. Write commit log pages to Notion           (infra/notion)
3. Enrich ambiguous commit messages with AI   (infra/gemini + infra/github for diff)
4. Group commits by date + project            (core/analyzer)
5. Analyze groups → generate DailyTask[]      (infra/gemini)
6. Write/update daily task pages in Notion    (infra/notion)
7. Update lastSyncedSha in SQLite             (infra/db)
8. Write sync log entry                       (infra/db)
```

If any step fails for a repository, catch the error, log it to sync_logs, and continue to the next repository. One repository's failure should not block others.

### State Tracking with SQLite

The `repositories` table in SQLite tracks:
- `last_synced_sha`: The most recent commit SHA that was successfully processed
- `is_active`: Whether polling is enabled for this repo
- `polling_interval_min`: Per-repo interval (default 15)

The `sync_logs` table records every sync attempt with status, counts, and error messages.

Use `better-sqlite3` (synchronous API) for all DB operations. The scheduler runs on a single thread, so synchronous access is fine and simpler than async alternatives.

## Manual Sync Trigger

The user can trigger a sync from the UI via `POST /api/sync`. This calls the same `runSyncCycle()` function:

```typescript
// src/app/api/sync/route.ts
import { runSyncCycle } from "@/scheduler/polling-manager";

export async function POST() {
  await runSyncCycle();
  return NextResponse.json({ message: "Sync completed" });
}
```

The concurrency guard ensures that if a manual trigger happens during a scheduled run, it waits or skips.

## Scheduler Status API

Expose scheduler state via `GET /api/cron`:

```typescript
export function getSchedulerStatus() {
  return {
    isRunning,
    lastRunAt,       // ISO timestamp of last completed cycle
    intervalMin: 15, // configured interval
  };
}
```

The dashboard UI polls this endpoint to show current scheduler status.

## Debugging Common Issues

### Scheduler doesn't start
- Check that `instrumentation.ts` is in the project root, not `src/`
- Verify `experimental.instrumentationHook: true` in `next.config.ts`
- Check console for `[Scheduler] Started with Xmin interval`
- In dev mode (`npm run dev`), the scheduler starts but may restart on code changes

### Scheduler stops after a while
- The Node.js process may have crashed. Check for unhandled promise rejections in the sync pipeline
- Every async operation in `runSyncCycle` must be wrapped in try/catch
- SQLite operations are synchronous and can't crash from unhandled promises

### Duplicate Notion pages
- The dedup check (query by SHA or project+date) may fail if Notion API is rate-limited
- Add a small delay between Notion API calls if hitting 429 errors
- The `isCommitAlreadySynced` check is the first line of defense

## Testing

- Unit test the pipeline orchestration logic by mocking the infra layer
- Integration test by running the full pipeline against a test repository
- The scheduler timing itself (cron expression) doesn't need testing — trust `node-cron`
