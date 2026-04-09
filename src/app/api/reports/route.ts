import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { insertReport, getReportsByUser } from "@/infra/db/report";
import { auth } from "@/lib/auth";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  try {
    const reports = getReportsByUser(db, session.user.id);
    return NextResponse.json(reports);
  } finally {
    db.close();
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { repositoryId, project, date, title, content, dateStart, dateEnd, status } = body;

  if (!repositoryId || !project || !date || !title) {
    return NextResponse.json({ error: "repositoryId, project, date, title are required" }, { status: 400 });
  }

  const db = getDb();
  try {
    const id = insertReport(db, {
      userId: session.user.id,
      repositoryId,
      project,
      date,
      title,
      content: content ?? "",
      dateStart,
      dateEnd,
      status,
    });
    return NextResponse.json({ id, message: "Report saved" }, { status: 201 });
  } finally {
    db.close();
  }
}
