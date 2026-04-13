// src/infra/git/parse-git-url.ts

interface ParsedGitUrl {
  host: string;
  owner: string;
  repo: string;
}

export function parseGitUrl(url: string): ParsedGitUrl {
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    throw new Error("Only HTTP(S) Git URLs are supported");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid Git URL: ${url}`);
  }

  const pathParts = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
  if (pathParts.length < 2) {
    throw new Error(`Invalid Git URL path: ${url}`);
  }

  const repo = pathParts[pathParts.length - 1];
  const owner = pathParts.slice(0, -1).join("/");

  return { host: parsed.host, owner, repo };
}

export function buildAuthenticatedUrl(cloneUrl: string, token: string): string {
  const url = new URL(cloneUrl);

  if (url.host === "github.com") {
    // GitHub: 토큰을 username에 넣는 방식
    url.username = token;
    url.password = "";
    return url.toString().replace(/:@/, "@");
  }

  // Gitea/GitLab 등 self-hosted: Basic Auth (username:password) 형식
  url.username = "oauth2";
  url.password = token;
  return url.toString();
}
