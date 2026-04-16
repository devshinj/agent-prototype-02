"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TreeCanvas } from "./tree-canvas";
import type { TreeMetrics } from "@/core/types";

interface GrowthTreeProps {
  metrics: TreeMetrics;
  loading?: boolean;
}

export function GrowthTree({ metrics, loading = false }: GrowthTreeProps): React.JSX.Element {
  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardContent className="p-4">
          <div className="h-[280px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const hasRepos = metrics.repos.length > 0;

  return (
    <Card className="w-full h-full">
      <CardContent className="p-4 flex flex-col items-center gap-2">
        <div className="relative">
          <TreeCanvas metrics={metrics} />
          {!hasRepos && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
              <p className="text-sm text-muted-foreground mb-2">
                저장소를 등록하고
                <br />
                나무를 키워보세요
              </p>
              <Link
                href="/repos"
                className="pointer-events-auto text-xs text-primary underline underline-offset-2"
              >
                저장소 관리 →
              </Link>
            </div>
          )}
        </div>
        {hasRepos && (
          <div className="text-xs text-muted-foreground text-center w-full">
            <span>총 {metrics.totalCommits} 커밋</span>
            {metrics.currentStreak > 0 && (
              <> · <span>{metrics.currentStreak}일 연속</span></>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
