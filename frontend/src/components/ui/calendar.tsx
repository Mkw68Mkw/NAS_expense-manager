import * as React from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { de } from "react-day-picker/locale";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      locale={de}
      showOutsideDays={showOutsideDays}
      className={cn("p-3 [--cell-size:2.25rem]", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4", defaults.months),
        month: cn("flex w-full flex-col gap-4", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1", defaults.nav),
        button_previous: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0 select-none"),
        button_next: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0 select-none"),
        month_caption: cn("flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)", defaults.month_caption),
        dropdowns: cn("flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium", defaults.dropdowns),
        dropdown_root: cn("relative rounded-md border border-input shadow-xs has-focus:ring-[3px] has-focus:ring-ring/50", defaults.dropdown_root),
        dropdown: cn("absolute inset-0 opacity-0 bg-popover", defaults.dropdown),
        caption_label: cn("flex h-8 items-center gap-1 rounded-md pr-1 pl-2 text-sm font-medium select-none [&>svg]:size-3.5 [&>svg]:text-muted-foreground", defaults.caption_label),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn("text-muted-foreground flex-1 rounded-md text-[0.8rem] font-normal select-none", defaults.weekday),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn("relative aspect-square h-full w-full p-0 text-center select-none", defaults.day),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-(--cell-size) p-0 font-normal aria-selected:opacity-100",
        ),
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        today: "[&>button]:ring-1 [&>button]:ring-primary/50",
        outside: cn("text-muted-foreground opacity-60", defaults.outside),
        disabled: cn("text-muted-foreground opacity-50", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass }) => {
          if (orientation === "left") return <ChevronLeftIcon className={cn("size-4", chevronClass)} />;
          if (orientation === "right") return <ChevronRightIcon className={cn("size-4", chevronClass)} />;
          return <ChevronDownIcon className={cn("size-4", chevronClass)} />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
