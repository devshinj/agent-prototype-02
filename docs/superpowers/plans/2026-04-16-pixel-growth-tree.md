# Pixel Growth Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 히트맵 우측에 Git 활동을 픽셀 아트 나무로 시각화하는 위젯을 추가한다.

**Architecture:** 서버의 `getDashboardStats` 리포지토리 함수에 본인 누적/역대 최대 일일 커밋 2개 필드를 확장하고, 클라이언트에 Canvas 기반 픽셀 렌더링 위젯을 신규 추가한다. heatmap 컴포넌트 내부의 streak/formatDate 유틸을 공유 위치로 이동해 나무 위젯과 재사용한다.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest, better-sqlite3, Canvas 2D API

**Spec reference:** [docs/superpowers/specs/2026-04-16-pixel-growth-tree-design.md](../specs/2026-04-16-pixel-growth-tree-design.md)

---

## File Structure

**Create:**
- `src/components/growth-tree/growth-tree.tsx` — 카드 컨테이너, props 받아 레이아웃
- `src/components/growth-tree/tree-canvas.tsx` — Canvas 렌더러 (rAF 루프)
- `src/components/growth-tree/palette.ts` — 팔레트 상수 + `desaturate()` 유틸
- `src/components/growth-tree/sprites/tree-stages.ts` — 7단계 나무 스프라이트
- `src/components/growth-tree/sprites/character.ts` — 캐릭터 2상태 스프라이트
- `src/components/growth-tree/sprites/fruit.ts` — 열매 스프라이트
- `src/components/growth-tree/sprites/firefly.ts` — 반딧불이 스프라이트
- `src/components/growth-tree/sprites/leaf-fallen.ts` — 낙엽 스프라이트
- `src/components/growth-tree/sprites/pot.ts` — 빈 화분 스프라이트
- `src/components/growth-tree/hooks/use-tree-metrics.ts` — heatmap → streak/inactiveDays 계산 (공유)
- `src/components/growth-tree/hooks/use-animation-frame.ts` — rAF 루프 훅
- `src/__tests__/components/growth-tree/use-tree-metrics.test.ts` — 단위 테스트
- `src/__tests__/components/growth-tree/palette.test.ts` — 단위 테스트
- `src/__tests__/components/growth-tree/stage-mapping.test.ts` — 구간 경계 단위 테스트

**Modify:**
- `src/core/types.ts` — `TreeMetrics` 인터페이스 추가, `DashboardStats` 확장
- `src/infra/db/repository.ts` — `getDashboardStats`에 `totalCommits`, `maxDailyCommits` 필드 추가
- `src/components/data-display/contribution-heatmap.tsx` — 내부 `calcStreak`/`formatDate` 제거하고 공유 유틸 import
- `src/app/(dashboard)/page.tsx` — 히트맵 영역을 grid로 감싸 나무 위젯 배치

---

## Task 1: 공유 유틸 추출 — `use-tree-metrics.ts`

히트맵 컴포넌트에 있는 `calcStreak`, `formatDate`를 공유 위치로 이동하고 `calcInactiveDays`, `stageFromCommits`, `thicknessFromMax`, `fireflyCountFromStreak`, `leafDesaturationFromInactive`를 함께 정의한다. 이후 모든 태스크가 이 유틸을 import한다.

**Files:**
- Create: `src/components/growth-tree/hooks/use-tree-metrics.ts`
- Create: `src/__tests__/components/growth-tree/use-tree-metrics.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

Create `src/__tests__/components/growth-tree/use-tree-metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  calcStreak,
  calcInactiveDays,
  stageFromCommits,
  thicknessFromMax,
  fireflyCountFromStreak,
  leafDesaturationFromInactive,
  formatDate,
} from "@/components/growth-tree/hooks/use-tree-metrics";

describe("formatDate", () => {
  it("returns YYYY-MM-DD in local time", () => {
    const d = new Date(2026, 3, 16); // 2026-04-16 local
    expect(formatDate(d)).toBe("2026-04-16");
  });
});

describe("calcStreak", () => {
  const today = new Date(2026, 3, 16);

  it("returns 0 for empty data", () => {
    expect(calcStreak({}, today)).toBe(0);
  });

  it("returns 0 when today has no commit", () => {
    expect(calcStreak({ "2026-04-15": 3 }, today)).toBe(0);
  });

  it("counts consecutive days including today", () => {
    const data = {
      "2026-04-16": 1,
      "2026-04-15": 2,
      "2026-04-14": 5,
    };
    expect(calcStreak(data, today)).toBe(3);
  });

  it("stops at first gap", () => {
    const data = {
      "2026-04-16": 1,
      "2026-04-15": 2,
      "2026-04-13": 5, // gap at 14
    };
    expect(calcStreak(data, today)).toBe(2);
  });

  it("handles single day streak", () => {
    expect(calcStreak({ "2026-04-16": 1 }, today)).toBe(1);
  });
});

describe("calcInactiveDays", () => {
  const today = new Date(2026, 3, 16);

  it("returns 0 when today has commit", () => {
    expect(calcInactiveDays({ "2026-04-16": 1 }, today)).toBe(0);
  });

  it("returns 2 when last commit was 2 days ago", () => {
    expect(calcInactiveDays({ "2026-04-14": 1 }, today)).toBe(2);
  });

  it("returns 7 when last commit was a week ago", () => {
    expect(calcInactiveDays({ "2026-04-09": 1 }, today)).toBe(7);
  });

  it("returns Infinity when data is empty", () => {
    expect(calcInactiveDays({}, today)).toBe(Infinity);
  });
});

describe("stageFromCommits", () => {
  it.each([
    [0, 0],
    [1, 1],
    [10, 1],
    [11, 2],
    [30, 2],
    [31, 3],
    [100, 3],
    [101, 4],
    [300, 4],
    [301, 5],
    [700, 5],
    [701, 6],
    [5000, 6],
  ])("returns stage %i for %i commits", (commits, expected) => {
    expect(stageFromCommits(commits)).toBe(expected);
  });
});

describe("thicknessFromMax", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [4, 2],
    [5, 3],
    [9, 3],
    [10, 4],
    [19, 4],
    [20, 5],
    [100, 5],
  ])("returns thickness %i for max %i", (max, expected) => {
    expect(thicknessFromMax(max)).toBe(expected);
  });
});

describe("fireflyCountFromStreak", () => {
  it.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [6, 1],
    [7, 2],
    [13, 2],
    [14, 3],
    [29, 3],
    [30, 4],
    [365, 4],
  ])("returns %i fireflies for streak %i", (streak, expected) => {
    expect(fireflyCountFromStreak(streak)).toBe(expected);
  });
});

describe("leafDesaturationFromInactive", () => {
  it.each([
    [0, 0],
    [2, 0],
    [3, 0.2],
    [6, 0.2],
    [7, 0.4],
    [30, 0.4],
  ])("returns desaturation %f for inactive %i days", (days, expected) => {
    expect(leafDesaturationFromInactive(days)).toBeCloseTo(expected);
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npm run test -- use-tree-metrics`
Expected: FAIL with module not found

- [ ] **Step 3: `use-tree-metrics.ts` 구현**

Create `src/components/growth-tree/hooks/use-tree-metrics.ts`:

```ts
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calcStreak(data: Record<string, number>, today: Date = new Date()): number {
  let streak = 0;
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  while (true) {
    const key = formatDate(d);
    if ((data[key] ?? 0) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function calcInactiveDays(data: Record<string, number>, today: Date = new Date()): number {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i <= 3650; i++) {
    const key = formatDate(d);
    if ((data[key] ?? 0) > 0) return i;
    d.setDate(d.getDate() - 1);
  }
  return Infinity;
}

export function stageFromCommits(n: number): number {
  if (n <= 0) return 0;
  if (n <= 10) return 1;
  if (n <= 30) return 2;
  if (n <= 100) return 3;
  if (n <= 300) return 4;
  if (n <= 700) return 5;
  return 6;
}

export function thicknessFromMax(n: number): number {
  if (n <= 0) return 0;
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  if (n <= 19) return 4;
  return 5;
}

export function fireflyCountFromStreak(streak: number): number {
  if (streak < 3) return 0;
  if (streak < 7) return 1;
  if (streak < 14) return 2;
  if (streak < 30) return 3;
  return 4;
}

export function leafDesaturationFromInactive(days: number): number {
  if (days < 3) return 0;
  if (days < 7) return 0.2;
  return 0.4;
}
```

- [ ] **Step 4: 테스트 실행 (성공 확인)**

Run: `npm run test -- use-tree-metrics`
Expected: PASS (모든 케이스)

- [ ] **Step 5: 커밋**

```bash
git add src/components/growth-tree/hooks/use-tree-metrics.ts src/__tests__/components/growth-tree/use-tree-metrics.test.ts
git commit -m "feat: growth-tree 지표 계산 유틸 추가"
```

---

## Task 2: heatmap 컴포넌트를 공유 유틸로 마이그레이션

heatmap의 `calcStreak`, `formatDate` 내부 정의를 제거하고 공유 유틸을 import한다. `calcBusiestDay`는 heatmap에서만 쓰이므로 그대로 둔다.

**Files:**
- Modify: `src/components/data-display/contribution-heatmap.tsx`

- [ ] **Step 1: import 추가**

Edit `src/components/data-display/contribution-heatmap.tsx` 상단 import 영역에 추가:

```ts
import { calcStreak, formatDate } from "@/components/growth-tree/hooks/use-tree-metrics";
```

- [ ] **Step 2: 내부 `formatDate` 함수 삭제**

기존 정의(30-35번 줄 부근):

```ts
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

→ 완전히 제거

- [ ] **Step 3: 내부 `calcStreak` 함수 삭제**

기존 정의(50-64번 줄 부근):

```ts
function calcStreak(data: Record<string, number>): number {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (true) {
    const key = formatDate(d);
    if ((data[key] ?? 0) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
```

→ 완전히 제거

- [ ] **Step 4: 호출부 업데이트**

파일 안에서 기존 `calcStreak(data)` 호출을 `calcStreak(data)` 그대로 두되, 새 시그니처(`today?: Date`)를 받으므로 호출 방식은 그대로. `formatDate` 호출도 그대로.

기존 호출:
```ts
const streak = calcStreak(data);
```
그대로 둔다 (기본값 `new Date()` 사용).

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: type check 통과, 빌드 성공

- [ ] **Step 6: heatmap 수동 확인**

Run: `npm run dev`
대시보드 열어서 heatmap이 이전과 동일하게 보이는지 확인. streak 표시가 유지되는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/components/data-display/contribution-heatmap.tsx
git commit -m "refactor: heatmap의 streak/formatDate를 공유 유틸로 이전"
```

---

## Task 3: 서버 쿼리 확장 — `DashboardStats`에 2필드 추가

`getDashboardStats`에 `totalCommits`(본인 누적), `maxDailyCommits`(역대 최대 일일) 추가.

**Files:**
- Modify: `src/infra/db/repository.ts:430-475`

- [ ] **Step 1: `DashboardStats` 인터페이스 확장**

Edit `src/infra/db/repository.ts` 430-435번 줄:

```ts
export interface DashboardStats {
  todayCommits: number;
  weekCommits: number;
  totalReports: number;
  repoCount: number;
  totalCommits: number;
  maxDailyCommits: number;
}
```

- [ ] **Step 2: `getDashboardStats` 내부에 쿼리 추가**

Edit `src/infra/db/repository.ts:437-475` — 기존 `reportRow` 이후, return 직전에 쿼리 추가:

```ts
export function getDashboardStats(db: Database.Database, userId: string): DashboardStats {
  const repos = getRepositoriesByUser(db, userId);
  const repoIds = repos.map((r: any) => r.id);

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekStart = weekAgo.toISOString().split("T")[0];

  const allAuthors: string[] = [];
  for (const repo of repos) {
    if (repo.git_author) {
      const authors = repo.git_author.split(",").map((a: string) => a.trim()).filter(Boolean);
      allAuthors.push(...authors);
    }
  }
  const authorsParam = allAuthors.length > 0 ? allAuthors : undefined;

  const todayCounts = repoIds.length > 0
    ? getCommitCountsByDateRange(db, repoIds, today, today, authorsParam)
    : {};
  const todayCommits = Object.values(todayCounts).reduce((sum, n) => sum + n, 0);

  const weekCounts = repoIds.length > 0
    ? getCommitCountsByDateRange(db, repoIds, weekStart, today, authorsParam)
    : {};
  const weekCommits = Object.values(weekCounts).reduce((sum, n) => sum + n, 0);

  const reportRow = db.prepare(
    "SELECT COUNT(*) as cnt FROM reports WHERE user_id = ?"
  ).get(userId) as { cnt: number };

  let totalCommits = 0;
  let maxDailyCommits = 0;

  if (repoIds.length > 0) {
    const placeholders = repoIds.map(() => "?").join(",");
    const params: (string | number)[] = [...repoIds];

    let authorClause = "";
    if (authorsParam && authorsParam.length > 0) {
      authorClause = " AND (" + authorsParam.map(() => "author LIKE ?").join(" OR ") + ")";
      params.push(...authorsParam.map((a) => `%${a}%`));
    }

    const totalRow = db.prepare(
      `SELECT COUNT(*) as cnt FROM commit_cache
       WHERE repository_id IN (${placeholders})${authorClause}`
    ).get(...params) as { cnt: number };
    totalCommits = totalRow.cnt;

    const maxRow = db.prepare(
      `SELECT MAX(daily_count) as max_count FROM (
         SELECT committed_date, COUNT(*) as daily_count FROM commit_cache
         WHERE repository_id IN (${placeholders})${authorClause}
         GROUP BY committed_date
       )`
    ).get(...params) as { max_count: number | null };
    maxDailyCommits = maxRow.max_count ?? 0;
  }

  return {
    todayCommits,
    weekCommits,
    totalReports: reportRow.cnt,
    repoCount: repos.length,
    totalCommits,
    maxDailyCommits,
  };
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 타입 체크 통과

- [ ] **Step 4: API 응답 수동 확인**

Run: `npm run dev`
브라우저에서 `/api/dashboard/stats` 응답에 `totalCommits`, `maxDailyCommits` 필드가 있는지 확인. DB에 커밋이 있으면 숫자가, 없으면 0이 나오는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/infra/db/repository.ts
git commit -m "feat: DashboardStats에 totalCommits, maxDailyCommits 추가"
```

---

## Task 4: 공유 타입 정의 — `TreeMetrics`

`src/core/types.ts`에 클라이언트 타입 추가.

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: `TreeMetrics` 인터페이스 추가**

Edit `src/core/types.ts` 파일 끝에 추가:

```ts
/** 나무 위젯에 필요한 지표 모음 */
export interface TreeMetrics {
  totalCommits: number;
  currentStreak: number;
  inactiveDays: number;
  todayCommitted: boolean;
  maxDailyCommits: number;
  repos: Array<{ id: number; language: string | null }>;
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/core/types.ts
git commit -m "feat: TreeMetrics 공유 타입 추가"
```

---

## Task 5: 팔레트 + 채도 변환 유틸

팔레트 상수와 `desaturate()` 구현.

**Files:**
- Create: `src/components/growth-tree/palette.ts`
- Create: `src/__tests__/components/growth-tree/palette.test.ts`

- [ ] **Step 1: 테스트 작성**

Create `src/__tests__/components/growth-tree/palette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { desaturate, palette } from "@/components/growth-tree/palette";

describe("palette", () => {
  it("exports expected color keys", () => {
    expect(palette.trunkDark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.leafMid).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.potBase).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("desaturate", () => {
  it("returns original when percent is 0", () => {
    expect(desaturate("#5fa347", 0).toLowerCase()).toBe("#5fa347");
  });

  it("reduces saturation by 20%", () => {
    const result = desaturate("#5fa347", 0.2);
    expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result).not.toBe("#5fa347");
  });

  it("reduces saturation by 40%", () => {
    const result = desaturate("#5fa347", 0.4);
    const result20 = desaturate("#5fa347", 0.2);
    expect(result).not.toBe(result20);
  });

  it("keeps gray colors unchanged regardless of percent", () => {
    const gray = "#808080";
    expect(desaturate(gray, 0.5).toLowerCase()).toBe(gray);
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npm run test -- palette`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `palette.ts` 구현**

Create `src/components/growth-tree/palette.ts`:

```ts
export const palette = {
  transparent: "transparent",
  trunkDark: "#6b3f1d",
  trunkLight: "#9d6b3d",
  leafDark: "#3a7d2b",
  leafMid: "#5fa347",
  leafLight: "#8fc76e",
  potBase: "#8a5a3b",
  potRim: "#6b3f1d",
  soil: "#4a2f1a",
  characterSkin: "#f5c99b",
  characterShirt: "#4f90d6",
  characterHair: "#3a2a1a",
  wateringCan: "#b8b8b8",
  water: "#7ec9f0",
  firefly: "#fff6a8",
  leafFallen: "#a68a3e",
} as const;

export type PaletteKey = keyof typeof palette;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = ((bn - rn) / d + 2); break;
      case bn: h = ((rn - gn) / d + 4); break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1/3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1/3) * 255,
  };
}

/**
 * 색의 채도를 percent만큼 감소시킨다. percent 0 = 원본, percent 1 = 무채색.
 * 명도는 유지된다.
 */
export function desaturate(hex: string, percent: number): string {
  if (percent <= 0) return hex;
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const newS = Math.max(0, s * (1 - percent));
  const { r: nr, g: ng, b: nb } = hslToRgb(h, newS, l);
  return rgbToHex(nr, ng, nb);
}
```

- [ ] **Step 4: 테스트 실행 (성공 확인)**

Run: `npm run test -- palette`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/growth-tree/palette.ts src/__tests__/components/growth-tree/palette.test.ts
git commit -m "feat: growth-tree 팔레트 + desaturate 유틸 추가"
```

---

## Task 6: 스프라이트 데이터 정의

7단계 나무 + 캐릭터 2상태 + 열매/반딧불이/낙엽/화분 스프라이트를 2D 색 인덱스 배열로 정의. 팔레트 키(`PaletteKey`)를 값으로 사용하고, 투명은 `null` 또는 `"transparent"`.

**Files:**
- Create: `src/components/growth-tree/sprites/tree-stages.ts`
- Create: `src/components/growth-tree/sprites/character.ts`
- Create: `src/components/growth-tree/sprites/fruit.ts`
- Create: `src/components/growth-tree/sprites/firefly.ts`
- Create: `src/components/growth-tree/sprites/leaf-fallen.ts`
- Create: `src/components/growth-tree/sprites/pot.ts`

스프라이트는 문자열 값의 2D 배열. `"_"`는 투명, 그 외에는 팔레트 키의 축약 코드.

- [ ] **Step 1: 공용 스프라이트 타입 정의 — `tree-stages.ts` 상단**

Create `src/components/growth-tree/sprites/tree-stages.ts`:

```ts
import type { PaletteKey } from "@/components/growth-tree/palette";

export type SpriteCell = PaletteKey | "_";
export type Sprite = SpriteCell[][];

export interface TreeStage {
  name: string;
  sprite: Sprite;
  /** 줄기 픽셀 좌표 (y, x) — 두께 오버레이용 */
  trunkCoords: Array<[number, number]>;
  /** 열매가 열릴 수 있는 슬롯 좌표 (y, x) — 최대 10개 */
  fruitSlots: Array<[number, number]>;
  /** 잎 픽셀 좌표 — 채도 감소 대상 */
  leafCoords: Array<[number, number]>;
}

// 참고: 아래 스프라이트는 16x24 그리드, 문자열 한 칸 = 1픽셀.
// "_" = 투명, "tD" = trunkDark, "tL" = trunkLight, "lD" = leafDark, "lM" = leafMid, "lL" = leafLight

function parsePixels(rows: string[]): Sprite {
  const map: Record<string, PaletteKey> = {
    tD: "trunkDark",
    tL: "trunkLight",
    lD: "leafDark",
    lM: "leafMid",
    lL: "leafLight",
    so: "soil",
  };
  return rows.map((row) => {
    const cells: SpriteCell[] = [];
    for (let i = 0; i < row.length; i += 2) {
      const token = row.slice(i, i + 2);
      if (token === "__") cells.push("_");
      else cells.push(map[token] ?? "_");
    }
    return cells;
  });
}

function collectCoords(sprite: Sprite, keys: PaletteKey[]): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  for (let y = 0; y < sprite.length; y++) {
    for (let x = 0; x < sprite[y].length; x++) {
      const cell = sprite[y][x];
      if (cell !== "_" && keys.includes(cell)) {
        coords.push([y, x]);
      }
    }
  }
  return coords;
}

function makeStage(name: string, rows: string[], fruitSlots: Array<[number, number]>): TreeStage {
  const sprite = parsePixels(rows);
  return {
    name,
    sprite,
    trunkCoords: collectCoords(sprite, ["trunkDark", "trunkLight"]),
    leafCoords: collectCoords(sprite, ["leafDark", "leafMid", "leafLight"]),
    fruitSlots,
  };
}

// Stage 0: 씨앗 (흙 위 점 하나)
export const stage0_seed = makeStage(
  "seed",
  [
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "______________tDtD______________",
    "______________tDtD______________",
    "______________sososo____________",
  ],
  []
);

// Stage 1: 떡잎
export const stage1_sprout = makeStage(
  "sprout",
  [
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "____________lMlM__lMlM__________",
    "__________lMlLlM__lMlLlM________",
    "____________lM______lM__________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________sososo____________",
  ],
  []
);

// Stage 2: 묘목
export const stage2_sapling = makeStage(
  "sapling",
  [
    "________________________________",
    "________________________________",
    "________________________________",
    "________________________________",
    "____________lMlMlM______________",
    "__________lMlLlMlM______________",
    "__________lMlLlMlM__lM__________",
    "____________lMlMlMlMlM__________",
    "______________tDlMlM____________",
    "______________tD________________",
    "____________lMtD________________",
    "__________lMlMtDlM______________",
    "__________lMlLtDlMlM____________",
    "____________lMtDlM______________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "______________tD________________",
    "____________sosososo____________",
  ],
  [[6, 6], [12, 8]]
);

// Stage 3: 어린나무
export const stage3_young = makeStage(
  "young",
  [
    "________________________________",
    "__________lMlMlM________________",
    "________lMlLlMlMlM__lMlM________",
    "______lMlMlLlMlMlMlMlLlM________",
    "______lMlLlMlDlMlMlLlMlM________",
    "________lMlMtDtDlMlMlM__________",
    "__________lMtDtDlM______________",
    "__________lMtDtDlMlMlM__________",
    "________lMlMtDtDlLlMlM__________",
    "______lMlLlMtDtDlMlMlMlM________",
    "______lMlMlMtDtDlMlLlMlM________",
    "________lMlMtDtDlMlMlM__________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "____________tDtD________________",
    "__________sosososo______________",
  ],
  [[3, 4], [4, 10], [9, 3], [10, 10]]
);

// Stage 4: 중간나무
export const stage4_medium = makeStage(
  "medium",
  [
    "__________lMlMlMlM______________",
    "________lMlLlMlMlLlMlM__________",
    "______lMlLlMlMlMlMlMlMlM________",
    "____lMlMlLlMlMlDlMlMlLlMlM______",
    "____lMlLlMlDlMlMlMlDlMlMlMlM____",
    "__lMlMlMlMlMtDtDlMlMlMlMlMlM____",
    "____lMlMlMtDtDtDtDlMlMlMlM______",
    "______lMlMtDtDtDtDlMlMlM________",
    "____lMlMtDtDtDtDlMlMlMlMlM______",
    "__lMlMlLlMtDtDtDtDlMlMlLlMlM____",
    "____lMlMlMtDtDtDtDlMlMlMlM______",
    "______lMtDtDtDtDlMlM____________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "________sosososososo____________",
  ],
  [[2, 3], [3, 6], [4, 12], [7, 3], [9, 2], [9, 12], [11, 2], [11, 10]]
);

// Stage 5: 큰나무
export const stage5_large = makeStage(
  "large",
  [
    "______lMlMlMlMlM________________",
    "____lMlLlMlMlLlMlMlM____________",
    "__lMlLlMlMlMlMlMlMlMlM__________",
    "lMlMlLlMlMlDlMlMlLlMlMlM________",
    "lMlLlMlDlMlMlMlDlMlMlMlMlM______",
    "lMlMlMlMlMtDtDlMlMlMlMlMlMlM____",
    "lMlMlMlLtDtDtDtDlMlMlLlMlMlM____",
    "__lMlMtDtDtDtDtDtDlMlMlMlM______",
    "____lMtDtDtDtDtDtDlMlMlMlM______",
    "lMlMlLtDtDtDtDtDtDlMlMlLlMlM____",
    "lMlMlMtDtDtDtDtDtDtDlMlMlMlM____",
    "lMlMlLtDtDtDtDtDtDlMlMlLlMlM____",
    "__lMlMtDtDtDtDtDtDlMlMlMlM______",
    "____lMtDtDtDtDtDtDlMlMlMlM______",
    "lMlMlLtDtDtDtDtDtDlMlMlLlMlM____",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "______sosososososososo__________",
  ],
  [[2, 2], [3, 6], [4, 11], [5, 1], [6, 12], [9, 1], [9, 12], [11, 2], [12, 10], [14, 4]]
);

// Stage 6: 거목
export const stage6_giant = makeStage(
  "giant",
  [
    "____lMlMlMlMlMlMlM______________",
    "__lMlLlMlMlLlMlMlMlM____________",
    "lMlLlMlMlMlMlMlMlMlMlM__________",
    "lMlLlMlDlMlMlLlMlDlMlMlM________",
    "lMlMlDlMlMlMlMlMlDlMlMlMlM______",
    "lMlMlMlMtDtDtDtDlMlMlMlMlMlM____",
    "lMlMlLtDtDtDtDtDtDlMlLlMlMlM____",
    "lMlMtDtDtDtDtDtDtDtDlMlMlMlM____",
    "__lMtDtDtDtDtDtDtDtDlMlMlM______",
    "lMlMlLtDtDtDtDtDtDtDlMlLlMlM____",
    "lMlMtDtDtDtDtDtDtDtDtDlMlMlMlM__",
    "lMlMlLtDtDtDtDtDtDtDlMlLlMlM____",
    "__lMtDtDtDtDtDtDtDtDlMlMlM______",
    "lMlMlLtDtDtDtDtDtDtDlMlLlMlM____",
    "lMlMtDtDtDtDtDtDtDtDlMlMlMlM____",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "__________tDtDtDtD______________",
    "____sosososososososososo________",
  ],
  [[2, 1], [3, 5], [3, 11], [5, 2], [6, 12], [7, 1], [9, 2], [9, 12], [11, 3], [13, 11]]
);

export const treeStages: TreeStage[] = [
  stage0_seed,
  stage1_sprout,
  stage2_sapling,
  stage3_young,
  stage4_medium,
  stage5_large,
  stage6_giant,
];
```

- [ ] **Step 2: 캐릭터 스프라이트 생성**

Create `src/components/growth-tree/sprites/character.ts`:

```ts
import type { PaletteKey } from "@/components/growth-tree/palette";
import type { Sprite, SpriteCell } from "./tree-stages";

function parsePixels(rows: string[]): Sprite {
  const map: Record<string, PaletteKey> = {
    sk: "characterSkin",
    sh: "characterShirt",
    hr: "characterHair",
    wc: "wateringCan",
    wa: "water",
  };
  return rows.map((row) => {
    const cells: SpriteCell[] = [];
    for (let i = 0; i < row.length; i += 2) {
      const token = row.slice(i, i + 2);
      if (token === "__") cells.push("_");
      else cells.push(map[token] ?? "_");
    }
    return cells;
  });
}

// 16x20 기준, idle 2프레임 (숨쉬기)
export const characterIdle: Sprite[] = [
  parsePixels([
    "________________________",
    "________________________",
    "______hrhrhrhr__________",
    "____hrhrhrhrhrhr________",
    "____hrsksksksksk________",
    "____hrsksksksksk________",
    "______sksksksk__________",
    "______shshshsh__________",
    "____shshshshshsh__wc____",
    "____shshshshshshwcwcwc__",
    "____shshshshshsh__wc____",
    "____shshshshshsh________",
    "______sksk__sksk________",
    "______sksk__sksk________",
    "______sksk__sksk________",
    "______sksk__sksk________",
  ]),
  parsePixels([
    "________________________",
    "______hrhrhrhr__________",
    "____hrhrhrhrhrhr________",
    "____hrsksksksksk________",
    "____hrsksksksksk________",
    "______sksksksk__________",
    "______shshshsh__________",
    "____shshshshshsh__wc____",
    "____shshshshshshwcwcwc__",
    "____shshshshshsh__wc____",
    "____shshshshshsh________",
    "______sksk__sksk________",
    "______sksk__sksk________",
    "______sksk__sksk________",
    "______sksk__sksk________",
    "________________________",
  ]),
];

// 물주기 4프레임 — 물뿌리개 기울이며 물줄기
export const characterWatering: Sprite[] = [
  parsePixels([
    "________________________",
    "______hrhrhrhr__________",
    "____hrhrhrhrhrhr________",
    "____hrsksksksksk________",
    "____hrsksksksksk________",
    "______sksksksk__________",
    "______shshshsh__________",
    "____shshshshshshwcwc____",
    "____shshshshshshwcwcwc__",
    "____shshshshshsh__wc____",
    "____shshshshshsh__wa____",
    "______sksk__sksk__wa____",
    "______sksk__sksk________",
    "______sksk__sksk________",
    "______sksk__sksk________",
    "________________________",
  ]),
  parsePixels([
    "________________________",
    "______hrhrhrhr__________",
    "____hrhrhrhrhrhr________",
    "____hrsksksksksk________",
    "____hrsksksksksk________",
    "______sksksksk__________",
    "______shshshsh__________",
    "____shshshshshshwcwc____",
    "____shshshshshshwcwcwc__",
    "____shshshshshsh__wc____",
    "____shshshshshsh__wawa__",
    "______sksk__sksk__wawa__",
    "______sksk__sksk____wa__",
    "______sksk__sksk________",
    "______sksk__sksk________",
    "________________________",
  ]),
  parsePixels([
    "________________________",
    "______hrhrhrhr__________",
    "____hrhrhrhrhrhr________",
    "____hrsksksksksk________",
    "____hrsksksksksk________",
    "______sksksksk__________",
    "______shshshsh__________",
    "____shshshshshshwcwc____",
    "____shshshshshshwcwcwc__",
    "____shshshshshsh__wc____",
    "____shshshshshsh__wawa__",
    "______sksk__sksk__wawa__",
    "______sksk__sksk__wawa__",
    "______sksk__sksk____wa__",
    "______sksk__sksk________",
    "________________________",
  ]),
  parsePixels([
    "________________________",
    "______hrhrhrhr__________",
    "____hrhrhrhrhrhr________",
    "____hrsksksksksk________",
    "____hrsksksksksk________",
    "______sksksksk__________",
    "______shshshsh__________",
    "____shshshshshshwcwc____",
    "____shshshshshshwcwcwc__",
    "____shshshshshsh__wc____",
    "____shshshshshsh________",
    "______sksk__sksk__wa____",
    "______sksk__sksk__wawa__",
    "______sksk__sksk__wa__wa",
    "______sksk__sksk________",
    "________________________",
  ]),
];
```

- [ ] **Step 3: 열매/반딧불이/낙엽/화분 스프라이트 생성**

Create `src/components/growth-tree/sprites/fruit.ts`:

```ts
// 열매: 3x3 원형. 색은 런타임 주입.
// 0 = 투명, 1 = 열매 본체, 2 = 하이라이트
export const fruit: number[][] = [
  [0, 1, 0],
  [1, 1, 2],
  [0, 1, 0],
];
```

Create `src/components/growth-tree/sprites/firefly.ts`:

```ts
// 반딧불이: 3x3. 색은 palette.firefly, 알파는 런타임 조절.
export const firefly: number[][] = [
  [0, 1, 0],
  [1, 1, 1],
  [0, 1, 0],
];
```

Create `src/components/growth-tree/sprites/leaf-fallen.ts`:

```ts
import type { Sprite } from "./tree-stages";

// 떨어진 낙엽: 4x2, leafFallen 색
export const leafFallen: Sprite = [
  ["_", "leafFallen", "leafFallen", "_"],
  ["leafFallen", "leafFallen", "leafFallen", "leafFallen"],
];
```

Create `src/components/growth-tree/sprites/pot.ts`:

```ts
import type { PaletteKey } from "@/components/growth-tree/palette";
import type { Sprite, SpriteCell } from "./tree-stages";

function parsePixels(rows: string[]): Sprite {
  const map: Record<string, PaletteKey> = {
    pR: "potRim",
    pB: "potBase",
    so: "soil",
  };
  return rows.map((row) => {
    const cells: SpriteCell[] = [];
    for (let i = 0; i < row.length; i += 2) {
      const token = row.slice(i, i + 2);
      if (token === "__") cells.push("_");
      else cells.push(map[token] ?? "_");
    }
    return cells;
  });
}

// 빈 화분 (저장소 0개 상태) — 12x8
export const emptyPot: Sprite = parsePixels([
  "pRpRpRpRpRpRpRpRpRpRpRpR",
  "__pBsosososososososopB__",
  "__pBsosososososososopB__",
  "____pBpBpBpBpBpBpBpB____",
  "____pBpBpBpBpBpBpBpB____",
  "____pBpBpBpBpBpBpBpB____",
  "______pBpBpBpBpBpB______",
  "______pBpBpBpBpBpB______",
]);
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 5: 커밋**

```bash
git add src/components/growth-tree/sprites/
git commit -m "feat: 나무 7단계 + 캐릭터/열매/반딧불이/낙엽/화분 스프라이트 정의"
```

---

## Task 7: rAF 애니메이션 훅

delta time을 제공하는 `useAnimationFrame` 훅.

**Files:**
- Create: `src/components/growth-tree/hooks/use-animation-frame.ts`

- [ ] **Step 1: 훅 구현**

Create `src/components/growth-tree/hooks/use-animation-frame.ts`:

```ts
import { useEffect, useRef } from "react";

/**
 * requestAnimationFrame 루프를 실행하며 매 프레임마다 callback(time, deltaMs)를 호출한다.
 * 컴포넌트 언마운트 시 자동 정리.
 */
export function useAnimationFrame(callback: (time: number, deltaMs: number) => void): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    const loop = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      cbRef.current(time, delta);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);
}
```

- [ ] **Step 2: 타입 체크**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/growth-tree/hooks/use-animation-frame.ts
git commit -m "feat: useAnimationFrame 훅 추가"
```

---

## Task 8: Canvas 렌더러 — `tree-canvas.tsx`

스프라이트를 받아 Canvas에 렌더링하는 컴포넌트. 가장 큰 파일.

**Files:**
- Create: `src/components/growth-tree/tree-canvas.tsx`

렌더 로직:
1. devicePixelRatio 적용
2. 매 프레임 전체 다시 그리기 (Canvas는 작음)
3. 렌더 순서: 배경 → 화분 → 나무 → 줄기 오버레이 → 열매 → 반딧불이 → 낙엽 → 캐릭터

- [ ] **Step 1: `languageColor` 유틸 위치 확인**

Run: `Grep "export.*languageColor" src/`
(기존 함수가 있는지 확인; 없다면 인라인으로 작성)

`src/components/data-display/language-badge.tsx`를 읽어 언어별 색상 매핑을 확인하고, 재사용 가능한 `languageColor(name: string | null): string` 함수가 없다면 `language-badge.tsx` 내부 색상 맵을 export로 바꿔 재사용한다.

실제 확인 후 다음 두 경로 중 하나:
- **경로 A**: 기존에 이미 색상 맵이 export되어 있음 → 그대로 import
- **경로 B**: 내부에만 있음 → `language-badge.tsx`에서 색상 맵을 `export const languageColors`로 꺼내고, `export function languageColor(lang: string | null): string { return lang ? (languageColors[lang] ?? "#8b949e") : "#8b949e"; }` 추가

경로 B로 진행하면 수정된 파일을 함께 커밋.

- [ ] **Step 2: 테스트용 헬퍼 확인**

없음. `tree-canvas`는 Canvas 렌더라 단위 테스트 제외 (스펙 결정). 바로 구현.

- [ ] **Step 3: `tree-canvas.tsx` 구현**

Create `src/components/growth-tree/tree-canvas.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { TreeMetrics } from "@/core/types";
import { palette, desaturate, type PaletteKey } from "./palette";
import {
  stageFromCommits,
  thicknessFromMax,
  fireflyCountFromStreak,
  leafDesaturationFromInactive,
} from "./hooks/use-tree-metrics";
import { useAnimationFrame } from "./hooks/use-animation-frame";
import { treeStages, type TreeStage, type Sprite, type SpriteCell } from "./sprites/tree-stages";
import { characterIdle, characterWatering } from "./sprites/character";
import { fruit as fruitSprite } from "./sprites/fruit";
import { firefly as fireflySprite } from "./sprites/firefly";
import { leafFallen } from "./sprites/leaf-fallen";
import { emptyPot } from "./sprites/pot";
import { languageColor } from "@/components/data-display/language-badge";

const CANVAS_W = 240;
const CANVAS_H = 280;
const GRID_W = 120;
const GRID_H = 140;
const SCALE = CANVAS_W / GRID_W;

// 레이아웃 상수 (그리드 좌표)
const TREE_X = 44;
const TREE_Y = 40;
const POT_X = 48;
const POT_Y = 104;
const CHARACTER_X = 80;
const CHARACTER_Y = 100;

function resolveColor(cell: SpriteCell, leafDesatPercent: number): string | null {
  if (cell === "_") return null;
  const base = palette[cell as PaletteKey];
  if (!base) return null;
  if (leafDesatPercent > 0 && (cell === "leafDark" || cell === "leafMid" || cell === "leafLight")) {
    return desaturate(base, leafDesatPercent);
  }
  return base;
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  leafDesatPercent = 0
): void {
  for (let sy = 0; sy < sprite.length; sy++) {
    for (let sx = 0; sx < sprite[sy].length; sx++) {
      const color = resolveColor(sprite[sy][sx], leafDesatPercent);
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x + sx, y + sy, 1, 1);
      }
    }
  }
}

function drawTrunkOverlay(
  ctx: CanvasRenderingContext2D,
  stage: TreeStage,
  thickness: number,
  x: number,
  y: number
): void {
  if (thickness <= 0) return;
  const extraPx = Math.max(0, thickness - 1);
  ctx.fillStyle = palette.trunkDark;
  for (const [ty, tx] of stage.trunkCoords) {
    for (let dx = -extraPx; dx <= extraPx; dx++) {
      ctx.fillRect(x + tx + dx, y + ty, 1, 1);
    }
  }
}

function drawFruits(
  ctx: CanvasRenderingContext2D,
  stage: TreeStage,
  repos: TreeMetrics["repos"],
  x: number,
  y: number
): void {
  const slots = stage.fruitSlots;
  const visible = repos.slice(0, Math.min(slots.length, 10));
  for (let i = 0; i < visible.length; i++) {
    const [fy, fx] = slots[i];
    const color = languageColor(visible[i].language);
    for (let sy = 0; sy < fruitSprite.length; sy++) {
      for (let sx = 0; sx < fruitSprite[sy].length; sx++) {
        const v = fruitSprite[sy][sx];
        if (v === 1) {
          ctx.fillStyle = color;
          ctx.fillRect(x + fx + sx - 1, y + fy + sy - 1, 1, 1);
        } else if (v === 2) {
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.fillRect(x + fx + sx - 1, y + fy + sy - 1, 1, 1);
        }
      }
    }
  }
}

function drawFireflies(
  ctx: CanvasRenderingContext2D,
  count: number,
  time: number
): void {
  for (let i = 0; i < count; i++) {
    const phase = i * 1.7;
    const cx = TREE_X + 30 + Math.sin(time / 1200 + phase) * 28;
    const cy = TREE_Y + 30 + Math.cos(time / 1400 + phase * 1.3) * 20;
    const alpha = 0.5 + 0.5 * Math.sin(time / 400 + phase);
    ctx.fillStyle = `rgba(255, 246, 168, ${alpha.toFixed(3)})`;
    for (let sy = 0; sy < fireflySprite.length; sy++) {
      for (let sx = 0; sx < fireflySprite[sy].length; sx++) {
        if (fireflySprite[sy][sx] === 1) {
          ctx.fillRect(Math.round(cx) + sx - 1, Math.round(cy) + sy - 1, 1, 1);
        }
      }
    }
  }
}

function drawFallenLeaves(
  ctx: CanvasRenderingContext2D,
  inactiveDays: number,
  time: number
): void {
  if (inactiveDays < 7) return;

  // 정적 낙엽 1-2장 화분 옆
  drawSprite(ctx, leafFallen, POT_X - 4, POT_Y + 22);
  if (inactiveDays >= 14) {
    drawSprite(ctx, leafFallen, POT_X + 22, POT_Y + 24);
  }

  // 떨어지는 낙엽 루프 1장
  const fallDuration = 4000;
  const t = (time % fallDuration) / fallDuration;
  const lx = TREE_X + 48 + Math.sin(time / 800) * 4;
  const ly = TREE_Y + 20 + t * 80;
  drawSprite(ctx, leafFallen, Math.round(lx), Math.round(ly));
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  todayCommitted: boolean,
  time: number
): void {
  const frames = todayCommitted ? characterWatering : characterIdle;
  const frameMs = todayCommitted ? 200 : 600;
  const frame = frames[Math.floor(time / frameMs) % frames.length];
  const yOffset = todayCommitted ? 0 : Math.sin(time / 1200) < 0 ? 1 : 0;
  drawSprite(ctx, frame, CHARACTER_X, CHARACTER_Y + yOffset);
}

function drawEmptyState(ctx: CanvasRenderingContext2D): void {
  drawSprite(ctx, emptyPot, POT_X - 4, POT_Y + 8);
}

interface TreeCanvasProps {
  metrics: TreeMetrics;
}

export function TreeCanvas({ metrics }: TreeCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  // Canvas 초기화 (devicePixelRatio 대응)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr * SCALE, dpr * SCALE);
    ctx.imageSmoothingEnabled = false;
  }, []);

  useAnimationFrame((time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const m = metricsRef.current;

    // 클리어 (그리드 좌표계 기준)
    ctx.clearRect(0, 0, GRID_W, GRID_H);

    // 신규 유저 (저장소 0개) → 빈 화분만
    if (m.repos.length === 0) {
      drawEmptyState(ctx);
      drawCharacter(ctx, false, time);
      return;
    }

    const stageIdx = stageFromCommits(m.totalCommits);
    const stage = treeStages[stageIdx];
    const thickness = thicknessFromMax(m.maxDailyCommits);
    const desat = leafDesaturationFromInactive(m.inactiveDays);
    const fireflies = fireflyCountFromStreak(m.currentStreak);

    // 바람 흔들림 (전체 나무)
    const windShift = Math.sin(time / 2000) * 0.7;

    // 1. 화분
    drawSprite(ctx, emptyPot, POT_X - 4, POT_Y + 8);

    // 2. 나무
    drawSprite(ctx, stage.sprite, TREE_X + windShift, TREE_Y, desat);

    // 3. 줄기 두께 오버레이
    drawTrunkOverlay(ctx, stage, thickness, TREE_X + windShift, TREE_Y);

    // 4. 열매
    drawFruits(ctx, stage, m.repos, TREE_X + windShift, TREE_Y);

    // 5. 반딧불이
    drawFireflies(ctx, fireflies, time);

    // 6. 낙엽
    drawFallenLeaves(ctx, m.inactiveDays, time);

    // 7. 캐릭터
    drawCharacter(ctx, m.todayCommitted, time);
  });

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${CANVAS_W}px`,
        height: `${CANVAS_H}px`,
        imageRendering: "pixelated",
        display: "block",
      }}
    />
  );
}
```

- [ ] **Step 4: `languageColor` 수정 (경로 B인 경우)**

Step 1에서 경로 B로 결정된 경우, `src/components/data-display/language-badge.tsx`에서 색상 맵과 `languageColor` 함수를 export. 그 외에는 건너뛴다.

- [ ] **Step 5: 타입 체크**

Run: `npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add src/components/growth-tree/tree-canvas.tsx src/components/data-display/language-badge.tsx
git commit -m "feat: Canvas 기반 픽셀 나무 렌더러 추가"
```

---

## Task 9: 카드 컨테이너 — `growth-tree.tsx`

`TreeMetrics`를 props로 받아 카드 안에 TreeCanvas를 배치.

**Files:**
- Create: `src/components/growth-tree/growth-tree.tsx`

- [ ] **Step 1: 컴포넌트 구현**

Create `src/components/growth-tree/growth-tree.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TreeCanvas } from "./tree-canvas";
import type { TreeMetrics } from "@/core/types";

interface GrowthTreeProps {
  metrics: TreeMetrics;
  loading?: boolean;
}

export function GrowthTree({ metrics, loading = false }: GrowthTreeProps): React.JSX.Element {
  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardContent className="p-4">
          <div className="h-[280px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const hasRepos = metrics.repos.length > 0;

  return (
    <Card className="w-full h-full">
      <CardContent className="p-4 flex flex-col items-center gap-2">
        <div className="relative">
          <TreeCanvas metrics={metrics} />
          {!hasRepos && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
              <p className="text-sm text-muted-foreground mb-2">
                저장소를 등록하고
                <br />
                나무를 키워보세요
              </p>
              <Link
                href="/repos"
                className="pointer-events-auto text-xs text-primary underline underline-offset-2"
              >
                저장소 관리 →
              </Link>
            </div>
          )}
        </div>
        {hasRepos && (
          <div className="text-xs text-muted-foreground text-center w-full">
            <span>총 {metrics.totalCommits} 커밋</span>
            {metrics.currentStreak > 0 && (
              <> · <span>{metrics.currentStreak}일 연속</span></>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/growth-tree/growth-tree.tsx
git commit -m "feat: GrowthTree 카드 컨테이너 추가"
```

---

## Task 10: 대시보드 페이지 통합

히트맵 영역을 grid로 감싸고 우측에 GrowthTree 배치. 클라이언트에서 TreeMetrics 조립.

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: 필요한 import 추가**

Edit `src/app/(dashboard)/page.tsx` 상단 import 블록:

```ts
import { GrowthTree } from "@/components/growth-tree/growth-tree";
import { calcStreak, calcInactiveDays } from "@/components/growth-tree/hooks/use-tree-metrics";
import type { TreeMetrics } from "@/core/types";
```

- [ ] **Step 2: `DashboardStats` 타입 확장**

119-124번 줄의 `DashboardStats` 인터페이스 수정:

```ts
interface DashboardStats {
  todayCommits: number;
  weekCommits: number;
  totalReports: number;
  repoCount: number;
  totalCommits: number;
  maxDailyCommits: number;
}
```

그리고 131번 줄의 초기값:

```ts
const [stats, setStats] = useState<DashboardStats>({
  todayCommits: 0,
  weekCommits: 0,
  totalReports: 0,
  repoCount: 0,
  totalCommits: 0,
  maxDailyCommits: 0,
});
```

- [ ] **Step 3: TreeMetrics 계산 추가**

`scheduler` 계산 근처(219-220번 줄 주변)에 추가:

```ts
const treeMetrics: TreeMetrics = {
  totalCommits: stats.totalCommits,
  currentStreak: calcStreak(heatmapData),
  inactiveDays: calcInactiveDays(heatmapData),
  todayCommitted: stats.todayCommits > 0,
  maxDailyCommits: stats.maxDailyCommits,
  repos: repos.map((r: any) => ({ id: r.id, language: r.primary_language })),
};
```

- [ ] **Step 4: 히트맵 렌더 부분을 grid로 감싸기**

기존 274-276번 줄:

```tsx
<div className="mb-6">
  <ContributionHeatmap data={heatmapData} months={6} />
</div>
```

→ 변경:

```tsx
<div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 mb-6">
  <ContributionHeatmap data={heatmapData} months={6} />
  <GrowthTree metrics={treeMetrics} />
</div>
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 6: 수동 E2E 테스트 — 5가지 시나리오**

Run: `npm run dev`
브라우저에서 다음 케이스를 확인:

1. **신규 유저 (저장소 0개)** — DB에서 임시로 모든 저장소를 비활성화하거나 새 계정으로 테스트. 빈 화분 + "저장소 관리" CTA 링크가 보여야 함.
2. **저장소 1개 + 커밋 0** — 씨앗 단계 + 열매 없음.
3. **저장소 3개 + 누적 50커밋 + streak 5 + today O** — 묘목/어린나무 + 반딧불이 1마리 + 열매 3개 + 물주는 캐릭터.
4. **저장소 2개 + 누적 500커밋 + streak 0 + 무커밋 10일** — 큰나무 + 채도 감소된 잎 + 낙엽 + idle 캐릭터.
5. **다크모드 전환** — 팔레트가 여전히 자연스러운지 (카드 배경 대비 확인).

각 시나리오에서 애니메이션(나무 흔들림, 반딧불이 이동, 캐릭터 숨쉬기/물주기)이 동작하는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "feat: 대시보드에 GrowthTree 위젯 통합"
```

---

## Task 11: 구간 경계 통합 단위 테스트 (이미 Task 1에 포함됨, 생략 가능)

Task 1의 `use-tree-metrics.test.ts`가 stage/thickness/firefly/desaturation 매핑 경계값을 모두 검증하므로 별도 파일 불필요. 이 태스크는 생략.

---

## Self-Review

**1. Spec coverage 점검**

| Spec 섹션 | 담당 태스크 |
|----------|-----------|
| §2 지표 매핑 | Task 1 (경계값), Task 3 (서버 쿼리), Task 8 (렌더) |
| §3 Data Flow (서버 필드 2개 추가) | Task 3 |
| §3 클라이언트 데이터 수집 | Task 10 |
| §4 Component Structure | Task 1/5/6/7/8/9 |
| §4 기존 로직 통합 (heatmap 마이그레이션) | Task 2 |
| §4 공유 타입 TreeMetrics | Task 4 |
| §5 Layout (grid 배치) | Task 10 |
| §6 Rendering (Canvas, 파이프라인) | Task 8 |
| §6 애니메이션 톤 (중간) | Task 8 (바람, 반딧불이, 캐릭터), Task 7 (rAF 훅) |
| §6 색 변환 (시듦) | Task 5 (desaturate), Task 8 (적용) |
| §7 Edge Cases (저장소 0개, 로딩, 11개 이상 등) | Task 8 (빈 화분), Task 9 (로딩/CTA), Task 8 (slice 10) |
| §8 Testing Strategy | Task 1, Task 5, Task 10 (수동 E2E) |

스펙 §6의 "나뭇잎 2-3장이 각각 다른 주기로 팔랑임"은 Task 8 구현에서 단순화되어 전체 나무 바람 흔들림으로만 구현됨. 이는 YAGNI 관점에서 의도적 단순화이며, 후속 개선 가능.

**2. Placeholder scan**
- "TBD"/"TODO"/"later" 없음
- 각 구현 단계에 실제 코드 포함
- 테스트 코드는 실행 가능한 형태

**3. Type consistency**
- `TreeMetrics` 타입은 Task 4에서 정의하고 Task 8/9/10에서 동일한 필드명 사용 (`totalCommits`, `currentStreak`, `inactiveDays`, `todayCommitted`, `maxDailyCommits`, `repos`)
- `Sprite`, `SpriteCell` 타입은 Task 6의 `tree-stages.ts`에서 export하고 다른 스프라이트/렌더가 import
- `PaletteKey` 타입은 Task 5에서 export, Task 6/8에서 사용
- `stageFromCommits`, `thicknessFromMax`, `fireflyCountFromStreak`, `leafDesaturationFromInactive` 함수명 일관됨

---

## 실행 옵션

**1. Subagent-Driven (추천)** — 태스크마다 새 subagent 디스패치, 태스크 간 리뷰, 빠른 반복

**2. Inline Execution** — 이 세션에서 executing-plans로 배치 실행, 체크포인트마다 리뷰

어느 쪽으로 진행할까요?
