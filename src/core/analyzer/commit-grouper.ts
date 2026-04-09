// src/core/analyzer/commit-grouper.ts
import type { CommitRecord } from "@/core/types";

export interface CommitGroup {
  project: string;
  date: string; // YYYY-MM-DD
  commits: CommitRecord[];
}

export function groupCommitsByDateAndProject(commits: CommitRecord[]): CommitGroup[] {
  const groupMap = new Map<string, CommitGroup>();

  for (const commit of commits) {
    const date = commit.date.split("T")[0]; // ISO → YYYY-MM-DD
    const key = `${commit.repoName}::${date}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, { project: commit.repoName, date, commits: [] });
    }
    groupMap.get(key)!.commits.push(commit);
  }

  return Array.from(groupMap.values());
}
