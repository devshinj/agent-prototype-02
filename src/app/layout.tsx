import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Repo Repoter",
  description: "Git 커밋을 분석하여 일일 업무 기록을 자동 생성합니다",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SessionProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  );
}
