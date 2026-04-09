// src/scheduler/polling-manager.ts
import cron, { type ScheduledTask } from "node-cron";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables } from "@/infra/db/schema";
import { getActiveRepositories, updateLastSyncedSha, insertSyncLog } from "@/infra/db/repository";
import { fetchCommitsSince } from "@/infra/github/github-client";
import { analyzeCommits, analyzeCommitWithDiff } from "@/infra/gemini/gemini-client";
import { fetchCommitDiff } from "@/infra/github/github-client";
import { createCommitLogPage, createDailyTaskPage, isCommitAlreadySynced, isDailyTaskExists, updateDailyTaskPage } from "@/infra/notion/notion-client";
import { groupCommitsByDateAndProject } from "@/core/analyzer/commit-grouper";
import { isAmbiguousCommitMessage } from "@/core/analyzer/task-extractor";
import type { CommitRecord } from "@/core/types";

let db: Database.Database | null = null;
let cronTask: ScheduledTask | null = null;
let isRunning = false;
let lastRunAt: string | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(join(process.cwd(), "data", "tracker.db"));
    createTables(db);
  }
  return db;
}

export function getSchedulerStatus() {
  return {
    isRunning,
    lastRunAt,
    nextRunAt: cronTask ? null : null, // node-cron doesn't expose next run
    intervalMin: 15,
  };
}

async function enrichAmbiguousCommits(commits: CommitRecord[]): Promise<CommitRecord[]> {
  const enriched: CommitRecord[] = [];
  for (const commit of commits) {
    if (isAmbiguousCommitMessage(commit.message)) {
      const diff = await fetchCommitDiff(commit.repoOwner, commit.repoName, commit.sha);
      const summary = await analyzeCommitWithDiff(commit, diff);
      enriched.push({ ...commit, message: summary });
    } else {
      enriched.push(commit);
    }
  }
  return enriched;
}

export async function runSyncCycle(): Promise<void> {
  if (isRunning) {
    console.log("[Scheduler] Sync already in progress, skipping");
    return;
  }

  isRunning = true;
  const database = getDb();

  try {
    const repos = getActiveRepositories(database);

    for (const repo of repos) {
      try {
        // 1. 새 커밋 수집
        const commits = await fetchCommitsSince(repo.owner, repo.repo, repo.branch, repo.last_synced_sha);

        if (commits.length === 0) {
          console.log(`[Scheduler] ${repo.owner}/${repo.repo}: no new commits`);
          continue;
        }

        console.log(`[Scheduler] ${repo.owner}/${repo.repo}: found ${commits.length} new commits`);

        // 2. 커밋 로그 Notion DB 동기화
        for (const commit of commits) {
          const alreadySynced = await isCommitAlreadySynced(commit.sha);
          if (!alreadySynced) {
            await createCommitLogPage(commit);
          }
        }

        // 3. 모호한 커밋 메시지 보강 (Gemini diff 분석)
        const enrichedCommits = await enrichAmbiguousCommits(commits);

        // 4. 날짜/프로젝트별 그룹핑
        const groups = groupCommitsByDateAndProject(enrichedCommits);

        // 5. 각 그룹에 대해 Gemini 분석 → 일일 태스크 생성
        let tasksCreated = 0;
        for (const group of groups) {
          const tasks = await analyzeCommits(group.commits, group.project, group.date);

          for (const task of tasks) {
            const existingPageId = await isDailyTaskExists(task.project, task.date);
            if (existingPageId) {
              await updateDailyTaskPage(existingPageId, task);
            } else {
              await createDailyTaskPage(task);
              tasksCreated++;
            }
          }
        }

        // 6. 마지막 SHA 업데이트
        updateLastSyncedSha(database, repo.id, commits[0].sha);

        // 7. 성공 로그
        insertSyncLog(database, {
          repositoryId: repo.id,
          status: "success",
          commitsProcessed: commits.length,
          tasksCreated,
          errorMessage: null,
        });

        console.log(`[Scheduler] ${repo.owner}/${repo.repo}: synced ${commits.length} commits, created ${tasksCreated} tasks`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        insertSyncLog(database, {
          repositoryId: repo.id,
          status: "error",
          commitsProcessed: 0,
          tasksCreated: 0,
          errorMessage: errorMsg,
        });
        console.error(`[Scheduler] ${repo.owner}/${repo.repo}: sync failed -`, errorMsg);
      }
    }

    lastRunAt = new Date().toISOString();
  } finally {
    isRunning = false;
  }
}

export function startScheduler(intervalMin: number = 15): void {
  if (cronTask) {
    console.log("[Scheduler] Already running");
    return;
  }

  // 즉시 한번 실행
  runSyncCycle().catch(console.error);

  // 주기적 실행
  cronTask = cron.schedule(`*/${intervalMin} * * * *`, () => {
    runSyncCycle().catch(console.error);
  });

  console.log(`[Scheduler] Started with ${intervalMin}min interval`);
}

export function stopScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log("[Scheduler] Stopped");
  }
}
