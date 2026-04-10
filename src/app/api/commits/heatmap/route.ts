// src/app/api/commits/heatmap/route.ts
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getHeatmapCounts } from "@/infra/db/repository";
import { auth } from "@/lib/auth";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const months = Math.min(Number(searchParams.get("months") || 6), 12);

  const until = new Date().toISOString().split("T")[0];
  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - months);
  const since = sinceDate.toISOString().split("T")[0];

  const db = getDb();
  try {
    const data = getHeatmapCounts(db, session.user.id, since, until);
    return NextResponse.json({ data, since, until });
  } finally {
    db.close();
  }
}
