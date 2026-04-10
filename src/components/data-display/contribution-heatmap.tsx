"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface ContributionHeatmapProps {
  data: Record<string, number>;
  months?: number;
}

const levels = [
  "oklch(0.920 0.000 0)",    // level 0: empty (neutral gray)
  "oklch(0.900 0.040 145)",  // level 1
  "oklch(0.780 0.100 145)",  // level 2
  "oklch(0.640 0.160 145)",  // level 3
  "oklch(0.500 0.200 145)",  // level 4
];

const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ContributionHeatmap({ data, months = 6 }: ContributionHeatmapProps) {
  const { weeks, monthLabels, totalCommits } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate start date: today minus `months` months
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setHours(0, 0, 0, 0);

    // Align to previous Sunday
    const dayOfWeek = startDate.getDay(); // 0=Sun
    startDate.setDate(startDate.getDate() - dayOfWeek);

    // Build weeks (column-major: each column is a week)
    type WeekCol = ({ dateStr: string; count: number } | null)[];
    const weeksArr: WeekCol[] = [];
    const monthLabelMap: { weekIndex: number; label: string }[] = [];

    let current = new Date(startDate);
    let lastSeenMonth = -1;

    while (current <= today) {
      const weekCol: WeekCol = [];
      for (let d = 0; d < 7; d++) {
        if (current > today) {
          weekCol.push(null);
          current = new Date(current);
          current.setDate(current.getDate() + 1);
        } else {
          const dateStr = formatDate(current);
          const count = data[dateStr] ?? 0;
          weekCol.push({ dateStr, count });

          // Track month label at start of month
          const month = current.getMonth();
          if (month !== lastSeenMonth) {
            monthLabelMap.push({
              weekIndex: weeksArr.length,
              label: `${current.getMonth() + 1}월`,
            });
            lastSeenMonth = month;
          }

          current = new Date(current);
          current.setDate(current.getDate() + 1);
        }
      }
      weeksArr.push(weekCol);
    }

    // Total commits
    const total = Object.values(data).reduce((sum, v) => sum + v, 0);

    return { weeks: weeksArr, monthLabels: monthLabelMap, totalCommits: total };
  }, [data, months]);

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-sm">Contributions</span>
          <span className="text-xs text-muted-foreground">
            최근 {months}개월간 {totalCommits}개 커밋
          </span>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto">
          <div className="inline-block">
            {/* Month labels */}
            <div className="flex mb-1 ml-6">
              {weeks.map((_, weekIdx) => {
                const label = monthLabels.find((m) => m.weekIndex === weekIdx);
                return (
                  <div key={weekIdx} className="w-3 mr-0.5 text-xs text-muted-foreground leading-none">
                    {label ? label.label : ""}
                  </div>
                );
              })}
            </div>

            {/* Day labels + cells */}
            <div className="flex">
              {/* Day name labels */}
              <div className="flex flex-col gap-0.5 mr-1">
                {dayNames.map((name, idx) => (
                  <div key={idx} className="w-4 h-3 text-xs text-muted-foreground leading-none flex items-center justify-end pr-0.5">
                    {idx % 2 === 1 ? name : ""}
                  </div>
                ))}
              </div>

              {/* Week columns */}
              <div className="flex gap-0.5">
                {weeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-0.5">
                    {week.map((cell, dayIdx) => {
                      if (!cell) {
                        return <div key={dayIdx} className="w-3 h-3" />;
                      }
                      const level = getLevel(cell.count);
                      return (
                        <div
                          key={dayIdx}
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: levels[level] }}
                          title={`${cell.dateStr}: ${cell.count}개 커밋`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1 mt-3 justify-end">
          <span className="text-xs text-muted-foreground">적음</span>
          {levels.map((color, idx) => (
            <div
              key={idx}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
          ))}
          <span className="text-xs text-muted-foreground">많음</span>
        </div>
      </CardContent>
    </Card>
  );
}
