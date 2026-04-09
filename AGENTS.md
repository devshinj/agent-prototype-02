# AGENTS.md — Git-Notion Task Tracker

> 이 파일은 Harness Engineering의 에이전트 컨텍스트 맵이다. 에이전트가 이 프로젝트에서 작업할 때 최초로 읽는 문서.

## What This Project Does

Git 저장소의 커밋을 주기적으로 수집하고, Gemini AI로 분석하여, Notion 데이터베이스에 프로젝트별 일일 업무 기록을 자동 생성한다. 팀원들은 Notion 캘린더/보드 뷰로 일자별 업무 수행 현황을 확인한다.

## Architecture

Next.js 16 App Router 모놀리스. UI + API + 백그라운드 스케줄러가 단일 프로세스에 공존.

```
src/
├── app/          UI pages + API routes (라우팅만)
├── components/   shadcn/ui 기반 공통 컴포넌트
├── core/         순수 비즈니스 로직 (외부 의존성 없음)
├── infra/        외부 서비스 클라이언트 (교체 가능)
├── scheduler/    폴링 스케줄러 (core + infra 조합)
└── lib/          Auth.js 설정, 유틸리티
```

## Layer Rules

| From → To | Allowed? | Reason |
|-----------|----------|--------|
| app/ → core/ | Yes | UI/API가 비즈니스 로직 호출 |
| app/ → infra/ | Yes | API routes에서 직접 DB 접근 가능 |
| core/ → infra/ | **No** | core/는 순수 함수만. 외부 import 금지 |
| core/ → core/ | Yes | 같은 레이어 내 참조 허용 |
| scheduler/ → core/ | Yes | 파이프라인이 분석 로직 사용 |
| scheduler/ → infra/ | Yes | 파이프라인이 외부 API 호출 |
| infra/ → core/ | **No** | infra/는 core/에 의존하지 않음 |

**위반 확인법:** `core/` 디렉토리의 어떤 파일에서도 `from "@/infra/"` 또는 `from "@/scheduler/"` import가 있으면 안 된다.

## Key Entry Points

| File | Role |
|------|------|
| `instrumentation.ts` | 서버 시작 시 node-cron 폴링 스케줄러 초기화 |
| `src/lib/auth.ts` | HRMS OAuth2/OIDC 인증 설정 (Auth.js v5) |
| `src/scheduler/polling-manager.ts` | 폴링 파이프라인 오케스트레이션. 수집→분석→동기화 전체 흐름 |
| `src/core/types.ts` | 모든 공유 타입 정의. 다른 곳에서 타입을 중복 정의하지 말 것 |

## Pipeline Flow

```
1. GitHub API   →  새 커밋 수집 (since lastSyncedSha)
2. Notion API   →  커밋 로그 DB에 원시 데이터 기록
3. Gemini API   →  모호한 커밋 메시지를 diff 기반으로 보강
4. core/analyzer →  날짜+프로젝트별 커밋 그룹핑
5. Gemini API   →  그룹 분석 → DailyTask[] 생성
6. Notion API   →  일일 태스크 DB에 기록 (중복 시 업데이트)
7. SQLite       →  lastSyncedSha 갱신 + 동기화 로그 기록
```

## Notion Databases

**DB 1: Commit Log** (영문 프로퍼티 — 기술 참조용)
- Title, Project, Date, Author, Commit SHA, Files Changed, Branch

**DB 2: Daily Tasks** (한글 프로퍼티 — 사용자 대면용, **핵심 DB**)
- 제목, 작업 설명, 작업일, 프로젝트, 작업 복잡도

Daily Tasks가 이 서비스의 핵심 산출물이다. Commit Log는 보조.

## Components

- `src/components/ui/` — **shadcn/ui CLI로만 생성**. 직접 수정 최소화.
- `src/components/layout/` — Sidebar, Header, PageContainer. 프로젝트 전용.
- `src/components/data-display/` — StatCard, StatusIndicator, EmptyState. shadcn/ui 조합.

## Skills

도메인 작업 시 반드시 해당 스킬을 읽을 것:

| 작업 내용 | 스킬 |
|-----------|------|
| 커밋 수집, diff 조회, Gemini 분석, 그룹핑 | `.claude/skills/git-commit-analyzer/SKILL.md` |
| Notion 페이지 CRUD, 프로퍼티 매핑, 중복 방지 | `.claude/skills/notion-db-sync/SKILL.md` |
| 스케줄러 초기화, 폴링 관리, instrumentation.ts | `.claude/skills/nextjs-polling-service/SKILL.md` |

## External APIs

| Service | Package | Auth |
|---------|---------|------|
| GitHub REST API | `@octokit/rest` | `GITHUB_TOKEN` (PAT) |
| Google Gemini | `@google/genai` | `GEMINI_API_KEY` |
| Notion API | `@notionhq/client` v5 | `NOTION_API_KEY` |
| HRMS OAuth2 | Auth.js v5 custom provider | `AUTH_HRMS_ID` + `AUTH_HRMS_SECRET` |

**주의:** `@google/generative-ai`는 2025.11 이후 deprecated. 반드시 `@google/genai`을 사용할 것.

## Testing

- **core/ 테스트**: 순수 단위 테스트. mock 불필요. `src/__tests__/core/`
- **infra/ 테스트**: 데이터 변환 함수만 테스트. `src/__tests__/infra/`
- **E2E**: 저장소 등록 → 수동 동기화 → Notion DB 확인 (수동)
- **실행**: `npx vitest run`

## Reference Documents

- **설계 스펙**: `docs/superpowers/specs/2026-04-09-git-notion-task-tracker-design.md`
- **구현 계획**: `docs/superpowers/plans/2026-04-09-git-notion-task-tracker.md`
- 스펙과 계획에 모순이 있으면 스펙이 우선이다.
