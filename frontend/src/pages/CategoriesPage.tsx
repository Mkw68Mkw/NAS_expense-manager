import { useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { CategoryFormDialog } from "@/components/CategoryFormDialog";
import { CategoryIcon } from "@/components/CategoryIcon";
import { DeleteCategoryDialog } from "@/components/DeleteCategoryDialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { formatTransactionCount } from "@/lib/format";
import type { Category, TransactionType } from "@/lib/types";

const SECTIONS: { type: TransactionType; title: string; description: string }[] = [
  { type: "expense", title: "Ausgaben", description: "Kategorien für Ausgaben" },
  { type: "income", title: "Einnahmen", description: "Kategorien für Einnahmen" },
];

export function CategoriesPage() {
  const categories = useApi(() => api.listCategories(), []);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [newType, setNewType] = useState<TransactionType>("expense");
  const [deleting, setDeleting] = useState<Category | null>(null);

  const openCreate = (type: TransactionType) => {
    setEditing(null);
    setNewType(type);
    setFormOpen(true);
  };

  const all = categories.data ?? [];

  return (
    <>
      <PageHeader
        title="Kategorien"
        description="Kategorien mit eigenen Farben und Icons verwalten."
        actions={
          <Button onClick={() => openCreate("expense")}>
            <Plus /> Neue Kategorie
          </Button>
        }
      />

      {categories.error && !categories.data ? (
        <Card>
          <ErrorState message={categories.error} onRetry={categories.reload} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {SECTIONS.map((section) => {
            const items = all.filter((c) => c.type === section.type);
            return (
              <Card key={section.type}>
                <CardHeader>
                  <div>
                    <CardTitle>{section.title}</CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openCreate(section.type)}>
                    <Plus /> Hinzufügen
                  </Button>
                </CardHeader>
                <CardContent>
                  {categories.loading && !categories.data ? (
                    <div className="flex flex-col gap-3">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : items.length === 0 ? (
                    <EmptyState icon={Tags} title="Keine Kategorien" description="Erstellen Sie eine Kategorie für diesen Typ." />
                  ) : (
                    <ul className="divide-y">
                      {items.map((category) => (
                        <li key={category.id} className="flex items-center gap-3 py-2.5">
                          <CategoryIcon icon={category.icon} color={category.color} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{category.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {formatTransactionCount(category.transaction_count ?? 0)}
                              {category.description ? ` · ${category.description}` : ""}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${category.name} bearbeiten`}
                            onClick={() => {
                              setEditing(category);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`${category.name} löschen`} onClick={() => setDeleting(category)}>
                            <Trash2 className="text-destructive" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} defaultType={newType} onSaved={categories.reload} />
      <DeleteCategoryDialog
        category={deleting}
        categories={all}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={categories.reload}
      />
    </>
  );
}
