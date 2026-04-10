import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { insertUser, getUserByEmail } from "@/infra/db/repository";
import { getDb } from "@/infra/db/connection";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, password } = body;

  if (!name?.trim() || !email || !password) {
    return NextResponse.json({ error: "이름, 이메일, 비밀번호를 모두 입력해주세요" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "비밀번호는 6자 이상이어야 합니다" }, { status: 400 });
  }

  const db = getDb();
  const existing = getUserByEmail(db, email);
  if (existing) {
    return NextResponse.json({ error: "이미 등록된 이메일입니다" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  insertUser(db, { name, email, passwordHash });

  return NextResponse.json({ message: "회원가입 완료" }, { status: 201 });
}
