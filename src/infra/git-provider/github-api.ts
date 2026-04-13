import { Octokit } from "@octokit/rest";
import type { RemoteRepository } from "@/core/types";

export function normalizeGitHubRepo(apiRepo: any): RemoteRepository {
  return {
    name: apiRepo.name,
    owner: apiRepo.owner.login,
    fullName: apiRepo.full_name,
    cloneUrl: apiRepo.clone_url,
    defaultBranch: apiRepo.default_branch,
    language: apiRepo.language ?? null,
    isPrivate: apiRepo.private,
    description: apiRepo.description ?? null,
  };
}

export async function listGitHubRepos(token: string): Promise<RemoteRepository[]> {
  const client = new Octokit({ auth: token });
  const repos: RemoteRepository[] = [];
  let page = 1;

  while (true) {
    const { data } = await client.rest.repos.listForAuthenticatedUser({
      visibility: "all",
      affiliation: "owner,collaborator,organization_member",
      sort: "updated",
      per_page: 100,
      page,
    });

    if (data.length === 0) break;
    repos.push(...data.map(normalizeGitHubRepo));
    if (data.length < 100) break;
    page++;
  }

  return repos;
}
