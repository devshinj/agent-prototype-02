// src/__tests__/core/task-extractor.test.ts
import { describe, it, expect } from "vitest";
import { isAmbiguousCommitMessage } from "@/core/analyzer/task-extractor";

describe("isAmbiguousCommitMessage", () => {
  it("detects ambiguous messages", () => {
    expect(isAmbiguousCommitMessage("fix")).toBe(true);
    expect(isAmbiguousCommitMessage("update")).toBe(true);
    expect(isAmbiguousCommitMessage("wip")).toBe(true);
    expect(isAmbiguousCommitMessage("test")).toBe(true);
    expect(isAmbiguousCommitMessage(".")).toBe(true);
    expect(isAmbiguousCommitMessage("minor changes")).toBe(true);
  });

  it("recognizes clear messages", () => {
    expect(isAmbiguousCommitMessage("feat: add user authentication with OAuth2")).toBe(false);
    expect(isAmbiguousCommitMessage("fix: resolve null pointer in login handler")).toBe(false);
    expect(isAmbiguousCommitMessage("refactor: extract database connection pool to separate module")).toBe(false);
  });
});
