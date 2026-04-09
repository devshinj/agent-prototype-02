// src/core/analyzer/task-extractor.ts
import type { CommitRecord, DailyTask } from "@/core/types";

const AMBIGUOUS_PATTERNS = [
  /^(fix|update|wip|test|refactor|change|modify|edit|tmp|temp|misc|cleanup|clean)$/i,
  /^\.+$/,
  /^(minor|small|quick)\s*(changes?|fix(es)?|update)?$/i,
  /^[a-f0-9]{7,}$/i, // SHA만 있는 경우
];

export function isAmbiguousCommitMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 10) return true;
  return AMBIGUOUS_PATTERNS.some((p) => p.test(trimmed));
}

export function getAmbiguousCommits(commits: CommitRecord[]): CommitRecord[] {
  return commits.filter((c) => isAmbiguousCommitMessage(c.message));
}

export function buildFallbackTask(commits: CommitRecord[], project: string, date: string): DailyTask {
  const messages = commits.map((c) => `- ${c.message}`).join("\n");
  const filesList = [...new Set(commits.flatMap((c) => c.filesChanged))];
  const totalAdditions = commits.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = commits.reduce((sum, c) => sum + c.deletions, 0);

  return {
    title: `${project} 작업 (${commits.length}개 커밋)`,
    description: `커밋 내역:\n${messages}\n\n변경 파일: ${filesList.slice(0, 10).join(", ")}\n총 변경: +${totalAdditions}/-${totalDeletions}`,
    date,
    project,
    complexity: totalAdditions + totalDeletions > 200 ? "High" : totalAdditions + totalDeletions > 50 ? "Medium" : "Low",
    commitShas: commits.map((c) => c.sha),
  };
}
