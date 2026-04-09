# 태스크 캘린더 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 태스크 캘린더에 저장소별 필터링, 기간 선택(프리셋+커스텀), 비동기 기간 보고서 생성 기능 추가

**Architecture:** 기존 `/task-calendar` 페이지를 확장. 모놀리식 page.tsx를 5개 하위 컴포넌트로 분리. API에 repoIds 필터 파라미터 추가 및 기간 상세 조회 엔드포인트 신규. reports 테이블에 date_start/date_end/status 컬럼 추가하여 비동기 보고서 생성 지원.

**Tech Stack:** Next.js App Router, shadcn/ui (Popover, Command, Checkbox 추가 설치), Tailwind CSS, better-sqlite3, Gemini API

---

## 파일 구조

| 동작 | 파일 경로 | 설명 |
|------|-----------|------|
| Create | `src/app/(dashboard)/task-calendar/components/repo-filter.tsx` | 저장소 멀티셀렉트 (Popover + Command) |
| Create | `src/app/(dashboard)/task-calendar/components/period-presets.tsx` | 기간 프리셋 버튼 그룹 |
| Create | `src/app/(dashboard)/task-calendar/components/calendar-grid.tsx` | 월 캘린더 히트맵 (기존 MonthGrid 추출) |
| Create | `src/app/(dashboard)/task-calendar/components/date-detail-panel.tsx` | 단일 날짜 상세 패널 |
| Create | `src/app/(dashboard)/task-calendar/components/range-detail-panel.tsx` | 기간 상세 패널 |
| Modify | `src/app/(dashboard)/task-calendar/page.tsx` | 컴포넌트 조합 + 상태 관리 |
| Modify | `src/app/api/repos/commit-calendar/route.ts` | repoIds 파라미터 추가 |
| Modify | `src/app/api/repos/commit-calendar/[date]/route.ts` | repoIds 파라미터 추가 |
| Create | `src/app/api/repos/commit-calendar/range/route.ts` | 기간 상세 조회 API |
| Modify | `src/infra/db/schema.ts` | reports 테이블 마이그레이션 (date_start, date_end, status) |
| Modify | `src/infra/db/report.ts` | insertReport 확장, 상태 업데이트 함수 추가 |
| Modify | `src/app/api/reports/generate/route.ts` | 기간 보고서 + 비동기 생성 지원 |
| Modify | `src/app/api/reports/route.ts` | POST body에 기간 필드 지원 |

---

### Task 1: shadcn/ui 컴포넌트 설치

**Files:**
- Create: `src/components/ui/popover.tsx` (CLI 생성)
- Create: `src/components/ui/command.tsx` (CLI 생성)
- Create: `src/components/ui/checkbox.tsx` (CLI 생성)

- [ ] **Step 1: Popover 설치**

```bash
npx shadcn@latest add popover
```

- [ ] **Step 2: Command 설치**

```bash
npx shadcn@latest add command
```

- [ ] **Step 3: Checkbox 설치**

```bash
npx shadcn@latest add checkbox
```

- [ ] **Step 4: 설치 확인**

```bash
ls src/components/ui/popover.tsx src/components/ui/command.tsx src/components/ui/checkbox.tsx
```

Expected: 3개 파일 모두 존재

- [ ] **Step 5: 커밋**

```bash
git add src/components/ui/popover.tsx src/components/ui/command.tsx src/components/ui/checkbox.tsx
git commit -m "chore: shadcn/ui popover, command, checkbox 컴포넌트 추가"
```

---

### Task 2: DB 마이그레이션 — reports 테이블 확장

**Files:**
- Modify: `src/infra/db/schema.ts:66-109` (migrateSchema 함수)
- Modify: `src/infra/db/report.ts`

- [ ] **Step 1: migrateSchema에 reports 컬럼 추가**

`src/infra/db/schema.ts`의 `migrateSchema` 함수 끝에 추가:

```typescript
// reports 테이블 마이그레이션
const reportColumns = db.prepare("PRAGMA table_info(reports)").all() as any[];
const reportColumnNames = reportColumns.map((c: any) => c.name);

if (!reportColumnNames.includes("date_start")) {
  db.exec("ALTER TABLE reports ADD COLUMN date_start TEXT");
}
if (!reportColumnNames.includes("date_end")) {
  db.exec("ALTER TABLE reports ADD COLUMN date_end TEXT");
}
if (!reportColumnNames.includes("status")) {
  db.exec("ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'");
}
```

- [ ] **Step 2: report.ts에 InsertReportInput 타입 확장**

`src/infra/db/report.ts`의 `InsertReportInput` 인터페이스를 수정:

```typescript
interface InsertReportInput {
  userId: string;
  repositoryId: number;
  project: string;
  date: string;
  title: string;
  content: string;
  dateStart?: string;
  dateEnd?: string;
  status?: string;
}
```

- [ ] **Step 3: insertReport 함수 수정**

```typescript
export function insertReport(db: Database.Database, input: InsertReportInput): number {
  const result = db.prepare(
    "INSERT INTO reports (user_id, repository_id, project, date, title, content, date_start, date_end, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    input.userId, input.repositoryId, input.project, input.date,
    input.title, input.content,
    input.dateStart ?? null, input.dateEnd ?? null, input.status ?? "completed"
  );
  return result.lastInsertRowid as number;
}
```

- [ ] **Step 4: 보고서 상태 업데이트 함수 추가**

`src/infra/db/report.ts` 끝에 추가:

```typescript
export function updateReportStatus(
  db: Database.Database,
  id: number,
  status: string,
  updates?: { title?: string; content?: string }
): boolean {
  if (updates?.title && updates?.content) {
    const result = db.prepare(
      "UPDATE reports SET status = ?, title = ?, content = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, updates.title, updates.content, id);
    return result.changes > 0;
  }
  const result = db.prepare(
    "UPDATE reports SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, id);
  return result.changes > 0;
}
```

- [ ] **Step 5: 빌드 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/infra/db/schema.ts src/infra/db/report.ts
git commit -m "feat: reports 테이블에 date_start, date_end, status 컬럼 추가"
```

---

### Task 3: API — commit-calendar에 repoIds 필터 추가

**Files:**
- Modify: `src/app/api/repos/commit-calendar/route.ts`
- Modify: `src/app/api/repos/commit-calendar/[date]/route.ts`

- [ ] **Step 1: commit-calendar/route.ts에 repoIds 파라미터 추가**

`src/app/api/repos/commit-calendar/route.ts`의 GET 함수에서, `since`/`until` 파싱 뒤에 repoIds 파싱을 추가하고 repos 필터링:

```typescript
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

    const totalCounts: Record<string, number> = {};

    for (const repo of repos) {
      if (!repo.clone_path) continue;

      try {
        const branches = await getBranches(repo.clone_path);
        const counts = await getCommitCountsByDate(repo.clone_path, branches, since, until);

        for (const [date, count] of Object.entries(counts)) {
          totalCounts[date] = (totalCounts[date] || 0) + count;
        }
      } catch {
        // 저장소 오류 시 무시하고 계속
      }
    }

    return NextResponse.json(totalCounts);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: commit-calendar/[date]/route.ts에 repoIds 파라미터 추가**

`src/app/api/repos/commit-calendar/[date]/route.ts`의 GET 함수에서, date 검증 후 repoIds 파싱을 추가하고 repos 필터링:

```typescript
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

    const result: {
      repoId: number;
      repoName: string;
      owner: string;
      branches: { branch: string; commits: { sha: string; message: string; author: string; date: string }[] }[];
    }[] = [];

    for (const repo of repos) {
      if (!repo.clone_path) continue;

      try {
        const branches = await getBranches(repo.clone_path);
        const branchCommits = await getCommitsForDate(repo.clone_path, branches, date);

        if (branchCommits.length > 0) {
          result.push({
            repoId: repo.id,
            repoName: repo.repo,
            owner: repo.owner,
            branches: branchCommits,
          });
        }
      } catch {
        // 저장소 오류 시 무시
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/repos/commit-calendar/route.ts src/app/api/repos/commit-calendar/\[date\]/route.ts
git commit -m "feat: commit-calendar API에 repoIds 필터 파라미터 추가"
```

---

### Task 4: API — 기간 상세 조회 (range)

**Files:**
- Create: `src/app/api/repos/commit-calendar/range/route.ts`

- [ ] **Step 1: range API 구현**

`src/app/api/repos/commit-calendar/range/route.ts` 생성:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getRepositoriesByUser } from "@/infra/db/repository";
import { getBranches, getCommitsForDate } from "@/infra/git/git-client";
import { auth } from "@/lib/auth";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

interface DateRepoDetail {
  date: string;
  repos: {
    repoId: number;
    repoName: string;
    owner: string;
    branches: { branch: string; commits: { sha: string; message: string; author: string; date: string }[] }[];
  }[];
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const repoIdsParam = searchParams.get("repoIds");

  if (!since || !until) {
    return NextResponse.json({ error: "since and until are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  const db = getDb();
  try {
    let repos = getRepositoriesByUser(db, session.user.id);

    if (repoIdsParam) {
      const repoIdSet = new Set(repoIdsParam.split(",").map(Number));
      repos = repos.filter((r: any) => repoIdSet.has(r.id));
    }

    // 기간 내 모든 날짜 생성
    const dates: string[] = [];
    const current = new Date(since);
    const end = new Date(until);
    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    const result: DateRepoDetail[] = [];

    for (const date of dates) {
      const dateRepos: DateRepoDetail["repos"] = [];

      for (const repo of repos) {
        if (!repo.clone_path) continue;

        try {
          const branches = await getBranches(repo.clone_path);
          const branchCommits = await getCommitsForDate(repo.clone_path, branches, date);

          if (branchCommits.length > 0) {
            dateRepos.push({
              repoId: repo.id,
              repoName: repo.repo,
              owner: repo.owner,
              branches: branchCommits,
            });
          }
        } catch {
          // 저장소 오류 시 무시
        }
      }

      if (dateRepos.length > 0) {
        result.push({ date, repos: dateRepos });
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/repos/commit-calendar/range/route.ts
git commit -m "feat: 기간 상세 조회 API (commit-calendar/range) 추가"
```

---

### Task 5: API — 비동기 보고서 생성

**Files:**
- Modify: `src/app/api/reports/generate/route.ts`
- Modify: `src/app/api/reports/route.ts`

- [ ] **Step 1: reports/route.ts POST에 기간 필드 지원**

`src/app/api/reports/route.ts`의 POST 함수 body 파싱을 확장:

```typescript
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { repositoryId, project, date, title, content, dateStart, dateEnd, status } = body;

  if (!repositoryId || !project || !date || !title) {
    return NextResponse.json({ error: "repositoryId, project, date, title are required" }, { status: 400 });
  }

  const db = getDb();
  try {
    const id = insertReport(db, {
      userId: session.user.id,
      repositoryId,
      project,
      date,
      title,
      content: content || "",
      dateStart,
      dateEnd,
      status: status || "completed",
    });
    return NextResponse.json({ id, message: "Report saved" }, { status: 201 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: reports/generate/route.ts에 비동기 + 기간 보고서 지원**

`src/app/api/reports/generate/route.ts`를 전체 교체:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getRepositoryByIdAndUser } from "@/infra/db/repository";
import { insertReport, updateReportStatus } from "@/infra/db/report";
import { getDetailedCommitsForDate, getBranches } from "@/infra/git/git-client";
import { auth } from "@/lib/auth";
import { GoogleGenAI } from "@google/genai";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

interface CommitInfo {
  branch: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

async function collectCommitsForDate(
  repoPath: string, cloneUrl: string, branches: string[], date: string
): Promise<CommitInfo[]> {
  const seenShas = new Set<string>();
  const commits: CommitInfo[] = [];

  for (const branch of branches) {
    try {
      const branchCommits = await getDetailedCommitsForDate(repoPath, branch, cloneUrl, date);
      for (const c of branchCommits) {
        if (seenShas.has(c.sha)) continue;
        seenShas.add(c.sha);
        commits.push({
          branch, sha: c.sha, message: c.message, author: c.author,
          date: c.date, filesChanged: c.filesChanged,
          additions: c.additions, deletions: c.deletions,
        });
      }
    } catch {
      // 브랜치 오류 무시
    }
  }
  return commits;
}

function buildPrompt(
  owner: string, repo: string, dateLabel: string,
  allCommits: CommitInfo[], isRange: boolean
): string {
  const commitDetails = allCommits.map((c) => {
    const time = new Date(c.date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    const dateStr = c.date.slice(0, 10);
    const files = c.filesChanged.length > 0 ? c.filesChanged.join(", ") : "(파일 정보 없음)";
    return `[${dateStr}] [${c.branch}] ${time} - ${c.message}
  변경 파일: ${files}
  변경량: +${c.additions} / -${c.deletions}`;
  }).join("\n\n");

  const totalAdditions = allCommits.reduce((s, c) => s + c.additions, 0);
  const totalDeletions = allCommits.reduce((s, c) => s + c.deletions, 0);
  const branchSet = [...new Set(allCommits.map((c) => c.branch))];
  const dateSet = [...new Set(allCommits.map((c) => c.date.slice(0, 10)))];

  const periodDesc = isRange ? `기간: ${dateLabel} (${dateSet.length}일간 활동)` : `날짜: ${dateLabel}`;

  return `당신은 소프트웨어 개발팀의 업무 보고서 작성 도우미입니다.
아래 Git 커밋 데이터를 분석하여 ${isRange ? "기간" : "해당일"}의 **업무 보고서**를 작성해주세요.

## 기본 정보
- 프로젝트: ${owner}/${repo}
- ${periodDesc}
- 총 커밋: ${allCommits.length}건
- 총 변경량: +${totalAdditions} / -${totalDeletions}
- 작업 브랜치: ${branchSet.join(", ")}

## 커밋 상세
${commitDetails}

## 보고서 작성 규칙
1. **업무 요약**: 수행한 주요 업무를 3줄 이내로 요약
2. **상세 업무 내용**: 관련된 커밋들을 묶어서 업무 단위로 정리. 각 업무마다:
   - 업무 제목
   - 수행한 내용 설명 (커밋 메시지와 변경 파일을 근거로)
   - 관련 파일 목록
3. **특이 사항**: 버그 수정, 리팩토링, 새 기능 등 주목할 점이 있으면 기재
${isRange ? "4. **일자별 정리**: 날짜별로 업무를 그룹핑하여 흐름이 보이도록 작성" : ""}

보고서는 한국어로 작성하고, 마크다운 형식으로 출력해주세요.
보고서 제목이나 날짜는 포함하지 마세요 — 본문만 작성해주세요.`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { repoId, date, dateRange, async: isAsync } = body;

  if (!repoId || (!date && !dateRange)) {
    return NextResponse.json({ error: "repoId and (date or dateRange) are required" }, { status: 400 });
  }

  const db = getDb();
  try {
    const repo = getRepositoryByIdAndUser(db, Number(repoId), session.user.id);
    if (!repo) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    if (!repo.clone_path) return NextResponse.json({ error: "Repository not yet cloned" }, { status: 400 });

    const isRange = !!dateRange;
    const branches = await getBranches(repo.clone_path);

    if (isAsync) {
      // 비동기 모드: pending 보고서 생성 후 백그라운드에서 처리
      const dateLabel = isRange ? `${dateRange.since} ~ ${dateRange.until}` : date;
      const title = `[${repo.owner}/${repo.repo}] ${dateLabel} 업무 보고서`;
      const reportId = insertReport(db, {
        userId: session.user.id,
        repositoryId: Number(repoId),
        project: `${repo.owner}/${repo.repo}`,
        date: isRange ? dateRange.since : date,
        title,
        content: "",
        dateStart: isRange ? dateRange.since : undefined,
        dateEnd: isRange ? dateRange.until : undefined,
        status: "pending",
      });

      // 백그라운드 생성 — fire and forget
      const clonePath = repo.clone_path;
      const cloneUrl = repo.clone_url;
      const owner = repo.owner;
      const repoName = repo.repo;
      const userId = session.user.id;

      (async () => {
        const bgDb = getDb();
        try {
          const allCommits: CommitInfo[] = [];

          if (isRange) {
            const current = new Date(dateRange.since);
            const end = new Date(dateRange.until);
            while (current <= end) {
              const d = current.toISOString().slice(0, 10);
              const dayCommits = await collectCommitsForDate(clonePath, cloneUrl, branches, d);
              allCommits.push(...dayCommits);
              current.setDate(current.getDate() + 1);
            }
          } else {
            const dayCommits = await collectCommitsForDate(clonePath, cloneUrl, branches, date);
            allCommits.push(...dayCommits);
          }

          if (allCommits.length === 0) {
            updateReportStatus(bgDb, reportId, "error", { title, content: "해당 기간에 커밋이 없습니다." });
            return;
          }

          const prompt = buildPrompt(owner, repoName, dateLabel, allCommits, isRange);
          const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
          const result = await genai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });

          const content = result.text ?? "";
          updateReportStatus(bgDb, reportId, "completed", { title, content });
        } catch (error: any) {
          console.error("[Report Generate Async]", error);
          updateReportStatus(bgDb, reportId, "error", {
            title,
            content: `보고서 생성 실패: ${error.message || "알 수 없는 오류"}`,
          });
        } finally {
          bgDb.close();
        }
      })();

      return NextResponse.json({ id: reportId, status: "pending" }, { status: 202 });
    }

    // 동기 모드: 기존 동작 유지
    const allCommits: CommitInfo[] = [];

    if (isRange) {
      const current = new Date(dateRange.since);
      const end = new Date(dateRange.until);
      while (current <= end) {
        const d = current.toISOString().slice(0, 10);
        const dayCommits = await collectCommitsForDate(repo.clone_path, repo.clone_url, branches, d);
        allCommits.push(...dayCommits);
        current.setDate(current.getDate() + 1);
      }
    } else {
      const dayCommits = await collectCommitsForDate(repo.clone_path, repo.clone_url, branches, date);
      allCommits.push(...dayCommits);
    }

    if (allCommits.length === 0) {
      return NextResponse.json({ error: "해당 기간에 커밋이 없습니다." }, { status: 400 });
    }

    const dateLabel = isRange ? `${dateRange.since} ~ ${dateRange.until}` : date;
    const prompt = buildPrompt(repo.owner, repo.repo, dateLabel, allCommits, isRange);

    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const report = result.text ?? "";
    const totalAdditions = allCommits.reduce((s, c) => s + c.additions, 0);
    const totalDeletions = allCommits.reduce((s, c) => s + c.deletions, 0);
    const branchSet = [...new Set(allCommits.map((c) => c.branch))];

    return NextResponse.json({
      title: `[${repo.owner}/${repo.repo}] ${dateLabel} 업무 보고서`,
      content: report,
      meta: { totalCommits: allCommits.length, totalAdditions, totalDeletions, branches: branchSet },
    });
  } catch (error: any) {
    console.error("[Report Generate]", error);
    return NextResponse.json({ error: error.message || "보고서 생성 실패" }, { status: 500 });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/reports/generate/route.ts src/app/api/reports/route.ts
git commit -m "feat: 비동기 보고서 생성 + 기간 보고서 지원"
```

---

### Task 6: 컴포넌트 — calendar-grid.tsx 추출

기존 MonthGrid와 유틸 함수를 별도 파일로 추출. 기간 하이라이트 기능 추가.

**Files:**
- Create: `src/app/(dashboard)/task-calendar/components/calendar-grid.tsx`

- [ ] **Step 1: calendar-grid.tsx 생성**

```typescript
"use client";

import { useMemo } from "react";

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { firstDay, daysInMonth };
}

export function formatMonth(year: number, month: number) {
  return `${year}년 ${month + 1}월`;
}

function getIntensityClass(count: number, maxCount: number): string {
  if (count === 0) return "bg-muted";
  const ratio = count / maxCount;
  if (ratio <= 0.25) return "bg-emerald-200 dark:bg-emerald-900";
  if (ratio <= 0.5) return "bg-emerald-400 dark:bg-emerald-700";
  if (ratio <= 0.75) return "bg-emerald-500 dark:bg-emerald-600";
  return "bg-emerald-700 dark:bg-emerald-400";
}

function getIntensityText(count: number, maxCount: number): string {
  if (count === 0) return "text-muted-foreground";
  const ratio = count / maxCount;
  if (ratio <= 0.25) return "text-emerald-800 dark:text-emerald-200";
  if (ratio <= 0.5) return "text-white dark:text-emerald-100";
  return "text-white dark:text-emerald-50";
}

const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

interface CalendarGridProps {
  year: number;
  month: number;
  commitCounts: Record<string, number>;
  maxCount: number;
  selectedDate: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  onSelectDate: (date: string) => void;
}

function isInRange(dateStr: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  return dateStr >= start && dateStr <= end;
}

export function CalendarGrid({
  year, month, commitCounts, maxCount, selectedDate,
  rangeStart, rangeEnd, onSelectDate,
}: CalendarGridProps) {
  const today = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);

  const { firstDay, daysInMonth } = getMonthDays(year, month);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{formatMonth(year, month)}</h3>
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((d) => (
          <div key={d} className="text-[10px] text-center text-muted-foreground font-medium py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const count = commitCounts[dateStr] || 0;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate && !rangeStart;
          const inRange = isInRange(dateStr, rangeStart, rangeEnd);
          const isRangeEdge = dateStr === rangeStart || dateStr === rangeEnd;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`
                relative aspect-square rounded-md text-xs flex flex-col items-center justify-center transition-all
                ${getIntensityClass(count, maxCount)}
                ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""}
                ${isRangeEdge ? "ring-2 ring-primary ring-offset-1" : ""}
                ${inRange && !isRangeEdge ? "ring-1 ring-primary/40" : ""}
                ${isToday ? "font-bold" : ""}
                hover:ring-2 hover:ring-primary/50
              `}
            >
              <span className={`leading-none ${count > 0 ? getIntensityText(count, maxCount) : "text-muted-foreground"}`}>
                {day}
              </span>
              {count > 0 && (
                <span className={`text-[9px] leading-none mt-0.5 ${getIntensityText(count, maxCount)}`}>
                  {count}
                </span>
              )}
              {isToday && (
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/\(dashboard\)/task-calendar/components/calendar-grid.tsx
git commit -m "feat: CalendarGrid 컴포넌트 추출 — 기간 하이라이트 지원"
```

---

### Task 7: 컴포넌트 — repo-filter.tsx

**Files:**
- Create: `src/app/(dashboard)/task-calendar/components/repo-filter.tsx`

- [ ] **Step 1: repo-filter.tsx 생성**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { FolderGit2, ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Repo {
  id: number;
  owner: string;
  repo: string;
}

interface RepoFilterProps {
  repos: Repo[];
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
}

export function RepoFilter({ repos, selectedIds, onSelectionChange }: RepoFilterProps) {
  const [open, setOpen] = useState(false);

  const allSelected = repos.length > 0 && selectedIds.size === repos.length;

  function toggleAll() {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(repos.map((r) => r.id)));
    }
  }

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  const selectedRepos = repos.filter((r) => selectedIds.has(r.id));
  const visibleChips = selectedRepos.slice(0, 3);
  const moreCount = selectedRepos.length - visibleChips.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <FolderGit2 className="h-3.5 w-3.5" />
          {selectedIds.size === 0 ? (
            "저장소 선택"
          ) : selectedIds.size === repos.length ? (
            "전체 저장소"
          ) : (
            <span className="flex items-center gap-1">
              {visibleChips.map((r) => (
                <Badge key={r.id} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                  {r.repo}
                </Badge>
              ))}
              {moreCount > 0 && (
                <span className="text-muted-foreground">+{moreCount}</span>
              )}
            </span>
          )}
          <ChevronDown className="h-3 w-3 ml-1 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="저장소 검색..." />
          <CommandList>
            <CommandEmpty>저장소를 찾을 수 없습니다</CommandEmpty>
            {/* 전체 선택/해제 */}
            <CommandItem onSelect={toggleAll} className="gap-2">
              <Checkbox checked={allSelected} />
              <span className="font-medium text-xs">전체 선택</span>
            </CommandItem>
            <div className="h-px bg-border mx-1 my-1" />
            {repos.map((repo) => (
              <CommandItem key={repo.id} onSelect={() => toggle(repo.id)} className="gap-2">
                <Checkbox checked={selectedIds.has(repo.id)} />
                <span className="text-xs">{repo.owner}/{repo.repo}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/\(dashboard\)/task-calendar/components/repo-filter.tsx
git commit -m "feat: RepoFilter 저장소 멀티셀렉트 컴포넌트 구현"
```

---

### Task 8: 컴포넌트 — period-presets.tsx

**Files:**
- Create: `src/app/(dashboard)/task-calendar/components/period-presets.tsx`

- [ ] **Step 1: period-presets.tsx 생성**

```typescript
"use client";

import { Button } from "@/components/ui/button";

type PresetKey = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom" | null;

interface PeriodPresetsProps {
  activePreset: PresetKey;
  onPresetChange: (preset: PresetKey, range: { since: string; until: string } | null) => void;
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPresetRange(preset: PresetKey): { since: string; until: string } | null {
  if (!preset || preset === "custom") return null;
  const today = new Date();

  switch (preset) {
    case "thisWeek": {
      const monday = getMonday(today);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { since: formatDate(monday), until: formatDate(sunday) };
    }
    case "lastWeek": {
      const monday = getMonday(today);
      monday.setDate(monday.getDate() - 7);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { since: formatDate(monday), until: formatDate(sunday) };
    }
    case "thisMonth": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { since: formatDate(first), until: formatDate(last) };
    }
    case "lastMonth": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { since: formatDate(first), until: formatDate(last) };
    }
    default:
      return null;
  }
}

const presets: { key: PresetKey; label: string }[] = [
  { key: "thisWeek", label: "이번 주" },
  { key: "lastWeek", label: "지난 주" },
  { key: "thisMonth", label: "이번 달" },
  { key: "lastMonth", label: "지난 달" },
  { key: "custom", label: "커스텀" },
];

export function PeriodPresets({ activePreset, onPresetChange }: PeriodPresetsProps) {
  function handleClick(key: PresetKey) {
    if (key === activePreset) {
      // 같은 프리셋 클릭 시 해제
      onPresetChange(null, null);
      return;
    }
    const range = getPresetRange(key);
    onPresetChange(key, range);
  }

  return (
    <div className="flex rounded-md border">
      {presets.map((p, i) => (
        <Button
          key={p.key}
          variant={activePreset === p.key ? "default" : "ghost"}
          size="sm"
          className={`text-xs h-8 ${i === 0 ? "rounded-r-none" : i === presets.length - 1 ? "rounded-l-none" : "rounded-none"}`}
          onClick={() => handleClick(p.key)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}

export type { PresetKey };
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/\(dashboard\)/task-calendar/components/period-presets.tsx
git commit -m "feat: PeriodPresets 기간 프리셋 버튼 그룹 구현"
```

---

### Task 9: 컴포넌트 — date-detail-panel.tsx

기존 page.tsx의 단일 날짜 상세 + 보고서 작성 로직을 추출.

**Files:**
- Create: `src/app/(dashboard)/task-calendar/components/date-detail-panel.tsx`

- [ ] **Step 1: date-detail-panel.tsx 생성**

```typescript
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CalendarDays, GitCommit, GitBranch, FolderGit2, FileText, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface RepoDateDetail {
  repoId: number;
  repoName: string;
  owner: string;
  branches: {
    branch: string;
    commits: { sha: string; message: string; author: string; date: string }[];
  }[];
}

interface DateDetailPanelProps {
  selectedDate: string;
  commitCount: number;
  repoIds: string; // 쉼표 구분
}

export function DateDetailPanel({ selectedDate, commitCount, repoIds }: DateDetailPanelProps) {
  const [dateDetail, setDateDetail] = useState<RepoDateDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());

  // 보고서 모달
  const [reportRepo, setReportRepo] = useState<RepoDateDetail | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);

  useEffect(() => {
    setExpandedBranches(new Set());
    setLoading(true);
    const params = repoIds ? `?repoIds=${repoIds}` : "";
    fetch(`/api/repos/commit-calendar/${selectedDate}${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDateDetail(data);
      })
      .catch(() => setDateDetail([]))
      .finally(() => setLoading(false));
  }, [selectedDate, repoIds]);

  async function openReport(repo: RepoDateDetail) {
    if (!confirm(`${selectedDate} — ${repo.owner}/${repo.repoName}\n\n해당일 태스크 보고서를 작성하시겠습니까?`)) return;

    setReportRepo(repo);
    setReportTitle(`[${repo.owner}/${repo.repoName}] ${selectedDate} 업무 보고서`);
    setReportContent("");
    setReportGenerating(true);

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId: repo.repoId, date: selectedDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setReportTitle(data.title);
        setReportContent(data.content);
      } else {
        toast.error(data.error || "보고서 생성 실패");
        setReportContent("보고서 생성에 실패했습니다. 직접 작성해주세요.");
      }
    } catch {
      toast.error("보고서 생성 중 오류가 발생했습니다");
      setReportContent("보고서 생성에 실패했습니다. 직접 작성해주세요.");
    } finally {
      setReportGenerating(false);
    }
  }

  function closeReport() {
    setReportRepo(null);
    setReportTitle("");
    setReportContent("");
  }

  async function handleCopyReport() {
    if (!reportContent.trim()) { toast.error("보고서 내용이 없습니다"); return; }
    setReportSaving(true);
    try {
      await navigator.clipboard.writeText(`# ${reportTitle}\n\n${reportContent}`);
      toast.success("보고서가 클립보드에 복사되었습니다");
    } catch { toast.error("클립보드 복사에 실패했습니다"); }
    finally { setReportSaving(false); }
  }

  async function handleSaveReport() {
    if (!reportContent.trim() || !reportRepo) return;
    setReportSaving(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryId: reportRepo.repoId,
          project: `${reportRepo.owner}/${reportRepo.repoName}`,
          date: selectedDate,
          title: reportTitle,
          content: reportContent,
        }),
      });
      if (res.ok) { toast.success("보고서가 저장되었습니다"); closeReport(); }
      else { const data = await res.json(); toast.error(data.error || "저장 실패"); }
    } catch { toast.error("보고서 저장 중 오류가 발생했습니다"); }
    finally { setReportSaving(false); }
  }

  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{selectedDate}</span>
        <Badge variant="outline" className="text-xs">{commitCount}개 커밋</Badge>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-muted-foreground animate-pulse">커밋 상세 로딩 중...</div>
      ) : dateDetail.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">이 날짜에 커밋 활동이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {dateDetail.map((repo) => (
            <Card key={repo.repoId}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{repo.owner}/{repo.repoName}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {repo.branches.reduce((sum, b) => sum + b.commits.length, 0)} 커밋
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => openReport(repo)}>
                    <FileText className="h-3.5 w-3.5" />
                    보고서 작성
                  </Button>
                </div>

                <div className="ml-3 space-y-1 border-l-2 border-muted pl-4">
                  {repo.branches.map((branch) => {
                    const branchKey = `${repo.repoId}:${branch.branch}`;
                    const isOpen = expandedBranches.has(branchKey);
                    return (
                      <div key={branch.branch}>
                        <button
                          className="flex items-center gap-1.5 py-1 w-full text-left hover:bg-muted/50 rounded-sm px-1 -ml-1 transition-colors"
                          onClick={() => {
                            setExpandedBranches((prev) => {
                              const next = new Set(prev);
                              if (next.has(branchKey)) next.delete(branchKey);
                              else next.add(branchKey);
                              return next;
                            });
                          }}
                        >
                          <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">{branch.branch}</span>
                          <span className="text-[10px] text-muted-foreground">({branch.commits.length})</span>
                        </button>

                        {isOpen && (
                          <div className="ml-5 space-y-1 border-l border-dashed border-muted-foreground/30 pl-3 mt-1 mb-2">
                            {branch.commits.map((commit) => (
                              <div key={commit.sha} className="flex items-start gap-2">
                                <GitCommit className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/60 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <code className="text-[10px] text-muted-foreground font-mono">{commit.sha.slice(0, 7)}</code>
                                    <span className="text-xs text-muted-foreground">{commit.author}</span>
                                    <span className="text-[10px] text-muted-foreground/60">
                                      {new Date(commit.date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                  <p className="text-xs truncate">{commit.message}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 보고서 작성 모달 */}
      <Dialog open={reportRepo !== null} onOpenChange={(open) => { if (!open && !reportGenerating) closeReport(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />업무 보고서
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto min-h-0">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Badge variant="outline">{selectedDate}</Badge>
              {reportRepo && (
                <span className="flex items-center gap-1">
                  <FolderGit2 className="h-3.5 w-3.5" />{reportRepo.owner}/{reportRepo.repoName}
                </span>
              )}
            </div>
            {reportGenerating ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">커밋 데이터를 분석하여 보고서를 작성하고 있습니다...</p>
                <p className="text-xs text-muted-foreground">변경 파일과 커밋 내용을 기반으로 AI가 업무 보고서를 생성합니다</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium">제목</label>
                  <Input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium">내용</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">에디터에서 자유롭게 수정이 가능합니다.</span>
                      <button
                        className="text-[10px] px-2 py-0.5 rounded-full border border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 transition-colors"
                        onClick={handleCopyReport} disabled={!reportContent}
                      >복사</button>
                    </div>
                  </div>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[350px] resize-y focus:outline-none focus:ring-2 focus:ring-ring font-mono leading-relaxed"
                    value={reportContent} onChange={(e) => setReportContent(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          {!reportGenerating && (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={closeReport}>닫기</Button>
              <Button disabled={!reportContent || reportSaving} onClick={handleSaveReport}>보고서 저장</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/\(dashboard\)/task-calendar/components/date-detail-panel.tsx
git commit -m "feat: DateDetailPanel 단일 날짜 상세 컴포넌트 추출"
```

---

### Task 10: 컴포넌트 — range-detail-panel.tsx

기간 선택 시 날짜 > 저장소 > 브랜치 > 커밋 아코디언 + 기간 보고서 생성.

**Files:**
- Create: `src/app/(dashboard)/task-calendar/components/range-detail-panel.tsx`

- [ ] **Step 1: range-detail-panel.tsx 생성**

```typescript
"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, GitCommit, GitBranch, FolderGit2, FileText, ChevronRight, ChevronDown, Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface BranchCommits {
  branch: string;
  commits: { sha: string; message: string; author: string; date: string }[];
}

interface RepoDetail {
  repoId: number;
  repoName: string;
  owner: string;
  branches: BranchCommits[];
}

interface DateRepoDetail {
  date: string;
  repos: RepoDetail[];
}

interface RangeDetailPanelProps {
  rangeStart: string;
  rangeEnd: string;
  repoIds: string;
}

export function RangeDetailPanel({ rangeStart, rangeEnd, repoIds }: RangeDetailPanelProps) {
  const [data, setData] = useState<DateRepoDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [generatingRepoId, setGeneratingRepoId] = useState<number | null>(null);

  useEffect(() => {
    setExpandedDates(new Set());
    setExpandedBranches(new Set());
    setLoading(true);
    const params = new URLSearchParams({ since: rangeStart, until: rangeEnd });
    if (repoIds) params.set("repoIds", repoIds);
    fetch(`/api/repos/commit-calendar/range?${params}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setData(d); })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [rangeStart, rangeEnd, repoIds]);

  // 요약 통계
  const summary = useMemo(() => {
    const repoCommitCounts: Record<string, { owner: string; repoName: string; repoId: number; count: number }> = {};
    let totalCommits = 0;

    for (const day of data) {
      for (const repo of day.repos) {
        const key = `${repo.owner}/${repo.repoName}`;
        if (!repoCommitCounts[key]) {
          repoCommitCounts[key] = { owner: repo.owner, repoName: repo.repoName, repoId: repo.repoId, count: 0 };
        }
        for (const b of repo.branches) {
          repoCommitCounts[key].count += b.commits.length;
          totalCommits += b.commits.length;
        }
      }
    }

    return { totalCommits, activeDays: data.length, repos: Object.values(repoCommitCounts) };
  }, [data]);

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  function toggleBranch(key: string) {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function generateRangeReport(repo: { owner: string; repoName: string; repoId: number }) {
    if (!confirm(`${rangeStart} ~ ${rangeEnd} — ${repo.owner}/${repo.repoName}\n\n기간 보고서를 작성하시겠습니까?`)) return;

    setGeneratingRepoId(repo.repoId);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId: repo.repoId,
          dateRange: { since: rangeStart, until: rangeEnd },
          async: true,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        toast.success("보고서 생성이 요청되었습니다. 보고서 목록에서 확인하세요.");
      } else {
        toast.error(result.error || "보고서 생성 요청 실패");
      }
    } catch {
      toast.error("보고서 생성 요청 중 오류가 발생했습니다");
    } finally {
      setGeneratingRepoId(null);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {/* 기간 헤더 + 요약 */}
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{rangeStart} ~ {rangeEnd}</span>
        <Badge variant="outline" className="text-xs">{summary.totalCommits}개 커밋</Badge>
        <Badge variant="outline" className="text-xs">{summary.activeDays}일 활동</Badge>
      </div>

      {/* 저장소별 요약 + 기간 보고서 버튼 */}
      {summary.repos.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {summary.repos.map((repo) => (
            <Card key={repo.repoId} className="flex-1 min-w-[200px]">
              <CardContent className="py-2 px-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium">{repo.owner}/{repo.repoName}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{repo.count}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  disabled={generatingRepoId === repo.repoId}
                  onClick={() => generateRangeReport(repo)}
                >
                  {generatingRepoId === repo.repoId ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />요청 중...</>
                  ) : (
                    <><FileText className="h-3.5 w-3.5" />기간 보고서 작성</>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-muted-foreground animate-pulse">기간 커밋 데이터 로딩 중...</div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">선택한 기간에 커밋 활동이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {data.map((day) => {
            const dayCommitCount = day.repos.reduce(
              (sum, r) => sum + r.branches.reduce((s, b) => s + b.commits.length, 0), 0
            );
            const isDateOpen = expandedDates.has(day.date);

            return (
              <Card key={day.date}>
                <CardContent className="py-2">
                  {/* 날짜 헤더 */}
                  <button
                    className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded-sm px-1 py-1 transition-colors"
                    onClick={() => toggleDate(day.date)}
                  >
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isDateOpen ? "rotate-90" : ""}`} />
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{day.date}</span>
                    <Badge variant="outline" className="text-[10px]">{dayCommitCount} 커밋</Badge>
                    <Badge variant="secondary" className="text-[10px]">{day.repos.length} 저장소</Badge>
                  </button>

                  {/* 날짜 펼침: 저장소 > 브랜치 > 커밋 */}
                  {isDateOpen && (
                    <div className="ml-6 mt-2 space-y-2">
                      {day.repos.map((repo) => (
                        <div key={repo.repoId} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <FolderGit2 className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-medium">{repo.owner}/{repo.repoName}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {repo.branches.reduce((s, b) => s + b.commits.length, 0)} 커밋
                            </Badge>
                          </div>

                          <div className="ml-3 space-y-1 border-l-2 border-muted pl-4">
                            {repo.branches.map((branch) => {
                              const branchKey = `${day.date}:${repo.repoId}:${branch.branch}`;
                              const isOpen = expandedBranches.has(branchKey);
                              return (
                                <div key={branch.branch}>
                                  <button
                                    className="flex items-center gap-1.5 py-1 w-full text-left hover:bg-muted/50 rounded-sm px-1 -ml-1 transition-colors"
                                    onClick={() => toggleBranch(branchKey)}
                                  >
                                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground">{branch.branch}</span>
                                    <span className="text-[10px] text-muted-foreground">({branch.commits.length})</span>
                                  </button>

                                  {isOpen && (
                                    <div className="ml-5 space-y-1 border-l border-dashed border-muted-foreground/30 pl-3 mt-1 mb-2">
                                      {branch.commits.map((commit) => (
                                        <div key={commit.sha} className="flex items-start gap-2">
                                          <GitCommit className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/60 flex-shrink-0" />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                              <code className="text-[10px] text-muted-foreground font-mono">{commit.sha.slice(0, 7)}</code>
                                              <span className="text-xs text-muted-foreground">{commit.author}</span>
                                              <span className="text-[10px] text-muted-foreground/60">
                                                {new Date(commit.date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                                              </span>
                                            </div>
                                            <p className="text-xs truncate">{commit.message}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/\(dashboard\)/task-calendar/components/range-detail-panel.tsx
git commit -m "feat: RangeDetailPanel 기간 상세 패널 컴포넌트 구현"
```

---

### Task 11: page.tsx 리팩토링 — 컴포넌트 조합

기존 모놀리식 page.tsx를 새 컴포넌트들로 교체.

**Files:**
- Modify: `src/app/(dashboard)/task-calendar/page.tsx`

- [ ] **Step 1: page.tsx 전체 교체**

```typescript
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, GitCommit, CalendarDays } from "lucide-react";
import { CalendarGrid, formatMonth } from "./components/calendar-grid";
import { RepoFilter } from "./components/repo-filter";
import { PeriodPresets, type PresetKey } from "./components/period-presets";
import { DateDetailPanel } from "./components/date-detail-panel";
import { RangeDetailPanel } from "./components/range-detail-panel";

type ViewMode = "1month" | "3months";

interface RepoInfo {
  id: number;
  owner: string;
  repo: string;
}

export default function TaskCalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("1month");
  const [baseYear, setBaseYear] = useState(new Date().getFullYear());
  const [baseMonth, setBaseMonth] = useState(new Date().getMonth());
  const [commitCounts, setCommitCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // 저장소 필터
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<number>>(new Set());

  // 날짜/기간 선택
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [activePreset, setActivePreset] = useState<PresetKey>(null);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [customFirstClick, setCustomFirstClick] = useState<string | null>(null);

  // 저장소 목록 로드
  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const repoList = data.map((r: any) => ({ id: r.id, owner: r.owner, repo: r.repo }));
          setRepos(repoList);
          setSelectedRepoIds(new Set(repoList.map((r: RepoInfo) => r.id)));
        }
      })
      .catch(() => {});
  }, []);

  // 표시할 월 목록
  const months = useMemo(() => {
    const count = viewMode === "3months" ? 3 : 1;
    const result: { year: number; month: number }[] = [];
    for (let i = 0; i < count; i++) {
      let m = baseMonth + i;
      let y = baseYear;
      if (m > 11) { m -= 12; y += 1; }
      result.push({ year: y, month: m });
    }
    return result;
  }, [baseYear, baseMonth, viewMode]);

  // 데이터 범위 계산
  const calendarDateRange = useMemo(() => {
    const first = months[0];
    const last = months[months.length - 1];
    const since = `${first.year}-${String(first.month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(last.year, last.month + 1, 0).getDate();
    const until = `${last.year}-${String(last.month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { since, until };
  }, [months]);

  // repoIds 쿼리 파라미터
  const repoIdsParam = useMemo(() => {
    if (selectedRepoIds.size === 0 || selectedRepoIds.size === repos.length) return "";
    return Array.from(selectedRepoIds).join(",");
  }, [selectedRepoIds, repos]);

  // 커밋 카운트 로드
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ since: calendarDateRange.since, until: calendarDateRange.until });
    if (repoIdsParam) params.set("repoIds", repoIdsParam);
    fetch(`/api/repos/commit-calendar?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (typeof data === "object" && !data.error) setCommitCounts(data);
      })
      .finally(() => setLoading(false));
  }, [calendarDateRange, repoIdsParam]);

  const maxCount = useMemo(() => {
    const values = Object.values(commitCounts);
    return values.length > 0 ? Math.max(...values) : 1;
  }, [commitCounts]);

  const totalCommits = useMemo(() => Object.values(commitCounts).reduce((sum, c) => sum + c, 0), [commitCounts]);
  const activeDays = useMemo(() => Object.values(commitCounts).filter((c) => c > 0).length, [commitCounts]);

  const navigateMonth = (delta: number) => {
    let m = baseMonth + delta;
    let y = baseYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setBaseYear(y);
    setBaseMonth(m);
  };

  const goToday = () => {
    setBaseYear(new Date().getFullYear());
    setBaseMonth(new Date().getMonth());
  };

  // 프리셋 변경 핸들러
  const handlePresetChange = useCallback((preset: PresetKey, range: { since: string; until: string } | null) => {
    setActivePreset(preset);
    setCustomFirstClick(null);
    if (range) {
      setRangeStart(range.since);
      setRangeEnd(range.until);
      setSelectedDate(null);
    } else {
      setRangeStart(null);
      setRangeEnd(null);
    }
  }, []);

  // 날짜 클릭 핸들러
  const handleDateSelect = useCallback((date: string) => {
    if (activePreset === "custom") {
      // 커스텀 모드: 첫 클릭 = 시작일, 두 번째 클릭 = 종료일
      if (!customFirstClick) {
        setCustomFirstClick(date);
        setRangeStart(date);
        setRangeEnd(null);
        setSelectedDate(null);
      } else {
        const start = customFirstClick < date ? customFirstClick : date;
        const end = customFirstClick < date ? date : customFirstClick;
        setRangeStart(start);
        setRangeEnd(end);
        setSelectedDate(null);
        setCustomFirstClick(null);
      }
    } else {
      // 일반 모드: 단일 날짜 선택, 프리셋 해제
      setActivePreset(null);
      setRangeStart(null);
      setRangeEnd(null);
      setCustomFirstClick(null);
      setSelectedDate(date);
    }
  }, [activePreset, customFirstClick]);

  const isRangeMode = rangeStart !== null && rangeEnd !== null;
  const selectedCount = selectedDate ? (commitCounts[selectedDate] || 0) : 0;

  return (
    <div>
      <Header
        title="태스크 캘린더"
        description="연동된 저장소의 커밋 활동을 캘린더로 확인합니다"
      />

      {/* 컨트롤 바 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>오늘</Button>
          <Button variant="outline" size="sm" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium ml-2">
            {formatMonth(baseYear, baseMonth)}
            {viewMode === "3months" && ` — ${formatMonth(months[2].year, months[2].month)}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 mr-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <GitCommit className="h-3.5 w-3.5" />{totalCommits} 커밋
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />{activeDays}일 활동
            </span>
          </div>
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "1month" ? "default" : "ghost"}
              size="sm" className="rounded-r-none text-xs h-8"
              onClick={() => setViewMode("1month")}
            >1개월</Button>
            <Button
              variant={viewMode === "3months" ? "default" : "ghost"}
              size="sm" className="rounded-l-none text-xs h-8"
              onClick={() => setViewMode("3months")}
            >3개월</Button>
          </div>
        </div>
      </div>

      {/* 필터 바: 저장소 필터 + 기간 프리셋 */}
      <div className="flex items-center justify-between mb-6">
        <RepoFilter repos={repos} selectedIds={selectedRepoIds} onSelectionChange={setSelectedRepoIds} />
        <PeriodPresets activePreset={activePreset} onPresetChange={handlePresetChange} />
      </div>

      {/* 커스텀 기간 안내 */}
      {activePreset === "custom" && !rangeEnd && (
        <div className="mb-4 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          {customFirstClick
            ? `시작일: ${customFirstClick} — 종료일을 클릭하세요`
            : "캘린더에서 시작일을 클릭하세요"}
        </div>
      )}

      {/* 캘린더 그리드 */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 rounded-lg">
            <span className="text-sm text-muted-foreground animate-pulse">커밋 데이터 로딩 중...</span>
          </div>
        )}

        <div className={`grid gap-6 ${viewMode === "3months" ? "grid-cols-3" : "grid-cols-1 max-w-sm"}`}>
          {months.map(({ year, month }) => (
            <CalendarGrid
              key={`${year}-${month}`}
              year={year}
              month={month}
              commitCounts={commitCounts}
              maxCount={maxCount}
              selectedDate={selectedDate}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onSelectDate={handleDateSelect}
            />
          ))}
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground">
          <span>적음</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            <div className="w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-900" />
            <div className="w-3 h-3 rounded-sm bg-emerald-400 dark:bg-emerald-700" />
            <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-600" />
            <div className="w-3 h-3 rounded-sm bg-emerald-700 dark:bg-emerald-400" />
          </div>
          <span>많음</span>
        </div>

        {/* 하단 패널: 단일 날짜 or 기간 */}
        {isRangeMode ? (
          <RangeDetailPanel rangeStart={rangeStart} rangeEnd={rangeEnd} repoIds={repoIdsParam} />
        ) : selectedDate ? (
          <DateDetailPanel selectedDate={selectedDate} commitCount={selectedCount} repoIds={repoIdsParam} />
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/\(dashboard\)/task-calendar/page.tsx
git commit -m "refactor: task-calendar page.tsx를 5개 하위 컴포넌트로 분리"
```

---

### Task 12: 수동 테스트 + 최종 확인

- [ ] **Step 1: 개발 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 수동 테스트 체크리스트**

1. `/task-calendar` 접근 — 캘린더 로드 확인
2. 저장소 필터 드롭다운 — 검색, 선택/해제, 전체 토글
3. 저장소 필터 변경 시 히트맵 갱신 확인
4. 단일 날짜 클릭 — 기존처럼 상세 패널 표시
5. 프리셋 클릭 (이번 주 등) — 기간 하이라이트 + 기간 패널
6. 커스텀 클릭 → 시작일/종료일 선택 — 기간 패널 표시
7. 기간 보고서 작성 버튼 — 비동기 요청 후 토스트
8. `/reports`에서 생성된 보고서 확인

- [ ] **Step 3: 최종 커밋 (필요 시 수정 반영)**

```bash
git add -A
git commit -m "fix: 수동 테스트 후 수정 사항 반영"
```
