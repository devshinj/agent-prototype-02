import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import { getCredentialById, updateCredential, deleteCredential } from "@/infra/db/credential";
import { encrypt } from "@/infra/crypto/token-encryption";
import { auth } from "@/lib/auth";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const credId = parseInt(id, 10);
  if (isNaN(credId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json();
  const { token, label } = body;

  if (!token && label === undefined) {
    return NextResponse.json({ error: "token or label is required" }, { status: 400 });
  }

  const db = getDb();
  try {
    const existing = getCredentialById(db, credId);
    if (!existing) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    if (existing.user_id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    updateCredential(db, credId, {
      credential: token ? encrypt(token) : existing.credential,
      label: label !== undefined ? label : existing.label,
      metadata: existing.metadata,
    });

    return NextResponse.json({ message: "Credential updated" });
  } finally {
    db.close();
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const credId = parseInt(id, 10);
  if (isNaN(credId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  try {
    const existing = getCredentialById(db, credId);
    if (!existing) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    if (existing.user_id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    deleteCredential(db, credId);
    return NextResponse.json({ message: "Credential deleted" });
  } finally {
    db.close();
  }
}
