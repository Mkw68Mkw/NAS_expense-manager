import { Link } from "react-router";
import { ArrowDownCircle, ArrowUpCircle, PiggyBank, Plus, Scale, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CategoryDonut, CategoryLegend, IncomeExpenseChart, SpendingTrendChart, TopCategoriesChart } from "@/components/charts";
import { KpiCard, KpiCardSkeleton } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { PeriodFilter, usePeriod } from "@/components/PeriodFilter";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { formatCHF, formatPercent, formatTransactionCount } from "@/lib/format";
import { granularityFor } from "@/lib/period";

function ChartCard({ title, description, loading, empty, children }: {
  title: string;
  description?: string;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : empty ? (
          <EmptyState title="Keine Daten im gewählten Zeitraum" className="h-[260px]" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { preset, setPreset, period, setPeriod } = usePeriod("current_month");
  const granularity = granularityFor(period);

  const data = useApi(
    () =>
      Promise.all([api.summary(period), api.timeline(period, granularity), api.categoryReport(period, "expense")]),
    [period.from, period.to, granularity],
  );
  const [summary, timeline, categories] = data.data ?? [];
  const loading = data.loading && !data.data;
  const hasTransactions = (summary?.transaction_count ?? 0) > 0;

  const loadDemo = async () => {
    try {
      const result = await api.loadDemoData();
      toast.success(`${result.created} Demo-Transaktionen wurden erstellt.`);
      data.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Überblick über Einnahmen und Ausgaben im gewählten Zeitraum."
        actions={<PeriodFilter preset={preset} period={period} onPresetChange={setPreset} onPeriodChange={setPeriod} />}
      />

      {data.error && !data.data ? (
        <Card>
          <ErrorState message={data.error} onRetry={data.reload} />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {loading || !summary ? (
              Array.from({ length: 4 }, (_, i) => <KpiCardSkeleton key={i} />)
            ) : (
              <>
                <KpiCard label="Einnahmen" value={formatCHF(summary.income_cents)} icon={ArrowUpCircle} tone="income" change={summary.changes.income_cents} hint="ggü. Vorperiode" />
                <KpiCard label="Ausgaben" value={formatCHF(summary.expenses_cents)} icon={ArrowDownCircle} tone="expense" change={summary.changes.expenses_cents} positiveIsGood={false} hint="ggü. Vorperiode" />
                <KpiCard label="Saldo" value={formatCHF(summary.net_cents)} icon={Scale} tone="primary" hint={formatTransactionCount(summary.transaction_count)} />
                <KpiCard
                  label="Sparquote"
                  value={formatPercent(summary.savings_rate)}
                  icon={PiggyBank}
                  tone="neutral"
                  change={summary.changes.savings_rate}
                  changeSuffix="Pp."
                  hint={summary.savings_rate === null ? "Keine Einnahmen im Zeitraum" : "ggü. Vorperiode"}
                />
              </>
            )}
          </div>

          {!loading && !hasTransactions && (
            <Card>
              <EmptyState
                title="Noch keine Transaktionen in diesem Zeitraum"
                description="Erfassen Sie Ihre erste Transaktion, importieren Sie eine CSV-Datei oder wählen Sie einen anderen Zeitraum."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild>
                      <Link to="/transaktionen?neu=1">
                        <Plus /> Transaktion erfassen
                      </Link>
                    </Button>
                    <Button variant="outline" onClick={loadDemo}>
                      <Sparkles /> Demo-Daten laden
                    </Button>
                  </div>
                }
              />
            </Card>
          )}

          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <ChartCard
                title="Einnahmen vs. Ausgaben"
                description={granularity === "day" ? "Pro Tag" : "Pro Monat"}
                loading={loading}
                empty={!hasTransactions}
              >
                {timeline && <IncomeExpenseChart data={timeline} granularity={granularity} />}
              </ChartCard>
            </div>
            <div className="xl:col-span-2">
              <ChartCard title="Ausgaben nach Kategorie" loading={loading} empty={!categories?.items.length}>
                {categories && (
                  <div className="flex flex-col gap-4">
                    <CategoryDonut report={categories} height={200} />
                    <CategoryLegend items={categories.items.slice(0, 5)} />
                  </div>
                )}
              </ChartCard>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard
              title="Ausgabentrend"
              description={granularity === "day" ? "Kumulierte Ausgaben im Zeitraum" : "Ausgaben pro Monat"}
              loading={loading}
              empty={!summary?.expenses_cents}
            >
              {timeline && <SpendingTrendChart data={timeline} granularity={granularity} height={260} />}
            </ChartCard>
            <ChartCard title="Top-Ausgabenkategorien" description="Die fünf grössten Kategorien" loading={loading} empty={!categories?.items.length}>
              {categories && <TopCategoriesChart items={categories.items.slice(0, 5)} />}
            </ChartCard>
          </div>
        </div>
      )}
    </>
  );
}
