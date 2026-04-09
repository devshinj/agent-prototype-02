import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn("ml-60 min-h-screen bg-background p-8", className)}>{children}</div>;
}
