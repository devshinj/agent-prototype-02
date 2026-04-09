// src/infra/notion/notion-client.ts
import { Client } from "@notionhq/client";
import type { CommitRecord, DailyTask } from "@/core/types";

export interface NotionUserConfig {
  apiKey: string;
  commitDbId: string;
  taskDbId: string;
}

function createClient(apiKey: string): Client {
  return new Client({ auth: apiKey });
}

export function buildCommitLogProperties(commit: CommitRecord) {
  return {
    Title: { title: [{ text: { content: commit.message.slice(0, 100) } }] },
    Project: { select: { name: commit.repoName } },
    Date: { date: { start: commit.date } },
    Author: { rich_text: [{ text: { content: commit.author } }] },
    "Commit SHA": { rich_text: [{ text: { content: commit.sha } }] },
    "Files Changed": {
      rich_text: [{ text: { content: commit.filesChanged.join("\n").slice(0, 2000) } }],
    },
    Branch: { select: { name: commit.branch } },
  };
}

export function buildDailyTaskProperties(task: DailyTask) {
  return {
    "제목": { title: [{ text: { content: task.title } }] },
    "작업 설명": { rich_text: [{ text: { content: task.description.slice(0, 2000) } }] },
    "작업일": { date: { start: task.date } },
    "프로젝트": { select: { name: task.project } },
    "작업 복잡도": { select: { name: task.complexity } },
  };
}

export async function createCommitLogPage(config: NotionUserConfig, commit: CommitRecord): Promise<string> {
  const client = createClient(config.apiKey);
  const response = await client.pages.create({
    parent: { database_id: config.commitDbId },
    properties: buildCommitLogProperties(commit) as any,
  });
  return response.id;
}

export async function createDailyTaskPage(config: NotionUserConfig, task: DailyTask): Promise<string> {
  const client = createClient(config.apiKey);
  const response = await client.pages.create({
    parent: { database_id: config.taskDbId },
    properties: buildDailyTaskProperties(task) as any,
  });
  return response.id;
}

async function queryDatabase(client: Client, databaseId: string, filter?: any): Promise<any> {
  return client.request({
    path: `databases/${databaseId}/query`,
    method: "post",
    body: { filter },
  });
}

export async function isCommitAlreadySynced(config: NotionUserConfig, sha: string): Promise<boolean> {
  const client = createClient(config.apiKey);
  const response = await queryDatabase(client, config.commitDbId, {
    property: "Commit SHA",
    rich_text: { equals: sha },
  });
  return response.results.length > 0;
}

export async function isDailyTaskExists(config: NotionUserConfig, project: string, date: string): Promise<string | null> {
  const client = createClient(config.apiKey);
  const response = await queryDatabase(client, config.taskDbId, {
    and: [
      { property: "프로젝트", select: { equals: project } },
      { property: "작업일", date: { equals: date } },
    ],
  });
  return response.results.length > 0 ? response.results[0].id : null;
}

export async function updateDailyTaskPage(config: NotionUserConfig, pageId: string, task: DailyTask): Promise<void> {
  const client = createClient(config.apiKey);
  await client.pages.update({
    page_id: pageId,
    properties: buildDailyTaskProperties(task) as any,
  });
}
