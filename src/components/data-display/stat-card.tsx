import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  description?: string;
}

export function StatCard({ label, value, description }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}
