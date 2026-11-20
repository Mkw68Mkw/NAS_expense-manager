import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CategoryLabel } from "@/components/CategoryIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRetainedValue } from "@/hooks/use-retained";
import { api, errorMessage } from "@/lib/api";
import { formatTransactionCount } from "@/lib/format";
import type { Category } from "@/lib/types";

interface Props {
  category: Category | null;
  categories: Category[];
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

/** Deleting a category that is in use requires choosing a replacement of the same type. */
export function DeleteCategoryDialog({ category: openCategory, categories, onOpenChange, onDeleted }: Props) {
  const category = useRetainedValue(openCategory);
  const [target, setTarget] = useState("");
  useEffect(() => setTarget(""), [openCategory]);

  const count = category?.transaction_count ?? 0;
  const candidates = categories.filter((c) => category && c.type === category.type && c.id !== category.id);
  const needsTarget = count > 0;

  const confirm = async () => {
    if (!category) return;
    try {
      const result = await api.deleteCategory(category.id, needsTarget ? Number(target) : undefined);
      toast.success(
        result.reassigned > 0
          ? `Kategorie gelöscht, ${formatTransactionCount(result.reassigned)} neu zugeordnet.`
          : "Kategorie gelöscht.",
      );
      onDeleted();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open={openCategory !== null}
      onOpenChange={onOpenChange}
      title={`Kategorie «${category?.name ?? ""}» löschen?`}
      description={
        needsTarget
          ? `Dieser Kategorie ${count === 1 ? "ist" : "sind"} ${formatTransactionCount(count)} zugeordnet. Bitte wählen Sie eine Ersatzkategorie, die stattdessen verwendet wird.`
          : "Die Kategorie wird endgültig gelöscht."
      }
      confirmLabel={needsTarget ? "Neu zuordnen & löschen" : "Löschen"}
      confirmDisabled={needsTarget && !target}
      onConfirm={confirm}
    >
      {needsTarget &&
        (candidates.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="reassign-target">Ersatzkategorie</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="reassign-target">
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <CategoryLabel name={c.name} icon={c.icon} color={c.color} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-destructive text-sm">
            Es gibt keine andere Kategorie dieses Typs. Bitte erstellen Sie zuerst eine Ersatzkategorie.
          </p>
        ))}
    </ConfirmDialog>
  );
}
