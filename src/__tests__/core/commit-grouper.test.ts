// src/__tests__/core/commit-grouper.test.ts
import { describe, it, expect } from "vitest";
import { groupCommitsByDateAndProject } from "@/core/analyzer/commit-grouper";
import type { CommitRecord } from "@/core/types";

describe("groupCommitsByDateAndProject", () => {
  const commits: CommitRecord[] = [
    {
      sha: "a1", message: "feat: add login", author: "JAESEOK",
      date: "2026-04-09T10:00:00Z", repoOwner: "devshinj", repoName: "app-a",
      branch: "main", filesChanged: ["login.tsx"], additions: 50, deletions: 0,
    },
    {
      sha: "a2", message: "fix: auth bug", author: "JAESEOK",
      date: "2026-04-09T14:00:00Z", repoOwner: "devshinj", repoName: "app-a",
      branch: "main", filesChanged: ["auth.ts"], additions: 10, deletions: 3,
    },
    {
      sha: "b1", message: "docs: update readme", author: "JAESEOK",
      date: "2026-04-09T11:00:00Z", repoOwner: "devshinj", repoName: "app-b",
      branch: "main", filesChanged: ["README.md"], additions: 5, deletions: 2,
    },
    {
      sha: "a3", message: "refactor: cleanup", author: "JAESEOK",
      date: "2026-04-10T09:00:00Z", repoOwner: "devshinj", repoName: "app-a",
      branch: "main", filesChanged: ["utils.ts"], additions: 0, deletions: 20,
    },
  ];

  it("groups commits by date (YYYY-MM-DD) and project (repoName)", () => {
    const groups = groupCommitsByDateAndProject(commits);

    expect(groups).toHaveLength(3);

    const appA_apr9 = groups.find((g) => g.project === "app-a" && g.date === "2026-04-09");
    expect(appA_apr9).toBeDefined();
    expect(appA_apr9!.commits).toHaveLength(2);

    const appB_apr9 = groups.find((g) => g.project === "app-b" && g.date === "2026-04-09");
    expect(appB_apr9).toBeDefined();
    expect(appB_apr9!.commits).toHaveLength(1);

    const appA_apr10 = groups.find((g) => g.project === "app-a" && g.date === "2026-04-10");
    expect(appA_apr10).toBeDefined();
    expect(appA_apr10!.commits).toHaveLength(1);
  });
});
