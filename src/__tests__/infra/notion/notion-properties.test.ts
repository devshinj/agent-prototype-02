// src/__tests__/infra/notion/notion-properties.test.ts
import { describe, it, expect } from "vitest";
import { buildCommitLogProperties, buildDailyTaskProperties } from "@/infra/notion/notion-client";
import type { CommitRecord, DailyTask } from "@/core/types";

describe("buildCommitLogProperties", () => {
  it("should build correct properties from CommitRecord", () => {
    const commit: CommitRecord = {
      sha: "abc123",
      message: "feat: add login",
      author: "dev",
      date: "2026-04-09T10:00:00Z",
      repoOwner: "owner",
      repoName: "repo",
      branch: "main",
      filesChanged: ["src/auth.ts"],
      additions: 50,
      deletions: 10,
    };

    const props = buildCommitLogProperties(commit);
    expect(props.Title.title[0].text.content).toBe("feat: add login");
    expect(props.Project.select.name).toBe("repo");
    expect(props["Commit SHA"].rich_text[0].text.content).toBe("abc123");
  });
});

describe("buildDailyTaskProperties", () => {
  it("should build correct properties from DailyTask", () => {
    const task: DailyTask = {
      title: "로그인 기능 구현",
      description: "OAuth2 기반 로그인",
      date: "2026-04-09",
      project: "repo",
      complexity: "Medium",
      commitShas: ["abc123"],
    };

    const props = buildDailyTaskProperties(task);
    expect(props["제목"].title[0].text.content).toBe("로그인 기능 구현");
    expect(props["프로젝트"].select.name).toBe("repo");
  });
});
