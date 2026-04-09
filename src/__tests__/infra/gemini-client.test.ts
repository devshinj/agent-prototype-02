// src/__tests__/infra/gemini-client.test.ts
import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt, parseAnalysisResponse } from "@/infra/gemini/gemini-client";
import type { CommitRecord } from "@/core/types";

const sampleCommits: CommitRecord[] = [
  {
    sha: "abc123",
    message: "feat: add user login page",
    author: "JAESEOK",
    date: "2026-04-09T10:00:00Z",
    repoOwner: "devshinj",
    repoName: "my-app",
    branch: "main",
    filesChanged: ["src/app/login/page.tsx", "src/lib/auth.ts"],
    additions: 70,
    deletions: 5,
  },
  {
    sha: "def456",
    message: "fix: resolve auth redirect bug",
    author: "JAESEOK",
    date: "2026-04-09T14:00:00Z",
    repoOwner: "devshinj",
    repoName: "my-app",
    branch: "main",
    filesChanged: ["src/lib/auth.ts"],
    additions: 10,
    deletions: 3,
  },
];

describe("buildAnalysisPrompt", () => {
  it("builds a structured prompt for Gemini", () => {
    const prompt = buildAnalysisPrompt(sampleCommits, "my-app", "2026-04-09");
    expect(prompt).toContain("my-app");
    expect(prompt).toContain("2026-04-09");
    expect(prompt).toContain("feat: add user login page");
    expect(prompt).toContain("fix: resolve auth redirect bug");
    expect(prompt).toContain("JSON");
  });
});

describe("parseAnalysisResponse", () => {
  it("parses valid Gemini JSON response", () => {
    const response = JSON.stringify({
      tasks: [
        {
          title: "사용자 인증 시스템 구현",
          description: "로그인 페이지를 추가하고 인증 리다이렉트 버그를 수정함",
          complexity: "Medium",
        },
      ],
    });

    const tasks = parseAnalysisResponse(response, "my-app", "2026-04-09", ["abc123", "def456"]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("사용자 인증 시스템 구현");
    expect(tasks[0].project).toBe("my-app");
    expect(tasks[0].date).toBe("2026-04-09");
    expect(tasks[0].complexity).toBe("Medium");
    expect(tasks[0].commitShas).toEqual(["abc123", "def456"]);
  });

  it("handles response with markdown code fences", () => {
    const response = '```json\n{"tasks":[{"title":"테스트","description":"설명","complexity":"Low"}]}\n```';
    const tasks = parseAnalysisResponse(response, "my-app", "2026-04-09", ["abc123"]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("테스트");
  });
});
