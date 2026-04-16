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
