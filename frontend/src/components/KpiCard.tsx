import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "income" | "expense" | "neutral" | "primary";
  /** Relative change vs. previous period; `positiveIsGood` decides the color. */
  change?: number | null;
  changeSuffix?: string;
  positiveIsGood?: boolean;
  hint?: string;
}

const TONES = {
  income: "bg-income/12 text-income",
  expense: "bg-expense/12 text-expense",
  primary: "bg-primary/12 text-primary",
  neutral: "bg-muted text-muted-foreground",
};

export function KpiCard({ label, value, icon: Icon, tone = "neutral", change, changeSuffix, positiveIsGood = true, hint }: KpiCardProps) {
  const hasChange = change !== undefined && change !== null;
  const good = hasChange && (change === 0 ? null : (change > 0) === positiveIsGood);

  return (
    <Card className="gap-3 px-5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", TONES[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <div className="text-muted-foreground flex min-h-5 items-center gap-1.5 text-xs">
        {hasChange && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              good === true && "text-income",
              good === false && "text-expense",
            )}
          >
            {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {changeSuffix ? `${change > 0 ? "+" : ""}${change.toLocaleString("de-CH")} ${changeSuffix}` : formatPercent(change, true)}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  );
}

export function KpiCardSkeleton() {
  return (
    <Card className="gap-3 px-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-4 w-28" />
    </Card>
  );
}
