import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, CalendarDays, PiggyBank, Scale } from "lucide-react";
import { CategoryLabel } from "@/components/CategoryIcon";
import { CashflowChart, CategoryDonut, CategoryTrendChart, CumulativeNetChart } from "@/components/charts";
import { KpiCard, KpiCardSkeleton } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { PeriodFilter, usePeriod } from "@/components/PeriodFilter";
import { EmptyState, ErrorState } from "@/components/States";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { formatCHF, formatDate, formatPercent, formatPeriodLong } from "@/lib/format";
import type { Summary, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

function Section({ title, description, loading, empty, children, actions }: {
  title: string;
  description?: string;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[280px] w-full" /> : empty ? <EmptyState title="Keine Daten im gewählten Zeitraum" /> : children}
      </CardContent>
    </Card>
  );
}

function ComparisonTable({ summary }: { summary: Summary }) {
  const rows: { label: string; current: string; previous: string; change: number | null; positiveIsGood: boolean; suffix?: string }[] = [
    { label: "Einnahmen", current: formatCHF(summary.income_cents), previous: formatCHF(summary.previous.income_cents), change: summary.changes.income_cents, positiveIsGood: true },
    { label: "Ausgaben", current: formatCHF(summary.expenses_cents), previous: formatCHF(summary.previous.expenses_cents), change: summary.changes.expenses_cents, positiveIsGood: false },
    { label: "Netto-Cashflow", current: formatCHF(summary.net_cents), previous: formatCHF(summary.previous.net_cents), change: summary.changes.net_cents, positiveIsGood: true },
    { label: "Ø Ausgaben pro Tag", current: formatCHF(summary.avg_daily_spending_cents), previous: formatCHF(summary.previous.avg_daily_spending_cents), change: summary.changes.avg_daily_spending_cents, positiveIsGood: false },
    { label: "Sparquote", current: formatPercent(summary.savings_rate), previous: formatPercent(summary.previous.savings_rate), change: summary.changes.savings_rate, positiveIsGood: true, suffix: "Pp." },
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Kennzahl</TableHead>
          <TableHead className="text-right">Aktuell</TableHead>
          <TableHead className="text-right">Vorperiode</TableHead>
          <TableHead className="text-right">Veränderung</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const good = row.change === null || row.change === 0 ? null : row.change > 0 === row.positiveIsGood;
          return (
            <TableRow key={row.label}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right tabular-nums">{row.current}</TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">{row.previous}</TableCell>
              <TableCell className={cn("text-right tabular-nums", good === true && "text-income", good === false && "text-expense")}>
                {row.change === null
                  ? "–"
                  : row.suffix
                    ? `${row.change > 0 ? "+" : ""}${row.change.toLocaleString("de-CH")} ${row.suffix}`
                    : formatPercent(row.change, true)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function ReportsPage() {
  const { preset, setPreset, period, setPeriod } = usePeriod("current_year");
  const [categoryType, setCategoryType] = useState<TransactionType>("expense");

  const main = useApi(() => Promise.all([api.summary(period, 10), api.timeline(period, "month")]), [period.from, period.to]);
  const categoryData = useApi(() => api.categoryReport(period, categoryType, true), [period.from, period.to, categoryType]);

  const [summary, monthly] = main.data ?? [];
  const loading = main.loading && !main.data;
  const categoriesLoading = categoryData.loading && !categoryData.data;
  const empty = !summary?.transaction_count;
  const categoryReport = categoryData.data;

  return (
    <>
      <PageHeader
        title="Berichte"
        description="Detaillierte Auswertungen und Vergleich mit der Vorperiode."
        actions={<PeriodFilter preset={preset} period={period} onPresetChange={setPreset} onPeriodChange={setPeriod} />}
      />

      {main.error && !main.data ? (
        <Card>
          <ErrorState message={main.error} onRetry={main.reload} />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {loading || !summary ? (
              Array.from({ length: 5 }, (_, i) => <KpiCardSkeleton key={i} />)
            ) : (
              <>
                <KpiCard label="Einnahmen" value={formatCHF(summary.income_cents)} icon={ArrowUpCircle} tone="income" change={summary.changes.income_cents} />
                <KpiCard label="Ausgaben" value={formatCHF(summary.expenses_cents)} icon={ArrowDownCircle} tone="expense" change={summary.changes.expenses_cents} positiveIsGood={false} />
                <KpiCard label="Netto-Cashflow" value={formatCHF(summary.net_cents)} icon={Scale} tone="primary" change={summary.changes.net_cents} />
                <KpiCard label="Sparquote" value={formatPercent(summary.savings_rate)} icon={PiggyBank} change={summary.changes.savings_rate} changeSuffix="Pp." />
                <KpiCard
                  label="Ø Ausgaben / Tag"
                  value={formatCHF(summary.avg_daily_spending_cents)}
                  icon={CalendarDays}
                  change={summary.changes.avg_daily_spending_cents}
                  positiveIsGood={false}
                  hint={`${summary.days} Tage`}
                />
              </>
            )}
          </div>

          <Section title="Monatliche Einnahmen & Ausgaben" description="Balken je Monat mit Netto-Cashflow als Linie" loading={loading} empty={empty}>
            {monthly && <CashflowChart data={monthly} />}
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Kumulierter Netto-Cashflow" description="Entwicklung des Saldos über den Zeitraum" loading={loading} empty={empty}>
              {monthly && <CumulativeNetChart data={monthly} />}
            </Section>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Vergleich mit Vorperiode</CardTitle>
                  {summary && (
                    <CardDescription>
                      {formatDate(summary.previous.date_from)} – {formatDate(summary.previous.date_to)}
                    </CardDescription>
                  )}
                </div>
              </CardHeader>
              <CardContent>{loading || !summary ? <Skeleton className="h-[260px] w-full" /> : <ComparisonTable summary={summary} />}</CardContent>
            </Card>
          </div>

          <Section
            title="Kategorieverteilung"
            description={categoryType === "expense" ? "Anteile der Ausgaben" : "Anteile der Einnahmen"}
            loading={categoriesLoading}
            empty={!categoryReport?.items.length}
            actions={
              <Tabs value={categoryType} onValueChange={(v) => setCategoryType(v as TransactionType)}>
                <TabsList aria-label="Kategorietyp">
                  <TabsTrigger value="expense">Ausgaben</TabsTrigger>
                  <TabsTrigger value="income">Einnahmen</TabsTrigger>
                </TabsList>
              </Tabs>
            }
          >
            {categoryReport && (
              <div className="grid items-center gap-6 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <CategoryDonut report={categoryReport} height={280} />
                </div>
                <div className="lg:col-span-3">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Kategorie</TableHead>
                        <TableHead className="text-right">Anzahl</TableHead>
                        <TableHead className="text-right">Betrag</TableHead>
                        <TableHead className="text-right">Anteil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryReport.items.map((item) => (
                        <TableRow key={item.category_id}>
                          <TableCell>
                            <CategoryLabel name={item.name} icon={item.icon} color={item.color} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{item.transaction_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCHF(item.total_cents)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <div className="flex items-center justify-end gap-2">
                              <div className="bg-muted hidden h-1.5 w-16 overflow-hidden rounded-full sm:block">
                                <div className="h-full rounded-full" style={{ width: `${item.share ?? 0}%`, backgroundColor: item.color }} />
                              </div>
                              {formatPercent(item.share)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Monatliche Trends nach Kategorie"
            description={categoryType === "expense" ? "Ausgaben je Monat, gestapelt nach Kategorie" : "Einnahmen je Monat, gestapelt nach Kategorie"}
            loading={categoriesLoading}
            empty={!categoryReport?.items.length}
          >
            {categoryReport && <CategoryTrendChart report={categoryReport} />}
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Grösste Ausgaben</CardTitle>
                  <CardDescription>Die zehn höchsten Einzelausgaben im Zeitraum</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {loading || !summary ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : summary.largest_expenses.length === 0 ? (
                  <EmptyState title="Keine Ausgaben im gewählten Zeitraum" />
                ) : (
                  <ul className="divide-y">
                    {summary.largest_expenses.map((tx) => (
                      <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{tx.description}</p>
                          <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                            <span>{formatDate(tx.date)}</span>
                            {tx.category && <CategoryLabel name={tx.category.name} icon={tx.category.icon} color={tx.category.color} />}
                          </div>
                        </div>
                        <span className="shrink-0 font-medium tabular-nums">{formatCHF(tx.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Monatsübersicht</CardTitle>
                  <CardDescription>Einnahmen, Ausgaben und Netto-Cashflow pro Monat</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {loading || !monthly ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Monat</TableHead>
                          <TableHead className="text-right">Einnahmen</TableHead>
                          <TableHead className="text-right">Ausgaben</TableHead>
                          <TableHead className="text-right">Netto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthly.map((row) => (
                          <TableRow key={row.period}>
                            <TableCell className="capitalize">{formatPeriodLong(row.period)}</TableCell>
                            <TableCell className="text-income text-right tabular-nums">{formatCHF(row.income_cents)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCHF(row.expenses_cents)}</TableCell>
                            <TableCell className={cn("text-right font-medium tabular-nums", row.net_cents < 0 && "text-expense")}>
                              {formatCHF(row.net_cents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
