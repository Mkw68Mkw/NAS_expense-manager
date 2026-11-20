import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FilterX,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { CategoryLabel } from "@/components/CategoryIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CsvImportDialog } from "@/components/CsvImportDialog";
import { DatePicker } from "@/components/DatePicker";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { TransactionFormDialog } from "@/components/TransactionFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectGroupLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { api, errorMessage } from "@/lib/api";
import { useRetainedValue } from "@/hooks/use-retained";
import { formatCHF, formatDate, formatTransactionCount, parseAmountToCents } from "@/lib/format";
import type { Transaction, TransactionFilters, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100];
const SORTABLE = new Set(["date", "description", "category", "amount"]);

interface FilterState {
  search: string;
  type: TransactionType | "all";
  categoryId: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin: string;
  amountMax: string;
}

const EMPTY_FILTERS: FilterState = { search: "", type: "all", categoryId: "all", amountMin: "", amountMax: "" };

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ArrowUp className="size-3.5" />;
  if (direction === "desc") return <ArrowDown className="size-3.5" />;
  return <ArrowUpDown className="size-3.5 opacity-40" />;
}

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(filters.search);
  const debouncedMin = useDebouncedValue(filters.amountMin);
  const debouncedMax = useDebouncedValue(filters.amountMax);

  const categories = useApi(() => api.listCategories(), []);

  useEffect(() => {
    if (searchParams.get("neu") === "1") {
      setEditing(null);
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const queryFilters: TransactionFilters = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      type: filters.type === "all" ? undefined : filters.type,
      category_id: filters.categoryId === "all" ? undefined : Number(filters.categoryId),
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      amount_min: parseAmountToCents(debouncedMin) ?? undefined,
      amount_max: parseAmountToCents(debouncedMax) ?? undefined,
      sort: (sorting[0]?.id ?? "date") as TransactionFilters["sort"],
      order: sorting[0]?.desc === false ? "asc" : "desc",
    }),
    [debouncedSearch, filters.type, filters.categoryId, filters.dateFrom, filters.dateTo, debouncedMin, debouncedMax, sorting],
  );

  // Any filter or sort change starts again on page 1 with an empty selection.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    setRowSelection({});
  }, [queryFilters]);

  const list = useApi(
    () => api.listTransactions({ ...queryFilters, page: pagination.pageIndex + 1, page_size: pagination.pageSize }),
    [queryFilters, pagination.pageIndex, pagination.pageSize],
  );

  const reload = () => {
    list.reload();
    categories.reload();
  };

  const setFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Alle auf dieser Seite auswählen"
          />
        ),
        cell: ({ row }) => (
          <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Zeile auswählen" />
        ),
      },
      { id: "date", header: "Datum", cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.date)}</span> },
      {
        id: "description",
        header: "Beschreibung",
        cell: ({ row }) => (
          <div className="max-w-72 min-w-40">
            <p className="truncate font-medium">{row.original.description}</p>
            {row.original.notes && <p className="text-muted-foreground truncate text-xs">{row.original.notes}</p>}
          </div>
        ),
      },
      {
        id: "category",
        header: "Kategorie",
        cell: ({ row }) =>
          row.original.category ? (
            <CategoryLabel name={row.original.category.name} icon={row.original.category.icon} color={row.original.category.color} />
          ) : null,
      },
      {
        id: "type",
        header: "Typ",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.type === "income" ? "income" : "expense"}>
            {row.original.type === "income" ? "Einnahme" : "Ausgabe"}
          </Badge>
        ),
      },
      {
        id: "amount",
        header: "Betrag",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className={cn("font-medium tabular-nums", row.original.type === "income" ? "text-income" : "text-foreground")}>
            {row.original.type === "income" ? "+" : "−"} {formatCHF(row.original.amount_cents)}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Aktionen</span>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${row.original.description} bearbeiten`}
              onClick={() => {
                setEditing(row.original);
                setFormOpen(true);
              }}
            >
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`${row.original.description} löschen`} onClick={() => setDeleting(row.original)}>
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const meta = list.data?.meta;
  const table = useReactTable({
    data: list.data?.items ?? [],
    columns,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    pageCount: meta?.total_pages ?? -1,
    state: { sorting, pagination, rowSelection },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]).map(Number);
  const deletingShown = useRetainedValue(deleting);
  const allCategories = categories.data ?? [];

  const deleteOne = async () => {
    if (!deleting) return;
    try {
      await api.deleteTransaction(deleting.id);
      toast.success("Transaktion gelöscht.");
      reload();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const deleteSelected = async () => {
    try {
      const result = await api.bulkDeleteTransactions(selectedIds);
      toast.success(`${formatTransactionCount(result.deleted)} gelöscht.`);
      setRowSelection({});
      reload();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const showSkeleton = list.loading && !list.data;
  const rows = table.getRowModel().rows;

  return (
    <>
      <PageHeader
        title="Transaktionen"
        description="Alle Einnahmen und Ausgaben durchsuchen, filtern und bearbeiten."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload /> CSV-Import
            </Button>
            <Button variant="outline" asChild>
              <a href={api.csvExportUrl(queryFilters)} download>
                <Download /> CSV-Export
              </a>
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus /> Neue Transaktion
            </Button>
          </>
        }
      />

      <Card className="gap-0 py-0">
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              aria-label="Beschreibung durchsuchen"
              placeholder="Beschreibung suchen …"
              className="pl-9"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
            />
          </div>
          <Select value={filters.type} onValueChange={(v) => setFilter("type", v as FilterState["type"])}>
            <SelectTrigger aria-label="Typ filtern">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              <SelectItem value="income">Einnahmen</SelectItem>
              <SelectItem value="expense">Ausgaben</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.categoryId} onValueChange={(v) => setFilter("categoryId", v)}>
            <SelectTrigger aria-label="Kategorie filtern">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {(["expense", "income"] as const).map((type) => (
                <SelectGroup key={type}>
                  <SelectGroupLabel>{type === "expense" ? "Ausgaben" : "Einnahmen"}</SelectGroupLabel>
                  {allCategories
                    .filter((c) => c.type === type)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <CategoryLabel name={c.name} icon={c.icon} color={c.color} />
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <DatePicker aria-label="Von Datum" placeholder="Von" clearable value={filters.dateFrom} onChange={(v) => setFilter("dateFrom", v)} />
          <DatePicker aria-label="Bis Datum" placeholder="Bis" clearable value={filters.dateTo} onChange={(v) => setFilter("dateTo", v)} />
          <Input
            aria-label="Mindestbetrag in CHF"
            placeholder="Betrag von"
            inputMode="decimal"
            value={filters.amountMin}
            onChange={(e) => setFilter("amountMin", e.target.value)}
          />
          <Input
            aria-label="Höchstbetrag in CHF"
            placeholder="Betrag bis"
            inputMode="decimal"
            value={filters.amountMax}
            onChange={(e) => setFilter("amountMax", e.target.value)}
          />
        </div>

        {(selectedIds.length > 0 || hasActiveFilters) && (
          <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm">
            <span className="text-muted-foreground">
              {selectedIds.length > 0 ? `${selectedIds.length} ausgewählt` : `${meta?.total ?? 0} Treffer`}
            </span>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  <FilterX /> Filter zurücksetzen
                </Button>
              )}
              {selectedIds.length > 0 && (
                <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 /> Auswahl löschen
                </Button>
              )}
            </div>
          </div>
        )}

        {list.error && !list.data ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header) => {
                    const sortable = SORTABLE.has(header.column.id);
                    const alignRight = (header.column.columnDef.meta as { align?: string } | undefined)?.align === "right";
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(alignRight && "text-right", header.column.id === "select" && "w-10")}
                        aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            className={cn("hover:text-foreground inline-flex cursor-pointer items-center gap-1 uppercase", alignRight && "flex-row-reverse")}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <SortIcon direction={sorted} />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className={cn(list.loading && list.data && "opacity-60 transition-opacity")}>
              {showSkeleton
                ? Array.from({ length: 8 }, (_, i) => (
                    <TableRow key={i}>
                      {columns.map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full min-w-6" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn((cell.column.columnDef.meta as { align?: string } | undefined)?.align === "right" && "text-right")}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        )}

        {!showSkeleton && !list.error && rows.length === 0 && (
          <EmptyState
            icon={Receipt}
            title={hasActiveFilters ? "Keine passenden Transaktionen" : "Noch keine Transaktionen"}
            description={
              hasActiveFilters
                ? "Passen Sie die Filter an oder setzen Sie sie zurück."
                : "Erfassen Sie Ihre erste Transaktion oder importieren Sie eine CSV-Datei."
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  <FilterX /> Filter zurücksetzen
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus /> Neue Transaktion
                </Button>
              )
            }
          />
        )}

        {meta && meta.total > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row">
            <div className="text-muted-foreground flex items-center gap-2">
              <span>Pro Seite</span>
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(v) => setPagination({ pageIndex: 0, pageSize: Number(v) })}
              >
                <SelectTrigger className="h-8 w-20" aria-label="Einträge pro Seite">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>
                {(meta.page - 1) * meta.page_size + 1}–{Math.min(meta.page * meta.page_size, meta.total)} von {meta.total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <ChevronLeft /> Zurück
              </Button>
              <span className="text-muted-foreground tabular-nums">
                Seite {meta.page} / {Math.max(meta.total_pages, 1)}
              </span>
              <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                Weiter <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <TransactionFormDialog open={formOpen} onOpenChange={setFormOpen} transaction={editing} categories={allCategories} onSaved={reload} />
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={reload} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Transaktion löschen?"
        description={
          deletingShown
            ? `«${deletingShown.description}» vom ${formatDate(deletingShown.date)} über ${formatCHF(deletingShown.amount_cents)} wird endgültig gelöscht.`
            : ""
        }
        confirmLabel="Löschen"
        onConfirm={deleteOne}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`${formatTransactionCount(selectedIds.length)} löschen?`}
        description="Die ausgewählten Transaktionen werden endgültig gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden."
        confirmLabel="Alle löschen"
        onConfirm={deleteSelected}
      />
    </>
  );
}
