"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  return (
    <div>
      <Header title="설정" description="서비스 구성을 관리합니다" />

      <div className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Notion 데이터베이스</CardTitle>
            <CardDescription>Notion에 생성된 데이터베이스 ID를 설정합니다</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">커밋 로그 DB ID</label>
                <Input placeholder="Notion 데이터베이스 ID" disabled />
              </div>
              <div>
                <label className="text-sm font-medium">일일 태스크 DB ID</label>
                <Input placeholder="Notion 데이터베이스 ID" disabled />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>폴링 설정</CardTitle>
            <CardDescription>커밋 수집 주기를 설정합니다 (기본: 15분)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              현재 폴링 주기는 서버 시작 시 설정됩니다.
              <code className="bg-gray-100 px-1 rounded">instrumentation.ts</code>에서 변경 가능합니다.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API 키 상태</CardTitle>
            <CardDescription>연결된 외부 서비스 상태를 확인합니다</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>GitHub Token</span>
                <span className="text-gray-500">서버 사이드에서 확인</span>
              </div>
              <div className="flex justify-between">
                <span>Notion API Key</span>
                <span className="text-gray-500">서버 사이드에서 확인</span>
              </div>
              <div className="flex justify-between">
                <span>Gemini API Key</span>
                <span className="text-gray-500">서버 사이드에서 확인</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
