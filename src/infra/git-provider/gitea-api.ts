import type { RemoteRepository } from "@/core/types";

export function normalizeGiteaRepo(apiRepo: any): RemoteRepository {
  return {
    name: apiRepo.name,
    owner: apiRepo.owner.login,
    fullName: apiRepo.full_name,
    cloneUrl: apiRepo.clone_url,
    defaultBranch: apiRepo.default_branch,
    language: apiRepo.language || null,
    isPrivate: apiRepo.private,
    description: apiRepo.description ?? null,
  };
}

export async function listGiteaRepos(apiBase: string, token: string): Promise<RemoteRepository[]> {
  const repos: RemoteRepository[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(`${apiBase}/user/repos?page=${page}&limit=50&sort=updated`, {
      headers: { Authorization: `token ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Gitea API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    repos.push(...data.map(normalizeGiteaRepo));
    if (data.length < 50) break;
    page++;
  }

  return repos;
}
