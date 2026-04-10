// src/app/api/repos/[id]/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getRepositoryByIdAndUser, updateLastSyncedSha, insertSyncLogForUser } from "@/infra/db/repository";
import { getCredentialByUserAndProvider } from "@/infra/db/credential";
import { pullRepository, getCommitsSince, getCommitDiff } from "@/infra/git/git-client";
import { groupCommitsByDateAndProject } from "@/core/analyzer/commit-grouper";
import { isAmbiguousCommitMessage } from "@/core/analyzer/task-extractor";
import { analyzeCommits, analyzeCommitWithDiff } from "@/infra/gemini/gemini-client";
import { auth } from "@/lib/auth";
import { getDb } from "@/infra/db/connection";
import type { CommitRecord } from "@/core/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  try {
    const repo = getRepositoryByIdAndUser(db, Number(id), session.user.id);
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }
    if (!repo.clone_path) {
      return NextResponse.json({ error: "Repository not yet cloned" }, { status: 400 });
    }

    // Git PAT 복호화
    const gitCred = getCredentialByUserAndProvider(db, session.user.id, "git");
    if (!gitCred) {
      return NextResponse.json({ error: "Git PAT not configured" }, { status: 400 });
    }

    // 1. git fetch
    await pullRepository(repo.clone_path);

    // 2. 새 커밋 수집
    const commits = await getCommitsSince(repo.clone_path, repo.branch, repo.clone_url, repo.last_synced_sha);
    if (commits.length === 0) {
      insertSyncLogForUser(db, {
        repositoryId: repo.id,
        userId: session.user.id,
        status: "success",
        commitsProcessed: 0,
        tasksCreated: 0,
        errorMessage: null,
      });
      return NextResponse.json({ message: "No new commits", commitsProcessed: 0, tasksCreated: 0 });
    }

    // 3. 모호한 커밋 보강
    const enrichedCommits: CommitRecord[] = [];
    for (const commit of commits) {
      if (isAmbiguousCommitMessage(commit.message)) {
        const diff = await getCommitDiff(repo.clone_path, commit.sha);
        const summary = await analyzeCommitWithDiff(commit, diff);
        enrichedCommits.push({ ...commit, message: summary });
      } else {
        enrichedCommits.push(commit);
      }
    }

    // 4. 그룹핑 + Gemini 분석
    const groups = groupCommitsByDateAndProject(enrichedCommits);
    let tasksCreated = 0;
    for (const group of groups) {
      const tasks = await analyzeCommits(group.commits, group.project, group.date);
      tasksCreated += tasks.length;
    }

    // 5. SHA 업데이트 + 로그
    updateLastSyncedSha(db, repo.id, commits[0].sha);
    insertSyncLogForUser(db, {
      repositoryId: repo.id,
      userId: session.user.id,
      status: "success",
      commitsProcessed: commits.length,
      tasksCreated,
      errorMessage: null,
    });

    return NextResponse.json({ message: "Sync complete", commitsProcessed: commits.length, tasksCreated });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    insertSyncLogForUser(db, {
      repositoryId: Number(id),
      userId: session.user.id,
      status: "error",
      commitsProcessed: 0,
      tasksCreated: 0,
      errorMessage: errorMsg,
    });
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
