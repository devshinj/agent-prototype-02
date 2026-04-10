"use client";

import { useMemo } from "react";
import { generateDotGrid } from "@/lib/dot-identicon";
import type { ColorSet } from "@/lib/color-hash";

interface DotIdenticonProps {
  /** 해시할 문자열 (e.g. "owner/repo") */
  value: string;
  /** 크기 (px, 기본 32) */
  size?: number;
  /** 색상 세트 (미지정 시 projectColor(value) 사용) */
  colorSet?: ColorSet;
  /** 추가 className */
  className?: string;
}

export function DotIdenticon({ value, size = 32, colorSet, className }: DotIdenticonProps) {
  const grid = useMemo(() => generateDotGrid(value, colorSet), [value, colorSet]);

  const gridSize = 5;
  const padding = 1.5;
  const totalCells = gridSize + padding * 2;
  const cellSize = size / totalCells;
  const gap = cellSize * 0.12;
  const dotSize = cellSize - gap;
  const radius = dotSize * 0.2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
    >
      <rect
        width={size}
        height={size}
        rx={size * 0.18}
        fill={grid.background}
      />
      {grid.cells.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={((c + padding) * cellSize + gap / 2).toFixed(1)}
              y={((r + padding) * cellSize + gap / 2).toFixed(1)}
              width={dotSize.toFixed(1)}
              height={dotSize.toFixed(1)}
              rx={radius.toFixed(1)}
              fill={grid.color}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
