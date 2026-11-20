import { useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Database, Download, Laptop, Moon, Sparkles, Sun, Tags, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { useRetainedValue } from "@/hooks/use-retained";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatTransactionCount } from "@/lib/format";

const DELETE_CONFIRMATION = "LÖSCHEN";

interface PendingRestore {
  fileName: string;
  payload: unknown;
  categories: number;
  transactions: number;
  exportedAt?: string;
}

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const settings = useApi(() => api.getSettings(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const restoreShown = useRetainedValue(pendingRestore);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const readBackupFile = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text());
      const data = payload?.data;
      if (payload?.format !== "expense-manager-backup" || !Array.isArray(data?.categories) || !Array.isArray(data?.transactions)) {
        toast.error("Die Datei ist kein gültiges Expense-Manager-Backup.");
        return;
      }
      setPendingRestore({
        fileName: file.name,
        payload,
        categories: data.categories.length,
        transactions: data.transactions.length,
        exportedAt: typeof payload.exported_at === "string" ? payload.exported_at : undefined,
      });
    } catch {
      toast.error("Die Datei konnte nicht gelesen werden (ungültiges JSON).");
    }
  };

  const restore = async () => {
    if (!pendingRestore) return;
    try {
      const result = await api.restore(pendingRestore.payload);
      toast.success(`Backup wiederhergestellt: ${formatTransactionCount(result.transactions)}, ${result.categories} Kategorien.`);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const deleteAll = async () => {
    try {
      await api.deleteAllData();
      toast.success("Alle Daten wurden gelöscht. Die Standardkategorien wurden wiederhergestellt.");
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const loadDemo = async () => {
    try {
      const result = await api.loadDemoData();
      toast.success(`${result.created} Demo-Transaktionen wurden erstellt.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader title="Einstellungen" description="Darstellung, Währung und Datenverwaltung." />

      <div className="flex max-w-3xl flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Darstellung & Währung</CardTitle>
              <CardDescription>Das Design wird lokal in diesem Browser gespeichert.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow title="Design" description="Hell, dunkel oder automatisch nach Systemeinstellung.">
              <Tabs value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <TabsList aria-label="Design">
                  <TabsTrigger value="light">
                    <Sun /> Hell
                  </TabsTrigger>
                  <TabsTrigger value="dark">
                    <Moon /> Dunkel
                  </TabsTrigger>
                  <TabsTrigger value="system">
                    <Laptop /> System
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </SettingRow>
            <SettingRow title="Standardwährung" description="Aktuell wird ausschliesslich CHF unterstützt. Es findet keine Umrechnung statt.">
              <Select value={settings.data?.currency ?? "CHF"} disabled>
                <SelectTrigger className="w-40" aria-label="Standardwährung">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(settings.data?.supported_currencies ?? ["CHF"]).map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency} – Schweizer Franken
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="Kategorien" description="Kategorien, Farben und Icons verwalten.">
              <Button variant="outline" asChild>
                <Link to="/kategorien">
                  <Tags /> Kategorien verwalten <ChevronRight />
                </Link>
              </Button>
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Daten</CardTitle>
              <CardDescription>Backups im versionierten JSON-Format exportieren und wiederherstellen.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow title="Alle Daten exportieren" description="Kategorien, Transaktionen und Einstellungen als JSON-Backup.">
              <Button variant="outline" asChild>
                <a href={api.backupUrl} download>
                  <Download /> Backup herunterladen
                </a>
              </Button>
            </SettingRow>
            <SettingRow title="Backup importieren" description="Ersetzt alle vorhandenen Daten durch den Inhalt des Backups.">
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Backup-Datei wählen"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readBackupFile(file);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload /> Backup wählen
              </Button>
            </SettingRow>
            <SettingRow title="Demo-Daten laden" description="Fügt realistische Beispieltransaktionen hinzu – nur bei leerer Datenbank möglich.">
              <Button variant="outline" onClick={loadDemo}>
                <Sparkles /> Demo-Daten laden
              </Button>
            </SettingRow>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <div>
              <CardTitle className="text-destructive">Gefahrenzone</CardTitle>
              <CardDescription>Diese Aktionen können nicht rückgängig gemacht werden.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SettingRow title="Alle Daten löschen" description="Löscht alle Transaktionen und Kategorien und stellt die Standardkategorien wieder her.">
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmText("");
                  setDeleteOpen(true);
                }}
              >
                <Trash2 /> Alle Daten löschen
              </Button>
            </SettingRow>
          </CardContent>
        </Card>

        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Database className="size-3.5" /> Alle Daten werden ausschliesslich lokal in SQLite gespeichert.
        </p>
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        onOpenChange={(open) => !open && setPendingRestore(null)}
        title="Backup wiederherstellen?"
        description={
          restoreShown && (
            <div className="flex flex-col gap-2">
              <p>
                «{restoreShown.fileName}» enthält {formatTransactionCount(restoreShown.transactions)} und {restoreShown.categories} Kategorien
                {restoreShown.exportedAt ? ` (erstellt am ${formatDate(restoreShown.exportedAt.slice(0, 10))})` : ""}.
              </p>
              <p className="text-destructive font-medium">Alle aktuellen Daten werden dabei ersetzt.</p>
            </div>
          )
        }
        confirmLabel="Wiederherstellen"
        onConfirm={restore}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Alle Daten löschen?"
        description="Sämtliche Transaktionen und Kategorien werden unwiderruflich gelöscht. Erstellen Sie vorher ein Backup."
        confirmLabel="Endgültig löschen"
        confirmDisabled={confirmText !== DELETE_CONFIRMATION}
        onConfirm={deleteAll}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-confirm">
            Zur Bestätigung «{DELETE_CONFIRMATION}» eingeben
          </Label>
          <Input id="delete-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </div>
      </ConfirmDialog>
    </>
  );
}
