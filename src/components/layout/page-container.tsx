import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className="fixed left-60 right-0 top-0 bottom-0 overflow-y-auto bg-background">
      <div className={cn("mx-auto w-full max-w-5xl px-8 py-8", className)}>
        {children}
      </div>
    </div>
  );
}
