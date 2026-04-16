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

// idle 2프레임 (숨쉬기)
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

// 물주기 4프레임
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
