import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm text-neutral-500">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold",
            tone === "warning" && "text-amber-600",
            tone === "danger" && "text-red-600",
            tone === "default" && "text-neutral-900",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
