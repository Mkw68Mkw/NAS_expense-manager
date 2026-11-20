import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api, errorMessage } from "@/lib/api";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/icons";
import type { Category, CategoryInput, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  defaultType?: TransactionType;
  onSaved: () => void;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function CategoryFormDialog({ open, onOpenChange, category, defaultType = "expense", onSaved }: Props) {
  const [form, setForm] = useState<CategoryInput>({ name: "", type: defaultType, color: CATEGORY_COLORS[0], icon: "shopping-cart", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      category
        ? { name: category.name, type: category.type, color: category.color, icon: category.icon, description: category.description ?? "" }
        : { name: "", type: defaultType, color: CATEGORY_COLORS[0], icon: "shopping-cart", description: "" },
    );
  }, [open, category, defaultType]);

  const update = <K extends keyof CategoryInput>(key: K, value: CategoryInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const typeLocked = !!category && (category.transaction_count ?? 0) > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Bitte einen Namen eingeben.";
    if (!HEX_RE.test(form.color)) nextErrors.color = "Bitte eine gültige HEX-Farbe eingeben (z. B. #22c55e).";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = { ...form, name: form.name.trim(), description: form.description?.trim() || null };
    setSaving(true);
    try {
      if (category) await api.updateCategory(category.id, payload);
      else await api.createCategory(payload);
      toast.success(category ? "Kategorie aktualisiert." : "Kategorie erstellt.");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        setErrors(Object.fromEntries(Object.entries(error.details).map(([k, v]) => [k, String(v)])));
      }
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{category ? "Kategorie bearbeiten" : "Neue Kategorie"}</DialogTitle>
          <DialogDescription>Farbe und Icon werden in Tabellen und Diagrammen verwendet.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="bg-muted/50 flex items-center gap-3 rounded-lg border p-3">
            <CategoryIcon icon={form.icon} color={HEX_RE.test(form.color) ? form.color : "#64748b"} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-medium">{form.name || "Vorschau"}</p>
              <p className="text-muted-foreground text-xs">{form.type === "income" ? "Einnahme" : "Ausgabe"}</p>
            </div>
          </div>

          <Tabs value={form.type} onValueChange={(v) => !typeLocked && update("type", v as TransactionType)}>
            <TabsList className="w-full" aria-label="Kategorietyp">
              <TabsTrigger value="expense" disabled={typeLocked && form.type !== "expense"}>
                Ausgabe
              </TabsTrigger>
              <TabsTrigger value="income" disabled={typeLocked && form.type !== "income"}>
                Einnahme
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {typeLocked && (
            <p className="text-muted-foreground -mt-2 text-xs">Der Typ ist gesperrt, weil bereits Transaktionen zugeordnet sind.</p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" maxLength={60} value={form.name} onChange={(e) => update("name", e.target.value)} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-destructive text-xs">{errors.name}</p>}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Farbe</legend>
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => update("color", color)}
                  className="focus-visible:ring-ring/50 flex size-7 cursor-pointer items-center justify-center rounded-full text-white outline-none focus-visible:ring-[3px]"
                  style={{ backgroundColor: color }}
                  aria-label={`Farbe ${color}`}
                  aria-pressed={form.color.toLowerCase() === color}
                >
                  {form.color.toLowerCase() === color && <Check className="size-4" />}
                </button>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Eigene Farbe wählen"
                  value={HEX_RE.test(form.color) ? form.color : "#000000"}
                  onChange={(e) => update("color", e.target.value)}
                  className="size-8 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <Input
                  aria-label="HEX-Farbwert"
                  className="w-28 font-mono"
                  maxLength={7}
                  value={form.color}
                  onChange={(e) => update("color", e.target.value)}
                  aria-invalid={!!errors.color}
                />
              </div>
            </div>
            {errors.color && <p className="text-destructive text-xs">{errors.color}</p>}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Icon</legend>
            <div className="grid max-h-44 grid-cols-8 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-10">
              {Object.entries(CATEGORY_ICONS).map(([name, Icon]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => update("icon", name)}
                  className={cn(
                    "hover:bg-muted focus-visible:ring-ring/50 flex aspect-square cursor-pointer items-center justify-center rounded-md outline-none focus-visible:ring-[3px]",
                    form.icon === name && "ring-2 ring-offset-1 ring-offset-card",
                  )}
                  style={form.icon === name ? { color: form.color, ["--tw-ring-color" as string]: form.color } : undefined}
                  aria-label={`Icon ${name}`}
                  aria-pressed={form.icon === name}
                  title={name}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
            {errors.icon && <p className="text-destructive mt-1 text-xs">{errors.icon}</p>}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-description">Beschreibung (optional)</Label>
            <Input id="cat-description" maxLength={255} value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {category ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
