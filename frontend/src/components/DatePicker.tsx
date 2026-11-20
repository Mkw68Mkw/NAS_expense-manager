import { useState } from "react";
import { parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, toISODate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}

/** Date picker showing DD.MM.YYYY and emitting ISO dates (YYYY-MM-DD). */
export function DatePicker({ id, value, onChange, placeholder = "Datum wählen", clearable, className, ...aria }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn("w-full justify-start font-normal", !value && "text-muted-foreground", clearable && value && "pr-8")}
            {...aria}
          >
            <CalendarIcon className="text-muted-foreground" />
            {value ? formatDate(value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(2000, 0)}
            endMonth={new Date(new Date().getFullYear() + 5, 11)}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (date) onChange(toISODate(date));
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-0.5"
          aria-label="Datum entfernen"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
