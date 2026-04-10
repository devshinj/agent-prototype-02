// src/lib/dot-identicon.ts
// 문자열 해시 → 5×5 대칭 도트 패턴(identicon) 생성 유틸리티
// GitHub identicon과 유사한 결정론적 아바타 이미지 생성

import { fnv1a, projectColor, oklch, type ColorSet } from "@/lib/color-hash"

/** 도트 그리드 데이터 */
export interface DotGrid {
  /** 5×5 boolean 그리드 (true = 도트 ON) */
  cells: boolean[][]
  /** 도트 색상 (oklch CSS 문자열) */
  color: string
  /** 배경 색상 (oklch CSS 문자열) */
  background: string
}

/**
 * 문자열 → 5×5 대칭 도트 그리드 생성
 *
 * 좌측 3열(0~2)을 해시에서 결정하고, 우측 2열(3~4)은 좌우 대칭 복사.
 * 총 15비트로 패턴 결정.
 * 색상은 colorSet으로 주입하거나, 없으면 projectColor(input)을 사용.
 */
export function generateDotGrid(input: string, colorSet?: ColorSet): DotGrid {
  const normalized = input.toLowerCase().trim()
  const patternHash = fnv1a(normalized)

  // 5×5 대칭 그리드 생성 (좌측 3열 → 우측 미러)
  const cells: boolean[][] = []
  for (let row = 0; row < 5; row++) {
    const line: boolean[] = []
    for (let col = 0; col < 3; col++) {
      const bitIndex = row * 3 + col
      line.push(((patternHash >> bitIndex) & 1) === 1)
    }
    // 미러: col 3 = col 1, col 4 = col 0
    line.push(line[1])
    line.push(line[0])
    cells.push(line)
  }

  // 기존 projectColor 색상 체계 사용
  const colors = colorSet ?? projectColor(input)

  return {
    cells,
    color: oklch(colors.solid),
    background: oklch(colors.bgLight),
  }
}

/**
 * 문자열 → data URI SVG (도트 identicon)
 *
 * img src나 CSS background-image에 직접 사용 가능.
 * @param input - 해시할 문자열
 * @param size  - SVG 크기 (px, 기본 80)
 */
export function dotIdenticonSvg(input: string, size = 80): string {
  const { cells, color, background } = generateDotGrid(input)
  const gridSize = 5
  const padding = 2
  const totalCells = gridSize + padding * 2
  const cellSize = size / totalCells

  let rects = ""
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (cells[row][col]) {
        const x = (col + padding) * cellSize
        const y = (row + padding) * cellSize
        const r = cellSize * 0.15
        rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellSize.toFixed(1)}" height="${cellSize.toFixed(1)}" rx="${r.toFixed(1)}" fill="${color}"/>`
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${(size * 0.1).toFixed(1)}" fill="${background}"/>${rects}</svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
