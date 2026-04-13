import { describe, it, expect } from "vitest";
import { normalizeGiteaRepo } from "@/infra/git-provider/gitea-api";

describe("normalizeGiteaRepo", () => {
  it("should normalize Gitea API response to RemoteRepository", () => {
    const apiRepo = {
      name: "my-repo",
      owner: { login: "dev-team" },
      full_name: "dev-team/my-repo",
      clone_url: "https://gitea.company.com/dev-team/my-repo.git",
      default_branch: "main",
      language: "Go",
      private: false,
      description: "Team project",
    };

    const result = normalizeGiteaRepo(apiRepo);

    expect(result).toEqual({
      name: "my-repo",
      owner: "dev-team",
      fullName: "dev-team/my-repo",
      cloneUrl: "https://gitea.company.com/dev-team/my-repo.git",
      defaultBranch: "main",
      language: "Go",
      isPrivate: false,
      description: "Team project",
    });
  });

  it("should handle empty string language as null", () => {
    const apiRepo = {
      name: "bare",
      owner: { login: "user" },
      full_name: "user/bare",
      clone_url: "https://gitea.company.com/user/bare.git",
      default_branch: "master",
      language: "",
      private: true,
      description: "",
    };

    const result = normalizeGiteaRepo(apiRepo);

    expect(result.language).toBeNull();
    expect(result.description).toBe("");
  });
});
