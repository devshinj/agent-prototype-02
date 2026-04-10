// src/infra/db/connection.ts
// 프로세스 전체에서 단일 Database 인스턴스를 공유하는 싱글톤 모듈.
// WAL 모드 + busy_timeout으로 동시 읽기/쓰기 안정성 확보.

import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!instance) {
    instance = new Database(join(process.cwd(), "data", "tracker.db"));

    // WAL 모드: 동시 읽기 허용 + 쓰기 충돌 감소
    instance.pragma("journal_mode = WAL");
    // 잠금 대기 5초 (기본값 0은 즉시 실패)
    instance.pragma("busy_timeout = 5000");
    // WAL 모드에서는 NORMAL이 안전하면서 빠름
    instance.pragma("synchronous = NORMAL");
    // 외래키 제약 활성화
    instance.pragma("foreign_keys = ON");
    // 임시 테이블을 메모리에 저장
    instance.pragma("temp_store = MEMORY");
    // 페이지 캐시 64MB (기본값 ~2MB)
    instance.pragma("cache_size = -64000");

    createTables(instance);
    migrateSchema(instance);
  }
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
