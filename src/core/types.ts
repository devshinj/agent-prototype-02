// src/core/types.ts

/** GitHub에서 수집한 커밋 원시 데이터 */
export interface CommitRecord {
  sha: string;
  message: string;
  author: string;
  date: string; // ISO 8601
  repoOwner: string;
  repoName: string;
  branch: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

/** Gemini 분석을 거친 일일 태스크 */
export interface DailyTask {
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  project: string;
  complexity: "Low" | "Medium" | "High" | "Critical";
  commitShas: string[];
}

/** 등록된 저장소 정보 */
export interface Repository {
  id: number;
  owner: string;
  repo: string;
  branch: string;
  lastSyncedSha: string | null;
  isActive: boolean;
  pollingIntervalMin: number;
  createdAt: string;
  updatedAt: string;
}

/** 동기화 로그 */
export interface SyncLog {
  id: number;
  repositoryId: number;
  status: "success" | "error";
  commitsProcessed: number;
  tasksCreated: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** Gemini 분석 요청 페이로드 */
export interface AnalysisRequest {
  commits: CommitRecord[];
  project: string;
  date: string;
}

/** 폴링 스케줄러 상태 */
export interface SchedulerStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  intervalMin: number;
}
