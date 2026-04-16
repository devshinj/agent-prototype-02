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
