# 대시보드 Contribution 히트맵 & Language 인디케이터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드에 GitHub 스타일 6개월 contribution 히트맵 카드를 추가하고, 각 저장소에 메인 language 인디케이터 라벨을 표시한다.

**Architecture:** DB에 `primary_language` 컬럼을 추가하고, 저장소 등록/동기화 시 GitHub API로 language를 가져온다. 히트맵은 기존 `commit_cache` 테이블에서 날짜별 집계 API를 만들고, 클라이언트에서 CSS grid로 렌더링한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, better-sqlite3, @octokit/rest, OKLCH color-hash

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `src/infra/db/schema.ts` | 수정: `primary_language` 마이그레이션 추가 |
| `src/infra/db/repository.ts` | 수정: `updatePrimaryLanguage()`, `getHeatmapCounts()` 추가 |
| `src/infra/github/github-client.ts` | 수정: `fetchRepoLanguage()` 추가 |
| `src/app/api/commits/heatmap/route.ts` | 신규: 히트맵 데이터 API |
| `src/app/api/repos/route.ts` | 수정: POST에서 language 저장 |
| `src/scheduler/polling-manager.ts` | 수정: 동기화 시 language 갱신 |
| `src/components/data-display/language-badge.tsx` | 신규: language pill 배지 컴포넌트 |
| `src/components/data-display/contribution-heatmap.tsx` | 신규: 히트맵 컴포넌트 |
| `src/app/(dashboard)/page.tsx` | 수정: 히트맵 카드 + language badge 삽입 |
| `src/app/(dashboard)/repos/page.tsx` | 수정: language badge 삽입 |

---

### Task 1: DB 마이그레이션 — `primary_language` 컬럼 추가

**Files:**
- Modify: `src/infra/db/schema.ts:82-142`

- [ ] **Step 1: `migrateSchema`에 `primary_language` 마이그레이션 추가**

`src/infra/db/schema.ts`의 `migrateSchema` 함수 끝부분, `status` 마이그레이션 블록 뒤에 추가:

```typescript
  if (!repoColumnNames.includes("primary_language")) {
    db.exec("ALTER TABLE repositories ADD COLUMN primary_language TEXT");
  }
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/infra/db/schema.ts
git commit -m "feat: repositories 테이블에 primary_language 컬럼 마이그레이션 추가"
```

---

### Task 2: DB 함수 — `updatePrimaryLanguage`, `getHeatmapCounts`

**Files:**
- Modify: `src/infra/db/repository.ts`

- [ ] **Step 1: `updatePrimaryLanguage` 함수 추가**

`src/infra/db/repository.ts`의 `updateGitAuthor` 함수 뒤에 추가:

```typescript
export function updatePrimaryLanguage(db: Database.Database, id: number, language: string | null): void {
  db.prepare(
    "UPDATE repositories SET primary_language = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(language, id);
}
```

- [ ] **Step 2: `getHeatmapCounts` 함수 추가**

`getCommitsByDate` 함수 뒤에 추가. 이 함수는 사용자의 전체 저장소에서 author 필터를 적용하여 날짜별 커밋 수를 집계한다:

```typescript
export function getHeatmapCounts(
  db: Database.Database,
  userId: string,
  since: string,
  until: string
): Record<string, number> {
  const repos = getRepositoriesByUser(db, userId);
  if (repos.length === 0) return {};

  const repoIds: number[] = [];
  const allAuthors: string[] = [];

  for (const repo of repos) {
    repoIds.push(repo.id);
    if (repo.git_author) {
      const authors = repo.git_author.split(",").map((a: string) => a.trim()).filter(Boolean);
      allAuthors.push(...authors);
    }
  }

  return getCommitCountsByDateRange(
    db,
    repoIds,
    since,
    until,
    allAuthors.length > 0 ? allAuthors : undefined
  );
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/infra/db/repository.ts
git commit -m "feat: updatePrimaryLanguage, getHeatmapCounts DB 함수 추가"
```

---

### Task 3: GitHub API — `fetchRepoLanguage`

**Files:**
- Modify: `src/infra/github/github-client.ts`

- [ ] **Step 1: `fetchRepoLanguage` 함수 추가**

파일 끝에 추가:

```typescript
export async function fetchRepoLanguage(owner: string, repo: string): Promise<string | null> {
  const client = getOctokit();
  const { data } = await client.rest.repos.get({ owner, repo });
  return data.language ?? null;
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/infra/github/github-client.ts
git commit -m "feat: fetchRepoLanguage GitHub API 함수 추가"
```

---

### Task 4: 히트맵 API 엔드포인트

**Files:**
- Create: `src/app/api/commits/heatmap/route.ts`

- [ ] **Step 1: 히트맵 API route 작성**

```typescript
// src/app/api/commits/heatmap/route.ts
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getHeatmapCounts } from "@/infra/db/repository";
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
  const months = Math.min(Number(searchParams.get("months") || 6), 12);

  const until = new Date().toISOString().split("T")[0];
  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - months);
  const since = sinceDate.toISOString().split("T")[0];

  const db = getDb();
  try {
    const data = getHeatmapCounts(db, session.user.id, since, until);
    return NextResponse.json({ data, since, until });
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
git add src/app/api/commits/heatmap/route.ts
git commit -m "feat: 히트맵 데이터 API 엔드포인트 추가"
```

---

### Task 5: 저장소 등록 시 language 저장

**Files:**
- Modify: `src/app/api/repos/route.ts:89-123`

- [ ] **Step 1: import 추가**

`src/app/api/repos/route.ts` 상단 import에 추가:

```typescript
import { fetchRepoLanguage } from "@/infra/github/github-client";
import { updatePrimaryLanguage } from "@/infra/db/repository";
```

기존 `@/infra/db/repository` import에 `updatePrimaryLanguage`를 추가한다.

- [ ] **Step 2: 백그라운드 클론 로직에 language 저장 추가**

`POST` 함수 내 백그라운드 IIFE (`(async () => { ... })()`) 에서, `console.log(`[Repos] Cloned ...`)` 라인 바로 뒤에 language 저장 로직 추가:

```typescript
        // language 저장
        try {
          const language = await fetchRepoLanguage(parsed!.owner, parsed!.repo);
          const langDb = getDb();
          try {
            updatePrimaryLanguage(langDb, repoRow.id, language);
          } finally {
            langDb.close();
          }
        } catch (langErr) {
          console.error(`[Repos] Language fetch failed for ${cloneUrl}:`, langErr);
        }
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/repos/route.ts
git commit -m "feat: 저장소 등록 시 GitHub API로 primary_language 저장"
```

---

### Task 6: 폴링 동기화 시 language 갱신

**Files:**
- Modify: `src/scheduler/polling-manager.ts:85-113`

- [ ] **Step 1: import 추가**

기존 `@/infra/db/repository` import에 `updatePrimaryLanguage` 추가.
기존 `@/infra/github/github-client.ts`가 없으므로 신규 import 추가:

```typescript
import { fetchRepoLanguage } from "@/infra/github/github-client";
```

기존 `@/infra/db/repository` import 리스트에 `updatePrimaryLanguage` 추가.

- [ ] **Step 2: 동기화 루프에 language 갱신 추가**

`runSyncCycle` 함수 내 각 repo 루프에서 `await pullRepository(repo.clone_path)` 바로 뒤, 캐시 빌드 블록 전에 추가:

```typescript
            // language 갱신
            try {
              const language = await fetchRepoLanguage(repo.owner, repo.repo);
              updatePrimaryLanguage(database, repo.id, language);
            } catch (langErr) {
              console.error(`[Scheduler] ${repo.owner}/${repo.repo}: language fetch failed -`, langErr);
            }
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/scheduler/polling-manager.ts
git commit -m "feat: 폴링 동기화 시 primary_language 갱신"
```

---

### Task 7: LanguageBadge 컴포넌트

**Files:**
- Create: `src/components/data-display/language-badge.tsx`

- [ ] **Step 1: LanguageBadge 컴포넌트 작성**

```typescript
"use client";

import { stringColor, oklch } from "@/lib/color-hash";

interface LanguageBadgeProps {
  language: string | null | undefined;
}

export function LanguageBadge({ language }: LanguageBadgeProps) {
  if (!language) return null;

  const color = stringColor(language);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: oklch(color.bgLight),
        color: oklch(color.solid),
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: oklch(color.solid) }}
      />
      {language}
    </span>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/data-display/language-badge.tsx
git commit -m "feat: LanguageBadge 컴포넌트 추가"
```

---

### Task 8: ContributionHeatmap 컴포넌트

**Files:**
- Create: `src/components/data-display/contribution-heatmap.tsx`

- [ ] **Step 1: ContributionHeatmap 컴포넌트 작성**

```typescript
"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface ContributionHeatmapProps {
  data: Record<string, number>;
  months?: number;
}

const levels = [
  "oklch(0.920 0.000 0)",      // level 0: 빈칸 (muted gray)
  "oklch(0.900 0.040 145)",    // level 1
  "oklch(0.780 0.100 145)",    // level 2
  "oklch(0.640 0.160 145)",    // level 3
  "oklch(0.500 0.200 145)",    // level 4
];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export function ContributionHeatmap({ data, months = 6 }: ContributionHeatmapProps) {
  const { weeks, monthMarkers, totalCommits } = useMemo(() => {
    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - months);
    // 시작일을 해당 주 일요일로 맞춤
    start.setDate(start.getDate() - start.getDay());

    const allWeeks: { date: Date; count: number }[][] = [];
    let currentWeek: { date: Date; count: number }[] = [];
    const markers: { weekIndex: number; label: string }[] = [];
    let total = 0;
    let lastMonth = -1;

    const cursor = new Date(start);
    let weekIndex = 0;

    while (cursor <= today) {
      const dateStr = formatDate(cursor);
      const count = data[dateStr] || 0;
      total += count;

      const curMonth = cursor.getMonth();
      if (curMonth !== lastMonth) {
        markers.push({ weekIndex, label: monthNames[curMonth] });
        lastMonth = curMonth;
      }

      currentWeek.push({ date: new Date(cursor), count });

      if (cursor.getDay() === 6) {
        allWeeks.push(currentWeek);
        currentWeek = [];
        weekIndex++;
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      allWeeks.push(currentWeek);
    }

    return { weeks: allWeeks, monthMarkers: markers, totalCommits: total };
  }, [data, months]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Contributions</h2>
          <span className="text-sm text-muted-foreground">
            최근 {months}개월간 {totalCommits}개 커밋
          </span>
        </div>

        <div className="overflow-x-auto">
          {/* 월 라벨 */}
          <div className="flex mb-1" style={{ paddingLeft: "28px" }}>
            {monthMarkers.map((m, i) => (
              <span
                key={i}
                className="text-xs text-muted-foreground"
                style={{
                  position: "relative",
                  left: `${m.weekIndex * 16}px`,
                  marginRight: i < monthMarkers.length - 1
                    ? `${(monthMarkers[i + 1].weekIndex - m.weekIndex) * 16 - 30}px`
                    : 0,
                }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex gap-0.5">
            {/* 요일 라벨 */}
            <div className="flex flex-col gap-0.5 mr-1">
              {dayLabels.map((label, i) => (
                <span
                  key={i}
                  className="text-[10px] text-muted-foreground leading-none flex items-center justify-end"
                  style={{ width: "20px", height: "12px" }}
                >
                  {i % 2 === 1 ? label : ""}
                </span>
              ))}
            </div>

            {/* 히트맵 격자 */}
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {Array.from({ length: 7 }, (_, di) => {
                  const cell = week.find((c) => c.date.getDay() === di);
                  if (!cell) {
                    return <div key={di} className="w-3 h-3" />;
                  }
                  const level = getLevel(cell.count);
                  const dateStr = formatDate(cell.date);
                  return (
                    <div
                      key={di}
                      className="w-3 h-3 rounded-sm transition-colors"
                      style={{ backgroundColor: levels[level] }}
                      title={`${dateStr}: ${cell.count}개 커밋`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* 범례 */}
          <div className="flex items-center justify-end gap-1 mt-2">
            <span className="text-[10px] text-muted-foreground mr-1">적음</span>
            {levels.map((color, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">많음</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/data-display/contribution-heatmap.tsx
git commit -m "feat: ContributionHeatmap 컴포넌트 추가"
```

---

### Task 9: 대시보드 페이지에 히트맵 + language badge 통합

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: import 추가**

기존 import 블록에 추가:

```typescript
import { ContributionHeatmap } from "@/components/data-display/contribution-heatmap";
import { LanguageBadge } from "@/components/data-display/language-badge";
```

- [ ] **Step 2: 히트맵 데이터 fetch 추가**

`DashboardPage` 컴포넌트에 state + fetch 추가:

```typescript
const [heatmapData, setHeatmapData] = useState<Record<string, number>>({});
```

기존 `useEffect` 내부에 추가:

```typescript
fetch("/api/commits/heatmap?months=6").then((r) => r.json()).then((d) => setHeatmapData(d.data || {}));
```

- [ ] **Step 3: 히트맵 카드 삽입**

StatCard 3개의 `</div>` 닫는 태그 바로 뒤, 저장소 목록 `<Card>` 바로 앞에 추가:

```tsx
<div className="mb-6">
  <ContributionHeatmap data={heatmapData} months={6} />
</div>
```

- [ ] **Step 4: 저장소 목록에 language badge 추가**

저장소 목록의 `<p className="font-medium">{repo.owner}/{repo.repo}</p>` 바로 뒤에 추가:

```tsx
<LanguageBadge language={repo.primary_language} />
```

- [ ] **Step 5: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/app/(dashboard)/page.tsx
git commit -m "feat: 대시보드에 히트맵 카드 + language badge 통합"
```

---

### Task 10: 저장소 관리 페이지에 language badge 추가

**Files:**
- Modify: `src/app/(dashboard)/repos/page.tsx`

- [ ] **Step 1: import 추가**

```typescript
import { LanguageBadge } from "@/components/data-display/language-badge";
```

- [ ] **Step 2: 저장소 카드에 language badge 삽입**

저장소 카드의 `<span className="font-semibold text-sm">{repo.owner}/{repo.repo}</span>` 바로 뒤, `<div className="flex gap-1">` 앞에 추가:

```tsx
<LanguageBadge language={repo.primary_language} />
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/(dashboard)/repos/page.tsx
git commit -m "feat: 저장소 관리 페이지에 language badge 추가"
```

---

### Task 11: 수동 검증

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev`

- [ ] **Step 2: 대시보드 확인**

브라우저에서 대시보드 접속:
- StatCard 아래에 히트맵 카드가 보이는지 확인
- 히트맵 셀 hover 시 tooltip이 나타나는지 확인
- 저장소 목록에 language pill이 표시되는지 확인

- [ ] **Step 3: 저장소 관리 페이지 확인**

저장소 관리 페이지 접속:
- 각 저장소 카드에 language pill이 표시되는지 확인

- [ ] **Step 4: 최종 커밋**

문제가 있으면 수정 후 커밋.
