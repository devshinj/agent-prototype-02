import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTables } from "@/infra/db/schema";
import {
  insertCredential,
  getCredentialsByUser,
  getCredentialByUserAndProvider,
  getCredentialsByUserAndProvider,
  getCredentialById,
  updateCredential,
  deleteCredential,
} from "@/infra/db/credential";

describe("credential repository", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
  });

  afterEach(() => {
    db.close();
  });

  it("should insert and retrieve a credential", () => {
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "encrypted-token",
      label: "GitHub PAT",
      metadata: null,
    });

    const creds = getCredentialsByUser(db, "user1");
    expect(creds).toHaveLength(1);
    expect(creds[0].provider).toBe("git");
    expect(creds[0].credential).toBe("encrypted-token");
    expect(creds[0].label).toBe("GitHub PAT");
  });

  it("should get credential by user and provider", () => {
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "encrypted-git",
      label: null,
      metadata: null,
    });
    insertCredential(db, {
      userId: "user1",
      provider: "notion",
      credential: "encrypted-notion",
      label: null,
      metadata: JSON.stringify({ notionCommitDbId: "db1", notionTaskDbId: "db2" }),
    });

    const git = getCredentialByUserAndProvider(db, "user1", "git");
    expect(git?.credential).toBe("encrypted-git");

    const notion = getCredentialByUserAndProvider(db, "user1", "notion");
    expect(notion?.credential).toBe("encrypted-notion");
    expect(notion?.metadata).toBe(JSON.stringify({ notionCommitDbId: "db1", notionTaskDbId: "db2" }));
  });

  it("should update a credential", () => {
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "old-token",
      label: null,
      metadata: null,
    });

    const cred = getCredentialByUserAndProvider(db, "user1", "git")!;
    updateCredential(db, cred.id, {
      credential: "new-token",
      label: "Updated PAT",
      metadata: null,
    });

    const updated = getCredentialByUserAndProvider(db, "user1", "git")!;
    expect(updated.credential).toBe("new-token");
    expect(updated.label).toBe("Updated PAT");
  });

  it("should delete a credential", () => {
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "token",
      label: null,
      metadata: null,
    });

    const cred = getCredentialByUserAndProvider(db, "user1", "git")!;
    deleteCredential(db, cred.id);

    const result = getCredentialsByUser(db, "user1");
    expect(result).toHaveLength(0);
  });

  it("should get all credentials by user and provider", () => {
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "token1",
      label: "회사",
      metadata: null,
    });
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "token2",
      label: "개인",
      metadata: null,
    });

    const creds = getCredentialsByUserAndProvider(db, "user1", "git");
    expect(creds).toHaveLength(2);
  });

  it("should get credential by id", () => {
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "token1",
      label: "테스트",
      metadata: null,
    });

    const all = getCredentialsByUser(db, "user1");
    const cred = getCredentialById(db, all[0].id);
    expect(cred).toBeDefined();
    expect(cred!.credential).toBe("token1");
  });

  it("should allow multiple credentials for same user and provider", () => {
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "token1",
      label: "회사 GitHub",
      metadata: null,
    });
    insertCredential(db, {
      userId: "user1",
      provider: "git",
      credential: "token2",
      label: "개인 GitHub",
      metadata: null,
    });

    const creds = getCredentialsByUser(db, "user1");
    expect(creds).toHaveLength(2);
    expect(creds.map((c: any) => c.label)).toContain("회사 GitHub");
    expect(creds.map((c: any) => c.label)).toContain("개인 GitHub");
  });
});
