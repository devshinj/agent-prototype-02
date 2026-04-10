# commit_cache 기반 캘린더 API 성능 개선 설계

## 배경

캘린더 API(`/api/repos/commit-calendar`, `range`, `[date]`)가 매 호출마다 git CLI를 저장소 × 브랜치 수만큼 실행하여 응답이 수 초~수십 초 걸린다. 월 이동, 기간 선택 시마다 반복되어 UX가 나쁘다.

## 목표

- 캘린더 API 응답을 **수 ms 이내**로 단축
- SHA 기반 중복 저장 방지
- 서버 재시작에도 캐시 유지
- 기존 폴링 파이프라인에 자연스럽게 통합

## 설계

### 1. commit_cache 테이블

```sql
CREATE TABLE IF NOT EXISTS commit_cache (
  sha TEXT PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  committed_date TEXT NOT NULL,  -- YYYY-MM-DD (author date 로컬 시간대 기준)
  committed_at TEXT NOT NULL,    -- ISO 8601 전체 타임스탬프
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_commit_cache_repo_date
  ON commit_cache(repository_id, committed_date);
```

**설계 포인트:**
- `SHA PRIMARY KEY` — 동일 커밋의 중복 INSERT 자동 방지 (`INSERT OR IGNORE`)
- 같은 커밋이 여러 브랜치에 존재하면 최초 발견 브랜치만 저장 (merge/fast-forward에 의한 중복)
- `committed_date` 별도 컬럼으로 `BETWEEN` 인덱스 쿼리 최적화
- `ON DELETE CASCADE` — 저장소 삭제 시 캐시 자동 정리

### 2. 캐시 빌드 (쓰기 경로)

#### 2-1. git-client에 캐시 빌드용 함수 추가

`getCommitsForCache(repoPath, branches, since?)` — 전체 또는 증분 커밋 목록 반환.

```
git log --all --format="%H%n%an%n%aI%n%s%n---END---" [--since=YYYY-MM-DD]
```

- `--all` 플래그로 전체 브랜치 한 번에 조회 (브랜치별 반복 제거)
- `seenShas` Set으로 파싱 시 중복 제거
- 브랜치 정보는 `--all --source` 대신, 각 SHA에 대해 `git branch --contains` 호출 없이 — 첫 도달 브랜치를 기록하는 방식은 비효율적이므로, `--all` 조회 후 브랜치 정보는 별도로 `name-rev`로 한 번에 매핑

**실제 구현 방식:**
```
git log --all --format="%H %D%n%an%n%aI%n%s%n---END---" [--since=YYYY-MM-DD]
```
- `%D`(ref names)로 해당 커밋이 가리키는 ref 확인 가능. 대부분의 커밋은 빈 값이므로, 대안으로:
- 각 브랜치별로 순회하되 `seenShas`로 중복 스킵 (현재 패턴 유지, 가장 안정적)

**결론: 기존 브랜치별 순회 + seenShas 패턴 유지.** `--all` 단일 호출은 브랜치 매핑이 어렵고, 브랜치별 순회가 이미 검증된 패턴이다. 다만 이 순회는 **캐시 빌드 시에만 1회 실행**되고 API 호출 시에는 실행되지 않으므로 문제없다.

#### 2-2. repository.ts에 캐시 CRUD 추가

```typescript
// 벌크 INSERT (INSERT OR IGNORE로 중복 안전)
function insertCommitCache(db, commits: CacheCommit[]): void

// 저장소의 가장 최근 캐시 날짜 조회 (증분 빌드용)
function getLatestCacheDate(db, repositoryId: number): string | null

// 날짜 범위 카운트 조회 (캘린더 히트맵)
function getCommitCountsByDateRange(db, repoIds: number[], since: string, until: string): Record<string, number>

// 날짜 범위 상세 조회 (range/date 패널)
function getCommitsByDateRange(db, repoIds: number[], since: string, until: string): CacheCommit[]

// 단일 날짜 상세 조회
function getCommitsByDate(db, repoIds: number[], date: string): CacheCommit[]
```

#### 2-3. 캐시 빌드 시점

| 시점 | 동작 |
|------|------|
| **저장소 등록 (clone 완료 직후)** | 전체 히스토리 캐시 빌드 (`since` 없이) |
| **폴링 사이클 (fetch 직후)** | 증분 빌드 (`since = getLatestCacheDate()`) |

**저장소 등록 시:**
현재 `POST /api/repos`에서 clone을 백그라운드로 실행한다. clone 완료 후 캐시 빌드를 추가한다:

```typescript
// repos/route.ts POST 핸들러 내 백그라운드 클론 콜백
await cloneRepository(cloneUrl, clonePath, token);
await buildCommitCache(db, repoRow.id, clonePath, branches);  // 추가
```

**폴링 사이클 시:**
`polling-manager.ts`의 `runSyncCycle` 내부, `pullRepository` 직후에 캐시 빌드를 추가한다:

```typescript
await pullRepository(repo.clone_path);
await buildCommitCacheIncremental(db, repo.id, repo.clone_path);  // 추가
// ... 기존 커밋 동기화 로직 유지
```

### 3. API 변경 (읽기 경로)

세 API 모두 **git CLI 호출을 DB 쿼리로 완전 교체**한다.

#### `/api/repos/commit-calendar` (월별 카운트)

```sql
SELECT committed_date, COUNT(*) as count
FROM commit_cache
WHERE repository_id IN (?, ?, ...) AND committed_date BETWEEN ? AND ?
GROUP BY committed_date
```

**git_author 필터:** 기존에 git CLI의 `--author` 플래그로 필터링하던 것을, DB의 `author` 컬럼 `LIKE` 조건으로 대체한다.

```sql
AND (author LIKE ? OR author LIKE ?)  -- git_author가 설정된 경우만
```

#### `/api/repos/commit-calendar/range` (기간 상세)

```sql
SELECT c.sha, c.repository_id, c.branch, c.author, c.message, c.committed_at, c.committed_date
FROM commit_cache c
WHERE c.repository_id IN (?, ?, ...) AND c.committed_date BETWEEN ? AND ?
ORDER BY c.committed_at DESC
```

결과를 코드에서 `date → repo → branch` 구조로 그룹핑하여 기존 응답 형식과 호환.

#### `/api/repos/commit-calendar/[date]` (단일 날짜)

```sql
SELECT c.sha, c.repository_id, c.branch, c.author, c.message, c.committed_at
FROM commit_cache c
WHERE c.repository_id IN (?, ?, ...) AND c.committed_date = ?
ORDER BY c.committed_at DESC
```

### 4. 저장소 삭제 시 캐시 정리

`ON DELETE CASCADE`로 `repositories` 행 삭제 시 `commit_cache` 행도 자동 삭제. 별도 로직 불필요.

단, SQLite에서 `ON DELETE CASCADE`가 동작하려면 `PRAGMA foreign_keys = ON`이 필요하다. 프로젝트 전체에서 `getDb()` 함수가 여러 파일에 중복 정의되어 있으므로, `createTables()` 함수 내부에서 `db.pragma('foreign_keys = ON')` 을 실행하여 한 곳에서 통일적으로 처리한다.

### 5. 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/infra/db/schema.ts` | `commit_cache` 테이블 + 인덱스 생성 |
| `src/infra/db/repository.ts` | 캐시 CRUD 함수 5개 추가 |
| `src/infra/git/git-client.ts` | `getCommitsForCache()` 함수 추가 |
| `src/app/api/repos/commit-calendar/route.ts` | git CLI → DB 쿼리 교체 |
| `src/app/api/repos/commit-calendar/range/route.ts` | git CLI → DB 쿼리 교체 |
| `src/app/api/repos/commit-calendar/[date]/route.ts` | git CLI → DB 쿼리 교체 |
| `src/scheduler/polling-manager.ts` | fetch 후 캐시 빌드 호출 추가 |
| `src/app/api/repos/route.ts` | clone 후 캐시 빌드 호출 추가 |

### 6. 기존 API 응답 형식 호환

각 API의 현재 응답 형식을 유지한다:

- `commit-calendar`: `Record<string, number>` (날짜 → 개수)
- `range`: `Array<{ date, repos: Array<{ repoId, repoName, owner, branches: Array<{ branch, commits }> }> }>`
- `[date]`: `Array<{ repoId, repoName, owner, branches: Array<{ branch, commits }> }>`

DB 쿼리 결과를 코드에서 이 형식으로 변환한다.

### 7. 엣지 케이스

- **캐시가 아직 빌드되지 않은 저장소:** clone 진행 중이면 캐시가 비어있다. API는 빈 결과를 반환한다 (현재 동작과 동일 — clone 중에는 git log도 실패함).
- **git_author 필터:** `repositories.git_author` 컬럼 값을 `,` 분리 후 각각 `commit_cache.author`와 매칭.
- **PRAGMA foreign_keys:** DB 연결 시마다 `PRAGMA foreign_keys = ON` 실행 필요.
