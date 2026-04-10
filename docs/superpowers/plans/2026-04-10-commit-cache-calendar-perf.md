# commit_cache 기반 캘린더 API 성능 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캘린더 API가 매번 git CLI를 실행하는 대신 SQLite commit_cache 테이블을 조회하여 수 ms 이내로 응답하도록 개선

**Architecture:** `commit_cache` 테이블에 커밋 메타데이터를 캐시. 저장소 clone/fetch 시점에 캐시 빌드. 캘린더 API 3개 모두 DB SELECT로 교체. SHA PK로 중복 방지, ON DELETE CASCADE로 정리 자동화.

**Tech Stack:** better-sqlite3, Next.js App Router API Routes, git CLI (캐시 빌드 시에만)

**Spec:** `docs/superpowers/specs/2026-04-10-commit-cache-calendar-perf-design.md`

---

## File Structure

```
src/
├── infra/
│   ├── db/
│   │   ├── schema.ts              # 수정: commit_cache 테이블 + 인덱스 + PRAGMA foreign_keys
│   │   └── repository.ts          # 수정: 캐시 CRUD 함수 5개 추가
│   └── git/
│       └── git-client.ts          # 수정: getCommitsForCache() 함수 추가
├── scheduler/
│   └── polling-manager.ts         # 수정: fetch 후 캐시 빌드 호출 추가
├── app/
│   └── api/
│       └── repos/
│           ├── route.ts           # 수정: clone 후 캐시 빌드 호출 추가
│           └── commit-calendar/
│               ├── route.ts       # 수정: git CLI → DB 쿼리 교체
│               ├── range/
│               │   └── route.ts   # 수정: git CLI → DB 쿼리 교체
│               └── [date]/
│                   └── route.ts   # 수정: git CLI → DB 쿼리 교체
└── __tests__/
    └── infra/
        └── db/
            └── commit-cache.test.ts  # 생성: 캐시 CRUD 단위 테스트
```

---

### Task 1: commit_cache 테이블 스키마 추가

**Files:**
- Modify: `src/infra/db/schema.ts`

- [ ] **Step 1: `createTables`에 PRAGMA foreign_keys + commit_cache 테이블 추가**

`src/infra/db/schema.ts`의 `createTables` 함수 맨 앞에 PRAGMA 추가, 기존 `db.exec` 블록 내부에 commit_cache 테이블 추가:

```typescript
export function createTables(db: Database.Database): void {
  db.pragma("foreign_keys = ON");

  db.exec(`
    -- 기존 테이블들 유지 ...

    CREATE TABLE IF NOT EXISTS commit_cache (
      sha TEXT PRIMARY KEY,
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      branch TEXT NOT NULL,
      author TEXT NOT NULL,
      message TEXT NOT NULL,
      committed_date TEXT NOT NULL,
      committed_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_commit_cache_repo_date
      ON commit_cache(repository_id, committed_date);
  `);
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/infra/db/schema.ts
git commit -m "feat: commit_cache 테이블 스키마 및 인덱스 추가"
```

---

### Task 2: 캐시 CRUD 함수 추가 (repository.ts)

**Files:**
- Modify: `src/infra/db/repository.ts`

- [ ] **Step 1: CacheCommit 타입 및 insertCommitCache 함수 추가**

`src/infra/db/repository.ts` 파일 끝에 추가:

```typescript
// --- Commit Cache ---

export interface CacheCommit {
  sha: string;
  repositoryId: number;
  branch: string;
  author: string;
  message: string;
  committedDate: string;   // YYYY-MM-DD
  committedAt: string;     // ISO 8601
}

export function insertCommitCache(db: Database.Database, commits: CacheCommit[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO commit_cache (sha, repository_id, branch, author, message, committed_date, committed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((rows: CacheCommit[]) => {
    let inserted = 0;
    for (const c of rows) {
      const result = stmt.run(c.sha, c.repositoryId, c.branch, c.author, c.message, c.committedDate, c.committedAt);
      inserted += result.changes;
    }
    return inserted;
  });
  return insertMany(commits);
}
```

- [ ] **Step 2: getLatestCacheDate 함수 추가**

```typescript
export function getLatestCacheDate(db: Database.Database, repositoryId: number): string | null {
  const row = db.prepare(
    "SELECT MAX(committed_date) as latest FROM commit_cache WHERE repository_id = ?"
  ).get(repositoryId) as { latest: string | null } | undefined;
  return row?.latest ?? null;
}
```

- [ ] **Step 3: getCommitCountsByDateRange 함수 추가**

```typescript
export function getCommitCountsByDateRange(
  db: Database.Database,
  repoIds: number[],
  since: string,
  until: string,
  authors?: string[]
): Record<string, number> {
  if (repoIds.length === 0) return {};

  const placeholders = repoIds.map(() => "?").join(",");
  let sql = `SELECT committed_date, COUNT(*) as count FROM commit_cache
    WHERE repository_id IN (${placeholders}) AND committed_date BETWEEN ? AND ?`;
  const params: (string | number)[] = [...repoIds, since, until];

  if (authors && authors.length > 0) {
    const authorClauses = authors.map(() => "author LIKE ?").join(" OR ");
    sql += ` AND (${authorClauses})`;
    params.push(...authors.map(a => `%${a}%`));
  }

  sql += " GROUP BY committed_date";

  const rows = db.prepare(sql).all(...params) as { committed_date: string; count: number }[];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.committed_date] = row.count;
  }
  return counts;
}
```

- [ ] **Step 4: getCommitsByDateRange 함수 추가**

```typescript
export function getCommitsByDateRange(
  db: Database.Database,
  repoIds: number[],
  since: string,
  until: string,
  authors?: string[]
): CacheCommit[] {
  if (repoIds.length === 0) return [];

  const placeholders = repoIds.map(() => "?").join(",");
  let sql = `SELECT sha, repository_id, branch, author, message, committed_date, committed_at
    FROM commit_cache
    WHERE repository_id IN (${placeholders}) AND committed_date BETWEEN ? AND ?`;
  const params: (string | number)[] = [...repoIds, since, until];

  if (authors && authors.length > 0) {
    const authorClauses = authors.map(() => "author LIKE ?").join(" OR ");
    sql += ` AND (${authorClauses})`;
    params.push(...authors.map(a => `%${a}%`));
  }

  sql += " ORDER BY committed_at DESC";

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(r => ({
    sha: r.sha,
    repositoryId: r.repository_id,
    branch: r.branch,
    author: r.author,
    message: r.message,
    committedDate: r.committed_date,
    committedAt: r.committed_at,
  }));
}
```

- [ ] **Step 5: getCommitsByDate 함수 추가**

```typescript
export function getCommitsByDate(
  db: Database.Database,
  repoIds: number[],
  date: string,
  authors?: string[]
): CacheCommit[] {
  return getCommitsByDateRange(db, repoIds, date, date, authors);
}
```

- [ ] **Step 6: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src/infra/db/repository.ts
git commit -m "feat: commit_cache CRUD 함수 추가 (insert, count, range, date 조회)"
```

---

### Task 3: 캐시 CRUD 단위 테스트

**Files:**
- Create: `src/__tests__/infra/db/commit-cache.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTables } from "@/infra/db/schema";
import {
  insertCommitCache,
  getLatestCacheDate,
  getCommitCountsByDateRange,
  getCommitsByDateRange,
  getCommitsByDate,
  type CacheCommit,
} from "@/infra/db/repository";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  createTables(db);
  return db;
}

function makeCommit(overrides: Partial<CacheCommit> = {}): CacheCommit {
  return {
    sha: "abc123def456abc123def456abc123def456abc1",
    repositoryId: 1,
    branch: "main",
    author: "tester",
    message: "test commit",
    committedDate: "2026-04-10",
    committedAt: "2026-04-10T09:00:00+09:00",
    ...overrides,
  };
}

describe("commit_cache CRUD", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    // repository FK를 위한 더미 데이터
    db.prepare(
      "INSERT INTO repositories (id, owner, repo, branch, user_id, clone_url) VALUES (1, 'owner', 'repo', 'main', 'user1', 'https://github.com/owner/repo.git')"
    ).run();
    db.prepare(
      "INSERT INTO repositories (id, owner, repo, branch, user_id, clone_url) VALUES (2, 'owner', 'repo2', 'main', 'user1', 'https://github.com/owner/repo2.git')"
    ).run();
  });

  afterEach(() => {
    db.close();
  });

  it("INSERT OR IGNORE로 중복 SHA를 무시한다", () => {
    const commit = makeCommit();
    const inserted1 = insertCommitCache(db, [commit]);
    expect(inserted1).toBe(1);

    const inserted2 = insertCommitCache(db, [commit]);
    expect(inserted2).toBe(0);

    const count = (db.prepare("SELECT COUNT(*) as c FROM commit_cache").get() as any).c;
    expect(count).toBe(1);
  });

  it("벌크 INSERT가 트랜잭션으로 동작한다", () => {
    const commits = [
      makeCommit({ sha: "aaa1".padEnd(40, "0") }),
      makeCommit({ sha: "bbb2".padEnd(40, "0") }),
      makeCommit({ sha: "ccc3".padEnd(40, "0") }),
    ];
    const inserted = insertCommitCache(db, commits);
    expect(inserted).toBe(3);
  });

  it("getLatestCacheDate가 가장 최근 날짜를 반환한다", () => {
    insertCommitCache(db, [
      makeCommit({ sha: "a".padEnd(40, "0"), committedDate: "2026-04-08" }),
      makeCommit({ sha: "b".padEnd(40, "0"), committedDate: "2026-04-10" }),
      makeCommit({ sha: "c".padEnd(40, "0"), committedDate: "2026-04-09" }),
    ]);
    expect(getLatestCacheDate(db, 1)).toBe("2026-04-10");
  });

  it("getLatestCacheDate가 캐시 없으면 null을 반환한다", () => {
    expect(getLatestCacheDate(db, 1)).toBeNull();
  });

  it("getCommitCountsByDateRange가 날짜별 개수를 반환한다", () => {
    insertCommitCache(db, [
      makeCommit({ sha: "a".padEnd(40, "0"), committedDate: "2026-04-08" }),
      makeCommit({ sha: "b".padEnd(40, "0"), committedDate: "2026-04-08" }),
      makeCommit({ sha: "c".padEnd(40, "0"), committedDate: "2026-04-10" }),
    ]);
    const counts = getCommitCountsByDateRange(db, [1], "2026-04-01", "2026-04-30");
    expect(counts).toEqual({ "2026-04-08": 2, "2026-04-10": 1 });
  });

  it("getCommitCountsByDateRange가 author 필터를 적용한다", () => {
    insertCommitCache(db, [
      makeCommit({ sha: "a".padEnd(40, "0"), author: "Alice" }),
      makeCommit({ sha: "b".padEnd(40, "0"), author: "Bob" }),
    ]);
    const counts = getCommitCountsByDateRange(db, [1], "2026-04-01", "2026-04-30", ["Alice"]);
    expect(counts).toEqual({ "2026-04-10": 1 });
  });

  it("getCommitCountsByDateRange가 여러 저장소를 합산한다", () => {
    insertCommitCache(db, [
      makeCommit({ sha: "a".padEnd(40, "0"), repositoryId: 1, committedDate: "2026-04-10" }),
      makeCommit({ sha: "b".padEnd(40, "0"), repositoryId: 2, committedDate: "2026-04-10" }),
    ]);
    const counts = getCommitCountsByDateRange(db, [1, 2], "2026-04-01", "2026-04-30");
    expect(counts).toEqual({ "2026-04-10": 2 });
  });

  it("getCommitsByDateRange가 범위 내 커밋을 시간 역순으로 반환한다", () => {
    insertCommitCache(db, [
      makeCommit({ sha: "a".padEnd(40, "0"), committedDate: "2026-04-08", committedAt: "2026-04-08T10:00:00+09:00" }),
      makeCommit({ sha: "b".padEnd(40, "0"), committedDate: "2026-04-10", committedAt: "2026-04-10T15:00:00+09:00" }),
      makeCommit({ sha: "c".padEnd(40, "0"), committedDate: "2026-04-10", committedAt: "2026-04-10T09:00:00+09:00" }),
    ]);
    const commits = getCommitsByDateRange(db, [1], "2026-04-09", "2026-04-10");
    expect(commits).toHaveLength(2);
    expect(commits[0].sha).toBe("b".padEnd(40, "0"));
    expect(commits[1].sha).toBe("c".padEnd(40, "0"));
  });

  it("getCommitsByDate가 단일 날짜 커밋을 반환한다", () => {
    insertCommitCache(db, [
      makeCommit({ sha: "a".padEnd(40, "0"), committedDate: "2026-04-10" }),
      makeCommit({ sha: "b".padEnd(40, "0"), committedDate: "2026-04-11" }),
    ]);
    const commits = getCommitsByDate(db, [1], "2026-04-10");
    expect(commits).toHaveLength(1);
    expect(commits[0].sha).toBe("a".padEnd(40, "0"));
  });

  it("ON DELETE CASCADE로 저장소 삭제 시 캐시도 삭제된다", () => {
    insertCommitCache(db, [makeCommit()]);
    db.prepare("DELETE FROM repositories WHERE id = 1").run();
    const count = (db.prepare("SELECT COUNT(*) as c FROM commit_cache").get() as any).c;
    expect(count).toBe(0);
  });

  it("repoIds가 빈 배열이면 빈 결과를 반환한다", () => {
    expect(getCommitCountsByDateRange(db, [], "2026-04-01", "2026-04-30")).toEqual({});
    expect(getCommitsByDateRange(db, [], "2026-04-01", "2026-04-30")).toEqual([]);
    expect(getCommitsByDate(db, [], "2026-04-10")).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run src/__tests__/infra/db/commit-cache.test.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 3: 커밋**

```bash
git add src/__tests__/infra/db/commit-cache.test.ts
git commit -m "test: commit_cache CRUD 단위 테스트 추가"
```

---

### Task 4: git-client에 캐시 빌드용 함수 추가

**Files:**
- Modify: `src/infra/git/git-client.ts`

- [ ] **Step 1: getCommitsForCache 함수 추가**

`src/infra/git/git-client.ts` 파일 끝(기존 `parseGitLog` 함수 위)에 추가:

```typescript
export interface CacheableCommit {
  sha: string;
  branch: string;
  author: string;
  message: string;
  committedDate: string;   // YYYY-MM-DD
  committedAt: string;     // ISO 8601
}

export async function getCommitsForCache(
  repoPath: string,
  branches: string[],
  since?: string
): Promise<CacheableCommit[]> {
  const commits: CacheableCommit[] = [];
  const seenShas = new Set<string>();

  for (const branch of branches) {
    let ref: string;
    try {
      await execFileAsync("git", ["--git-dir", repoPath, "rev-parse", "--verify", `origin/${branch}`], { timeout: 5_000 });
      ref = `origin/${branch}`;
    } catch {
      ref = branch;
    }

    const args = ["--git-dir", repoPath, "log", ref, "--format=%H%n%an%n%aI%n%s%n---END---"];
    if (since) args.push(`--since=${since}`);

    try {
      const { stdout } = await execFileAsync("git", args, { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 });
      if (!stdout.trim()) continue;

      const entries = stdout.split("---END---").filter(e => e.trim());
      for (const entry of entries) {
        const lines = entry.trim().split("\n");
        if (lines.length < 4) continue;
        const sha = lines[0];
        if (seenShas.has(sha)) continue;
        seenShas.add(sha);
        commits.push({
          sha,
          branch,
          author: lines[1],
          message: lines[3],
          committedDate: lines[2].slice(0, 10),
          committedAt: lines[2],
        });
      }
    } catch {
      // 브랜치 오류 무시
    }
  }

  return commits;
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/infra/git/git-client.ts
git commit -m "feat: getCommitsForCache 캐시 빌드용 git log 함수 추가"
```

---

### Task 5: 폴링 매니저에 캐시 빌드 통합

**Files:**
- Modify: `src/scheduler/polling-manager.ts`

- [ ] **Step 1: import 추가 및 캐시 빌드 함수 호출**

`src/scheduler/polling-manager.ts` 상단 import에 추가:

```typescript
import { getBranches, getCommitsForCache } from "@/infra/git/git-client";
import {
  getLatestCacheDate,
  insertCommitCache,
  type CacheCommit,
} from "@/infra/db/repository";
```

기존 import에서 `getCommitsSince, getCommitDiff`는 유지 (Notion 동기화에서 여전히 사용).

`runSyncCycle` 함수 내부, `await pullRepository(repo.clone_path);` 직후(기존 `getCommitsSince` 호출 전)에 캐시 빌드 추가:

```typescript
await pullRepository(repo.clone_path);

// --- 캐시 빌드 (증분) ---
try {
  const branches = await getBranches(repo.clone_path);
  const latestDate = getLatestCacheDate(database, repo.id);
  const cacheCommits = await getCommitsForCache(repo.clone_path, branches, latestDate ?? undefined);
  if (cacheCommits.length > 0) {
    const rows: CacheCommit[] = cacheCommits.map(c => ({
      sha: c.sha,
      repositoryId: repo.id,
      branch: c.branch,
      author: c.author,
      message: c.message,
      committedDate: c.committedDate,
      committedAt: c.committedAt,
    }));
    const inserted = insertCommitCache(database, rows);
    if (inserted > 0) {
      console.log(`[Scheduler] ${repo.owner}/${repo.repo}: cached ${inserted} new commits`);
    }
  }
} catch (cacheErr) {
  console.error(`[Scheduler] ${repo.owner}/${repo.repo}: cache build failed -`, cacheErr);
}

// --- 기존 Notion 동기화 로직 유지 ---
const commits = await getCommitsSince(repo.clone_path, repo.branch, repo.clone_url, repo.last_synced_sha);
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/scheduler/polling-manager.ts
git commit -m "feat: 폴링 사이클에 commit_cache 증분 빌드 추가"
```

---

### Task 6: 저장소 등록 시 초기 캐시 빌드

**Files:**
- Modify: `src/app/api/repos/route.ts`

- [ ] **Step 1: clone 완료 후 캐시 빌드 추가**

`src/app/api/repos/route.ts` 상단 import에 추가:

```typescript
import { cloneRepository, getBranches, getCommitsForCache } from "@/infra/git/git-client";
import { insertCommitCache, type CacheCommit } from "@/infra/db/repository";
```

기존 백그라운드 clone 콜백(`(async () => { ... })()`) 내부, clone 성공 후에 캐시 빌드 추가:

```typescript
(async () => {
  try {
    await mkdir(join(process.cwd(), "data", "repos", userId, parsed!.owner), { recursive: true });
    await cloneRepository(cloneUrl, clonePath, token);
    console.log(`[Repos] Cloned ${cloneUrl} to ${clonePath}`);

    // 초기 캐시 빌드
    try {
      const cacheDb = getDb();
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
          const inserted = insertCommitCache(cacheDb, rows);
          console.log(`[Repos] Cached ${inserted} commits for ${parsed!.owner}/${parsed!.repo}`);
        }
      } finally {
        cacheDb.close();
      }
    } catch (cacheErr) {
      console.error(`[Repos] Cache build failed for ${cloneUrl}:`, cacheErr);
    }
  } catch (err) {
    console.error(`[Repos] Failed to clone ${cloneUrl}:`, err);
  }
})();
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/repos/route.ts
git commit -m "feat: 저장소 등록 clone 완료 후 초기 commit_cache 빌드"
```

---

### Task 7: 캘린더 카운트 API DB 쿼리로 교체

**Files:**
- Modify: `src/app/api/repos/commit-calendar/route.ts`

- [ ] **Step 1: 전체 파일을 DB 쿼리 기반으로 교체**

`src/app/api/repos/commit-calendar/route.ts` 전체를 다음으로 교체:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getRepositoriesByUser, getCommitCountsByDateRange } from "@/infra/db/repository";
import { auth } from "@/lib/auth";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since") || undefined;
  const until = searchParams.get("until") || undefined;
  const repoIdsParam = searchParams.get("repoIds");

  const db = getDb();
  try {
    let repos = getRepositoriesByUser(db, session.user.id);

    if (repoIdsParam) {
      const repoIdSet = new Set(repoIdsParam.split(",").map(Number));
      repos = repos.filter((r: any) => repoIdSet.has(r.id));
    }

    const repoIds = repos.map((r: any) => r.id);
    if (repoIds.length === 0) return NextResponse.json({});

    // git_author 필터 수집
    const allAuthors: string[] = [];
    for (const repo of repos) {
      if (repo.git_author) {
        allAuthors.push(...repo.git_author.split(",").map((a: string) => a.trim()).filter(Boolean));
      }
    }

    const counts = getCommitCountsByDateRange(
      db,
      repoIds,
      since || "1970-01-01",
      until || "2099-12-31",
      allAuthors.length > 0 ? allAuthors : undefined
    );

    return NextResponse.json(counts);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/repos/commit-calendar/route.ts
git commit -m "refactor: commit-calendar 카운트 API를 DB 쿼리로 교체"
```

---

### Task 8: range API DB 쿼리로 교체

**Files:**
- Modify: `src/app/api/repos/commit-calendar/range/route.ts`

- [ ] **Step 1: 전체 파일을 DB 쿼리 기반으로 교체**

`src/app/api/repos/commit-calendar/range/route.ts` 전체를 다음으로 교체:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getRepositoriesByUser, getCommitsByDateRange, type CacheCommit } from "@/infra/db/repository";
import { auth } from "@/lib/auth";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

function groupByDateAndRepo(commits: CacheCommit[], repos: any[]) {
  const repoMap = new Map(repos.map((r: any) => [r.id, r]));

  // date → repoId → branch → commits
  const grouped = new Map<string, Map<number, Map<string, CacheCommit[]>>>();
  for (const c of commits) {
    if (!grouped.has(c.committedDate)) grouped.set(c.committedDate, new Map());
    const dateMap = grouped.get(c.committedDate)!;
    if (!dateMap.has(c.repositoryId)) dateMap.set(c.repositoryId, new Map());
    const repoGroup = dateMap.get(c.repositoryId)!;
    if (!repoGroup.has(c.branch)) repoGroup.set(c.branch, []);
    repoGroup.get(c.branch)!.push(c);
  }

  const result: any[] = [];
  for (const [date, repoEntries] of grouped) {
    const dateRepos: any[] = [];
    for (const [repoId, branchEntries] of repoEntries) {
      const repo = repoMap.get(repoId);
      if (!repo) continue;
      const branches: any[] = [];
      for (const [branch, branchCommits] of branchEntries) {
        branches.push({
          branch,
          commits: branchCommits.map(c => ({
            sha: c.sha,
            message: c.message,
            author: c.author,
            date: c.committedAt,
          })),
        });
      }
      dateRepos.push({ repoId, repoName: repo.repo, owner: repo.owner, branches });
    }
    result.push({ date, repos: dateRepos });
  }

  // 날짜 정렬 (최신순)
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const repoIdsParam = searchParams.get("repoIds");

  if (!since || !until) {
    return NextResponse.json({ error: "since and until query params are required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }
  if (since > until) {
    return NextResponse.json({ error: "since must be before or equal to until" }, { status: 400 });
  }

  const db = getDb();
  try {
    let repos = getRepositoriesByUser(db, session.user.id);

    if (repoIdsParam) {
      const repoIdSet = new Set(repoIdsParam.split(",").map(Number));
      repos = repos.filter((r: any) => repoIdSet.has(r.id));
    }

    const repoIds = repos.map((r: any) => r.id);
    if (repoIds.length === 0) return NextResponse.json([]);

    const allAuthors: string[] = [];
    for (const repo of repos) {
      if (repo.git_author) {
        allAuthors.push(...repo.git_author.split(",").map((a: string) => a.trim()).filter(Boolean));
      }
    }

    const commits = getCommitsByDateRange(
      db,
      repoIds,
      since,
      until,
      allAuthors.length > 0 ? allAuthors : undefined
    );

    return NextResponse.json(groupByDateAndRepo(commits, repos));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/repos/commit-calendar/range/route.ts
git commit -m "refactor: commit-calendar range API를 DB 쿼리로 교체"
```

---

### Task 9: 단일 날짜 API DB 쿼리로 교체

**Files:**
- Modify: `src/app/api/repos/commit-calendar/[date]/route.ts`

- [ ] **Step 1: 전체 파일을 DB 쿼리 기반으로 교체**

`src/app/api/repos/commit-calendar/[date]/route.ts` 전체를 다음으로 교체:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getRepositoriesByUser, getCommitsByDate, type CacheCommit } from "@/infra/db/repository";
import { auth } from "@/lib/auth";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

function groupByRepo(commits: CacheCommit[], repos: any[]) {
  const repoMap = new Map(repos.map((r: any) => [r.id, r]));

  // repoId → branch → commits
  const grouped = new Map<number, Map<string, CacheCommit[]>>();
  for (const c of commits) {
    if (!grouped.has(c.repositoryId)) grouped.set(c.repositoryId, new Map());
    const repoGroup = grouped.get(c.repositoryId)!;
    if (!repoGroup.has(c.branch)) repoGroup.set(c.branch, []);
    repoGroup.get(c.branch)!.push(c);
  }

  const result: any[] = [];
  for (const [repoId, branchEntries] of grouped) {
    const repo = repoMap.get(repoId);
    if (!repo) continue;
    const branches: any[] = [];
    for (const [branch, branchCommits] of branchEntries) {
      branches.push({
        branch,
        commits: branchCommits.map(c => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          date: c.committedAt,
        })),
      });
    }
    result.push({ repoId, repoName: repo.repo, owner: repo.owner, branches });
  }

  return result;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const repoIdsParam = searchParams.get("repoIds");

  const db = getDb();
  try {
    let repos = getRepositoriesByUser(db, session.user.id);

    if (repoIdsParam) {
      const repoIdSet = new Set(repoIdsParam.split(",").map(Number));
      repos = repos.filter((r: any) => repoIdSet.has(r.id));
    }

    const repoIds = repos.map((r: any) => r.id);
    if (repoIds.length === 0) return NextResponse.json([]);

    const allAuthors: string[] = [];
    for (const repo of repos) {
      if (repo.git_author) {
        allAuthors.push(...repo.git_author.split(",").map((a: string) => a.trim()).filter(Boolean));
      }
    }

    const commits = getCommitsByDate(
      db,
      repoIds,
      date,
      allAuthors.length > 0 ? allAuthors : undefined
    );

    return NextResponse.json(groupByRepo(commits, repos));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/repos/commit-calendar/[date]/route.ts
git commit -m "refactor: commit-calendar [date] API를 DB 쿼리로 교체"
```

---

### Task 10: 수동 확인 및 기존 저장소 캐시 빌드

- [ ] **Step 1: 개발 서버 시작**

Run: `npm run dev`
Expected: 서버 정상 시작, 스케줄러 초기 사이클에서 각 저장소에 대해 `[Scheduler] ... cached N new commits` 로그 출력

- [ ] **Step 2: 캘린더 API 응답 속도 확인**

브라우저에서 태스크 캘린더 페이지 접속. 월 이동 시 로딩이 즉시(~수십ms) 완료되는지 확인.

- [ ] **Step 3: range API 확인**

캘린더에서 날짜 클릭 및 기간 프리셋 선택 시 하단 패널 데이터가 정상 표시되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "chore: commit_cache 기반 캘린더 API 성능 개선 완료"
```
