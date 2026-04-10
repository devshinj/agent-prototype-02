import { NextRequest, NextResponse } from "next/server";
import { getRepositoryByIdAndUser } from "@/infra/db/repository";
import { getRecentCommits } from "@/infra/git/git-client";
import { auth } from "@/lib/auth";
import { getDb } from "@/infra/db/connection";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch") || "main";
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

  const db = getDb();
  try {
    const repo = getRepositoryByIdAndUser(db, Number(id), session.user.id);
    if (!repo) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    if (!repo.clone_path) return NextResponse.json({ error: "Repository not yet cloned" }, { status: 400 });

    const commits = await getRecentCommits(repo.clone_path, branch, repo.clone_url, limit);
    return NextResponse.json(commits);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
