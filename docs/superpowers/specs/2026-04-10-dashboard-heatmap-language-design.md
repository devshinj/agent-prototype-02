# 대시보드 Contribution 히트맵 & Language 인디케이터 설계

> 날짜: 2026-04-10

## 목적

대시보드에 GitHub 스타일 통합 contribution 히트맵 카드를 추가하여 전체 저장소의 커밋 활동을 한눈에 파악하고, 각 저장소에 메인 language 인디케이터 라벨을 표시하여 저장소 특성을 시각적으로 구분한다.

## 기능 1: 통합 Contribution 히트맵

### 위치

대시보드 StatCard 3개 아래, 저장소 목록 카드 위에 전폭 카드로 배치.

### 데이터

- `commit_cache` 테이블에서 최근 6개월(~26주) 전체 저장소의 커밋을 `committed_date` 기준으로 집계
- 사용자의 `git_author` 필터 적용 (author가 설정된 저장소는 해당 author 커밋만 집계)
- API 응답 형태: `{ [date: string]: number }` (예: `{ "2026-04-10": 5, "2026-04-09": 3 }`)

### API

`GET /api/commits/heatmap?months=6`

- 쿼리 파라미터: `months` (기본값 6)
- 인증된 사용자의 전체 저장소 대상
- 응답: `{ data: Record<string, number> }`
- DB 쿼리: commit_cache를 repositories와 JOIN하여 user_id 필터 + git_author 필터 + 날짜 범위 필터 후 `committed_date` 기준 GROUP BY COUNT

### 렌더링

- GitHub 스타일 격자: 세로 7행(일~토) × 가로 ~26열(주)
- 각 셀: `w-3 h-3 rounded-sm`, gap-1
- 색상 강도 5단계:
  - 0개: `bg-muted` (회색 배경)
  - 1단계: oklch(0.90, 0.04, 145)
  - 2단계: oklch(0.78, 0.10, 145)
  - 3단계: oklch(0.64, 0.16, 145)
  - 4단계: oklch(0.50, 0.20, 145)
- 단계 분류: 0 / 1 / 2-3 / 4-6 / 7+ (커밋 분포에 따라 조정 가능)
- 카드 하단에 월 라벨 표시
- 카드 우상단에 총 커밋 수 텍스트
- 셀 hover 시 tooltip: "2026-04-10: 5 commits"

### 컴포넌트

`src/components/data-display/contribution-heatmap.tsx` (클라이언트 컴포넌트)

```typescript
interface ContributionHeatmapProps {
  data: Record<string, number>;
  months?: number;
}
```

## 기능 2: Language 인디케이터 라벨

### 데이터 수집

- GitHub API `GET /repos/{owner}/{repo}` 응답의 `language` 필드 사용
- 저장소 등록 시(`POST /api/repos`): Octokit `repos.get()` 호출하여 `language` 저장
- 폴링 동기화 시(`polling-manager.ts`): 동기화 사이클마다 `language` 갱신

### DB 변경

`repositories` 테이블에 `primary_language TEXT` 컬럼 추가.

```sql
ALTER TABLE repositories ADD COLUMN primary_language TEXT;
```

### 라벨 디자인

- pill 형태 배지: `rounded-full px-2 py-0.5 text-xs font-medium`
- 기존 `stringColor()` 함수로 language 이름 → oklch 색상 생성 (같은 language는 항상 같은 색)
- 배경: `oklch(colorSet.bgLight)`, 텍스트: `oklch(colorSet.solid)`
- language가 null이면 렌더링하지 않음

### 표시 위치

- 대시보드 저장소 목록: 저장소명 오른쪽에 language pill
- 저장소 관리 페이지: 저장소 카드에 language pill 표시

### 컴포넌트

`src/components/data-display/language-badge.tsx`

```typescript
interface LanguageBadgeProps {
  language: string;
}
```

내부에서 `stringColor(language)`로 색상 결정. language가 falsy면 null 반환.

## 영향 범위

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/infra/db/schema.ts` | `primary_language` 컬럼 마이그레이션 추가 |
| `src/infra/db/repository.ts` | `updatePrimaryLanguage()` 함수 추가, heatmap 집계 쿼리 추가 |
| `src/infra/github/github-client.ts` | `getRepoLanguage()` 함수 추가 |
| `src/app/api/commits/heatmap/route.ts` | 히트맵 API 엔드포인트 신규 |
| `src/app/api/repos/route.ts` | 저장소 등록 시 language 저장 로직 추가 |
| `src/scheduler/polling-manager.ts` | 동기화 시 language 갱신 로직 추가 |
| `src/components/data-display/contribution-heatmap.tsx` | 히트맵 컴포넌트 신규 |
| `src/components/data-display/language-badge.tsx` | language 배지 컴포넌트 신규 |
| `src/app/(dashboard)/page.tsx` | 히트맵 카드 + language badge 삽입 |
| `src/app/(dashboard)/repos/page.tsx` | language badge 삽입 |

### 의존성

- 새로운 패키지 추가 없음
- 기존 `@octokit/rest`, `color-hash.ts` 유틸리티 활용
