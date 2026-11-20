import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CategoryLabel } from "@/components/CategoryIcon";
import { DatePicker } from "@/components/DatePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorMessage } from "@/lib/api";
import { centsToInput, parseAmountToCents, toISODate } from "@/lib/format";
import type { Category, Transaction, TransactionType } from "@/lib/types";

interface FormState {
  date: string;
  description: string;
  amount: string;
  type: TransactionType;
  categoryId: string;
  notes: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

function initialState(transaction: Transaction | null | undefined): FormState {
  if (transaction) {
    return {
      date: transaction.date,
      description: transaction.description,
      amount: centsToInput(transaction.amount_cents),
      type: transaction.type,
      categoryId: String(transaction.category_id),
      notes: transaction.notes ?? "",
    };
  }
  return { date: toISODate(new Date()), description: "", amount: "", type: "expense", categoryId: "", notes: "" };
}

const SERVER_FIELD_MAP: Record<string, keyof FormState> = {
  date: "date",
  description: "description",
  amount_cents: "amount",
  type: "type",
  category_id: "categoryId",
  notes: "notes",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive text-xs">
      {message}
    </p>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  categories: Category[];
  onSaved: () => void;
}

export function TransactionFormDialog({ open, onOpenChange, transaction, categories, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(transaction));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialState(transaction));
      setErrors({});
    }
  }, [open, transaction]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const changeType = (type: TransactionType) => {
    const current = categories.find((c) => String(c.id) === form.categoryId);
    setForm((prev) => ({ ...prev, type, categoryId: current?.type === type ? prev.categoryId : "" }));
  };

  const availableCategories = categories.filter((c) => c.type === form.type);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseAmountToCents(form.amount);
    const nextErrors: FieldErrors = {};
    if (!form.date) nextErrors.date = "Bitte ein Datum wählen.";
    if (!form.description.trim()) nextErrors.description = "Bitte eine Beschreibung eingeben.";
    if (amountCents === null || amountCents <= 0) nextErrors.amount = "Bitte einen positiven Betrag eingeben (z. B. 12.50).";
    if (!form.categoryId) nextErrors.categoryId = "Bitte eine Kategorie wählen.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || amountCents === null) return;

    const payload = {
      date: form.date,
      description: form.description.trim(),
      amount_cents: amountCents,
      type: form.type,
      category_id: Number(form.categoryId),
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    try {
      if (transaction) await api.updateTransaction(transaction.id, payload);
      else await api.createTransaction(payload);
      toast.success(transaction ? "Transaktion aktualisiert." : "Transaktion erfasst.");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        const mapped: FieldErrors = {};
        for (const [field, message] of Object.entries(error.details)) {
          const key = SERVER_FIELD_MAP[field];
          if (key) mapped[key] = String(message);
        }
        setErrors(mapped);
      }
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? "Transaktion bearbeiten" : "Neue Transaktion"}</DialogTitle>
          <DialogDescription>Beträge werden in CHF erfasst und immer positiv eingegeben.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Tabs value={form.type} onValueChange={(v) => changeType(v as TransactionType)}>
            <TabsList className="w-full" aria-label="Transaktionstyp">
              <TabsTrigger value="expense" className="data-[state=active]:text-expense">
                Ausgabe
              </TabsTrigger>
              <TabsTrigger value="income" className="data-[state=active]:text-income">
                Einnahme
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-date">Datum</Label>
              <DatePicker id="tx-date" value={form.date} onChange={(v) => update("date", v ?? "")} aria-invalid={!!errors.date} />
              <FieldError id="tx-date-error" message={errors.date} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-amount">Betrag (CHF)</Label>
              <Input
                id="tx-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? "tx-amount-error" : undefined}
                autoComplete="off"
              />
              <FieldError id="tx-amount-error" message={errors.amount} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-description">Beschreibung</Label>
            <Input
              id="tx-description"
              maxLength={200}
              placeholder="z. B. Migros Einkauf"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "tx-description-error" : undefined}
            />
            <FieldError id="tx-description-error" message={errors.description} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-category">Kategorie</Label>
            <Select value={form.categoryId} onValueChange={(v) => update("categoryId", v)}>
              <SelectTrigger id="tx-category" aria-invalid={!!errors.categoryId}>
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    <CategoryLabel name={category.name} icon={category.icon} color={category.color} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableCategories.length === 0 && (
              <p className="text-muted-foreground text-xs">Für diesen Typ existiert noch keine Kategorie.</p>
            )}
            <FieldError id="tx-category-error" message={errors.categoryId} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-notes">Notizen (optional)</Label>
            <Textarea id="tx-notes" maxLength={2000} rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            <FieldError id="tx-notes-error" message={errors.notes} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {transaction ? "Speichern" : "Erfassen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
