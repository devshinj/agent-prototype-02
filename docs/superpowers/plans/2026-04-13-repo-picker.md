# PAT 기반 저장소 선택 등록 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등록된 PAT로 GitHub/Gitea 저장소 목록을 조회하고 선택 등록할 수 있도록 개선

**Architecture:** credential에 호스트 메타데이터를 추가하고, 플랫폼별 API 클라이언트(GitHub: Octokit, Gitea: fetch)를 infra 레이어에 분리 구현한다. 저장소 등록 UI는 탭 구조로 변경하여 "저장소 선택" + "URL 직접 입력"을 제공한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, @octokit/rest, shadcn/ui (Tabs, Select, Checkbox), Vitest

**Spec:** `docs/superpowers/specs/2026-04-13-repo-picker-design.md`

---

### Task 1: RemoteRepository 타입 정의

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: RemoteRepository 타입 추가**

`src/core/types.ts` 파일 끝에 추가:

```typescript
/** Git 호스팅 서비스에서 조회한 원격 저장소 정보 */
export interface RemoteRepository {
  name: string;
  owner: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  language: string | null;
  isPrivate: boolean;
  description: string | null;
}

/** Credential metadata에 저장되는 호스트 정보 */
export interface GitProviderMeta {
  type: "github" | "gitea";
  host: string;
  apiBase: string;
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/core/types.ts
git commit -m "feat: RemoteRepository, GitProviderMeta 타입 추가"
```

---

### Task 2: GitHub 저장소 목록 조회 모듈

**Files:**
- Create: `src/infra/git-provider/github-api.ts`
- Create: `src/__tests__/infra/git-provider/github-api.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/__tests__/infra/git-provider/github-api.test.ts`:

```typescript
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
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/__tests__/infra/git-provider/github-api.test.ts
```

Expected: FAIL — `normalizeGitHubRepo` 미존재

- [ ] **Step 3: 구현**

`src/infra/git-provider/github-api.ts`:

```typescript
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
```

- [ ] **Step 4: 테스트 실행 — 성공 확인**

```bash
npx vitest run src/__tests__/infra/git-provider/github-api.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/infra/git-provider/github-api.ts src/__tests__/infra/git-provider/github-api.test.ts
git commit -m "feat: GitHub 저장소 목록 조회 모듈 추가"
```

---

### Task 3: Gitea 저장소 목록 조회 모듈

**Files:**
- Create: `src/infra/git-provider/gitea-api.ts`
- Create: `src/__tests__/infra/git-provider/gitea-api.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/__tests__/infra/git-provider/gitea-api.test.ts`:

```typescript
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
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/__tests__/infra/git-provider/gitea-api.test.ts
```

Expected: FAIL — `normalizeGiteaRepo` 미존재

- [ ] **Step 3: 구현**

`src/infra/git-provider/gitea-api.ts`:

```typescript
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
```

- [ ] **Step 4: 테스트 실행 — 성공 확인**

```bash
npx vitest run src/__tests__/infra/git-provider/gitea-api.test.ts
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/infra/git-provider/gitea-api.ts src/__tests__/infra/git-provider/gitea-api.test.ts
git commit -m "feat: Gitea 저장소 목록 조회 모듈 추가"
```

---

### Task 4: Credential metadata 마이그레이션

**Files:**
- Modify: `src/infra/db/schema.ts:98-190` (migrateSchema 함수)

- [ ] **Step 1: migrateSchema에 metadata 마이그레이션 추가**

`src/infra/db/schema.ts`의 `migrateSchema()` 함수 끝에 추가:

```typescript
  // user_credentials: 기존 git credential에 GitHub 기본 metadata 적용
  const credRows = db.prepare(
    "SELECT id, metadata FROM user_credentials WHERE provider = 'git'"
  ).all() as { id: number; metadata: string | null }[];

  for (const row of credRows) {
    if (!row.metadata || row.metadata === "") {
      db.prepare(
        "UPDATE user_credentials SET metadata = ? WHERE id = ?"
      ).run(
        JSON.stringify({ type: "github", host: "github.com", apiBase: "https://api.github.com" }),
        row.id
      );
    }
  }
```

- [ ] **Step 2: 테스트 실행 — 기존 테스트 통과 확인**

```bash
npx vitest run src/__tests__/infra/db/schema.test.ts
```

Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add src/infra/db/schema.ts
git commit -m "feat: 기존 git credential에 GitHub 기본 metadata 마이그레이션"
```

---

### Task 5: Credential 등록 API에 metadata 저장

**Files:**
- Modify: `src/app/api/credentials/route.ts`

- [ ] **Step 1: POST 핸들러에 metadata 파라미터 추가**

`src/app/api/credentials/route.ts`의 POST 함수를 수정한다.

body에서 `metadata`를 추가로 파싱하고, `insertCredential` 호출 시 전달:

```typescript
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { provider, token, label, metadata } = body;

  if (!provider || !token || !label) {
    return NextResponse.json({ error: "provider, token, label are required" }, { status: 400 });
  }
  if (!validProviders.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of: ${validProviders.join(", ")}` }, { status: 400 });
  }

  // metadata 검증: git provider는 type, host, apiBase 필수
  if (provider === "git") {
    if (!metadata?.type || !metadata?.host || !metadata?.apiBase) {
      return NextResponse.json({ error: "metadata.type, metadata.host, metadata.apiBase are required for git provider" }, { status: 400 });
    }
    if (!["github", "gitea"].includes(metadata.type)) {
      return NextResponse.json({ error: "metadata.type must be 'github' or 'gitea'" }, { status: 400 });
    }
  }

  const db = getDb();
  const encrypted = encrypt(token);
  insertCredential(db, {
    userId: session.user.id,
    provider,
    credential: encrypted,
    label,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });

  return NextResponse.json({ message: "Credential saved" }, { status: 201 });
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "credentials/route"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/credentials/route.ts
git commit -m "feat: credential 등록 시 metadata(type, host, apiBase) 저장"
```

---

### Task 6: 저장소 목록 조회 API 엔드포인트

**Files:**
- Create: `src/app/api/git-providers/repos/route.ts`

- [ ] **Step 1: API 라우트 구현**

`src/app/api/git-providers/repos/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/infra/db/connection";
import { getCredentialById } from "@/infra/db/credential";
import { decrypt } from "@/infra/crypto/token-encryption";
import { listGitHubRepos } from "@/infra/git-provider/github-api";
import { listGiteaRepos } from "@/infra/git-provider/gitea-api";
import type { GitProviderMeta } from "@/core/types";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credentialId = request.nextUrl.searchParams.get("credentialId");
  if (!credentialId) {
    return NextResponse.json({ error: "credentialId is required" }, { status: 400 });
  }

  const db = getDb();
  const cred = getCredentialById(db, Number(credentialId));
  if (!cred) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }
  if (cred.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const meta: GitProviderMeta | null = cred.metadata ? JSON.parse(cred.metadata) : null;
  if (!meta?.type) {
    return NextResponse.json({ error: "Credential has no provider metadata" }, { status: 400 });
  }

  const token = decrypt(cred.credential);

  try {
    if (meta.type === "github") {
      const repos = await listGitHubRepos(token);
      return NextResponse.json(repos);
    }
    if (meta.type === "gitea") {
      const repos = await listGiteaRepos(meta.apiBase, token);
      return NextResponse.json(repos);
    }
    return NextResponse.json({ error: `Unsupported provider type: ${meta.type}` }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "git-providers"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/git-providers/repos/route.ts
git commit -m "feat: 저장소 목록 조회 API (GET /api/git-providers/repos)"
```

---

### Task 7: 저장소 일괄 등록 API 확장

**Files:**
- Modify: `src/app/api/repos/route.ts`

- [ ] **Step 1: POST 핸들러에 일괄 등록 분기 추가**

`src/app/api/repos/route.ts`의 POST 함수를 수정한다. body에 `repositories` 배열이 있으면 일괄 등록, 없으면 기존 단건 로직을 탄다.

기존 단건 로직을 `registerSingleRepo` 함수로 추출하고, 일괄 등록 시 반복 호출한다:

```typescript
// POST 함수 상단의 기존 import에 추가:
import { parseGitUrl } from "@/infra/git/parse-git-url";

// 단건 등록 로직을 함수로 추출
async function registerSingleRepo(
  db: ReturnType<typeof getDb>,
  userId: string,
  token: string,
  cloneUrl: string,
  branch: string
): Promise<{ success: boolean; error?: string; cloneUrl: string }> {
  let parsed;
  try {
    parsed = parseGitUrl(cloneUrl);
  } catch {
    return { success: false, error: "Invalid Git URL", cloneUrl };
  }

  try {
    const { join } = await import("path");
    const clonePath = join(process.cwd(), "data", "repos", userId, parsed.owner, `${parsed.repo}.git`);

    insertRepositoryForUser(db, {
      userId,
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
      cloneUrl,
    });

    const repoRow = db.prepare(
      "SELECT id FROM repositories WHERE user_id = ? AND clone_url = ?"
    ).get(userId, cloneUrl) as any;

    db.prepare("UPDATE repositories SET clone_path = ? WHERE id = ?").run(clonePath, repoRow.id);

    // clone은 백그라운드로 실행
    (async () => {
      try {
        await mkdir(join(process.cwd(), "data", "repos", userId, parsed!.owner), { recursive: true });
        await cloneRepository(cloneUrl, clonePath, token);
        console.log(`[Repos] Cloned ${cloneUrl} to ${clonePath}`);

        try {
          const language = await fetchRepoLanguage(parsed!.owner, parsed!.repo);
          updatePrimaryLanguage(db, repoRow.id, language);
        } catch (langErr) {
          console.error(`[Repos] Language fetch failed for ${cloneUrl}:`, langErr);
        }

        try {
          const branches = await getBranches(clonePath);
          const cacheCommits = await getCommitsForCache(clonePath, branches);
          if (cacheCommits.length > 0) {
            const rows: CacheCommit[] = cacheCommits.map(c => ({
              sha: c.sha,
              repositoryId: repoRow.id,
              branch: c.branch,
              author: c.author,
              message: c.message,
              committedDate: c.committedDate,
              committedAt: c.committedAt,
            }));
            const inserted = insertCommitCache(db, rows);
            console.log(`[Repos] Cached ${inserted} commits for ${parsed!.owner}/${parsed!.repo}`);
          }
        } catch (cacheErr) {
          console.error(`[Repos] Cache build failed for ${cloneUrl}:`, cacheErr);
        }
      } catch (err) {
        console.error(`[Repos] Failed to clone ${cloneUrl}:`, err);
      }
    })();

    return { success: true, cloneUrl };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg, cloneUrl };
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const userId = session.user.id;
  const db = getDb();

  // Git PAT 확인
  const gitCred = getCredentialByUserAndProvider(db, userId, "git");
  if (!gitCred) {
    return NextResponse.json({ error: "Git PAT이 등록되지 않았습니다. 설정에서 먼저 등록하세요." }, { status: 400 });
  }
  const token = decrypt(gitCred.credential);

  // 일괄 등록
  if (Array.isArray(body.repositories)) {
    const results = [];
    for (const item of body.repositories) {
      const result = await registerSingleRepo(db, userId, token, item.cloneUrl, item.branch || "main");
      results.push(result);
    }
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);
    return NextResponse.json({
      message: `${succeeded}개 저장소 등록됨${failed.length > 0 ? `, ${failed.length}개 실패` : ""}`,
      results,
    }, { status: 201 });
  }

  // 단건 등록 (기존 호환)
  const { cloneUrl, branch = "main" } = body;
  if (!cloneUrl) {
    return NextResponse.json({ error: "cloneUrl is required" }, { status: 400 });
  }

  const result = await registerSingleRepo(db, userId, token, cloneUrl, branch);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ message: "Repository registered. Cloning in progress." }, { status: 201 });
}
```

**주의:** 기존 PATCH, DELETE, GET 함수는 그대로 유지한다.

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "api/repos/route"
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/repos/route.ts
git commit -m "feat: 저장소 일괄 등록 API 지원 (POST /api/repos with repositories[])"
```

---

### Task 8: 설정 페이지 — 서비스 타입 프리셋 선택 UI

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: 서비스 타입 선택 UI 추가**

`src/app/(dashboard)/settings/page.tsx`의 등록 다이얼로그 내부를 수정한다.

state 추가:

```typescript
const [newServiceType, setNewServiceType] = useState<"github" | "gitea">("github");
const [newHost, setNewHost] = useState("");
```

다이얼로그의 "서비스" 섹션을 라디오 버튼으로 변경:

```tsx
<div>
  <label className="text-sm font-medium">서비스 타입</label>
  <div className="flex gap-3 mt-2">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name="serviceType"
        value="github"
        checked={newServiceType === "github"}
        onChange={() => { setNewServiceType("github"); setNewHost(""); }}
        className="accent-primary"
      />
      <span className="text-sm">GitHub</span>
    </label>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        name="serviceType"
        value="gitea"
        checked={newServiceType === "gitea"}
        onChange={() => setNewServiceType("gitea")}
        className="accent-primary"
      />
      <span className="text-sm">Gitea / 기타</span>
    </label>
  </div>
</div>
{newServiceType === "gitea" && (
  <div>
    <label className="text-sm font-medium">호스트 URL</label>
    <Input
      placeholder="gitea.example.com"
      value={newHost}
      onChange={(e) => setNewHost(e.target.value)}
    />
    <p className="text-xs text-muted-foreground mt-1">프로토콜 없이 호스트명만 입력 (예: gitea.company.com)</p>
  </div>
)}
```

`handleAdd` 함수에서 metadata 구성:

```typescript
const handleAdd = async () => {
  if (!newToken || !newLabel) {
    toast.error("라벨과 토큰을 모두 입력하세요");
    return;
  }
  if (newServiceType === "gitea" && !newHost) {
    toast.error("Gitea 호스트 URL을 입력하세요");
    return;
  }

  const metadata = newServiceType === "github"
    ? { type: "github", host: "github.com", apiBase: "https://api.github.com" }
    : { type: "gitea", host: newHost, apiBase: `https://${newHost}/api/v1` };

  setSaving(true);
  try {
    const res = await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: newProvider, token: newToken, label: newLabel, metadata }),
    });
    if (res.ok) {
      toast.success("자격증명이 등록되었습니다");
      setNewToken("");
      setNewLabel("");
      setNewHost("");
      setNewServiceType("github");
      setAddDialogOpen(false);
      fetchCredentials();
    } else {
      const data = await res.json();
      toast.error(data.error || "등록 실패");
    }
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 2: credential 카드에 호스트 정보 표시**

기존 `<Badge variant="secondary" className="text-xs">Git</Badge>` 부분을 수정하여 metadata의 host를 표시:

```tsx
<Badge variant="secondary" className="text-xs">
  {cred.metadata?.type === "gitea" ? `Gitea — ${cred.metadata.host}` : "GitHub"}
</Badge>
```

Credential 인터페이스에 metadata 타입 추가:

```typescript
interface Credential {
  id: number;
  provider: string;
  label: string | null;
  metadata: { type: string; host: string; apiBase: string } | null;
  maskedToken: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "settings/page"
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/(dashboard)/settings/page.tsx
git commit -m "feat: credential 등록 시 서비스 타입(GitHub/Gitea) 선택 UI"
```

---

### Task 9: shadcn/ui Tabs 컴포넌트 설치

**Files:**
- Create: `src/components/ui/tabs.tsx` (shadcn CLI로 생성)

- [ ] **Step 1: Tabs 컴포넌트 설치**

```bash
npx shadcn@latest add tabs
```

- [ ] **Step 2: 설치 확인**

```bash
ls src/components/ui/tabs.tsx
```

Expected: 파일 존재

- [ ] **Step 3: 커밋**

```bash
git add src/components/ui/tabs.tsx
git commit -m "chore: shadcn/ui Tabs 컴포넌트 추가"
```

---

### Task 10: 저장소 등록 다이얼로그 — 탭 구조 + 저장소 선택 UI

**Files:**
- Modify: `src/app/(dashboard)/repos/page.tsx`

- [ ] **Step 1: import 추가 및 새 state 선언**

파일 상단 import에 추가:

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";
```

`ReposPage` 컴포넌트 내부에 state 추가:

```typescript
// 저장소 선택 탭용 state
const [credentials, setCredentials] = useState<any[]>([]);
const [selectedCredId, setSelectedCredId] = useState<string>("");
const [remoteRepos, setRemoteRepos] = useState<any[]>([]);
const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
const [repoSearch, setRepoSearch] = useState("");
const [loadingRepos, setLoadingRepos] = useState(false);
const [registering, setRegistering] = useState(false);
```

- [ ] **Step 2: credential 목록 및 원격 저장소 fetch 함수**

```typescript
const fetchCredentials = () => {
  fetch("/api/credentials").then(r => r.json()).then(data => {
    if (Array.isArray(data)) {
      setCredentials(data.filter((c: any) => c.provider === "git" && c.metadata?.type));
    }
  });
};

useEffect(() => { fetchCredentials(); }, []);

const fetchRemoteRepos = async (credId: string) => {
  setLoadingRepos(true);
  setRemoteRepos([]);
  setSelectedRepos(new Set());
  try {
    const res = await fetch(`/api/git-providers/repos?credentialId=${credId}`);
    if (res.ok) {
      const data = await res.json();
      setRemoteRepos(data);
    } else {
      const data = await res.json();
      toast.error(data.error || "저장소 목록 조회 실패");
    }
  } finally {
    setLoadingRepos(false);
  }
};

const handleCredentialChange = (credId: string) => {
  setSelectedCredId(credId);
  if (credId) fetchRemoteRepos(credId);
};

const toggleRepo = (cloneUrl: string) => {
  setSelectedRepos(prev => {
    const next = new Set(prev);
    if (next.has(cloneUrl)) next.delete(cloneUrl);
    else next.add(cloneUrl);
    return next;
  });
};

const handleBatchAdd = async () => {
  if (selectedRepos.size === 0) {
    toast.error("저장소를 선택하세요");
    return;
  }
  setRegistering(true);
  try {
    const repositories = remoteRepos
      .filter(r => selectedRepos.has(r.cloneUrl))
      .map(r => ({ cloneUrl: r.cloneUrl, branch: r.defaultBranch }));

    const res = await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositories }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(data.message);
      setShowDialog(false);
      setSelectedRepos(new Set());
      setRemoteRepos([]);
      setSelectedCredId("");
      fetchRepos();
    } else {
      const data = await res.json();
      toast.error(data.error || "등록 실패");
    }
  } finally {
    setRegistering(false);
  }
};
```

- [ ] **Step 3: 다이얼로그를 탭 구조로 변경**

기존 `<Dialog>` 내부의 `<DialogContent>` 부분을 전체 교체:

```tsx
<Dialog open={showDialog} onOpenChange={(open) => {
  setShowDialog(open);
  if (!open) {
    setSelectedCredId("");
    setRemoteRepos([]);
    setSelectedRepos(new Set());
    setRepoSearch("");
    setCloneUrl("");
    setBranch("main");
  }
}}>
  <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
    <DialogHeader>
      <DialogTitle>저장소 추가</DialogTitle>
    </DialogHeader>
    <Tabs defaultValue="select" className="flex-1 flex flex-col min-h-0">
      <TabsList className="w-full">
        <TabsTrigger value="select" className="flex-1">저장소 선택</TabsTrigger>
        <TabsTrigger value="manual" className="flex-1">URL 직접 입력</TabsTrigger>
      </TabsList>

      {/* 탭 A: 저장소 선택 */}
      <TabsContent value="select" className="flex-1 flex flex-col min-h-0 space-y-3">
        <Select value={selectedCredId} onValueChange={handleCredentialChange}>
          <SelectTrigger>
            <SelectValue placeholder="자격증명 선택" />
          </SelectTrigger>
          <SelectContent>
            {credentials.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.label} — {c.metadata?.host || "unknown"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedCredId && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="저장소 검색..."
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {loadingRepos ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : remoteRepos.length > 0 ? (
          <div className="flex-1 overflow-y-auto min-h-0 space-y-1 border rounded-md p-2">
            {remoteRepos
              .filter(r => !repoSearch || r.fullName.toLowerCase().includes(repoSearch.toLowerCase()))
              .map((r: any) => {
                const alreadyRegistered = repos.some((existing: any) => existing.clone_url === r.cloneUrl);
                return (
                  <label
                    key={r.cloneUrl}
                    className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                      alreadyRegistered ? "opacity-50" : "hover:bg-muted/50 cursor-pointer"
                    }`}
                  >
                    <Checkbox
                      checked={alreadyRegistered || selectedRepos.has(r.cloneUrl)}
                      disabled={alreadyRegistered}
                      onCheckedChange={() => toggleRepo(r.cloneUrl)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{r.fullName}</span>
                        {r.isPrivate && <Badge variant="outline" className="text-[10px] px-1 py-0">Private</Badge>}
                        {alreadyRegistered && <Badge variant="secondary" className="text-[10px] px-1 py-0">등록됨</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {r.language && <span>{r.language}</span>}
                        <span>{r.defaultBranch}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
          </div>
        ) : selectedCredId && !loadingRepos ? (
          <p className="text-sm text-muted-foreground text-center py-8">저장소가 없습니다</p>
        ) : null}

        {selectedRepos.size > 0 && (
          <DialogFooter>
            <span className="text-sm text-muted-foreground mr-auto">{selectedRepos.size}개 선택됨</span>
            <Button onClick={handleBatchAdd} disabled={registering}>
              {registering ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        )}
      </TabsContent>

      {/* 탭 B: URL 직접 입력 (기존) */}
      <TabsContent value="manual" className="space-y-4">
        <div>
          <label className="text-sm font-medium">Git 저장소 URL</label>
          <Input
            placeholder="https://github.com/owner/repo.git"
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">GitHub, GitLab, Gitea 등 HTTPS URL을 지원합니다</p>
        </div>
        <div>
          <label className="text-sm font-medium">브랜치</label>
          <Input
            placeholder="main"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowDialog(false)}>취소</Button>
          <Button onClick={handleAdd} disabled={loading}>
            {loading ? "등록 중..." : "등록"}
          </Button>
        </DialogFooter>
      </TabsContent>
    </Tabs>
  </DialogContent>
</Dialog>
```

- [ ] **Step 4: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep "repos/page"
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/app/(dashboard)/repos/page.tsx
git commit -m "feat: 저장소 등록 다이얼로그 탭 구조 — PAT 기반 저장소 선택 UI"
```

---

### Task 11: 전체 통합 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 실행**

```bash
npx vitest run
```

Expected: 신규 테스트 포함 전체 PASS (기존 types.test.ts의 provider 타입 에러는 기존 이슈)

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 빌드 성공

- [ ] **Step 3: 커밋 (필요 시 수정 사항)**

빌드/테스트 실패 시 수정 후 커밋.
