import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getRepositoryByIdAndUser } from "@/infra/db/repository";
import { insertReport, updateReportStatus } from "@/infra/db/report";
import { getDetailedCommitsForDate, getBranches } from "@/infra/git/git-client";
import { auth } from "@/lib/auth";
import { GoogleGenAI } from "@google/genai";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

interface CommitEntry {
  branch: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  commitDate?: string; // the calendar date (YYYY-MM-DD), used for range mode
}

async function collectCommitsForDate(
  clonePath: string,
  cloneUrl: string,
  date: string
): Promise<CommitEntry[]> {
  const branches = await getBranches(clonePath);
  const seenShas = new Set<string>();
  const commits: CommitEntry[] = [];

  for (const branch of branches) {
    try {
      const branchCommits = await getDetailedCommitsForDate(clonePath, branch, cloneUrl, date);
      for (const c of branchCommits) {
        if (seenShas.has(c.sha)) continue;
        seenShas.add(c.sha);
        commits.push({
          branch,
          sha: c.sha,
          message: c.message,
          author: c.author,
          date: c.date,
          filesChanged: c.filesChanged,
          additions: c.additions,
          deletions: c.deletions,
          commitDate: date,
        });
      }
    } catch {
      // 브랜치 오류 무시
    }
  }

  return commits;
}

function buildPrompt(
  repoOwner: string,
  repoName: string,
  dateLabel: string,
  allCommits: CommitEntry[],
  isRange: boolean
): string {
  const commitDetails = allCommits
    .map((c) => {
      const time = new Date(c.date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      const files = c.filesChanged.length > 0 ? c.filesChanged.join(", ") : "(파일 정보 없음)";
      const datePrefix = isRange && c.commitDate ? `[${c.commitDate}] ` : "";
      return `${datePrefix}[${c.branch}] ${time} - ${c.message}
  변경 파일: ${files}
  변경량: +${c.additions} / -${c.deletions}`;
    })
    .join("\n\n");

  const totalAdditions = allCommits.reduce((s, c) => s + c.additions, 0);
  const totalDeletions = allCommits.reduce((s, c) => s + c.deletions, 0);
  const branchSet = [...new Set(allCommits.map((c) => c.branch))];

  const periodLabel = isRange ? "기간" : "날짜";
  const rule4 = isRange
    ? `4. **일자별 정리**: 날짜별로 업무를 구분하여 정리해주세요.`
    : "";

  return `당신은 소프트웨어 개발팀의 업무 보고서 작성 도우미입니다.
아래 Git 커밋 데이터를 분석하여 ${isRange ? "해당 기간의" : "해당일의"} **업무 보고서**를 작성해주세요.

## 기본 정보
- 프로젝트: ${repoOwner}/${repoName}
- ${periodLabel}: ${dateLabel}
- 총 커밋: ${allCommits.length}건
- 총 변경량: +${totalAdditions} / -${totalDeletions}
- 작업 브랜치: ${branchSet.join(", ")}

## 커밋 상세
${commitDetails}

## 보고서 작성 규칙
1. **업무 요약**: ${isRange ? "기간" : "오늘"} 수행한 주요 업무를 3줄 이내로 요약
2. **상세 업무 내용**: 관련된 커밋들을 묶어서 업무 단위로 정리. 각 업무마다:
   - 업무 제목
   - 수행한 내용 설명 (커밋 메시지와 변경 파일을 근거로)
   - 관련 파일 목록
3. **특이 사항**: 버그 수정, 리팩토링, 새 기능 등 주목할 점이 있으면 기재
${rule4}
보고서는 한국어로 작성하고, 마크다운 형식으로 출력해주세요.
보고서 제목이나 날짜는 포함하지 마세요 — 본문만 작성해주세요.`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    repoId,
    date,
    dateRange,
    async: asyncMode,
  }: {
    repoId: number;
    date?: string;
    dateRange?: { since: string; until: string };
    async?: boolean;
  } = body;

  if (!repoId) {
    return NextResponse.json({ error: "repoId is required" }, { status: 400 });
  }
  if (!date && !dateRange) {
    return NextResponse.json({ error: "date or dateRange is required" }, { status: 400 });
  }

  const db = getDb();
  try {
    const repo = getRepositoryByIdAndUser(db, Number(repoId), session.user.id);
    if (!repo) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    if (!repo.clone_path) return NextResponse.json({ error: "Repository not yet cloned" }, { status: 400 });

    const isRange = Boolean(dateRange);
    const dateLabel = isRange ? `${dateRange!.since} ~ ${dateRange!.until}` : date!;

    if (asyncMode) {
      // 비동기 모드: pending 상태로 먼저 저장 후 백그라운드에서 생성
      const reportDate = isRange ? dateRange!.since : date!;
      const pendingId = insertReport(db, {
        userId: session.user.id,
        repositoryId: Number(repoId),
        project: `${repo.owner}/${repo.repo}`,
        date: reportDate,
        title: `[${repo.owner}/${repo.repo}] ${dateLabel} 업무 보고서`,
        content: "",
        dateStart: isRange ? dateRange!.since : undefined,
        dateEnd: isRange ? dateRange!.until : undefined,
        status: "pending",
      });

      // 백그라운드 생성 (await 하지 않음)
      (async () => {
        const bgDb = getDb();
        try {
          // 커밋 수집
          let allCommits: CommitEntry[] = [];
          if (isRange) {
            const current = new Date(dateRange!.since);
            const end = new Date(dateRange!.until);
            while (current <= end) {
              const d = current.toISOString().slice(0, 10);
              const dayCommits = await collectCommitsForDate(repo.clone_path!, repo.clone_url, d);
              allCommits = allCommits.concat(dayCommits);
              current.setDate(current.getDate() + 1);
            }
          } else {
            allCommits = await collectCommitsForDate(repo.clone_path!, repo.clone_url, date!);
          }

          if (allCommits.length === 0) {
            updateReportStatus(bgDb, pendingId, "error", { title: `[${repo.owner}/${repo.repo}] ${dateLabel} 업무 보고서`, content: "해당 기간에 커밋이 없습니다." });
            return;
          }

          const prompt = buildPrompt(repo.owner, repo.repo, dateLabel, allCommits, isRange);
          const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
          const result = await genai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });
          const content = result.text ?? "";
          const title = `[${repo.owner}/${repo.repo}] ${dateLabel} 업무 보고서`;
          updateReportStatus(bgDb, pendingId, "completed", { title, content });
        } catch (err: any) {
          updateReportStatus(bgDb, pendingId, "error", {
            title: `[${repo.owner}/${repo.repo}] ${dateLabel} 업무 보고서`,
            content: err?.message ?? "보고서 생성 중 오류 발생",
          });
        } finally {
          bgDb.close();
        }
      })();

      return NextResponse.json({ id: pendingId, status: "pending" }, { status: 202 });
    }

    // 동기 모드: 기존 동작 + 기간 지원
    let allCommits: CommitEntry[] = [];
    if (isRange) {
      const current = new Date(dateRange!.since);
      const end = new Date(dateRange!.until);
      while (current <= end) {
        const d = current.toISOString().slice(0, 10);
        const dayCommits = await collectCommitsForDate(repo.clone_path, repo.clone_url, d);
        allCommits = allCommits.concat(dayCommits);
        current.setDate(current.getDate() + 1);
      }
    } else {
      allCommits = await collectCommitsForDate(repo.clone_path, repo.clone_url, date!);
    }

    if (allCommits.length === 0) {
      return NextResponse.json({ error: "해당 기간에 커밋이 없습니다." }, { status: 400 });
    }

    const prompt = buildPrompt(repo.owner, repo.repo, dateLabel, allCommits, isRange);

    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const report = result.text ?? "";
    const totalAdditions = allCommits.reduce((s, c) => s + c.additions, 0);
    const totalDeletions = allCommits.reduce((s, c) => s + c.deletions, 0);
    const branchSet = [...new Set(allCommits.map((c) => c.branch))];

    return NextResponse.json({
      title: `[${repo.owner}/${repo.repo}] ${dateLabel} 업무 보고서`,
      content: report,
      meta: {
        totalCommits: allCommits.length,
        totalAdditions,
        totalDeletions,
        branches: branchSet,
      },
    });
  } catch (error: any) {
    console.error("[Report Generate]", error);
    return NextResponse.json({ error: error.message || "보고서 생성 실패" }, { status: 500 });
  } finally {
    db.close();
  }
}
