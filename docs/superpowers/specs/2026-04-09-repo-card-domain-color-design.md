# Repo Card Domain Color Design

## Overview

프로젝트 전반에서 저장소, 프로젝트, 작성자(author) 등 개인화 항목에 **OKLCH 색공간 기반** 결정론적 색상을 자동 부여한다. 같은 host+owner의 저장소는 같은 색조(hue), 같은 owner 내 다른 repo는 chroma/lightness로 구분한다.

## 색공간: OKLCH

HSL 대신 **OKLCH** 색공간을 사용한다:

- **지각적 균일성**: 같은 lightness 값이면 인간 눈에 실제로 비슷한 밝기로 보임
- **CSS 네이티브 지원**: `oklch(L C H)` 함수로 직접 사용
- **기존 테마와 일관성**: globals.css의 CSS 변수가 이미 oklch 기반

## 색상 생성 알고리즘

### 공용 유틸리티: `src/lib/color-hash.ts`

두 가지 색상 생성 함수를 제공한다:

#### `repoColor(cloneUrl)` — 저장소 도메인 색상

1차 분류: `host/owner` → hue (0~360)
2차 분류: `repo` → chroma (0.08~0.16), lightness (0.52~0.68)

```
"https://github.com/my-company/web-app.git"
→ group key: "github.com/my-company"
→ hash → hue: 217
→ repo hash → chroma: 0.12, lightness: 0.60
```

#### `stringColor(str)` — 범용 문자열 색상

author 이름, 프로젝트 이름, 태그 등 임의 문자열에 사용.

```
"홍길동" → hue: 142, chroma: 0.13, lightness: 0.62
"backend-api" → hue: 285, chroma: 0.11, lightness: 0.58
```

### ColorSet 구조

각 함수는 3가지 변형을 반환한다:

- `solid`: 메인 색상 (아이콘, 텍스트 강조)
- `bgLight`: 연한 배경 (light mode) — L≈0.94~0.95, 낮은 chroma
- `bgDark`: 연한 배경 (dark mode) — L≈0.28~0.30, 낮은 chroma

### 해시 함수

djb2 해시 사용. 동일 입력에 항상 같은 결과를 보장한다.

## 적용 위치

### 1. 저장소 카드 (`repos/page.tsx`)

- **아이콘 배경색**: `oklch(bgLight)` (light) / `oklch(bgDark)` (dark)
- **아이콘 색상**: `oklch(solid)` 도메인 고유 색상
- **카드 상단 글로우**: `linear-gradient(90deg, solid/0.6, solid/0.1)` — 2px 높이, hover 시 강조
- ~~카드 좌측 바~~: 제거. 상단 그라데이션 글로우로 대체.

### 2. Author 태그 (`repos/page.tsx`)

- 작성자별 `stringColor(authorName)` 적용
- 배경: `oklch(bgLight)`, 텍스트: `oklch(solid)`
- 이름 앞 1.5px 색상 도트 인디케이터

### 3. 캘린더 태스크 (`calendar/page.tsx`)

- 태스크 항목에 프로젝트별 `stringColor(project)` 적용
- 선택된 날짜 상세 패널의 프로젝트 Badge에도 동일 색상

### 4. 업무 보고서 (`reports/page.tsx`)

- 프로젝트 그룹 헤더: 폴더 아이콘 배경 + 건수 Badge에 색상 적용

### 5. 대시보드 (`page.tsx`)

- 저장소 목록 항목 앞 색상 도트 (2px 원형) — 도메인 식별

## 다크모드 대응

light/dark 모드에 따라 `bgLight`/`bgDark`를 선택 적용한다:
- 저장소 카드 아이콘: `dark:hidden` / `hidden dark:flex` 패턴으로 분기
- 캘린더/리포트 태그: 현재 bgLight 고정 (향후 dark 분기 추가 가능)

## 변경 파일

- `src/lib/color-hash.ts` — OKLCH 색상 유틸리티 (신규)
- `src/app/(dashboard)/repos/page.tsx` — 카드 + Author 태그 색상
- `src/app/(dashboard)/calendar/page.tsx` — 태스크 프로젝트별 색상
- `src/app/(dashboard)/reports/page.tsx` — 프로젝트 그룹 색상
- `src/app/(dashboard)/page.tsx` — 대시보드 저장소 색상 도트

## 범위 외

- DB 스키마 변경 없음
- API 변경 없음
