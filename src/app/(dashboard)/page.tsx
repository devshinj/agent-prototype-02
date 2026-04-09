"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/data-display/stat-card";
import { StatusIndicator } from "@/components/data-display/status-indicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function DashboardPage() {
  const [repos, setRepos] = useState<any[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/repos").then((r) => r.json()).then(setRepos);
    fetch("/api/cron").then((r) => r.json()).then(setSchedulerStatus);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) {
        toast.success("동기화 완료");
      } else {
        const data = await res.json();
        toast.error(data.error || "동기화 실패");
      }
    } catch {
      toast.error("동기화 중 오류 발생");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <Header
        title="대시보드"
        description="Git 커밋 모니터링 및 Notion 동기화 현황"
        actions={
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? "동기화 중..." : "지금 동기화"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="등록된 저장소" value={repos.length} />
        <StatCard
          label="스케줄러 상태"
          value={schedulerStatus?.isRunning ? "실행 중" : "대기"}
        />
        <StatCard
          label="마지막 동기화"
          value={schedulerStatus?.lastRunAt
            ? new Date(schedulerStatus.lastRunAt).toLocaleString("ko-KR")
            : "없음"
          }
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">등록된 저장소</h2>
          {repos.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 저장소가 없습니다. 저장소 관리에서 추가하세요.</p>
          ) : (
            <div className="space-y-3">
              {repos.map((repo: any) => (
                <div key={repo.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <p className="font-medium">{repo.owner}/{repo.repo}</p>
                    <p className="text-sm text-gray-500">브랜치: {repo.branch}</p>
                  </div>
                  <StatusIndicator status={repo.is_active ? "success" : "idle"} label={repo.is_active ? "활성" : "비활성"} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
