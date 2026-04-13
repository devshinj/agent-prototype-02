import { describe, it, expect } from "vitest";
import { normalizeGitHubRepo } from "@/infra/git-provider/github-api";

describe("normalizeGitHubRepo", () => {
  it("should normalize GitHub API response to RemoteRepository", () => {
    const apiRepo = {
      name: "my-repo",
      owner: { login: "octocat" },
      full_name: "octocat/my-repo",
      clone_url: "https://github.com/octocat/my-repo.git",
      default_branch: "main",
      language: "TypeScript",
      private: false,
      description: "A test repo",
    };

    const result = normalizeGitHubRepo(apiRepo);

    expect(result).toEqual({
      name: "my-repo",
      owner: "octocat",
      fullName: "octocat/my-repo",
      cloneUrl: "https://github.com/octocat/my-repo.git",
      defaultBranch: "main",
      language: "TypeScript",
      isPrivate: false,
      description: "A test repo",
    });
  });

  it("should handle null language and description", () => {
    const apiRepo = {
      name: "bare-repo",
      owner: { login: "user" },
      full_name: "user/bare-repo",
      clone_url: "https://github.com/user/bare-repo.git",
      default_branch: "master",
      language: null,
      private: true,
      description: null,
    };

    const result = normalizeGitHubRepo(apiRepo);

    expect(result.language).toBeNull();
    expect(result.description).toBeNull();
    expect(result.isPrivate).toBe(true);
  });
});
