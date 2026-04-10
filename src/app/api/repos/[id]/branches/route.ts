import { NextRequest, NextResponse } from "next/server";
import { getRepositoryByIdAndUser } from "@/infra/db/repository";
import { getBranches } from "@/infra/git/git-client";
import { auth } from "@/lib/auth";
import { getDb } from "@/infra/db/connection";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  try {
    const repo = getRepositoryByIdAndUser(db, Number(id), session.user.id);
    if (!repo) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    if (!repo.clone_path) return NextResponse.json({ error: "Repository not yet cloned" }, { status: 400 });

    const branches = await getBranches(repo.clone_path);
    return NextResponse.json(branches);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
