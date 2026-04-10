// src/lib/color-hash.ts
// OKLCH 색공간 기반 결정론적 색상 생성 유틸리티
// 동일 입력 → 항상 동일 색상, 지각적 균일성 보장

/**
 * FNV-1a 해시 — djb2보다 분산이 좋고, seed로 독립적 해시 스트림 생성
 * 유사 접두사 문자열("agent-study" vs "agent-research")도 잘 분산됨
 */
export function fnv1a(str: string, seed = 0x811c9dc5): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 해시를 [min, max) 범위의 float로 매핑 */
function hashToRange(hash: number, min: number, max: number): number {
  return min + (hash % 10000) / 10000 * (max - min);
}

// ─── OKLCH 색상 타입 ───

export interface OklchColor {
  /** lightness 0~1 */
  l: number;
  /** chroma 0~0.4 */
  c: number;
  /** hue 0~360 */
  h: number;
}

export interface ColorSet {
  /** 메인 색상 (아이콘, 텍스트 강조) */
  solid: OklchColor;
  /** 연한 배경 (light mode) */
  bgLight: OklchColor;
  /** 연한 배경 (dark mode) */
  bgDark: OklchColor;
}

// ─── 프로젝트(저장소) 색상 ───

/**
 * "owner/repo" 문자열 → OKLCH ColorSet
 * 이 함수가 프로젝트 색상의 **단일 진실 공급원(single source of truth)**이다.
 * repos 페이지, 캘린더, 보고서 등 모든 곳에서 이 함수를 통해 동일 색상을 얻는다.
 */
export function projectColor(ownerSlashRepo: string): ColorSet {
  const parts = ownerSlashRepo.split("/");
  const owner = parts[0] || ownerSlashRepo;
  const repo = parts.slice(1).join("/") || ownerSlashRepo;

  // owner → 기본 hue (같은 owner는 같은 색 계열)
  const hue = fnv1a(owner) % 360;
  // repo별로 ±30도 오프셋 + chroma/lightness 넓은 변주
  const hueOffset = hashToRange(fnv1a(repo, 7919), -30, 30);
  const repoHue = ((hue + hueOffset) % 360 + 360) % 360;
  const chroma = hashToRange(fnv1a(repo, 1301), 0.07, 0.18);
  const lightness = hashToRange(fnv1a(repo, 3571), 0.48, 0.72);

  return {
    solid: { l: lightness, c: chroma, h: repoHue },
    bgLight: { l: 0.95, c: chroma * 0.4, h: repoHue },
    bgDark: { l: 0.28, c: chroma * 0.35, h: repoHue },
  };
}

/** clone URL에서 owner/repo 추출 후 projectColor에 위임 */
export function repoColor(cloneUrl: string): ColorSet {
  try {
    const url = new URL(cloneUrl);
    const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    const owner = parts[0] || "";
    const repo = parts[1] || "";
    return projectColor(`${owner}/${repo}`);
  } catch {
    return projectColor(cloneUrl);
  }
}

// ─── 범용 문자열 → 색상 (author, project, tag 등) ───

/**
 * 임의의 문자열 → OKLCH ColorSet
 * author 이름, 프로젝트 이름, 태그 등에 범용 사용
 */
export function stringColor(str: string): ColorSet {
  const normalized = str.toLowerCase().trim();

  const hue = fnv1a(normalized) % 360;
  const chroma = hashToRange(fnv1a(normalized, 2699), 0.09, 0.17);
  const lightness = hashToRange(fnv1a(normalized, 4219), 0.55, 0.70);

  return {
    solid: { l: lightness, c: chroma, h: hue },
    bgLight: { l: 0.94, c: chroma * 0.45, h: hue },
    bgDark: { l: 0.30, c: chroma * 0.4, h: hue },
  };
}

// ─── CSS 문자열 헬퍼 ───

/** OklchColor → CSS oklch() 값 */
export function oklch(color: OklchColor, alpha?: number): string {
  const { l, c, h } = color;
  if (alpha !== undefined && alpha < 1) {
    return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / ${alpha})`;
  }
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** ColorSet에서 inline style 객체 생성 (CSS custom properties) */
export function colorVars(
  prefix: string,
  colorSet: ColorSet
): Record<string, string> {
  return {
    [`--${prefix}-solid`]: oklch(colorSet.solid),
    [`--${prefix}-bg`]: oklch(colorSet.bgLight),
    [`--${prefix}-bg-dark`]: oklch(colorSet.bgDark),
    [`--${prefix}-solid-muted`]: oklch(colorSet.solid, 0.15),
  };
}
