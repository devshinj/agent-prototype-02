import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { createTables, migrateSchema } from "@/infra/db/schema";
import {
  insertCredential,
  getCredentialsByUser,
} from "@/infra/db/credential";
import { encrypt, maskToken } from "@/infra/crypto/token-encryption";
import { auth } from "@/lib/auth";

function getDb() {
  const db = new Database(join(process.cwd(), "data", "tracker.db"));
  createTables(db);
  migrateSchema(db);
  return db;
}

const validProviders = ["git"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  try {
    const creds = getCredentialsByUser(db, session.user.id);
    const masked = creds.map((c: any) => ({
      id: c.id,
      provider: c.provider,
      label: c.label,
      metadata: c.metadata ? JSON.parse(c.metadata) : null,
      maskedToken: maskToken(c.credential.split(":").pop() || "****"),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
    return NextResponse.json(masked);
  } finally {
    db.close();
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { provider, token, label } = body;

  if (!provider || !token || !label) {
    return NextResponse.json({ error: "provider, token, label are required" }, { status: 400 });
  }
  if (!validProviders.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of: ${validProviders.join(", ")}` }, { status: 400 });
  }

  const db = getDb();
  try {
    const encrypted = encrypt(token);
    insertCredential(db, {
      userId: session.user.id,
      provider,
      credential: encrypted,
      label,
      metadata: null,
    });

    return NextResponse.json({ message: "Credential saved" }, { status: 201 });
  } finally {
    db.close();
  }
}
