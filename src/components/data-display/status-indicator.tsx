import { Badge } from "@/components/ui/badge";

type Status = "success" | "error" | "running" | "idle";

interface StatusIndicatorProps {
  status: Status;
  label?: string;
}

const statusConfig: Record<Status, { variant: "default" | "secondary" | "destructive" | "outline"; text: string }> = {
  success: { variant: "default", text: "성공" },
  error: { variant: "destructive", text: "에러" },
  running: { variant: "secondary", text: "실행 중" },
  idle: { variant: "outline", text: "대기" },
};

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{label || config.text}</Badge>;
}
