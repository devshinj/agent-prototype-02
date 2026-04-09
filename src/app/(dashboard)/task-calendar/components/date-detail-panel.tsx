"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CalendarDays, GitCommit, GitBranch, FolderGit2, FileText, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface RepoDateDetail {
  repoId: number;
  repoName: string;
  owner: string;
  branches: {
    branch: string;
    commits: { sha: string; message: string; author: string; date: string }[];
  }[];
}

interface DateDetailPanelProps {
  selectedDate: string;
  commitCount: number;
  repoIds: string;
}

export function DateDetailPanel({ selectedDate, commitCount, repoIds }: DateDetailPanelProps) {
  const [dateDetail, setDateDetail] = useState<RepoDateDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());

  const [reportRepo, setReportRepo] = useState<RepoDateDetail | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);

  useEffect(() => {
    setExpandedBranches(new Set());
    setLoading(true);
    const params = repoIds ? `?repoIds=${repoIds}` : "";
    fetch(`/api/repos/commit-calendar/${selectedDate}${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDateDetail(data);
      })
      .catch(() => setDateDetail([]))
      .finally(() => setLoading(false));
  }, [selectedDate, repoIds]);

  async function openReport(repo: RepoDateDetail) {
    if (!confirm(`${selectedDate} — ${repo.owner}/${repo.repoName}\n\n해당일 태스크 보고서를 작성하시겠습니까?`)) return;

    setReportRepo(repo);
    setReportTitle(`[${repo.owner}/${repo.repoName}] ${selectedDate} 업무 보고서`);
    setReportContent("");
    setReportGenerating(true);

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId: repo.repoId, date: selectedDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setReportTitle(data.title);
        setReportContent(data.content);
      } else {
        toast.error(data.error || "보고서 생성 실패");
        setReportContent("보고서 생성에 실패했습니다. 직접 작성해주세요.");
      }
    } catch {
      toast.error("보고서 생성 중 오류가 발생했습니다");
      setReportContent("보고서 생성에 실패했습니다. 직접 작성해주세요.");
    } finally {
      setReportGenerating(false);
    }
  }

  function closeReport() {
    setReportRepo(null);
    setReportTitle("");
    setReportContent("");
  }

  async function handleCopyReport() {
    if (!reportContent.trim()) { toast.error("보고서 내용이 없습니다"); return; }
    setReportSaving(true);
    try {
      await navigator.clipboard.writeText(`# ${reportTitle}\n\n${reportContent}`);
      toast.success("보고서가 클립보드에 복사되었습니다");
    } catch { toast.error("클립보드 복사에 실패했습니다"); }
    finally { setReportSaving(false); }
  }

  async function handleSaveReport() {
    if (!reportContent.trim() || !reportRepo) return;
    setReportSaving(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryId: reportRepo.repoId,
          project: `${reportRepo.owner}/${reportRepo.repoName}`,
          date: selectedDate,
          title: reportTitle,
          content: reportContent,
        }),
      });
      if (res.ok) { toast.success("보고서가 저장되었습니다"); closeReport(); }
      else { const data = await res.json(); toast.error(data.error || "저장 실패"); }
    } catch { toast.error("보고서 저장 중 오류가 발생했습니다"); }
    finally { setReportSaving(false); }
  }

  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{selectedDate}</span>
        <Badge variant="outline" className="text-xs">{commitCount}개 커밋</Badge>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-muted-foreground animate-pulse">커밋 상세 로딩 중...</div>
      ) : dateDetail.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">이 날짜에 커밋 활동이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {dateDetail.map((repo) => (
            <Card key={repo.repoId}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{repo.owner}/{repo.repoName}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {repo.branches.reduce((sum, b) => sum + b.commits.length, 0)} 커밋
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => openReport(repo)}>
                    <FileText className="h-3.5 w-3.5" />
                    보고서 작성
                  </Button>
                </div>

                <div className="ml-3 space-y-1 border-l-2 border-muted pl-4">
                  {repo.branches.map((branch) => {
                    const branchKey = `${repo.repoId}:${branch.branch}`;
                    const isOpen = expandedBranches.has(branchKey);
                    return (
                      <div key={branch.branch}>
                        <button
                          className="flex items-center gap-1.5 py-1 w-full text-left hover:bg-muted/50 rounded-sm px-1 -ml-1 transition-colors"
                          onClick={() => {
                            setExpandedBranches((prev) => {
                              const next = new Set(prev);
                              if (next.has(branchKey)) next.delete(branchKey);
                              else next.add(branchKey);
                              return next;
                            });
                          }}
                        >
                          <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">{branch.branch}</span>
                          <span className="text-[10px] text-muted-foreground">({branch.commits.length})</span>
                        </button>

                        {isOpen && (
                          <div className="ml-5 space-y-1 border-l border-dashed border-muted-foreground/30 pl-3 mt-1 mb-2">
                            {branch.commits.map((commit) => (
                              <div key={commit.sha} className="flex items-start gap-2">
                                <GitCommit className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/60 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <code className="text-[10px] text-muted-foreground font-mono">{commit.sha.slice(0, 7)}</code>
                                    <span className="text-xs text-muted-foreground">{commit.author}</span>
                                    <span className="text-[10px] text-muted-foreground/60">
                                      {new Date(commit.date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                  <p className="text-xs truncate">{commit.message}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={reportRepo !== null} onOpenChange={(open) => { if (!open && !reportGenerating) closeReport(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />업무 보고서
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto min-h-0">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Badge variant="outline">{selectedDate}</Badge>
              {reportRepo && (
                <span className="flex items-center gap-1">
                  <FolderGit2 className="h-3.5 w-3.5" />{reportRepo.owner}/{reportRepo.repoName}
                </span>
              )}
            </div>
            {reportGenerating ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">커밋 데이터를 분석하여 보고서를 작성하고 있습니다...</p>
                <p className="text-xs text-muted-foreground">변경 파일과 커밋 내용을 기반으로 AI가 업무 보고서를 생성합니다</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium">제목</label>
                  <Input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium">내용</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">에디터에서 자유롭게 수정이 가능합니다.</span>
                      <button
                        className="text-[10px] px-2 py-0.5 rounded-full border border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 transition-colors"
                        onClick={handleCopyReport} disabled={!reportContent}
                      >복사</button>
                    </div>
                  </div>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[350px] resize-y focus:outline-none focus:ring-2 focus:ring-ring font-mono leading-relaxed"
                    value={reportContent} onChange={(e) => setReportContent(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          {!reportGenerating && (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={closeReport}>닫기</Button>
              <Button disabled={!reportContent || reportSaving} onClick={handleSaveReport}>보고서 저장</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
