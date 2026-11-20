import { useState } from "react";
import { DatePicker } from "@/components/DatePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_PRESETS, presetToPeriod, type PeriodPreset } from "@/lib/period";
import type { Period } from "@/lib/types";

export function usePeriod(initial: Exclude<PeriodPreset, "custom"> = "current_month") {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [period, setPeriod] = useState<Period>(() => presetToPeriod(initial));
  return { preset, setPreset, period, setPeriod };
}

interface PeriodFilterProps {
  preset: PeriodPreset;
  period: Period;
  onPresetChange: (preset: PeriodPreset) => void;
  onPeriodChange: (period: Period) => void;
}

export function PeriodFilter({ preset, period, onPresetChange, onPeriodChange }: PeriodFilterProps) {
  const changePreset = (value: PeriodPreset) => {
    onPresetChange(value);
    if (value !== "custom") onPeriodChange(presetToPeriod(value));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => changePreset(v as PeriodPreset)}>
        <SelectTrigger className="w-44" aria-label="Zeitraum">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <>
          <DatePicker
            aria-label="Startdatum"
            className="w-40"
            value={period.from}
            onChange={(from) => from && onPeriodChange({ from, to: from > period.to ? from : period.to })}
          />
          <span className="text-muted-foreground text-sm">bis</span>
          <DatePicker
            aria-label="Enddatum"
            className="w-40"
            value={period.to}
            onChange={(to) => to && onPeriodChange({ from: to < period.from ? to : period.from, to })}
          />
        </>
      )}
    </div>
  );
}
