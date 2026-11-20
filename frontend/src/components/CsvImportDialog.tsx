import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { formatCHF, formatDate, formatTransactionCount } from "@/lib/format";
import type { CsvImportResult, CsvImportRow } from "@/lib/types";

function RowStatus({ row }: { row: CsvImportRow }) {
  const errors = Object.values(row.errors);
  if (errors.length > 0) {
    return (
      <div className="flex flex-col gap-0.5 whitespace-normal">
        {errors.map((message) => (
          <span key={message} className="text-destructive flex items-start gap-1 text-xs">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            {message}
          </span>
        ))}
      </div>
    );
  }
  if (row.duplicate) {
    return (
      <Badge variant="secondary">
        <Copy /> Duplikat – wird übersprungen
      </Badge>
    );
  }
  return (
    <Badge variant="income">
      <CheckCircle2 /> OK
    </Badge>
  );
}

export function CsvImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
  };

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const loadPreview = async (selected: File) => {
    setFile(selected);
    setPreview(null);
    setBusy(true);
    try {
      setPreview(await api.importCsv(selected, "preview"));
    } catch (error) {
      toast.error(errorMessage(error));
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await api.importCsv(file, "commit");
      toast.success(`${formatTransactionCount(result.summary.imported)} importiert.`);
      onImported();
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const summary = preview?.summary;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>CSV importieren</DialogTitle>
          <DialogDescription>
            Erwartete Spalten: Datum (TT.MM.JJJJ), Beschreibung, Betrag, Typ (Einnahme/Ausgabe), Kategorie, optional Notizen.
            Trennzeichen Semikolon oder Komma. Kategorien müssen bereits existieren.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="csv-file">CSV-Datei</Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) void loadPreview(selected);
              e.target.value = "";
            }}
          />
          {file && <p className="text-muted-foreground text-xs">Ausgewählt: {file.name}</p>}
        </div>

        {busy && !preview && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Datei wird geprüft …
          </div>
        )}

        {preview && summary && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">{summary.total} Zeilen</Badge>
              <Badge variant="income">{summary.valid} gültig</Badge>
              {summary.invalid > 0 && <Badge variant="destructive">{summary.invalid} fehlerhaft</Badge>}
              {summary.duplicates > 0 && <Badge variant="secondary">{summary.duplicates} Duplikate</Badge>}
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow>
                    <TableHead>Zeile</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.line} className={Object.keys(row.errors).length ? "bg-destructive/5" : undefined}>
                      <TableCell className="text-muted-foreground">{row.line}</TableCell>
                      <TableCell>{row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? formatDate(row.date) : row.date}</TableCell>
                      <TableCell className="max-w-56 truncate">{row.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.amount_cents !== null ? formatCHF(row.amount_cents) : "–"}</TableCell>
                      <TableCell>{row.type === "income" ? "Einnahme" : row.type === "expense" ? "Ausgabe" : "–"}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>
                        <RowStatus row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={commit} disabled={busy || !summary || summary.valid === 0}>
            {busy && preview ? <Loader2 className="animate-spin" /> : <FileUp />}
            {summary ? `${formatTransactionCount(summary.valid)} importieren` : "Importieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
